import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const expected = readFileSync(fixture('essay.txt'), 'utf8').replace(/\r\n?/g, '\n');
const fileLabel = 'Chọn tệp bài viết Word DOCX, TXT hoặc Markdown';

test('imports real Word text with paragraphs/Unicode, preserves task and saves to journal', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /Task 1/ }).check();
  await page.getByRole('tab', { name: 'Tải tệp lên' }).click();
  await expect(page.getByText('Word (.docx), TXT, Markdown · tối đa 5 MB')).toBeVisible();
  await page.getByLabel(fileLabel).setInputFiles(fixture('essay.docx'));
  const editor = page.getByRole('textbox', { name: /Bài viết IELTS Writing Task 1/ });
  await expect(editor).toHaveValue(expected);
  await expect(page.getByRole('radio', { name: /Task 1/ })).toBeChecked();
  await expect(page.locator('#word-count')).toContainText('276');
  await expect(page.locator('.import-notice')).toContainText('essay.docx');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.impeccable/review/word-import-${info.project.name}.png`, fullPage: true });
  await editor.fill(`${expected}\n\nOne more sentence.`);
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/#journal'); await page.locator('.journal-entry').first().click();
  await expect(page.locator('.essay-text')).toHaveText(`${expected}\n\nOne more sentence.`);
});

test('corrupt, empty and overlong Word leave the previous draft intact and permit retry', async ({ page }) => {
  await page.goto('/');
  const draft = 'Please keep my existing draft.';
  await page.getByRole('textbox', { name: /Bài viết IELTS/ }).fill(draft);
  await page.getByRole('tab', { name: 'Tải tệp lên' }).click();
  const input = page.getByLabel(fileLabel);
  await input.setInputFiles({ name: 'damaged.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('not a zip file') });
  await expect(page.locator('.form-error')).toContainText('Chưa đọc được tệp Word');
  await input.setInputFiles(fixture('empty.docx'));
  await expect(page.locator('.form-error')).toContainText('chưa có nội dung văn bản');
  await input.setInputFiles(fixture('too-long.docx'));
  await expect(page.locator('.form-error')).toContainText('100.000');
  await page.getByRole('tab', { name: 'Dán bài viết' }).click();
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue(draft);
  await page.getByRole('tab', { name: 'Tải tệp lên' }).click();
  await input.setInputFiles(fixture('essay.docx'));
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue(expected);
});

test('legacy Word and oversized files give actionable messages', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Tải tệp lên' }).click();
  const input = page.getByLabel(fileLabel);
  await input.setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('old format') });
  await expect(page.locator('.form-error')).toContainText('Lưu dưới dạng → .docx');
  await input.setInputFiles({ name: 'large.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.locator('.form-error')).toContainText('lớn hơn 5 MB');
});

test('drag-and-drop Word works in dark mode with a long filename', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await page.getByRole('tab', { name: 'Tải tệp lên' }).click();
  const bytes = [...readFileSync(fixture('essay.docx'))];
  const transfer = await page.evaluateHandle(bytes => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'Bài-viết-IELTS-của-tôi-với-tên-tệp-rất-dài.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    return dt;
  }, bytes);
  await page.getByRole('tabpanel').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.impeccable/review/word-import-dark-${info.project.name}.png`, fullPage: true });
});
