import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ScoringResult } from '../src/scoring/types';

const essay = 'Some people prefer daily practice. I agree because habits build confidence. However, goals also provide direction.';
const criterion = { band: 6, reason: 'Bài viết có ý chính rõ, nhưng phần phát triển lập luận còn ngắn.', evidence_quotes: ['habits build confidence'], next_band_gap: 'Bổ sung lập luận và dẫn chứng cụ thể để làm rõ ý chính.' };
const fixture: ScoringResult = {
  status: 'scored', task_type: 'academic_task_2', question_category: 'opinion', classification_confidence: 'high', classification_notes: 'Đề yêu cầu nêu quan điểm.', task_requirements: ['Nêu lập trường và giải thích.'], potential_missing_context: [], word_count: 16,
  estimated_overall_band: 6, criteria: { task_response: criterion, coherence_cohesion: criterion, lexical_resource: criterion, grammatical_range_accuracy: criterion }, quality_flags: [], rubric_version: 'ielts_official_v1', prompt_version: 'ielts_scoring_v1.1.0', examiner_model: 'gemini-3.8-flash', analyzer_model: 'gemini-3.5-flash-lite', request_id: 'test-scoring-001', scored_at: '2026-11-12T10:00:00Z', rounding_rule: 'nearest_half_up',
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/score', async route => { if (route.request().method() === 'GET') await route.fulfill({ json: { configured: true } }); else await route.fulfill({ json: fixture }); });
  await page.goto('/#scoring');
  await expect(page.getByRole('heading', { name: 'Bài viết của bạn', exact: true })).toBeVisible();
});
async function fill(page: import('@playwright/test').Page) {
  await page.getByLabel('Đề bài', { exact: false }).first().fill('Daily habits matter more than ambitious goals. Do you agree or disagree?');
  await page.getByLabel('Bài viết gốc', { exact: true }).fill(essay);
}
test('validates required fields, retains short drafts and never makes an API call for empty content', async ({ page }) => {
  let posts = 0; page.on('request', request => { if (request.url().endsWith('/api/score') && request.method() === 'POST') posts++; });
  await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('bổ sung đề bài'); expect(posts).toBe(0);
  await fill(page); await expect(page.locator('#scoring-word-note')).toContainText('vẫn có thể chấm');
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('writing-award:scoring-draft:v1') || '{}').essay)).toBe(essay);
  await page.reload(); await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
});
test('scores with original input, highlights evidence, supports keyboard criteria navigation and exports JSON', async ({ page }) => {
  await fill(page);
  const request = page.waitForRequest(r => r.url().endsWith('/api/score') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ essay, question_category: 'auto', rubric_version: 'ielts_official_v1' });
  await expect(page.getByRole('heading', { name: 'Nhận xét cho bạn' })).toBeVisible();
  await expect(page.locator('.scoring-verdict')).toContainText('6.0');
  await page.getByRole('button', { name: /Đối chiếu trích dẫn/ }).click();
  await expect(page.locator('.scoring-original mark')).toHaveText('habits build confidence');
  const tab = page.getByRole('tab', { name: /Task Response/ }); await tab.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: /Coherence & Cohesion/ })).toHaveAttribute('aria-selected', 'true');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Tải kết quả chấm JSON' }).click();
  expect((await download).suggestedFilename()).toBe('ielts-writing-test-scoring-001.json');
  await page.getByRole('button', { name: 'Sửa & chấm lại' }).click(); await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
});
test('Academic Task 1 without an image explains partial scoring and never invents overall band', async ({ page }) => {
  await page.getByRole('combobox', { name: /Loại bài thi/ }).click(); await page.getByRole('option', { name: 'Academic · Task 1', exact: false }).click();
  await expect(page.getByText('Thiếu ảnh vẫn có thể')).toBeVisible();
  await page.route('**/api/score', route => route.request().method() === 'GET' ? route.fulfill({ json: { configured: true } }) : route.fulfill({ json: { ...fixture, task_type: 'academic_task_1', question_category: 'bar_chart', status: 'partial', estimated_overall_band: null, criteria: { task_achievement: { ...criterion, band: null, evidence_quotes: [] }, coherence_cohesion: criterion, lexical_resource: criterion, grammatical_range_accuracy: criterion }, quality_flags: ['Thiếu ảnh đề Academic Task 1.'] } }));
  await fill(page); await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.locator('.scoring-verdict')).toContainText('Đánh giá một phần');
  await expect(page.locator('.scoring-verdict strong')).toContainText('—'); await expect(page.getByRole('tab', { name: /Task Achievement/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bổ sung thông tin' }).click(); await expect(page.getByRole('button', { name: 'Thêm ảnh đề' })).toBeVisible();
});
test('shows provider errors without losing the essay and exposes a meaningful waiting state with cancel', async ({ page }) => {
  await fill(page);
  await page.route('**/api/score', route => route.fulfill({ status: 429, json: { error: 'Dịch vụ đang hết hạn mức. Hãy thử lại sau.' } }));
  await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('hạn mức'); await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
  await page.route('**/api/score', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.fulfill({ json: fixture }); });
  await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đang đọc từng câu chữ.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dừng chờ' }).click(); await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
  await expect(page.getByRole('button', { name: 'Chấm bài IELTS', exact: true })).toBeEnabled();
});
test('review_required explains reassessment and returns focus to the editable form', async ({ page }, info) => {
  await page.route('**/api/score', route => route.fulfill({ json: { ...fixture, status: 'review_required', criteria: null, estimated_overall_band: null, quality_flags: ['Kết quả chưa nhất quán. Hãy kiểm tra lại đề và bài gốc.'] } }));
  await fill(page); await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.locator('.scoring-verdict')).toContainText('Cần kiểm tra lại');
  await page.evaluate(() => { scrollTo(0, 0); return document.fonts.ready.then(() => undefined); });
  await page.screenshot({ path: `.impeccable/review/scoring-review-required-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Kiểm tra & chấm lại' }).click();
  await expect(page.getByRole('heading', { name: 'Bài viết của bạn', exact: true })).toBeFocused();
  await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
});
test('reads Netlify streaming responses and reports embedded provider errors', async ({ page }) => {
  await page.route('**/api/score', route => route.request().method() === 'GET' ? route.fulfill({ json: { configured: true } }) : route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'keepalive' })}\n${JSON.stringify({ type: 'result', status: 429, data: { error: 'Gemini đang hết hạn mức. Hãy thử lại sau.' } })}\n` }));
  await fill(page); await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('hết hạn mức'); await expect(page.locator('#scoring-essay')).toHaveValue(essay);
  await page.route('**/api/score', route => route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'keepalive' })}\n${JSON.stringify({ type: 'result', status: 200, data: fixture })}\n` }));
  await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nhận xét cho bạn' })).toBeVisible();
});
test('handles letters, uploads essays, accepts chart images and preserves state when an image is invalid', async ({ page }) => {
  await page.getByRole('combobox', { name: /Loại bài thi/ }).click(); await page.getByRole('option', { name: 'General Training · Task 1', exact: false }).click(); await expect(page.getByText('Viết thư · Tự phân tích yêu cầu')).toBeVisible();
  await page.getByLabel('Tải bài viết để chấm', { exact: true }).setInputFiles({ name: 'essay.txt', mimeType: 'text/plain', buffer: Buffer.from(essay) });
  await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
  await page.getByRole('combobox', { name: /Loại bài thi/ }).click(); await page.getByRole('option', { name: 'Academic · Task 1', exact: false }).click();
  await page.getByLabel('Tải ảnh đề Academic Task 1', { exact: true }).setInputFiles({ name: 'chart.gif', mimeType: 'image/gif', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('PNG, JPEG hoặc WebP'); await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(essay);
  await page.getByLabel('Tải ảnh đề Academic Task 1', { exact: true }).setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.getByAltText('Biểu đồ, bảng, bản đồ hoặc quy trình trong đề bài')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa ảnh đề bài' }).click(); await expect(page.getByAltText('Biểu đồ, bảng, bản đồ hoặc quy trình trong đề bài')).toHaveCount(0);
});
test('is reachable from a journal entry without changing rewards', async ({ page }) => {
  await page.goto('/#journal'); const before = await page.evaluate(() => localStorage.getItem('writing-award:v1'));
  await page.locator('.journal-entry').first().click(); await page.getByRole('button', { name: 'Chấm bài viết này' }).click();
  await expect(page.getByLabel('Bài viết gốc', { exact: true })).not.toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('writing-award:v1'))).toBe(before);
  const changed = 'My edited journal essay remains in the scoring workspace.';
  await page.getByLabel('Bài viết gốc', { exact: true }).fill(changed);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('writing-award:scoring-draft:v1') || '{}').essay)).toBe(changed);
  await page.goto('/#journal'); await page.goto('/#scoring');
  await expect(page.getByLabel('Bài viết gốc', { exact: true })).toHaveValue(changed);
});
test('all scoring states reflow at mobile and desktop widths and pass automated accessibility in both themes', async ({ page }, testInfo) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} input ${width}`).toBe(true);
    }
    await page.evaluate(() => document.fonts.ready);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })), `${theme} form`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' }); await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.screenshot({ path: `.impeccable/review/scoring-input-${testInfo.project.name}.png`, fullPage: true });
  await fill(page); await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Nhận xét cho bạn' })).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} result ${width}`).toBe(true);
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })), `${theme} results`).toEqual([]);
    await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }); await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `.impeccable/review/scoring-result-${theme}-${testInfo.project.name}.png`, fullPage: true });
  }
});
test('journal picker searches, filters and brings an existing essay into scoring', async ({ page }, info) => {
  await page.getByRole('button', { name: /Chọn bài từ nhật ký/ }).click();
  const search = page.getByRole('searchbox', { name: 'Tìm bài trong nhật ký để chấm' });
  await search.fill('unfindable-example'); await expect(page.getByText('Chưa tìm thấy bài phù hợp.', { exact: false })).toBeVisible();
  await search.fill(''); await page.getByRole('button', { name: 'Task 1', exact: true }).click();
  await expect(page.locator('.journal-picker-list button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Task 2', exact: true }).click();
  await page.screenshot({ path: `.impeccable/review/journal-picker-${info.project.name}.png`, fullPage: true });
  const first = page.locator('.journal-picker-list button').first(); await expect(first).toContainText('Task 2'); await first.click();
  await expect(page.locator('#scoring-essay')).not.toHaveValue(''); await expect(page.locator('#scoring-question')).toHaveValue(''); await expect(page.locator('#scoring-question')).toBeFocused();
  await expect(page.getByRole('combobox', { name: /Loại bài thi/ })).toContainText('Academic · Task 2');
  await page.goto('/#journal'); await page.locator('.journal-score-action').first().click();
  await expect(page.locator('#scoring-essay')).not.toHaveValue('');
});
test('home optionally saves an essay and continues to full scoring form without making a paid call', async ({ page }, info) => {
  await page.goto('/'); let posts = 0; page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/score')) posts++; });
  await page.getByRole('textbox', { name: /Bài viết IELTS Writing/ }).fill('practice '.repeat(260));
  await page.getByRole('checkbox', { name: 'Nhận đánh giá IELTS cho bài này' }).check();
  await page.screenshot({ path: `.impeccable/review/home-score-choice-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Lưu bài & tiếp tục chấm' }).click();
  await page.getByRole('button', { name: 'Tiếp tục chấm bài', exact: true }).click();
  await expect(page.locator('#scoring-essay')).toHaveValue('practice '.repeat(260).trim()); expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Chấm bài IELTS', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('bổ sung đề bài'); expect(posts).toBe(0);
});
test('custom choices support keyboard, selected states, reflow and readable themed popups', async ({ page }, info) => {
  const trigger = page.getByRole('combobox', { name: /Loại bài thi/ }); await trigger.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible(); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await expect(trigger).toContainText('Academic · Task 1'); await expect(trigger).toBeFocused();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.getByRole('combobox', { name: /Dạng đề/ }).click();
    await page.getByRole('option', { name: 'Biểu đồ cột', exact: true }).focus();
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(audit.violations).toEqual([]);
    await page.getByRole('option', { name: 'Biểu đồ cột', exact: true }).focus();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/choices-${theme}-${info.project.name}.png`, fullPage: true });
    await page.keyboard.press('Escape');
  }
});
