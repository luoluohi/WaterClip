import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as alphaTab from '@coderline/alphatab';
import type { ScorePart } from '../domain';

export interface ScoreSelection {
  partIds: string[];
  startMeasure: number;
  endMeasure: number;
}

export interface PlaybackPosition {
  currentTime: number;
  endTime: number;
  currentTick: number;
  endTick: number;
  measure: number;
  occurrence: number;
}

export interface ScoreCanvasHandle {
  playPause(): void;
  stop(): void;
  seekRatio(ratio: number): void;
  setTrackMute(trackIndex: number, mute: boolean): void;
  setTrackSolo(trackIndex: number, solo: boolean): void;
  setZoom(zoom: number): void;
}

interface ScoreCanvasProps {
  data?: Uint8Array;
  customSoundFont?: Uint8Array;
  onParts(parts: ScorePart[]): void;
  onSelection(selection: ScoreSelection): void;
  onPosition(position: PlaybackPosition): void;
  onPlayingChange(playing: boolean): void;
  onError(message: string): void;
}

interface Point { x: number; y: number }

function intersects(rect: { x: number; y: number; w: number; h: number }, target: { x: number; y: number; w: number; h: number }) {
  return rect.x <= target.x + target.w && rect.x + rect.w >= target.x && rect.y <= target.y + target.h && rect.y + rect.h >= target.y;
}

export const ScoreCanvas = forwardRef<ScoreCanvasHandle, ScoreCanvasProps>(function ScoreCanvas(
  { data, customSoundFont, onParts, onSelection, onPosition, onPlayingChange, onError },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const seekingRef = useRef(false);
  const selectionElRef = useRef<HTMLDivElement>(null);
  const currentPositionRef = useRef<PlaybackPosition | null>(null);
  const allTracksRenderedRef = useRef(false);
  const callbacksRef = useRef({ onParts, onSelection, onPosition, onPlayingChange, onError });
  callbacksRef.current = { onParts, onSelection, onPosition, onPlayingChange, onError };

  useImperativeHandle(ref, () => ({
    playPause: () => apiRef.current?.playPause(),
    stop: () => apiRef.current?.stop(),
    seekRatio: (ratio) => {
      const pos = currentPositionRef.current;
      if (apiRef.current && pos) apiRef.current.tickPosition = Math.max(0, Math.min(pos.endTick, pos.endTick * ratio));
    },
    setTrackMute: (index, mute) => {
      const track = apiRef.current?.score?.tracks[index];
      if (track) apiRef.current?.changeTrackMute([track], mute);
    },
    setTrackSolo: (index, solo) => {
      const track = apiRef.current?.score?.tracks[index];
      if (track) apiRef.current?.changeTrackSolo([track], solo);
    },
    setZoom: (zoom) => {
      const api = apiRef.current;
      if (!api) return;
      api.settings.display.scale = zoom;
      api.updateSettings();
      api.render();
    }
  }), []);

  useEffect(() => {
    if (!hostRef.current || !viewportRef.current) return;
    const api = new alphaTab.AlphaTabApi(hostRef.current, {
      core: { engine: 'svg', enableLazyLoading: false, fontDirectory: '/font/' },
      display: {
        staveProfile: 'score',
        scale: 0.82,
        layoutMode: 'page',
        resources: { mainGlyphColor: '#222a2d', secondaryGlyphColor: '#546066', staffLineColor: '#687276' }
      },
      notation: { rhythmMode: 'showwithbars' },
      player: {
        enablePlayer: true,
        soundFont: '/soundfont/sonivox.sf2',
        scrollElement: viewportRef.current,
        scrollMode: 'continuous'
      }
    });
    apiRef.current = api;
    hostRef.current.dataset.alphaTabState = 'initialized';

    api.scoreLoaded.on((score) => {
      if (hostRef.current) hostRef.current.dataset.alphaTabState = 'score-loaded';
      const parts = score.tracks.map((track) => ({
        id: `track-${track.index}`,
        name: track.name || track.shortName || `声部 ${track.index + 1}`,
        staffIds: track.staves.map((staff) => `track-${track.index}-staff-${staff.index}`),
        playbackTrackIds: [track.index]
      }));
      callbacksRef.current.onParts(parts);
      if (!allTracksRenderedRef.current) {
        allTracksRenderedRef.current = true;
        window.setTimeout(() => api.renderTracks(score.tracks), 0);
      }
    });
    api.renderStarted.on(() => { if (hostRef.current) hostRef.current.dataset.alphaTabState = 'rendering'; });
    api.renderFinished.on(() => { if (hostRef.current) hostRef.current.dataset.alphaTabState = 'rendered'; });
    const updatePlaybackPosition = (args: alphaTab.synth.PositionChangedEventArgs) => {
      const trackIds = new Set(api.score?.tracks.map((track) => track.index) ?? []);
      const found = api.tickCache?.findBeat(trackIds, args.currentTick);
      const measure = (found?.masterBar.masterBar.index ?? 0) + 1;
      const sameMeasureBars = api.tickCache?.masterBars.filter((item) => item.masterBar.index === measure - 1) ?? [];
      const occurrence = Math.max(1, sameMeasureBars.findIndex((item) => item === found?.masterBar) + 1);
      const position = { ...args, measure, occurrence };
      currentPositionRef.current = position;
      callbacksRef.current.onPosition(position);
    };
    api.playerPositionChanged.on(updatePlaybackPosition);
    api.midiLoaded.on(updatePlaybackPosition);
    api.playerStateChanged.on((args) => callbacksRef.current.onPlayingChange(args.state === alphaTab.synth.PlayerState.Playing));
    api.error.on((error) => {
      if (hostRef.current) hostRef.current.dataset.alphaTabState = 'error';
      callbacksRef.current.onError(error.message || '乐谱载入失败');
    });
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (data && apiRef.current) {
      allTracksRenderedRef.current = false;
      apiRef.current.load(data);
    }
  }, [data]);

  useEffect(() => {
    if (customSoundFont && apiRef.current) apiRef.current.loadSoundFont(customSoundFont, false);
  }, [customSoundFont]);

  const pointFromEvent = (event: React.PointerEvent): Point => {
    const viewport = viewportRef.current!;
    const host = hostRef.current!;
    const bounds = host.getBoundingClientRect();
    return { x: event.clientX - bounds.left + viewport.scrollLeft, y: event.clientY - bounds.top + viewport.scrollTop };
  };

  const updateSelectionVisual = (start: Point, end: Point) => {
    const el = selectionElRef.current;
    if (!el) return;
    el.hidden = false;
    el.style.left = `${Math.min(start.x, end.x)}px`;
    el.style.top = `${Math.min(start.y, end.y)}px`;
    el.style.width = `${Math.abs(start.x - end.x)}px`;
    el.style.height = `${Math.abs(start.y - end.y)}px`;
  };

  const finishSelection = (end: Point) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start || !apiRef.current?.boundsLookup) return;
    const rect = {
      x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      w: Math.abs(start.x - end.x), h: Math.abs(start.y - end.y)
    };
    const partIds = new Set<string>();
    const measures = new Set<number>();
    for (const system of apiRef.current.boundsLookup.staffSystems) {
      for (const masterBar of system.bars) {
        for (const bar of masterBar.bars) {
          if (intersects(rect, bar.realBounds)) {
            partIds.add(`track-${bar.bar.staff.track.index}`);
            measures.add(masterBar.index + 1);
          }
        }
      }
    }
    if (partIds.size && measures.size) {
      const values = [...measures];
      callbacksRef.current.onSelection({ partIds: [...partIds], startMeasure: Math.min(...values), endMeasure: Math.max(...values) });
    }
  };

  const seekAtPoint = (point: Point) => {
    const api = apiRef.current;
    if (!api?.boundsLookup) return;
    let nearest: { distance: number; tick: number } | undefined;
    for (const system of api.boundsLookup.staffSystems) {
      for (const masterBar of system.bars) {
        for (const bar of masterBar.bars) {
          for (const beat of bar.beats) {
            const verticalDistance = point.y < beat.realBounds.y
              ? beat.realBounds.y - point.y
              : point.y > beat.realBounds.y + beat.realBounds.h
                ? point.y - (beat.realBounds.y + beat.realBounds.h)
                : 0;
            const distance = Math.abs(point.x - beat.onNotesX) + verticalDistance * 3;
            if (!nearest || distance < nearest.distance) nearest = { distance, tick: beat.beat.absolutePlaybackStart };
          }
        }
      }
    }
    if (nearest) api.tickPosition = nearest.tick;
  };

  return (
    <div className="score-viewport" ref={viewportRef}>
      <div
        className="score-surface"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const point = pointFromEvent(event);
          if ((event.target as Element).closest('.at-cursor-beat')) {
            seekingRef.current = true;
            seekAtPoint(point);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          dragStartRef.current = point;
          updateSelectionVisual(point, point);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (seekingRef.current) {
            seekAtPoint(pointFromEvent(event));
            return;
          }
          if (!dragStartRef.current) return;
          updateSelectionVisual(dragStartRef.current, pointFromEvent(event));
        }}
        onPointerUp={(event) => {
          if (seekingRef.current) {
            seekingRef.current = false;
            seekAtPoint(pointFromEvent(event));
            return;
          }
          finishSelection(pointFromEvent(event));
        }}
      >
        <div className="score-selection" ref={selectionElRef} hidden />
        <div className="alphatab-host" ref={hostRef} />
      </div>
    </div>
  );
});
