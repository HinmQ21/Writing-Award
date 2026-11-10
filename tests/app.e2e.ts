import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const writing = Array.from({ length: 260 }, (_, i) => `word${i}`).join(' ');
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); });

test('validates, preserves drafts, submits and awards only once', async ({ page }) => {
  const essay = page.getByRole('textbox', { name: /Bài viết IELTS/ });
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.getByRole('alert')).toContainText('250');
  await essay.fill(writing); await expect(page.getByText('Đã lưu nháp')).toBeVisible();
  await page.reload(); await expect(essay).toHaveValue(writing);
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Ống khói nhỏ');
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Mảnh xây dựng mới, số 13' })).toBeVisible();
  await page.getByRole('button', { name: 'Về ngắm công trình' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '13');
  await expect(essay).toHaveValue('');
  await essay.fill(writing);
  await page.getByRole('button', { name: 'Lưu thêm một bài viết' }).click();
  await expect(page.getByRole('dialog')).toContainText('đã nhận mảnh hôm nay');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '13');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('writing-award:v1')!));
  expect(state.essays).toHaveLength(14); expect(state.streak).toBe(13);
});

test('uploads supported text, retains task and rejects unsupported files', async ({ page }) => {
  await page.getByRole('tab', { name: 'Tải tệp lên' }).click();
  const file = page.getByLabel('Chọn tệp bài viết Word DOCX, TXT hoặc Markdown');
  await file.setInputFiles({ name: 'essay.pdf', mimeType: 'application/pdf', buffer: Buffer.from('example') });
  await expect(page.getByRole('alert')).toContainText('Word .docx, .txt hoặc .md');
  await file.setInputFiles({ name: 'essay.txt', mimeType: 'text/plain', buffer: Buffer.from(writing) });
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue(writing);
  await page.getByRole('radio', { name: /Task 1/ }).check();
  await expect(page.getByRole('textbox', { name: /Task 1/ })).toBeVisible();
});

test('journal supports search, empty recovery and reading saved entries', async ({ page }) => {
  await page.goto('/#journal');
  await page.getByRole('searchbox', { name: 'Tìm bài viết' }).fill('no-such-essay-ever');
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy trang viết này.' })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.locator('.journal-entry').first().click();
  await expect(page.getByRole('dialog')).toContainText('Some people believe');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('locks worlds sequentially and demo preview preserves the journal', async ({ page }) => {
  await page.goto('/#collection');
  const worlds = page.locator('.collection-world');
  await expect(worlds.nth(1)).toBeDisabled(); await expect(worlds.nth(2)).toBeDisabled();
  await page.getByRole('button', { name: 'Xem thế giới tiếp' }).click();
  await expect(worlds.nth(1)).toBeEnabled(); await expect(worlds.nth(2)).toBeDisabled();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('writing-award:v1')!));
  expect(state.pieces).toBe(21); expect(state.essays).toHaveLength(12);
});

test('settings exports data and reset can be cancelled', async ({ page }) => {
  await page.goto('/#settings');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Tải bản sao', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/writing-award-.*\.json/);
  await page.getByRole('button', { name: 'Bắt đầu mới', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Giữ hành trình này' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('every route fits 320, 390, 768, 1024 and 1440 pixel viewports', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['home', 'collection', 'journal', 'settings']) {
      await page.goto(`/#${route}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${route} at ${width}px`).toBe(false);
    }
  }
});

test('WCAG automated checks on all primary pages', async ({ page }) => {
  for (const route of ['home', 'collection', 'journal', 'settings']) {
    await page.goto(`/#${route}`); await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), route).toEqual([]);
  }
});

test('dialog traps focus, escapes and restores focus', async ({ page }) => {
  const help = page.getByRole('button', { name: 'Hướng dẫn cách chơi' });
  if (await help.isVisible()) await help.click();
  else { await page.goto('/#settings'); await page.getByRole('button', { name: 'Tìm hiểu cách hoạt động' }).click(); }
  await expect(page.getByRole('dialog')).toBeVisible();
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
});

test('preserves corrupted local data and offers a recoverable error', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('writing-award:v1', '{broken-data'));
  await page.reload();
  await expect(page.locator('.error-notice')).toContainText('Dữ liệu cũ được giữ nguyên');
  await page.getByRole('textbox', { name: /Bài viết IELTS/ }).fill(writing);
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.locator('.form-error')).toContainText('tải bản sao dữ liệu cũ');
  expect(await page.evaluate(() => localStorage.getItem('writing-award:v1'))).toBe('{broken-data');
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue(writing);
});

test('keeps the essay when local persistence fails', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.getByRole('textbox', { name: /Bài viết IELTS/ }).fill(writing);
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.locator('.form-error')).toContainText('Chưa lưu được');
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue(writing);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('3D controls change the rendered scene and mobile entry opens the writer', async ({ page }, testInfo) => {
  const canvas = page.locator('canvas').first(); await expect(canvas).toBeVisible();
  await page.waitForTimeout(250);
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'Xoay mô hình sang phải' }).click();
  await page.waitForTimeout(150);
  const after = await canvas.screenshot(); expect(Buffer.compare(before, after)).not.toBe(0);
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Viết hôm nay' }).click();
    await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toBeFocused();
  }
});

test('touch scrolling over the scene preserves page scrolling', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Synthesized touch is checked in the touch-enabled mobile context.');
  const canvas = page.locator('canvas').first(); await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const x = rect.x + rect.width / 2, startY = Math.min(700, rect.y + rect.height * .7);
  const before = await page.evaluate(() => window.scrollY);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - i * 20 }] }); await page.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 20);
  await cdp.detach();
});
