import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CloudRain, Crown, Download, FileText, Flame, Heart, House, Leaf, Library, LockKeyhole, Minus, NotebookPen, Plus, RotateCcw, Settings, ShieldCheck, Snowflake, Sparkles, Sprout, Star, Sun, Upload, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './scoring/choices.css';
import { BookOpenCheck } from 'lucide-react';
import { activeWorld, createProgress, dayKey, displayDate, DRAFT_KEY, minimumWords, parseProgress, PIECES, reconcileProgress, STORAGE_KEY, submitEssay, TIMEZONE, wordCount, worldPieces, WORLDS } from './model';
import type { Essay, Page, Progress, Task } from './model';
import type { SceneHandle } from './Scene';
import { AppearanceSettings, ThemeToggle } from './theme';
import { readEssayFile, UPLOAD_ACCEPT } from './uploads';
const Scene = lazy(() => import('./Scene'));
const ScoringPage = lazy(() => import('./scoring/ScoringPage'));

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'home', label: 'Your space', icon: House }, { page: 'collection', label: 'Collection', icon: Library }, { page: 'journal', label: 'Writing journal', icon: BookOpen }, { page: 'scoring', label: 'IELTS feedback', icon: BookOpenCheck },
];
function currentPage(): Page { const h = location.hash.slice(1); return ['collection', 'journal', 'scoring', 'settings'].includes(h) ? h as Page : 'home'; }
function readInitial(): { progress: Progress; issue: string; blocked: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { progress: raw ? reconcileProgress(parseProgress(raw)) : createProgress(), issue: '', blocked: false };
  } catch { return { progress: createProgress(false), issue: 'Could not read browser data. Previous data kept safe. You can download a backup in Settings before starting over.', blocked: true }; }
}
function readDraft(): { text: string; task: Task } {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); return { text: typeof d.text === 'string' ? d.text.slice(0, 100_000) : '', task: d.task === 1 ? 1 : 2 }; } catch { return { text: '', task: 2 }; }
}
function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; const trigger = document.activeElement as HTMLElement | null; if (!d.open) d.showModal(); return () => { if (d.open) d.close(); trigger?.focus(); }; }, []);
  return <dialog ref={ref} className={`dialog ${className}`} onCancel={onClose} onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }} onClick={e => { if (e.target === e.currentTarget) { const b = e.currentTarget.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) onClose(); } }} aria-labelledby="dialog-title">
    <button className="icon-button dialog-close" aria-label="Close window" onClick={onClose}><X aria-hidden="true" size={20} /></button>
    <h2 id="dialog-title">{title}</h2>{children}
  </dialog>;
}
function Logo({ compact = false }: { compact?: boolean }) {
  return <a className="brand" href="#home" aria-label="Writing Award, back to your corner"><img src="/favicon.svg" width="48" height="48" alt="" />{!compact && <span>Writing<span>Award<span className="brand-dot">.</span></span></span>}</a>;
}
function LoadingScene() { return <div className="scene-loading"><img src="/favicon.svg" width="64" height="64" alt="" /><span>Capy is opening up...</span></div>; }
function playReward() {
  try { const context = new AudioContext(); [523.25, 659.25, 783.99].forEach((f, i) => { const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = f; gain.gain.setValueAtTime(0, context.currentTime + i * .11); gain.gain.linearRampToValueAtTime(.075, context.currentTime + i * .11 + .03); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + i * .11 + .5); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(context.currentTime + i * .11); oscillator.stop(context.currentTime + i * .11 + .5); }); setTimeout(() => void context.close(), 1200); } catch { /* Audio is optional; the visual reward is always available. */ }
}

const CAPY_NOTES = [
  { src: '/capy-crown.png', alt: 'Capy wearing a crown and smiling', line1: 'A little bit every day.', line2: 'Capy is always here.' },
  { src: '/capy-writer.png', alt: 'Capy reading intently', line1: 'Line by little line.', line2: 'Growing big dreams.' },
  { src: '/capy-cheer.png', alt: 'Capy wearing a beret cheering', line1: 'Today is wonderful!', line2: 'Capy is proud of you.' },
  { src: '/capy-scholar.png', alt: 'Capy scholar reading a book', line1: 'Slow and steady.', line2: 'You are doing great.' },
] as const;

function App() {
  const [initial] = useState(readInitial);
  const [progress, setProgress] = useState(initial.progress);
  const [issue, setIssue] = useState(initial.issue);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [page, setPage] = useState<Page>(currentPage);
  const [help, setHelp] = useState(false);
  const [viewEssay, setViewEssay] = useState<Essay | null>(null);
  const [scoringEssay, setScoringEssay] = useState<Essay | null>(null);
  const [scoreAfterReward, setScoreAfterReward] = useState(false);
  const [reward, setReward] = useState<{ world: number; piece: number; complete: boolean; rewarded: boolean } | null>(null);
  const [animate, setAnimate] = useState(false);
  const [selectedWorld, setSelectedWorld] = useState(activeWorld(progress.pieces));
  const [resetConfirm, setResetConfirm] = useState(false);
  const [toast, setToast] = useState('');
  const [noteOffset, setNoteOffset] = useState(0);
  const sceneRef = useRef<SceneHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastPage = useRef(page);
  const world = activeWorld(progress.pieces);
  const count = worldPieces(progress.pieces, world);
  const doneToday = progress.lastRewardDay === dayKey();
  const baseNoteIdx = page === 'collection' ? 2 : page === 'journal' ? 1 : page === 'settings' ? 3 : doneToday ? 2 : 0;
  const activeNote = CAPY_NOTES[(baseNoteIdx + noteOffset) % CAPY_NOTES.length];
  useEffect(() => {
    const change = () => { if (currentPage() !== 'scoring') setScoringEssay(null); setPage(currentPage()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => { if (lastPage.current !== page) { headingRef.current?.focus(); lastPage.current = page; } }, [page]);
  useEffect(() => {
    if (!initial.blocked) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(initial.progress)); } catch { setIssue('Browser storage not ready. Please allow data saving or download a backup before closing the page.'); }
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) try { setProgress(reconcileProgress(parseProgress(event.newValue))); } catch { setIssue('Could not read data from another tab. You can download a backup in Settings.'); }
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [initial]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);
  function persist(next: Progress, allowOverwrite = false) {
    if (blocked && !allowOverwrite) throw new Error('Please download a backup of your old data and start fresh in Settings before saving a new piece.');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { throw new Error('Could not save because browser storage is blocked or full. Your draft is still right here. Please download your piece before trying again.'); }
    setProgress(next); setIssue('');
  }
  function notify(message: string) { setToast(message); }
  function onSubmit(text: string, task: Task, scoreNow = false) {
    // Re-read at commit so two already-open tabs share the same daily reward.
    let latest = progress;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !blocked) latest = reconcileProgress(parseProgress(stored));
    const result = submitEssay(latest, text, task);
    persist(result.progress); setScoreAfterReward(scoreNow); if (scoreNow) setScoringEssay(result.progress.essays[0]); setReward(result); setAnimate(false); setSelectedWorld(result.world);
    if (progress.sound) playReward();
  }
  function finishReward() { if (scoreAfterReward) { setScoreAfterReward(false); location.hash = 'scoring'; } else if (reward?.complete) { setSelectedWorld(reward.world); location.hash = 'collection'; } setReward(null); setAnimate(true); }
  function advanceDemo() {
    if (!progress.demo) return;
    try { const pieces = Math.min(63, (Math.floor(progress.pieces / 21) + 1) * 21); persist({ ...progress, pieces }); setSelectedWorld(activeWorld(pieces)); setAnimate(false); notify(pieces === 63 ? 'Unlocked all 3 worlds in the sample data.' : `Unlocked ${WORLDS[activeWorld(pieces)].short} in the sample data.`); } catch (error) { setIssue((error as Error).message); }
  }
  function exportData() {
    let value: string; try { value = blocked ? localStorage.getItem(STORAGE_KEY) || JSON.stringify(progress) : JSON.stringify(progress, null, 2); } catch { value = JSON.stringify(progress, null, 2); }
    download(value, `writing-award-${dayKey()}.json`, 'application/json'); notify('Downloaded your data backup.');
  }
  function startFresh() {
    try { persist(createProgress(false), true); setBlocked(false); localStorage.removeItem(DRAFT_KEY); setResetConfirm(false); location.hash = 'home'; notify('A fresh start. Capy is waiting for your first piece.'); } catch (error) { setIssue((error as Error).message); setResetConfirm(false); }
  }
  return <div className="app-shell">
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to main content</a>
    <aside className="sidebar">
      <Logo />
      <nav aria-label="Main navigation" className="side-nav">{NAV.map(({ page: p, label, icon: Icon }) => <a key={p} href={`#${p}`} aria-label={label} aria-current={page === p ? 'page' : undefined}><Icon aria-hidden="true" size={21} /><span>{label}</span>{page === p && <span className="nav-indicator" />}</a>)}</nav>
      <div className="sidebar-bottom">
        <button type="button" className="capy-note" onClick={() => setNoteOffset(n => (n + 1) % CAPY_NOTES.length)} aria-label="Change Capy's expression">
          <div className="note-art"><img src={activeNote.src} width="64" height="64" alt={activeNote.alt} /><Heart aria-hidden="true" size={15} /></div>
          <p>{activeNote.line1}<br /><strong>{activeNote.line2}</strong></p>
          <span className="note-dots" aria-hidden="true">{CAPY_NOTES.map((_, i) => <i key={i} className={i === (baseNoteIdx + noteOffset) % CAPY_NOTES.length ? 'active' : ''} />)}</span>
        </button>
        <button className="nav-button" onClick={() => setHelp(true)}><CircleHelp aria-hidden="true" size={20} /> How to play</button>
        <a className={`nav-button ${page === 'settings' ? 'selected' : ''}`} href="#settings" aria-current={page === 'settings' ? 'page' : undefined}><Settings aria-hidden="true" size={20} /> Settings</a>
        <div className="sidebar-footer"><Leaf aria-hidden="true" size={13} /> Made for your little progress</div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="mobile-brand"><Logo compact /></div><span className="topbar-location"><Sprout aria-hidden="true" size={17} /> Where little things grow big</span><div className="topbar-actions"><ThemeToggle /><span className="demo-badge"><span />{progress.demo ? 'Demo data' : 'Stored locally'}</span><button className="icon-button help-top" aria-label="How-to guide" onClick={() => setHelp(true)}><CircleHelp aria-hidden="true" size={20} /></button><a href="#settings" className="avatar" aria-label="Open settings"><img src="/capy-avatar.png" width="38" height="38" alt="Capy" /></a></div></header>
      <main id="main" tabIndex={-1}>
        {issue && <div className="notice error-notice" role="alert"><ShieldCheck aria-hidden="true" size={20} /><p>{issue}</p><a href="#settings">Settings <ArrowRight aria-hidden="true" size={15} /></a></div>}
        <div className="page-heading"><div><h1 tabIndex={-1} ref={headingRef}>{page === 'home' ? <>One essay, <span>one little piece of happiness.</span></> : page === 'collection' ? 'Your worlds.' : page === 'journal' ? 'Every written page, a step further.' : page === 'scoring' ? 'Understand your writing, take another step forward.' : 'Tailor your cozy corner to fit you.'}</h1><p>{page === 'home' ? 'Hello there! Let\'s build something sweet with Capy today.' : page === 'collection' ? 'Small efforts stay behind as truly beautiful things.' : page === 'journal' ? 'Every piece is kept safe. Every effort is worth remembering.' : page === 'scoring' ? 'Join Capy in reviewing your writing, finding what shines and what can shine even brighter.' : 'A few gentle tweaks for a cozy writing flow.'}</p></div><Sun aria-hidden="true" className="heading-sun" size={40} strokeWidth={1.3} /></div>
        {page === 'home' && <>
          <div className="home-entry"><button className="button secondary quick-write" onClick={() => { document.querySelector('.writing-panel')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); document.getElementById('essay')?.focus({ preventScroll: true }); }}><NotebookPen aria-hidden="true" size={17} /> Write today <ArrowRight aria-hidden="true" size={16} /></button>{progress.demo && <p className="demo-intro"><span>Exploring with {progress.essays.filter(e => e.sample).length} sample pieces.</span> <a href="#settings">Begin your own journey <ArrowRight aria-hidden="true" size={13} /></a></p>}</div>
          <div className="dashboard-grid">
            <div className="world-column">
              <section className="world-panel" aria-labelledby="world-title">
                <div className="world-panel-heading"><div><h2 id="world-title">{WORLDS[world].short} <House aria-hidden="true" size={19} /></h2><p>{WORLDS[world].name}</p></div><span className="world-badge">World {world + 1}<span>/ 3</span></span></div>
                <div className={`scene-stage ${progress.rainyUntil && progress.rainyUntil >= dayKey() ? 'rainy' : ''}`}>
                  <div className="scene-status">{progress.rainyUntil && progress.rainyUntil >= dayKey() ? <><CloudRain aria-hidden="true" size={14} /> A bit of rain, then the sun will return</> : <><span className="status-dot" /> Growing right along with you</>}</div>
                  <div className="scene-stars" role="img" aria-label={`Decorative stars: ${progress.stars} out of 3`}>{[0, 1, 2].map(i => <Star aria-hidden="true" key={i} size={13} className={i < progress.stars ? "filled" : ""} style={{ opacity: i < progress.stars ? 1 : .35 }} />)}</div><Suspense fallback={<LoadingScene />}><Scene ref={sceneRef} world={world} pieces={count} animatePiece={animate} rainy={!!progress.rainyUntil && progress.rainyUntil >= dayKey()} onCapyPet={() => {
                    const quotes = [
                      'Capy: "A little bit every day, you\'re doing wonderfully!"',
                      'Capy: "Take a tiny moment of quiet just for yourself."',
                      'Capy: "Let\'s build another warm little piece together today!"',
                      'Capy is nodding along, reading attentively with you.',
                      'Capy: "Every little written page today, a beautiful world tomorrow."'
                    ];
                    notify(quotes[Math.floor(Math.random() * quotes.length)]);
                    if (progress.sound) playReward();
                  }} /></Suspense>
                  <div className="scene-controls" aria-label="Model controls"><button className="icon-button" aria-label="Rotate model left" onClick={() => sceneRef.current?.rotate(-1)}><ChevronLeft aria-hidden="true" size={17} /></button><button className="icon-button" aria-label="Rotate model right" onClick={() => sceneRef.current?.rotate(1)}><ChevronRight aria-hidden="true" size={17} /></button><span /><button className="icon-button" aria-label="Zoom out model" onClick={() => sceneRef.current?.zoom(-1)}><Minus aria-hidden="true" size={16} /></button><button className="icon-button" aria-label="Zoom in model" onClick={() => sceneRef.current?.zoom(1)}><Plus aria-hidden="true" size={16} /></button><button className="icon-button" aria-label="Reset view" onClick={() => sceneRef.current?.reset()}><RotateCcw aria-hidden="true" size={15} /></button></div>
                  <span className="scene-hint"><Sparkles aria-hidden="true" size={14} /> Tap Capy to interact · Drag to rotate 3D</span>
                </div>
                <div className="world-progress"><div className="progress-heading"><span><Sparkles aria-hidden="true" size={16} /> Piece by piece, a cozy home</span><strong>{count}<span> / 21 pieces</span></strong></div><div className="piece-track" role="progressbar" aria-label="World building progress" aria-valuenow={count} aria-valuemin={0} aria-valuemax={21}>{Array.from({ length: 21 }, (_, i) => <span key={i} className={i < count ? 'earned' : ''} />)}</div><div className="progress-footer"><span>{count === 21 ? 'World completed. So proud of you!' : `Only ${21 - count} writing days left to complete this world.`}</span><a href="#collection">Collection <ArrowRight aria-hidden="true" size={14} /></a></div></div>
              </section>
              <div className="stats-grid">
                <Stat icon={Flame} tone="peach" label="Current streak" value={progress.streak} unit={progress.streak === 1 ? 'day' : 'days'} description="A writing rhythm every day" />
                <Stat icon={Snowflake} tone="blue" label="Streak freeze" value={progress.freezes} unit={progress.freezes === 1 ? 'use' : 'uses'} description={progress.freezes ? 'A day off is totally fine' : 'Earn 1 freeze every 7 writing days'} />
                <Stat icon={NotebookPen} tone="mint" label="Written entries" value={progress.essays.length} unit={progress.essays.length === 1 ? 'essay' : 'essays'} description="Every entry is precious" />
              </div>
            </div>
            <WritingForm complete={progress.pieces === 63} key={progress.demo ? 'demo' : 'real'} doneToday={doneToday} onSubmit={onSubmit} onHelp={() => setHelp(true)} onDraftError={setIssue} />
          </div>
          <div className="daily-note"><span><Leaf aria-hidden="true" size={18} /><span>No need to be perfect. <strong>Just be here and write a little more.</strong></span></span>{progress.demo && <button className="text-button" onClick={advanceDemo} disabled={progress.pieces >= 63}><LockKeyhole aria-hidden="true" size={14} /> {progress.pieces >= 63 ? 'All sample worlds unlocked' : 'View next world'}<ArrowRight aria-hidden="true" size={14} /></button>}</div>
        </>}
        {page === 'collection' && <Collection progress={progress} selected={selectedWorld} onSelect={setSelectedWorld} onAdvance={advanceDemo} />}
        {page === 'journal' && <Journal essays={progress.essays} onView={setViewEssay} onScore={essay => { setScoringEssay(essay); location.hash = 'scoring'; }} />}
        {page === 'scoring' && <Suspense fallback={<p role="status">Opening grading corner…</p>}><ScoringPage key={scoringEssay?.id || 'draft'} prefill={scoringEssay} essays={progress.essays} /></Suspense>}
        {page === 'settings' && <section className="settings-content" aria-label="App settings"><AppearanceSettings /><div className="settings-group"><h2>Your writing rhythm</h2><div className="setting-row"><span><strong>Reward sounds</strong><small>A gentle sound when you finish writing.</small></span><button className={`switch ${progress.sound ? 'on' : ''}`} role="switch" aria-checked={progress.sound} aria-label="Reward sounds" onClick={() => { try { persist({ ...progress, sound: !progress.sound }); if (!progress.sound) playReward(); } catch (error) { setIssue((error as Error).message); } }}><span /></button></div><div className="setting-row"><span><strong>Your timezone</strong><small>A new day begins at 00:00 Vietnam time.</small></span><span className="timezone">UTC+7 · Vietnam</span></div><div className="setting-row"><span><strong>Gentle motion</strong><small>Follows your device's reduced motion settings.</small></span><Leaf aria-hidden="true" size={22} className="muted-icon" /></div></div><div className="settings-group"><h2>Your data</h2><p className="settings-intro">Entries and progress are saved in this browser. Please download a backup before clearing browser data or switching devices.</p><div className="setting-row"><span><strong>Download data backup</strong><small>All entries and progress in JSON format.</small></span><button className="button secondary" onClick={exportData}><Download aria-hidden="true" size={16} /> Download backup</button></div><div className="setting-row"><span><strong>{progress.demo ? 'Start your own journey' : 'Start over from scratch'}</strong><small>{progress.demo ? 'Clear samples, entries, and drafts to start from the very first piece.' : 'Clear all entries, drafts, and progress on this device.'}</small></span><button className="button secondary" onClick={() => setResetConfirm(true)}><RotateCcw aria-hidden="true" size={16} /> Start fresh</button></div></div><div className="demo-explanation"><Sprout aria-hidden="true" size={24} /><div><h3>A demo, a peaceful corner.</h3><p>Writing Award saves progress locally; no account or device sync yet. You can get AI feedback in the IELTS feedback section. {progress.demo ? 'You are exploring with 12 sample entries.' : 'You are writing with your own data.'} Earn one piece per valid day; extra entries are still saved to your journal.</p><button className="text-button" onClick={() => setHelp(true)}>Learn how it works <ArrowRight aria-hidden="true" size={15} /></button></div></div></section>}
        <footer className="page-footer"><span>Writing Award <span>·</span> One essay. One little piece of happiness.</span><span><ShieldCheck aria-hidden="true" size={13} />{page === 'scoring' ? 'Grading via Gemini · Estimated Band' : 'Saved only on your browser'}</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{[...NAV, { page: 'settings' as Page, label: 'Settings', icon: Settings }].map(({ page: p, label, icon: Icon }) => <a key={p} href={`#${p}`} aria-label={label} aria-current={page === p ? 'page' : undefined}><Icon aria-hidden="true" size={22} /><span>{label}</span></a>)}</nav>
    <div className="toast" role="status" aria-live="polite">{toast && <span><CheckCheck aria-hidden="true" size={18} />{toast}</span>}</div>
    {help && <Dialog title="Every entry, every piece of happiness." onClose={() => setHelp(false)}><p className="dialog-intro">Just a little time each day. Capy will help you build a world.</p><ol className="help-steps"><li><NotebookPen aria-hidden="true" /><div><h3>Write an IELTS essay</h3><p>Task 1 from 150 words, Task 2 from 250 words. Paste your text or upload a Word .docx, .txt, or .md file.</p></div></li><li><Sparkles aria-hidden="true" /><div><h3>Get one piece every day</h3><p>The first valid entry of the day earns a piece and grows your streak. Extra entries are saved without adding a piece.</p></div></li><li><House aria-hidden="true" /><div><h3>Build a whole world</h3><p>Complete the Capy Cottage in 21 writing days, then work towards the Magic Tree and Lego Capybara. Built structures are always kept.</p></div></li><li><Snowflake aria-hidden="true" /><div><h3>A day off is totally fine</h3><p>Earn 1 freeze every 7 consecutive days (max 2). Miss a day to auto-use 1 freeze to keep your streak, no piece earned. Miss more than a day or run out of freezes: your streak resets to 0, you lose 1 decorative star, and a little rain appears temporarily. Pieces and entries remain safe.</p></div></li></ol><p className="help-footnote">Days are calculated by {TIMEZONE} (UTC+7). Progress is saved locally. The IELTS feedback section provides AI band estimates; rewards are based on your daily writing practice.</p><button className="button primary full-width" onClick={() => setHelp(false)}>Got it <Heart aria-hidden="true" size={17} /></button></Dialog>}
    {reward && <Dialog title={reward.rewarded ? reward.complete ? 'A world has taken shape!' : 'You did wonderfully today!' : 'One more entry, one more step forward.'} onClose={finishReward} className="reward-dialog">{reward.rewarded && <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>}<div className="reward-art"><span className="reward-star s1"><Sparkles aria-hidden="true" size={24} /></span>{reward.complete ? <Crown aria-hidden="true" size={70} strokeWidth={1.3} /> : reward.rewarded ? <Suspense fallback={<House aria-hidden="true" size={70} strokeWidth={1.3} />}><Scene world={reward.world} pieces={reward.piece} miniature rewardPiece /></Suspense> : <BookOpen aria-hidden="true" size={70} strokeWidth={1.3} />}<span className="reward-star s2"><Star aria-hidden="true" size={20} /></span></div><p>{reward.rewarded ? reward.complete ? '21 days of small efforts. A truly proud creation.' : 'An entry has been saved. Something sweet just grew.' : progress.pieces === 63 ? 'All three worlds are complete. New entries are still saved, and your writing streak continues!' : 'Entry saved to your journal. You\'ve already got today\'s piece; let\'s build more tomorrow.'}</p>{reward.rewarded && <div className="reward-piece"><Sparkles aria-hidden="true" size={18} /><strong>{reward.complete ? `${WORLDS[reward.world].short} · 21/21 pieces` : reward.world === 0 ? PIECES[reward.piece - 1] : `Piece ${reward.piece} · ${WORLDS[reward.world].short}`}</strong></div>}{reward.complete && reward.world < 2 && <p className="unlock-note"><LockKeyhole aria-hidden="true" size={16} />{WORLDS[reward.world + 1].short} unlocked! A valid submission tomorrow will build the first piece.</p>}<button className="button primary full-width" onClick={finishReward}>{scoreAfterReward ? 'Continue grading' : 'Back to the build'} <ArrowRight aria-hidden="true" size={17} /></button></Dialog>}
    {viewEssay && <Dialog title={viewEssay.title} onClose={() => setViewEssay(null)} className="essay-dialog"><div className="essay-meta"><span>Task {viewEssay.task}</span><span>{viewEssay.words} words</span><span>{displayDate(viewEssay.date)}</span>{viewEssay.sample && <span>Sample data</span>}</div><article className="essay-text" lang="en">{viewEssay.text}</article><button className="button primary" onClick={() => { setScoringEssay(viewEssay); setViewEssay(null); location.hash = 'scoring'; }}><BookOpenCheck aria-hidden="true" size={17} /> Grade this piece</button> <button className="button secondary" onClick={() => download(viewEssay.text, `writing-${viewEssay.id}.txt`, 'text/plain')}><ArrowDownToLine aria-hidden="true" size={16} /> Download essay</button></Dialog>}
    {resetConfirm && <Dialog title="Start a new journey?" onClose={() => setResetConfirm(false)}><p className="dialog-intro">Current writing, drafts, and progress on this device will be cleared. You can download a backup first to keep your hard work.</p><div className="dialog-actions"><button className="button secondary" onClick={exportData}><Download aria-hidden="true" size={16} /> Download backup</button><button className="button secondary" onClick={() => setResetConfirm(false)}>Keep this journey</button><button className="button danger" onClick={startFresh}>Clear and start fresh</button></div></Dialog>}
  </div>;
}

function Stat({ icon: Icon, tone, label, value, unit, description }: { icon: LucideIcon; tone: string; label: string; value: number; unit: string; description: string }) {
  return <div className={`stat stat-${tone}`}><div className="stat-top"><span className="stat-icon"><Icon aria-hidden="true" size={21} /></span><span>{label}</span></div><div className="stat-value">{value}<span>{unit}</span></div><p>{description}</p></div>;
}
function WritingForm({ complete, doneToday, onSubmit, onHelp, onDraftError }: { complete: boolean; doneToday: boolean; onSubmit: (text: string, task: Task, scoreNow?: boolean) => void; onHelp: () => void; onDraftError: (message: string) => void }) {
  const [draft] = useState(readDraft);
  const [scoreNow, setScoreNow] = useState(false);
  const [text, setText] = useState(draft.text);
  const [task, setTask] = useState<Task>(draft.task);
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const words = wordCount(text), minimum = minimumWords(task), ready = words >= minimum;
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, task })); setSavedDraft(!!text); } catch { setSavedDraft(false); onDraftError('Couldn\'t auto-save draft. You can download your writing to keep it safe.'); }
    }, 450); return () => clearTimeout(t);
  }, [text, task, onDraftError]);
  useEffect(() => () => { const controller = uploadController.current; uploadController.current = null; controller?.abort(); }, []);
  async function uploadFile(file: File | undefined) {
    if (!file || busyRef.current) return;
    uploadController.current?.abort();
    const controller = new AbortController(); uploadController.current = controller;
    setReading(true); setError('');
    try {
      const value = await readEssayFile(file, controller.signal);
      if (controller.signal.aborted) return;
      setText(value); setFileName(file.name); setSavedDraft(false); setMode('paste');
      requestAnimationFrame(() => textRef.current?.focus({ preventScroll: true }));
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Couldn\'t read the file. Please try again or paste your writing directly.');
    } finally {
      if (uploadController.current === controller) { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busyRef.current) return;
    if (!ready) { setError(`Task ${task} needs at least ${minimum} words. You still need ${minimum - words} more words.`); setMode('paste'); requestAnimationFrame(() => textRef.current?.focus()); return; }
    busyRef.current = true; setSaving(true); setError('');
    try { await new Promise<void>(r => setTimeout(r, 180)); onSubmit(text, task, scoreNow); setText(''); setFileName(''); setSavedDraft(false); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save writing. Your draft is still here—let\'s try again.'); } finally { busyRef.current = false; setSaving(false); }
  }
  return <section className="writing-panel" aria-labelledby="writing-title"><div className="writing-heading"><span className="writing-icon"><NotebookPen aria-hidden="true" size={22} /></span><h2 id="writing-title">What would you like to write today?</h2><img className="writing-capy-mascot" src="/capy-writer.png" width="52" height="43" alt="" aria-hidden="true" /></div><p className="writing-description">Take a little time just for you.<br />Capy will be right here waiting.</p><form onSubmit={submit} noValidate>
    <fieldset className="task-selector"><legend>Choose writing type</legend>{([1, 2] as Task[]).map(t => <label key={t} className={task === t ? 'checked' : ''}><input type="radio" name="task" value={t} checked={task === t} onChange={() => { setTask(t); setError(''); }} /><span>Task {t}<small>{minimumWords(t)}+ words</small></span>{task === t && <Check aria-hidden="true" size={14} />}</label>)}</fieldset>
    <div className="input-tabs" role="tablist" aria-label="Import writing"><button type="button" role="tab" id="paste-tab" aria-selected={mode === 'paste'} aria-controls="writing-input" onClick={() => setMode('paste')} onKeyDown={e => { if (e.key === 'ArrowRight') { setMode('upload'); document.getElementById('upload-tab')?.focus(); } }} tabIndex={mode === 'paste' ? 0 : -1}><FileText aria-hidden="true" size={15} /> Paste writing</button><button type="button" role="tab" id="upload-tab" aria-selected={mode === 'upload'} aria-controls="writing-upload" onClick={() => setMode('upload')} onKeyDown={e => { if (e.key === 'ArrowLeft') { setMode('paste'); document.getElementById('paste-tab')?.focus(); } }} tabIndex={mode === 'upload' ? 0 : -1}><Upload aria-hidden="true" size={15} /> Upload file</button></div>
    {mode === 'paste' && (reading ? <p className="import-notice" role="status">Reading file content… Hang on just a moment.</p> : fileName && <p className="import-notice" role="status"><FileText aria-hidden="true" size={15} /><span>Read <strong>{fileName}</strong>. You can edit the content before saving.</span></p>)}
    {mode === 'paste' ? <div id="writing-input" role="tabpanel" aria-labelledby="paste-tab" className={`editor ${error ? 'has-error' : ''}`}><label className="sr-only" htmlFor="essay">IELTS Writing Task {task}</label><textarea id="essay" ref={textRef} value={text} maxLength={100_000} readOnly={reading} onChange={e => { setText(e.target.value); setError(''); setSavedDraft(false); }} placeholder={`Paste your Writing Task ${task} here…\n\nEvery little word is a big step forward.`} aria-describedby={`word-count ${error ? 'form-error' : 'writing-note'}`} aria-invalid={!!error} spellCheck={false} lang="en" /><div className="editor-footer"><span className="draft-status">{savedDraft ? <><Check aria-hidden="true" size={12} /> Draft saved</> : fileName ? <><FileText aria-hidden="true" size={12} /> File read</> : 'Your cozy corner'}</span><span id="word-count" className={`word-count ${ready ? 'ready' : ''}`}>{ready && <Check aria-hidden="true" size={12} />}<strong>{words}</strong> / {minimum} words</span></div></div> : <div id="writing-upload" role="tabpanel" aria-labelledby="upload-tab" className="upload-panel" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void uploadFile(e.dataTransfer.files[0]); }}><Upload aria-hidden="true" size={30} strokeWidth={1.4} /><strong>{reading ? 'Reading writing…' : 'Bring your writing here'}</strong><p>Drag and drop files or choose from device</p><button type="button" className="button secondary" disabled={reading} onClick={() => fileRef.current?.click()}>Choose writing file</button><small>Word (.docx), TXT, Markdown · up to 5 MB</small></div>}
    <input className="sr-only" tabIndex={-1} type="file" accept={UPLOAD_ACCEPT} disabled={reading || saving} ref={fileRef} aria-label="Choose Word DOCX, TXT, or Markdown file" onChange={e => void uploadFile(e.target.files?.[0])} />
    {error && <p className="form-error" id="form-error" role="alert">{error}{text && <button className="text-button" type="button" onClick={() => download(text, 'writing-draft.txt', 'text/plain')}><Download aria-hidden="true" size={13} /> Download draft</button>}</p>}
    <p className="writing-note" id="writing-note">{complete ? <><CheckCheck aria-hidden="true" size={14} /> Three worlds completed. Let's keep writing.</> : doneToday ? <><CheckCheck aria-hidden="true" size={14} /> Today's piece received. New writing will still be saved.</> : <><Sprout aria-hidden="true" size={15} /> Reach {minimum} words, and a new piece is yours.</>}</p>
    <div className="home-score-choice"><label><input type="checkbox" checked={scoreNow} onChange={event => setScoreNow(event.target.checked)} disabled={saving || reading} /><span>Get IELTS feedback for this piece</span></label><p>{scoreNow ? 'After saving, you can add the prompt, task type, and prompt image (Task 1) in the next step. Sent to Gemini only when you click Score IELTS essay.' : 'You can just save and claim today\'s piece, then score it from your journal anytime.'}</p></div>
    <button className="button primary submit-button" type="submit" disabled={saving || reading}>{saving ? <><span className="spinner" /> Saving writing…</> : <><NotebookPen aria-hidden="true" size={18} />{scoreNow ? 'Save & continue grading' : complete ? 'Save writing' : doneToday ? 'Save another writing' : 'Save & claim piece'}<ArrowRight aria-hidden="true" size={18} /></>}</button>
  </form><div className="writing-reassurance"><ShieldCheck aria-hidden="true" size={14} /> Writing is saved only on your browser.</div><a className="text-button writing-help" href="#scoring"><BookOpenCheck aria-hidden="true" size={14} /> Get IELTS feedback for writing <ArrowRight aria-hidden="true" size={14} /></a><button className="text-button writing-help" onClick={onHelp}>How is a piece calculated? <CircleHelp aria-hidden="true" size={13} /></button></section>;
}
function Collection({ progress, selected, onSelect, onAdvance }: { progress: Progress; selected: number; onSelect: (world: number) => void; onAdvance: () => void }) {
  const available = activeWorld(progress.pieces);
  return <section className="collection-content" aria-label="World collection"><div className="collection-grid">{WORLDS.map((w, i) => {
    const count = worldPieces(progress.pieces, i), locked = i > available, complete = count === 21;
    return <button key={w.name} className={`collection-world ${w.color} ${locked ? 'locked' : ''} ${selected === i ? 'active' : ''}`} onClick={() => onSelect(i)} disabled={locked} aria-pressed={selected === i} aria-describedby={`world-desc-${i}`}><div className="collection-world-top"><span>World {i + 1}</span>{locked ? <LockKeyhole aria-hidden="true" size={18} /> : complete ? <CheckCheck aria-hidden="true" size={19} /> : <Sprout aria-hidden="true" size={18} />}</div><div className="collection-preview"><Suspense fallback={<LoadingScene />}><Scene world={i} pieces={locked ? 21 : Math.max(count, 1)} miniature /></Suspense>{locked && <span className="locked-overlay"><LockKeyhole aria-hidden="true" size={24} /></span>}</div><h2>{w.short}</h2><p>{w.subtitle}</p><span className="collection-world-state" id={`world-desc-${i}`}>{locked ? `Complete ${WORLDS[i - 1].short} to unlock` : complete ? 'Completed · 21/21 pieces' : `${count}/21 pieces · Under construction`}</span></button>;
  })}</div><div className="collection-detail"><div className="section-title-row"><h2>Your {WORLDS[selected].short}</h2><a href="#home" className="text-button">Back to writing practice <ArrowRight aria-hidden="true" size={16} /></a></div><p className="muted">The pieces you've earned will always stay here.</p><div className="piece-list">{Array.from({ length: 21 }, (_, i) => <div key={i} className={i < worldPieces(progress.pieces, selected) ? 'piece earned' : 'piece'}><span>{i < worldPieces(progress.pieces, selected) ? <Check aria-hidden="true" size={16} /> : <LockKeyhole aria-hidden="true" size={14} />}</span><span>{selected === 0 ? PIECES[i] : `Piece ${i + 1}`}</span><small>{i < worldPieces(progress.pieces, selected) ? 'Placed' : `Day ${i + 1}`}</small></div>)}</div></div>{progress.demo && <div className="notice demo-notice"><Sparkles aria-hidden="true" size={20} /><p>You're viewing sample progress. Explore the next world to try switching chapters.</p><button className="button secondary" onClick={onAdvance} disabled={progress.pieces >= 63}>{progress.pieces >= 63 ? 'All worlds unlocked' : 'View next world'}<ArrowRight aria-hidden="true" size={15} /></button></div>}</section>;
}
function Journal({ essays, onView, onScore }: { essays: Essay[]; onView: (essay: Essay) => void; onScore: (essay: Essay) => void }) {
  const [query, setQuery] = useState(''); const [task, setTask] = useState('all');
  const filtered = essays.filter(e => (task === 'all' || String(e.task) === task) && `${e.title} ${e.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="journal-content" aria-label="Writing log"><div className="journal-tools"><label className="search-field"><BookOpen aria-hidden="true" size={18} /><span className="sr-only">Find piece</span><input type="search" placeholder="Find a piece..." value={query} onChange={e => setQuery(e.target.value)} /></label><label className="filter-field"><span className="sr-only">Filter type</span><select value={task} onChange={e => setTask(e.target.value)}><option value="all">All types</option><option value="1">Task 1</option><option value="2">Task 2</option></select><ChevronDown aria-hidden="true" size={16} /></label></div><div className="journal-count" role="status">{filtered.length} piece <span>· Every piece is a cherished effort</span></div>{filtered.length ? <div className="journal-list">{filtered.map(e => <div key={e.id} className="journal-entry-wrap"><button className="journal-entry" onClick={() => onView(e)}><span className="entry-icon"><FileText aria-hidden="true" size={24} strokeWidth={1.5} /></span><span className="entry-main"><strong>{e.title}</strong><span>Task {e.task}<i />{e.words} words<i />{displayDate(e.date)}{e.sample && <span className="sample-tag">Sample</span>}</span></span><span className="entry-reward">{e.rewarded ? <><Sparkles aria-hidden="true" size={15} /> Pieces received</> : <><Check aria-hidden="true" size={15} /> Saved</>}</span><ChevronRight aria-hidden="true" size={18} /></button><button className="button secondary journal-score-action" aria-label={`Review: ${e.title}`} onClick={() => onScore(e)}><BookOpenCheck size={16} aria-hidden="true" /> Score essay</button></div>)}</div> : <div className="empty-state"><BookOpen aria-hidden="true" size={44} strokeWidth={1.2} /><h2>{query || task !== 'all' ? 'No pages found here yet.' : 'Your first page is waiting for you.'}</h2><p>{query || task !== 'all' ? 'Try a different keyword or view all types.' : 'Your pieces will be kept right here, day by day.'}</p>{query || task !== 'all' ? <button className="button secondary" onClick={() => { setQuery(''); setTask('all'); }}>Clear filters</button> : <a className="button primary" href="#home">Write first piece <ArrowRight aria-hidden="true" size={17} /></a>}</div>}</section>;
}
function download(value: string, filename: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default App;
