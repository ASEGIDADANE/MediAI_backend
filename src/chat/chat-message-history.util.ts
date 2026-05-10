const CHARS_PER_TOKEN_EST = 4;

export type LlmHistoryTurn = { role: 'user' | 'assistant'; content: string };

/**
 * Trims the oldest multi-turn **user/assistant** history from the start until the total
 * **approximate** token budget is satisfied. Always keeps the **last** `minTurns` (default 1 pair).
 */
export function trimHistoryToApproxTokens(
  turns: LlmHistoryTurn[],
  maxInputChars: number,
  minMessagesToKeep = 1,
): LlmHistoryTurn[] {
  if (turns.length === 0) {
    return turns;
  }
  const out: LlmHistoryTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const c = t.content.length;
    const next = used + c;
    if (next > maxInputChars && out.length >= minMessagesToKeep) {
      break;
    }
    out.push(t);
    used = next;
  }
  return out.reverse();
}

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN_EST);
}

/**
 * From DB message rows, build alternating user/assistant (skip system) for the LLM.
 * Expects `rows` in chronological order, **including** the new user turn if already persisted.
 */
export function historyFromDbRows(
  rows: { role: 'user' | 'assistant' | 'system'; content: string }[],
  maxUserAssistantPairs = 20,
): LlmHistoryTurn[] {
  const slice = rows
    .filter(
      (r): r is { role: 'user' | 'assistant'; content: string } =>
        r.role === 'user' || r.role === 'assistant',
    )
    .slice(-maxUserAssistantPairs * 2);
  return slice.map((r) => ({ role: r.role, content: r.content }));
}

export function buildLlmRequestMessages(
  systemPrompt: string,
  history: LlmHistoryTurn[],
  maxInputChars: number,
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const systemChars = systemPrompt.length;
  const historyBudget = Math.max(0, maxInputChars - systemChars);
  const trimmed = trimHistoryToApproxTokens(history, historyBudget, 1);
  return [{ role: 'system', content: systemPrompt }, ...trimmed];
}
