import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = '.impeccable/review'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ colorScheme: theme, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const route of ['home', 'settings', 'collection', 'journal']) {
      await page.goto(`http://localhost:5173/#${route}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (route === 'home' || route === 'collection') await page.locator('canvas').first().waitFor();
      // Demand-rendered thumbnails outside the viewport must be visited before a full-page capture.
      for (const canvas of await page.locator('canvas').all()) {
        await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(160);
      }
      await page.waitForTimeout(450); await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${out}/theme-${theme}-${route}-${device}.png`, fullPage: true });
    }
  }
  await context.close();
}
await browser.close(); await writeFile(`${out}/theme-console-errors.json`, JSON.stringify(errors));
console.log('Captured both themes on all routes, desktop and mobile. Console errors:', errors);
