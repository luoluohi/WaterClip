import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { extname } from 'node:path';
import { existsSync } from 'node:fs';
import { convertMsczToMusicXml, detectMuseScore, ScoreConversionError, type MuseScoreInfo } from './musescore.js';
import { proxyImageGeneration, type ImageGenerateInput } from './image-proxy.js';
import { proxyPromptEnhancement, type PromptEnhanceInput } from './llm-proxy.js';
import { exportAnnotatedScorePdf, ScorePdfError, type PdfScorePart, type PdfShotAnnotation } from './score-pdf.js';

const MAX_SCORE_BYTES = 50 * 1024 * 1024;
const PASSTHROUGH_EXTENSIONS = new Set(['.musicxml', '.xml', '.mxl']);

export interface AppDependencies {
  detectMuseScore?: (preferredPath?: string) => Promise<MuseScoreInfo | null>;
  convertMscz?: typeof convertMsczToMusicXml;
  fetchImpl?: typeof fetch;
  imageTimeoutMs?: number;
  llmTimeoutMs?: number;
  exportScorePdf?: typeof exportAnnotatedScorePdf;
  staticRoot?: string;
  /** Additional browser origins accepted during development or embedding. */
  allowedOrigins?: string[];
}

function clientError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function requestedMuseScorePath(query: unknown): string | undefined {
  if (!query || typeof query !== 'object') return undefined;
  const value = (query as { museScorePath?: unknown }).museScorePath;
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2_048) throw clientError('MuseScore 路径无效');
  return value;
}

export async function buildApp(deps: AppDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: MAX_SCORE_BYTES + 1024 * 1024 });
  const allowedOrigins = new Set(deps.allowedOrigins ?? []);
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin) return;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return reply.code(403).send({ error: '拒绝未知来源的本地服务请求' });
    }
    if (originHost !== request.headers.host && !allowedOrigins.has(origin)) {
      return reply.code(403).send({ error: '拒绝未知来源的本地服务请求' });
    }
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_SCORE_BYTES, fields: 4, fieldSize: 2 * 1024 * 1024 },
  });

  app.get<{ Querystring: { museScorePath?: string } }>('/api/health', async (request) => {
    const preferredPath = requestedMuseScorePath(request.query);
    const museScore = await (deps.detectMuseScore ?? detectMuseScore)(preferredPath);
    return {
      ok: true,
      museScore: museScore
        ? { available: true, path: museScore.path, version: museScore.version, canConvertMscz: true }
        : { available: false, path: null, version: null, canConvertMscz: false },
    };
  });

  app.post<{ Querystring: { museScorePath?: string } }>('/api/scores/convert', async (request, reply) => {
    let part;
    try {
      part = await request.file();
    } catch (error) {
      throw clientError(error instanceof Error && error.message.includes('File too large') ? '乐谱文件不能超过 50 MB' : '无法读取上传文件', 413);
    }
    if (!part) throw clientError('请选择乐谱文件');

    let bytes: Buffer;
    try {
      bytes = await part.toBuffer();
    } catch {
      throw clientError('乐谱文件不能超过 50 MB', 413);
    }
    const extension = extname(part.filename).toLowerCase();
    if (PASSTHROUGH_EXTENSIONS.has(extension)) {
      return reply.type(extension === '.mxl' ? 'application/vnd.recordare.musicxml' : 'application/vnd.recordare.musicxml+xml').send(bytes);
    }
    if (extension !== '.mscz') throw clientError('仅支持 .mscz、.musicxml、.xml 或 .mxl 乐谱');

    const preferredPath = requestedMuseScorePath(request.query);
    const museScore = await (deps.detectMuseScore ?? detectMuseScore)(preferredPath);
    if (!museScore) {
      throw clientError(preferredPath
        ? '设置中的 MuseScore 路径无效，或该程序不是 MuseScore Studio 4'
        : '未找到 MuseScore Studio 4，请在设置面板中填写可执行文件路径', 503);
    }
    try {
      const converted = await (deps.convertMscz ?? convertMsczToMusicXml)({
        bytes,
        filename: part.filename,
        museScorePath: museScore.path,
      });
      return reply.type('application/vnd.recordare.musicxml+xml').send(converted);
    } catch (error) {
      request.log.warn({ err: error }, 'MuseScore conversion failed');
      if (error instanceof ScoreConversionError) {
        if (error.reason === 'timeout') throw clientError('MuseScore 转换超时，请稍后重试', 504);
        if (error.reason === 'invalid-output') throw clientError('乐谱无法转换为有效的 MusicXML，请检查文件是否损坏', 422);
      }
      throw clientError('MuseScore 转换进程异常，请稍后重试', 502);
    }
  });

  app.post<{ Body: ImageGenerateInput }>('/api/images/generate', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') throw clientError('请求内容无效');
    try {
      const result = await proxyImageGeneration(body, {
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.imageTimeoutMs,
      });
      return reply.code(result.status).type(result.contentType).send(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '图像生成失败';
      if (error instanceof Error && error.name === 'AbortError') throw clientError('图像服务请求超时', 504);
      if (/Base URL|API Key|提示词|参考图/.test(message)) throw clientError(message);
      request.log.warn({ err: error }, 'Image proxy failed');
      throw clientError('无法连接图像服务', 502);
    }
  });

  app.post<{ Querystring: { museScorePath?: string } }>('/api/scores/export-pdf', async (request, reply) => {
    const part = await request.file();
    if (!part) throw clientError('请选择乐谱文件');
    let bytes: Buffer;
    try {
      bytes = await part.toBuffer();
    } catch {
      throw clientError('乐谱文件不能超过 50 MB', 413);
    }
    const fieldValue = (name: string): string => {
      const field = part.fields[name] as { value?: unknown } | undefined;
      if (!field || typeof field.value !== 'string') throw clientError(`缺少 ${name} 数据`);
      return field.value;
    };
    let parts: PdfScorePart[];
    let annotations: PdfShotAnnotation[];
    try {
      parts = JSON.parse(fieldValue('parts')) as PdfScorePart[];
      annotations = JSON.parse(fieldValue('annotations')) as PdfShotAnnotation[];
      if (!Array.isArray(parts) || !Array.isArray(annotations)) throw new Error('invalid');
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error;
      throw clientError('PDF 分镜数据无效');
    }
    const preferredPath = requestedMuseScorePath(request.query);
    const museScore = await (deps.detectMuseScore ?? detectMuseScore)(preferredPath);
    if (!museScore) throw clientError('未找到有效的 MuseScore Studio 4，请先检查设置中的路径', 503);
    try {
      const pdf = await (deps.exportScorePdf ?? exportAnnotatedScorePdf)({
        bytes, filename: part.filename, museScorePath: museScore.path, parts, annotations,
      });
      return reply.type('application/pdf').header('Content-Disposition', 'attachment; filename="waterclip-score.pdf"').send(pdf);
    } catch (error) {
      if (error instanceof ScorePdfError) {
        if (error.reason === 'timeout') throw clientError('MuseScore PDF 导出超时，请稍后重试', 504);
        if (error.reason === 'invalid-output') throw clientError('MuseScore 未生成有效 PDF，请检查乐谱', 422);
      }
      const message = error instanceof Error ? error.message : '';
      if (/声部数据|分镜标记|小节范围/.test(message)) throw clientError(message);
      request.log.warn({ err: error }, 'MuseScore PDF export failed');
      throw clientError('MuseScore PDF 导出进程异常，请稍后重试', 502);
    }
  });

  app.post<{ Body: PromptEnhanceInput }>('/api/prompts/enhance', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') throw clientError('请求内容无效');
    try {
      const result = await proxyPromptEnhancement(body, {
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.llmTimeoutMs,
      });
      return reply.code(result.status).type(result.contentType).send(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '提示词生成失败';
      if (error instanceof Error && error.name === 'AbortError') throw clientError('LLM 服务请求超时', 504);
      if (/Base URL|API Key|提示词长度|模型名称/.test(message)) throw clientError(message);
      request.log.warn({ err: error }, 'LLM proxy failed');
      throw clientError(message === 'LLM 服务未返回提示词' ? message : '无法连接 LLM 服务', 502);
    }
  });

  if (deps.staticRoot && existsSync(deps.staticRoot)) {
    await app.register(staticPlugin, { root: deps.staticRoot, wildcard: false });
    app.get('/*', async (request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: '接口不存在' });
      return reply.sendFile('index.html');
    });
  }

  app.setErrorHandler((error: unknown, _request, reply) => {
    const known = error as { statusCode?: number; message?: string };
    const status = typeof known.statusCode === 'number' && known.statusCode >= 400 ? known.statusCode : 500;
    reply.code(status).send({ error: known.message || '服务器错误' });
  });
  return app;
}
