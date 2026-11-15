import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ScanText, SpellCheck } from 'lucide-react';
import type { CorrectionsResult, ReviewPassage } from './corrections';
import type { ScoringInput } from './types';
import { criterionKeys } from './types';
import { submitCorrections } from './client';

const labels: Record<string, string> = { task_response: 'Task Response', task_achievement: 'Task Achievement', coherence_cohesion: 'Coherence & Cohesion', lexical_resource: 'Lexical Resource', grammatical_range_accuracy: 'Grammar & Accuracy', grammar: 'Grammar', vocabulary: 'Vocabulary', spelling: 'Spelling', punctuation: 'Punctuation', organisation: 'Organisation', development: 'Development', task_fulfilment: 'Task fulfilment' };

export default function CorrectionsPanel({ input, onLocate, onResult }: { input: ScoringInput; onLocate: (passage: ReviewPassage) => void; onResult: (result: CorrectionsResult) => void }) {
  const [review, setReview] = useState<CorrectionsResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [kind, setKind] = useState('all'), [criterion, setCriterion] = useState('all');
  const request = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    if (request.current) return;
    const abort = new AbortController(); request.current = abort;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await submitCorrections(input, abort.signal);
      if (abort.signal.aborted) return;
      setReview(result); onResult(result);
    } catch (err) {
      if (!abort.signal.aborted) { setError(err instanceof Error ? err.message : 'Could not review this essay. Please try again.'); requestAnimationFrame(() => errorRef.current?.focus({ preventScroll: true })); }
    } finally { if (request.current === abort) { request.current = null; setBusy(false); } }
  }
  const matches = review?.items.filter(item => (kind === 'all' || item.kind === kind) && (criterion === 'all' || item.criterion === criterion)) ?? [];
  return <section className="corrections-panel" aria-labelledby="corrections-heading">
    <h3 id="corrections-heading">Learn what to change, and why</h3>
    <p className="corrections-intro">Review specific language errors and ways to strengthen your ideas. Suggestions refer to the assessed original; your essay and band stay unchanged.</p>
    {!review && !busy && <div className="corrections-start"><SpellCheck size={26} aria-hidden="true" /><p>Get a focused review with original passages, explanations and suggested fixes. Errors and optional improvements are labelled separately.</p><button type="button" className="button primary" onClick={() => void load()}>{error ? 'Try review again' : 'Review my essay'}<ArrowRight size={17} aria-hidden="true" /></button><small>This sends the original prompt, essay and any attached image to Gemini for a separate review.</small></div>}
    {busy && <div className="corrections-loading"><p role="status"><span className="spinner" /> Looking for useful corrections and next steps…</p><button className="text-button" type="button" onClick={() => { request.current?.abort(); request.current = null; setBusy(false); setNotice('Review stopped. Your band assessment and essay are unchanged.'); }}>Stop review</button></div>}
    {notice && <p className="scoring-help" role="status">{notice}</p>}
    {error && <div className="corrections-error" role="alert" ref={errorRef} tabIndex={-1}><strong>Could not complete the correction review</strong><p>{error}</p><p>Your band assessment and original essay are still available.</p></div>}
    {review && <>
      <div className="corrections-filters"><div className="corrections-kind" role="group" aria-label="Filter review findings">{(['all', 'error', 'improvement'] as const).map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{value === 'all' ? 'All' : value === 'error' ? 'Errors' : 'Improvements'} <span>{review.items.filter(item => value === 'all' || item.kind === value).length}</span></button>)}</div><label>Criterion<select aria-label="Criterion" value={criterion} onChange={event => setCriterion(event.target.value)}><option value="all">All criteria</option>{criterionKeys(input.task_type).map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></label></div>
      <p className="corrections-count" role="status">Showing {matches.length} of {review.items.length} focused findings. Priority indicates what to work on first, not a band deduction.</p>
      {!!review.limitations.length && <div className="corrections-limits"><strong>{review.status === 'partial' ? 'Partial review' : 'Review limits'}</strong><ul>{review.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></div>}
      {!matches.length && <div className="corrections-empty"><Check size={22} aria-hidden="true" /><h4>{review.items.length ? 'No findings match these filters' : review.status === 'partial' ? 'No findings passed verification' : 'No confident issues identified'}</h4><p>{review.items.length ? 'Choose All and All criteria to see the full review.' : 'This is a focused AI review and may miss issues. Keep using the criterion feedback to guide your next revision.'}</p>{!!review.items.length && <button type="button" className="text-button" onClick={() => { setKind('all'); setCriterion('all'); }}>Clear filters</button>}</div>}
      <div className="corrections-list">{matches.map((item, index) => <details key={item.id} className="correction-item" open={index === 0 ? true : undefined}>
        <summary><span><span className={`correction-kind ${item.kind}`}>{item.kind === 'error' ? 'Error' : 'Improvement'}</span><span className="correction-priority">{({ high: 'High priority', medium: 'Medium priority', low: 'Low priority' })[item.priority]}</span><strong>{item.title}</strong><span className="correction-criterion">{labels[item.category]} · {labels[item.criterion]}{item.confidence === 'medium' ? ' · Check context' : ''}</span></span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="correction-body">{item.passages.length ? item.passages.map(passage => <div className="correction-source" key={passage.id}><blockquote>{passage.text}</blockquote><button type="button" className="text-button" onClick={() => onLocate(passage)}><ScanText size={15} aria-hidden="true" /> View original passage</button></div>) : <p className="correction-scope">Whole-essay feedback · no single passage to highlight</p>}<p>{item.explanation}</p><h4>{item.suggestion ? 'Suggested correction' : 'Try this'}</h4>{item.suggestion && <p className="correction-suggestion">{item.suggestion}</p>}<p>{item.action}</p><h4>Why it matters</h4><p>{item.impact}</p></div>
      </details>)}</div>
      <p className="corrections-footnote">A focused review of up to 12 issues, not an exhaustive error count. Suggestions are examples for you to consider; no changes are applied automatically.</p>
      <details className="corrections-method"><summary>How to use this feedback</summary><p>Work on high-priority findings first. Check each suggestion against your intended meaning, then edit and submit again when ready. IELTS bands reflect performance across four criteria; individual findings do not have fixed point deductions.</p><a href="https://ielts.org/take-a-test/preparation-resources/writing-test-resources" target="_blank" rel="noreferrer">Read the official IELTS assessment guidance</a><p>Review model: {review.review_model} · {review.review_version}</p></details>
    </>}
  </section>;
}
