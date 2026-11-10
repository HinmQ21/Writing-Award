import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = '.impeccable/review'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5173'); await page.locator('canvas').waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
for (const [name, width, height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844],['small-mobile',320,740]]) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(400); await page.evaluate(() => window.scrollTo(0,0)); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
await page.setViewportSize({ width: 1440, height: 1000 });
for (const route of ['collection', 'journal', 'settings']) { await page.goto(`http://localhost:5173/#${route}`); await page.waitForTimeout(1300); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${out}/${route}.png`, fullPage: true }); }
await writeFile(`${out}/console-errors.json`, JSON.stringify(errors)); await browser.close(); console.log('Captured desktop, tablet, mobile, small-mobile and all secondary routes. Console errors:', errors);
