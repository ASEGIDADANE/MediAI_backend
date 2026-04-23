import { describe, expect, it } from '@jest/globals';
import {
  buildLlmRequestMessages,
  historyFromDbRows,
  trimHistoryToApproxTokens,
} from './chat-message-history.util';

describe('trimHistoryToApproxTokens', () => {
  it('keeps recent messages when over budget', () => {
    const long = 'x'.repeat(100);
    const turns = [
      { role: 'user' as const, content: long },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: 'last' },
    ];
    const out = trimHistoryToApproxTokens(turns, 120, 1);
    expect(out.length).toBeLessThan(turns.length);
    expect(out[out.length - 1]?.content).toBe('last');
  });
});

describe('buildLlmRequestMessages', () => {
  it('prefixes system and includes trimmed history', () => {
    const sys = 'SYS';
    const h = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' },
    ];
    const m = buildLlmRequestMessages(sys, h, 10_000);
    expect(m[0]).toEqual({ role: 'system', content: sys });
    expect(m[1]).toEqual(h[0]);
    expect(m[2]).toEqual(h[1]);
  });
});

describe('historyFromDbRows', () => {
  it('ignores system role and limits pairs', () => {
    const rows = [
      { role: 'user' as const, content: '1' },
      { role: 'system' as const, content: 'x' },
      { role: 'assistant' as const, content: '2' },
    ];
    const h = historyFromDbRows(rows, 1);
    expect(h).toHaveLength(2);
  });
});
