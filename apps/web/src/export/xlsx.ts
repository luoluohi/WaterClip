import ExcelJS from 'exceljs';
import type { BinaryAsset, Project, TimelineOccurrence } from '../domain';
import { sortedShotRows } from '../domain';
import { blobToUint8Array } from '../data/blob';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxExportOptions {
  occurrences?: readonly TimelineOccurrence[];
  assets?: readonly BinaryAsset[];
  resolveAsset?: (assetId: string) => Promise<BinaryAsset | undefined>;
}

function imageExtension(mimeType: string): 'png' | 'jpeg' | undefined {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpeg';
  return undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function resolveImage(assetId: string, options: XlsxExportOptions): Promise<BinaryAsset | undefined> {
  const local = options.assets?.find((asset) => asset.id === assetId);
  return local ?? options.resolveAsset?.(assetId);
}

async function prepareXlsxImage(asset: BinaryAsset): Promise<{ bytes: Uint8Array; mimeType: string; extension: 'png' | 'jpeg' } | undefined> {
  const originalExtension = imageExtension(asset.mimeType);
  const originalBytes = await blobToUint8Array(asset.blob);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(asset.blob);
    if (bitmap.width <= 384 && bitmap.height <= 216 && originalExtension) {
      return { bytes: originalBytes, mimeType: asset.mimeType, extension: originalExtension };
    }
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 216;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return originalExtension ? { bytes: originalBytes, mimeType: asset.mimeType, extension: originalExtension } : undefined;
    const scale = Math.max(384 / bitmap.width, 216 / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 384, 216);
    context.drawImage(bitmap, (384 - width) / 2, (216 - height) / 2, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.76));
    if (!jpeg || (jpeg.size >= asset.blob.size && originalExtension)) {
      return originalExtension ? { bytes: originalBytes, mimeType: asset.mimeType, extension: originalExtension } : undefined;
    }
    return { bytes: await blobToUint8Array(jpeg), mimeType: 'image/jpeg', extension: 'jpeg' };
  } catch {
    return originalExtension ? { bytes: originalBytes, mimeType: asset.mimeType, extension: originalExtension } : undefined;
  } finally {
    bitmap?.close();
  }
}

/** Produces the performer-facing workbook. Split-screen layout is intentionally omitted. */
export async function createShotListWorkbook(project: Project, options: XlsxExportOptions = {}): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WaterClip';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('分镜总表', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 }
  });
  sheet.columns = [
    { header: '分镜序号', key: 'number', width: 12 },
    { header: '录制小节', key: 'measures', width: 24 },
    { header: '乐器/声部', key: 'part', width: 24 },
    { header: '景别', key: 'size', width: 12 },
    { header: '描述', key: 'description', width: 48 },
    { header: '示意图', key: 'image', width: 30 }
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF324757' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.autoFilter = 'A1:F1';

  const rows = sortedShotRows(project, options.occurrences);
  let rowIndex = 0;
  let sequence = 0;
  const imageCache = new Map<string, number>();
  while (rowIndex < rows.length) {
    const first = rows[rowIndex];
    let groupEnd = rowIndex + 1;
    while (groupEnd < rows.length && rows[groupEnd].group.id === first.group.id &&
      rows[groupEnd].occurrence === first.occurrence && rows[groupEnd].timelineOrder === first.timelineOrder) groupEnd += 1;
    sequence += 1;
    const startMeasure = first.group.range.startMeasure;
    const endMeasure = first.group.range.endMeasure;
    const measureCount = endMeasure - startMeasure + 1;
    const measureLabel = `M.${startMeasure}${endMeasure === startMeasure ? '' : `-${endMeasure}`}（${measureCount} 小节）`;
    for (let index = rowIndex; index < groupEnd; index += 1) {
      const { shot } = rows[index];
      const row = sheet.addRow({
        number: index === rowIndex ? sequence : '',
        measures: index === rowIndex ? measureLabel : '',
        part: shot.partName,
        size: shot.size,
        description: shot.description,
        image: ''
      });
      row.alignment = { vertical: 'middle', wrapText: true };
      if (!shot.imageAssetId) continue;
      let imageId = imageCache.get(shot.imageAssetId);
      if (imageId === undefined) {
        const asset = await resolveImage(shot.imageAssetId, options);
        const prepared = asset && await prepareXlsxImage(asset);
        if (!prepared) continue;
        const base64 = bytesToBase64(prepared.bytes);
        imageId = workbook.addImage({ base64: `data:${prepared.mimeType};base64,${base64}`, extension: prepared.extension });
        imageCache.set(shot.imageAssetId, imageId);
      }
      row.height = 90;
      sheet.addImage(imageId, {
        tl: { col: 5.08, row: row.number - 0.92 },
        ext: { width: 192, height: 108 },
        editAs: 'oneCell'
      });
    }
    if (groupEnd - rowIndex > 1) {
      sheet.mergeCells(rowIndex + 2, 1, groupEnd + 1, 1);
      sheet.mergeCells(rowIndex + 2, 2, groupEnd + 1, 2);
    }
    rowIndex = groupEnd;
  }
  return workbook;
}

export async function exportShotListXlsx(project: Project, options: XlsxExportOptions = {}): Promise<Blob> {
  const workbook = await createShotListWorkbook(project, options);
  const output = await workbook.xlsx.writeBuffer();
  // Copy into a plain Uint8Array so DOM Blob typing never receives a SharedArrayBuffer-backed view.
  return new Blob([new Uint8Array(output)], { type: XLSX_MIME });
}
