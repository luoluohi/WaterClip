const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

export interface ImageGenerateInput {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  referenceDataUrl?: string;
}

export interface ImageProxyOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function endpoint(baseUrl: string, action: 'generations' | 'edits'): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Base URL 格式无效');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Base URL 仅支持 HTTP 或 HTTPS');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/images/${action}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseReference(dataUrl: string): { bytes: Buffer; mime: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error('参考图必须是 PNG、JPEG 或 WebP Data URL');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) throw new Error('参考图大小必须在 1 字节到 20 MB 之间');
  return { bytes, mime: match[1] };
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('图像服务响应过大');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('图像服务响应过大');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function proxyImageGeneration(
  input: ImageGenerateInput,
  { fetchImpl = fetch, timeoutMs = 90_000 }: ImageProxyOptions = {},
): Promise<{ status: number; contentType: string; body: string }> {
  if (!input.apiKey?.trim()) throw new Error('请填写 API Key');
  if (!input.prompt?.trim() || input.prompt.length > 4_000) throw new Error('提示词长度必须在 1 到 4000 字符之间');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url: string;
    let body: BodyInit;
    let contentType: string | undefined;
    if (input.referenceDataUrl) {
      url = endpoint(input.baseUrl, 'edits');
      const reference = parseReference(input.referenceDataUrl);
      const form = new FormData();
      form.set('model', 'gpt-image-2');
      form.set('prompt', input.prompt.trim());
      form.set('size', '1280x720');
      form.set('quality', 'medium');
      form.set('output_format', 'png');
      const blobBytes = new Uint8Array(reference.bytes.byteLength);
      blobBytes.set(reference.bytes);
      form.set('image', new Blob([blobBytes], { type: reference.mime }), `reference.${reference.mime.split('/')[1]}`);
      body = form;
    } else {
      url = endpoint(input.baseUrl, 'generations');
      contentType = 'application/json';
      body = JSON.stringify({
        model: 'gpt-image-2',
        prompt: input.prompt.trim(),
        size: '1280x720',
        quality: 'medium',
        output_format: 'png',
      });
    }

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey.trim()}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body,
      signal: controller.signal,
    });
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || 'application/json',
      body: await readBounded(response),
    };
  } finally {
    clearTimeout(timer);
  }
}
