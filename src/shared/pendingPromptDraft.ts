import browser from "webextension-polyfill";

const PENDING_PROMPT_DRAFT_KEY = "promptNestPendingPromptDraft";

export interface PendingPromptDraft {
  id: string;
  content: string;
  createdAt: string;
}

export async function storePendingPromptDraft(draft: PendingPromptDraft) {
  await browser.storage.local.set({ [PENDING_PROMPT_DRAFT_KEY]: draft });
}

export async function consumePendingPromptDraft(): Promise<PendingPromptDraft | null> {
  const stored = await browser.storage.local.get(PENDING_PROMPT_DRAFT_KEY);
  await browser.storage.local.remove(PENDING_PROMPT_DRAFT_KEY);
  const value = stored[PENDING_PROMPT_DRAFT_KEY] as Partial<PendingPromptDraft> | undefined;
  return value
    && typeof value.id === "string"
    && typeof value.content === "string"
    && typeof value.createdAt === "string"
    ? value as PendingPromptDraft
    : null;
}
