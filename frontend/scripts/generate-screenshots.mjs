/**
 * Generates placeholder PWA screenshots for manifest validation.
 * Run: node scripts/generate-screenshots.mjs
 */

import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = resolve(__dirname, '../public/screenshots');

mkdirSync(screenshotsDir, { recursive: true });

// App brand colors
const BLUE = { r: 30, g: 64, b: 175 };   // #1e40af
const DARK = { r: 15, g: 23, b: 42 };    // #0f172a

async function solidPng(width, height, color) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  }).png();
}

async function generate() {
  // Mobile screenshot (portrait, form_factor unset / narrow)
  await (await solidPng(390, 844, DARK))
    .toFile(resolve(screenshotsDir, 'mobile.png'));
  console.log('[generate-screenshots] ✓ mobile.png (390×844)');

  // Desktop screenshot (landscape wide, form_factor "wide")
  await (await solidPng(1280, 720, BLUE))
    .toFile(resolve(screenshotsDir, 'desktop.png'));
  console.log('[generate-screenshots] ✓ desktop.png (1280×720)');
}

generate().catch((e) => { console.error(e); process.exit(1); });
