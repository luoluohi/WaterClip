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

/** Produces the performer-facing, five-column workbook. Split-screen layout is intentionally omitted. */
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
    { header: '乐器/声部', key: 'part', width: 24 },
    { header: '景别', key: 'size', width: 12 },
    { header: '描述', key: 'description', width: 48 },
    { header: '示意图', key: 'image', width: 30 }
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF324757' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.autoFilter = 'A1:E1';

  const rows = sortedShotRows(project, options.occurrences);
  for (let index = 0; index < rows.length; index += 1) {
    const { shot } = rows[index];
    const row = sheet.addRow({
      number: index + 1,
      part: shot.partName,
      size: shot.size,
      description: shot.description,
      image: ''
    });
    row.alignment = { vertical: 'middle', wrapText: true };
    if (!shot.imageAssetId) continue;
    const asset = await resolveImage(shot.imageAssetId, options);
    const extension = asset && imageExtension(asset.mimeType);
    if (!asset || !extension) continue;
    const base64 = bytesToBase64(await blobToUint8Array(asset.blob));
    const imageId = workbook.addImage({ base64: `data:${asset.mimeType};base64,${base64}`, extension });
    row.height = 90;
    sheet.addImage(imageId, {
      tl: { col: 4.08, row: row.number - 0.92 },
      ext: { width: 192, height: 108 },
      editAs: 'oneCell'
    });
  }
  return workbook;
}

export async function exportShotListXlsx(project: Project, options: XlsxExportOptions = {}): Promise<Blob> {
  const workbook = await createShotListWorkbook(project, options);
  const output = await workbook.xlsx.writeBuffer();
  // Copy into a plain Uint8Array so DOM Blob typing never receives a SharedArrayBuffer-backed view.
  return new Blob([new Uint8Array(output)], { type: XLSX_MIME });
}
