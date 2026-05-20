# Master implementation prompt — Personalized chat free trial (3 chats) + paywall

**Role:** Senior full-stack engineer + product UI designer on MediAI (NestJS `MediAI_backend` + Next.js `MediAI`).

**Goal:** Ship a freemium flow like successful health/AI apps: **General chat stays free**; **Personalized chat** gives **3 free completed chats** per patient account (lifetime), then a **paywall** to buy the existing Chapa **assistant pass**. Hub card teases Personal; click opens trial sheet or chat; in-chat counter; composer lock after trial.

**Do not** change doctor consultation booking or Top Doctors payment in this task.

---

## 1. Product rules (non-negotiable)

| Rule | Detail |
|------|--------|
| General chat | Always free. No trial counter. No paywall. `POST /api/chat/general/*` unchanged except optional config fields. |
| Personal chat — patients | Allow if **paid assistant active** OR **trial remaining > 0**. |
| Personal chat — professionals | Always allow (no trial, no payment). Existing `OnboardingUserRole.professional` bypass. |
| What counts as “1 trial chat” | One **successful** personal turn: user message saved + assistant reply saved after LLM success. Same hook as `ChatQuotaService.recordCompletedTurn` in `chat-completion.service.ts`. |
| What does NOT count | Failed LLM, 429, 403, empty message, aborted stream before assistant row saved. |
| Trial limit | Default **3**, env `ASSISTANT_TRIAL_LIMIT=3`. Lifetime per account (no daily reset). |
| Trial toggle | `ASSISTANT_TRIAL_ENABLED=true` (false = revert to pay-only for patients). |
| After trial exhausted | `POST /api/chat/personal/messages` → **403** with stable error code. **GET** conversation list + messages → **allowed** (read-only history). |
| Paid pass | Existing `UserAssistantAccess` + Chapa flow unchanged. When `assistantAccess.active`, trial counter irrelevant (unlimited for pass duration). |
| Onboarding | Personal chat still requires completed `UserProfile` (existing 404). Trial does not skip onboarding. |
| Trust | Trial count **only** on server (DB). Never trust localStorage/sessionStorage for remaining chats. |

---

## 2. Current codebase (read before coding)

### Backend

- Pay gate: `PaymentsService.requireActiveAssistantAccess()` in `MediAI_backend/src/payments/payments.service.ts` — used by `chat.controller.ts` on personal routes.
- Personal send: `ChatCompletionService.runPersonalJson()` in `MediAI_backend/src/chat/chat-completion.service.ts`.
- Billing: `GET /api/me/billing` → `getMyBilling()` → `MeBillingResponseDto` in `payments.dto.ts`.
- Schema: `UserProfile` in `prisma/schema.prisma`; assistant tables `AssistantAccessPlan`, `UserAssistantAccess`.

### Frontend

- Hub: `ChatOptionsPage` in `MediAI/src/components/dashboard/chat-pages.tsx` — two cards, `getMyBilling()` for Premium badge.
- Chat: `ChatConversationPage` same file — `AssistantPaywallPanel`, `showPaywall`, `needsAssistantPass`.
- Paywall UI: `MediAI/src/components/dashboard/assistant-paywall-panel.tsx`.
- Types: `MediAI/src/lib/payments-api.ts` — `MyBillingResponse`.
- Routes: `/dashboard/ai-doctor`, `/dashboard/ai-doctor/personal`, `/dashboard/ai-doctor/general`, `/pricing`.

---

## 3. Backend implementation

### 3.1 Prisma migration

Add to `UserProfile`:

```prisma
personalTrialMessagesUsed Int       @default(0) @map("personal_trial_messages_used")
personalTrialExhaustedAt DateTime? @map("personal_trial_exhausted_at")
```

- Set `personalTrialExhaustedAt` when `used` reaches `limit` (first time only).
- Migration name suggestion: `add_personal_assistant_trial_fields`.

### 3.2 Environment (`.env.example` + README snippet)

```env
ASSISTANT_TRIAL_ENABLED=true
ASSISTANT_TRIAL_LIMIT=3
```

### 3.3 New service: `PersonalChatAccessService` (preferred)

**File:** `MediAI_backend/src/payments/personal-chat-access.service.ts` (or `src/chat/`)

**Methods:**

```ts
getTrialConfig(): { enabled: boolean; limit: number }

async getAccessState(userId: string): Promise<{
  paidActive: boolean;
  trial: {
    enabled: boolean;
    limit: number;
    used: number;
    remaining: number;
    exhausted: boolean;
  };
  personalChatAllowed: boolean; // paidActive || remaining > 0 || professional
  readOnly: boolean;            // exhausted && !paidActive
}>

async assertCanSendPersonalMessage(userId: string): Promise<void>
// Throws ForbiddenException with body:
// {
//   statusCode: 403,
//   message: '...',
//   error: 'assistant_trial_exhausted' | 'assistant_payment_required',
//   trial?: { limit, used, remaining }
// }

async recordTrialUsageIfNeeded(userId: string): Promise<void>
// Call only after successful personal assistant message persisted.
// If paidActive or professional → no-op.
// Else atomic increment: UPDATE user_profile SET personal_trial_messages_used = used + 1
//   WHERE user_id = $1 AND personal_trial_messages_used < $limit
// If after increment used >= limit → set personalTrialExhaustedAt = now()
```

**Logic for `assertCanSendPersonalMessage`:**

1. Load profile role. If `professional` → return.
2. If `ASSISTANT_TRIAL_ENABLED` false → delegate to current pay-only check (active `UserAssistantAccess` only).
3. If active paid pass (`endsAt > now`, status active) → return.
4. If `personalTrialMessagesUsed < limit` → return.
5. Else throw `assistant_trial_exhausted` with trial snapshot.

**Refactor:** Replace direct `requireActiveAssistantAccess` calls on **personal POST/stream** with `assertCanSendPersonalMessage`. Keep `requireActiveAssistantAccess` for backward compat or make it call the new resolver.

**Read routes (`GET /chat/conversations`, `GET .../messages`):**

- If paid or trial remaining > 0 → allow (current behavior).
- If trial exhausted and not paid → **allow GET** (read-only), do not throw 403 on list/messages.
- Optional: still require JWT + ownership checks unchanged.

### 3.4 Extend `getMyBilling`

Add to `MeBillingResponseDto`:

```ts
personalTrial: {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
}
personalChatAllowed: boolean;
personalChatReadOnly: boolean;
```

Populate in `PaymentsService.getMyBilling()` using `PersonalChatAccessService.getAccessState()`.

### 3.5 Increment trial in chat completion

In `ChatCompletionService.runPersonalJson`, after successful assistant `create` and before return:

```ts
await this.personalChatAccess.recordTrialUsageIfNeeded(userId);
```

Only for `subject.kind === 'self'` (patient self-chat). For doctor `patientUserId` clinical assistant → do not consume patient trial on doctor's account (doctor is not on trial).

### 3.6 Chat config

`GET /api/chat/config` (`chat.service.ts` / `getChatConfigSnapshot`):

```ts
assistantTrial: {
  enabled: boolean;
  limit: number;
}
```

### 3.7 Tests

**Unit** (`personal-chat-access.service.spec.ts`):

- Patient, used=0, not paid → allowed, remaining=3.
- Patient, used=3 → assert throws `assistant_trial_exhausted`.
- Patient, paid active → allowed, recordTrial no-op.
- Professional → allowed, no increment.

**Integration** (optional `RUN_CHAT_E2E=1`):

- Register personal user, onboard, send 3 personal messages with dummy LLM → 200.
- 4th → 403 + error code.
- Seed active pass → 4th → 200.

### 3.8 OpenAPI

Update Swagger DTOs for billing + document 403 response on personal POST with `assistant_trial_exhausted`.

---

## 4. Frontend implementation

### 4.1 Types (`payments-api.ts`)

```ts
export type PersonalTrialBilling = {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
};

export type MyBillingResponse = {
  assistantAccess: BillingAssistantAccess;
  personalTrial: PersonalTrialBilling;
  personalChatAllowed: boolean;
  personalChatReadOnly: boolean;
  recentConsultations: BillingConsultation[];
};
```

Add helper:

```ts
export function canSendPersonalChat(billing: MyBillingResponse): boolean {
  return billing.personalChatAllowed && !billing.personalChatReadOnly;
}
```

### 4.2 New component: `PersonalAccessSheet`

**File:** `MediAI/src/components/dashboard/personal-access-sheet.tsx`

**Props:**

```ts
{
  open: boolean;
  onClose: () => void;
  billing: MyBillingResponse | null;
  onStartTrial: () => void;  // router.push personal
  onPaid?: () => void;       // refresh billing parent
}
```

**UI (match existing MediAI: `DashboardPanel`, `primary`, rounded-2xl, mobile bottom sheet):**

**State A — trial remaining (`remaining > 0`):**

- Title: “Try personalized AI Doctor”
- Body: Uses your saved health profile · **{remaining} of {limit} free chats** · General chat stays free
- Primary button: **Start free trial** → `onStartTrial()`
- Secondary: **See plans** → inline 2 plan cards OR link `/pricing`
- Text link: **Continue with General chat (free)** → `/dashboard/ai-doctor/general`
- Do NOT require payment on this screen.

**State B — trial exhausted (`exhausted && !assistantAccess.active`):**

- Title: “You’ve used your 3 free chats”
- Embed `AssistantPaywallPanel` variant=`compact` OR duplicate plan cards + Chapa
- Link: General chat (free)

**State C — already paid:**

- Call `onClose()` immediately or show “You’re all set” + Continue.

Use `getAssistantAccessPlans` + `initiateAssistantPayment` same as `assistant-paywall-panel.tsx`.

### 4.3 `ChatOptionsPage` (hub)

**File:** `chat-pages.tsx`

1. Fetch `getMyBilling()` → store full `billing` object (not just boolean).
2. **General card:** unchanged `<Link href=".../general">`.
3. **Personal card:** change from plain `<Link>` to `<button type="button">` or div with `onClick`:

```ts
function handlePersonalClick() {
  if (billing?.personalChatAllowed) {
    router.push('/dashboard/ai-doctor/personal');
    return;
  }
  setAccessSheetOpen(true);
}
```

4. **Badge on Personal card:**
   - `assistantAccess.active` → “Active”
   - `personalTrial.remaining > 0` → `{remaining} free chat(s) left` or “3 free chats”
   - else → “Premium”

5. **Subcopy:**
   - Trial available: “Try personalized answers using your health profile.”
   - Exhausted: “Unlock unlimited personalized access.”

6. Optional: `locked` state → very light lock icon top-right; **no full-page blur** on hub.

7. Render `<PersonalAccessSheet open={...} billing={billing} onStartTrial={...} />`.

### 4.4 `ChatConversationPage` (personal mode, patients only)

1. On mount: `getMyBilling()` → derive:
   - `canSend = personalChatAllowed && !personalChatReadOnly`
   - `trialRemaining = billing.personalTrial.remaining`

2. **Remove** full-page `showPaywall` that blocks entire chat before first message when trial remains.

3. **Top trial chip** (when `!assistantAccess.active && trial.enabled && !exhausted`):

```tsx
<div className="mb-4 flex items-center justify-between rounded-xl border border-primary/15 bg-primary/5 px-4 py-2 text-sm">
  <span>Free trial · {remaining} of {limit} chats left</span>
  <button type="button" onClick={() => setAccessSheetOpen(true)}>Upgrade</button>
</motion>
```

4. **Last chat warning:** when `remaining === 1` before send, show subtle banner: “This is your last free personalized chat.”

5. **Composer:**
   - If `canSend` → `<ChatComposer />` as today.
   - If `personalChatReadOnly` or exhausted → hide composer; show **composer paywall overlay**:
     - `backdrop-blur-sm` strip at bottom
     - Card: “Continue with personalized AI Doctor” + `AssistantPaywallPanel` compact OR CTA to sheet
     - Message list above remains readable (optional: `opacity-90` on last messages only)

6. **On send error 403** with `assistant_trial_exhausted`: refresh billing, set exhausted UI, open sheet.

7. **After successful send:** refresh `getMyBilling()` to update counter.

8. **General mode:** no trial UI.

### 4.5 `ChatHistoryPage`

- If `personalChatReadOnly`: show banner + “Unlock to continue” → sheet/pricing.
- List threads still loads (backend allows GET).
- Opening thread: messages visible; composer hidden + paywall strip.

### 4.6 Copy updates

| Location | Text |
|----------|------|
| Hub Personal (trial) | “3 free chats” badge |
| Sheet primary | “Start free trial” |
| In-chat chip | “Free trial · {n} of 3 chats left” |
| Exhausted | “You’ve used your 3 free personalized chats.” |
| Footer | “General chat is free and doesn’t use your saved profile.” |

### 4.7 `assistant-paywall-panel.tsx`

- Adjust headline when opened post-trial: “Unlock unlimited personalized AI Doctor”
- Keep Chapa flow unchanged.

### 4.8 Pricing section (optional one line)

`pricing-section.tsx`: under hero — “New users get 3 free personalized chats.”

---

## 5. API contract summary

### `GET /api/me/billing` (extended)

```json
{
  "assistantAccess": { "active": false, ... },
  "personalTrial": {
    "enabled": true,
    "limit": 3,
    "used": 2,
    "remaining": 1,
    "exhausted": false
  },
  "personalChatAllowed": true,
  "personalChatReadOnly": false,
  "recentConsultations": []
}
```

### `POST /api/chat/personal/messages` — 403 exhausted

```json
{
  "statusCode": 403,
  "message": "You have used all free personalized chats. Purchase an assistant pass to continue.",
  "error": "assistant_trial_exhausted",
  "trial": { "limit": 3, "used": 3, "remaining": 0 }
}
```

Nest: use `ForbiddenException` with object body or custom exception filter so `error` field is preserved for axios client.

### Frontend axios handling

In `chat-pages.tsx` / `app-content.ts`, parse `err.response?.data?.error === 'assistant_trial_exhausted'` for UI state.

---

## 6. UI design specs (designer handoff)

### Visual hierarchy

- **General** = open, friendly, no badges.
- **Personal** = premium (existing primary card) + small **sparkle/lock** icon when not paid.
- **Trial chip** = `bg-primary/5`, `border-primary/15`, not alarming.
- **Paywall overlay** = bottom-anchored, `max-w-lg` centered, `shadow-lg`, never cover entire screen on desktop (max 40% height).

### Motion

- Sheet: `animate-in slide-in-from-bottom` (or framer if project already uses it — prefer CSS/Tailwind only).
- Counter decrement: optional subtle number change, no confetti.

### Accessibility

- Sheet: `role="dialog"`, `aria-modal`, focus trap, Esc closes.
- Lock badge: `aria-label="Premium feature, 3 free chats available"`.
- Composer disabled: `aria-disabled` + visible text reason.

### Responsive

- Mobile: bottom sheet full width, safe-area padding.
- Desktop: centered modal `max-w-md`.

---

## 7. Edge cases

| Case | Behavior |
|------|----------|
| User pays mid-trial | Next `getMyBilling` → `active: true`; hide trial chip; unlimited sends. |
| Parallel sends (2 tabs) | DB atomic increment; may allow 4th only on race — acceptable v1 or use transaction serializable. |
| `ASSISTANT_TRIAL_ENABLED=false` | Pay-only; hub shows Premium; no trial sheet state A. |
| Doctor account on patient personal route | N/A — professional uses `ProfessionalChatConversationPage`. |
| Clinical assistant `patientUserId` | Do not increment doctor's trial; doctor access free. |
| Existing users with used=0 | Get 3 new trials after deploy. |
| User had paid before, expired | Trial only if `used < limit` (if used=0); if you want no trial after ever paid, add `personalTrialGranted` flag — **v1: allow trial if used < limit regardless of past expired pass**. |

---

## 8. Files to create / modify (checklist)

### Backend

- [ ] `prisma/schema.prisma` + migration
- [ ] `src/payments/personal-chat-access.service.ts`
- [ ] `src/payments/payments.module.ts` — register provider
- [ ] `src/payments/payments.service.ts` — billing + refactor gate
- [ ] `src/chat/chat.controller.ts` — use new assert + read-only GET rules
- [ ] `src/chat/chat-completion.service.ts` — recordTrialUsageIfNeeded
- [ ] `src/chat/chat.service.ts` — config trial fields
- [ ] `src/payments/dto/payments.dto.ts` — DTOs
- [ ] `.env.example`
- [ ] `personal-chat-access.service.spec.ts`
- [ ] Update `payments.service.spec.ts` if needed

### Frontend

- [ ] `src/lib/payments-api.ts` — types
- [ ] `src/components/dashboard/personal-access-sheet.tsx` — **new**
- [ ] `src/components/dashboard/chat-pages.tsx` — hub + conversation + history
- [ ] `src/components/dashboard/assistant-paywall-panel.tsx` — copy tweak
- [ ] `src/lib/hooks/use-app-config.ts` or chat config — trial fields if exposed
- [ ] Optional: `src/components/landing/pricing-section.tsx` — one line

---

## 9. Definition of done

1. New patient can complete 3 personal chats without paying; counter visible in UI.
2. 4th send blocked in UI and API with `assistant_trial_exhausted`.
3. General chat unaffected.
4. Doctor/professional personal/clinical chat unaffected without payment.
5. Chapa assistant purchase unlocks unlimited personal chat immediately after verify.
6. Exhausted user can still open chat history read-only.
7. `npm run build` (backend) and `npx tsc --noEmit` (frontend) pass.
8. No trial count in localStorage.

---

## 10. Out of scope (v2)

- Trial reset per month
- Amharic copy
- Admin “grant 3 more chats”
- Redis-distributed trial counter
- Blurring message content (only composer overlay in v1)
- SSE streaming UI (JSON path sufficient)

---

## 11. Implementation order

1. Backend migration + `PersonalChatAccessService` + tests  
2. Wire chat controller + completion increment  
3. Extend `getMyBilling` + chat config  
4. Frontend types + `PersonalAccessSheet`  
5. Hub + conversation + history UI  
6. Manual QA script below  

### Manual QA script

1. Register personal user, complete onboarding.  
2. `GET /me/billing` → `remaining: 3`, `personalChatAllowed: true`.  
3. Hub → Personal → sheet → Start trial → send 3 messages → chip shows 2,1,0.  
4. 4th message → paywall overlay + 403.  
5. General chat still works.  
6. Pay assistant plan → personal sends work; chip hidden.  

---

**End of prompt.** Implement completely in `MediAI_backend` and `MediAI`. Match existing code style, minimal scope, no unrelated refactors.
