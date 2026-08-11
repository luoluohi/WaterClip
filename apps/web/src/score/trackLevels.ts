export const NOTE_ON = 128;
export const NOTE_OFF = 144;

export interface PlayedNoteEvent {
  track: number;
  type: number;
  channel?: number;
  noteKey?: number;
  noteVelocity?: number;
}

export class TrackLevelModel {
  private readonly activeNotes = new Map<number, Map<string, number>>();
  private readonly levels = new Map<number, number>();
  private readonly targets = new Map<number, number>();
  private lastSampleTime = 0;

  ingest(events: readonly PlayedNoteEvent[]): void {
    for (const event of events) {
      if (event.type !== NOTE_ON && event.type !== NOTE_OFF) continue;
      const track = event.track;
      const notes = this.activeNotes.get(track) ?? new Map<string, number>();
      const key = `${event.channel ?? 0}:${event.noteKey ?? 0}`;
      const velocity = Math.max(0, Math.min(127, event.noteVelocity ?? 0));
      if (event.type === NOTE_ON && velocity > 0) notes.set(key, velocity / 127);
      else notes.delete(key);
      if (notes.size) this.activeNotes.set(track, notes);
      else this.activeNotes.delete(track);

      const velocities = [...notes.values()];
      const peak = velocities.length ? Math.max(...velocities) : 0;
      const polyphonyLift = Math.min(0.14, Math.max(0, velocities.length - 1) * 0.025);
      const target = Math.min(1, peak + polyphonyLift);
      this.targets.set(track, target);
      if (target > (this.levels.get(track) ?? 0)) this.levels.set(track, target);
    }
  }

  releaseAll(): void {
    this.activeNotes.clear();
    for (const track of this.targets.keys()) this.targets.set(track, 0);
  }

  reset(): void {
    this.activeNotes.clear();
    this.targets.clear();
    this.levels.clear();
    this.lastSampleTime = 0;
  }

  sample(now: number): Map<number, number> {
    const elapsed = this.lastSampleTime ? Math.min(100, Math.max(0, now - this.lastSampleTime)) : 16;
    this.lastSampleTime = now;
    const releaseFactor = Math.exp(-elapsed / 210);
    const tracks = new Set([...this.levels.keys(), ...this.targets.keys()]);
    for (const track of tracks) {
      const current = this.levels.get(track) ?? 0;
      const target = this.targets.get(track) ?? 0;
      const next = target >= current ? target : Math.max(target, current * releaseFactor);
      if (next < 0.004 && target === 0) {
        this.levels.delete(track);
        this.targets.delete(track);
      } else {
        this.levels.set(track, next);
      }
    }
    return new Map(this.levels);
  }

  hasSignal(): boolean {
    return this.activeNotes.size > 0 || [...this.levels.values()].some((level) => level >= 0.004);
  }
}

export class TrackLevelBus {
  private readonly model = new TrackLevelModel();
  private readonly listeners = new Map<number, Set<() => void>>();
  private levels = new Map<number, number>();
  private frame?: number;

  ingest(events: readonly PlayedNoteEvent[]): void {
    this.model.ingest(events);
    this.publish(performance.now());
    this.ensureFrame();
  }

  releaseAll(): void {
    this.model.releaseAll();
    this.ensureFrame();
  }

  reset(): void {
    this.model.reset();
    this.levels = new Map();
    this.notifyAll();
    if (this.frame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  destroy(): void {
    this.reset();
    this.listeners.clear();
  }

  getLevel(track: number): number {
    return this.levels.get(track) ?? 0;
  }

  subscribe(track: number, listener: () => void): () => void {
    const listeners = this.listeners.get(track) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(track, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(track);
    };
  }

  private ensureFrame(): void {
    if (this.frame !== undefined || typeof requestAnimationFrame !== 'function') return;
    this.frame = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (now: number) => {
    this.frame = undefined;
    this.publish(now);
    if (this.model.hasSignal()) this.ensureFrame();
  };

  private publish(now: number): void {
    const next = this.model.sample(now);
    const changed = new Set([...this.levels.keys(), ...next.keys()]);
    this.levels = next;
    for (const track of changed) {
      const listeners = this.listeners.get(track);
      if (listeners) for (const listener of listeners) listener();
    }
  }

  private notifyAll(): void {
    for (const listeners of this.listeners.values()) for (const listener of listeners) listener();
  }
}

export function isTrackAudible(track: number, muted: ReadonlySet<number>, soloed: ReadonlySet<number>): boolean {
  return !muted.has(track) && (soloed.size === 0 || soloed.has(track));
}
