import { describe, expect, it } from 'vitest';
import { HORIZONTAL_BAR_WIDTH, hasOverlappingMeasureBounds, normalizeHorizontalBarWidths } from './horizontalLayout';

function fixture() {
  return {
    masterBars: [{ displayWidth: -1 }, { displayWidth: 180 }, { displayWidth: -1 }],
    tracks: [
      { staves: [{ bars: [{ displayWidth: -1 }, { displayWidth: 90 }, { displayWidth: -1 }] }] },
      { staves: [{ bars: [{ displayWidth: 120 }, { displayWidth: -1 }, { displayWidth: 240 }] }] }
    ]
  };
}

describe('horizontal score layout', () => {
  it('places master and staff bars on one consistent positive-width grid', () => {
    const score = fixture();
    normalizeHorizontalBarWidths(score);

    expect(score.masterBars.map((bar) => bar.displayWidth)).toEqual([HORIZONTAL_BAR_WIDTH, HORIZONTAL_BAR_WIDTH, HORIZONTAL_BAR_WIDTH]);
    expect(score.tracks.flatMap((track) => track.staves.flatMap((staff) => staff.bars.map((bar) => bar.displayWidth))))
      .toEqual(Array(6).fill(HORIZONTAL_BAR_WIDTH));
  });

  it('rejects widths that could reset or reverse the horizontal measure flow', () => {
    expect(() => normalizeHorizontalBarWidths(fixture(), 0)).toThrow(RangeError);
    expect(() => normalizeHorizontalBarWidths(fixture(), Number.NaN)).toThrow(RangeError);
  });

  it('detects the imported-system reset that overlapped measures 1–5 and 6–10', () => {
    expect(hasOverlappingMeasureBounds([
      { index: 1, x: 52, width: 210 },
      { index: 2, x: 262, width: 183 },
      { index: 3, x: 445, width: 148 },
      { index: 4, x: 593, width: 216 },
      { index: 5, x: 809, width: 71 },
      { index: 6, x: -574, width: 310 }
    ])).toBe(true);
    expect(hasOverlappingMeasureBounds([
      { index: 1, x: 52, width: 262 },
      { index: 2, x: 314, width: 262 },
      { index: 3, x: 576, width: 262 }
    ])).toBe(false);
  });
});
