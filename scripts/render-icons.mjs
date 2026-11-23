// Renders all app icons / splash screens from public/brand/*.svg using Playwright Chromium.
// Usage: node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const icon = readFileSync(join(root, 'public/brand/icon.svg'), 'utf8');
const fg = readFileSync(join(root, 'public/brand/icon-fg.svg'), 'utf8');
const b = await chromium.launch();
const page = await b.newPage();

async function render(out, w, h, html) {
  mkdirSync(dirname(join(root, out)), { recursive: true });
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
  await page.screenshot({ path: join(root, out), omitBackground: true });
}
const svgAt = (svg, size, style = '') => svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block;${style}" `);
const square = (size) => svgAt(icon, size);
const round = (size) => `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden">${svgAt(icon.replace('rx="112"', 'rx="256"'), size)}</div>`;
const splash = (w, h) => `<div style="width:${w}px;height:${h}px;background:radial-gradient(60% 45% at 50% 35%,#FFE7B8,#F6F3EC 70%);display:grid;place-items:center">${svgAt(icon, Math.round(Math.min(w, h) * 0.38), 'filter:drop-shadow(0 10px 30px rgba(20,33,61,.18))')}</div>`;

// web
await render('public/icon-192.png', 192, 192, square(192));
await render('public/icon-512.png', 512, 512, square(512));
await render('public/brand/icon-1024.png', 1024, 1024, square(1024));
await render('public/og.png', 1200, 630, `<div style="width:1200px;height:630px;background:radial-gradient(60% 60% at 50% 30%,#FFE7B8,#F6F3EC 70%);display:flex;align-items:center;justify-content:center;gap:56px;font-family:'Frank Ruhl Libre',serif;direction:rtl">
  ${svgAt(icon, 300)}<div style="font-size:120px;font-weight:900;color:#14213D;line-height:1">מרוץ ויקי<div style="font-size:42px;font-weight:500;color:#48526A;margin-top:18px;font-family:Heebo,Arial,sans-serif">מרוץ בין ערכים בוויקיפדיה העברית</div></div></div>`);

// android launcher icons
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  await render(`${dir}/ic_launcher.png`, 48 * k, 48 * k, square(48 * k));
  await render(`${dir}/ic_launcher_round.png`, 48 * k, 48 * k, round(48 * k));
  await render(`${dir}/ic_launcher_foreground.png`, 108 * k, 108 * k, svgAt(fg, 108 * k));
  await render(`android/app/src/main/res/drawable-port-${d}/splash.png`, 320 * k, 480 * k, splash(320 * k, 480 * k));
  await render(`android/app/src/main/res/drawable-land-${d}/splash.png`, 480 * k, 320 * k, splash(480 * k, 320 * k));
}
await render('android/app/src/main/res/drawable/splash.png', 480, 480, splash(480, 480));

// desktop
await render('desktop/build/icon.png', 512, 512, square(512));
for (const s of [16, 32, 48, 64, 128, 256, 512]) await render(`desktop/build/icons/${s}x${s}.png`, s, s, square(s));

await b.close();
console.log('icons rendered');
