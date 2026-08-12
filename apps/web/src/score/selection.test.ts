import { describe, expect, it } from 'vitest';
import { mergeSelection, rangesHaveCell, selectionCells, selectionFromCells, selectionHasCell } from './selection';

describe('semantic score selection', () => {
  it('expands legacy rectangles and normalizes exact cells', () => {
    expect(selectionCells({ partIds: ['violin'], startMeasure: 2, endMeasure: 3 })).toEqual([
      { partId: 'violin', measure: 2 },
      { partId: 'violin', measure: 3 }
    ]);
    expect(selectionFromCells([
      { partId: 'cello', measure: 4 },
      { partId: 'violin', measure: 2 },
      { partId: 'cello', measure: 4 }
    ])).toMatchObject({ partIds: ['violin', 'cello'], startMeasure: 2, endMeasure: 4 });
  });

  it('uses symmetric difference for Ctrl add and inverse selection', () => {
    const current = selectionFromCells([
      { partId: 'violin', measure: 1 },
      { partId: 'violin', measure: 2 }
    ]);
    const result = mergeSelection(current, [
      { partId: 'violin', measure: 2 },
      { partId: 'cello', measure: 3 }
    ], true);
    expect(selectionCells(result)).toEqual([
      { partId: 'violin', measure: 1 },
      { partId: 'cello', measure: 3 }
    ]);
    expect(selectionHasCell(result, 'violin', 2)).toBe(false);
    expect(selectionHasCell(result, 'cello', 3)).toBe(true);
  });

  it('returns no selection after toggling every selected cell off', () => {
    const cell = { partId: 'flute', measure: 8 };
    expect(mergeSelection(selectionFromCells([cell]), [cell], true)).toBeUndefined();
  });

  it('matches the active-shot part and inclusive measure range', () => {
    const ranges = [{ partId: 'cello', startMeasure: 7, endMeasure: 9 }];
    expect(rangesHaveCell(ranges, 'cello', 7)).toBe(true);
    expect(rangesHaveCell(ranges, 'cello', 9)).toBe(true);
    expect(rangesHaveCell(ranges, 'violin', 8)).toBe(false);
    expect(rangesHaveCell(ranges, 'cello', 10)).toBe(false);
  });
});
