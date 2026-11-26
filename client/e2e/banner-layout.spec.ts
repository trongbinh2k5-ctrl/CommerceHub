import { test, expect, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function expectCleanHero(hero: Locator) {
  await expect(hero.locator('h1')).toContainText('Chọn thiết bị.');
  await expect(hero.locator('h1')).toContainText('Nâng trải nghiệm.');
  await expect(hero.locator('.hero-copy .button')).toHaveCount(1);
  await expect(hero.locator('.hero-browse, .hero-features-bar')).toHaveCount(0);
  await expect(hero.locator('.banner-badge-top, .banner-price-chip, .spotlight-badge, .banner-ambient-glow, .banner-glow')).toHaveCount(0);
  await expect(hero.locator('.banner-pause')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: /tạm dừng banner|tiếp tục banner/i })).toHaveCount(0);
  await expect(hero.getByText(/Chính hãng 100%|Giao nhanh 2H|Bảo hành 24T|Đổi mới 30 ngày|Giá ưu đãi/i)).toHaveCount(0);
}

test('hero prioritizes the image and keeps compact copy across screen sizes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mkdir('qa/banner-layout', { recursive: true });
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const hero = page.locator('.home-showcase');
    const banner = hero.locator('.banner-spotlight');
    await expect(banner.locator('.banner-pagination button')).toHaveCount(4);
    await expect(banner).toHaveAttribute('data-motion', 'running');
    await expect.poll(() => banner.locator('.banner-slide[data-active=true] img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await expectCleanHero(hero);

    const dimensions = await hero.evaluate(element => {
      const copy = element.querySelector('.hero-copy')!.getBoundingClientRect();
      const stage = element.querySelector('.banner-stage')!.getBoundingClientRect();
      const heading = element.querySelector('h1')!;
      const frame = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        frameLeft: frame.left,
        frameRight: frame.right,
        frameRadius: Number.parseFloat(style.borderTopLeftRadius),
        frameOverflow: style.overflow,
        copyWidth: copy.width,
        copyHeight: copy.height,
        copyBottom: copy.bottom,
        stageWidth: stage.width,
        stageTop: stage.top,
        headingSize: Number.parseFloat(getComputedStyle(heading).fontSize),
      };
    });
    expect(dimensions.frameLeft, `Hero needs a left margin at ${width}px`).toBeGreaterThan(0);
    expect(dimensions.frameRight, `Hero needs a right margin at ${width}px`).toBeLessThan(width);
    expect(dimensions.frameRadius).toBeGreaterThan(0);
    expect(dimensions.frameOverflow).toBe('hidden');
    await expect(banner.locator('.banner-slide[data-active=true] img')).toHaveCSS('padding', '0px');
    if (width >= 1000) {
      expect(dimensions.stageWidth, `The image stage should dominate at ${width}px`).toBeGreaterThan(dimensions.copyWidth * 1.45);
      expect(dimensions.headingSize, `Desktop heading is too large at ${width}px`).toBeLessThanOrEqual(44);
    }
    if (width <= 760) {
      expect(dimensions.headingSize, `Mobile heading is too large at ${width}px`).toBeLessThanOrEqual(30);
      expect(dimensions.copyHeight, `Mobile copy should leave room for the image at ${width}px`).toBeLessThanOrEqual(330);
      expect(dimensions.copyBottom).toBeLessThanOrEqual(dimensions.stageTop + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `Horizontal overflow at ${width}px`).toBe(width);
    await hero.screenshot({ path: `qa/banner-layout/home-${width}.png`, animations: 'disabled' });
  }
});

test('introductory ASUS cutout keeps its static size under reduced motion without invented promises', async ({ page }) => {
  await page.route(url => url.pathname === '/api/products' && url.searchParams.get('limit') === '24', route => route.fulfill({ json: { data: [] } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-08T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-08T12:00:01Z'));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  const hero = page.locator('.home-showcase');
  const banner = hero.locator('.banner-spotlight');
  await expect(banner.getByText('Hình giới thiệu', { exact: true })).toBeVisible();
  await expect(banner.locator('.banner-slide[data-active=true]')).toHaveAttribute('href', '/products');
  const image = banner.locator('.banner-slide[data-active=true] img');
  await expect(image).toHaveAttribute('src', '/images/products/asus-rog-strix-g16-2024.png');
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(image).toHaveCSS('padding', '0px');
  const scale = await image.evaluate(element => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.a, y: matrix.d };
  });
  expect(scale.x).toBeCloseTo(1.35, 2);
  expect(scale.y).toBeCloseTo(1.35, 2);
  await expectCleanHero(hero);
  await expect(banner.getByRole('button', { name: 'Tạm dừng banner', exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  await mkdir('qa/banner-layout', { recursive: true });
  await hero.screenshot({ path: 'qa/banner-layout/fallback-1280.png', animations: 'disabled' });
});
