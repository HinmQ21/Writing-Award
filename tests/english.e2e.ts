import { expect, test } from '@playwright/test';

test('all pages use English while saved essay content remains unchanged', async ({ page }, info) => {
  await page.route('**/api/score', route => route.fulfill({ json: { configured: true } }));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const route of ['home', 'collection', 'journal', 'settings', 'scoring']) {
      await page.goto(`/#${route}`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (route === 'scoring') await expect(page.locator('#scoring-essay')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const copy = await page.locator('body').innerText();
      expect(copy).not.toMatch(/[đĐăĂâÂêÊôÔơƠưƯàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ\u1ea0-\u1ef9]/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); scrollTo(0, 0); });
      await page.screenshot({ path: `.impeccable/review/english-${route}-${theme}-${info.project.name}.png`, fullPage: info.project.name === 'desktop' });
    }
  }
  const original = 'Bài viết gốc của tôi phải được giữ nguyên. My original essay stays unchanged.';
  await page.evaluate(text => {
    const progress = JSON.parse(localStorage.getItem('writing-award:v1')!);
    progress.essays[0].text = text; progress.essays[0].title = 'Original saved essay';
    localStorage.setItem('writing-award:v1', JSON.stringify(progress));
  }, original);
  await page.goto('/#journal'); await page.reload();
  await page.locator('.journal-entry').first().click();
  await expect(page.locator('.essay-text')).toHaveText(original);
});
