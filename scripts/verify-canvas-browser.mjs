#!/usr/bin/env node
/**
 * Browser verification for the co-op canvas: navigate to step 7, paint, screenshot.
 * Usage: node scripts/verify-canvas-browser.mjs [presenter-jwt]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'docs/screenshots');
const JWT_SECRET = process.env.JWT_SECRET ?? 'local-dev-secret-change-before-production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'music@twosmiles.ca';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwt(payload) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function presenterToken() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ email: ADMIN_EMAIL, name: 'Presenter', iat: now, exp: now + 3600 });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const token = process.argv[2] ?? presenterToken();
  const url = `http://localhost:5174/?token=${encodeURIComponent(token)}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  console.log('Opening presenter view…');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForSelector('text=Connecting', { state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Advance to pixel-heart (step index 7)
  console.log('Advancing to co-op canvas (step 7)…');
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('text=Co-op Canvas', { timeout: 10_000 });

  const shot1 = join(OUT, '01-canvas-empty.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log('Saved', shot1);

  // Paint a few cells by clicking the grid (center area)
  const grid = page.locator('.grid.bg-slate-950').first();
  const box = await grid.boundingBox();
  if (!box) throw new Error('Grid not found');
  const cols = 32;
  const rows = 18;
  const cellW = box.width / cols;
  const cellH = box.height / rows;
  const clicks = [[8, 6], [9, 6], [10, 6], [9, 7], [9, 8]];
  for (const [cx, cy] of clicks) {
    await page.mouse.click(box.x + (cx + 0.5) * cellW, box.y + (cy + 0.5) * cellH);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);

  const shot2 = join(OUT, '02-canvas-painted.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log('Saved', shot2);

  // Open settings panel
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(400);
  const shot3 = join(OUT, '03-canvas-settings.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log('Saved', shot3);

  const coverage = await page.locator('text=/\\d+% covered/').first().textContent();
  const harmony = await page.locator('text=/\\d+% harmony/').first().textContent();
  await writeFile(join(OUT, 'browser-verify.json'), JSON.stringify({ coverage, harmony, url }, null, 2));

  await browser.close();
  console.log('Browser verification complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
