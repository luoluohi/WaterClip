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

  it('只保存分镜实际引用的图片资产', async () => {
    const project: Project = {
      schemaVersion: 1,
      id: 'project',
      name: '合奏',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      shotGroups: [{
        id: 'group', createdAt: '2026-01-01', range: { startMeasure: 1, endMeasure: 1, occurrence: 1 },
        layout: { kind: 'single' }, slotOrder: ['shot'],
        shots: [{ id: 'shot', partId: 'violin', partName: '小提琴', size: '近景', description: '', imageAssetId: 'used', generationStatus: 'idle' }]
      }]
    };
    const image = (id: string): BinaryAsset => ({
      id, projectId: 'project', kind: 'generated-image', filename: `${id}.png`, mimeType: 'image/png', blob: new Blob(['image'])
    });
    const blob = await exportProjectPackage(project, [image('used'), image('orphan')]);
    const files = unzipSync(await blobToUint8Array(blob));
    expect(Object.keys(files).some((name) => name.includes('used'))).toBe(true);
    expect(Object.keys(files).some((name) => name.includes('orphan'))).toBe(false);
  });
});
