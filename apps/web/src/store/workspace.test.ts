import { beforeEach, describe, expect, it } from 'vitest';
import type { Project, ScorePart } from '../domain';
import { useWorkspace } from './workspace';

const parts: ScorePart[] = [
  { id: 'violin', name: '小提琴', staffIds: ['violin-staff'], playbackTrackIds: [0] },
  { id: 'cello', name: '大提琴', staffIds: ['cello-staff'], playbackTrackIds: [1] }
];

function emptyProject(): Project {
  return {
    schemaVersion: 1,
    id: 'workspace-test',
    name: '测试合奏',
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    shotGroups: []
  };
}

describe('workspace store', () => {
  beforeEach(() => {
    useWorkspace.setState({
      project: emptyProject(),
      parts,
      selection: undefined,
      selectedGroupId: undefined,
      assetUrls: {}
    });
  });

  it('把多声部框选创建为一个分屏组，且保留选区便于连续补拍', () => {
    useWorkspace.getState().setSelection({ partIds: ['violin', 'cello'], startMeasure: 4, endMeasure: 6 });
    const first = useWorkspace.getState().addGroup();
    const second = useWorkspace.getState().addGroup();

    expect(first?.shots.map((shot) => shot.partId)).toEqual(['violin', 'cello']);
    expect(first?.layout).toEqual({ kind: 'horizontal', cells: 2 });
    expect(second?.id).not.toBe(first?.id);
    expect(useWorkspace.getState().selection).toEqual({ partIds: ['violin', 'cello'], startMeasure: 4, endMeasure: 6 });
  });

  it('可以将分镜组切换到特定重复遍次或全部遍次', () => {
    useWorkspace.getState().setSelection({ partIds: ['violin'], startMeasure: 8, endMeasure: 8 });
    const group = useWorkspace.getState().addGroup()!;

    useWorkspace.getState().updateRangeOccurrence(group.id, 2);
    expect(useWorkspace.getState().project.shotGroups[0].range.occurrence).toBe(2);

    useWorkspace.getState().updateRangeOccurrence(group.id, 'all');
    expect(useWorkspace.getState().project.shotGroups[0].range.occurrence).toBe('all');
  });

  it('更换为另一份乐谱时清理旧分镜与选区', () => {
    useWorkspace.getState().setScore('old.musicxml', 'musicxml', parts);
    useWorkspace.getState().setSelection({ partIds: ['violin'], startMeasure: 1, endMeasure: 2 });
    useWorkspace.getState().addGroup();

    const replacement = [{ id: 'flute', name: '长笛', staffIds: ['flute-staff'], playbackTrackIds: [0] }];
    useWorkspace.getState().setScore('new.mscz', 'mscz', replacement);

    expect(useWorkspace.getState().project.shotGroups).toEqual([]);
    expect(useWorkspace.getState().selection).toBeUndefined();
    expect(useWorkspace.getState().selectedGroupId).toBeUndefined();
    expect(useWorkspace.getState().parts).toEqual(replacement);
  });
});
