export interface ScoreSectionMarker {
  label: string;
  measure: number;
  ratio: number;
}

export function sectionLabel(index: number): string {
  let value = Math.max(0, Math.floor(index));
  let label = '';
  do {
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

export function buildSectionMarkers(totalMeasures: number, authoredSectionMeasures: number[] = []): ScoreSectionMarker[] {
  if (totalMeasures <= 0) return [];
  const authored = [...new Set(authoredSectionMeasures)]
    .filter((measure) => Number.isInteger(measure) && measure >= 1 && measure <= totalMeasures)
    .sort((a, b) => a - b);
  const measures = authored.length
    ? authored
    : [0, 1, 2, 3].map((index) => Math.min(totalMeasures, Math.round(index * (totalMeasures - 1) / 4) + 1));
  return measures.map((measure, index) => ({
    label: sectionLabel(index),
    measure,
    ratio: totalMeasures <= 1 ? 0 : (measure - 1) / (totalMeasures - 1)
  }));
}

export function playbackRequestAction(isReady: boolean, isPlaying: boolean): 'play' | 'pause' | 'queue' {
  if (isPlaying) return 'pause';
  return isReady ? 'play' : 'queue';
}

export interface HorizontalMeasureBounds { x: number; width: number }

export function pageTurnTarget(
  measures: ReadonlyMap<number, HorizontalMeasureBounds>,
  measure: number,
  scrollLeft: number,
  viewportWidth: number
): number | undefined {
  const current = measures.get(measure);
  if (!current || current.x + current.width <= scrollLeft + viewportWidth) return undefined;
  return measures.get(Math.max(1, measure - 1))?.x ?? current.x;
}

export function seekRevealTarget(bounds: HorizontalMeasureBounds, scrollLeft: number, viewportWidth: number): number | undefined {
  if (bounds.x >= scrollLeft && bounds.x + bounds.width <= scrollLeft + viewportWidth) return undefined;
  return Math.max(0, bounds.x - viewportWidth * 0.12);
}
