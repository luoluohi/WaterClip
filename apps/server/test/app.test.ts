import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { ScoreConversionError } from '../src/musescore.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apps: FastifyInstance[] = [];
const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function appFor(deps: Parameters<typeof buildApp>[0] = {}) {
  const app = await buildApp(deps);
  apps.push(app);
  return app;
}

function multipart(filename: string, contents: string | Buffer) {
  const boundary = '----waterclip-test-boundary';
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="score"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(prefix), Buffer.from(contents), Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('生产静态托管', () => {
  it('直达路由返回 SPA，未知 API 仍返回 404', async () => {
    const root = await mkdtemp(join(tmpdir(), 'waterclip-static-'));
    tempDirs.push(root);
    await writeFile(join(root, 'index.html'), '<main>WaterClip app</main>');
    const app = await appFor({ staticRoot: root });

    const page = await app.inject({ method: 'GET', url: '/storyboard/1' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('WaterClip app');

    const api = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(api.statusCode).toBe(404);
    expect(api.json().error).toContain('接口');
  });
});

describe('GET /api/health', () => {
  it('报告 MuseScore 的转换能力', async () => {
    const app = await appFor({
      detectMuseScore: async () => ({ path: 'C:\\MuseScore4.exe', version: 'MuseScore 4.6.2' }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      museScore: {
        available: true,
        path: 'C:\\MuseScore4.exe',
        version: 'MuseScore 4.6.2',
        canConvertMscz: true,
      },
    });
  });

  it('仅为当前请求校验设置面板传来的 MuseScore 路径', async () => {
    const detectMuseScore = vi.fn(async (preferredPath?: string) => preferredPath
      ? { path: preferredPath, version: 'MuseScore 4.7.4' }
      : null);
    const app = await appFor({ detectMuseScore });
    const path = 'C:\\Portable\\MuseScore4.exe';
    const response = await app.inject({
      method: 'GET',
      url: `/api/health?${new URLSearchParams({ museScorePath: path })}`,
    });

    expect(response.statusCode).toBe(200);
    expect(detectMuseScore).toHaveBeenCalledWith(path);
    expect(response.json().museScore).toMatchObject({ available: true, path });
  });
});

describe('POST /api/scores/convert', () => {
  it('MusicXML 文件无需调用 MuseScore 即可直返', async () => {
    const convertMscz = vi.fn();
    const app = await appFor({ convertMscz });
    const upload = multipart('乐谱.musicxml', '<score-partwise/>');
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...upload });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('<score-partwise/>');
    expect(convertMscz).not.toHaveBeenCalled();
  });

  it('mscz 使用探测到的可执行文件转换且不信任上传路径', async () => {
    const convertMscz = vi.fn(async () => Buffer.from('<converted/>'));
    const app = await appFor({
      detectMuseScore: async () => ({ path: 'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe', version: '4.6' }),
      convertMscz,
    });
    const upload = multipart('..\\..\\危险.mscz', 'binary score');
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...upload });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('<converted/>');
    expect(convertMscz).toHaveBeenCalledWith(expect.objectContaining({
      bytes: Buffer.from('binary score'),
      museScorePath: 'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe',
    }));
  });

  it('mscz 转换显式使用设置面板路径，不在服务端持久化', async () => {
    const path = 'C:\\Portable\\MuseScore4.exe';
    const detectMuseScore = vi.fn(async (preferredPath?: string) => preferredPath
      ? { path: preferredPath, version: 'MuseScore 4.7.4' }
      : null);
    const convertMscz = vi.fn(async () => Buffer.from('<converted/>'));
    const app = await appFor({ detectMuseScore, convertMscz });
    const upload = multipart('demo.mscz', 'score');
    const response = await app.inject({
      method: 'POST',
      url: `/api/scores/convert?${new URLSearchParams({ museScorePath: path })}`,
      ...upload,
    });

    expect(response.statusCode).toBe(200);
    expect(detectMuseScore).toHaveBeenCalledWith(path);
    expect(convertMscz).toHaveBeenCalledWith(expect.objectContaining({ museScorePath: path }));
  });

  it('拒绝设置面板中无效的 MuseScore 路径', async () => {
    const app = await appFor({ detectMuseScore: async () => null });
    const upload = multipart('demo.mscz', 'score');
    const response = await app.inject({
      method: 'POST',
      url: `/api/scores/convert?${new URLSearchParams({ museScorePath: 'C:\\Tools\\notepad.exe' })}`,
      ...upload,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain('路径无效');
  });

  it('缺少 MuseScore 时给出可操作错误', async () => {
    const app = await appFor({ detectMuseScore: async () => null });
    const upload = multipart('demo.mscz', 'score');
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...upload });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain('设置面板');
  });

  it('转换进程异常时返回可重试的502且不泄露内部错误', async () => {
    const app = await appFor({
      detectMuseScore: async () => ({ path: 'MuseScore4', version: '4.6' }),
      convertMscz: async () => { throw new Error('C:\\private\\temp\\secret.mscz'); },
    });
    const upload = multipart('demo.mscz', 'broken');
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...upload });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('private');
  });

  it('仅对确定的无效转换产物返回422', async () => {
    const app = await appFor({
      detectMuseScore: async () => ({ path: 'MuseScore4', version: '4.6' }),
      convertMscz: async () => { throw new ScoreConversionError('invalid-output'); },
    });
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...multipart('demo.mscz', 'broken') });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain('有效的 MusicXML');
  });

  it('转换超时使用504而不是误报为乐谱损坏', async () => {
    const app = await appFor({
      detectMuseScore: async () => ({ path: 'MuseScore4', version: '4.6' }),
      convertMscz: async () => { throw new ScoreConversionError('timeout'); },
    });
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...multipart('demo.mscz', 'score') });
    expect(response.statusCode).toBe(504);
    expect(response.json().error).toContain('超时');
  });

  it('拒绝未知扩展名', async () => {
    const app = await appFor();
    const upload = multipart('demo.zip', 'score');
    const response = await app.inject({ method: 'POST', url: '/api/scores/convert', ...upload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('仅支持');
  });
});

describe('POST /api/images/generate', () => {
  it('无参考图时使用固定模型参数调用 generations', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'gpt-image-2',
        prompt: '小提琴 特写 手部运弓',
        size: '1280x720',
        quality: 'medium',
        output_format: 'png',
      });
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      payload: { baseUrl: 'https://example.test/v1/', apiKey: 'secret', prompt: '小提琴 特写 手部运弓' },
    });
    expect(response.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/images/generations', expect.anything());
    expect(response.json().data[0].b64_json).toBe('abc');
  });

  it('有参考图时使用 multipart edits 且不把 key 放入请求正文', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get('model')).toBe('gpt-image-2');
      expect(form.get('size')).toBe('1280x720');
      expect(form.get('image')).toBeInstanceOf(Blob);
      expect([...form.values()].map(String).join(' ')).not.toContain('secret');
      return new Response('{"data":[]}');
    }) as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      payload: {
        baseUrl: 'https://example.test/v1',
        apiKey: 'secret',
        prompt: '钢琴 中景 演奏者侧面',
        referenceDataUrl: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/images/edits', expect.anything());
  });

  it('拒绝非 HTTP Base URL，且不会发出请求', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      payload: { baseUrl: 'file:///etc/passwd', apiKey: 'secret', prompt: '长笛 全景' },
    });
    expect(response.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('上游失败时保留上游状态码和响应', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"unauthorized"}}', {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      payload: { baseUrl: 'https://example.test/v1', apiKey: 'bad', prompt: '大提琴 近景' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe('unauthorized');
  });

  it('超时会中止上游请求并返回 504', async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    const app = await appFor({ fetchImpl, imageTimeoutMs: 5 });
    const response = await app.inject({
      method: 'POST',
      url: '/api/images/generate',
      payload: { baseUrl: 'https://example.test/v1', apiKey: 'secret', prompt: '定音鼓 特写' },
    });
    expect(response.statusCode).toBe(504);
    expect(response.json().error).toContain('超时');
  });
});

describe('POST /api/prompts/enhance', () => {
  it('使用兼容 chat completions 接口并仅返回生成后的提示词', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer llm-secret', 'Content-Type': 'application/json' });
      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe('custom-model');
      expect(payload.messages.at(-1)).toEqual({ role: 'user', content: '小提琴 近景 运弓' });
      expect(String(init?.body)).not.toContain('llm-secret');
      return new Response(JSON.stringify({ choices: [{ message: { content: '舞台暖光下的小提琴近景，侧面机位捕捉运弓。' } }] }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/prompts/enhance',
      payload: {
        baseUrl: 'https://llm.example/v1/',
        apiKey: 'llm-secret',
        model: 'custom-model',
        prompt: '小提琴 近景 运弓',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://llm.example/v1/chat/completions', expect.anything());
    expect(response.json()).toEqual({ prompt: '舞台暖光下的小提琴近景，侧面机位捕捉运弓。' });
    expect(response.body).not.toContain('llm-secret');
  });

  it('保留上游状态但归一化错误正文，避免反射密钥', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"request Authorization: Bearer never-log-me"}}', {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/prompts/enhance',
      payload: { baseUrl: 'https://llm.example/v1', apiKey: 'never-log-me', prompt: '长笛 全景' },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: 'LLM 服务请求失败', upstreamStatus: 429 });
    expect(response.body).not.toContain('never-log-me');
  });

  it('拒绝非 HTTP Base URL且不发出请求', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const app = await appFor({ fetchImpl });
    const response = await app.inject({
      method: 'POST',
      url: '/api/prompts/enhance',
      payload: { baseUrl: 'file:///secret', apiKey: 'secret', prompt: '钢琴 特写' },
    });
    expect(response.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.body).not.toContain('secret');
  });

  it('超时返回504', async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    const app = await appFor({ fetchImpl, llmTimeoutMs: 5 });
    const response = await app.inject({
      method: 'POST',
      url: '/api/prompts/enhance',
      payload: { baseUrl: 'https://llm.example/v1', apiKey: 'secret', prompt: '钢琴 特写' },
    });
    expect(response.statusCode).toBe(504);
  });
});
