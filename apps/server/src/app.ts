import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { extname } from 'node:path';
import { existsSync } from 'node:fs';
import { convertMsczToMusicXml, detectMuseScore, type MuseScoreInfo } from './musescore.js';
import { proxyImageGeneration, type ImageGenerateInput } from './image-proxy.js';

const MAX_SCORE_BYTES = 50 * 1024 * 1024;
const PASSTHROUGH_EXTENSIONS = new Set(['.musicxml', '.xml', '.mxl']);

export interface AppDependencies {
  detectMuseScore?: (preferredPath?: string) => Promise<MuseScoreInfo | null>;
  convertMscz?: typeof convertMsczToMusicXml;
  fetchImpl?: typeof fetch;
  imageTimeoutMs?: number;
  staticRoot?: string;
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
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_SCORE_BYTES, fields: 4 },
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
      throw clientError('MuseScore 转换失败或超时，请检查乐谱文件', 422);
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
