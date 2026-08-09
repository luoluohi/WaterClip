import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../domain';
import { createProjectAutosave } from './database';

const project = (name: string): Project => ({
  schemaVersion: 1,
  id: 'project',
  name,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  shotGroups: []
});

describe('项目自动保存', () => {
  afterEach(() => vi.useRealTimers());

  it('在防抖窗口内只保存最后一个不可变快照', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_project: Project) => undefined);
    const autosave = createProjectAutosave({ save }, 100);
    const first = project('第一版');
    autosave.schedule(first);
    first.name = '调用后被外部修改';
    autosave.schedule(project('最终版'));
    await vi.advanceTimersByTimeAsync(100);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].name).toBe('最终版');
  });
});
