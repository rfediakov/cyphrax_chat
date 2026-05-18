/**
 * Generates PNG icons for the PWA manifest from the SVG source.
 * Run once: node scripts/generate-icons.mjs
 * Requires: npm install -D sharp (optional dep, not in devDeps by default)
 *
 * If sharp is not available, copy icon.svg to pwa-192.png and pwa-512.png
 * as a temporary placeholder (browsers will accept SVG in modern environments).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '../public/icons');

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('[generate-icons] sharp not installed — copying SVG as placeholder PNG.');
    console.warn('  Install with: npm install -D sharp');
    console.warn('  Then re-run: node scripts/generate-icons.mjs');

    // Fallback: copy SVG bytes. Not valid PNG but serves as placeholder for dev.
    const svgBuf = readFileSync(resolve(iconsDir, 'icon.svg'));
    if (!existsSync(resolve(iconsDir, 'pwa-192.png'))) {
      writeFileSync(resolve(iconsDir, 'pwa-192.png'), svgBuf);
    }
    if (!existsSync(resolve(iconsDir, 'pwa-512.png'))) {
      writeFileSync(resolve(iconsDir, 'pwa-512.png'), svgBuf);
    }
    return;
  }

  const src = resolve(iconsDir, 'icon.svg');
  await sharp(src).resize(192, 192).png().toFile(resolve(iconsDir, 'pwa-192.png'));
  await sharp(src).resize(512, 512).png().toFile(resolve(iconsDir, 'pwa-512.png'));
  console.log('[generate-icons] ✓ pwa-192.png and pwa-512.png generated');
}

generate().catch((e) => { console.error(e); process.exit(1); });
