import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const bannerFor = (page: Page) => page.locator('.banner-spotlight');
const activeSlide = (page: Page) => bannerFor(page).locator('.banner-slide[data-active=true]');

async function openBanner(page: Page) {
  await page.goto('/');
  const banner = bannerFor(page);
  await expect(banner.locator('.banner-pagination button')).toHaveCount(4);
  await expect(activeSlide(page)).toHaveCount(1);
  await expect(banner).toHaveAttribute('data-motion', 'running');
  await expect(page.getByText(/giảm chuyển động/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /giảm chuyển động/i })).toHaveCount(0);
  await expect(banner.locator('.banner-pause')).toHaveCount(0);
  await expect(banner.getByRole('button', { name: /tạm dừng banner|tiếp tục banner/i })).toHaveCount(0);
  return banner;
}

test('banner autoplays while hovered and manual selection resets the interval without stopping rotation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  const banner = await openBanner(page);
  const first = await activeSlide(page).getAttribute('href');

  await activeSlide(page).hover();
  await expect(banner).toHaveAttribute('data-motion', 'running');
  await page.clock.fastForward(4600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', first!);
  await expect(banner.locator('.spotlight-name')).toHaveAttribute('href', (await activeSlide(page).getAttribute('href'))!);

  // Selection late in an interval must grant a fresh 4.5 seconds to the selected item.
  await page.clock.fastForward(3000);
  await banner.locator('.banner-pagination button').nth(3).click();
  await expect(banner.locator('.banner-pagination button').nth(3)).toHaveAttribute('aria-current', 'true');
  await expect(banner).toHaveAttribute('data-motion', 'running');
  const selected = await activeSlide(page).getAttribute('href');
  await page.clock.fastForward(3000);
  await expect(activeSlide(page)).toHaveAttribute('href', selected!);
  await page.clock.fastForward(1600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', selected!);

  const beforeArrow = await activeSlide(page).getAttribute('href');
  await banner.getByRole('button', { name: 'Thiết bị tiếp theo', exact: true }).click();
  await expect(activeSlide(page)).not.toHaveAttribute('href', beforeArrow!);
  await expect(banner).toHaveAttribute('data-motion', 'running');

  const afterArrow = await activeSlide(page).getAttribute('href');
  await page.clock.fastForward(4600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', afterArrow!);
  const beforePrevious = await activeSlide(page).getAttribute('href');
  await banner.getByRole('button', { name: 'Thiết bị trước', exact: true }).click();
  await expect(activeSlide(page)).not.toHaveAttribute('href', beforePrevious!);
  await expect(banner).toHaveAttribute('data-motion', 'running');
  const previous = await activeSlide(page).getAttribute('href');
  await page.clock.fastForward(4600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', previous!);
});

test('keyboard focus on links and scrolling away suspend autoplay temporarily', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  const banner = await openBanner(page);
  await banner.locator('.spotlight-name').focus();
  await expect(banner).toHaveAttribute('data-motion', 'paused');
  const focused = await activeSlide(page).getAttribute('href');
  await page.clock.fastForward(9000);
  await expect(activeSlide(page)).toHaveAttribute('href', focused!);
  await page.locator('.hero-copy .button').focus();
  await expect(banner).toHaveAttribute('data-motion', 'running');
  await page.clock.fastForward(4600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', focused!);

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await expect(banner).toHaveAttribute('data-motion', 'paused');
  const offscreen = await activeSlide(page).getAttribute('href');
  await page.clock.fastForward(9000);
  await expect(activeSlide(page)).toHaveAttribute('href', offscreen!);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(banner).toHaveAttribute('data-motion', 'running');
  await page.clock.fastForward(4600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', offscreen!);
});

test('reduced motion keeps automatic image changes, with static transforms and no disabled status control', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  const banner = await openBanner(page);
  await expect(banner.getByRole('button', { name: /tạm dừng banner|tiếp tục banner/i })).toHaveCount(0);
  await expect(activeSlide(page)).toHaveCSS('transform', 'none');
  await expect(activeSlide(page).locator('.product-image')).toHaveCSS('animation-name', 'none');
  const first = await activeSlide(page).getAttribute('href');
  await page.clock.fastForward(4600);
  await expect(activeSlide(page)).not.toHaveAttribute('href', first!);
  await expect(activeSlide(page)).toHaveCSS('transform', 'none');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(banner).toHaveAttribute('data-motion', 'running');
  await expect(page.getByText(/giảm chuyển động/i)).toHaveCount(0);
});

test('banner controls and long device titles fit phone, tablet and desktop widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mkdir('qa/banner', { recursive: true });
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const banner = await openBanner(page);
    await banner.locator('.banner-pagination button').nth(2).click();
    await expect(banner.locator('.banner-pagination button').nth(2)).toHaveAttribute('aria-current', 'true');
    await expect(banner).toHaveAttribute('data-motion', 'running');
    await expect.poll(() => activeSlide(page).locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    const frame = await page.locator('.home-showcase').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: bounds.left, right: bounds.right, radius: Number.parseFloat(style.borderTopLeftRadius), overflow: style.overflow };
    });
    expect(frame.left).toBeGreaterThan(0);
    expect(frame.right).toBeLessThan(width);
    expect(frame.radius).toBeGreaterThan(0);
    expect(frame.overflow).toBe('hidden');
    await expect(activeSlide(page).locator('img')).toHaveCSS('padding', '0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await banner.screenshot({ path: `qa/banner/banner-${width}.png`, animations: 'disabled' });
  }
});

test('empty catalog retains one labelled introductory image without carousel controls', async ({ page }) => {
  await page.route(url => url.pathname === '/api/products' && url.searchParams.get('limit') === '24', route => route.fulfill({ json: { data: [] } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const banner = bannerFor(page);
  await expect(banner.getByText('Hình giới thiệu', { exact: true })).toBeVisible();
  await expect(activeSlide(page)).toHaveAttribute('href', '/products');
  await expect(banner.locator('.banner-pagination button')).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Thiết bị tiếp theo' })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Tạm dừng banner' })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Tiếp tục banner' })).toHaveCount(0);
  await expect(page.getByText(/giảm chuyển động/i)).toHaveCount(0);
});
