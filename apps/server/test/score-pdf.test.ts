import { describe, expect, it, vi } from 'vitest';
import { access, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { exportAnnotatedScorePdf, overlayStoryboardAnnotations, parseMeasurePositions } from '../src/score-pdf.js';

const mpos = `<?xml version="1.0"?><score><elements>
  <element id="0" x="10000" y="12000" sx="60000" sy="100000" page="0"></element>
  <element id="1" x="70000" y="12000" sx="60000" sy="100000" page="0"></element>
</elements></score>`;

async function blankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([700, 800]);
  return pdf.save();
}

describe('MuseScore PDF 分镜叠加', () => {
  it('解析 mpos 为一基视觉小节和分页矩形', () => {
    expect(parseMeasurePositions(mpos)).toEqual([
      { measure: 1, page: 0, x: 10000, y: 12000, width: 60000, height: 100000 },
      { measure: 2, page: 0, x: 70000, y: 12000, width: 60000, height: 100000 },
    ]);
  });

  it('保留 MuseScore PDF 页面并写入分声部标记', async () => {
    const source = await blankPdf();
    const result = await overlayStoryboardAnnotations(source, mpos,
      [{ id: 'track-0', staffCount: 1 }, { id: 'track-1', staffCount: 1 }],
      [{ partId: 'track-1', startMeasure: 1, endMeasure: 2, size: 'CU', description: 'hands' }]);
    const loaded = await PDFDocument.load(result);
    expect(loaded.getPageCount()).toBe(1);
    expect(result.length).toBeGreaterThan(source.length);
    expect(loaded.getPage(0).getCropBox().width).toBeLessThan(700);
  });

  it('在受控临时目录中生成 PDF 与 mpos 并在完成后清理', async () => {
    let workspace = '';
    const execImpl = vi.fn(async (_command, args, options) => {
      workspace = String(options?.cwd);
      const output = String(args[args.indexOf('-o') + 1]);
      await writeFile(output, output.endsWith('.pdf') ? await blankPdf() : mpos);
      return { stdout: '', stderr: '' };
    }) as never;
    const result = await exportAnnotatedScorePdf({
      bytes: Buffer.from('<score-partwise/>'), filename: 'demo.musicxml', museScorePath: 'MuseScore4',
      parts: [{ id: 'track-0', staffCount: 1 }], annotations: [], execImpl,
    });
    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    expect(execImpl).toHaveBeenCalledTimes(2);
    await expect(access(workspace)).rejects.toThrow();
  });
});
