/**
 * Mika Creator — gallery metadata generator
 *
 * Consumes pipeline output (private/work/assets-meta.json + classifications)
 * and authorted src/data/site.json, and emits PUBLIC-SAFE data:
 *
 *   assets/data/gallery.json       — assets + collections, ordered by legacy order
 *   assets/data/hero-candidates.json — ranked hero images (+ blur fallbacks)
 *   assets/data/site.json          — public copy of site config (anon key only)
 *
 * The generator NEVER writes original paths or private working paths into the
 * public payload. It only reuses the public derivative URLs from assets-meta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, SRC, WORK_DIR, DATA_DIR,
  loadJson, saveJson,
  GALLERY_JSON, HERO_JSON, SITE_JSON,
} from '../lib/fs.mjs';

const ASSETS_META = path.join(WORK_DIR, 'assets-meta.json');
const SITE_SRC = path.join(SRC, 'data', 'site.json');

function brightnessScore(mean) {
  return Math.max(0, 100 - Math.min(100, Math.abs(mean - 148) * 1.2));
}

function candidateScore(a, preferLandscape) {
  const res = Math.min(100, (a.megapixels / 12) * 100);
  const con = Math.min(100, a.contrast * 1.4);
  let score = a.quality * 0.55 + brightnessScore(a.brightness) * 0.15 + res * 0.15 + con * 0.15;
  if (preferLandscape) score += a.aspect > 1.0 ? 6 : a.aspect < 0.75 ? -4 : 0;
  return Math.round(score * 10) / 10;
}

export function generateGalleryData() {
  const site = loadJson(SITE_SRC, null);
  if (!site) throw new Error('site.json missing');
  const meta = loadJson(ASSETS_META, { assets: [] });
  const assets = meta.assets || [];
  console.log(`Reading ${assets.length} processed assets…`);

const bySlug = new Map(assets.map((a) => [a.slug, a]));
const collTitles = new Map(site.collections.map((c) => [c.slug, c.title]));
const activeCollections = site.collections.map((c) => c.slug);
// Public URLs are root-absolute so any page depth can use them directly.
const pub = (u) => (u && u.startsWith('assets/') ? '/' + u : u);

  const assetsOrdered = assets
    .filter((a) => activeCollections.includes(a.collection))
    .sort((x, y) => (x.legacyIndex ?? 1e9) - (y.legacyIndex ?? 1e9));

  const perCollection = new Map();
  for (const a of assetsOrdered) {
    if (!perCollection.has(a.collection)) perCollection.set(a.collection, []);
    perCollection.get(a.collection).push(a);
  }

  // ---- hero candidates -------------------------------------------------
  const preferLandscape = !!site.hero?.preferLandscape;
  const maxCandidates = Math.max(1, site.hero?.maxCandidates || 8);
  const pinnedHero = site.hero?.heroImage || '';
  const scored = assetsOrdered
    .map((a) => ({ a, score: candidateScore(a, preferLandscape) }))
    .sort((x, y) => y.score - x.score);

  const makePick = (a, score) => ({
    slug: a.slug,
    collection: a.collection,
    collectionTitle: collTitles.get(a.collection),
    score,
    visibility: a.visibility,
    width: a.width,
    height: a.height,
    aspect: a.aspect,
    quality: a.quality,
    brightness: a.brightness,
    alt: `${collTitles.get(a.collection)} — Mika Creator preview`,
    url: pub(a.visibility === 'public' ? a.urls.hero : a.urls.blur),
    hero: pub(a.urls.hero),
    mobile: pub(a.urls.mobile),
    fallback: pub(a.urls.blur),
    thumb: pub(a.urls.thumb),
    sharpUrl: pub(a.urls.hero),
  });

  const perCollCount = new Map();
  const picks = [];
  for (const { a, score } of scored) {
    if (picks.length >= maxCandidates) break;
    const used = perCollCount.get(a.collection) || 0;
    if (used >= 2) continue;
    perCollCount.set(a.collection, used + 1);
    picks.push(makePick(a, score));
  }

  // Pinned hero override: if site.hero.heroImage names a real asset, it is the
  // main homepage hero (first candidate). It must already be a processed asset.
  if (pinnedHero) {
    const pinnedAsset = assetsOrdered.find((x) => x.slug === pinnedHero);
    if (!pinnedAsset) {
      throw new Error(`site.hero.heroImage references unknown asset: ${pinnedHero}`);
    }
    const pick = picks.find((p) => p.slug === pinnedHero);
    if (pick) pick.score = 999.9;
    else picks.unshift(makePick(pinnedAsset, 999.9));
    picks.sort((x, y) => y.score - x.score);
    if (picks.length > maxCandidates) picks.length = maxCandidates;
  }

  saveJson(HERO_JSON, {
    version: 2,
    generatedAt: new Date().toISOString(),
    strategy: 'quality-weighted-ranked',
    preferLandscape,
    maxCandidates,
    candidates: picks,
  });

  // ---- teaser selection (public showcase: a curated few per collection) ---- 
  const teaserMax = Math.max(1, Math.min(4, site.hero?.teaserMax || 3));
  const teaserByColl = new Map();
  for (const { a } of scored) {
    const list = teaserByColl.get(a.collection) || [];
    if (list.length >= teaserMax) continue;
    list.push({ slug: a.slug, thumb: pub(a.urls.thumb), hero: pub(a.urls.hero) });
    teaserByColl.set(a.collection, list);
  }

  // ---- collections (with cover) ----------------------------------------
  const collections = site.collections.map((c) => {
    const items = perCollection.get(c.slug) || [];
    const teasers = teaserByColl.get(c.slug) || [];
    const cover = teasers[0]?.thumb
      ? { slug: teasers[0].slug, url: teasers[0].thumb }
      : (picks.find((p) => p.collection === c.slug) ||
         items.map((a) => ({ slug: a.slug, quality: a.quality, url: pub(a.urls.thumb), alt: `${c.title} — Mika` }))
           .sort((x, y) => y.quality - x.quality)[0]);
    return {
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      offer: c.offer,
      count: items.length,
      cover: pub(cover?.url) || null,
      coverSlug: cover?.slug || null,
      teasers: teasers.map((t) => t.slug),
    };
  });

  // ---- assets (public-safe surface) --------------------------------------
  const galleryAssets = assetsOrdered.map((a) => ({
    slug: a.slug,
    collection: a.collection,
    collectionTitle: collTitles.get(a.collection),
    width: a.width,
    height: a.height,
    aspect: a.aspect,
    megapixels: a.megapixels,
    quality: a.quality,
    brightness: a.brightness,
    contrast: a.contrast,
    colorfulness: a.colorfulness,
    visibility: a.visibility,
    blurRequired: a.blurRequired,
    urls: {
      thumb: pub(a.urls.thumb),
      full: pub(a.urls.full),
      hero: pub(a.urls.hero),
      mobile: pub(a.urls.mobile),
      blur: pub(a.urls.blur),
      sharp: pub(a.urls.thumb),
    },
  }));

  saveJson(GALLERY_JSON, {
    version: 2,
    generatedAt: new Date().toISOString(),
    owner: {
      ...site.personas.find((p) => p.active) || {},
      personas: site.personas,
    },
    collections,
    assets: galleryAssets,
  });

  // ---- public site.json (strip nothing sensitive — anon key is publishable; keep working paths OUT) ------
  saveJson(SITE_JSON, site);

  const previewCount = assetsOrdered.filter((a) => a.visibility === 'preview').length;
  console.log(`gallery.json: ${assetsOrdered.length} assets, ${collections.length} collections`);
  console.log(`  visibility → preview ${previewCount} | public ${assetsOrdered.length - previewCount}`);
  console.log(`hero-candidates.json: ${picks.length} (max ${maxCandidates})`);
  console.log('  picks:', picks.map((p) => `${p.collection}:${p.slug}(${p.score})`).join(', '));
  return { assets: assetsOrdered, picks, collections };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    generateGalleryData();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}