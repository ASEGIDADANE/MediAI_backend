import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  geminiChatModelId,
  geminiGenerativeBase,
  getLlmApiKey,
  useGoogleGeminiLlm,
} from './llm-provider.util';

export type LlmResult = {
  text: string;
  usage?: { promptTokens: number; completionTokens: number };
  model: string;
};

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DUMMY_KEYS = new Set(['', 'dummy', 'dev', 'test', 'off', 'false']);

@Injectable()
export class LlmService {
  private readonly log = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  isDummyKey(): boolean {
    const k = getLlmApiKey(this.config);
    if (!k) {
      return true;
    }
    if (DUMMY_KEYS.has(k.toLowerCase())) {
      return true;
    }
    return k.toLowerCase().startsWith('sk-dummy') || k === 'dummy';
  }

  /**
   * @deprecated prefer `completeWithMessages` (multi-turn); kept for internal callers
   */
  async completeChat({
    systemPrompt,
    userMessage,
  }: {
    systemPrompt: string;
    userMessage: string;
  }): Promise<LlmResult> {
    return this.completeWithMessages([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);
  }

  async completeWithMessages(messages: LlmMessage[]): Promise<LlmResult> {
    if (this.isDummyKey()) {
      return this.dummyResult(messages, messages.length > 2);
    }
    if (useGoogleGeminiLlm(this.config)) {
      return this.geminiGenerateContent(messages);
    }
    return this.openAiChatCompletionsJson(messages);
  }

  /**
   * Yields token / word chunks; caller buffers full text for DB persistence.
   */
  async *streamWithMessages(
    messages: LlmMessage[],
  ): AsyncGenerator<string, void, void> {
    if (this.isDummyKey()) {
      const { text } = this.dummyResult(messages, messages.length > 2);
      for (const part of text.split(/(\s+)/)) {
        if (part) {
          yield part;
        }
      }
      return;
    }
    if (useGoogleGeminiLlm(this.config)) {
      yield* this.geminiStreamChunks(messages);
      return;
    }
    yield* this.openAiChatStreamChunks(messages);
  }

  private dummyResult(
    messages: LlmMessage[],
    multiTurnPretend: boolean,
  ): LlmResult {
    const rid = randomUUID().slice(0, 8);
    const nUser = messages.filter((m) => m.role === 'user').length;
    const systemLen =
      messages.find((m) => m.role === 'system')?.content.length ?? 0;
    const lastUser =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const text =
      `[dev/dummy LLM: set LLM_API_KEY. request=${rid}]\n` +
      (multiTurnPretend
        ? `user_turns_in_context=${nUser} system_chars=${systemLen}\n`
        : '') +
      `Last user message: "${lastUser.slice(0, 240)}${
        lastUser.length > 240 ? '…' : ''
      }"`;
    return {
      text,
      usage: { promptTokens: 0, completionTokens: 0 },
      model: 'dummy',
    };
  }

  private buildGeminiRequestBody(messages: LlmMessage[]): {
    systemInstruction?: { parts: { text: string }[] };
    contents: { role: string; parts: { text: string }[] }[];
    generationConfig: { temperature: number; maxOutputTokens: number };
  } {
    const systemBits: string[] = [];
    const contents: { role: string; parts: { text: string }[] }[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemBits.push(m.content);
        continue;
      }
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: m.content }] });
    }
    const systemInstruction = systemBits.length
      ? { parts: [{ text: systemBits.join('\n\n') }] }
      : undefined;
    return {
      systemInstruction,
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2_048 },
    };
  }

  private async geminiGenerateContent(
    messages: LlmMessage[],
  ): Promise<LlmResult> {
    const model = geminiChatModelId(this.config);
    const base = geminiGenerativeBase(this.config);
    const u = new URL(
      `${base}/models/${encodeURIComponent(model)}:generateContent`,
    );
    u.searchParams.set('key', getLlmApiKey(this.config));
    const signal = AbortSignal.timeout(this.requestTimeoutMs());
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildGeminiRequestBody(messages)),
      });
    } catch (e: unknown) {
      this.rethrowLlmNetError(e);
    }
    if (!res.ok) {
      await this.throwGeminiHttp(res);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };
    const text =
      json.candidates
        ?.map((c) => (c.content?.parts ?? []).map((p) => p.text ?? '').join(''))
        .join('') ?? '';
    return {
      text: text.trim(),
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model,
    };
  }

  private async *geminiStreamChunks(
    messages: LlmMessage[],
  ): AsyncGenerator<string, void, void> {
    const model = geminiChatModelId(this.config);
    const base = geminiGenerativeBase(this.config);
    const u = new URL(
      `${base}/models/${encodeURIComponent(model)}:streamGenerateContent`,
    );
    u.searchParams.set('key', getLlmApiKey(this.config));
    u.searchParams.set('alt', 'sse');
    const signal = AbortSignal.timeout(this.requestTimeoutMs());
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildGeminiRequestBody(messages)),
      });
    } catch (e: unknown) {
      this.rethrowLlmNetError(e);
    }
    if (!res.ok) {
      await this.throwGeminiHttp(res);
    }
    const body = res.body;
    if (!body) {
      return;
    }
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.replace(/\r$/, '').trim();
        if (!t.startsWith('data:')) {
          continue;
        }
        const data = t.replace(/^data:\s*/, '');
        if (!data || data === '[DONE]') {
          continue;
        }
        try {
          const json = JSON.parse(data) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const parts = json.candidates?.[0]?.content?.parts;
          if (!parts?.length) {
            continue;
          }
          for (const p of parts) {
            if (p.text) {
              yield p.text;
            }
          }
        } catch {
          /* ignore partial / non-JSON */
        }
      }
    }
  }

  private async throwGeminiHttp(res: Response): Promise<never> {
    const raw = await res.text().catch(() => '');
    this.log.error(
      `Gemini HTTP status=${res.status} body=${raw.slice(0, 400)}`,
    );
    if (res.status === 429) {
      throw new HttpException(
        'LLM rate limit, try later',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    throw new HttpException('LLM request failed', HttpStatus.BAD_GATEWAY);
  }

  private async openAiChatCompletionsJson(
    messages: LlmMessage[],
  ): Promise<LlmResult> {
    const { res, model } = await this.openAiRequest(messages, false);
    if (!res.ok) {
      await this.throwLlmHttp(res);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    return {
      text,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
      model,
    };
  }

  private async *openAiChatStreamChunks(
    messages: LlmMessage[],
  ): AsyncGenerator<string, void, void> {
    const { res, model } = await this.openAiRequest(messages, true);
    if (!res.ok) {
      await this.throwLlmHttp(res);
    }
    const body = res.body;
    if (!body) {
      return;
    }
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += dec.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data: ')) {
            continue;
          }
          const data = t.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const json = JSON.parse(data) as {
              model?: string;
              choices?: { delta?: { content?: string } }[];
            };
            if (json.model) {
              /* used */ void model;
            }
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            /* ignore partial JSON */
          }
        }
      }
    }
  }

  private requestTimeoutMs(): number {
    return Number(this.config.get('LLM_REQUEST_TIMEOUT_MS', '30000') || 30_000);
  }

  private rethrowLlmNetError(e: unknown): never {
    const n = (e as { name?: string })?.name;
    if (n === 'AbortError' || n === 'TimeoutError') {
      this.log.warn('LLM request timed out');
      throw new HttpException(
        'LLM request timed out',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
    const msg = (e as Error)?.message?.slice(0, 200) ?? 'unknown';
    this.log.error(`LLM fetch failed: ${msg}`);
    throw new HttpException('LLM request failed', HttpStatus.BAD_GATEWAY);
  }

  private async openAiRequest(messages: LlmMessage[], stream: boolean) {
    const apiKey = getLlmApiKey(this.config);
    const model =
      this.config.get('CHAT_LLM_MODEL', 'gpt-4o-mini') || 'gpt-4o-mini';
    const base = (
      this.config.get('LLM_BASE_URL', 'https://api.openai.com/v1') ||
      'https://api.openai.com/v1'
    ).replace(/\/$/, '');

    const signal = AbortSignal.timeout(this.requestTimeoutMs());
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 2_048,
          stream,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
    } catch (e: unknown) {
      this.rethrowLlmNetError(e);
    }
    return { res, model };
  }

  private async throwLlmHttp(res: Response): Promise<never> {
    await res.text().catch(() => void 0);
    this.log.error(`LLM HTTP status=${res.status}`);
    if (res.status === 429) {
      throw new HttpException(
        'LLM rate limit, try later',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    throw new HttpException('LLM request failed', HttpStatus.BAD_GATEWAY);
  }
}
