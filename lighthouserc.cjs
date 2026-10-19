/**
 * Local Lighthouse assert. There is no upload target, so results stay in
 * .lighthouseci/ and are not sent to an LHCI server.
 *
 * Budgets are the two thresholds already met in docs/TESTING.md:
 * performance >= 90 and accessibility = 100 (minScore 1). No Best Practices
 * or SEO assertions. Collection uses Lighthouse's default mobile emulation
 * and simulated throttling. Median of 3 runs.
 *
 * Chrome: CHROME_PATH, otherwise chrome-launcher. CI sets CHROME_PATH to
 * Playwright's Chromium inside mcr.microsoft.com/playwright:v1.64.1-jammy.
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:4317/',
        'http://localhost:4317/builder',
        'http://localhost:4317/catalog/model',
      ],
      startServerCommand: 'npm run preview',
      // Vite bolds the word Local, so "Local:" never matches. The URL does.
      startServerReadyPattern: 'localhost:',
      startServerReadyTimeout: 60000,
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 1, aggregationMethod: 'median' }],
      },
    },
  },
};
