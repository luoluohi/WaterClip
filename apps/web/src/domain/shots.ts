import type {
  PlaybackOccurrence,
  Project,
  ScorePart,
  ScoreRange,
  Shot,
  ShotGroup,
  ShotSize,
  SplitLayout
} from './model';

export type IdFactory = () => string;

const defaultIdFactory: IdFactory = () => crypto.randomUUID();

export function normalizeRange(range: ScoreRange): ScoreRange {
  const startMeasure = Math.max(1, Math.min(range.startMeasure, range.endMeasure));
  const endMeasure = Math.max(1, Math.max(range.startMeasure, range.endMeasure));
  if (range.occurrence !== 'all' && (!Number.isInteger(range.occurrence) || range.occurrence < 1)) {
    throw new Error('播放遍次必须是正整数或 all');
  }
  return { startMeasure, endMeasure, occurrence: range.occurrence };
}

export function availableLayouts(partCount: number): SplitLayout[] {
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > 16) {
    throw new Error('分镜组必须包含 1–16 个声部');
  }
  if (partCount === 1) return [{ kind: 'single' }];
  const layouts: SplitLayout[] = [
    { kind: 'horizontal', cells: partCount },
    { kind: 'vertical', cells: partCount }
  ];
  if (partCount === 4) layouts.push({ kind: 'grid', columns: 2, rows: 2 });
  if (partCount === 9) layouts.push({ kind: 'grid', columns: 3, rows: 3 });
  if (partCount === 16) layouts.push({ kind: 'grid', columns: 4, rows: 4 });
  return layouts;
}

export function createShotGroup(
  parts: readonly ScorePart[],
  range: ScoreRange,
  options: { idFactory?: IdFactory; now?: string; size?: ShotSize; description?: string } = {}
): ShotGroup {
  if (parts.length < 1 || parts.length > 16) throw new Error('请选择 1–16 个声部');
  if (new Set(parts.map((part) => part.id)).size !== parts.length) throw new Error('同一分镜组不能重复选择声部');
  const idFactory = options.idFactory ?? defaultIdFactory;
  const shots: Shot[] = parts.map((part) => ({
    id: idFactory(),
    partId: part.id,
    partName: part.name,
    size: options.size ?? '中景',
    description: options.description ?? '',
    generationStatus: 'idle'
  }));
  return {
    id: idFactory(),
    range: normalizeRange(range),
    layout: availableLayouts(parts.length)[0],
    shots,
    slotOrder: shots.map((shot) => shot.id),
    createdAt: options.now ?? new Date().toISOString()
  };
}

export function duplicateShot(group: ShotGroup, shotId: string, idFactory: IdFactory = defaultIdFactory): ShotGroup {
  const sourceIndex = group.shots.findIndex((shot) => shot.id === shotId);
  if (sourceIndex < 0) throw new Error('找不到要复制的子镜头');
  if (group.shots.length >= 16) throw new Error('分镜组最多包含 16 个子镜头');
  const source = group.shots[sourceIndex];
  const copy: Shot = {
    ...source,
    id: idFactory(),
    referenceAssetId: source.referenceAssetId,
    imageAssetId: undefined,
    generationStatus: 'idle',
    generationError: undefined
  };
  const shots = [...group.shots];
  shots.splice(sourceIndex + 1, 0, copy);
  const slotIndex = group.slotOrder.indexOf(shotId);
  const slotOrder = [...group.slotOrder];
  slotOrder.splice(slotIndex + 1, 0, copy.id);
  return { ...group, shots, slotOrder, layout: availableLayouts(shots.length)[0] };
}

export function swapSlots(group: ShotGroup, firstIndex: number, secondIndex: number): ShotGroup {
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < group.slotOrder.length;
  if (!valid(firstIndex) || !valid(secondIndex)) throw new Error('格位索引超出范围');
  const slotOrder = [...group.slotOrder];
  [slotOrder[firstIndex], slotOrder[secondIndex]] = [slotOrder[secondIndex], slotOrder[firstIndex]];
  return { ...group, slotOrder };
}

export function isGroupActive(group: ShotGroup, measure: number, occurrence: number): boolean {
  const { range } = group;
  return (
    measure >= range.startMeasure &&
    measure <= range.endMeasure &&
    (range.occurrence === 'all' || range.occurrence === occurrence)
  );
}

export interface TimelineOccurrence {
  /** Visual measure represented by this occurrence; omit when entries were already scoped to the group. */
  measure?: number;
  occurrence: number;
  /** Monotonic position for a visual measure in this playback occurrence. */
  order: number;
}

export interface ExportShotRow {
  group: ShotGroup;
  shot: Shot;
  occurrence: number;
  timelineOrder: number;
  slotIndex: number;
}

export function sortedShotRows(
  project: Project,
  occurrences: readonly TimelineOccurrence[] = []
): ExportShotRow[] {
  const rows = project.shotGroups.flatMap((group) => {
    const atGroupStart = occurrences.filter((item) => item.measure === undefined || item.measure === group.range.startMeasure);
    const matching = group.range.occurrence === 'all'
      ? atGroupStart
      : atGroupStart.filter((item) => item.occurrence === group.range.occurrence);
    const effective = matching.length > 0
      ? matching
      : [{ occurrence: group.range.occurrence === 'all' ? 1 : group.range.occurrence, order: group.range.startMeasure }];
    return effective.flatMap((occurrence) => group.slotOrder.map((shotId, slotIndex) => {
      const shot = group.shots.find((candidate) => candidate.id === shotId);
      if (!shot) throw new Error(`分镜组 ${group.id} 的格位引用了不存在的子镜头`);
      return { group, shot, occurrence: occurrence.occurrence, timelineOrder: occurrence.order, slotIndex };
    }));
  });
  return rows.sort((a, b) =>
    a.timelineOrder - b.timelineOrder ||
    a.group.range.startMeasure - b.group.range.startMeasure ||
    a.group.range.endMeasure - b.group.range.endMeasure ||
    a.group.createdAt.localeCompare(b.group.createdAt) ||
    a.slotIndex - b.slotIndex
  );
}

export function buildImagePrompt(shot: Pick<Shot, 'partName' | 'size' | 'description'>): string {
  return `${shot.partName.trim()} ${shot.size} ${shot.description.trim()}`.trim();
}

export function occurrenceLabel(occurrence: PlaybackOccurrence): string {
  return occurrence === 'all' ? '全部遍次' : `第 ${occurrence} 遍`;
}
