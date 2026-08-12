import { describe, expect, it, vi } from 'vitest';
import {
  clampScoreWindowCommand,
  connectScoreWindowGuest,
  connectScoreWindowHost,
  createScoreWindowConnection,
  openScoreWindow,
  readScoreWindowLaunch,
  type MessageChannelLike,
  type ScoreWindowMessage
} from './scoreWindowProtocol';

class MemoryChannel implements MessageChannelLike {
  listeners = new Set<(event: MessageEvent<ScoreWindowMessage>) => void>();
  sent: ScoreWindowMessage[] = [];
  closed = false;
  postMessage(message: ScoreWindowMessage) { this.sent.push(message); }
  addEventListener(_type: 'message', listener: (event: MessageEvent<ScoreWindowMessage>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: 'message', listener: (event: MessageEvent<ScoreWindowMessage>) => void) { this.listeners.delete(listener); }
  close() { this.closed = true; }
  deliver(message: ScoreWindowMessage) { for (const listener of this.listeners) listener({ data: message } as MessageEvent<ScoreWindowMessage>); }
}

describe('score window protocol', () => {
  it('creates an isolated same-origin launch url and reports popup blocking', () => {
    let requestedUrl = '';
    const open = vi.fn((url: string) => {
      requestedUrl = url;
      return {} as Window;
    });
    const channel = new MemoryChannel();
    const result = openScoreWindow({
      currentUrl: 'http://localhost:5173/project?old=1',
      createId: () => 'abc',
      openWindow: open,
      createChannel: () => channel
    });
    expect(result?.channelName).toBe('waterclip-score-abc');
    const openedUrl = new URL(requestedUrl);
    expect(openedUrl.origin).toBe('http://localhost:5173');
    expect(readScoreWindowLaunch(openedUrl.toString())).toEqual({ channelName: 'waterclip-score-abc' });
    expect(openScoreWindow({ currentUrl: 'http://localhost', openWindow: () => null })).toBeUndefined();
  });

  it('delivers typed messages and removes listeners on close', () => {
    const channel = new MemoryChannel();
    const connection = createScoreWindowConnection('test', () => channel);
    const listener = vi.fn();
    const unsubscribe = connection.subscribe(listener);
    channel.deliver({ type: 'ready' });
    expect(listener).toHaveBeenCalledWith({ type: 'ready' });
    unsubscribe();
    channel.deliver({ type: 'ready' });
    expect(listener).toHaveBeenCalledTimes(1);
    connection.close();
    expect(channel.closed).toBe(true);
  });

  it('clamps untrusted companion window commands', () => {
    expect(clampScoreWindowCommand({ kind: 'seek-ratio', ratio: 8 })).toEqual({ kind: 'seek-ratio', ratio: 1 });
    expect(clampScoreWindowCommand({ kind: 'seek-measure', measure: -5 })).toEqual({ kind: 'seek-measure', measure: 1 });
    expect(clampScoreWindowCommand({ kind: 'set-zoom', zoom: 9 })).toEqual({ kind: 'set-zoom', zoom: 2 });
    expect(clampScoreWindowCommand({ kind: 'toggle-track', trackIndex: -3, mode: 'solo' })).toEqual({ kind: 'toggle-track', trackIndex: 0, mode: 'solo' });
  });

  it('replays the latest snapshot after a guest refresh and sanitizes commands', () => {
    const channel = new MemoryChannel();
    const connection = createScoreWindowConnection('test', () => channel);
    const command = vi.fn();
    const initial = { playing: false, mutedTracks: [], soloTracks: [], zoom: 1 };
    const latest = { ...initial, playing: true, mutedTracks: [2] };
    const host = connectScoreWindowHost(connection, initial, command);
    host.publish(latest);
    channel.deliver({ type: 'ready' });
    expect(channel.sent.at(-1)).toEqual({ type: 'snapshot', snapshot: latest });
    channel.deliver({ type: 'command', command: { kind: 'seek-ratio', ratio: -4 } });
    expect(command).toHaveBeenCalledWith({ kind: 'seek-ratio', ratio: 0 });
  });

  it('guest announces readiness, consumes snapshots, and emits commands', () => {
    const channel = new MemoryChannel();
    const connection = createScoreWindowConnection('guest', () => channel);
    const snapshot = vi.fn();
    const guest = connectScoreWindowGuest(connection, snapshot);
    expect(channel.sent[0]).toEqual({ type: 'ready' });
    const state = { playing: false, mutedTracks: [], soloTracks: [], zoom: 1 };
    channel.deliver({ type: 'snapshot', snapshot: state });
    expect(snapshot).toHaveBeenCalledWith(state);
    guest.command({ kind: 'set-zoom', zoom: 99 });
    expect(channel.sent.at(-1)).toEqual({ type: 'command', command: { kind: 'set-zoom', zoom: 2 } });
  });
});
