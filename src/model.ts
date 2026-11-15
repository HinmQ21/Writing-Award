export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const STORAGE_KEY = 'writing-award:v1';
export const DRAFT_KEY = 'writing-award:draft:v1';
export const PROMPT_DRAFTS_KEY = 'writing-award:prompt-drafts:v1';
export type Task = 1 | 2;
export type Page = 'home' | 'collection' | 'journal' | 'scoring' | 'settings';
export type Essay = { id: string; title: string; text: string; task: Task; words: number; date: string; rewarded: boolean; sample?: boolean; promptId?: string; versionNumber?: number };
export type WritingPrompt = { id: string; question: string; task: Task; createdAt: string };
export type PromptSelection = { promptId: string | null; question: string; source?: 'new' | 'saved' };
export type ScoringEssay = Essay & { question?: string };
export type Progress = {
  version: 2; prompts: WritingPrompt[]; demo: boolean; essays: Essay[]; pieces: number; streak: number; freezes: number;
  stars: number; lastRewardDay: string | null; evaluatedDay: string | null; rainyUntil: string | null; sound: boolean;
};
export const WORLDS = [
  { name: "Capy's Dream Cottage", short: 'Capy Cottage', subtitle: 'A cozy little home, built from everyday efforts.', theme: 'cottage', color: 'peach' },
  { name: 'Magic Tree', short: 'Magic Tree', subtitle: 'Let new ideas blossom.', theme: 'tree', color: 'mint' },
  { name: 'Lego Capybara', short: 'Lego Capybara', subtitle: 'Block by block, a true companion.', theme: 'lego', color: 'lavender' },
] as const;
export const PIECES = ['Foundation', 'Step', 'Front wall', 'Left wall', 'Right wall', 'Back wall', 'Wooden door', 'Round window', 'Side window', 'Gable roof', 'Left roof', 'Right roof', 'Little chimney', 'Left fence', 'Right fence', 'Green tree', 'Flower bush', 'Flower garden', 'Mailbox', 'Capy\'s crown', 'Welcome sign'];

export function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
}
export function dayDifference(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}
export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;
}
export function activeWorld(pieces: number): number { return Math.min(2, Math.floor(pieces / 21)); }
export function worldPieces(pieces: number, world: number): number { return Math.min(21, Math.max(0, pieces - world * 21)); }
export function minimumWords(task: Task): number { return task === 1 ? 150 : 250; }
export function promptTitle(question: string): string { const first = question.trim().split('\n')[0]; return first.length > 110 ? first.slice(0, 107).trimEnd() + '…' : first; }
export function essaySource(essay: Essay, progress: Progress): ScoringEssay { return { ...essay, question: progress.prompts.find(prompt => prompt.id === essay.promptId)?.question }; }
export function nextVersion(progress: Progress, promptId: string): number { return 1 + Math.max(0, ...progress.essays.filter(essay => essay.promptId === promptId).map(essay => essay.versionNumber ?? 0)); }
function resolvePrompt(progress: Progress, task: Task, selection: PromptSelection, now: Date): WritingPrompt {
  if (selection.promptId) {
    const prompt = progress.prompts.find(prompt => prompt.id === selection.promptId);
    if (!prompt || prompt.task !== task) throw new Error('Choose a saved prompt for the selected task.');
    return prompt;
  }
  if (selection.source === 'saved') throw new Error('Choose a saved prompt before saving this version.');
  const question = selection.question.trim();
  if (!/[\p{L}\p{N}]/u.test(question)) throw new Error('Add the writing prompt before saving this version.');
  if (question.length > 12_000) throw new Error('Keep the writing prompt under 12,000 characters.');
  // Identical captions can describe different Task 1 charts. Only explicit
  // selection of a saved ID joins versions; New prompt always creates a record.
  return { id: crypto.randomUUID(), question, task, createdAt: now.toISOString() };
}
export function attachPrompt(progress: Progress, essayId: string, selection: PromptSelection, now = new Date()): Progress {
  const essay = progress.essays.find(essay => essay.id === essayId);
  if (!essay || essay.promptId) throw new Error('This entry is no longer available to link. Reopen your journal.');
  const prompt = resolvePrompt(progress, essay.task, selection, now);
  return { ...progress, prompts: progress.prompts.some(item => item.id === prompt.id) ? progress.prompts : [...progress.prompts, prompt], essays: progress.essays.map(item => item.id === essay.id ? { ...item, promptId: prompt.id, versionNumber: nextVersion(progress, prompt.id) } : item) };
}

const SAMPLE_TEXT = `Some people believe that small daily habits are more important than ambitious goals. I agree with this view because a consistent routine makes progress achievable and helps people develop confidence over time.

First of all, daily habits remove the pressure of completing a large task in a single attempt. A student who writes a short essay every day, for example, has regular opportunities to practise organising ideas and expressing an argument. Each session may seem modest, but the experience gradually becomes a solid foundation. The student also learns which mistakes appear repeatedly and can focus on correcting them in the following session.

Another important benefit is that a manageable routine can survive a busy schedule. Most people cannot dedicate an entire afternoon to learning a new skill. However, they can usually find twenty minutes after breakfast or before going to bed. When this period becomes familiar, starting the activity requires less effort. This is particularly useful for language learners, who benefit from frequent exposure rather than occasional intensive study.

Nevertheless, ambitious goals can still provide direction. Without a clear purpose, a routine may become repetitive or lose its meaning. The most effective approach is therefore to connect a long term objective with small actions that can be repeated comfortably. A learner preparing for an examination might set a target score while concentrating on one useful practice session at a time. Reviewing those sessions occasionally also helps them recognise how far they have come.

In conclusion, goals help us decide where to go, while daily habits make it possible to get there. By keeping each step realistic and valuing steady effort, people can make lasting progress without feeling overwhelmed by the distance that remains.`;
export function createProgress(demo = true, today = dayKey()): Progress {
  return {
    version: 2, prompts: demo ? [{ id: 'sample-daily-habits', question: 'Some people believe that small daily habits are more important than ambitious goals. To what extent do you agree or disagree?', task: 2, createdAt: `${addDays(today, -12)}T09:00:00+07:00` }] : [], demo, pieces: demo ? 12 : 0, streak: demo ? 12 : 0, freezes: demo ? 1 : 0, stars: 3,
    lastRewardDay: demo ? addDays(today, -1) : null, evaluatedDay: today, rainyUntil: null, sound: false,
    essays: demo ? Array.from({ length: 12 }, (_, i) => ({
      id: `sample-${i}`, title: 'The power of daily habits', promptId: 'sample-daily-habits', versionNumber: i + 1,
      text: SAMPLE_TEXT, task: 2 as Task, words: wordCount(SAMPLE_TEXT), date: `${addDays(today, i - 12)}T09:00:00+07:00`, rewarded: true, sample: true,
    })).reverse() : [],
  };
}
export function reconcileProgress(progress: Progress, today = dayKey()): Progress {
  if (!progress.lastRewardDay || progress.evaluatedDay === today) return progress;
  const gap = dayDifference(today, progress.lastRewardDay);
  if (gap <= 1) return { ...progress, evaluatedDay: today };
  if (gap === 2 && progress.freezes > 0) return { ...progress, freezes: progress.freezes - 1, evaluatedDay: today };
  return { ...progress, streak: 0, stars: Math.max(0, progress.stars - (progress.streak > 0 ? 1 : 0)), evaluatedDay: today, rainyUntil: progress.streak > 0 ? addDays(today, 1) : progress.rainyUntil };
}
export function submitEssay(progress: Progress, text: string, task: Task, now = new Date(), selection: PromptSelection = { promptId: null, question: '' }): { progress: Progress; rewarded: boolean; world: number; piece: number; complete: boolean } {
  const words = wordCount(text);
  if (words < minimumWords(task)) throw new Error(`Task ${task} needs at least ${minimumWords(task)} words. You still need ${minimumWords(task) - words} words.`);
  if (text.length > 100_000) throw new Error('Piece is too long. Please keep it under 100,000 characters.');
  const today = dayKey(now);
  const current = reconcileProgress(progress, today);
  const prompt = resolvePrompt(current, task, selection, now);
  const newDay = current.lastRewardDay !== today;
  const rewarded = newDay && current.pieces < 63;
  const world = activeWorld(current.pieces);
  const piece = worldPieces(current.pieces, world) + 1;
  const streak = newDay ? current.streak + 1 : current.streak;
  const essay: Essay = { id: crypto.randomUUID(), title: text.trim().split(/[\n.!?]/)[0].slice(0, 90) || `Writing Task ${task}`, text: text.trim(), task, words, date: now.toISOString(), rewarded, promptId: prompt.id, versionNumber: nextVersion(current, prompt.id) };
  return { rewarded, world, piece: Math.min(piece, 21), complete: rewarded && current.pieces < 63 && (current.pieces + 1) % 21 === 0, progress: {
    ...current, prompts: current.prompts.some(item => item.id === prompt.id) ? current.prompts : [...current.prompts, prompt], essays: [essay, ...current.essays], pieces: Math.min(63, current.pieces + (rewarded ? 1 : 0)), streak,
    freezes: newDay && streak % 7 === 0 ? Math.min(2, current.freezes + 1) : current.freezes,
    lastRewardDay: newDay ? today : current.lastRewardDay, evaluatedDay: today, rainyUntil: newDay ? null : current.rainyUntil,
  } };
}
export function parseProgress(raw: string): Progress {
  const p = JSON.parse(raw);
  if (![1, 2].includes(p?.version) || typeof p.demo !== 'boolean' || !Array.isArray(p.essays) || !Number.isInteger(p.pieces) || p.pieces < 0 || p.pieces > 63 || !Number.isInteger(p.streak) || p.streak < 0 || !Number.isInteger(p.freezes) || p.freezes < 0 || p.freezes > 2 || !Number.isInteger(p.stars) || p.stars < 0 || p.stars > 3 || typeof p.sound !== 'boolean' || ![p.lastRewardDay, p.evaluatedDay, p.rainyUntil].every(d => d === null || (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error('Invalid save data.');
  for (const e of p.essays) if (!e || typeof e.text !== 'string' || typeof e.title !== 'string' || typeof e.id !== 'string' || ![1, 2].includes(e.task) || !Number.isFinite(Date.parse(e.date)) || !Number.isFinite(e.words) || typeof e.rewarded !== 'boolean') throw new Error('Invalid saved piece.');
  if (p.version === 1) return { ...p, version: 2, prompts: [], essays: p.essays.map((essay: Essay) => { const { promptId: _promptId, versionNumber: _version, ...original } = essay; return original; }) };
  if (!Array.isArray(p.prompts)) throw new Error('Invalid saved prompts.');
  const ids = new Set<string>(), essayIds = new Set<string>(), versions = new Set<string>();
  for (const prompt of p.prompts) {
    if (!prompt || typeof prompt.id !== 'string' || !prompt.id || ids.has(prompt.id) || typeof prompt.question !== 'string' || !/[\p{L}\p{N}]/u.test(prompt.question) || prompt.question.length > 12_000 || ![1, 2].includes(prompt.task) || !Number.isFinite(Date.parse(prompt.createdAt))) throw new Error('Invalid saved prompt.');
    ids.add(prompt.id);
  }
  for (const essay of p.essays) {
    if (essayIds.has(essay.id)) throw new Error('Duplicate saved entry.'); essayIds.add(essay.id);
    if (essay.promptId === undefined) { if (essay.versionNumber !== undefined) throw new Error('Invalid version without a prompt.'); continue; }
    const prompt = p.prompts.find((prompt: WritingPrompt) => prompt.id === essay.promptId);
    const key = `${essay.promptId}:${essay.versionNumber}`;
    if (!prompt || prompt.task !== essay.task || !Number.isInteger(essay.versionNumber) || essay.versionNumber < 1 || versions.has(key)) throw new Error('Invalid saved version.');
    versions.add(key);
  }
  return p as Progress;
}
export function displayDate(value: string): string { return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)); }
