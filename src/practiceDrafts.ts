import { DRAFT_KEY, PROMPT_DRAFTS_KEY } from './model';
import type { PromptSelection, Task } from './model';
export type PracticeDraft = PromptSelection & { text: string; task: Task };
export const blankPractice = (task: Task = 2, promptId: string | null = null, question = ''): PracticeDraft => ({ text: '', task, promptId, question, source: promptId ? 'saved' : 'new' });
export const draftScope = (draft: PracticeDraft) => draft.promptId ? `prompt:${draft.promptId}` : draft.source === 'saved' ? `saved:${draft.task}` : 'new';
let resetEpoch = 0;
export const practiceDraftEpoch = () => resetEpoch;
export function clearPracticeDrafts(): void { resetEpoch++; localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(PROMPT_DRAFTS_KEY); }
function parseDraft(value: unknown): PracticeDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<PracticeDraft>;
  if (typeof draft.text !== 'string') return null;
  return { text: draft.text.slice(0, 100_000), task: draft.task === 1 ? 1 : 2, question: typeof draft.question === 'string' ? draft.question.slice(0, 12_000) : '', promptId: typeof draft.promptId === 'string' ? draft.promptId : null, source: draft.source === 'saved' || draft.promptId ? 'saved' : 'new' };
}
function bank(): Record<string, PracticeDraft> {
  const raw = localStorage.getItem(PROMPT_DRAFTS_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== 1 || !parsed.drafts || typeof parsed.drafts !== 'object' || Array.isArray(parsed.drafts)) throw new Error('Could not read saved drafts. Please download a backup before starting over.');
  return parsed.drafts;
}
export function readPracticeDraft(): PracticeDraft {
  try { return parseDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')) ?? blankPractice(); } catch { return blankPractice(); }
}
export function readScopedDraft(target: PracticeDraft): PracticeDraft {
  const stored = parseDraft(bank()[draftScope(target)]);
  return stored && draftScope(stored) === draftScope(target) ? { ...stored, ...(target.promptId || target.source === 'saved' ? { task: target.task } : {}), ...(target.promptId ? { question: target.question } : {}) } : target;
}
export function savePracticeDraft(draft: PracticeDraft): void {
  const drafts = bank();
  drafts[draftScope(draft)] = draft;
  localStorage.setItem(PROMPT_DRAFTS_KEY, JSON.stringify({ version: 1, drafts }));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
export function finishPracticeDraft(previous: PracticeDraft, clean: PracticeDraft): void {
  const drafts = bank();
  delete drafts[draftScope(previous)];
  drafts[draftScope(clean)] = clean;
  localStorage.setItem(PROMPT_DRAFTS_KEY, JSON.stringify({ version: 1, drafts }));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(clean));
}
