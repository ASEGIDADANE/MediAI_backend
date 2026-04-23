import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

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
    const k = (this.config.get('LLM_API_KEY') || this.config.get('OPENAI_API_KEY') || '')
      .toString()
      .trim();
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
    return this.openAiChatCompletionsJson(messages);
  }

  /**
   * Yields token / word chunks; caller buffers full text for DB persistence.
   */
  async *streamWithMessages(messages: LlmMessage[]): AsyncGenerator<string, void, void> {
    if (this.isDummyKey()) {
      const { text } = this.dummyResult(messages, messages.length > 2);
      for (const part of text.split(/(\s+)/)) {
        if (part) {
          yield part;
        }
      }
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
    const systemLen = messages.find((m) => m.role === 'system')?.content.length ?? 0;
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

  private async openAiChatCompletionsJson(messages: LlmMessage[]): Promise<LlmResult> {
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
    return Number(
      this.config.get('LLM_REQUEST_TIMEOUT_MS', '30000') || 30_000,
    );
  }

  private rethrowLlmNetError(e: unknown): never {
    const n = (e as { name?: string })?.name;
    if (n === 'AbortError' || n === 'TimeoutError') {
      this.log.warn('LLM request timed out');
      throw new HttpException('LLM request timed out', HttpStatus.GATEWAY_TIMEOUT);
    }
    const msg = (e as Error)?.message?.slice(0, 200) ?? 'unknown';
    this.log.error(`LLM fetch failed: ${msg}`);
    throw new HttpException('LLM request failed', HttpStatus.BAD_GATEWAY);
  }

  private async openAiRequest(messages: LlmMessage[], stream: boolean) {
    const apiKey = (
      this.config.get('LLM_API_KEY') || this.config.get('OPENAI_API_KEY') || ''
    )
      .toString()
      .trim();
    const model =
      this.config.get('CHAT_LLM_MODEL', 'gpt-4o-mini') || 'gpt-4o-mini';
    const base = (
      this.config.get('LLM_BASE_URL', 'https://api.openai.com/v1') || 'https://api.openai.com/v1'
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
      throw new HttpException('LLM rate limit, try later', HttpStatus.SERVICE_UNAVAILABLE);
    }
    throw new HttpException('LLM request failed', HttpStatus.BAD_GATEWAY);
  }
}
