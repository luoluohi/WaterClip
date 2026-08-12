import type { PlaybackPosition } from '../../score/ScoreCanvas';

export const SCORE_WINDOW_QUERY = 'waterclip-score-window';
export const SCORE_WINDOW_CHANNEL_QUERY = 'channel';

export interface ScoreWindowSnapshot {
  scoreData?: Uint8Array;
  scoreName?: string;
  position?: PlaybackPosition;
  playing: boolean;
  mutedTracks: number[];
  soloTracks: number[];
  zoom: number;
}

export type ScoreWindowCommand =
  | { kind: 'play-pause' }
  | { kind: 'stop' }
  | { kind: 'seek-ratio'; ratio: number }
  | { kind: 'seek-measure'; measure: number }
  | { kind: 'toggle-track'; trackIndex: number; mode: 'mute' | 'solo' }
  | { kind: 'set-zoom'; zoom: number };

export type ScoreWindowMessage =
  | { type: 'ready' }
  | { type: 'snapshot'; snapshot: ScoreWindowSnapshot }
  | { type: 'position'; position: PlaybackPosition; playing: boolean }
  | { type: 'tracks'; mutedTracks: number[]; soloTracks: number[] }
  | { type: 'command'; command: ScoreWindowCommand };

export interface MessageChannelLike {
  postMessage(message: ScoreWindowMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ScoreWindowMessage>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<ScoreWindowMessage>) => void): void;
  close(): void;
}

export interface ScoreWindowConnection {
  readonly name: string;
  post(message: ScoreWindowMessage): void;
  subscribe(listener: (message: ScoreWindowMessage) => void): () => void;
  close(): void;
}

export interface ScoreWindowHostBridge {
  publish(snapshot: ScoreWindowSnapshot): void;
  close(): void;
}

/** Main-window side of the protocol: replays state after child refreshes. */
export function connectScoreWindowHost(
  connection: ScoreWindowConnection,
  initialSnapshot: ScoreWindowSnapshot,
  onCommand: (command: ScoreWindowCommand) => void
): ScoreWindowHostBridge {
  let latest = initialSnapshot;
  const unsubscribe = connection.subscribe((message) => {
    if (message.type === 'ready') connection.post({ type: 'snapshot', snapshot: latest });
    if (message.type === 'command') onCommand(clampScoreWindowCommand(message.command));
  });
  return {
    publish(snapshot) {
      latest = snapshot;
      connection.post({ type: 'snapshot', snapshot });
    },
    close() {
      unsubscribe();
      connection.close();
    }
  };
}

export interface ScoreWindowGuestBridge {
  command(command: ScoreWindowCommand): void;
  close(): void;
}

/** Companion-window side. It asks for a fresh snapshot on every mount/refresh. */
export function connectScoreWindowGuest(
  connection: ScoreWindowConnection,
  onSnapshot: (snapshot: ScoreWindowSnapshot) => void
): ScoreWindowGuestBridge {
  const unsubscribe = connection.subscribe((message) => {
    if (message.type === 'snapshot') onSnapshot(message.snapshot);
  });
  connection.post({ type: 'ready' });
  return {
    command: (command) => connection.post({ type: 'command', command: clampScoreWindowCommand(command) }),
    close: () => {
      unsubscribe();
      connection.close();
    }
  };
}

export function createScoreWindowConnection(
  name: string,
  createChannel: (channelName: string) => MessageChannelLike = (channelName) => new BroadcastChannel(channelName)
): ScoreWindowConnection {
  const channel = createChannel(name);
  const subscriptions = new Map<(message: ScoreWindowMessage) => void, (event: MessageEvent<ScoreWindowMessage>) => void>();
  return {
    name,
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      const wrapped = (event: MessageEvent<ScoreWindowMessage>) => listener(event.data);
      subscriptions.set(listener, wrapped);
      channel.addEventListener('message', wrapped);
      return () => {
        const current = subscriptions.get(listener);
        if (!current) return;
        channel.removeEventListener('message', current);
        subscriptions.delete(listener);
      };
    },
    close: () => {
      for (const wrapped of subscriptions.values()) channel.removeEventListener('message', wrapped);
      subscriptions.clear();
      channel.close();
    }
  };
}

export interface OpenScoreWindowResult {
  window: Window;
  connection: ScoreWindowConnection;
  channelName: string;
}

export interface OpenScoreWindowOptions {
  currentUrl?: string;
  openWindow?: (url: string, target: string, features: string) => Window | null;
  createChannel?: (channelName: string) => MessageChannelLike;
  createId?: () => string;
}

/** Opens a same-origin score-only window. The caller owns and must close the connection. */
export function openScoreWindow(options: OpenScoreWindowOptions = {}): OpenScoreWindowResult | undefined {
  const currentUrl = options.currentUrl ?? window.location.href;
  const channelName = `waterclip-score-${(options.createId ?? (() => crypto.randomUUID()))()}`;
  const url = new URL(currentUrl);
  url.searchParams.set(SCORE_WINDOW_QUERY, '1');
  url.searchParams.set(SCORE_WINDOW_CHANNEL_QUERY, channelName);
  const popup = (options.openWindow ?? window.open)(
    url.toString(),
    'waterclip-score',
    'popup=yes,width=1500,height=900,resizable=yes,scrollbars=no'
  );
  if (!popup) return undefined;
  return {
    window: popup,
    channelName,
    connection: createScoreWindowConnection(channelName, options.createChannel)
  };
}

export function readScoreWindowLaunch(url = window.location.href): { channelName: string } | undefined {
  const parsed = new URL(url);
  if (parsed.searchParams.get(SCORE_WINDOW_QUERY) !== '1') return undefined;
  const channelName = parsed.searchParams.get(SCORE_WINDOW_CHANNEL_QUERY)?.trim();
  return channelName ? { channelName } : undefined;
}

export function clampScoreWindowCommand(command: ScoreWindowCommand): ScoreWindowCommand {
  if (command.kind === 'seek-ratio') return { ...command, ratio: Math.max(0, Math.min(1, command.ratio)) };
  if (command.kind === 'seek-measure') return { ...command, measure: Math.max(1, Math.floor(command.measure)) };
  if (command.kind === 'set-zoom') return { ...command, zoom: Math.max(0.35, Math.min(2, command.zoom)) };
  if (command.kind === 'toggle-track') return { ...command, trackIndex: Math.max(0, Math.floor(command.trackIndex)) };
  return command;
}
