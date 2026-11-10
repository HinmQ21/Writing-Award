import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('.impeccable/review', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const theme of ['light', 'dark']) for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('http://localhost:5173');
    await page.locator('canvas').waitFor(); await page.locator('#upload-tab').click();
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/essay.docx');
    await page.waitForFunction(() => document.querySelector('#essay')?.value?.includes('word269'));
    await page.locator('#essay').blur();
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.screenshot({ path: `.impeccable/review/word-${theme}-${device}.png`, fullPage: true });
    await page.locator('.writing-panel').screenshot({ path: `.impeccable/review/word-panel-${theme}-${device}.png` });
    await context.close();
  }
} finally { await browser.close(); }
console.log('Captured Word import in both appearances and desktop/mobile layouts.');
