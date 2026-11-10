import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ colorScheme: 'light' });

test('quick toggle and settings share a preference that survives reload and route changes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Chuyển sang chế độ tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/#settings');
  await expect(page.getByRole('radio', { name: 'Tối', exact: true })).toBeChecked();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Sáng', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Chuyển sang chế độ tối' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writing-award:theme:v1'))).toBe('light');
});

test('system mode tracks live device changes while explicit preferences stay fixed', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#settings');
  await expect(page.getByRole('radio', { name: 'Theo hệ thống' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Tối', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'dark' }); await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Theo hệ thống' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('saved theme applies before the React entry loads', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('writing-award:theme:v1', 'dark'));
  await page.route(url => url.pathname === '/src/main.tsx', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#211e24');
});

test('theme still switches if local storage is blocked', async ({ page }) => {
  await page.goto('/#settings');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.getByRole('radio', { name: 'Tối', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.appearance-settings')).toContainText('vẫn áp dụng trong phiên này');
});

test('appearance syncs across tabs without changing saved writing', async ({ page, context }) => {
  await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('writing-award:v1'));
  const second = await context.newPage(); await second.goto('/#settings');
  await second.getByRole('radio', { name: 'Tối', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('writing-award:v1'))).toBe(before);
  await second.close();
});

test('both themes pass accessibility and reflow checks on all routes', async ({ page }) => {
  const viewport = page.viewportSize()!;
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const route of ['home', 'collection', 'journal', 'settings']) {
      await page.setViewportSize(viewport);
      await page.goto(`/#${route}`); await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })), `${theme} ${route}`).toEqual([]);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} ${route} ${width}px`).toBe(true);
      }
    }
  }
});

test('theme changes keep the same 3D canvas and preserve an unsaved essay', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('canvas').first()).toBeVisible();
  const canvas = await page.locator('canvas').first().elementHandle();
  await page.getByRole('textbox', { name: /Bài viết IELTS/ }).fill('My unfinished essay stays here.');
  await page.getByRole('button', { name: 'Xoay mô hình sang phải' }).click();
  await page.getByRole('button', { name: 'Chuyển sang chế độ tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await canvas!.evaluate(node => node.isConnected && node === document.querySelector('canvas'))).toBe(true);
  await expect(page.getByRole('textbox', { name: /Bài viết IELTS/ })).toHaveValue('My unfinished essay stays here.');
});

test('dark appearance keeps validation, reward and destructive confirmation readable', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.locator('.form-error')).toBeVisible();
  let result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole('textbox', { name: /Bài viết IELTS/ }).fill('word '.repeat(250));
  await page.getByRole('button', { name: 'Lưu bài & nhận mảnh' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: `.impeccable/review/theme-dark-reward-${testInfo.project.name}.png` });
  await page.keyboard.press('Escape'); await page.goto('/#settings');
  await page.getByRole('button', { name: 'Bắt đầu mới', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole('button', { name: 'Giữ hành trình này' }).click();
});
