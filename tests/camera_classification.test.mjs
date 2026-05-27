/**
 * Purpose:
 *   End-to-end test of the CAMERA capture path. Chromium's fake camera is fed
 *   a known-class y4m clip, the test walks the real demo flow (start camera →
 *   capture photo → inference), and asserts the prediction matches the class.
 *   This exercises everything an upload test can't: getUserMedia, the video
 *   element, the canvas draw, toBlob, and inference — the actual code a visitor
 *   hits when they photograph their arm on the demonstrator screens.
 *
 * Dependencies:
 *   - playwright-core + the Chromium headless shell (already downloaded)
 *   - The dev server running on http://localhost:8080
 *   - tests/fixtures/camera/*.y4m (run tests/make_camera_fixtures.sh first)
 *
 * Usage:
 *   node tests/camera_classification.test.mjs
 *
 * Changes:
 *   2026-05-26: Initial — fake-camera capture path classification test.
 */

import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'http://localhost:8080/';
const FIXTURES = resolve('tests/fixtures/camera');

// Each fixture is a known-class camera feed; `expect` is a substring of the
// result text the UI shows after capture.
const CASES = [
  { y4m: 'real_tattoo.y4m', expect: 'Real Tattoo' },
  { y4m: 'sticker_tattoo.y4m', expect: 'Sticker' },
  { y4m: 'pen_drawn.y4m', expect: 'Pen/Marker' },
  { y4m: 'not_tattoo.y4m', expect: 'No Tattoo' },
];

const shellPath = execSync(
  "find ~/.cache/ms-playwright -name 'chrome-headless-shell' -type f | head -1",
  { shell: '/bin/bash' },
).toString().trim();

// Click a button by its accessible name (exact), scrolling it into view.
// Using role+exact avoids matching "Let's Continue" when we want "Continue".
async function clickButton(page, names, { exact = true, timeout = 6000 } = {}) {
  for (const n of names) {
    try {
      const btn = page.getByRole('button', { name: n, exact }).first();
      await btn.waitFor({ state: 'visible', timeout });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      return true;
    } catch { /* try next */ }
  }
  return false;
}

async function runCase(testCase) {
  const y4mPath = resolve(FIXTURES, testCase.y4m);
  if (!existsSync(y4mPath)) {
    return { ...testCase, ok: false, detail: `fixture missing: ${y4mPath}` };
  }

  const browser = await chromium.launch({
    executablePath: shellPath,
    args: [
      '--no-sandbox',
      '--use-fake-device-for-media-stream',     // replace real camera
      '--use-fake-ui-for-media-stream',         // auto-grant camera permission
      `--use-file-for-fake-video-capture=${y4mPath}`,  // feed our clip
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Walk the flow to the photo step.
    await clickButton(page, ['Jump Right In']);
    await page.waitForTimeout(700);
    await clickButton(page, ["Let's Continue"]);
    await page.waitForTimeout(700);

    // Name step — submit by pressing Enter so we don't accidentally match
    // "Let's Continue" higher up the (now long) accumulated page.
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill('CamTest');
    await nameInput.press('Enter');
    await page.waitForTimeout(1200);

    // Start the camera (fake device) and capture.
    if (!await clickButton(page, ['Take Photo'])) {
      return { ...testCase, ok: false, detail: 'could not find Take Photo' };
    }
    await page.waitForTimeout(2800);  // let the fake stream attach to <video>
    if (!await clickButton(page, ['Capture Photo'])) {
      return { ...testCase, ok: false, detail: 'could not find Capture Photo' };
    }

    // Wait for inference + the result label to appear.
    await page.waitForTimeout(6000);
    const body = await page.locator('body').innerText();

    const matched = body.includes(testCase.expect);
    // Pull whichever class label actually showed, for the report.
    const labels = ['Real Tattoo Detected', 'Sticker/Temporary Tattoo Detected',
                    'Pen/Marker Drawing Detected', 'No Tattoo Detected'];
    const shown = labels.find((l) => body.includes(l)) ?? '(none found)';
    return { ...testCase, ok: matched, detail: `shown: ${shown}` };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const c of CASES) {
  process.stdout.write(`Testing camera → ${c.y4m} ... `);
  const r = await runCase(c);
  console.log(r.ok ? `PASS (${r.detail})` : `FAIL (${r.detail})`);
  results.push(r);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nCamera classification: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
