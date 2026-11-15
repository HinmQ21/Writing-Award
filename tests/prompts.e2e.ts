import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createProgress } from '../src/model';

const question = 'Some people believe daily habits matter more than ambitious goals. Discuss both views and give your opinion.';
const otherQuestion = 'Cities should invest more in public transport. To what extent do you agree or disagree?';
const first = 'First original version. ' + 'practice '.repeat(260);
const second = 'Second improved version. ' + 'learning '.repeat(260);
async function fresh(page: Page) {
  await page.addInitScript(progress => { if (!localStorage.getItem('writing-award:v1')) localStorage.setItem('writing-award:v1', JSON.stringify(progress)); }, createProgress(false));
  await page.goto('/');
}
async function save(page: Page, label = 'Save & claim piece') {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
}
test('requires a prompt, keeps immutable versions together and awards only one daily piece', async ({ page }) => {
  await fresh(page); await page.getByRole('textbox', { name: /IELTS Writing/ }).fill(first);
  await page.getByRole('button', { name: 'Save & claim piece' }).click();
  await expect(page.getByRole('alert')).toContainText('writing prompt');
  await expect(page.getByLabel('Daily writing prompt', { exact: true })).toBeFocused();
  await page.getByLabel('Daily writing prompt', { exact: true }).fill(question); await save(page);
  await expect(page.getByText('Writing Version 2', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: /IELTS Writing/ }).fill(second); await save(page, 'Save another writing');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('writing-award:v1')!));
  expect(state.version).toBe(2); expect(state.prompts).toHaveLength(1); expect(state.prompts[0].question).toBe(question);
  expect(state.essays.map((essay: { versionNumber: number }) => essay.versionNumber)).toEqual([2, 1]);
  expect(state.essays[1].text).toBe(first.trim()); expect(state.essays[0].text).toBe(second.trim()); expect(state.pieces).toBe(1); expect(state.streak).toBe(1);
  await page.goto('/#journal'); await expect(page.locator('.journal-prompt-group')).toHaveCount(1);
  await expect(page.locator('.journal-prompt-group summary').first()).toContainText('2 versions');
  await page.locator('.journal-entry').filter({ hasText: 'Version 1' }).click();
  await expect(page.locator('.essay-text')).toHaveText(first.trim()); await expect(page.locator('.essay-prompt-context')).toContainText(question);
});

test('keeps separate unfinished drafts when switching prompts and restores them from the journal', async ({ page }) => {
  await fresh(page); await page.getByLabel('Daily writing prompt', { exact: true }).fill(question); await page.getByRole('textbox', { name: /IELTS Writing/ }).fill(first); await save(page);
  await page.getByRole('textbox', { name: /IELTS Writing/ }).fill('Unfinished habits version.');
  await page.getByRole('button', { name: 'New prompt', exact: true }).click();
  await page.getByLabel('Daily writing prompt', { exact: true }).fill(otherQuestion); await page.getByRole('textbox', { name: /IELTS Writing/ }).fill(second); await save(page, 'Save another writing');
  await page.getByRole('textbox', { name: /IELTS Writing/ }).fill('Unfinished city version.');
  await page.getByRole('button', { name: 'Change prompt', exact: true }).click();
  await page.getByRole('searchbox', { name: /Find a Task/ }).fill('daily habits'); await page.locator('.saved-prompt-list button').first().click();
  await expect(page.getByRole('textbox', { name: /IELTS Writing/ })).toHaveValue('Unfinished habits version.');
  await page.getByRole('button', { name: 'Change prompt', exact: true }).click();
  await page.getByRole('searchbox', { name: /Find a Task/ }).fill('Cities'); await page.locator('.saved-prompt-list button').first().click();
  await expect(page.getByRole('textbox', { name: /IELTS Writing/ })).toHaveValue('Unfinished city version.');
  await page.goto('/#journal');
  const group = page.locator('.journal-prompt-group').filter({ hasText: question });
  if (await group.getAttribute('open') === null) await group.locator('summary').first().click();
  await group.getByRole('button', { name: 'Write another version' }).click();
  await expect(page.getByRole('textbox', { name: /IELTS Writing/ })).toHaveValue('Unfinished habits version.');
  await page.reload(); await expect(page.getByRole('textbox', { name: /IELTS Writing/ })).toHaveValue('Unfinished habits version.');
  await expect(page.locator('.selected-prompt')).toContainText(question);
});

test('carries the saved prompt and exact version into scoring with no automatic AI request', async ({ page }) => {
  let posts = 0; await page.route('**/api/score', route => { if (route.request().method() === 'POST') posts++; return route.fulfill({ json: { configured: true } }); });
  await fresh(page); await page.getByLabel('Daily writing prompt', { exact: true }).fill(question); await page.getByRole('textbox', { name: /IELTS Writing/ }).fill(first);
  await page.getByRole('checkbox', { name: 'Get IELTS feedback for this piece' }).check();
  await page.getByRole('button', { name: 'Save & continue grading' }).click(); await page.getByRole('button', { name: 'Continue grading', exact: true }).click();
  await expect(page.locator('#scoring-question')).toHaveValue(question); await expect(page.locator('#scoring-essay')).toHaveValue(first.trim()); expect(posts).toBe(0);
  await page.goto('/#journal'); await page.locator('.journal-score-action').first().click();
  await expect(page.locator('#scoring-question')).toHaveValue(question); await expect(page.locator('#scoring-essay')).toHaveValue(first.trim()); expect(posts).toBe(0);
});

test('migrates old entries, links them as versions and keeps original text, dates and rewards', async ({ page }) => {
  const progress = createProgress(false), { prompts: _prompts, ...base } = progress;
  const essays = [first, second].map((text, index) => ({ id: `old-${index}`, text: text.trim(), title: `Older entry ${index}`, task: 2, words: 263, date: `2026-10-0${index + 1}T08:00:00Z`, rewarded: index === 0 }));
  await page.addInitScript(old => localStorage.setItem('writing-award:v1', JSON.stringify(old)), { ...base, version: 1, essays });
  await page.goto('/#journal'); await expect(page.locator('.legacy-journal .journal-entry')).toHaveCount(2);
  await page.locator('.legacy-journal').getByRole('button', { name: 'Add a prompt', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('Daily writing prompt', { exact: true }).fill(question); await page.getByRole('button', { name: 'Save prompt link' }).click();
  await page.locator('.legacy-journal').getByRole('button', { name: 'Add a prompt', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Saved prompt', exact: true }).click(); await page.locator('.saved-prompt-list button').first().click();
  await page.getByRole('button', { name: 'Save prompt link' }).click(); await expect(page.locator('.legacy-journal')).toHaveCount(0);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('writing-award:v1')!));
  expect(state.version).toBe(2); expect(state.prompts).toHaveLength(1); expect(state.pieces).toBe(0);
  expect(state.essays.map(({ promptId: _id, versionNumber: _version, ...essay }: { promptId: string; versionNumber: number }) => essay)).toEqual(essays);
  expect(state.essays.map((essay: { versionNumber: number }) => essay.versionNumber)).toEqual([1, 2]);
});

test('new prompt and saved prompt views retain drafts without clearing an active choice', async ({ page }) => {
  await fresh(page); await page.getByLabel('Daily writing prompt', { exact: true }).fill(question); await page.getByRole('textbox', { name: /IELTS Writing/ }).fill('Draft not yet ready to save.');
  await page.getByRole('button', { name: 'New prompt', exact: true }).click(); await expect(page.getByLabel('Daily writing prompt', { exact: true })).toHaveValue(question);
  await page.getByRole('button', { name: 'Saved prompt', exact: true }).click(); await expect(page.getByText('No saved prompts for this task yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'New prompt', exact: true }).click(); await expect(page.getByRole('textbox', { name: /IELTS Writing/ })).toHaveValue('Draft not yet ready to save.');
  await expect(page.getByLabel('Daily writing prompt', { exact: true })).toHaveValue(question);
});

test('prompt forms and grouped versions reflow and remain accessible in both themes', async ({ page }, info) => {
  await fresh(page); await page.getByLabel('Daily writing prompt', { exact: true }).fill(question); await page.getByRole('textbox', { name: /IELTS Writing/ }).fill(first); await save(page);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'New prompt', exact: true }).click();
    for (const route of ['home', 'journal']) {
      await page.goto(`/#${route}`);
      if (route === 'home') {
        const placeholder = await page.getByLabel('Daily writing prompt', { exact: true }).evaluate(element => ({ color: getComputedStyle(element, '::placeholder').color, opacity: getComputedStyle(element, '::placeholder').opacity }));
        expect(placeholder).toEqual({ color: theme === 'dark' ? 'rgb(197, 183, 173)' : 'rgb(108, 98, 89)', opacity: '1' });
      }
      for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
      await page.setViewportSize(info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.failureSummary) }))).toEqual([]);
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); scrollTo(0, 0); });
      if (info.project.name === 'mobile' && route === 'home') await page.locator('.writing-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.impeccable/review/prompts-${route}-${theme}-${info.project.name}.png`, fullPage: info.project.name === 'desktop' });
    }
    await page.goto('/#home');
  }
});
