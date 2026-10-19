import { expect, test, type Page } from '@playwright/test';

/**
 * Screenshot baselines for the key routes.
 *
 * Font mitigation: these PNGs are produced and compared only in
 * mcr.microsoft.com/playwright:v1.64.1-jammy (linux/amd64), which pins
 * Chromium, fontconfig, and FreeType. The host runner's fonts are not
 * compared. Set PYAI_VISUAL_RUNNER=playwright-jammy-1.64.1 only in that image.
 *
 * The build SHA changes every commit. It is hidden with CSS, not Playwright's
 * mask overlay: that overlay flickers on a footer below the fold. "Now" is
 * frozen so the builder freshness line does not change with the calendar.
 */
const RUNNER = 'playwright-jammy-1.64.1';
const FIXED_NOW_MS = Date.parse('2026-10-16T12:00:00Z');

const ROUTES: { name: string; path: string; heading: RegExp }[] = [
  { name: 'home', path: '/', heading: /Pick your AI stack/i },
  { name: 'builder', path: '/builder', heading: /^Untitled AI stack$/ },
  { name: 'catalog-model', path: '/catalog/model', heading: /Choose an AI model/i },
];

test.describe('visual baselines', () => {
  test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

  test.beforeEach(() => {
    const info = test.info();
    test.skip(info.project.name !== 'desktop-chromium', 'desktop 1440×900 baselines only');
    test.skip(
      process.platform !== 'linux' || process.env.PYAI_VISUAL_RUNNER !== RUNNER,
      'compare screenshots only in mcr.microsoft.com/playwright:v1.64.1-jammy',
    );
  });

  for (const route of ROUTES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${route.path} ${theme}`, async ({ page }) => {
        await openSettled(page, route.path, route.heading);
        if (theme === 'dark') {
          await page.getByRole('button', { name: 'Switch to dark theme' }).click();
          await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
        }
        if (route.path === '/builder') {
          await expect(page.getByText('captured 0 days ago')).toBeVisible();
        }
        await freezeForScreenshot(page);
        await expect(page).toHaveScreenshot(`${route.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
        });
      });
    }
  }
});

/** Sticky bars change full-page height while Chromium stitches the shot. */
async function freezeForScreenshot(page: Page) {
  await page.addStyleTag({
    content: `
      .sticky {
        position: static !important;
        max-height: none !important;
        overflow: visible !important;
        backdrop-filter: none !important;
      }
      [data-testid="build-sha"] {
        visibility: hidden !important;
        display: inline-block;
        width: 7ch;
        overflow: hidden;
      }
    `,
  });
  await page.evaluate(async () => {
    let last = -1;
    for (let i = 0; i < 8; i += 1) {
      const height = document.documentElement.scrollHeight;
      if (height === last) return;
      last = height;
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
  });
}

async function openSettled(page: Page, path: string, heading: RegExp) {
  await page.addInitScript(`(() => {
    const fixed = ${FIXED_NOW_MS};
    const RealDate = Date;
    function MockDate(...args) {
      const date = args.length ? new RealDate(...args) : new RealDate(fixed);
      if (!new.target) return date.toString();
      Object.setPrototypeOf(date, MockDate.prototype);
      return date;
    }
    MockDate.prototype = Object.create(RealDate.prototype);
    MockDate.prototype.constructor = MockDate;
    MockDate.now = () => fixed;
    MockDate.parse = RealDate.parse.bind(RealDate);
    MockDate.UTC = RealDate.UTC.bind(RealDate);
    window.Date = MockDate;
    try {
      localStorage.removeItem('pyai.theme');
      localStorage.removeItem('pyai.currentBuildId');
    } catch (e) {}
  })();`);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
  });
}
