/**
 * Collect Lighthouse on the preview and assert the budget.
 * Does not upload. Chrome is Playwright's Chromium unless CHROME_PATH is set.
 */
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const chromePath = process.env.CHROME_PATH || chromium.executablePath();
if (!chromePath) {
  console.error('No Chromium. Install it with: npx playwright install chromium');
  process.exit(1);
}
const env = { ...process.env, CHROME_PATH: chromePath };
console.log(`Lighthouse Chrome: ${chromePath}`);

for (const command of ['collect', 'assert']) {
  const result = spawnSync('lhci', [command], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
