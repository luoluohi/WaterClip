// The implementation is shared with the tested portable release build.
// @ts-nocheck
import fontkit from '@pdf-lib/fontkit';
import iconv from 'iconv-lite';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname, join } from 'node:path';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
const execFileAsync = promisify(execFile);
// MuseScore's mpos coordinates are written at 200 units per PDF point.
// The same coordinates divided by 12 address its SVG viewBox.
const MPOS_UNITS_PER_POINT = 200;
export interface PdfScorePart { id: string; name?: string; staffCount: number; }
export interface PdfShotAnnotation { partId: string; startMeasure: number; endMeasure: number; size: string; description: string; }
export interface ScorePdfInput { bytes: Buffer; filename: string; museScorePath: string; parts: PdfScorePart[]; annotations: PdfShotAnnotation[]; timeoutMs?: number; execImpl?: typeof execFileAsync; fontBytes?: Uint8Array; }
export type ScorePdfFailure = 'invalid-output' | 'process-failed' | 'timeout';
export class ScorePdfError extends Error {
    reason;
    constructor(reason, options) {
        super(`MuseScore PDF export ${reason}`, options);
        this.reason = reason;
        this.name = 'ScorePdfError';
    }
}
export function parseMeasurePositions(xml) {
    const positions = [];
    const element = /<element\s+([^>]+)>/g;
    const attribute = /(id|x|y|sx|sy|page)="([^"]+)"/g;
    for (const match of xml.matchAll(element)) {
        const values = new Map();
        for (const item of match[1].matchAll(attribute))
            values.set(item[1], Number(item[2]));
        const required = ['id', 'x', 'y', 'sx', 'sy', 'page'];
        if (!required.every((key) => Number.isFinite(values.get(key))))
            continue;
        positions.push({
            measure: values.get('id') + 1,
            page: values.get('page'),
            x: values.get('x'),
            y: values.get('y'),
            width: values.get('sx'),
            height: values.get('sy'),
        });
    }
    return positions;
}
function validateParts(parts) {
    const clean = parts.filter((part) => typeof part.id === 'string' && part.id.length <= 256 && (part.name === undefined || typeof part.name === 'string') && Number.isInteger(part.staffCount) && part.staffCount >= 1 && part.staffCount <= 16)
        .map((part) => ({ ...part, name: repairMojibake(part.name ?? '').slice(0, 256) }));
    if (!clean.length || clean.length !== parts.length || clean.length > 128)
        throw new Error('声部数据无效');
    return clean;
}
function validateAnnotations(annotations) {
    if (annotations.length > 20_000)
        throw new Error('分镜标记过多');
    return annotations.map((item) => {
        if (!item || typeof item.partId !== 'string' || typeof item.size !== 'string' || typeof item.description !== 'string')
            throw new Error('分镜标记无效');
        if (!Number.isInteger(item.startMeasure) || !Number.isInteger(item.endMeasure) || item.startMeasure < 1 || item.endMeasure < item.startMeasure || item.endMeasure > 100_000)
            throw new Error('分镜小节范围无效');
        return {
            ...item,
            size: repairMojibake(item.size).slice(0, 32),
            description: repairMojibake(item.description.trim()).slice(0, 500),
        };
    });
}
const MOJIBAKE_MARKERS = /[聽鈥鈾銆锛锟鐗瑰啓杩戞櫙鍐绠鎸鐞鏁]/g;
function repairMojibake(text) {
    const markerCount = text.match(MOJIBAKE_MARKERS)?.length ?? 0;
    if (markerCount < 1)
        return text;
    const repaired = iconv.decode(iconv.encode(text, 'gb18030'), 'utf8').replaceAll('\uFFFD', '');
    const repairedMarkerCount = repaired.match(MOJIBAKE_MARKERS)?.length ?? 0;
    return repairedMarkerCount < markerCount ? repaired : text;
}
function normalizedPartName(name) {
    return repairMojibake(name).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
function basePartName(name) {
    return normalizedPartName(name).replace(/\s*\d+$/, '');
}
function orderMsczParts(bytes, parts) {
    try {
        const archive = unzipSync(new Uint8Array(bytes));
        const scoreName = Object.keys(archive).find((name) => name.toLowerCase().endsWith('.mscx') && !name.includes('/'));
        if (!scoreName)
            return parts;
        const xml = new TextDecoder().decode(archive[scoreName]);
        const scoreHead = xml.slice(0, xml.search(/<Staff\s+id=/));
        const layoutNames = [...scoreHead.matchAll(/<Part\b[^>]*>([\s\S]*?)<\/Part>/g)].map((match) => {
            const body = match[1];
            return /<longName>([^<]*)<\/longName>/.exec(body)?.[1] ?? /<trackName>([^<]*)<\/trackName>/.exec(body)?.[1] ?? '';
        });
        const unused = [...parts];
        const ordered = [];
        for (const layoutName of layoutNames) {
            const exact = normalizedPartName(layoutName);
            const base = basePartName(layoutName);
            let index = unused.findIndex((part) => normalizedPartName(part.name) === exact);
            if (index < 0)
                index = unused.findIndex((part) => basePartName(part.name) === base);
            if (index >= 0)
                ordered.push(...unused.splice(index, 1));
        }
        return ordered.length ? [...ordered, ...unused] : parts;
    }
    catch {
        return parts;
    }
}
function parseSvgStaffLayout(svg) {
    const viewBox = /viewBox="[^"]*?([0-9.]+)\s+([0-9.]+)"/.exec(svg);
    if (!viewBox)
        return undefined;
    const rows = [...svg.matchAll(/class="StaffLines"[^>]*points="[^"]*?,([0-9.]+)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    const uniqueRows = [...new Set(rows)].sort((a, b) => a - b);
    if (!uniqueRows.length)
        return undefined;
    const smallGaps = uniqueRows.slice(1).map((row, index) => row - uniqueRows[index]).filter((gap) => gap > 0 && gap < 100).sort((a, b) => a - b);
    const lineGap = smallGaps[Math.floor(smallGaps.length / 2)] || 25;
    const groups = [];
    for (const row of uniqueRows) {
        const group = groups.at(-1);
        if (!group || row - group.at(-1) > lineGap * 1.6)
            groups.push([row]);
        else
            group.push(row);
    }
    return {
        width: Number(viewBox[1]),
        height: Number(viewBox[2]),
        staves: groups.map((group) => ({ top: group[0] - lineGap * 0.45, bottom: group.at(-1) + lineGap * 0.45 })),
    };
}
function mapPartBands(parts, staves) {
    const bands = new Map();
    let cursor = 0;
    for (let index = 0; index < parts.length && cursor < staves.length; index += 1) {
        const part = parts[index];
        const minimumAfter = parts.length - index - 1;
        const available = staves.length - cursor - minimumAfter;
        const count = Math.max(1, Math.min(part.staffCount, available));
        const assigned = staves.slice(cursor, cursor + count);
        bands.set(part.id, { top: assigned[0].top, bottom: assigned.at(-1).bottom });
        cursor += count;
    }
    return bands;
}
async function findCjkFont() {
    const candidates = process.platform === 'win32'
        ? ['C:\\Windows\\Fonts\\simhei.ttf']
        : ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf'];
    for (const path of candidates) {
        try {
            await access(path, constants.R_OK);
            return new Uint8Array(await readFile(path));
        }
        catch { /* try next font */ }
    }
    return undefined;
}
function fitText(font, text, size, maxWidth) {
    if (!text)
        return '';
    if (font.widthOfTextAtSize(text, size) <= maxWidth)
        return text;
    let low = 0;
    let high = text.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (font.widthOfTextAtSize(`${text.slice(0, middle)}…`, size) <= maxWidth)
            low = middle;
        else
            high = middle - 1;
    }
    return low ? `${text.slice(0, low)}…` : '';
}
function asciiFallback(text) {
    return text.replace(/[^\x20-\x7e]/g, '?');
}
export async function overlayStoryboardAnnotations(pdfBytes, mposXml, rawParts, rawAnnotations, providedFont, svgPages = []) {
    const parts = validateParts(rawParts);
    const annotations = validateAnnotations(rawAnnotations);
    const positions = parseMeasurePositions(mposXml);
    const svgLayouts = svgPages.map(parseSvgStaffLayout);
    const systemBandCache = new Map();
    if (!positions.length)
        throw new ScorePdfError('invalid-output');
    const pdf = await PDFDocument.load(pdfBytes);
    if (!pdf.getPageCount())
        throw new ScorePdfError('invalid-output');
    const fontBytes = providedFont ?? await findCjkFont();
    let font;
    let supportsUnicode = false;
    if (fontBytes) {
        pdf.registerFontkit(fontkit);
        font = await pdf.embedFont(fontBytes, { subset: true });
        supportsUnicode = true;
    }
    else {
        font = await pdf.embedFont(StandardFonts.Helvetica);
    }
    const totalStaves = parts.reduce((sum, part) => sum + part.staffCount, 0);
    const staffOffsets = new Map();
    let staffCursor = 0;
    for (const part of parts) {
        staffOffsets.set(part.id, { start: staffCursor, count: part.staffCount });
        staffCursor += part.staffCount;
    }
    const grouped = new Map();
    for (const annotation of annotations) {
        if (!staffOffsets.has(annotation.partId))
            continue;
        for (let measure = annotation.startMeasure; measure <= annotation.endMeasure; measure += 1) {
            const key = `${annotation.partId}\0${measure}`;
            grouped.set(key, [...(grouped.get(key) ?? []), annotation]);
        }
    }
    for (const position of positions) {
        if (!Number.isInteger(position.page) || position.page < 0 || position.page >= pdf.getPageCount())
            continue;
        const page = pdf.getPage(position.page);
        const pageBox = page.getCropBox();
        for (const part of parts) {
            const marks = grouped.get(`${part.id}\0${position.measure}`);
            if (!marks?.length)
                continue;
            const band = staffOffsets.get(part.id);
            const x = pageBox.x + position.x / MPOS_UNITS_PER_POINT;
            const width = position.width / MPOS_UNITS_PER_POINT;
            const systemTop = position.y / MPOS_UNITS_PER_POINT;
            const systemHeight = position.height / MPOS_UNITS_PER_POINT;
            const svgLayout = svgLayouts[position.page];
            const systemKey = `${position.page}:${position.y}:${position.height}`;
            let svgBands = systemBandCache.get(systemKey);
            if (!svgBands && svgLayout) {
                const svgSystemTop = position.y / 12;
                const svgSystemBottom = (position.y + position.height) / 12;
                const systemStaves = svgLayout.staves.filter((staff) => (staff.top + staff.bottom) / 2 >= svgSystemTop - 50 && (staff.top + staff.bottom) / 2 <= svgSystemBottom + 50);
                if (systemStaves.length) {
                    svgBands = mapPartBands(parts, systemStaves);
                    systemBandCache.set(systemKey, svgBands);
                }
            }
            const svgBand = svgBands?.get(part.id);
            const bandTop = svgBand && svgLayout ? svgBand.top * pageBox.height / svgLayout.height : systemTop + systemHeight * band.start / totalStaves;
            const height = svgBand && svgLayout ? Math.max(4, (svgBand.bottom - svgBand.top) * pageBox.height / svgLayout.height) : Math.max(4, systemHeight * band.count / totalStaves);
            const y = pageBox.y + pageBox.height - bandTop - height;
            page.drawRectangle({ x, y, width, height, color: rgb(0.545, 0.361, 0.784), opacity: 0.3 });
            const label = marks.map((mark) => `${mark.size}${mark.description ? ` · ${mark.description}` : ''}`).join(' / ');
            const safeLabel = supportsUnicode ? label : asciiFallback(label);
            const fontSize = Math.max(3.2, Math.min(5.5, height * 0.48));
            const fitted = fitText(font, safeLabel, fontSize, Math.max(1, width - 3));
            if (fitted)
                page.drawText(fitted, { x: x + 1.5, y: y + Math.max(0.7, (height - fontSize) / 2), size: fontSize, font, color: rgb(0.19, 0.08, 0.27), opacity: 0.92 });
        }
    }
    // Keep MuseScore's original page boxes. Per-page cropping made page sizes
    // inconsistent and shifted overlays because CropBox changes the visible
    // coordinate origin after the annotations have been drawn.
    return Buffer.from(await pdf.save());
}
export async function exportAnnotatedScorePdf(input: ScorePdfInput) {
    const { bytes, filename, museScorePath, parts, annotations, timeoutMs = 120_000, execImpl = execFileAsync, fontBytes } = input;
    const workspace = await mkdtemp(join(tmpdir(), 'waterclip-pdf-'));
    const stem = basename(filename, extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'score';
    const extension = ['.mscz', '.musicxml', '.xml', '.mxl'].includes(extname(filename).toLowerCase()) ? extname(filename).toLowerCase() : '.musicxml';
    const inputPath = join(workspace, `${stem}${extension}`);
    const pdfPath = join(workspace, `${stem}.pdf`);
    const mposPath = join(workspace, `${stem}.mpos`);
    const svgPath = join(workspace, `${stem}.svg`);
    const stylePath = join(workspace, 'waterclip-export.mss');
    try {
        await writeFile(inputPath, bytes, { flag: 'wx' });
        // Fixed staff visibility keeps part-to-band mapping deterministic across pages.
        await writeFile(stylePath, '<?xml version="1.0" encoding="UTF-8"?><museScore version="4.70"><Style><hideEmptyStaves>0</hideEmptyStaves><showHeader>1</showHeader><headerFirstPage>0</headerFirstPage><headerOddEven>1</headerOddEven><evenHeaderL>$p</evenHeaderL><evenHeaderC></evenHeaderC><evenHeaderR></evenHeaderR><oddHeaderL></oddHeaderL><oddHeaderC></oddHeaderC><oddHeaderR>$p</oddHeaderR></Style></museScore>', { flag: 'wx' });
        try {
            await execImpl(museScorePath, ['-S', stylePath, '-o', pdfPath, inputPath], { cwd: workspace, timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
            await execImpl(museScorePath, ['-S', stylePath, '-o', mposPath, inputPath], { cwd: workspace, timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
            await execImpl(museScorePath, ['-S', stylePath, '-o', svgPath, inputPath], { cwd: workspace, timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
        }
        catch (error) {
            const processError = error;
            if (processError.killed || processError.code === 'ETIMEDOUT')
                throw new ScorePdfError('timeout', { cause: error });
            throw new ScorePdfError('process-failed', { cause: error });
        }
        const [pdfBytes, mposBytes] = await Promise.all([readFile(pdfPath), readFile(mposPath)]);
        if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !mposBytes.includes(Buffer.from('<score>')))
            throw new ScorePdfError('invalid-output');
        const svgFiles = (await readdir(workspace)).filter((name) => name === `${stem}.svg` || new RegExp(`^${stem}-(\\d+)\\.svg$`).test(name)).sort((left, right) => {
            const pageNumber = (name) => Number(/-(\d+)\.svg$/.exec(name)?.[1] ?? 1);
            return pageNumber(left) - pageNumber(right);
        });
        const svgPages = await Promise.all(svgFiles.map((name) => readFile(join(workspace, name), 'utf8')));
        const orderedParts = extension === '.mscz' ? orderMsczParts(bytes, parts) : parts;
        return overlayStoryboardAnnotations(pdfBytes, mposBytes.toString('utf8'), orderedParts, annotations, fontBytes, svgPages);
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
}
