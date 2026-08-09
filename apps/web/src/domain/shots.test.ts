import { describe, expect, it } from 'vitest';
import type { Project, ScorePart } from './model';
import { availableLayouts, buildImagePrompt, createShotGroup, duplicateShot, isGroupActive, sortedShotRows, swapSlots } from './shots';

const parts: ScorePart[] = Array.from({ length: 16 }, (_, index) => ({
  id: `p${index + 1}`,
  name: `声部 ${index + 1}`,
  staffIds: [`s${index + 1}`],
  playbackTrackIds: [index]
}));

const ids = (...values: string[]) => {
  let index = 0;
  return () => values[index++] ?? `id-${index}`;
};

describe('分镜领域规则', () => {
  it('允许相同声部与范围创建多个不同分镜组', () => {
    const range = { startMeasure: 8, endMeasure: 4, occurrence: 2 as const };
    const first = createShotGroup(parts.slice(0, 2), range, { idFactory: ids('a', 'b', 'g1'), now: '2026-01-01' });
    const second = createShotGroup(parts.slice(0, 2), range, { idFactory: ids('c', 'd', 'g2'), now: '2026-01-02' });
    expect(first.range).toEqual({ startMeasure: 4, endMeasure: 8, occurrence: 2 });
    expect(first.id).not.toBe(second.id);
    expect(first.shots).toHaveLength(2);
  });

  it('只为 4/9/16 个子镜头提供方格布局', () => {
    expect(availableLayouts(2).map((layout) => layout.kind)).toEqual(['horizontal', 'vertical']);
    expect(availableLayouts(4)).toContainEqual({ kind: 'grid', columns: 2, rows: 2 });
    expect(availableLayouts(9)).toContainEqual({ kind: 'grid', columns: 3, rows: 3 });
    expect(availableLayouts(16)).toContainEqual({ kind: 'grid', columns: 4, rows: 4 });
  });

  it('复制镜头时保留参考图但清除生成结果，并可交换格位', () => {
    const group = createShotGroup(parts.slice(0, 2), { startMeasure: 1, endMeasure: 2, occurrence: 'all' }, { idFactory: ids('s1', 's2', 'g') });
    group.shots[0].referenceAssetId = 'ref';
    group.shots[0].imageAssetId = 'generated';
    const copied = duplicateShot(group, 's1', ids('copy'));
    expect(copied.shots[1]).toMatchObject({ id: 'copy', referenceAssetId: 'ref', imageAssetId: undefined, generationStatus: 'idle' });
    expect(swapSlots(copied, 0, 2).slotOrder).toEqual(['s2', 'copy', 's1']);
  });

  it('按小节和播放遍次判定激活，all 匹配所有遍次', () => {
    const all = createShotGroup(parts.slice(0, 1), { startMeasure: 3, endMeasure: 5, occurrence: 'all' }, { idFactory: ids('s', 'g') });
    expect(isGroupActive(all, 4, 3)).toBe(true);
    expect(isGroupActive(all, 6, 3)).toBe(false);
    expect(isGroupActive({ ...all, range: { ...all.range, occurrence: 2 } }, 4, 1)).toBe(false);
  });

  it('严格用声部、景别、描述拼接提示词', () => {
    expect(buildImagePrompt({ partName: ' 小提琴 ', size: '特写', description: ' 弓尖随节拍移动 ' })).toBe('小提琴 特写 弓尖随节拍移动');
  });

  it('all 按实际时间线展开，组内遵循格位顺序', () => {
    const group = createShotGroup(parts.slice(0, 2), { startMeasure: 10, endMeasure: 12, occurrence: 'all' }, { idFactory: ids('s1', 's2', 'g'), now: '2026-01-01' });
    const project: Project = { schemaVersion: 1, id: 'p', name: 'P', createdAt: '', updatedAt: '', shotGroups: [swapSlots(group, 0, 1)] };
    const rows = sortedShotRows(project, [{ occurrence: 1, order: 10 }, { occurrence: 2, order: 50 }]);
    expect(rows.map((row) => `${row.occurrence}:${row.shot.id}`)).toEqual(['1:s2', '1:s1', '2:s2', '2:s1']);
  });
});
