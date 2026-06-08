#!/usr/bin/env node
/** Screenshot presenter grid controls + agent-drawn canvas. */
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/screenshots');
const JWT_SECRET = 'local-dev-secret-change-before-production';

function signJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ email: 'music@twosmiles.ca', name: 'Presenter', iat: now, exp: now + 3600 });
  const url = `http://localhost:5174/?token=${encodeURIComponent(token)}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Jump to co-op canvas
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('text=Co-op Canvas', { timeout: 10_000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: join(OUT, '04-agents-canvas.png'), fullPage: false });
  console.log('Saved 04-agents-canvas.png');

  // Highlight presenter grid controls in footer
  const gridSelect = page.locator('select').filter({ hasText: 'Wide' }).first();
  if (await gridSelect.count()) {
    await gridSelect.selectOption({ label: 'Square (24×24)' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, '05-grid-resize-presenter.png'), fullPage: false });
    console.log('Saved 05-grid-resize-presenter.png');
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
