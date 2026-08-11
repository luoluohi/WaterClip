export const HORIZONTAL_BAR_WIDTH = 320;

export interface MeasureBounds { index: number; x: number; width: number }

interface DisplayBar { displayWidth: number }
interface HorizontalScore {
  masterBars: DisplayBar[];
  tracks: Array<{ staves: Array<{ bars: DisplayBar[] }> }>;
}

/**
 * Gives every visual measure the same positive layout width.
 *
 * alphaTab's horizontal renderer can reuse negative/natural offsets from
 * imported MusicXML systems when displayWidth is unset (-1). On large scores
 * that makes a later system start before the previous one has ended. Setting
 * both master and staff bars keeps multi-track and single-track rendering on
 * the same monotonic horizontal grid.
 */
export function normalizeHorizontalBarWidths(score: HorizontalScore, width = HORIZONTAL_BAR_WIDTH): void {
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('横向小节宽度必须为正数');
  for (const masterBar of score.masterBars) masterBar.displayWidth = width;
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) bar.displayWidth = width;
    }
  }
}

export function findFirstOverlappingMeasure(measures: readonly MeasureBounds[], tolerance = 0.5): MeasureBounds | undefined {
  const ordered = [...measures].sort((a, b) => a.index - b.index);
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const measure of ordered) {
    if (measure.x < previousEnd - tolerance) return measure;
    previousEnd = Math.max(previousEnd, measure.x + measure.width);
  }
  return undefined;
}

export function hasOverlappingMeasureBounds(measures: readonly MeasureBounds[], tolerance = 0.5): boolean {
  return findFirstOverlappingMeasure(measures, tolerance) !== undefined;
}
