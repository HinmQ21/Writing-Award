import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const career = JSON.parse(readFileSync(new URL('./fixtures/career-scoring.json', import.meta.url), 'utf8'));
import type { ScoringInput } from '../src/scoring/types';
const REVIEW_VERSION = 'ielts_corrections_v1.0';

const input = career as ScoringInput;
const sourceText = 'Firstly, people who enter the workforce could achieve early financial dependence.';
const source = { id: 's4', text: sourceText, start: input.essay.indexOf(sourceText), end: input.essay.indexOf(sourceText) + sourceText.length };
const sources = [{ text: input.essay.split('\n\n')[0] }, { text: input.essay.split('\n\n')[0] }];
const criterion = { band: 7, reason: 'The essay discusses both views and states a position.', evidence_quotes: [sources[1].text], next_band_gap: 'Develop the causal explanation more precisely.' };
const score = { status: 'scored', task_type: 'academic_task_2', question_category: 'discussion', classification_confidence: 'high', classification_notes: 'Both views and an opinion.', task_requirements: ['Discuss both views and give an opinion.'], potential_missing_context: [], word_count: 336, estimated_overall_band: 7, criteria: { task_response: criterion, coherence_cohesion: criterion, lexical_resource: criterion, grammatical_range_accuracy: criterion }, quality_flags: [], rubric_version: 'ielts_official_v1', prompt_version: 'test', examiner_model: 'test', analyzer_model: 'test', request_id: 'assessment-1', scored_at: new Date().toISOString(), rounding_rule: 'nearest_half_up' };
const review = { status: 'complete', omitted_items: 0, items: [
  { kind: 'error', criterion: 'lexical_resource', category: 'vocabulary', priority: 'high', confidence: 'high', title: 'Dependence reverses your intended meaning', explanation: 'You describe paying your own expenses; independence expresses that meaning.', impact: 'This affects precision of word choice.', action: 'Use independence to express financial self-sufficiency.', suggestion: source.text.replace('financial dependence', 'financial independence'), evidence_ids: [source.id] },
  { kind: 'improvement', criterion: 'task_response', category: 'development', priority: 'medium', confidence: 'medium', title: 'Explain the connection between prices and pay', explanation: 'Rising service prices do not by themselves explain a higher salary.', impact: 'The supporting argument needs a clearer causal link.', action: 'Explain a relevant way early work experience can benefit a school leaver, using your own example.', suggestion: null, evidence_ids: [] },
].map((item, index) => { const { evidence_ids, ...details } = item; return { ...details, id: `issue-${index + 1}`, passages: evidence_ids.length ? [source] : [] }; }), limitations: [], request_id: 'review-1', review_model: 'test', review_version: REVIEW_VERSION, essay_sha256: 'test', reviewed_at: new Date().toISOString() };

async function grade(page: Page) {
  await page.route('**/api/score', route => route.fulfill({ json: route.request().method() === 'GET' ? { configured: true } : score }));
  await page.goto('/#scoring');
  await page.locator('#scoring-question').fill(input.question); await page.locator('#scoring-essay').fill(input.essay);
  await page.getByRole('button', { name: 'Score IELTS essay', exact: true }).click();
  await expect(page.locator('.scoring-verdict')).toContainText('7.0');
}
async function openReview(page: Page) { await page.getByRole('tab', { name: 'Corrections & next steps', exact: true }).click(); }

test('requests an explicit review, anchors passages, filters findings and exports without changing the essay or score', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/corrections', route => { posts++; expect(route.request().postDataJSON()).toEqual(input); return route.fulfill({ json: review }); });
  await grade(page); await openReview(page); expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Review my essay' }).click();
  await expect(page.getByText('Dependence reverses your intended meaning', { exact: true })).toBeVisible(); expect(posts).toBe(1);
  await page.getByRole('button', { name: 'View original passage' }).click();
  await expect(page.locator('.scoring-original mark')).toHaveText(source.text);
  await expect(page.locator('.scoring-original')).toHaveText(input.essay);
  await expect(page.locator('.correction-suggestion')).toContainText('financial independence');
  await page.getByRole('button', { name: /^Improvements/ }).click();
  await expect(page.getByText('Explain the connection between prices and pay', { exact: true })).toBeVisible();
  await expect(page.getByText('Whole-essay feedback', { exact: false })).toBeVisible();
  await page.getByLabel('Criterion', { exact: true }).selectOption('lexical_resource');
  await expect(page.getByText('No findings match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON grading results' }).click();
  const stream = await (await download).createReadStream(); let json = ''; for await (const chunk of stream!) json += chunk;
  expect(JSON.parse(json)).toMatchObject({ estimated_overall_band: 7, corrections: { request_id: 'review-1' } });
  await page.getByRole('tab', { name: 'Band feedback', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Task Response/ })).toBeVisible();
  await openReview(page); await expect(page.getByText('Dependence reverses your intended meaning', { exact: true })).toBeVisible(); expect(posts).toBe(1);
});

test('review errors and retries retain the visible band and original input', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/corrections', route => ++attempt === 1 ? route.fulfill({ status: 503, json: { error: 'The review service is temporarily overloaded.' } }) : route.fulfill({ json: review }));
  await grade(page); await openReview(page); await page.getByRole('button', { name: 'Review my essay' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily overloaded'); await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.locator('.scoring-verdict')).toContainText('7.0'); await expect(page.locator('.scoring-original')).toHaveText(input.essay);
  await page.getByRole('button', { name: 'Try review again' }).click();
  await expect(page.getByText('Dependence reverses your intended meaning', { exact: true })).toBeVisible();
});

test('review cancellation is recoverable and ignores late responses', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/corrections', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: review }).catch(() => {}); });
  await grade(page); await openReview(page); await page.getByRole('button', { name: 'Review my essay' }).click();
  await expect(page.getByRole('button', { name: 'Stop review' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop review' }).click(); release?.();
  await expect(page.getByText('Review stopped.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review my essay' })).toBeVisible(); await expect(page.locator('.scoring-verdict')).toContainText('7.0');
});

test('reviews the assessed snapshot while editing and resets after a new assessment', async ({ page }) => {
  await page.route('**/api/corrections', route => { expect(route.request().postDataJSON().essay).toBe(input.essay); return route.fulfill({ json: review }); });
  await grade(page); await page.getByRole('button', { name: 'Edit & re-grade' }).click();
  await page.locator('#scoring-essay').fill('Changed, unsubmitted draft.'); await openReview(page);
  await page.getByRole('button', { name: 'Review my essay' }).click();
  await expect(page.getByText('Dependence reverses your intended meaning', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View original passage' }).click(); await expect(page.locator('.scoring-original mark')).toHaveText(source.text);
  await page.getByRole('button', { name: 'Edit & re-grade' }).click(); await page.getByRole('button', { name: 'Score IELTS essay', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Band feedback', exact: true })).toHaveAttribute('aria-selected', 'true');
  await openReview(page); await expect(page.getByRole('button', { name: 'Review my essay' })).toBeVisible();
});

test('distinguishes partial rejected findings from an empty clean review', async ({ page }) => {
  await page.route('**/api/corrections', route => route.fulfill({ json: { ...review, status: 'partial', items: [], omitted_items: 1, limitations: ['One finding could not be verified and was omitted.'] } }));
  await grade(page); await openReview(page); await page.getByRole('button', { name: 'Review my essay' }).click();
  await expect(page.getByText('Partial review', { exact: true })).toBeVisible(); await expect(page.getByText('No findings passed verification')).toBeVisible();
  await page.getByRole('button', { name: 'Edit & re-grade' }).click(); await page.getByRole('button', { name: 'Score IELTS essay', exact: true }).click();
  await page.route('**/api/corrections', route => route.fulfill({ json: { ...review, items: [] } }));
  await openReview(page); await page.getByRole('button', { name: 'Review my essay' }).click();
  await expect(page.getByText('No confident issues identified')).toBeVisible();
});

test('correction states support keyboard navigation, both themes, reflow and accessible reading', async ({ page }, info) => {
  await page.route('**/api/corrections', route => route.fulfill({ json: review }));
  await grade(page); const tab = page.getByRole('tab', { name: 'Band feedback', exact: true }); await tab.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Corrections & next steps', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Review my essay' }).click(); await expect(page.locator('.correction-item').first()).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
    await page.setViewportSize(info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.locator('#feedback-tab-corrections').scrollIntoViewIfNeeded();
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.failureSummary) }))).toEqual([]);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); });
    if (info.project.name === 'desktop') await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `.impeccable/review/corrections-${theme}-${info.project.name}.png`, fullPage: info.project.name === 'desktop' });
  }
});
