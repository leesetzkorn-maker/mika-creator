import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, PRIVATE_DIR, ORIGINALS_DIR, LEGACY_GALLERY_DIR, loadJson, saveJson, ensureDir, listFiles } from '../lib/fs.mjs';

const SITE = loadJson(path.join(ROOT, 'src', 'data', 'site.json'));
const legacyOrders = loadJson(path.join(ROOT, 'gallery', 'data.js.legacy.json'), null);

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stem(file) {
  return path.basename(file, path.extname(file)).toLowerCase();
}

export function buildManifest() {
  const manifest = { generatedAt: new Date().toISOString(), assets: [] };
  const seen = new Set();

  for (const col of SITE.collections) {
    const legacyDir = path.join(LEGACY_GALLERY_DIR, col.slug.replace(/-/g, ' '));
    const legacyDirAlt = path.join(LEGACY_GALLERY_DIR, col.slug);
    const legacy = [legacyDir, legacyDirAlt].find((d) => fs.existsSync(d) && listFiles(d).length > 0);
    const privateDir = path.join(ORIGINALS_DIR, col.slug);
    ensureDir(privateDir);

    // Originals live in private/originals. If only the legacy public copy is
    // present (first run), copy it in first.
    let privateFiles = listFiles(privateDir);
    if (!privateFiles.length && legacy) {
      for (const f of listFiles(legacy)) {
        const dest = path.join(privateDir, path.basename(f));
        if (!fs.existsSync(dest)) fs.copyFileSync(f, dest);
      }
      privateFiles = listFiles(privateDir);
    }
    const files = privateFiles;
    ensureDir(privateDir);

    // Display order comes from the legacy data.js list when present, so that
    // historical votes ("Category|index") keep pointing at the same photo after
    // migration. Files never published before are not pulled in automatically.
    const orderKey = col.title;
    const ordered = [];
    if (legacyOrders && Array.isArray(legacyOrders[orderKey])) {
      for (const name of legacyOrders[orderKey]) {
        const hit = files.find((f) => stem(f) === stem(name));
        if (hit && !seen.has(hit)) { ordered.push(hit); seen.add(hit); }
      }
    } else {
      for (const f of files) {
        if (!seen.has(f)) { ordered.push(f); seen.add(f); }
      }
    }

    for (const f of ordered) {
      const base = stem(f);
      const slug = `${slugify(col.slug)}-${slugify(base)}`;
      manifest.assets.push({
        slug,
        collection: col.slug,
        file: path.basename(f),
        legacyIndex: manifest.assets.length
      });
    }
  }
  return manifest;
}

export function main() {
  const manifest = buildManifest();
  const counts = {};
  for (const a of manifest.assets) counts[a.collection] = (counts[a.collection] || 0) + 1;
  console.log('Manifest built:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`Total assets: ${manifest.assets.length}`);

  const W = path.join(PRIVATE_DIR, 'work');
  ensureDir(W);
  saveJson(path.join(W, 'manifest.json'), manifest);

  // Remove legacy public originals ONLY when explicitly requested.
  if (process.argv.includes('--remove-legacy')) {
    let removed = 0;
    for (const col of SITE.collections) {
      const dir = path.join(LEGACY_GALLERY_DIR, col.slug.replace(/-/g, ' '));
      const dirAlt = path.join(LEGACY_GALLERY_DIR, col.slug);
      for (const d of [dir, dirAlt]) {
        if (!fs.existsSync(d)) continue;
        for (const f of listFiles(d)) {
          if (/\.(jpe?g|png|webp)$/i.test(f)) { fs.rmSync(f); removed++; }
        }
      }
    }
    console.log(`Removed ${removed} legacy public originals from /gallery (originals preserved in private/originals).`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();