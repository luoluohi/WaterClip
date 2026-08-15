import { describe, expect, it } from 'vitest';
import type { ShotGroup } from './domain';
import { activeStoryboardTarget, storyboardSeekMeasure, timelineScrollBehavior } from './timelineFollow';

function group(id: string, startMeasure: number, endMeasure: number, occurrence: number | 'all' = 1): ShotGroup {
  return { id, range: { startMeasure, endMeasure, occurrence }, layout: { kind: 'single' }, shots: [], slotOrder: [], createdAt: id };
}

describe('故事板播放联动', () => {
  it('点击故事板跳到分镜组起始小节', () => {
    expect(storyboardSeekMeasure(group('a', 8, 11))).toBe(8);
  });

  it('按当前小节和播放遍次选择第一个命中的故事板卡片', () => {
    const groups = [group('first-pass', 4, 6, 1), group('all', 4, 6, 'all')];
    expect(activeStoryboardTarget(groups, 5, 1)).toBe('first-pass');
    expect(activeStoryboardTarget(groups, 5, 2)).toBe('all');
    expect(activeStoryboardTarget(groups, 7, 1)).toBeUndefined();
  });

  it('尊重系统减少动态效果设置', () => {
    expect(timelineScrollBehavior(false)).toBe('smooth');
    expect(timelineScrollBehavior(true)).toBe('auto');
  });
});
