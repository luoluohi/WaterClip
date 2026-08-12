import { describe, expect, it } from 'vitest';
import type { Project, ScorePart } from './domain';
import { buildPartStatistics } from './statistics';

describe('part statistics', () => {
  it('counts unique covered measures and all shots for each part', () => {
    const parts: ScorePart[] = [{ id: 'v', name: '小提琴', staffIds: ['s'], playbackTrackIds: [0] }];
    const project = { shotGroups: [
      { range: { startMeasure: 1, endMeasure: 3 }, shots: [{ partId: 'v' }, { partId: 'v' }] },
      { range: { startMeasure: 3, endMeasure: 5 }, shots: [{ partId: 'v' }] }
    ] } as unknown as Project;
    expect(buildPartStatistics(project, parts)).toEqual([{ partId: 'v', partName: '小提琴', selectedMeasureCount: 5, shotCount: 3 }]);
  });
});
