import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname, join } from 'node:path';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
// MuseScore's mpos coordinates are written at 200 units per PDF point.
// The same coordinates divided by 12 address its SVG viewBox.
const MPOS_UNITS_PER_POINT = 200;

export interface PdfScorePart {
  id: string;
  staffCount: number;
}

export interface PdfShotAnnotation {
  partId: string;
  startMeasure: number;
  endMeasure: number;
  size: string;
  description: string;
}

export interface ScorePdfInput {
  bytes: Buffer;
  filename: string;
  museScorePath: string;
  parts: PdfScorePart[];
  annotations: PdfShotAnnotation[];
  timeoutMs?: number;
  execImpl?: typeof execFileAsync;
  fontBytes?: Uint8Array;
}

export type ScorePdfFailure = 'invalid-output' | 'process-failed' | 'timeout';

export class ScorePdfError extends Error {
  constructor(public readonly reason: ScorePdfFailure, options?: ErrorOptions) {
    super(`MuseScore PDF export ${reason}`, options);
    this.name = 'ScorePdfError';
  }
}

export interface MeasurePosition {
  measure: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseMeasurePositions(xml: string): MeasurePosition[] {
  const positions: MeasurePosition[] = [];
  const element = /<element\s+([^>]+)>/g;
  const attribute = /(id|x|y|sx|sy|page)="([^"]+)"/g;
  for (const match of xml.matchAll(element)) {
    const values = new Map<string, number>();
    for (const item of match[1].matchAll(attribute)) values.set(item[1], Number(item[2]));
    const required = ['id', 'x', 'y', 'sx', 'sy', 'page'];
    if (!required.every((key) => Number.isFinite(values.get(key)))) continue;
    positions.push({
      measure: values.get('id')! + 1,
      page: values.get('page')!,
      x: values.get('x')!,
      y: values.get('y')!,
      width: values.get('sx')!,
      height: values.get('sy')!,
    });
  }
  return positions;
}

function validateParts(parts: PdfScorePart[]): PdfScorePart[] {
  const clean = parts.filter((part) => typeof part.id === 'string' && part.id.length <= 256 && Number.isInteger(part.staffCount) && part.staffCount >= 1 && part.staffCount <= 16);
  if (!clean.length || clean.length !== parts.length || clean.length > 128) throw new Error('声部数据无效');
  return clean;
}

function validateAnnotations(annotations: PdfShotAnnotation[]): PdfShotAnnotation[] {
  if (annotations.length > 20_000) throw new Error('分镜标记过多');
  return annotations.map((item) => {
    if (!item || typeof item.partId !== 'string' || typeof item.size !== 'string' || typeof item.description !== 'string') throw new Error('分镜标记无效');
    if (!Number.isInteger(item.startMeasure) || !Number.isInteger(item.endMeasure) || item.startMeasure < 1 || item.endMeasure < item.startMeasure || item.endMeasure > 100_000) throw new Error('分镜小节范围无效');
    return { ...item, size: item.size.slice(0, 32), description: item.description.trim().slice(0, 500) };
  });
}

async function findCjkFont(): Promise<Uint8Array | undefined> {
  const candidates = process.platform === 'win32'
    ? ['C:\\Windows\\Fonts\\simhei.ttf']
    : ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf'];
  for (const path of candidates) {
    try {
      await access(path, constants.R_OK);
      return new Uint8Array(await readFile(path));
    } catch { /* try next font */ }
  }
  return undefined;
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (!text) return '';
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${text.slice(0, middle)}…`, size) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return low ? `${text.slice(0, low)}…` : '';
}

function asciiFallback(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '?');
}

export async function overlayStoryboardAnnotations(
  pdfBytes: Uint8Array,
  mposXml: string,
  rawParts: PdfScorePart[],
  rawAnnotations: PdfShotAnnotation[],
  providedFont?: Uint8Array,
): Promise<Buffer> {
  const parts = validateParts(rawParts);
  const annotations = validateAnnotations(rawAnnotations);
  const positions = parseMeasurePositions(mposXml);
  if (!positions.length) throw new ScorePdfError('invalid-output');
  const pdf = await PDFDocument.load(pdfBytes);
  if (!pdf.getPageCount()) throw new ScorePdfError('invalid-output');

  const fontBytes = providedFont ?? await findCjkFont();
  let font: PDFFont;
  let supportsUnicode = false;
  if (fontBytes) {
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(fontBytes, { subset: true });
    supportsUnicode = true;
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  const totalStaves = parts.reduce((sum, part) => sum + part.staffCount, 0);
  const staffOffsets = new Map<string, { start: number; count: number }>();
  let staffCursor = 0;
  for (const part of parts) {
    staffOffsets.set(part.id, { start: staffCursor, count: part.staffCount });
    staffCursor += part.staffCount;
  }

  const grouped = new Map<string, PdfShotAnnotation[]>();
  for (const annotation of annotations) {
    if (!staffOffsets.has(annotation.partId)) continue;
    for (let measure = annotation.startMeasure; measure <= annotation.endMeasure; measure += 1) {
      const key = `${annotation.partId}\0${measure}`;
      grouped.set(key, [...(grouped.get(key) ?? []), annotation]);
    }
  }

  for (const position of positions) {
    if (!Number.isInteger(position.page) || position.page < 0 || position.page >= pdf.getPageCount()) continue;
    const page = pdf.getPage(position.page);
    for (const part of parts) {
      const marks = grouped.get(`${part.id}\0${position.measure}`);
      if (!marks?.length) continue;
      const band = staffOffsets.get(part.id)!;
      const x = position.x / MPOS_UNITS_PER_POINT;
      const width = position.width / MPOS_UNITS_PER_POINT;
      const systemTop = position.y / MPOS_UNITS_PER_POINT;
      const systemHeight = position.height / MPOS_UNITS_PER_POINT;
      const bandTop = systemTop + systemHeight * band.start / totalStaves;
      const height = Math.max(4, systemHeight * band.count / totalStaves);
      const y = page.getHeight() - bandTop - height;
      page.drawRectangle({ x, y, width, height, color: rgb(0.545, 0.361, 0.784), opacity: 0.3 });
      const label = marks.map((mark) => `${mark.size}${mark.description ? ` · ${mark.description}` : ''}`).join(' / ');
      const safeLabel = supportsUnicode ? label : asciiFallback(label);
      const fontSize = Math.max(3.2, Math.min(5.5, height * 0.48));
      const fitted = fitText(font, safeLabel, fontSize, Math.max(1, width - 3));
      if (fitted) page.drawText(fitted, { x: x + 1.5, y: y + Math.max(0.7, (height - fontSize) / 2), size: fontSize, font, color: rgb(0.19, 0.08, 0.27), opacity: 0.92 });
    }
  }

  // Crop only pages whose engraved content leaves a genuinely large margin.
  for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex += 1) {
    const page = pdf.getPage(pageIndex);
    const pagePositions = positions.filter((item) => item.page === pageIndex);
    if (!pagePositions.length) continue;
    const minX = Math.min(...pagePositions.map((item) => item.x / MPOS_UNITS_PER_POINT));
    const maxX = Math.max(...pagePositions.map((item) => (item.x + item.width) / MPOS_UNITS_PER_POINT));
    const minTop = Math.min(...pagePositions.map((item) => item.y / MPOS_UNITS_PER_POINT));
    const maxBottomFromTop = Math.max(...pagePositions.map((item) => (item.y + item.height) / MPOS_UNITS_PER_POINT));
    const margin = 18;
    const left = Math.max(0, minX - margin);
    const right = Math.min(page.getWidth(), maxX + margin);
    const bottom = Math.max(0, page.getHeight() - maxBottomFromTop - margin);
    const top = Math.min(page.getHeight(), page.getHeight() - minTop + margin);
    const cropWidth = right - left;
    const cropHeight = top - bottom;
    if (cropWidth < page.getWidth() * 0.75 || cropHeight < page.getHeight() * 0.75) {
      page.setCropBox(left, bottom, cropWidth, cropHeight);
    }
  }

  return Buffer.from(await pdf.save());
}

export async function exportAnnotatedScorePdf({
  bytes,
  filename,
  museScorePath,
  parts,
  annotations,
  timeoutMs = 60_000,
  execImpl = execFileAsync,
  fontBytes,
}: ScorePdfInput): Promise<Buffer> {
  const workspace = await mkdtemp(join(tmpdir(), 'waterclip-pdf-'));
  const stem = basename(filename, extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'score';
  const extension = ['.mscz', '.musicxml', '.xml', '.mxl'].includes(extname(filename).toLowerCase()) ? extname(filename).toLowerCase() : '.musicxml';
  const inputPath = join(workspace, `${stem}${extension}`);
  const pdfPath = join(workspace, `${stem}.pdf`);
  const mposPath = join(workspace, `${stem}.mpos`);
  const stylePath = join(workspace, 'waterclip-export.mss');
  try {
    await writeFile(inputPath, bytes, { flag: 'wx' });
    // Fixed staff visibility keeps part-to-band mapping deterministic across pages.
    await writeFile(stylePath, '<?xml version="1.0" encoding="UTF-8"?><museScore version="4.70"><Style><hideEmptyStaves>0</hideEmptyStaves></Style></museScore>', { flag: 'wx' });
    try {
      await execImpl(museScorePath, ['-S', stylePath, '-o', pdfPath, inputPath], { cwd: workspace, timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
      await execImpl(museScorePath, ['-S', stylePath, '-o', mposPath, inputPath], { cwd: workspace, timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
    } catch (error) {
      const processError = error as { killed?: boolean; code?: unknown };
      if (processError.killed || processError.code === 'ETIMEDOUT') throw new ScorePdfError('timeout', { cause: error });
      throw new ScorePdfError('process-failed', { cause: error });
    }
    const [pdfBytes, mposBytes] = await Promise.all([readFile(pdfPath), readFile(mposPath)]);
    if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !mposBytes.includes(Buffer.from('<score>'))) throw new ScorePdfError('invalid-output');
    return overlayStoryboardAnnotations(pdfBytes, mposBytes.toString('utf8'), parts, annotations, fontBytes);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
