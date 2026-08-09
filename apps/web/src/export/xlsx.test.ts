import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { BinaryAsset, Project, ScorePart } from '../domain';
import { createShotGroup } from '../domain';
import { createShotListWorkbook, exportShotListXlsx } from './xlsx';
import { blobToUint8Array } from '../data/blob';

const part: ScorePart = { id: 'violin', name: '小提琴', staffIds: ['staff'], playbackTrackIds: [0] };

describe('XLSX 分镜导出', () => {
  it('严格输出五列，每个子镜头一行，并嵌入支持的图片', async () => {
    const idValues = ['shot', 'group'];
    const group = createShotGroup([part], { startMeasure: 1, endMeasure: 2, occurrence: 1 }, {
      idFactory: () => idValues.shift()!, now: '2026-01-01', size: '近景', description: '左手换把'
    });
    group.layout = { kind: 'horizontal', cells: 2 };
    group.shots[0].imageAssetId = 'image';
    const project: Project = { schemaVersion: 1, id: 'project', name: '合奏', createdAt: '', updatedAt: '', shotGroups: [group] };
    // Valid 1×1 transparent PNG.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (char) => char.charCodeAt(0));
    const asset: BinaryAsset = { id: 'image', projectId: 'project', kind: 'generated-image', filename: 'shot.png', mimeType: 'image/png', blob: new Blob([png]) };
    const exported = await exportShotListXlsx(project, { assets: [asset] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await blobToUint8Array(exported)).buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet('分镜总表')!;
    expect(sheet.columnCount).toBe(5);
    expect(sheet.getRow(1).values).toEqual([, '分镜序号', '乐器/声部', '景别', '描述', '示意图']);
    expect(sheet.getRow(2).values).toEqual([, 1, '小提琴', '近景', '左手换把', '']);
    expect(sheet.getImages()).toHaveLength(1);
  });

  it('缺图时保留空单元格且不导出分屏属性', async () => {
    const idValues = ['shot', 'group'];
    const group = createShotGroup([part], { startMeasure: 1, endMeasure: 1, occurrence: 1 }, { idFactory: () => idValues.shift()! });
    const project: Project = { schemaVersion: 1, id: 'project', name: 'P', createdAt: '', updatedAt: '', shotGroups: [group] };
    const workbook = await createShotListWorkbook(project);
    const sheet = workbook.getWorksheet('分镜总表')!;
    expect(sheet.getRow(2).getCell(5).value).toBe('');
    expect(sheet.getRow(1).values).not.toContain('分屏');
  });
});
