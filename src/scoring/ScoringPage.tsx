import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowRight, BookOpenCheck, Check, CheckCheck, ChevronDown, Download, FileText, ImagePlus, Info, MessageSquareQuote, NotebookPen, Pencil, ScanText, ShieldCheck, Upload, X } from 'lucide-react';
import { readEssayFile, UPLOAD_ACCEPT } from '../uploads';
import ChoiceSelect from './ChoiceSelect';
import { displayDate, DRAFT_KEY } from '../model';
import type { Essay } from '../model';
import { allowedCategories, countWords, criterionKeys, TASK_TYPES } from './types';
import type { CriterionKey, ScoringInput, ScoringResult, TaskImage, TaskType } from './types';
import { readTaskImage, submitScoring } from './client';
import './scoring.css';

const DRAFT = 'writing-award:scoring-draft:v1';
const TASK_LABELS: Record<TaskType, string> = { academic_task_1: 'Academic · Task 1', academic_task_2: 'Academic · Task 2', general_task_1: 'General Training · Task 1', general_task_2: 'General Training · Task 2' };
const CATEGORY_LABELS: Record<string, string> = { bar_chart: 'Biểu đồ cột', pie_chart: 'Biểu đồ tròn', process: 'Quy trình', map: 'Bản đồ', line_graph: 'Biểu đồ đường', table: 'Bảng số liệu', mixed_chart: 'Biểu đồ kết hợp', advantages_disadvantages: 'Ưu & nhược điểm', causes: 'Nguyên nhân', effects_solutions: 'Tác động & giải pháp', discussion: 'Thảo luận', opinion: 'Quan điểm', mixed: 'Nhiều yêu cầu', other: 'Dạng khác' };
const CRITERIA: Record<CriterionKey, { name: string; vi: string; short: string }> = {
  task_achievement: { name: 'Task Achievement', vi: 'Đáp ứng yêu cầu đề', short: 'TA' },
  task_response: { name: 'Task Response', vi: 'Trả lời & phát triển ý', short: 'TR' },
  coherence_cohesion: { name: 'Coherence & Cohesion', vi: 'Mạch lạc & liên kết', short: 'CC' },
  lexical_resource: { name: 'Lexical Resource', vi: 'Vốn từ vựng', short: 'LR' },
  grammatical_range_accuracy: { name: 'Grammatical Range & Accuracy', vi: 'Độ đa dạng & chính xác ngữ pháp', short: 'GRA' },
};
const STATUS_LABELS = { scored: 'Đã đối chiếu bằng chứng', partial: 'Đánh giá một phần', needs_input: 'Cần bổ sung thông tin', review_required: 'Cần kiểm tra lại' };
const blankInput = (): ScoringInput => ({ task_type: 'academic_task_2', question_category: 'auto', question: '', essay: '', task_image: null, rubric_version: 'ielts_official_v1' });
function initialDraft(prefill?: Essay | null): ScoringInput {
  const empty = blankInput();
  try {
    const stored = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
    if ((!prefill || stored?.prefill_id === prefill.id) && stored && TASK_TYPES.includes(stored.task_type) && typeof stored.question === 'string' && typeof stored.essay === 'string') return { ...empty, task_type: stored.task_type, question: stored.question.slice(0, 12_000), essay: stored.essay.slice(0, 100_000) };
  } catch { /* Start with an editable empty draft if session storage is unavailable. */ }
  if (prefill) return { ...empty, essay: prefill.text, task_type: prefill.task === 1 ? 'academic_task_1' : 'academic_task_2' };
  return empty;
}
function exportResult(result: ScoringResult) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `ielts-writing-${result.request_id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function MarkedEssay({ text, quote }: { text: string; quote: string }) {
  const index = quote ? text.indexOf(quote) : -1;
  const mark = useRef<HTMLElement>(null);
  useEffect(() => { if (quote) mark.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [quote]);
  return <article className="scoring-original" lang="en">{index < 0 ? text : <>{text.slice(0, index)}<mark ref={mark}>{quote}</mark>{text.slice(index + quote.length)}</>}</article>;
}

export default function ScoringPage({ prefill, essays = [] }: { prefill?: Essay | null; essays?: Essay[] }) {
  const [picker, setPicker] = useState(false);
  const [journalQuery, setJournalQuery] = useState('');
  const [journalTask, setJournalTask] = useState(0);
  const journalMatches = essays.filter(essay => (!journalTask || essay.task === journalTask) && `${essay.title} ${essay.text}`.toLocaleLowerCase().includes(journalQuery.toLocaleLowerCase().trim()));
  const [input, setInput] = useState(() => initialDraft(prefill));
  const [sourceId, setSourceId] = useState(prefill?.id ?? null);
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [submitted, setSubmitted] = useState<ScoringInput | null>(null);
  const [editing, setEditing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<CriterionKey | null>('task_response');
  const [quote, setQuote] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [imageName, setImageName] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const words = countWords(input.essay), minimum = input.task_type.endsWith('_1') ? 150 : 250;
  function beginEditing() {
    setEditing(true); setQuote('');
    requestAnimationFrame(() => { const heading = document.getElementById('scoring-input-title'); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  }
  useEffect(() => {
    const check = new AbortController();
    void fetch('/api/score', { signal: check.signal }).then(r => r.json()).then(data => { if (typeof data.configured === 'boolean') setConfigured(data.configured); }).catch(() => {});
    return () => { check.abort(); controller.current?.abort(); uploadController.current?.abort(); };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { sessionStorage.setItem(DRAFT, JSON.stringify({ task_type: input.task_type, question: input.question, essay: input.essay, prefill_id: sourceId })); }
      catch { setStorageNotice('Chưa lưu được bản nháp trên máy. Hãy giữ một bản sao trước khi đóng trang.'); }
    }, 350);
    return () => clearTimeout(timer);
  }, [input.task_type, input.question, input.essay, sourceId]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  function change<K extends keyof ScoringInput>(key: K, value: ScoringInput[K]) {
    setInput(old => ({ ...old, [key]: value }));
    setInvalid(old => old.filter(name => name !== key)); setError('');
  }
  function changeTask(task: TaskType) { setInput(old => ({ ...old, task_type: task, question_category: task === 'general_task_1' ? null : 'auto', task_image: null })); setImageName(''); setError(''); }
  async function importEssay(file?: File) {
    if (!file || busyRef.current) return;
    uploadController.current?.abort(); const upload = new AbortController(); uploadController.current = upload;
    setReading(true); setError('');
    try { const text = await readEssayFile(file, upload.signal); if (!upload.signal.aborted) { change('essay', text); setFileNotice(`Đã đọc ${file.name}. Bạn có thể sửa nội dung trước khi chấm.`); } }
    catch (err) { if (!upload.signal.aborted) setError(err instanceof Error ? err.message : 'Chưa đọc được tệp bài viết.'); }
    finally { if (uploadController.current === upload) { setReading(false); if (fileRef.current) fileRef.current.value = ''; } }
  }
  async function importImage(file?: File) {
    if (!file || busyRef.current) return;
    setReading(true); setError('');
    try { const image = await readTaskImage(file); change('task_image', image); setImageName(file.name); }
    catch (err) { setError(err instanceof Error ? err.message : 'Chưa đọc được ảnh.'); }
    finally { setReading(false); if (imageRef.current) imageRef.current.value = ''; }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busyRef.current || reading) return;
    const fields = [!input.question.trim() && 'question', !input.essay.trim() && 'essay'].filter(Boolean) as string[];
    if (fields.length) { setInvalid(fields); setError('Bạn bổ sung đề bài và bài viết để Capy có đủ thông tin nhé.'); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    busyRef.current = true; setBusy(true); setElapsed(0); setError(''); setInvalid([]);
    const abort = new AbortController(); controller.current = abort;
    try {
      const snapshot = structuredClone(input);
      const response = await submitScoring(snapshot, abort.signal);
      if (abort.signal.aborted) return;
      setResult(response); setSubmitted(snapshot); setSelected(criterionKeys(snapshot.task_type)[0]); setQuote(''); setEditing(false);
      requestAnimationFrame(() => resultsRef.current?.focus({ preventScroll: true }));
    } catch (err) { if (!abort.signal.aborted) { setError(err instanceof Error ? err.message : 'Chưa chấm được bài. Hãy thử lại.'); requestAnimationFrame(() => errorRef.current?.focus()); } }
    finally { if (controller.current === abort) { busyRef.current = false; setBusy(false); } }
  }
  function usePracticeDraft() {
    try { const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); if (typeof draft.text === 'string' && draft.text.trim()) { change('essay', draft.text.slice(0, 100_000)); setFileNotice('Đã lấy bản nháp từ góc luyện viết. Bạn bổ sung đề bài trước khi chấm nhé.'); } else setFileNotice('Góc luyện viết chưa có bản nháp. Bạn có thể dán bài hoặc tải tệp lên.'); }
    catch { setError('Chưa đọc được bản nháp. Bạn có thể dán bài trực tiếp.'); }
  }
  const displayInput = !editing && submitted ? submitted : input;
  const image = displayInput.task_image;
  return <div className="scoring-page">
    <div className="scoring-intro"><span className="scoring-intro-icon"><BookOpenCheck size={22} aria-hidden="true" /></span><p>Một góc nhìn rõ hơn về bài viết của bạn.<br /><strong>4 tiêu chí IELTS · Nhận xét có bằng chứng từ bài gốc.</strong></p></div>
    <div className={`scoring-workspace ${result && !editing ? 'is-reviewing' : ''}`}>
      <section className="scoring-paper" aria-labelledby="scoring-input-title">
        <div className="scoring-section-heading"><h2 id="scoring-input-title" tabIndex={-1}>{editing ? 'Bài viết của bạn' : 'Đối chiếu bài gốc'}</h2>{!editing && <button className="button secondary" onClick={beginEditing}><Pencil size={15} aria-hidden="true" /> Sửa & chấm lại</button>}</div>
        {editing ? <form onSubmit={submit} noValidate aria-busy={busy || reading}>
          {configured === false && <div className="scoring-notice"><Info size={18} aria-hidden="true" /><p>Dịch vụ chấm chưa được bật. Cần cấu hình GEMINI_API_KEY trên server rồi khởi động lại ứng dụng.</p></div>}
          {error && <div ref={errorRef} className="scoring-error" tabIndex={-1} role="alert"><strong>Chưa thể chấm bài</strong><p>{error}</p>{invalid.map(field => <a key={field} href={`#scoring-${field}`} onClick={e => { e.preventDefault(); document.getElementById(`scoring-${field}`)?.focus(); }}>Bổ sung {field === 'question' ? 'đề bài' : 'bài viết'} <ArrowRight size={14} aria-hidden="true" /></a>)}</div>}
          <fieldset disabled={busy || reading} className="scoring-fields">
            <div className="scoring-journal-picker"><button type="button" className="button secondary" aria-expanded={picker} onClick={() => setPicker(!picker)}><NotebookPen size={17} aria-hidden="true" /> Chọn bài từ nhật ký <ChevronDown size={16} aria-hidden="true" /></button>{picker && <div><label><span className="sr-only">Tìm bài trong nhật ký để chấm</span><input type="search" value={journalQuery} onChange={event => setJournalQuery(event.target.value)} placeholder="Tìm theo tiêu đề hoặc nội dung…" /></label><div className="journal-picker-filters" aria-label="Lọc bài trong nhật ký">{[0, 1, 2].map(task => <button type="button" key={task} aria-pressed={journalTask === task} onClick={() => setJournalTask(task)}>{task ? `Task ${task}` : 'Tất cả bài'}</button>)}</div><p className="scoring-help">Chọn bài sẽ thay nội dung đang nhập và xóa đề cũ để tránh chấm nhầm. Bài trong nhật ký được giữ nguyên.</p><div className="journal-picker-list">{journalMatches.length ? journalMatches.map(essay => <button type="button" key={essay.id} onClick={() => { setSourceId(essay.id); setInput({ ...blankInput(), task_type: essay.task === 1 ? 'academic_task_1' : 'academic_task_2', essay: essay.text }); setImageName(''); setPicker(false); setError(''); setInvalid([]); setFileNotice(`Đã chọn “${essay.title}”. Hãy bổ sung đúng đề bài trước khi chấm.`); requestAnimationFrame(() => document.getElementById('scoring-question')?.focus()); }}><FileText size={18} aria-hidden="true" /><span><strong>{essay.title}</strong><small>Task {essay.task} · {essay.words} từ · {displayDate(essay.date)}{essay.sample ? ' · Bài mẫu' : ''}</small></span><ArrowRight size={17} aria-hidden="true" /></button>) : <p className="scoring-help">{essays.length ? 'Chưa tìm thấy bài phù hợp. Thử từ khóa khác hoặc chọn Tất cả bài.' : 'Nhật ký chưa có bài viết. Bạn có thể dán hoặc tải bài ở bên dưới.'}</p>}</div></div>}</div>
            <div className="scoring-selects"><ChoiceSelect label="Loại bài thi" value={input.task_type} onChange={value => changeTask(value as TaskType)} options={TASK_TYPES.map(task => ({ value: task, label: TASK_LABELS[task], description: task.endsWith('_2') ? 'Bài luận · Gợi ý 250+ từ' : task === 'general_task_1' ? 'Viết thư · Gợi ý 150+ từ' : 'Mô tả hình ảnh · Gợi ý 150+ từ' }))} />{input.task_type === 'general_task_1' ? <div className="scoring-field">Dạng đề<span className="scoring-letter-label">Viết thư · Tự phân tích yêu cầu</span></div> : <ChoiceSelect label="Dạng đề" value={input.question_category || 'auto'} onChange={value => change('question_category', value as ScoringInput['question_category'])} options={[{ value: 'auto', label: 'Tự nhận diện', description: 'Để AI phân tích yêu cầu từ đề gốc' }, ...allowedCategories(input.task_type).map(category => ({ value: category, label: CATEGORY_LABELS[category] }))]} />}</div>
            <label className="scoring-field" htmlFor="scoring-question">Đề bài <span className="scoring-field-hint">Giữ đầy đủ các yêu cầu của đề</span></label><textarea id="scoring-question" className="scoring-question" lang="en" rows={4} value={input.question} maxLength={12_000} onChange={e => change('question', e.target.value)} placeholder="Dán nguyên văn đề IELTS Writing vào đây…" aria-invalid={invalid.includes('question')} aria-describedby={invalid.includes('question') ? 'question-error' : undefined} />
            {invalid.includes('question') && <p className="scoring-field-error" id="question-error">Hãy nhập đề bài cần chấm.</p>}
            {input.task_type === 'academic_task_1' && <div className="scoring-image-field"><div className="scoring-image-label"><span>Ảnh đề bài <small>PNG, JPEG, WebP · tối đa 2 MB</small></span><button className="button secondary" type="button" onClick={() => imageRef.current?.click()}><ImagePlus size={16} aria-hidden="true" />{input.task_image ? 'Đổi ảnh' : 'Thêm ảnh đề'}</button></div>{input.task_image ? <ImagePreview image={input.task_image} name={imageName} onRemove={() => { change('task_image', null); setImageName(''); }} /> : <p className="scoring-help">Thiếu ảnh vẫn có thể nhận xét ngôn ngữ, nhưng chưa thể chấm đầy đủ Task Achievement và band tổng.</p>}</div>}
            <div className="scoring-essay-label"><label htmlFor="scoring-essay">Bài viết gốc</label><button className="text-button" type="button" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden="true" /> Tải bài viết</button></div>
            <div className="scoring-editor"><textarea id="scoring-essay" lang="en" spellCheck={false} rows={11} value={input.essay} maxLength={100_000} onChange={e => change('essay', e.target.value)} placeholder="Viết hoặc dán bài bằng tiếng Anh…" aria-invalid={invalid.includes('essay')} aria-describedby="scoring-word-count scoring-word-note" /><div className="scoring-editor-footer"><span><FileText size={13} aria-hidden="true" /> Bản gốc được giữ nguyên</span><span id="scoring-word-count"><strong>{words}</strong> từ <span>/ gợi ý {minimum}+</span></span></div></div>
            {invalid.includes('essay') && <p className="scoring-field-error">Hãy nhập bài viết cần đánh giá.</p>}
            <p className="scoring-help" id="scoring-word-note">{words > 0 && words < minimum ? `Bài đang dưới ${minimum} từ. Bạn vẫn có thể chấm; số từ không được quy đổi thành mức trừ điểm cố định.` : 'Word (.docx), TXT, Markdown · tối đa 5 MB. Chỉ đánh giá bài gốc, không viết lại bài.'}</p>
            {fileNotice && <p className="scoring-file-notice" role="status">{fileNotice}</p>}
            <button className="text-button scoring-take-draft" type="button" onClick={usePracticeDraft}><NotebookPen size={15} aria-hidden="true" /> Lấy nháp từ góc luyện viết</button>
          </fieldset>
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} accept={UPLOAD_ACCEPT} aria-label="Tải bài viết để chấm" disabled={busy || reading} onChange={e => void importEssay(e.target.files?.[0])} />
          <input ref={imageRef} type="file" className="sr-only" tabIndex={-1} accept="image/png,image/jpeg,image/webp" aria-label="Tải ảnh đề Academic Task 1" disabled={busy || reading} onChange={e => void importImage(e.target.files?.[0])} />
          <div className="scoring-submit-area"><button className="button primary scoring-submit" type="submit" disabled={busy || reading || configured === false}>{busy ? <><span className="spinner" /> Đang chấm bài…</> : reading ? 'Đang đọc tệp…' : <><BookOpenCheck size={19} aria-hidden="true" /> Chấm bài IELTS <ArrowRight size={18} aria-hidden="true" /></>}</button>{busy && <button type="button" className="text-button" onClick={() => { controller.current?.abort(); setBusy(false); busyRef.current = false; setFileNotice('Đã dừng chờ kết quả. Bản nháp vẫn ở đây.'); }}>Dừng chờ</button>}<p className="scoring-privacy"><ShieldCheck size={14} aria-hidden="true" /><span>Khi chấm, đề bài, bài viết và ảnh được gửi tới Gemini. Kết quả là band ước lượng, không phải điểm IELTS chính thức.</span></p>{storageNotice && <p className="scoring-help" role="status">{storageNotice}</p>}</div>
        </form> : submitted && <div className="scoring-source"><div className="scoring-source-meta"><span>{TASK_LABELS[submitted.task_type]}</span><span>{countWords(submitted.essay)} từ</span></div><details className="scoring-source-question"><summary>Đề bài gốc <ChevronDown size={16} aria-hidden="true" /></summary><p lang="en">{submitted.question}</p>{image && <ImagePreview image={image} />}</details><p className="scoring-source-hint"><ScanText size={15} aria-hidden="true" /> Chọn một trích dẫn trong nhận xét để xem trong bài.</p><MarkedEssay text={submitted.essay} quote={quote} /></div>}
      </section>
      <aside className="scoring-feedback" aria-label="Kết quả chấm IELTS">
        {busy ? <div className="scoring-wait" role="status"><img src="/capy-scholar.png" alt="" width="112" height="112" /><h2>Đang đọc từng câu chữ.</h2><p>Đề bài được phân tích, bài viết được đối chiếu 4 tiêu chí và kiểm tra bằng chứng trước khi trả kết quả.</p><div className="scoring-wait-line"><span className="spinner" /><span>Đang xử lý · {elapsed} giây</span></div><small>Lượt chấm có thể cần thêm thời gian khi phải kiểm tra lại. Bạn có thể dừng chờ và giữ bản nháp.</small></div> : result ? <div className="scoring-result">
          <div className="scoring-section-heading"><h2 ref={resultsRef} tabIndex={-1}>Nhận xét cho bạn</h2><button className="icon-button" aria-label="Tải kết quả chấm JSON" onClick={() => exportResult(result)}><Download size={18} aria-hidden="true" /></button></div>
          {editing && <p className="scoring-notice">Đây là kết quả của lần chấm trước. Gửi bài lần nữa để nhận đánh giá cho nội dung đang sửa.</p>}
          <div className={`scoring-verdict ${result.status === 'scored' ? 'is-scored' : ''}`}><div><p>Estimated IELTS Band</p><strong>{result.estimated_overall_band === null ? '—' : result.estimated_overall_band.toFixed(1)}<span> / 9</span></strong></div><span className="scoring-status">{result.status === 'scored' ? <CheckCheck size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}{STATUS_LABELS[result.status]}</span></div>
          <p className="scoring-band-note">{result.status === 'scored' ? 'Trung bình 4 tiêu chí, làm tròn về 0.5 band. Mỗi tiêu chí có trọng số 25%.' : 'Band tổng chỉ hiển thị khi cả 4 tiêu chí đã được đánh giá và xác minh đầy đủ.'}</p>
          <div className="scoring-classification"><span>{CATEGORY_LABELS[result.question_category || ''] || 'Viết thư'}</span><span>Nhận diện: {({ high: 'rõ ràng', medium: 'khá chắc chắn', low: 'cần đối chiếu' })[result.classification_confidence]}</span></div>
          {(!!result.quality_flags.length || result.status !== 'scored') && <div className="scoring-limitations"><Info size={17} aria-hidden="true" /><div><strong>Điều cần lưu ý</strong><ul>{(result.quality_flags.length ? result.quality_flags : [result.status === 'review_required' ? 'Kết quả chưa nhất quán. Hãy kiểm tra đề và bài gốc, rồi chấm lại.' : 'Cần đối chiếu thêm ngữ cảnh đề trước khi có đánh giá đầy đủ.']).map((flag, i) => <li key={i}>{flag}</li>)}</ul>{result.status !== 'scored' && <button className="text-button" onClick={beginEditing}>{result.status === 'review_required' ? 'Kiểm tra & chấm lại' : 'Bổ sung thông tin'} <ArrowRight size={14} aria-hidden="true" /></button>}</div></div>}
          {result.criteria && <>
            <div className="scoring-criteria" role="tablist" aria-label="Bốn tiêu chí IELTS" aria-orientation="vertical">
              {criterionKeys(result.task_type).map((key, index) => {
                const criterion = result.criteria![key]!;
                const isSelected = selected === key;
                return <button
                  key={key}
                  id={`criterion-${key}`}
                  role="tab"
                  aria-selected={isSelected}
                  aria-expanded={isSelected}
                  aria-controls="criterion-detail"
                  tabIndex={isSelected ? 0 : selected === null && index === 0 ? 0 : -1}
                  onClick={() => { setSelected(curr => curr === key ? null : key); setQuote(''); }}
                  onKeyDown={e => {
                    const keys = criterionKeys(result.task_type);
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                      e.preventDefault();
                      const target = e.key === 'Home' ? keys[0] : e.key === 'End' ? keys[keys.length - 1] : keys[(index + (e.key === 'ArrowDown' ? 1 : -1) + keys.length) % keys.length];
                      setSelected(target);
                      setQuote('');
                      document.getElementById(`criterion-${target}`)?.focus();
                    }
                  }}
                >
                  <span className="scoring-criterion-code">{CRITERIA[key].short}</span>
                  <span className="scoring-criterion-name">{CRITERIA[key].name}<small>{CRITERIA[key].vi}</small></span>
                  <strong>{criterion.band === null ? '—' : criterion.band.toFixed(1)}</strong>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>;
              })}
            </div>
            {selected && result.criteria[selected] ? (
              <CriterionDetail result={result} selected={selected} onQuote={q => { setQuote(q); setEditing(false); }} selectedQuote={quote} />
            ) : (
              <div id="criterion-detail" role="region" aria-label="Nhận xét chi tiết" className="scoring-detail-collapsed">
                <p><Info size={15} aria-hidden="true" /> Bấm vào một tiêu chí ở trên (TR, CC, LR, GRA) để mở nhận xét chi tiết và bằng chứng trích dẫn.</p>
              </div>
            )}
          </>}
          <details className="scoring-analysis"><summary>Yêu cầu đề bài & thông tin đánh giá <ChevronDown size={16} aria-hidden="true" /></summary><ul>{result.task_requirements.map((requirement, i) => <li key={i}>{requirement}</li>)}</ul><p>{result.classification_notes}</p>{!!result.potential_missing_context.length && <ul>{result.potential_missing_context.map((context, i) => <li key={i}>{context}</li>)}</ul>}<dl><dt>Rubric</dt><dd>{result.rubric_version}</dd><dt>Model chấm</dt><dd>{result.examiner_model}</dd><dt>Model phân tích</dt><dd>{result.analyzer_model}</dd><dt>Prompt</dt><dd>{result.prompt_version}</dd><dt>Mã lượt chấm</dt><dd>{result.request_id}</dd></dl></details>
        </div> : <div className="scoring-empty"><img src="/capy-scholar.png" width="140" height="140" alt="Capy đọc sách cùng bạn" /><h2>Hiểu bài mình, tiến từng chút.</h2><p>Thêm đề bài và bài viết. Capy sẽ giúp bạn nhìn rõ điểm mạnh và điều cần cải thiện.</p><div className="scoring-explainer"><div><BookOpenCheck size={19} aria-hidden="true" /><p><strong>Đủ cả 4 tiêu chí</strong><span>Đáp ứng đề, mạch lạc, từ vựng và ngữ pháp.</span></p></div><div><MessageSquareQuote size={19} aria-hidden="true" /><p><strong>Có căn cứ từ bài gốc</strong><span>Mỗi nhận xét đi cùng trích dẫn để bạn đối chiếu.</span></p></div><div><SproutIcon /><p><strong>Biết bước tiếp theo</strong><span>Hiểu điều đang ngăn bài viết lên band cao hơn.</span></p></div></div><p className="scoring-gentle-note">Một con số để định hướng.<br />Mỗi lần bạn viết, vẫn là một bước tiến.</p></div>}
      </aside>
    </div>
  </div>;
}
function ImagePreview({ image, name, onRemove }: { image: TaskImage; name?: string; onRemove?: () => void }) {
  return <div className="scoring-image-preview"><a href={`data:${image.mime_type};base64,${image.data}`} target="_blank" rel="noreferrer" aria-label="Mở ảnh đề bài kích thước gốc"><img src={`data:${image.mime_type};base64,${image.data}`} alt="Biểu đồ, bảng, bản đồ hoặc quy trình trong đề bài" /></a>{name && <span>{name}</span>}{onRemove && <button type="button" className="icon-button" onClick={onRemove} aria-label="Xóa ảnh đề bài"><X size={17} aria-hidden="true" /></button>}</div>;
}
function SproutIcon() { return <Check size={19} aria-hidden="true" />; }
function CriterionDetail({ result, selected, onQuote, selectedQuote }: { result: ScoringResult; selected: CriterionKey; onQuote: (quote: string) => void; selectedQuote: string }) {
  const criterion = result.criteria?.[selected];
  if (!criterion) return null;
  const pieces: ReactNode[] = criterion.evidence_quotes.map((q, i) => (
    <button
      key={i}
      type="button"
      className={selectedQuote === q ? 'selected' : ''}
      onClick={() => onQuote(q)}
      aria-label={`Đối chiếu trích dẫn: ${q}`}
    >
      <span className="scoring-quote-indicator" aria-hidden="true"><MessageSquareQuote size={16} /></span>
      <q lang="en">{q}</q>
      <span className="scoring-quote-action" aria-hidden="true"><ScanText size={14} /><span>Soi bài</span></span>
    </button>
  ));
  return (
    <div id="criterion-detail" role="tabpanel" tabIndex={0} aria-labelledby={`criterion-${selected}`} className="scoring-detail">
      {pieces.length > 0 && (
        <div className="scoring-evidence-section">
          <div className="scoring-evidence-header">
            <span className="scoring-evidence-badge">
              <MessageSquareQuote size={16} aria-hidden="true" />
              <strong>Bằng chứng trong bài</strong>
              <span className="scoring-evidence-count">{criterion.evidence_quotes.length}</span>
            </span>
            <span className="scoring-evidence-hint">Bấm để soi vào bài gốc</span>
          </div>
          <div className="scoring-quotes">{pieces}</div>
        </div>
      )}
      <div className="scoring-reason-section">
        <h3>Vì sao có đánh giá này?</h3>
        <p>{criterion.reason}</p>
      </div>
      <div className="scoring-next-band">
        <h3>{criterion.band === null ? 'Để đánh giá đầy đủ' : criterion.band === 9 ? 'Duy trì chất lượng bài viết' : 'Để tiến tới band tiếp theo'}</h3>
        <p>{criterion.next_band_gap}</p>
      </div>
    </div>
  );
}
