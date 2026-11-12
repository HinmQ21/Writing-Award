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
  { page: 'home', label: 'Góc của bạn', icon: House }, { page: 'collection', label: 'Bộ sưu tập', icon: Library }, { page: 'journal', label: 'Nhật ký viết', icon: BookOpen }, { page: 'scoring', label: 'Chấm bài IELTS', icon: BookOpenCheck },
];
function currentPage(): Page { const h = location.hash.slice(1); return ['collection', 'journal', 'scoring', 'settings'].includes(h) ? h as Page : 'home'; }
function readInitial(): { progress: Progress; issue: string; blocked: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { progress: raw ? reconcileProgress(parseProgress(raw)) : createProgress(), issue: '', blocked: false };
  } catch { return { progress: createProgress(false), issue: 'Chưa đọc được dữ liệu trên trình duyệt. Dữ liệu cũ được giữ nguyên. Bạn có thể tải bản sao ở Cài đặt trước khi bắt đầu lại.', blocked: true }; }
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
    <button className="icon-button dialog-close" aria-label="Đóng cửa sổ" onClick={onClose}><X aria-hidden="true" size={20} /></button>
    <h2 id="dialog-title">{title}</h2>{children}
  </dialog>;
}
function Logo({ compact = false }: { compact?: boolean }) {
  return <a className="brand" href="#home" aria-label="Writing Award, về góc của bạn"><img src="/favicon.svg" width="48" height="48" alt="" />{!compact && <span>Writing<span>Award<span className="brand-dot">.</span></span></span>}</a>;
}
function LoadingScene() { return <div className="scene-loading"><img src="/favicon.svg" width="64" height="64" alt="" /><span>Capy đang mở cửa…</span></div>; }
function playReward() {
  try { const context = new AudioContext(); [523.25, 659.25, 783.99].forEach((f, i) => { const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = f; gain.gain.setValueAtTime(0, context.currentTime + i * .11); gain.gain.linearRampToValueAtTime(.075, context.currentTime + i * .11 + .03); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + i * .11 + .5); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(context.currentTime + i * .11); oscillator.stop(context.currentTime + i * .11 + .5); }); setTimeout(() => void context.close(), 1200); } catch { /* Audio is optional; the visual reward is always available. */ }
}

const CAPY_NOTES = [
  { src: '/capy-crown.png', alt: 'Capy đội vương miện mỉm cười', line1: 'Mỗi ngày một chút.', line2: 'Capy luôn ở đây.' },
  { src: '/capy-writer.png', alt: 'Capy chăm chú đọc bài viết', line1: 'Từng dòng chữ nhỏ.', line2: 'Nuôi lớn ước mơ.' },
  { src: '/capy-cheer.png', alt: 'Capy đội mũ nồi cổ vũ', line1: 'Hôm nay thật tuyệt!', line2: 'Capy tự hào về bạn.' },
  { src: '/capy-scholar.png', alt: 'Capy học giả đọc sách', line1: 'Chậm rãi mà bền bỉ.', line2: 'Bạn đang làm rất tốt.' },
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
    if (!initial.blocked) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(initial.progress)); } catch { setIssue('Bộ nhớ trình duyệt chưa sẵn sàng. Hãy cho phép lưu dữ liệu hoặc tải bản sao trước khi đóng trang.'); }
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) try { setProgress(reconcileProgress(parseProgress(event.newValue))); } catch { setIssue('Dữ liệu từ tab khác chưa đọc được. Bạn có thể tải bản sao trong Cài đặt.'); }
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [initial]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);
  function persist(next: Progress, allowOverwrite = false) {
    if (blocked && !allowOverwrite) throw new Error('Hãy tải bản sao dữ liệu cũ và bắt đầu lại trong Cài đặt trước khi lưu bài mới.');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { throw new Error('Chưa lưu được vì bộ nhớ trình duyệt bị chặn hoặc đã đầy. Bản nháp vẫn còn ở đây. Hãy tải bài về trước khi thử lại.'); }
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
    try { const pieces = Math.min(63, (Math.floor(progress.pieces / 21) + 1) * 21); persist({ ...progress, pieces }); setSelectedWorld(activeWorld(pieces)); setAnimate(false); notify(pieces === 63 ? 'Đã mở đủ 3 thế giới trong dữ liệu mẫu.' : `Đã mở ${WORLDS[activeWorld(pieces)].short} trong dữ liệu mẫu.`); } catch (error) { setIssue((error as Error).message); }
  }
  function exportData() {
    let value: string; try { value = blocked ? localStorage.getItem(STORAGE_KEY) || JSON.stringify(progress) : JSON.stringify(progress, null, 2); } catch { value = JSON.stringify(progress, null, 2); }
    download(value, `writing-award-${dayKey()}.json`, 'application/json'); notify('Đã tải bản sao dữ liệu của bạn.');
  }
  function startFresh() {
    try { persist(createProgress(false), true); setBlocked(false); localStorage.removeItem(DRAFT_KEY); setResetConfirm(false); location.hash = 'home'; notify('Một khởi đầu mới. Capy đang chờ bài viết đầu tiên của bạn.'); } catch (error) { setIssue((error as Error).message); setResetConfirm(false); }
  }
  return <div className="app-shell">
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Đi tới nội dung chính</a>
    <aside className="sidebar">
      <Logo />
      <nav aria-label="Điều hướng chính" className="side-nav">{NAV.map(({ page: p, label, icon: Icon }) => <a key={p} href={`#${p}`} aria-label={label} aria-current={page === p ? 'page' : undefined}><Icon aria-hidden="true" size={21} /><span>{label}</span>{page === p && <span className="nav-indicator" />}</a>)}</nav>
      <div className="sidebar-bottom">
        <button type="button" className="capy-note" onClick={() => setNoteOffset(n => (n + 1) % CAPY_NOTES.length)} aria-label="Đổi biểu cảm của Capy">
          <div className="note-art"><img src={activeNote.src} width="64" height="64" alt={activeNote.alt} /><Heart aria-hidden="true" size={15} /></div>
          <p>{activeNote.line1}<br /><strong>{activeNote.line2}</strong></p>
          <span className="note-dots" aria-hidden="true">{CAPY_NOTES.map((_, i) => <i key={i} className={i === (baseNoteIdx + noteOffset) % CAPY_NOTES.length ? 'active' : ''} />)}</span>
        </button>
        <button className="nav-button" onClick={() => setHelp(true)}><CircleHelp aria-hidden="true" size={20} /> Cách chơi</button>
        <a className={`nav-button ${page === 'settings' ? 'selected' : ''}`} href="#settings" aria-current={page === 'settings' ? 'page' : undefined}><Settings aria-hidden="true" size={20} /> Cài đặt</a>
        <div className="sidebar-footer"><Leaf aria-hidden="true" size={13} /> Made for your little progress</div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="mobile-brand"><Logo compact /></div><span className="topbar-location"><Sprout aria-hidden="true" size={17} /> Nơi những điều nhỏ lớn lên</span><div className="topbar-actions"><ThemeToggle /><span className="demo-badge"><span />{progress.demo ? 'Dữ liệu demo' : 'Lưu trên máy'}</span><button className="icon-button help-top" aria-label="Hướng dẫn cách chơi" onClick={() => setHelp(true)}><CircleHelp aria-hidden="true" size={20} /></button><a href="#settings" className="avatar" aria-label="Mở cài đặt"><img src="/capy-avatar.png" width="38" height="38" alt="Capy" /></a></div></header>
      <main id="main" tabIndex={-1}>
        {issue && <div className="notice error-notice" role="alert"><ShieldCheck aria-hidden="true" size={20} /><p>{issue}</p><a href="#settings">Cài đặt <ArrowRight aria-hidden="true" size={15} /></a></div>}
        <div className="page-heading"><div><h1 tabIndex={-1} ref={headingRef}>{page === 'home' ? <>Một bài viết, <span>một mảnh hạnh phúc.</span></> : page === 'collection' ? 'Những thế giới của bạn.' : page === 'journal' ? 'Mỗi trang viết, một bước xa hơn.' : page === 'scoring' ? 'Hiểu bài viết, tiến thêm một bước.' : 'Để góc nhỏ hợp với bạn.'}</h1><p>{page === 'home' ? 'Chào bạn! Cùng Capy xây một điều dễ thương hôm nay nhé.' : page === 'collection' ? 'Những cố gắng nhỏ, ở lại thành những điều thật đẹp.' : page === 'journal' ? 'Mọi bài viết đều được giữ lại. Mọi cố gắng đều đáng nhớ.' : page === 'scoring' ? 'Cùng Capy đọc lại bài viết, tìm điều tốt và điều có thể tốt hơn.' : 'Một vài tùy chỉnh nhỏ để viết thật thoải mái.'}</p></div><Sun aria-hidden="true" className="heading-sun" size={40} strokeWidth={1.3} /></div>
        {page === 'home' && <>
          <div className="home-entry"><button className="button secondary quick-write" onClick={() => { document.querySelector('.writing-panel')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); document.getElementById('essay')?.focus({ preventScroll: true }); }}><NotebookPen aria-hidden="true" size={17} /> Viết hôm nay <ArrowRight aria-hidden="true" size={16} /></button>{progress.demo && <p className="demo-intro"><span>Đang khám phá với {progress.essays.filter(e => e.sample).length} bài viết mẫu.</span> <a href="#settings">Bắt đầu hành trình riêng <ArrowRight aria-hidden="true" size={13} /></a></p>}</div>
          <div className="dashboard-grid">
            <div className="world-column">
              <section className="world-panel" aria-labelledby="world-title">
                <div className="world-panel-heading"><div><h2 id="world-title">{WORLDS[world].short} <House aria-hidden="true" size={19} /></h2><p>{WORLDS[world].name}</p></div><span className="world-badge">Thế giới {world + 1}<span>/ 3</span></span></div>
                <div className={`scene-stage ${progress.rainyUntil && progress.rainyUntil >= dayKey() ? 'rainy' : ''}`}>
                  <div className="scene-status">{progress.rainyUntil && progress.rainyUntil >= dayKey() ? <><CloudRain aria-hidden="true" size={14} /> Một chút mưa, rồi nắng sẽ về</> : <><span className="status-dot" /> Đang lớn lên cùng bạn</>}</div>
                  <div className="scene-stars" role="img" aria-label={`Sao trang trí: ${progress.stars} trên 3`}>{[0, 1, 2].map(i => <Star aria-hidden="true" key={i} size={13} className={i < progress.stars ? "filled" : ""} style={{ opacity: i < progress.stars ? 1 : .35 }} />)}</div><Suspense fallback={<LoadingScene />}><Scene ref={sceneRef} world={world} pieces={count} animatePiece={animate} rainy={!!progress.rainyUntil && progress.rainyUntil >= dayKey()} onCapyPet={() => {
                    const quotes = [
                      'Capy: "Mỗi ngày một chút, bạn đang làm rất tốt!"',
                      'Capy: "Dành một khoảng tĩnh lặng nhỏ cho riêng mình nhé."',
                      'Capy: "Hôm nay cùng mình xây thêm một mảnh ấm áp nhé!"',
                      'Capy đang gật gù chăm chú đọc sách cùng bạn.',
                      'Capy: "Từng trang viết nhỏ hôm nay, một thế giới thật đẹp mai này."'
                    ];
                    notify(quotes[Math.floor(Math.random() * quotes.length)]);
                    if (progress.sound) playReward();
                  }} /></Suspense>
                  <div className="scene-controls" aria-label="Điều khiển mô hình"><button className="icon-button" aria-label="Xoay mô hình sang trái" onClick={() => sceneRef.current?.rotate(-1)}><ChevronLeft aria-hidden="true" size={17} /></button><button className="icon-button" aria-label="Xoay mô hình sang phải" onClick={() => sceneRef.current?.rotate(1)}><ChevronRight aria-hidden="true" size={17} /></button><span /><button className="icon-button" aria-label="Thu nhỏ mô hình" onClick={() => sceneRef.current?.zoom(-1)}><Minus aria-hidden="true" size={16} /></button><button className="icon-button" aria-label="Phóng to mô hình" onClick={() => sceneRef.current?.zoom(1)}><Plus aria-hidden="true" size={16} /></button><button className="icon-button" aria-label="Đặt lại góc nhìn" onClick={() => sceneRef.current?.reset()}><RotateCcw aria-hidden="true" size={15} /></button></div>
                  <span className="scene-hint"><Sparkles aria-hidden="true" size={14} /> Chạm vào Capy để tương tác · Kéo để xoay 3D</span>
                </div>
                <div className="world-progress"><div className="progress-heading"><span><Sparkles aria-hidden="true" size={16} /> Từng mảnh nhỏ, thành tổ ấm</span><strong>{count}<span> / 21 mảnh</span></strong></div><div className="piece-track" role="progressbar" aria-label="Tiến độ xây dựng thế giới" aria-valuenow={count} aria-valuemin={0} aria-valuemax={21}>{Array.from({ length: 21 }, (_, i) => <span key={i} className={i < count ? 'earned' : ''} />)}</div><div className="progress-footer"><span>{count === 21 ? 'Thế giới đã hoàn thành. Thật tự hào về bạn!' : `Còn ${21 - count} ngày viết để hoàn thành thế giới này.`}</span><a href="#collection">Bộ sưu tập <ArrowRight aria-hidden="true" size={14} /></a></div></div>
              </section>
              <div className="stats-grid">
                <Stat icon={Flame} tone="peach" label="Chuỗi hiện tại" value={progress.streak} unit="ngày" description="Một nhịp viết mỗi ngày" />
                <Stat icon={Snowflake} tone="blue" label="Bảo vệ chuỗi" value={progress.freezes} unit="lượt" description={progress.freezes ? 'Một ngày nghỉ cũng ổn' : 'Mỗi 7 ngày viết, thêm 1 lượt'} />
                <Stat icon={NotebookPen} tone="mint" label="Bài đã viết" value={progress.essays.length} unit="bài" description="Từng bài đều đáng quý" />
              </div>
            </div>
            <WritingForm complete={progress.pieces === 63} key={progress.demo ? 'demo' : 'real'} doneToday={doneToday} onSubmit={onSubmit} onHelp={() => setHelp(true)} onDraftError={setIssue} />
          </div>
          <div className="daily-note"><span><Leaf aria-hidden="true" size={18} /><span>Không cần hoàn hảo. <strong>Chỉ cần bạn ở đây, viết thêm một chút.</strong></span></span>{progress.demo && <button className="text-button" onClick={advanceDemo} disabled={progress.pieces >= 63}><LockKeyhole aria-hidden="true" size={14} /> {progress.pieces >= 63 ? 'Đã mở đủ thế giới mẫu' : 'Xem thế giới tiếp'}<ArrowRight aria-hidden="true" size={14} /></button>}</div>
        </>}
        {page === 'collection' && <Collection progress={progress} selected={selectedWorld} onSelect={setSelectedWorld} onAdvance={advanceDemo} />}
        {page === 'journal' && <Journal essays={progress.essays} onView={setViewEssay} onScore={essay => { setScoringEssay(essay); location.hash = 'scoring'; }} />}
        {page === 'scoring' && <Suspense fallback={<p role="status">Đang mở góc chấm bài…</p>}><ScoringPage key={scoringEssay?.id || 'draft'} prefill={scoringEssay} essays={progress.essays} /></Suspense>}
        {page === 'settings' && <section className="settings-content" aria-label="Cài đặt ứng dụng"><AppearanceSettings /><div className="settings-group"><h2>Nhịp viết của bạn</h2><div className="setting-row"><span><strong>Âm thanh phần thưởng</strong><small>Một âm thanh nhỏ khi hoàn thành bài viết.</small></span><button className={`switch ${progress.sound ? 'on' : ''}`} role="switch" aria-checked={progress.sound} aria-label="Âm thanh phần thưởng" onClick={() => { try { persist({ ...progress, sound: !progress.sound }); if (!progress.sound) playReward(); } catch (error) { setIssue((error as Error).message); } }}><span /></button></div><div className="setting-row"><span><strong>Múi giờ của bạn</strong><small>Ngày mới bắt đầu lúc 00:00, giờ Việt Nam.</small></span><span className="timezone">UTC+7 · Việt Nam</span></div><div className="setting-row"><span><strong>Chuyển động nhẹ nhàng</strong><small>Tự theo cài đặt giảm chuyển động của thiết bị.</small></span><Leaf aria-hidden="true" size={22} className="muted-icon" /></div></div><div className="settings-group"><h2>Dữ liệu của bạn</h2><p className="settings-intro">Bài viết và tiến trình được lưu trong trình duyệt này. Hãy tải bản sao trước khi xóa dữ liệu trình duyệt hoặc đổi thiết bị.</p><div className="setting-row"><span><strong>Tải bản sao dữ liệu</strong><small>Toàn bộ bài viết và tiến trình ở định dạng JSON.</small></span><button className="button secondary" onClick={exportData}><Download aria-hidden="true" size={16} /> Tải bản sao</button></div><div className="setting-row"><span><strong>{progress.demo ? 'Bắt đầu hành trình của riêng bạn' : 'Bắt đầu lại từ đầu'}</strong><small>{progress.demo ? 'Xóa bài mẫu, bài đã viết và bản nháp để bắt đầu từ mảnh đầu tiên.' : 'Xóa các bài viết, bản nháp và tiến trình trên máy này.'}</small></span><button className="button secondary" onClick={() => setResetConfirm(true)}><RotateCcw aria-hidden="true" size={16} /> Bắt đầu mới</button></div></div><div className="demo-explanation"><Sprout aria-hidden="true" size={24} /><div><h3>Một bản demo, một góc bình yên.</h3><p>Writing Award lưu tiến trình trên máy, chưa có tài khoản hay đồng bộ thiết bị. Bạn có thể nhận đánh giá AI ở mục Chấm bài IELTS. {progress.demo ? 'Bạn đang khám phá với 12 bài viết mẫu.' : 'Bạn đang viết với dữ liệu của riêng mình.'} Mỗi ngày hợp lệ nhận một mảnh; bài viết thêm vẫn được lưu vào nhật ký.</p><button className="text-button" onClick={() => setHelp(true)}>Tìm hiểu cách hoạt động <ArrowRight aria-hidden="true" size={15} /></button></div></div></section>}
        <footer className="page-footer"><span>Writing Award <span>·</span> One essay. One little piece of happiness.</span><span><ShieldCheck aria-hidden="true" size={13} />{page === 'scoring' ? 'Chấm bài qua Gemini · Band ước lượng' : 'Chỉ lưu trên trình duyệt của bạn'}</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Điều hướng trên điện thoại">{[...NAV, { page: 'settings' as Page, label: 'Cài đặt', icon: Settings }].map(({ page: p, label, icon: Icon }) => <a key={p} href={`#${p}`} aria-label={label} aria-current={page === p ? 'page' : undefined}><Icon aria-hidden="true" size={22} /><span>{label}</span></a>)}</nav>
    <div className="toast" role="status" aria-live="polite">{toast && <span><CheckCheck aria-hidden="true" size={18} />{toast}</span>}</div>
    {help && <Dialog title="Từng bài viết, từng mảnh hạnh phúc." onClose={() => setHelp(false)}><p className="dialog-intro">Chỉ cần một khoảng nhỏ mỗi ngày. Capy sẽ cùng bạn xây nên một thế giới.</p><ol className="help-steps"><li><NotebookPen aria-hidden="true" /><div><h3>Viết một bài IELTS</h3><p>Task 1 từ 150 từ, Task 2 từ 250 từ. Dán bài hoặc tải tệp Word .docx, .txt, .md lên.</p></div></li><li><Sparkles aria-hidden="true" /><div><h3>Nhận một mảnh mỗi ngày</h3><p>Bài hợp lệ đầu tiên trong ngày nhận một mảnh và tăng chuỗi. Viết thêm vẫn được lưu, không cộng thêm mảnh.</p></div></li><li><House aria-hidden="true" /><div><h3>Xây trọn một thế giới</h3><p>21 ngày viết hoàn thành Nhà Capybara, rồi mở Cây Thần Kỳ và Lego Capybara. Công trình đã xây luôn được giữ lại.</p></div></li><li><Snowflake aria-hidden="true" /><div><h3>Một ngày nghỉ cũng ổn</h3><p>Mỗi 7 ngày liên tiếp nhận 1 lượt bảo vệ (tối đa 2). Bỏ một ngày tự dùng 1 lượt để giữ chuỗi, không nhận mảnh. Nghỉ hơn một ngày hoặc hết lượt: chuỗi về 0, bớt 1 sao trang trí và trời mưa tạm thời. Mảnh và bài viết vẫn còn nguyên.</p></div></li></ol><p className="help-footnote">Ngày được tính theo {TIMEZONE} (UTC+7). Tiến trình được lưu trên máy. Mục Chấm bài IELTS cho band ước lượng bằng AI; phần thưởng dựa trên việc luyện viết mỗi ngày.</p><button className="button primary full-width" onClick={() => setHelp(false)}>Mình hiểu rồi <Heart aria-hidden="true" size={17} /></button></Dialog>}
    {reward && <Dialog title={reward.rewarded ? reward.complete ? 'Một thế giới đã thành hình!' : 'Hôm nay bạn đã làm rất tốt!' : 'Thêm một bài viết, thêm một bước tiến.'} onClose={finishReward} className="reward-dialog">{reward.rewarded && <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>}<div className="reward-art"><span className="reward-star s1"><Sparkles aria-hidden="true" size={24} /></span>{reward.complete ? <Crown aria-hidden="true" size={70} strokeWidth={1.3} /> : reward.rewarded ? <Suspense fallback={<House aria-hidden="true" size={70} strokeWidth={1.3} />}><Scene world={reward.world} pieces={reward.piece} miniature rewardPiece /></Suspense> : <BookOpen aria-hidden="true" size={70} strokeWidth={1.3} />}<span className="reward-star s2"><Star aria-hidden="true" size={20} /></span></div><p>{reward.rewarded ? reward.complete ? '21 ngày cố gắng nhỏ. Một công trình thật đáng tự hào.' : 'Một bài viết đã được lưu. Một điều dễ thương vừa lớn lên.' : progress.pieces === 63 ? 'Cả ba thế giới đã hoàn thành. Bài viết mới vẫn được lưu, và chuỗi viết vẫn tiếp tục nhé.' : 'Bài viết đã được lưu trong nhật ký. Bạn đã nhận mảnh hôm nay; ngày mai mình xây tiếp nhé.'}</p>{reward.rewarded && <div className="reward-piece"><Sparkles aria-hidden="true" size={18} /><strong>{reward.complete ? `${WORLDS[reward.world].short} · 21/21 mảnh` : reward.world === 0 ? PIECES[reward.piece - 1] : `Mảnh ${reward.piece} · ${WORLDS[reward.world].short}`}</strong></div>}{reward.complete && reward.world < 2 && <p className="unlock-note"><LockKeyhole aria-hidden="true" size={16} />{WORLDS[reward.world + 1].short} đã mở! Bài hợp lệ ngày tiếp theo sẽ xây mảnh đầu tiên.</p>}<button className="button primary full-width" onClick={finishReward}>{scoreAfterReward ? 'Tiếp tục chấm bài' : 'Về ngắm công trình'} <ArrowRight aria-hidden="true" size={17} /></button></Dialog>}
    {viewEssay && <Dialog title={viewEssay.title} onClose={() => setViewEssay(null)} className="essay-dialog"><div className="essay-meta"><span>Task {viewEssay.task}</span><span>{viewEssay.words} từ</span><span>{displayDate(viewEssay.date)}</span>{viewEssay.sample && <span>Dữ liệu mẫu</span>}</div><article className="essay-text" lang="en">{viewEssay.text}</article><button className="button primary" onClick={() => { setScoringEssay(viewEssay); setViewEssay(null); location.hash = 'scoring'; }}><BookOpenCheck aria-hidden="true" size={17} /> Chấm bài viết này</button> <button className="button secondary" onClick={() => download(viewEssay.text, `writing-${viewEssay.id}.txt`, 'text/plain')}><ArrowDownToLine aria-hidden="true" size={16} /> Tải bài viết</button></Dialog>}
    {resetConfirm && <Dialog title="Bắt đầu một hành trình mới?" onClose={() => setResetConfirm(false)}><p className="dialog-intro">Các bài viết, bản nháp và tiến trình hiện tại trên máy này sẽ bị xóa. Bạn có thể tải bản sao trước để giữ lại mọi cố gắng.</p><div className="dialog-actions"><button className="button secondary" onClick={exportData}><Download aria-hidden="true" size={16} /> Tải bản sao</button><button className="button secondary" onClick={() => setResetConfirm(false)}>Giữ hành trình này</button><button className="button danger" onClick={startFresh}>Xóa và bắt đầu mới</button></div></Dialog>}
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
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, task })); setSavedDraft(!!text); } catch { setSavedDraft(false); onDraftError('Chưa tự lưu được bản nháp. Bạn có thể tải bài viết về để giữ lại.'); }
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
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Chưa đọc được tệp. Hãy thử lại hoặc dán bài trực tiếp.');
    } finally {
      if (uploadController.current === controller) { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busyRef.current) return;
    if (!ready) { setError(`Task ${task} cần ít nhất ${minimum} từ. Bạn còn thiếu ${minimum - words} từ nữa.`); setMode('paste'); requestAnimationFrame(() => textRef.current?.focus()); return; }
    busyRef.current = true; setSaving(true); setError('');
    try { await new Promise<void>(r => setTimeout(r, 180)); onSubmit(text, task, scoreNow); setText(''); setFileName(''); setSavedDraft(false); } catch (e) { setError(e instanceof Error ? e.message : 'Chưa lưu được bài. Bản nháp vẫn còn; hãy thử lại.'); } finally { busyRef.current = false; setSaving(false); }
  }
  return <section className="writing-panel" aria-labelledby="writing-title"><div className="writing-heading"><span className="writing-icon"><NotebookPen aria-hidden="true" size={22} /></span><h2 id="writing-title">Hôm nay, bạn viết gì?</h2><img className="writing-capy-mascot" src="/capy-writer.png" width="52" height="43" alt="" aria-hidden="true" /></div><p className="writing-description">Dành một chút thời gian cho mình.<br />Capy sẽ chờ bạn ở đây.</p><form onSubmit={submit} noValidate>
    <fieldset className="task-selector"><legend>Chọn dạng bài</legend>{([1, 2] as Task[]).map(t => <label key={t} className={task === t ? 'checked' : ''}><input type="radio" name="task" value={t} checked={task === t} onChange={() => { setTask(t); setError(''); }} /><span>Task {t}<small>{minimumWords(t)}+ từ</small></span>{task === t && <Check aria-hidden="true" size={14} />}</label>)}</fieldset>
    <div className="input-tabs" role="tablist" aria-label="Cách nhập bài"><button type="button" role="tab" id="paste-tab" aria-selected={mode === 'paste'} aria-controls="writing-input" onClick={() => setMode('paste')} onKeyDown={e => { if (e.key === 'ArrowRight') { setMode('upload'); document.getElementById('upload-tab')?.focus(); } }} tabIndex={mode === 'paste' ? 0 : -1}><FileText aria-hidden="true" size={15} /> Dán bài viết</button><button type="button" role="tab" id="upload-tab" aria-selected={mode === 'upload'} aria-controls="writing-upload" onClick={() => setMode('upload')} onKeyDown={e => { if (e.key === 'ArrowLeft') { setMode('paste'); document.getElementById('paste-tab')?.focus(); } }} tabIndex={mode === 'upload' ? 0 : -1}><Upload aria-hidden="true" size={15} /> Tải tệp lên</button></div>
    {mode === 'paste' && (reading ? <p className="import-notice" role="status">Đang đọc nội dung tệp… Bạn đợi một chút nhé.</p> : fileName && <p className="import-notice" role="status"><FileText aria-hidden="true" size={15} /><span>Đã đọc <strong>{fileName}</strong>. Bạn có thể sửa nội dung trước khi lưu.</span></p>)}
    {mode === 'paste' ? <div id="writing-input" role="tabpanel" aria-labelledby="paste-tab" className={`editor ${error ? 'has-error' : ''}`}><label className="sr-only" htmlFor="essay">Bài viết IELTS Writing Task {task}</label><textarea id="essay" ref={textRef} value={text} maxLength={100_000} readOnly={reading} onChange={e => { setText(e.target.value); setError(''); setSavedDraft(false); }} placeholder={`Dán bài Writing Task ${task} của bạn vào đây…\n\nTừng câu chữ nhỏ, một bước tiến lớn.`} aria-describedby={`word-count ${error ? 'form-error' : 'writing-note'}`} aria-invalid={!!error} spellCheck={false} lang="en" /><div className="editor-footer"><span className="draft-status">{savedDraft ? <><Check aria-hidden="true" size={12} /> Đã lưu nháp</> : fileName ? <><FileText aria-hidden="true" size={12} /> Đã đọc tệp</> : 'Khoảng nhỏ của bạn'}</span><span id="word-count" className={`word-count ${ready ? 'ready' : ''}`}>{ready && <Check aria-hidden="true" size={12} />}<strong>{words}</strong> / {minimum} từ</span></div></div> : <div id="writing-upload" role="tabpanel" aria-labelledby="upload-tab" className="upload-panel" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void uploadFile(e.dataTransfer.files[0]); }}><Upload aria-hidden="true" size={30} strokeWidth={1.4} /><strong>{reading ? 'Đang đọc bài viết…' : 'Mang bài viết của bạn đến đây'}</strong><p>Kéo thả tệp hoặc chọn từ thiết bị</p><button type="button" className="button secondary" disabled={reading} onClick={() => fileRef.current?.click()}>Chọn tệp bài viết</button><small>Word (.docx), TXT, Markdown · tối đa 5 MB</small></div>}
    <input className="sr-only" tabIndex={-1} type="file" accept={UPLOAD_ACCEPT} disabled={reading || saving} ref={fileRef} aria-label="Chọn tệp bài viết Word DOCX, TXT hoặc Markdown" onChange={e => void uploadFile(e.target.files?.[0])} />
    {error && <p className="form-error" id="form-error" role="alert">{error}{text && <button className="text-button" type="button" onClick={() => download(text, 'writing-draft.txt', 'text/plain')}><Download aria-hidden="true" size={13} /> Tải bản nháp</button>}</p>}
    <p className="writing-note" id="writing-note">{complete ? <><CheckCheck aria-hidden="true" size={14} /> Ba thế giới đã hoàn thành. Mình cứ viết tiếp nhé.</> : doneToday ? <><CheckCheck aria-hidden="true" size={14} /> Đã nhận mảnh hôm nay. Bài mới vẫn được lưu nhé.</> : <><Sprout aria-hidden="true" size={15} /> Đủ {minimum} từ, một mảnh mới sẽ đến với bạn.</>}</p>
    <div className="home-score-choice"><label><input type="checkbox" checked={scoreNow} onChange={event => setScoreNow(event.target.checked)} disabled={saving || reading} /><span>Nhận đánh giá IELTS cho bài này</span></label><p>{scoreNow ? 'Sau khi lưu bài, bạn bổ sung đề gốc, loại bài thi và ảnh đề (Task 1) ở bước tiếp theo. Chỉ gửi tới Gemini khi bạn bấm Chấm bài IELTS.' : 'Bạn có thể chỉ lưu và nhận mảnh hôm nay, rồi chọn chấm bài từ nhật ký bất cứ lúc nào.'}</p></div>
    <button className="button primary submit-button" type="submit" disabled={saving || reading}>{saving ? <><span className="spinner" /> Đang lưu bài viết…</> : <><NotebookPen aria-hidden="true" size={18} />{scoreNow ? 'Lưu bài & tiếp tục chấm' : complete ? 'Lưu bài viết' : doneToday ? 'Lưu thêm một bài viết' : 'Lưu bài & nhận mảnh'}<ArrowRight aria-hidden="true" size={18} /></>}</button>
  </form><div className="writing-reassurance"><ShieldCheck aria-hidden="true" size={14} /> Bài viết chỉ được lưu trên trình duyệt của bạn.</div><a className="text-button writing-help" href="#scoring"><BookOpenCheck aria-hidden="true" size={14} /> Nhận đánh giá IELTS cho bài viết <ArrowRight aria-hidden="true" size={14} /></a><button className="text-button writing-help" onClick={onHelp}>Một mảnh được tính thế nào? <CircleHelp aria-hidden="true" size={13} /></button></section>;
}
function Collection({ progress, selected, onSelect, onAdvance }: { progress: Progress; selected: number; onSelect: (world: number) => void; onAdvance: () => void }) {
  const available = activeWorld(progress.pieces);
  return <section className="collection-content" aria-label="Bộ sưu tập thế giới"><div className="collection-grid">{WORLDS.map((w, i) => {
    const count = worldPieces(progress.pieces, i), locked = i > available, complete = count === 21;
    return <button key={w.name} className={`collection-world ${w.color} ${locked ? 'locked' : ''} ${selected === i ? 'active' : ''}`} onClick={() => onSelect(i)} disabled={locked} aria-pressed={selected === i} aria-describedby={`world-desc-${i}`}><div className="collection-world-top"><span>Thế giới {i + 1}</span>{locked ? <LockKeyhole aria-hidden="true" size={18} /> : complete ? <CheckCheck aria-hidden="true" size={19} /> : <Sprout aria-hidden="true" size={18} />}</div><div className="collection-preview"><Suspense fallback={<LoadingScene />}><Scene world={i} pieces={locked ? 21 : Math.max(count, 1)} miniature /></Suspense>{locked && <span className="locked-overlay"><LockKeyhole aria-hidden="true" size={24} /></span>}</div><h2>{w.short}</h2><p>{w.subtitle}</p><span className="collection-world-state" id={`world-desc-${i}`}>{locked ? `Hoàn thành ${WORLDS[i - 1].short} để mở` : complete ? 'Đã hoàn thành · 21/21 mảnh' : `${count}/21 mảnh · Đang xây dựng`}</span></button>;
  })}</div><div className="collection-detail"><div className="section-title-row"><h2>{WORLDS[selected].short} của bạn</h2><a href="#home" className="text-button">Về luyện viết <ArrowRight aria-hidden="true" size={16} /></a></div><p className="muted">Những mảnh bạn đã nhận được sẽ luôn ở đây.</p><div className="piece-list">{Array.from({ length: 21 }, (_, i) => <div key={i} className={i < worldPieces(progress.pieces, selected) ? 'piece earned' : 'piece'}><span>{i < worldPieces(progress.pieces, selected) ? <Check aria-hidden="true" size={16} /> : <LockKeyhole aria-hidden="true" size={14} />}</span><span>{selected === 0 ? PIECES[i] : `Mảnh ${i + 1}`}</span><small>{i < worldPieces(progress.pieces, selected) ? 'Đã lắp' : `Ngày ${i + 1}`}</small></div>)}</div></div>{progress.demo && <div className="notice demo-notice"><Sparkles aria-hidden="true" size={20} /><p>Bạn đang xem tiến trình mẫu. Khám phá thế giới tiếp theo để thử chuyển chương.</p><button className="button secondary" onClick={onAdvance} disabled={progress.pieces >= 63}>{progress.pieces >= 63 ? 'Đã mở đủ thế giới' : 'Xem thế giới tiếp'}<ArrowRight aria-hidden="true" size={15} /></button></div>}</section>;
}
function Journal({ essays, onView, onScore }: { essays: Essay[]; onView: (essay: Essay) => void; onScore: (essay: Essay) => void }) {
  const [query, setQuery] = useState(''); const [task, setTask] = useState('all');
  const filtered = essays.filter(e => (task === 'all' || String(e.task) === task) && `${e.title} ${e.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="journal-content" aria-label="Nhật ký bài viết"><div className="journal-tools"><label className="search-field"><BookOpen aria-hidden="true" size={18} /><span className="sr-only">Tìm bài viết</span><input type="search" placeholder="Tìm một bài viết…" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="filter-field"><span className="sr-only">Lọc dạng bài</span><select value={task} onChange={e => setTask(e.target.value)}><option value="all">Tất cả dạng bài</option><option value="1">Task 1</option><option value="2">Task 2</option></select><ChevronDown aria-hidden="true" size={16} /></label></div><div className="journal-count" role="status">{filtered.length} bài viết <span>· Mỗi bài là một cố gắng đáng quý</span></div>{filtered.length ? <div className="journal-list">{filtered.map(e => <div key={e.id} className="journal-entry-wrap"><button className="journal-entry" onClick={() => onView(e)}><span className="entry-icon"><FileText aria-hidden="true" size={24} strokeWidth={1.5} /></span><span className="entry-main"><strong>{e.title}</strong><span>Task {e.task}<i />{e.words} từ<i />{displayDate(e.date)}{e.sample && <span className="sample-tag">Mẫu</span>}</span></span><span className="entry-reward">{e.rewarded ? <><Sparkles aria-hidden="true" size={15} /> Đã nhận mảnh</> : <><Check aria-hidden="true" size={15} /> Đã lưu</>}</span><ChevronRight aria-hidden="true" size={18} /></button><button className="button secondary journal-score-action" aria-label={`Chấm bài: ${e.title}`} onClick={() => onScore(e)}><BookOpenCheck size={16} aria-hidden="true" /> Chấm bài</button></div>)}</div> : <div className="empty-state"><BookOpen aria-hidden="true" size={44} strokeWidth={1.2} /><h2>{query || task !== 'all' ? 'Chưa tìm thấy trang viết này.' : 'Trang đầu tiên đang chờ bạn.'}</h2><p>{query || task !== 'all' ? 'Thử từ khóa khác hoặc xem tất cả dạng bài nhé.' : 'Bài viết của bạn sẽ được giữ lại ở đây, từng ngày một.'}</p>{query || task !== 'all' ? <button className="button secondary" onClick={() => { setQuery(''); setTask('all'); }}>Xóa bộ lọc</button> : <a className="button primary" href="#home">Viết bài đầu tiên <ArrowRight aria-hidden="true" size={17} /></a>}</div>}</section>;
}
function download(value: string, filename: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default App;
