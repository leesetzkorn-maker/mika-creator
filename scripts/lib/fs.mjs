import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = path.join(ROOT, 'src');
export const PRIVATE_DIR = path.join(ROOT, 'private');
export const ORIGINALS_DIR = path.join(PRIVATE_DIR, 'originals');
export const WORK_DIR = path.join(PRIVATE_DIR, 'work');
export const CACHE_DIR = path.join(PRIVATE_DIR, 'cache');
export const ASSETS_DIR = path.join(ROOT, 'assets');
export const IMAGES_DIR = path.join(ASSETS_DIR, 'images');
export const DATA_DIR = path.join(ASSETS_DIR, 'data');
export const LEGACY_GALLERY_DIR = path.join(ROOT, 'gallery');

export const CLASSIFICATION_FILE = path.join(CACHE_DIR, 'classifications.json');
export const REVIEW_STATE_FILE = path.join(PRIVATE_DIR, 'review-state.json');
export const APPROVALS_FILE = path.join(PRIVATE_DIR, 'approvals.json');
export const GALLERY_JSON = path.join(DATA_DIR, 'gallery.json');
export const HERO_JSON = path.join(DATA_DIR, 'hero-candidates.json');
export const SITE_JSON = path.join(DATA_DIR, 'site.json');

export function loadJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listFiles(dir, exts = ['.jpg', '.jpeg', '.png', '.webp']) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (exts.includes(path.extname(ent.name).toLowerCase())) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}