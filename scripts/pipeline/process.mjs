/**
 * Mika Creator — image processing pipeline
 *
 * Reads private originals, produces PUBLIC-SAFE derivatives only:
 *   thumb / full / hero / og  — clean metadata (EXIF stripped), watermarked
 *   blur                        — heavily blurred preview / sensitive version
 *
 * The ORIGINAL is never copied into the public output. All public URLs
 * (gallery.json) point ONLY at these derivatives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, WORK_DIR, ORIGINALS_DIR, IMAGES_DIR,
  loadJson, saveJson, ensureDir,
} from '../lib/fs.mjs';
import sharp from 'sharp';

const MANIFEST = path.join(WORK_DIR, 'manifest.json');
const CLASSIFICATIONS = path.join(ROOT, 'private', 'cache', 'classifications.json');

const WATERMARK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="46">
    <rect width="340" height="46" rx="10" fill="rgba(5,5,8,0.42)"/>
    <text x="18" y="30" font-size="18" font-family="Georgia, 'Times New Roman', serif"
      font-weight="600" fill="rgba(255,255,255,0.86)" letter-spacing="1">© Mika Creator</text>
  </svg>`
);

function laplacianVariance(grayBuffer) {
  const w = 320;
  const h = Math.round(grayBuffer.length / w) || 1;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v =
        4 * grayBuffer[i]
        - grayBuffer[i - 1] - grayBuffer[i + 1]
        - grayBuffer[i - w] - grayBuffer[i + w];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return Math.round((sumSq / n - mean * mean) * 100) / 100;
}

async function computeMetrics(src) {
  const probe = sharp(src).rotate().resize(320).gamma();
  const { data: gray } = await probe.clone().greyscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sharpness = laplacianVariance(Buffer.from(gray));

  const bright = await probe.clone().greyscale().stats();
  const mean = bright.channels[0].mean;
  const stdev = bright.channels[0].stdev;
  const meta = await sharp(src).rotate().metadata();

  const stats = await probe.clone().stats();
  const s = stats.channels.slice(0, 3).map((c) => c.mean);
  const colorfulness = Math.round(
    Math.abs(s[0] - s[1]) + Math.abs(s[2] - s[1]) + Math.abs(s[0] - s[2])
  );

  const mp = (meta.width * meta.height) / 1e6;
  // brightness prefers ~0.45–0.75 band of 0..255; higher = lighter
  const brightnessScore = Math.round(Math.max(0, 1 - Math.abs(mean - 150) / 150) * 100);
  const resolutionScore = Math.round(Math.min(100, (mp / 12) * 100));
  const sharpnessScore = Math.min(100, Math.round((sharpness / 2800) * 100));

  return {
    srcWidth: meta.width,
    srcHeight: meta.height,
    megapixels: Math.round(mp * 10) / 10,
    orientation: meta.orientation || 1,
    brightness: Math.round(mean),
    contrast: Math.round(stdev),
    colorfulness,
    sharpness,
    qualityScore: Math.round(
      (brightnessScore * 0.22 + resolutionScore * 0.22 + sharpnessScore * 0.46 + Math.min(100, colorfulness * 2.4) * 0.1)
    ),
  };
}

async function writeDerivative(builder, destPath, format, quality) {
  ensureDir(path.dirname(destPath));
  let image = builder.clone();
  if (format === 'webp') image = image.webp({ quality: quality || 80, effort: 4 });
  else image = image.jpeg({ quality: quality || 80, mozjpeg: true });
  await image.toFile(destPath);
}

export async function processAll() {
  const manifest = loadJson(MANIFEST, { assets: [] });
  const classifications = loadJson(CLASSIFICATIONS, null)?.bySlug || {};
  if (!manifest.assets.length) throw new Error('manifest missing — run collect first');

  let done = 0, skipped = 0;
  const out = [];

  for (const asset of manifest.assets) {
    const src = path.join(ORIGINALS_DIR, asset.collection, asset.file);
    if (!fs.existsSync(src)) {
      console.warn(`!! missing original ${asset.slug}`);
      continue;
    }
    const base = path.join(IMAGES_DIR, asset.collection, asset.slug);
    const meta = await computeMetrics(src);

    const thumb = sharp(src).rotate().resize({ width: 520, height: 720, fit: 'inside' });
    const full = sharp(src).rotate().resize({ width: 1700, height: 2200, fit: 'inside' });
    const og = sharp(src).rotate().resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' });
    const hero = sharp(src).rotate().resize({ width: 1920, height: 1080, fit: 'cover', position: 'attention' });
    const blur = sharp(src)
      .rotate()
      .resize({ width: 900, height: 1200, fit: 'inside' })
      .blur(Math.round(900 / 25))
      .modulate({ brightness: 0.82, saturation: 0.92 });

    // Public derivatives are always watermarked; the blurred preview is not (it
    // has no recoverable detail) but carries its own badge overlay on the frontend.
    await writeDerivative(thumb.composite([{ input: WATERMARK_SVG, gravity: 'southeast', blend: 'over' }]), `${base}.thumb.webp`, 'webp', 76);
    await writeDerivative(full.composite([{ input: WATERMARK_SVG, gravity: 'southeast', blend: 'over' }]), `${base}.full.webp`, 'webp', 80);
    await writeDerivative(og.composite([{ input: WATERMARK_SVG, gravity: 'southeast', blend: 'over' }]), `${base}.og.jpg`, 'jpeg', 80);
    await writeDerivative(hero.composite([{ input: WATERMARK_SVG, gravity: 'southeast', blend: 'over' }]), `${base}.hero.webp`, 'webp', 78);
    await writeDerivative(blur, `${base}.blur.webp`, 'webp', 74);

    const classification = classifications.bySlug?.[asset.slug] || {
      ok: false, exposure_class: 'unknown', provider: 'none',
      policy: { visibility: 'preview', blurRequired: true },
    };

    out.push({
      slug: asset.slug,
      collection: asset.collection,
      file: asset.file,
      legacyIndex: asset.legacyIndex,
      width: meta.srcWidth,
      height: meta.srcHeight,
      aspect: Math.round((meta.srcWidth / meta.srcHeight) * 1000) / 1000,
      orientation: meta.orientation,
      megapixels: meta.megapixels,
      quality: meta.qualityScore,
      brightness: meta.brightness,
      contrast: meta.contrast,
      colorfulness: meta.colorfulness,
      sharpness: meta.sharpness,
      ai: {
        provider: classification.provider,
        model: classification.model || null,
        ok: !!classification.ok,
        exposure_class: classification.exposure_class,
        confidence: classification.confidence || 0,
        boxes: classification.boxes || [],
        error: classification.error || null,
      },
      visibility: classification.policy?.visibility || 'preview',
      blurRequired: classification.policy?.blurRequired ?? true,
      visibilityReason: classification.policy?.reason || 'no-ai-configured',
      // PUBLIC-SAFE URLs only — no original path ever stored here.
      urls: {
        thumb: `assets/images/${asset.collection}/${asset.slug}.thumb.webp`,
        full: `assets/images/${asset.collection}/${asset.slug}.full.webp`,
        hero: `assets/images/${asset.collection}/${asset.slug}.hero.webp`,
        og: `assets/images/${asset.collection}/${asset.slug}.og.jpg`,
        blur: `assets/images/${asset.collection}/${asset.slug}.blur.webp`,
      },
    });
    done++;
  }

  saveJson(path.join(WORK_DIR, 'assets-meta.json'), {
    generatedAt: new Date().toISOString(),
    counts: { processed: done },
    assets: out,
  });
  console.log(`Processed ${done} assets into public derivatives (+${skipped} skipped).`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  processAll().catch((e) => { console.error(e); process.exit(1); });
}