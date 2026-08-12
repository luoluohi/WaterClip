import { beforeEach, describe, expect, it } from 'vitest';
import type { Project, ScorePart } from '../domain';
import { sortShotGroupsForStoryboard, useWorkspace } from './workspace';

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
      assetUrls: {},
      history: { past: [], future: [] }
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

  it('故事板按起始小节排序，起点相同的分镜保持原有次序', () => {
    useWorkspace.getState().setSelection({ partIds: ['violin'], startMeasure: 10, endMeasure: 11 });
    const lateFirst = useWorkspace.getState().addGroup()!;
    useWorkspace.getState().setSelection({ partIds: ['cello'], startMeasure: 2, endMeasure: 3 });
    const early = useWorkspace.getState().addGroup()!;
    useWorkspace.getState().setSelection({ partIds: ['cello'], startMeasure: 10, endMeasure: 10 });
    const lateSecond = useWorkspace.getState().addGroup()!;

    const source = useWorkspace.getState().project.shotGroups;
    const sorted = sortShotGroupsForStoryboard(source);

    expect(sorted.map((group) => group.id)).toEqual([early.id, lateFirst.id, lateSecond.id]);
    expect(source.map((group) => group.id)).toEqual([lateFirst.id, early.id, lateSecond.id]);
  });

  it('撤销和重做恢复分镜组、选中状态及编辑内容', () => {
    useWorkspace.getState().setSelection({ partIds: ['violin'], startMeasure: 4, endMeasure: 6 });
    const group = useWorkspace.getState().addGroup()!;
    const shot = group.shots[0];
    useWorkspace.getState().updateShot(group.id, shot.id, { description: '手部特写' });
    useWorkspace.getState().deleteGroup(group.id);

    expect(useWorkspace.getState().project.shotGroups).toHaveLength(0);
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().selectedGroupId).toBe(group.id);
    expect(useWorkspace.getState().project.shotGroups[0].shots[0].description).toBe('手部特写');

    useWorkspace.getState().undo();
    expect(useWorkspace.getState().project.shotGroups[0].shots[0].description).toBe('');

    useWorkspace.getState().redo();
    expect(useWorkspace.getState().project.shotGroups[0].shots[0].description).toBe('手部特写');
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().project.shotGroups).toHaveLength(0);
  });

  it('撤销后发生新编辑会清空重做分支', () => {
    useWorkspace.getState().setSelection({ partIds: ['violin'], startMeasure: 1, endMeasure: 1 });
    const group = useWorkspace.getState().addGroup()!;
    useWorkspace.getState().updateShot(group.id, group.shots[0].id, { description: '第一次编辑' });
    useWorkspace.getState().undo();
    useWorkspace.getState().updateShot(group.id, group.shots[0].id, { description: '分支编辑' });
    useWorkspace.getState().redo();

    expect(useWorkspace.getState().project.shotGroups[0].shots[0].description).toBe('分支编辑');
    expect(useWorkspace.getState().history.future).toEqual([]);
  });

  it('把 MuseScore 路径与其他本机设置一起持久化', () => {
    useWorkspace.getState().setSettings({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'local-only',
      museScorePath: 'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe',
      autoPageTurn: true,
      llmModel: 'gpt-5-mini',
      hardwareAcceleration: true,
    });

    expect(JSON.parse(localStorage.getItem('waterclip.settings') ?? '{}')).toMatchObject({
      museScorePath: 'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe',
      autoPageTurn: true,
    });
  });
});
