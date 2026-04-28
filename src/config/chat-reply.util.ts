/**
 * Deterministic mock replies — mirrors MediAI `src/lib/chat-content.ts` `getReplyForMode`.
 */
export type ChatMode = 'personal' | 'general';

export function getReplyForMode(mode: ChatMode, message: string): string {
  if (mode === 'personal') {
    return `I can help with that. Based on your profile, tell me more about "${message}" including when it started, what makes it better or worse, and whether you have any related symptoms.`;
  }
  return `I can help with your question about "${message}". Please share more detail about the symptom, duration, and any related concerns so I can give general guidance.`;
}

export function chatReplyAuthor(mode: ChatMode): string {
  return mode === 'personal' ? 'AI Doctor' : 'General Chat';
}
