import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import * as alphaTab from '@coderline/alphatab';
import type { ScorePart } from '../domain';
import { autoScrollDelta, intersects, isMeaningfulDrag, normalizeDragRect, panScrollTarget, pointRelativeToHost, pointerGesture, wheelScrollDelta, type Point } from './interaction';
import type { PlayedNoteEvent, TrackLevelBus } from './trackLevels';
import { findFirstOverlappingMeasure, normalizeHorizontalBarWidths, type MeasureBounds } from './horizontalLayout';
import { buildSectionMarkers, pageTurnTarget, playbackRequestAction, seekRevealTarget, type ScoreSectionMarker } from './navigation';
import { mergeSelection, rangesHaveCell, selectionHasCell, type ScoreCellRange, type ScoreSelectionCell, type SemanticScoreSelection } from './selection';
import { detectScoreRenderCapabilities, resolveScoreRenderStrategy, scoreRenderClassName } from './renderPerformance';

export type ScoreSelection = SemanticScoreSelection;
export type { ScoreSelectionCell } from './selection';

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
  seekMeasure(measure: number): void;
  setTrackMute(trackIndex: number, mute: boolean): void;
  setTrackSolo(trackIndex: number, solo: boolean): void;
  setZoom(zoom: number): void;
}

interface ScoreCanvasProps {
  data?: Uint8Array;
  customSoundFont?: Uint8Array;
  selection?: ScoreSelection;
  activeShotCells?: readonly ScoreCellRange[];
  hardwareAcceleration: boolean;
  autoPageTurn: boolean;
  followPlayback: boolean;
  mutedTracks: ReadonlySet<number>;
  soloTracks: ReadonlySet<number>;
  onToggleTrack(index: number, mode: 'mute' | 'solo'): void;
  levelBus: TrackLevelBus;
  onParts(parts: ScorePart[]): void;
  onSelection(selection?: ScoreSelection): void;
  onPosition(position: PlaybackPosition): void;
  onPlayingChange(playing: boolean): void;
  onSections(sections: ScoreSectionMarker[]): void;
  onError(message: string): void;
}

interface ScoreRowTag { id: string; index: number; name: string; top: number }
interface ScoreMeasureTag { index: number; x: number; top: number }
interface SelectionHighlight { id: string; x: number; y: number; w: number; h: number }

export const ScoreCanvas = forwardRef<ScoreCanvasHandle, ScoreCanvasProps>(function ScoreCanvas(
  { data, customSoundFont, selection, activeShotCells = [], hardwareAcceleration, autoPageTurn, followPlayback, mutedTracks, soloTracks, onToggleTrack, levelBus, onParts, onSelection, onPosition, onPlayingChange, onSections, onError },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const dragToggleRef = useRef(false);
  const lastPointerClientRef = useRef<Point | null>(null);
  const autoScrollFrameRef = useRef<number | undefined>(undefined);
  const seekingRef = useRef(false);
  const panStartRef = useRef<{ pointer: Point; scroll: Point } | null>(null);
  const selectionElRef = useRef<HTMLDivElement>(null);
  const measureTagsElRef = useRef<HTMLDivElement>(null);
  const currentPositionRef = useRef<PlaybackPosition | null>(null);
  const pendingPlayRef = useRef(false);
  const playbackTimeoutRef = useRef<number | undefined>(undefined);
  const measureBoundsRef = useRef(new Map<number, { x: number; width: number }>());
  const barRectsRef = useRef<Array<SelectionHighlight & { measure: number; partId: string }>>([]);
  const lastPositionPublishRef = useRef(0);
  const lastMeasureRef = useRef(1);
  const autoPageTurnRef = useRef(autoPageTurn);
  autoPageTurnRef.current = autoPageTurn;
  const followPlaybackRef = useRef(followPlayback);
  followPlaybackRef.current = followPlayback;
  const [rowTags, setRowTags] = useState<ScoreRowTag[]>([]);
  const [measureTags, setMeasureTags] = useState<ScoreMeasureTag[]>([]);
  const [selectionHighlights, setSelectionHighlights] = useState<SelectionHighlight[]>([]);
  const [activeShotHighlights, setActiveShotHighlights] = useState<SelectionHighlight[]>([]);
  const [currentMeasure, setCurrentMeasure] = useState(1);
  const callbacksRef = useRef({ onParts, onSelection, onPosition, onPlayingChange, onSections, onError });
  callbacksRef.current = { onParts, onSelection, onPosition, onPlayingChange, onSections, onError };

  const revealMeasure = (measure: number, mode: 'seek' | 'page-turn') => {
    const viewport = viewportRef.current;
    const host = hostRef.current;
    const bounds = measureBoundsRef.current.get(measure);
    if (!viewport || !host || !bounds) return;
    const left = bounds.x + host.offsetLeft;
    if (mode === 'page-turn') {
      const target = pageTurnTarget(measureBoundsRef.current, measure, Math.max(0, viewport.scrollLeft - host.offsetLeft), viewport.clientWidth);
      if (target !== undefined) viewport.scrollTo({ left: target + host.offsetLeft, behavior: 'auto' });
      return;
    }
    const target = seekRevealTarget({ x: left, width: bounds.width }, viewport.scrollLeft, viewport.clientWidth);
    if (target !== undefined) viewport.scrollTo({ left: target, behavior: 'auto' });
  };

  const seekMeasure = (measure: number) => {
    const api = apiRef.current;
    const occurrence = api?.tickCache?.masterBars.find((item) => item.masterBar.index === measure - 1);
    if (api && occurrence) {
      api.tickPosition = occurrence.start;
      revealMeasure(measure, 'seek');
      if (hostRef.current) hostRef.current.dataset.lastSeekMeasure = String(measure);
    }
  };

  useImperativeHandle(ref, () => ({
    playPause: () => {
      const api = apiRef.current;
      if (!api) return;
      const isPlaying = api.playerState === alphaTab.synth.PlayerState.Playing;
      const action = playbackRequestAction(api.isReadyForPlayback, isPlaying);
      if (action === 'pause') {
        pendingPlayRef.current = false;
        api.pause();
      } else if (action === 'play') {
        api.play();
      } else {
        pendingPlayRef.current = true;
        if (hostRef.current?.dataset.playerState === 'unsupported') {
          callbacksRef.current.onError('播放器后端未能启动。请先 Ctrl+F5 刷新；若仍失败，请确认浏览器允许 Web Audio 与 Worker');
        } else {
          if (hostRef.current) hostRef.current.dataset.playerState = 'queued';
          callbacksRef.current.onError('音源正在载入，准备完成后将自动播放…');
          api.loadMidiForScore();
          window.clearTimeout(playbackTimeoutRef.current);
          playbackTimeoutRef.current = window.setTimeout(() => {
            if (!api.isReadyForPlayback && pendingPlayRef.current) {
              pendingPlayRef.current = false;
              if (hostRef.current) hostRef.current.dataset.playerState = 'failed';
              callbacksRef.current.onError('播放器初始化超时。请确认使用最新版 Chrome/Edge，并重新载入乐谱');
            }
          }, 15000);
        }
      }
    },
    stop: () => {
      pendingPlayRef.current = false;
      apiRef.current?.stop();
    },
    seekRatio: (ratio) => {
      const pos = currentPositionRef.current;
      const api = apiRef.current;
      if (api && pos) {
        const tick = Math.max(0, Math.min(pos.endTick, pos.endTick * ratio));
        api.tickPosition = tick;
        const tracks = new Set(api.score?.tracks.map((track) => track.index) ?? []);
        const found = api.tickCache?.findBeat(tracks, tick);
        if (found) revealMeasure(found.masterBar.masterBar.index + 1, 'seek');
      }
    },
    seekMeasure,
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
      callbacksRef.current.onSelection(undefined);
      api.settings.display.scale = zoom;
      api.updateSettings();
      api.render();
    }
  }), []);

  useEffect(() => {
    if (!hostRef.current || !viewportRef.current) return;
    const renderStrategy = resolveScoreRenderStrategy(hardwareAcceleration, detectScoreRenderCapabilities());
    const api = new alphaTab.AlphaTabApi(hostRef.current, {
      core: { engine: renderStrategy.engine, enableLazyLoading: false, fontDirectory: '/font/', useWorkers: renderStrategy.useWorkers },
      display: {
        staveProfile: 'score',
        scale: 0.82,
        layoutMode: 'horizontal',
        resources: { mainGlyphColor: '#222a2d', secondaryGlyphColor: '#546066', staffLineColor: '#687276' }
      },
      notation: { rhythmMode: 'showwithbars' },
      player: {
        enablePlayer: true,
        soundFont: '/soundfont/sonivox.sf2',
        scrollElement: viewportRef.current,
        scrollMode: 'off'
      }
    });
    apiRef.current = api;
    hostRef.current.dataset.playerState = 'loading';
    hostRef.current.dataset.soundFontState = 'loading';
    hostRef.current.dataset.midiState = 'loading';
    api.midiEventsPlayedFilter = [alphaTab.midi.MidiEventType.NoteOn, alphaTab.midi.MidiEventType.NoteOff];
    api.midiEventsPlayed.on((args) => levelBus.ingest(args.events as unknown as PlayedNoteEvent[]));
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
      const authoredSections = score.masterBars.flatMap((bar) => bar.isSectionStart ? [bar.index + 1] : []);
      callbacksRef.current.onSections(buildSectionMarkers(score.masterBars.length, authoredSections));
      const supportsPlayer = typeof window.Worker === 'function' && ('AudioWorkletNode' in window || 'ScriptProcessorNode' in window);
      if (!supportsPlayer && hostRef.current) {
        hostRef.current.dataset.playerState = 'unsupported';
      }
      window.setTimeout(() => {
        if (!api.player && hostRef.current) hostRef.current.dataset.playerState = 'unsupported';
      }, 0);
    });
    api.renderStarted.on(() => { if (hostRef.current) hostRef.current.dataset.alphaTabState = 'rendering'; });
    const rebuildRowTags = () => {
      const lookup = api.boundsLookup;
      const host = hostRef.current;
      if (!lookup || !host || !api.score) return;
      const tops = new Map<number, number>();
      const measures = new Map<number, MeasureBounds>();
      const measureTagValues: ScoreMeasureTag[] = [];
      const barRects: Array<SelectionHighlight & { measure: number; partId: string }> = [];
      let barRectIndex = 0;
      for (const system of lookup.staffSystems) {
        for (const masterBar of system.bars) {
          if (!measures.has(masterBar.index)) {
            measures.set(masterBar.index, { index: masterBar.index, x: masterBar.realBounds.x, width: masterBar.realBounds.w });
            measureTagValues.push({ index: masterBar.index + 1, x: masterBar.realBounds.x + host.offsetLeft + 5, top: 7 });
          }
          for (const bar of masterBar.bars) {
            const trackIndex = bar.bar.staff.track.index;
            const top = bar.realBounds.y + host.offsetTop + 2;
            tops.set(trackIndex, Math.min(tops.get(trackIndex) ?? Number.POSITIVE_INFINITY, top));
            barRects.push({
              id: `${masterBar.index}-${trackIndex}-${bar.bar.staff.index}-${barRectIndex++}`,
              measure: masterBar.index + 1,
              partId: `track-${trackIndex}`,
              x: bar.realBounds.x + host.offsetLeft,
              y: bar.realBounds.y + host.offsetTop,
              w: bar.realBounds.w,
              h: bar.realBounds.h
            });
          }
        }
      }
      const overlap = findFirstOverlappingMeasure([...measures.values()]);
      host.dataset.measureFlow = overlap ? 'overlap' : 'sequential';
      if (overlap) {
        host.dataset.measureOverlap = JSON.stringify(overlap);
        callbacksRef.current.onError('横向小节布局发生重叠，请重新载入乐谱');
      } else {
        delete host.dataset.measureOverlap;
      }
      setRowTags(api.score.tracks.flatMap((track) => {
        const top = tops.get(track.index);
        return top === undefined ? [] : [{ id: `track-${track.index}`, index: track.index, name: track.name || track.shortName || `声部 ${track.index + 1}`, top }];
      }));
      measureBoundsRef.current = new Map([...measures.values()].map((item) => [item.index + 1, { x: item.x, width: item.width }]));
      barRectsRef.current = barRects;
      setMeasureTags(measureTagValues);
    };
    api.renderFinished.on(() => {
      if (hostRef.current) hostRef.current.dataset.alphaTabState = 'rendered';
      window.requestAnimationFrame(rebuildRowTags);
    });
    const updatePlaybackPosition = (args: alphaTab.synth.PositionChangedEventArgs) => {
      const trackIds = new Set(api.score?.tracks.map((track) => track.index) ?? []);
      const found = api.tickCache?.findBeat(trackIds, args.currentTick);
      const measure = (found?.masterBar.masterBar.index ?? 0) + 1;
      const sameMeasureBars = api.tickCache?.masterBars.filter((item) => item.masterBar.index === measure - 1) ?? [];
      const occurrence = Math.max(1, sameMeasureBars.findIndex((item) => item === found?.masterBar) + 1);
      const position = { ...args, measure, occurrence };
      currentPositionRef.current = position;
      if (lastMeasureRef.current !== measure) {
        lastMeasureRef.current = measure;
        setCurrentMeasure(measure);
        if (autoPageTurnRef.current) revealMeasure(measure, 'page-turn');
        else if (followPlaybackRef.current) revealMeasure(measure, 'seek');
      }
      const now = performance.now();
      if (now - lastPositionPublishRef.current >= 100 || args.currentTick === 0 || args.currentTick === args.endTick) {
        lastPositionPublishRef.current = now;
        callbacksRef.current.onPosition(position);
      }
    };
    api.playerPositionChanged.on(updatePlaybackPosition);
    api.midiLoaded.on((args) => {
      if (hostRef.current) hostRef.current.dataset.midiState = 'loaded';
      updatePlaybackPosition(args);
    });
    api.soundFontLoaded.on(() => {
      if (hostRef.current) hostRef.current.dataset.soundFontState = 'loaded';
    });
    api.playerReady.on(() => {
      window.clearTimeout(playbackTimeoutRef.current);
      if (hostRef.current) hostRef.current.dataset.playerState = 'ready';
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        api.play();
      }
    });
    api.playerStateChanged.on((args) => {
      const playing = args.state === alphaTab.synth.PlayerState.Playing;
      if (!playing) levelBus.releaseAll();
      callbacksRef.current.onPlayingChange(playing);
    });
    api.error.on((error) => {
      if (hostRef.current) hostRef.current.dataset.alphaTabState = 'error';
      callbacksRef.current.onError(error.message || '乐谱载入失败');
    });
    return () => {
      stopAutoScroll();
      api.destroy();
      levelBus.releaseAll();
      pendingPlayRef.current = false;
      window.clearTimeout(playbackTimeoutRef.current);
      apiRef.current = null;
    };
  }, [hardwareAcceleration, levelBus]);

  useEffect(() => {
    if (data && apiRef.current) {
      setRowTags([]);
      setMeasureTags([]);
      setSelectionHighlights([]);
      levelBus.reset();
      try {
        // Parse once so horizontal widths can be normalized before alphaTab lays
        // out any SVG, then render all tracks in one pass. A follow-up
        // renderTracks call would race the initial partial-render batch.
        const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, apiRef.current.settings);
        normalizeHorizontalBarWidths(score);
        apiRef.current.renderScore(score, [-1]);
      } catch (error) {
        callbacksRef.current.onError(error instanceof Error ? error.message : '乐谱载入失败');
      }
    }
  }, [data, hardwareAcceleration, levelBus]);

  useEffect(() => {
    if (customSoundFont && apiRef.current) apiRef.current.loadSoundFont(customSoundFont, false);
  }, [customSoundFont]);

  useEffect(() => {
    if (!selection) {
      setSelectionHighlights([]);
      return;
    }
    setSelectionHighlights(barRectsRef.current
      .filter((rect) => selectionHasCell(selection, rect.partId, rect.measure))
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
  }, [selection, measureTags]);

  useEffect(() => {
    setActiveShotHighlights(barRectsRef.current
      .filter((rect) => rangesHaveCell(activeShotCells, rect.partId, rect.measure))
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
  }, [activeShotCells, measureTags]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const tags = measureTagsElRef.current;
    if (!viewport || !tags) return;
    let frame: number | undefined;
    const sync = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        tags.style.transform = `translate3d(0, ${viewport.scrollTop}px, 0)`;
      });
    };
    viewport.addEventListener('scroll', sync, { passive: true });
    sync();
    return () => {
      viewport.removeEventListener('scroll', sync);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'd') return;
      event.preventDefault();
      callbacksRef.current.onSelection(undefined);
    };
    window.addEventListener('keydown', clearSelection, true);
    return () => window.removeEventListener('keydown', clearSelection, true);
  }, []);

  const pointFromEvent = (event: React.PointerEvent): Point => {
    const host = hostRef.current!;
    return pointRelativeToHost(event.clientX, event.clientY, host.getBoundingClientRect());
  };

  const updateSelectionVisual = (start: Point, end: Point) => {
    const el = selectionElRef.current;
    if (!el) return;
    el.hidden = false;
    const rect = normalizeDragRect(start, end);
    const host = hostRef.current;
    el.style.left = `${rect.x + (host?.offsetLeft ?? 0)}px`;
    el.style.top = `${rect.y + (host?.offsetTop ?? 0)}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
  };

  const finishSelection = (end: Point) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (selectionElRef.current) selectionElRef.current.hidden = true;
    if (!start || !apiRef.current?.boundsLookup) return;
    const rect = normalizeDragRect(start, end);
    if (!isMeaningfulDrag(rect)) return;
    const cells = new Map<string, ScoreSelectionCell>();
    for (const system of apiRef.current.boundsLookup.staffSystems) {
      for (const masterBar of system.bars) {
        for (const bar of masterBar.bars) {
          if (intersects(rect, bar.realBounds)) {
            const cell = { partId: `track-${bar.bar.staff.track.index}`, measure: masterBar.index + 1 };
            cells.set(`${cell.partId}\u0000${cell.measure}`, cell);
          }
        }
      }
    }
    if (cells.size) callbacksRef.current.onSelection(mergeSelection(selection, cells.values(), dragToggleRef.current));
  };

  const stopAutoScroll = () => {
    lastPointerClientRef.current = null;
    if (autoScrollFrameRef.current !== undefined) window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = undefined;
  };

  const runAutoScroll = () => {
    if (autoScrollFrameRef.current !== undefined) return;
    const step = () => {
      autoScrollFrameRef.current = undefined;
      const viewport = viewportRef.current;
      const client = lastPointerClientRef.current;
      const start = dragStartRef.current;
      if (!viewport || !client || !start) return;
      const delta = autoScrollDelta(client, viewport.getBoundingClientRect());
      if (delta.x || delta.y) {
        viewport.scrollBy(delta.x, delta.y);
        updateSelectionVisual(start, pointFromClient(client));
        autoScrollFrameRef.current = window.requestAnimationFrame(step);
      }
    };
    autoScrollFrameRef.current = window.requestAnimationFrame(step);
  };

  const pointFromClient = (client: Point): Point => {
    const host = hostRef.current!;
    return pointRelativeToHost(client.x, client.y, host.getBoundingClientRect());
  };

  const cancelInteraction = () => {
    stopAutoScroll();
    dragStartRef.current = null;
    seekingRef.current = false;
    panStartRef.current = null;
    if (selectionElRef.current) selectionElRef.current.hidden = true;
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      const delta = wheelScrollDelta(event.deltaX, event.deltaY, true);
      viewport.scrollBy({ left: delta.x, top: delta.y, behavior: 'auto' });
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

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

  const seekMeasureAtPoint = (point: Point) => {
    const lookup = apiRef.current?.boundsLookup;
    if (!lookup) return;
    for (const system of lookup.staffSystems) {
      for (const masterBar of system.bars) {
        if (intersects({ x: point.x, y: point.y, w: 0, h: 0 }, masterBar.realBounds)) {
          seekMeasure(masterBar.index + 1);
          return;
        }
      }
    }
  };

  return (
    <div className={`score-viewport ${scoreRenderClassName(resolveScoreRenderStrategy(hardwareAcceleration, detectScoreRenderCapabilities()))}`} ref={viewportRef} tabIndex={0} aria-label="横向乐谱工作区">
      <div
        className="score-surface"
        onPointerDown={(event) => {
          if (event.button === 1) {
            const viewport = viewportRef.current;
            if (!viewport) return;
            event.preventDefault();
            panStartRef.current = { pointer: { x: event.clientX, y: event.clientY }, scroll: { x: viewport.scrollLeft, y: viewport.scrollTop } };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (event.button !== 0) return;
          if ((event.target as Element).closest('button, input, select, textarea')) return;
          const point = pointFromEvent(event);
          if ((event.target as Element).closest('.at-cursor-beat')) {
            seekingRef.current = true;
            seekAtPoint(point);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          dragStartRef.current = point;
          dragToggleRef.current = event.ctrlKey;
          lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (panStartRef.current && viewportRef.current) {
            const target = panScrollTarget(panStartRef.current.pointer, { x: event.clientX, y: event.clientY }, panStartRef.current.scroll);
            viewportRef.current.scrollTo({ left: target.x, top: target.y, behavior: 'auto' });
            return;
          }
          if (seekingRef.current) {
            seekAtPoint(pointFromEvent(event));
            return;
          }
          if (!dragStartRef.current) return;
          lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
          runAutoScroll();
          const point = pointFromEvent(event);
          if (pointerGesture(dragStartRef.current, point) === 'drag') updateSelectionVisual(dragStartRef.current, point);
        }}
        onPointerUp={(event) => {
          if (panStartRef.current) {
            panStartRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            return;
          }
          stopAutoScroll();
          if (seekingRef.current) {
            seekingRef.current = false;
            seekAtPoint(pointFromEvent(event));
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            return;
          }
          const point = pointFromEvent(event);
          const start = dragStartRef.current;
          if (start && pointerGesture(start, point) === 'click') {
            dragStartRef.current = null;
            if (selectionElRef.current) selectionElRef.current.hidden = true;
            seekMeasureAtPoint(point);
          } else {
            finishSelection(point);
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancelInteraction}
        onLostPointerCapture={() => {
          if (dragStartRef.current || seekingRef.current || panStartRef.current) cancelInteraction();
        }}
      >
        <div className="score-measure-seal" aria-label={`当前第 ${currentMeasure} 小节`}><small>M</small><strong>{currentMeasure}</strong></div>
        <div className="score-measure-tags" ref={measureTagsElRef} aria-hidden="true">
          {measureTags.map((tag) => <span key={tag.index} className={`score-measure-tag ${tag.index === currentMeasure ? 'is-playing' : ''} ${selection?.partIds.some((partId) => selectionHasCell(selection, partId, tag.index)) ? 'is-selected' : ''}`} style={{ left: tag.x, top: tag.top }}>{tag.index}</span>)}
        </div>
        <div className="score-selection-highlights" aria-hidden="true">
          {selectionHighlights.map((rect) => <i key={rect.id} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />)}
        </div>
        <div className="score-active-shot-highlights" aria-hidden="true">
          {activeShotHighlights.map((rect) => <i key={rect.id} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />)}
        </div>
        <div className="score-part-tags">
          {rowTags.map((tag) => <div className="score-part-tag" style={{ top: tag.top }} key={tag.id}><span><b>{String(tag.index + 1).padStart(2, '0')}</b>{tag.name}</span><span className="score-part-monitor"><button className={mutedTracks.has(tag.index) ? 'active mute' : ''} onClick={() => onToggleTrack(tag.index, 'mute')} title={`${tag.name} 静音`}>M</button><button className={soloTracks.has(tag.index) ? 'active solo' : ''} onClick={() => onToggleTrack(tag.index, 'solo')} title={`${tag.name} 独奏`}>S</button></span></div>)}
        </div>
        <div className="score-selection" ref={selectionElRef} hidden />
        <div className="alphatab-host" ref={hostRef} />
      </div>
    </div>
  );
});
