const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface PromptEnhanceInput {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  model?: string;
}

export interface LlmProxyOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function chatCompletionsEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Base URL 格式无效');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Base URL 仅支持 HTTP 或 HTTPS');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('LLM 服务响应过大');
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('LLM 服务响应过大');
  return text;
}

export async function proxyPromptEnhancement(
  input: PromptEnhanceInput,
  { fetchImpl = fetch, timeoutMs = 45_000 }: LlmProxyOptions = {},
): Promise<{ status: number; contentType: string; body: string }> {
  if (!input.apiKey?.trim()) throw new Error('请填写 API Key');
  if (!input.prompt?.trim() || input.prompt.length > 4_000) throw new Error('提示词长度必须在 1 到 4000 字符之间');
  const model = input.model?.trim() || 'gpt-5-mini';
  if (model.length > 128) throw new Error('模型名称无效');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(chatCompletionsEndpoint(input.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是音乐合奏视频分镜师。将用户输入改写为一段可直接用于生成16:9分镜参考图的中文提示词。保留乐器、景别和拍摄意图，补充构图、机位、灯光与舞台环境；只输出提示词，不要解释。',
          },
          { role: 'user', content: input.prompt.trim() },
        ],
      }),
      signal: controller.signal,
    });
    const upstreamBody = await readBounded(response);
    if (!response.ok) {
      return {
        status: response.status,
        contentType: 'application/json',
        // Do not reflect arbitrary provider responses. A misconfigured proxy
        // may echo request headers, including the credential, in its error.
        body: JSON.stringify({ error: 'LLM 服务请求失败', upstreamStatus: response.status }),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(upstreamBody);
    } catch {
      throw new Error('LLM 服务返回了无效 JSON');
    }
    const content = (parsed as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('LLM 服务未返回提示词');
    return { status: 200, contentType: 'application/json', body: JSON.stringify({ prompt: content.trim() }) };
  } finally {
    clearTimeout(timer);
  }
}
