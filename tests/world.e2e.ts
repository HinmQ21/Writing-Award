import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The world Capy (src/capyWorld.ts) walks around the home world on its own. In the dev server the scene element
// carries `data-capy`, a short description of what Capy is doing ("<activity> <clip> <shown|hidden> door <0..1>").
const scene = (page: Page) => page.locator('.scene-render').first();

async function openWith(page: Page, pieces: number) {
  await page.goto('/');
  await page.waitForFunction(() => localStorage.getItem('writing-award:v1'));
  await page.evaluate(count => { const s = JSON.parse(localStorage.getItem('writing-award:v1')!); s.pieces = count; localStorage.setItem('writing-award:v1', JSON.stringify(s)); }, pieces);
  await page.reload();
  // The scene only draws while it is on screen (on a phone it starts below the fold).
  await scene(page).scrollIntoViewIfNeeded();
}

test('Capy steps out of the cottage on the first visit and carries on by itself, without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await openWith(page, 12);
  // With a door (7+ pieces), a session starts with Capy indoors, coming out to say good morning.
  await expect(scene(page)).toHaveAttribute('data-capy', /^goodMorning /, { timeout: 30_000 });
  const seen = new Set<string>();
  await expect.poll(async () => { seen.add((await scene(page).getAttribute('data-capy'))?.split(' ')[0] ?? ''); return seen.size; }, { timeout: 40_000, intervals: [400] }).toBeGreaterThan(1);
  await expect(scene(page)).toHaveAttribute('data-capy', / shown /, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('with reduced motion Capy holds a still signature pose in each world', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openWith(page, 12);
  await expect(scene(page)).toHaveAttribute('data-capy', /^signature Calm shown/, { timeout: 30_000 });
  await openWith(page, 31);
  await expect(scene(page)).toHaveAttribute('data-capy', /^signature Water shown .* can$/, { timeout: 30_000 });
  await context.close();
});
