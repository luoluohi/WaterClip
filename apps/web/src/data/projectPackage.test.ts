import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { BinaryAsset, Project } from '../domain';
import { exportProjectPackage, importProjectPackage } from './projectPackage';
import { blobToUint8Array } from './blob';

describe('.waterclip 项目包', () => {
  it('往返保存项目和二进制资产且排除 API Key', async () => {
    const project = {
      schemaVersion: 1,
      id: 'project',
      name: '合奏',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      shotGroups: [],
      apiKey: '绝不能导出'
    } as Project & { apiKey: string };
    const asset: BinaryAsset = {
      id: 'score', projectId: 'project', kind: 'score-original', filename: '乐谱.musicxml',
      mimeType: 'application/xml', blob: new Blob(['<score/>'])
    };
    const blob = await exportProjectPackage(project, [asset]);
    const files = unzipSync(await blobToUint8Array(blob));
    expect(strFromU8(files['project.json'])).not.toContain('绝不能导出');
    const restored = await importProjectPackage(blob);
    expect(restored.project).toMatchObject({ id: 'project', name: '合奏' });
    expect(new TextDecoder().decode(await blobToUint8Array(restored.assets[0].blob))).toBe('<score/>');
  });

  it('拒绝无效压缩包', async () => {
    await expect(importProjectPackage(new Blob(['nope']))).rejects.toThrow('无法解压');
  });
});
