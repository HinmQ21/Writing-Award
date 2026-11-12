export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const STORAGE_KEY = 'writing-award:v1';
export const DRAFT_KEY = 'writing-award:draft:v1';
export type Task = 1 | 2;
export type Page = 'home' | 'collection' | 'journal' | 'scoring' | 'settings';
export type Essay = { id: string; title: string; text: string; task: Task; words: number; date: string; rewarded: boolean; sample?: boolean };
export type Progress = {
  version: 1; demo: boolean; essays: Essay[]; pieces: number; streak: number; freezes: number;
  stars: number; lastRewardDay: string | null; evaluatedDay: string | null; rainyUntil: string | null; sound: boolean;
};
export const WORLDS = [
  { name: "Capy's Dream Cottage", short: 'Nhà Capybara', subtitle: 'Một mái nhà nhỏ, từ những cố gắng mỗi ngày.', theme: 'cottage', color: 'peach' },
  { name: 'Cây Thần Kỳ', short: 'Cây Thần Kỳ', subtitle: 'Để những ý tưởng mới đơm hoa.', theme: 'tree', color: 'mint' },
  { name: 'Lego Capybara', short: 'Lego Capybara', subtitle: 'Từng khối nhỏ, một người bạn thật lớn.', theme: 'lego', color: 'lavender' },
] as const;
export const PIECES = ['Nền nhà', 'Bậc thềm', 'Tường trước', 'Tường bên trái', 'Tường bên phải', 'Tường phía sau', 'Cửa gỗ', 'Cửa sổ tròn', 'Cửa sổ bên', 'Mái đầu hồi', 'Mái nhà bên trái', 'Mái nhà bên phải', 'Ống khói nhỏ', 'Hàng rào bên trái', 'Hàng rào bên phải', 'Cây xanh', 'Bụi hoa', 'Vườn hoa', 'Hòm thư', 'Vương miện của Capy', 'Bảng chào mừng'];

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

const SAMPLE_TEXT = `Some people believe that small daily habits are more important than ambitious goals. I agree with this view because a consistent routine makes progress achievable and helps people develop confidence over time.

First of all, daily habits remove the pressure of completing a large task in a single attempt. A student who writes a short essay every day, for example, has regular opportunities to practise organising ideas and expressing an argument. Each session may seem modest, but the experience gradually becomes a solid foundation. The student also learns which mistakes appear repeatedly and can focus on correcting them in the following session.

Another important benefit is that a manageable routine can survive a busy schedule. Most people cannot dedicate an entire afternoon to learning a new skill. However, they can usually find twenty minutes after breakfast or before going to bed. When this period becomes familiar, starting the activity requires less effort. This is particularly useful for language learners, who benefit from frequent exposure rather than occasional intensive study.

Nevertheless, ambitious goals can still provide direction. Without a clear purpose, a routine may become repetitive or lose its meaning. The most effective approach is therefore to connect a long term objective with small actions that can be repeated comfortably. A learner preparing for an examination might set a target score while concentrating on one useful practice session at a time. Reviewing those sessions occasionally also helps them recognise how far they have come.

In conclusion, goals help us decide where to go, while daily habits make it possible to get there. By keeping each step realistic and valuing steady effort, people can make lasting progress without feeling overwhelmed by the distance that remains.`;
export function createProgress(demo = true, today = dayKey()): Progress {
  return {
    version: 1, demo, pieces: demo ? 12 : 0, streak: demo ? 12 : 0, freezes: demo ? 1 : 0, stars: 3,
    lastRewardDay: demo ? addDays(today, -1) : null, evaluatedDay: today, rainyUntil: null, sound: false,
    essays: demo ? Array.from({ length: 12 }, (_, i) => ({
      id: `sample-${i}`, title: ['The power of daily habits', 'Learning beyond the classroom', 'A greener way to travel', 'Technology and our connections'][i % 4],
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
export function submitEssay(progress: Progress, text: string, task: Task, now = new Date()): { progress: Progress; rewarded: boolean; world: number; piece: number; complete: boolean } {
  const words = wordCount(text);
  if (words < minimumWords(task)) throw new Error(`Task ${task} cần ít nhất ${minimumWords(task)} từ. Bạn còn thiếu ${minimumWords(task) - words} từ.`);
  if (text.length > 100_000) throw new Error('Bài viết quá dài. Vui lòng giữ bài dưới 100.000 ký tự.');
  const today = dayKey(now);
  const current = reconcileProgress(progress, today);
  const newDay = current.lastRewardDay !== today;
  const rewarded = newDay && current.pieces < 63;
  const world = activeWorld(current.pieces);
  const piece = worldPieces(current.pieces, world) + 1;
  const streak = newDay ? current.streak + 1 : current.streak;
  const essay: Essay = { id: crypto.randomUUID(), title: text.trim().split(/[\n.!?]/)[0].slice(0, 90) || `Writing Task ${task}`, text: text.trim(), task, words, date: now.toISOString(), rewarded };
  return { rewarded, world, piece: Math.min(piece, 21), complete: rewarded && current.pieces < 63 && (current.pieces + 1) % 21 === 0, progress: {
    ...current, essays: [essay, ...current.essays], pieces: Math.min(63, current.pieces + (rewarded ? 1 : 0)), streak,
    freezes: newDay && streak % 7 === 0 ? Math.min(2, current.freezes + 1) : current.freezes,
    lastRewardDay: newDay ? today : current.lastRewardDay, evaluatedDay: today, rainyUntil: newDay ? null : current.rainyUntil,
  } };
}
export function parseProgress(raw: string): Progress {
  const p = JSON.parse(raw) as Progress;
  if (p?.version !== 1 || typeof p.demo !== 'boolean' || !Array.isArray(p.essays) || !Number.isInteger(p.pieces) || p.pieces < 0 || p.pieces > 63 || !Number.isInteger(p.streak) || p.streak < 0 || !Number.isInteger(p.freezes) || p.freezes < 0 || p.freezes > 2 || !Number.isInteger(p.stars) || p.stars < 0 || p.stars > 3 || typeof p.sound !== 'boolean' || ![p.lastRewardDay, p.evaluatedDay, p.rainyUntil].every(d => d === null || (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error('Dữ liệu lưu không hợp lệ.');
  for (const e of p.essays) if (!e || typeof e.text !== 'string' || typeof e.title !== 'string' || typeof e.id !== 'string' || ![1, 2].includes(e.task) || !Number.isFinite(Date.parse(e.date)) || !Number.isFinite(e.words) || typeof e.rewarded !== 'boolean') throw new Error('Bài viết lưu không hợp lệ.');
  return p;
}
export function displayDate(value: string): string { return new Intl.DateTimeFormat('vi-VN', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)); }
