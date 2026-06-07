/**
 * Verify the camera preview and captured frame are oriented as expected.
 * Uses the sticker_tattoo_2.png fixture which has a distinctive red thumb-
 * nail in the top-right corner. After the camera path runs we save a
 * screenshot of the preview AND the captured frame so a human can visually
 * confirm orientation (and so subsequent runs can diff against a baseline).
 */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const shellPath = execSync(
  "find ~/.cache/ms-playwright -name 'chrome-headless-shell' -type f | head -1",
  { shell: '/bin/bash' },
).toString().trim();

const y4m = resolve('tests/fixtures/camera/sticker_tattoo.y4m');

const browser = await chromium.launch({
  executablePath: shellPath,
  args: [
    '--no-sandbox',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${y4m}`,
  ],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Walk to the photo step
await page.getByRole('button', { name: 'Jump Right In' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: "Let's Continue", exact: true }).first().click();
await page.waitForTimeout(500);
await page.locator('input[type="text"]').first().fill('OrientTest');
await page.locator('input[type="text"]').first().press('Enter');
await page.waitForTimeout(800);

// Start camera
await page.getByRole('button', { name: 'Take Photo' }).click();
await page.waitForTimeout(2500);  // stream attaches

// Inspect the <video> element: its CSS transform tells us if preview is mirrored
const videoInfo = await page.evaluate(() => {
  const v = document.querySelector('video');
  if (!v) return null;
  const s = window.getComputedStyle(v);
  return {
    transform: s.transform,
    width: v.videoWidth,
    height: v.videoHeight,
  };
});
console.log('VIDEO PREVIEW STATE:', JSON.stringify(videoInfo));

// Screenshot the video element area so we can see the preview orientation
const videoBox = await page.locator('video').boundingBox();
if (videoBox) {
  await page.screenshot({
    path: '/tmp/cam_preview.png',
    clip: { x: videoBox.x, y: videoBox.y, width: videoBox.width, height: videoBox.height },
  });
  console.log('preview saved to /tmp/cam_preview.png');
}

// Capture the photo. The page's blob URL ends up as <img src> on the result.
await page.getByRole('button', { name: 'Capture Photo' }).click();
await page.waitForTimeout(2500);

// Pull the captured image out of the page so we can save its bytes locally
const capturedBytes = await page.evaluate(async () => {
  // The captured photo is shown as an <img> on the result. Find one whose
  // src is a blob/data URL (not a static file).
  const imgs = Array.from(document.querySelectorAll('img'));
  const captured = imgs.find((i) => /^(blob:|data:)/.test(i.src) && i.complete && i.naturalWidth > 100);
  if (!captured) return null;
  const res = await fetch(captured.src);
  const buf = await res.arrayBuffer();
  return Array.from(new Uint8Array(buf));
});
if (capturedBytes) {
  writeFileSync('/tmp/cam_captured.jpg', Buffer.from(capturedBytes));
  console.log(`capture saved to /tmp/cam_captured.jpg (${capturedBytes.length} bytes)`);
} else {
  console.log('could not find captured image in page');
}

await browser.close();
