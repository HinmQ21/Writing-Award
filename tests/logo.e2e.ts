import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The logo mark is Capy's live 3D bust (src/CapyLogo.tsx): one canvas for both the sidebar and the mobile topbar marks,
// bursts of motion that come to rest, and the flat picture whenever 3D cannot be shown.
const liveMark = (page: Page) => page.locator('.brand-mark.is-live');
const logoCanvas = (page: Page) => page.locator('.brand-mark canvas');
const logoLink = (page: Page) => page.getByRole('link', { name: 'Writing Award, back to your corner' });
const GRUMPY = 'Capy puffs up its cheeks';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}
/** Waits until the logo stops drawing: two captures in a row are identical. */
async function settled(page: Page) {
  const canvas = liveMark(page).locator('canvas');
  let previous = await canvas.screenshot();
  await expect.poll(async () => { const next = await canvas.screenshot(); const same = previous.equals(next); previous = next; return same; }, { timeout: 20_000, intervals: [500] }).toBe(true);
  return previous;
}
async function changes(page: Page, from: Buffer) {
  const canvas = liveMark(page).locator('canvas');
  await expect.poll(async () => !from.equals(await canvas.screenshot()), { timeout: 5_000, intervals: [150] }).toBe(true);
}
async function expectPicture(page: Page) {
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000);
  await expect(liveMark(page)).toHaveCount(0);
  await expect(logoCanvas(page)).toHaveCount(0);
  const picture = page.locator('.brand-mark:visible img');
  await expect(picture).toHaveAttribute('src', '/favicon.svg');
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth > 0 && getComputedStyle(img).opacity === '1')).toBe(true);
}

test('one canvas shows the logo, comes to rest after its burst and replays on keyboard focus', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#journal');
  await expect(liveMark(page)).toHaveCount(1);
  await expect(logoCanvas(page)).toHaveCount(1);
  await expect(liveMark(page).locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  await expect(logoLink(page)).toHaveCount(1); // the other mark is hidden by the breakpoint
  await expect(logoLink(page)).toBeVisible();
  const rest = await settled(page);
  // Tab: the skip link, then the visible logo link.
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(logoLink(page)).toBeFocused();
  await changes(page, rest);
  await settled(page);
  expect(errors).toEqual([]);
});

/** Centres the world in the viewport and finds Capy on it by the hover cursor (once the model is in). */
async function findWorldCapy(page: Page) {
  const scene = page.locator('.scene-render canvas').first();
  await scene.evaluate(canvas => canvas.scrollIntoView({ block: 'center' }));
  let spot: { x: number; y: number } | null = null;
  await expect.poll(async () => {
    spot = await scene.evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect(), hits: [number, number][] = [];
      for (let y = rect.top + 6; y < rect.bottom; y += 8) for (let x = rect.left + 6; x < rect.right; x += 8) {
        if (document.elementFromPoint(x, y) !== canvas) continue; // overlays and the mobile nav
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
        if (canvas.style.cursor === 'pointer') hits.push([x, y]);
      }
      canvas.style.cursor = '';
      if (!hits.length) return null;
      return { x: hits.reduce((sum, [x]) => sum + x, 0) / hits.length, y: hits.reduce((sum, [, y]) => sum + y, 0) / hits.length };
    });
    return spot;
  }, { timeout: 20_000 }).not.toBeNull();
  return spot!;
}

test('a tap on the world Capy shows on the logo, and world taps and logo clicks share one poke count', async ({ page }) => {
  const errors = watchErrors(page);
  const toast = page.locator('.toast');
  await page.goto('/');
  await expect(liveMark(page)).toHaveCount(1);
  const rest = await settled(page);
  let spot = await findWorldCapy(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(toast).toContainText('Capy'); // a friendly line from the world
  await expect(toast).not.toContainText(GRUMPY);
  await changes(page, rest); // and the logo is surprised
  await page.waitForTimeout(3200); // that poke has expired
  spot = await findWorldCapy(page);
  await page.mouse.click(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  await logoLink(page).click(); // still a link home
  expect(await toast.textContent()).not.toContain(GRUMPY);
  await logoLink(page).click();
  await expect(toast).toContainText(GRUMPY);
  await expect(page).toHaveURL(/#home$/);
  expect(errors).toEqual([]);
});

test('reduced motion holds still poses: no bursts, a poke changes the pose and returns', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#journal');
  await expect(liveMark(page)).toHaveCount(1);
  await page.waitForTimeout(400); // the picture-to-canvas cross-fade
  const canvas = liveMark(page).locator('canvas');
  const still = await canvas.screenshot();
  await page.waitForTimeout(800);
  expect(still.equals(await canvas.screenshot())).toBe(true);
  // Stay on this page: opening the home world while the pose returns only adds load (the pokes test covers navigation).
  await page.evaluate(() => document.addEventListener('click', event => event.preventDefault(), { capture: true, once: true }));
  await logoLink(page).click();
  await changes(page, still);
  await expect.poll(async () => still.equals(await canvas.screenshot()), { timeout: 10_000, intervals: [250] }).toBe(true);
  await expect(page).toHaveURL(/#journal$/);
});

test('shows the picture while the WebGL context is lost and recovers when it returns', async ({ page }) => {
  await page.goto('/#journal');
  await expect(liveMark(page)).toHaveCount(1);
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('.brand-mark canvas')!.getContext('webgl2')!;
    (window as unknown as { loseLogo: WEBGL_lose_context }).loseLogo = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { loseLogo: WEBGL_lose_context }).loseLogo.loseContext();
  });
  await expect(liveMark(page)).toHaveCount(0);
  await expect(page.locator('.brand-mark:visible img')).toHaveCSS('opacity', '1');
  await page.evaluate(() => (window as unknown as { loseLogo: WEBGL_lose_context }).loseLogo.restoreContext());
  await expect(liveMark(page)).toHaveCount(1);
  await expect(logoCanvas(page)).toHaveCount(1);
});

test('keeps the picture when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (getContext as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof getContext;
  });
  await page.goto('/#journal');
  await expectPicture(page);
});

test('keeps the picture without downloading the model when WebAssembly is blocked or Save-Data is on', async ({ browser }) => {
  for (const block of [
    () => { delete (window as { WebAssembly?: unknown }).WebAssembly; },
    () => { Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true }) }); },
  ]) {
    const context = await browser.newContext(); // a cold HTTP cache
    const page = await context.newPage();
    await page.addInitScript(block);
    const models: string[] = []; // a cache-only probe that misses gets no response
    page.on('response', response => { if (response.url().includes('/models/capy.glb')) models.push(`${response.status()} ${response.url()}`); });
    await page.goto('/#journal');
    await expectPicture(page);
    expect(models).toEqual([]);
    await context.close();
  }
});
