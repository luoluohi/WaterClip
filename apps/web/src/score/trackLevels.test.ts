import { describe, expect, it } from 'vitest';
import { isTrackAudible, NOTE_OFF, NOTE_ON, TrackLevelModel } from './trackLevels';

describe('track level model', () => {
  it('uses real note velocity and keeps tracks independent', () => {
    const model = new TrackLevelModel();
    model.ingest([
      { track: 2, type: NOTE_ON, channel: 1, noteKey: 64, noteVelocity: 127 },
      { track: 5, type: NOTE_ON, channel: 2, noteKey: 48, noteVelocity: 32 }
    ]);
    const levels = model.sample(16);
    expect(levels.get(2)).toBe(1);
    expect(levels.get(5)).toBeCloseTo(32 / 127, 4);
  });

  it('releases a note with a decaying meter tail instead of a decorative oscillator', () => {
    const model = new TrackLevelModel();
    model.ingest([{ track: 1, type: NOTE_ON, noteKey: 60, noteVelocity: 100 }]);
    const peak = model.sample(16).get(1)!;
    model.ingest([{ track: 1, type: NOTE_OFF, noteKey: 60, noteVelocity: 0 }]);
    const release = model.sample(116).get(1)!;
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThan(peak);
  });

  it('reflects mute and solo routing in meter visibility', () => {
    expect(isTrackAudible(0, new Set([0]), new Set())).toBe(false);
    expect(isTrackAudible(0, new Set(), new Set([1]))).toBe(false);
    expect(isTrackAudible(1, new Set(), new Set([1]))).toBe(true);
  });
});

