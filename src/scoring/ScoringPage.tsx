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
const CATEGORY_LABELS: Record<string, string> = { bar_chart: 'Bar chart', pie_chart: 'Pie chart', process: 'Process', map: 'Map', line_graph: 'Line chart', table: 'Data table', mixed_chart: 'Mixed charts', advantages_disadvantages: 'Pros & cons', causes: 'Causes', effects_solutions: 'Impact & solutions', discussion: 'Discussion', opinion: 'Opinion', mixed: 'Multiple requirements', other: 'Other type' };
const CRITERIA: Record<CriterionKey, { name: string; description: string; short: string }> = {
  task_achievement: { name: 'Task Achievement', description: 'Task fulfillment', short: 'TA' },
  task_response: { name: 'Task Response', description: 'Content & development', short: 'TR' },
  coherence_cohesion: { name: 'Coherence & Cohesion', description: 'Coherence & cohesion', short: 'CC' },
  lexical_resource: { name: 'Lexical Resource', description: 'Vocabulary', short: 'LR' },
  grammatical_range_accuracy: { name: 'Grammatical Range & Accuracy', description: 'Grammatical range & accuracy', short: 'GRA' },
};
const STATUS_LABELS = { scored: 'Evidence verified', partial: 'Partial evaluation', needs_input: 'More info needed', review_required: 'Needs review' };
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
      catch { setStorageNotice('Couldn\'t save the draft locally. Please keep a backup before closing this page.'); }
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
    try { const text = await readEssayFile(file, upload.signal); if (!upload.signal.aborted) { change('essay', text); setFileNotice(`Read ${file.name}. You can edit your content before grading.`); } }
    catch (err) { if (!upload.signal.aborted) setError(err instanceof Error ? err.message : 'Could not read the essay file.'); }
    finally { if (uploadController.current === upload) { setReading(false); if (fileRef.current) fileRef.current.value = ''; } }
  }
  async function importImage(file?: File) {
    if (!file || busyRef.current) return;
    setReading(true); setError('');
    try { const image = await readTaskImage(file); change('task_image', image); setImageName(file.name); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read the image.'); }
    finally { setReading(false); if (imageRef.current) imageRef.current.value = ''; }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busyRef.current || reading) return;
    const fields = [!input.question.trim() && 'question', !input.essay.trim() && 'essay'].filter(Boolean) as string[];
    if (fields.length) { setInvalid(fields); setError('Please add both the prompt and your essay so Capy has enough to work with!'); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    busyRef.current = true; setBusy(true); setElapsed(0); setError(''); setInvalid([]);
    const abort = new AbortController(); controller.current = abort;
    try {
      const snapshot = structuredClone(input);
      const response = await submitScoring(snapshot, abort.signal);
      if (abort.signal.aborted) return;
      setResult(response); setSubmitted(snapshot); setSelected(criterionKeys(snapshot.task_type)[0]); setQuote(''); setEditing(false);
      requestAnimationFrame(() => resultsRef.current?.focus({ preventScroll: true }));
    } catch (err) { if (!abort.signal.aborted) { setError(err instanceof Error ? err.message : 'Couldn\'t grade this essay. Please try again.'); requestAnimationFrame(() => errorRef.current?.focus()); } }
    finally { if (controller.current === abort) { busyRef.current = false; setBusy(false); } }
  }
  function usePracticeDraft() {
    try { const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); if (typeof draft.text === 'string' && draft.text.trim()) { change('essay', draft.text.slice(0, 100_000)); setFileNotice('Loaded draft from your writing journal. Please add the prompt before grading.'); } else setFileNotice('No drafts in your writing journal yet. Feel free to paste or upload an essay.'); }
    catch { setError('Could not read the draft. You can paste your essay directly.'); }
  }
  const displayInput = !editing && submitted ? submitted : input;
  const image = displayInput.task_image;
  return <div className="scoring-page">
    <div className="scoring-intro"><span className="scoring-intro-icon"><BookOpenCheck size={22} aria-hidden="true" /></span><p>A clearer perspective on your writing.<br /><strong>4 IELTS criteria · Feedback backed by evidence from your original text.</strong></p></div>
    <div className={`scoring-workspace ${result && !editing ? 'is-reviewing' : ''}`}>
      <section className="scoring-paper" aria-labelledby="scoring-input-title">
        <div className="scoring-section-heading"><h2 id="scoring-input-title" tabIndex={-1}>{editing ? 'Your essay' : 'Compare with original'}</h2>{!editing && <button className="button secondary" onClick={beginEditing}><Pencil size={15} aria-hidden="true" /> Edit & re-grade</button>}</div>
        {editing ? <form onSubmit={submit} noValidate aria-busy={busy || reading}>
          {configured === false && <div className="scoring-notice"><Info size={18} aria-hidden="true" /><p>Grading service is disabled. Please configure GEMINI_API_KEY on the server and restart the app.</p></div>}
          {error && <div ref={errorRef} className="scoring-error" tabIndex={-1} role="alert"><strong>Unable to grade essay</strong><p>{error}</p>{invalid.map(field => <a key={field} href={`#scoring-${field}`} onClick={e => { e.preventDefault(); document.getElementById(`scoring-${field}`)?.focus(); }}>Add {field === 'question' ? 'the prompt' : 'your essay'} <ArrowRight size={14} aria-hidden="true" /></a>)}</div>}
          <fieldset disabled={busy || reading} className="scoring-fields">
            <div className="scoring-journal-picker"><button type="button" className="button secondary" aria-expanded={picker} onClick={() => setPicker(!picker)}><NotebookPen size={17} aria-hidden="true" /> Select from journal <ChevronDown size={16} aria-hidden="true" /></button>{picker && <div><label><span className="sr-only">Find an entry in your journal to grade</span><input type="search" value={journalQuery} onChange={event => setJournalQuery(event.target.value)} placeholder="Search by title or content…" /></label><div className="journal-picker-filters" aria-label="Filter journal entries">{[0, 1, 2].map(task => <button type="button" key={task} aria-pressed={journalTask === task} onClick={() => setJournalTask(task)}>{task ? `Task ${task}` : 'All entries'}</button>)}</div><p className="scoring-help">Selecting an essay will replace your current input and clear the old prompt to avoid mix-ups. Your journal entry remains untouched.</p><div className="journal-picker-list">{journalMatches.length ? journalMatches.map(essay => <button type="button" key={essay.id} onClick={() => { setSourceId(essay.id); setInput({ ...blankInput(), task_type: essay.task === 1 ? 'academic_task_1' : 'academic_task_2', essay: essay.text }); setImageName(''); setPicker(false); setError(''); setInvalid([]); setFileNotice(`Selected “${essay.title}”. Please add the correct prompt before grading.`); requestAnimationFrame(() => document.getElementById('scoring-question')?.focus()); }}><FileText size={18} aria-hidden="true" /><span><strong>{essay.title}</strong><small>Task {essay.task} · {essay.words} words · {displayDate(essay.date)}{essay.sample ? ' · Sample essay' : ''}</small></span><ArrowRight size={17} aria-hidden="true" /></button>) : <p className="scoring-help">{essays.length ? 'No matching essays found. Try another keyword or select All entries.' : 'Your journal is empty. You can paste or upload your essay below.'}</p>}</div></div>}</div>
            <div className="scoring-selects"><ChoiceSelect label="Task type" value={input.task_type} onChange={value => changeTask(value as TaskType)} options={TASK_TYPES.map(task => ({ value: task, label: TASK_LABELS[task], description: task.endsWith('_2') ? 'Essay · Suggested 250+ words' : task === 'general_task_1' ? 'Letter · Suggested 150+ words' : 'Chart/Visual description · Suggested 150+ words' }))} />{input.task_type === 'general_task_1' ? <div className="scoring-field">Prompt type<span className="scoring-letter-label">Letter writing · Requirements detected automatically</span></div> : <ChoiceSelect label="Prompt type" value={input.question_category || 'auto'} onChange={value => change('question_category', value as ScoringInput['question_category'])} options={[{ value: 'auto', label: 'Auto-detect', description: 'Let AI analyze requirements from the original prompt' }, ...allowedCategories(input.task_type).map(category => ({ value: category, label: CATEGORY_LABELS[category] }))]} />}</div>
            <label className="scoring-field" htmlFor="scoring-question">Writing prompt <span className="scoring-field-hint">Include all prompt instructions</span></label><textarea id="scoring-question" className="scoring-question" lang="en" rows={4} value={input.question} maxLength={12_000} onChange={e => change('question', e.target.value)} placeholder="Paste your IELTS Writing prompt here…" aria-invalid={invalid.includes('question')} aria-describedby={invalid.includes('question') ? 'question-error' : undefined} />
            {invalid.includes('question') && <p className="scoring-field-error" id="question-error">Please enter a prompt to grade.</p>}
            {input.task_type === 'academic_task_1' && <div className="scoring-image-field"><div className="scoring-image-label"><span>Prompt image <small>PNG, JPEG, WebP · max 2 MB</small></span><button className="button secondary" type="button" onClick={() => imageRef.current?.click()}><ImagePlus size={16} aria-hidden="true" />{input.task_image ? 'Change image' : 'Add prompt image'}</button></div>{input.task_image ? <ImagePreview image={input.task_image} name={imageName} onRemove={() => { change('task_image', null); setImageName(''); }} /> : <p className="scoring-help">Without an image, we can still give language feedback, but full Task Achievement and overall band scores won't be available.</p>}</div>}
            <div className="scoring-essay-label"><label htmlFor="scoring-essay">Original essay</label><button className="text-button" type="button" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden="true" /> Upload essay</button></div>
            <div className="scoring-editor"><textarea id="scoring-essay" lang="en" spellCheck={false} rows={11} value={input.essay} maxLength={100_000} onChange={e => change('essay', e.target.value)} placeholder="Write or paste your English essay…" aria-invalid={invalid.includes('essay')} aria-describedby="scoring-word-count scoring-word-note" /><div className="scoring-editor-footer"><span><FileText size={13} aria-hidden="true" /> Original essay preserved</span><span id="scoring-word-count"><strong>{words}</strong> words <span>/ suggested {minimum}+</span></span></div></div>
            {invalid.includes('essay') && <p className="scoring-field-error">Please enter an essay to evaluate.</p>}
            <p className="scoring-help" id="scoring-word-note">{words > 0 && words < minimum ? `This essay is under ${minimum} words. You can still grade it; word count doesn't automatically trigger a fixed penalty.` : 'Word (.docx), TXT, Markdown · up to 5 MB. Evaluating the original text only, no rewriting.'}</p>
            {fileNotice && <p className="scoring-file-notice" role="status">{fileNotice}</p>}
            <button className="text-button scoring-take-draft" type="button" onClick={usePracticeDraft}><NotebookPen size={15} aria-hidden="true" /> Get draft from writing corner</button>
          </fieldset>
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} accept={UPLOAD_ACCEPT} aria-label="Upload essay to grade" disabled={busy || reading} onChange={e => void importEssay(e.target.files?.[0])} />
          <input ref={imageRef} type="file" className="sr-only" tabIndex={-1} accept="image/png,image/jpeg,image/webp" aria-label="Upload Academic Task 1 prompt image" disabled={busy || reading} onChange={e => void importImage(e.target.files?.[0])} />
          <div className="scoring-submit-area"><button className="button primary scoring-submit" type="submit" disabled={busy || reading || configured === false}>{busy ? <><span className="spinner" /> Grading essay...</> : reading ? 'Reading file...' : <><BookOpenCheck size={19} aria-hidden="true" /> Score IELTS essay <ArrowRight size={18} aria-hidden="true" /></>}</button>{busy && <button type="button" className="text-button" onClick={() => { controller.current?.abort(); setBusy(false); busyRef.current = false; setFileNotice('Stopped waiting for results. Your draft is still here.'); }}>Stop waiting</button>}<p className="scoring-privacy"><ShieldCheck size={14} aria-hidden="true" /><span>During grading, the prompt, essay, and image are sent to Gemini. Results are estimated bands, not official IELTS scores.</span></p>{storageNotice && <p className="scoring-help" role="status">{storageNotice}</p>}</div>
        </form> : submitted && <div className="scoring-source"><div className="scoring-source-meta"><span>{TASK_LABELS[submitted.task_type]}</span><span>{countWords(submitted.essay)} words</span></div><details className="scoring-source-question"><summary>Original prompt <ChevronDown size={16} aria-hidden="true" /></summary><p lang="en">{submitted.question}</p>{image && <ImagePreview image={image} />}</details><p className="scoring-source-hint"><ScanText size={15} aria-hidden="true" /> Select a quote in the feedback to view it in the essay.</p><MarkedEssay text={submitted.essay} quote={quote} /></div>}
      </section>
      <aside className="scoring-feedback" aria-label="IELTS grading results">
        {busy ? <div className="scoring-wait" role="status"><img src="/capy-scholar.png" alt="" width="112" height="112" /><h2>Reading every single word.</h2><p>The prompt is analyzed, and the essay is checked against 4 criteria and verified with evidence before returning results.</p><div className="scoring-wait-line"><span className="spinner" /><span>Processing · {elapsed} seconds</span></div><small>Grading may take a bit longer when extra checks are needed. You can stop waiting and keep your draft.</small></div> : result ? <div className="scoring-result">
          <div className="scoring-section-heading"><h2 ref={resultsRef} tabIndex={-1}>Feedback for you</h2><button className="icon-button" aria-label="Download JSON grading results" onClick={() => exportResult(result)}><Download size={18} aria-hidden="true" /></button></div>
          {editing && <p className="scoring-notice">These are results from the previous grading session. Submit again to get feedback on your latest edits.</p>}
          <div className={`scoring-verdict ${result.status === 'scored' ? 'is-scored' : ''}`}><div><p>Estimated IELTS Band</p><strong>{result.estimated_overall_band === null ? '—' : result.estimated_overall_band.toFixed(1)}<span> / 9</span></strong></div><span className="scoring-status">{result.status === 'scored' ? <CheckCheck size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}{STATUS_LABELS[result.status]}</span></div>
          <p className="scoring-band-note">{result.status === 'scored' ? 'Average of 4 criteria, rounded to the nearest 0.5 band. Each criterion carries a 25% weight.' : 'Overall band is shown only when all 4 criteria have been fully evaluated and verified.'}</p>
          <div className="scoring-classification"><span>{CATEGORY_LABELS[result.question_category || ''] || 'Letter writing'}</span><span>Classification: {({ high: 'clear', medium: 'fairly certain', low: 'needs cross-checking' })[result.classification_confidence]}</span></div>
          {(!!result.quality_flags.length || result.status !== 'scored') && <div className="scoring-limitations"><Info size={17} aria-hidden="true" /><div><strong>Things to note</strong><ul>{(result.quality_flags.length ? result.quality_flags : [result.status === 'review_required' ? 'Inconsistent results. Please check the prompt and original essay, then grade again.' : 'More prompt context is needed before providing a full assessment.']).map((flag, i) => <li key={i}>{flag}</li>)}</ul>{result.status !== 'scored' && <button className="text-button" onClick={beginEditing}>{result.status === 'review_required' ? 'Check & grade again' : 'Add information'} <ArrowRight size={14} aria-hidden="true" /></button>}</div></div>}
          {result.criteria && <>
            <div className="scoring-criteria" role="tablist" aria-label="Four IELTS criteria" aria-orientation="vertical">
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
                  <span className="scoring-criterion-name">{CRITERIA[key].name}<small>{CRITERIA[key].description}</small></span>
                  <strong>{criterion.band === null ? '—' : criterion.band.toFixed(1)}</strong>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>;
              })}
            </div>
            {selected && result.criteria[selected] ? (
              <CriterionDetail result={result} selected={selected} onQuote={q => { setQuote(q); setEditing(false); }} selectedQuote={quote} />
            ) : (
              <div id="criterion-detail" role="region" aria-label="Detailed feedback" className="scoring-detail-collapsed">
                <p><Info size={15} aria-hidden="true" /> Click a criterion above (TR, CC, LR, GRA) to open detailed feedback and quoted evidence.</p>
              </div>
            )}
          </>}
          <details className="scoring-analysis"><summary>Prompt requirements & evaluation info <ChevronDown size={16} aria-hidden="true" /></summary><ul>{result.task_requirements.map((requirement, i) => <li key={i}>{requirement}</li>)}</ul><p>{result.classification_notes}</p>{!!result.potential_missing_context.length && <ul>{result.potential_missing_context.map((context, i) => <li key={i}>{context}</li>)}</ul>}<dl><dt>Rubric</dt><dd>{result.rubric_version}</dd><dt>Grading model</dt><dd>{result.examiner_model}</dd><dt>Analysis model</dt><dd>{result.analyzer_model}</dd><dt>Prompt</dt><dd>{result.prompt_version}</dd><dt>Grading session ID</dt><dd>{result.request_id}</dd></dl></details>
        </div> : <div className="scoring-empty"><img src="/capy-scholar.png" width="140" height="140" alt="Capy reads along with you" /><h2>Understand your writing, progress step by step.</h2><p>Add your prompt and essay. Capy will help you see your strengths and areas to improve.</p><div className="scoring-explainer"><div><BookOpenCheck size={19} aria-hidden="true" /><p><strong>All 4 criteria covered</strong><span>Task achievement, coherence, vocabulary, and grammar.</span></p></div><div><MessageSquareQuote size={19} aria-hidden="true" /><p><strong>Grounded in the original essay</strong><span>Every piece of feedback comes with a quote for your reference.</span></p></div><div><SproutIcon /><p><strong>Know your next step</strong><span>Understand what is holding your essay back from a higher band.</span></p></div></div><p className="scoring-gentle-note">A number to guide your way.<br />Every time you write, it's another step forward.</p></div>}
      </aside>
    </div>
  </div>;
}
function ImagePreview({ image, name, onRemove }: { image: TaskImage; name?: string; onRemove?: () => void }) {
  return <div className="scoring-image-preview"><a href={`data:${image.mime_type};base64,${image.data}`} target="_blank" rel="noreferrer" aria-label="Open prompt image in original size"><img src={`data:${image.mime_type};base64,${image.data}`} alt="Chart, table, map, or process in the prompt" /></a>{name && <span>{name}</span>}{onRemove && <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove prompt image"><X size={17} aria-hidden="true" /></button>}</div>;
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
      aria-label={`Quote verification: ${q}`}
    >
      <span className="scoring-quote-indicator" aria-hidden="true"><MessageSquareQuote size={16} /></span>
      <q lang="en">{q}</q>
      <span className="scoring-quote-action" aria-hidden="true"><ScanText size={14} /><span>Inspect essay</span></span>
    </button>
  ));
  return (
    <div id="criterion-detail" role="tabpanel" tabIndex={0} aria-labelledby={`criterion-${selected}`} className="scoring-detail">
      {pieces.length > 0 && (
        <div className="scoring-evidence-section">
          <div className="scoring-evidence-header">
            <span className="scoring-evidence-badge">
              <MessageSquareQuote size={16} aria-hidden="true" />
              <strong>Evidence in essay</strong>
              <span className="scoring-evidence-count">{criterion.evidence_quotes.length}</span>
            </span>
            <span className="scoring-evidence-hint">Click to inspect the original essay</span>
          </div>
          <div className="scoring-quotes">{pieces}</div>
        </div>
      )}
      <div className="scoring-reason-section">
        <h3>Why this evaluation?</h3>
        <p>{criterion.reason}</p>
      </div>
      <div className="scoring-next-band">
        <h3>{criterion.band === null ? 'For a complete assessment' : criterion.band === 9 ? 'Maintain writing quality' : 'To reach the next band'}</h3>
        <p>{criterion.next_band_gap}</p>
      </div>
    </div>
  );
}
