/**
 * GET /api/chat/config — mirrors MediAI `src/lib/chat-content.ts`.
 */
export const doctorTypeOptions = [
  {
    id: 'personal' as const,
    title: "Joe's AI Doctor",
    shortLabel: 'Personal AI Doctor',
    description:
      'Your health details are utilized to offer more personalized advice and insights',
  },
  {
    id: 'general' as const,
    title: 'General Chat',
    shortLabel: 'General Chat',
    description:
      "General chat doesn't use any saved health details or previous conversations",
  },
];

export const chatHistoryItems = [
  {
    title: 'Headache symptoms explanation',
    createdAt: '02 Apr, 9:55 AM',
    lastMessageAt: '02 Apr, 9:55 AM',
    summary: 'Not generated',
    type: 'personal' as const,
  },
  {
    title: 'Headache symptoms explanation',
    createdAt: '02 Apr, 9:55 AM',
    lastMessageAt: '02 Apr, 9:55 AM',
    summary: 'Not generated',
    type: 'general' as const,
  },
  {
    title: 'Headache symptoms explanation',
    createdAt: '02 Apr, 9:55 AM',
    lastMessageAt: '02 Apr, 9:55 AM',
    summary: 'Not generated',
    type: 'personal' as const,
  },
];

export const seededPersonalConversation = [
  {
    role: 'user' as const,
    author: 'Joe',
    content: "I'm having a headache",
  },
  {
    role: 'assistant' as const,
    author: 'AI Doctor',
    content:
      'Can you describe the characteristics of your headache? Specifically, where is it located, how intense is it, how long does it last, and are there any associated symptoms like nausea or visual disturbances? Have you noticed any recent changes in your lifestyle, stress levels, or sleep patterns that might be contributing to the headache? Do you have a history of migraines or other types of headaches? Are there any known triggers, such as certain foods, lack of hydration, or exposure to bright lights? Have you taken any medications or tried any remedies to alleviate the headache, and were they effective?',
  },
];

export function getChatConfigSnapshot() {
  return {
    doctorTypeOptions,
    chatHistoryItems,
    seededPersonalConversation,
  };
}
