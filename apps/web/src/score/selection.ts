export interface ScoreSelectionCell {
  partId: string;
  measure: number;
}

export interface SemanticScoreSelection {
  partIds: string[];
  startMeasure: number;
  endMeasure: number;
  /** Exact cells are present for non-rectangular additive selections. */
  cells?: ScoreSelectionCell[];
}

export interface ScoreCellRange {
  partId: string;
  startMeasure: number;
  endMeasure: number;
}

const cellKey = (cell: ScoreSelectionCell) => `${cell.partId}\u0000${cell.measure}`;

export function selectionCells(selection: SemanticScoreSelection | undefined): ScoreSelectionCell[] {
  if (!selection) return [];
  if (selection.cells) return selection.cells;
  return selection.partIds.flatMap((partId) => {
    const cells: ScoreSelectionCell[] = [];
    for (let measure = selection.startMeasure; measure <= selection.endMeasure; measure += 1) {
      cells.push({ partId, measure });
    }
    return cells;
  });
}

export function selectionFromCells(cells: Iterable<ScoreSelectionCell>): SemanticScoreSelection | undefined {
  const unique = new Map<string, ScoreSelectionCell>();
  for (const cell of cells) unique.set(cellKey(cell), cell);
  if (!unique.size) return undefined;
  const values = [...unique.values()].sort((a, b) => a.measure - b.measure || a.partId.localeCompare(b.partId));
  const measures = values.map((cell) => cell.measure);
  return {
    partIds: [...new Set(values.map((cell) => cell.partId))],
    startMeasure: Math.min(...measures),
    endMeasure: Math.max(...measures),
    cells: values
  };
}

/** Ctrl-selection uses symmetric difference so dragging an existing cell deselects it. */
export function mergeSelection(
  current: SemanticScoreSelection | undefined,
  incoming: Iterable<ScoreSelectionCell>,
  toggle: boolean
): SemanticScoreSelection | undefined {
  if (!toggle) return selectionFromCells(incoming);
  const merged = new Map(selectionCells(current).map((cell) => [cellKey(cell), cell]));
  for (const cell of incoming) {
    const key = cellKey(cell);
    if (merged.has(key)) merged.delete(key);
    else merged.set(key, cell);
  }
  return selectionFromCells(merged.values());
}

export function selectionHasCell(selection: SemanticScoreSelection | undefined, partId: string, measure: number): boolean {
  if (!selection) return false;
  if (!selection.cells) {
    return selection.partIds.includes(partId) && measure >= selection.startMeasure && measure <= selection.endMeasure;
  }
  return selection.cells.some((cell) => cell.partId === partId && cell.measure === measure);
}

export function rangesHaveCell(ranges: readonly ScoreCellRange[], partId: string, measure: number): boolean {
  return ranges.some((range) => range.partId === partId && measure >= range.startMeasure && measure <= range.endMeasure);
}
