/**
 * Mika Creator — image classification pipeline
 *
 * Real AI integration (multiple providers, env-driven). This module NEVER
 * fabricates a classification:
 *   - If a provider + credentials are configured, it really calls the API and
 *     stores the result per asset.
 *   - If NO provider is configured, every asset is recorded as
 *     exposure_class "unknown" with error NO_AI_PROVIDER_CONFIGURED. That is
 *     an intentional safe default: unknown == never auto-published as full.
 *   - private/approvals.json (owner-editable, gitignored) can override the
 *     resulting visibility for individual slugs after a human review.
 *
 * Supported providers (priority order):
 *   1. OpenAI-compatible vision endpoint (AI_VISION_API_URL / AI_VISION_API_KEY / AI_VISION_MODEL)
 *   2. Sightengine  (SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET)
 *   3. AWS Rekognition DetectModerationLabels (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ROOT, WORK_DIR, CACHE_DIR, ORIGINALS_DIR,
  loadJson, saveJson, ensureDir,
} from '../lib/fs.mjs';
import sharp from 'sharp';

const MANIFEST = path.join(WORK_DIR, 'manifest.json');
const CLASSIFICATIONS = path.join(CACHE_DIR, 'classifications.json');

// ---- tiny .env loader (no dependency) -------------------------------------
export function loadEnv() {
  const env = { ...process.env };
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

export function detectProvider(env) {
  if (env.AI_VISION_API_KEY || env.OPENAI_API_KEY) {
    return {
      id: 'openai-compatible',
      url: env.AI_VISION_API_URL || 'https://api.openai.com/v1/chat/completions',
      key: env.AI_VISION_API_KEY || env.OPENAI_API_KEY,
      model: env.AI_VISION_MODEL || 'gpt-4o-mini',
    };
  }
  if (env.SIGHTENGINE_API_USER && env.SIGHTENGINE_API_SECRET) {
    return { id: 'sightengine', user: env.SIGHTENGINE_API_USER, secret: env.SIGHTENGINE_API_SECRET };
  }
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_REGION) {
    return { id: 'aws-rekognition', keyId: env.AWS_ACCESS_KEY_ID, secret: env.AWS_SECRET_ACCESS_KEY, region: env.AWS_REGION };
  }
  return null;
}

// ---- classification rubric (OpenAI-compatible vision) ----------------------
const VISION_RUBRIC = `You are a content-classification engine for an 18+ creator portfolio.
Examine the photo and respond with ONLY valid JSON matching:
{
  "exposure_class": "safe" | "suggestive" | "sensitive" | "explicit_nudity",
  "confidence": 0.0,
  "contains_nudity": true,
  "explicit_area_boxes": [ { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } ],
  "face_visible": true,
  "quality_notes": "short"
}
Rules:
- explicit_nudity: visible genitals, penetration, or explicit sexual action.
- sensitive: visible breasts, buttocks exposed, lingerie-only, or anything an adult site would normally blur before public display.
- suggestive: clothed/implied, artistic, swimwear, tasteful.
- safe: fully clothed, no blur needed.
- explicit_area_boxes: use approximate percentage coordinates (0..1) for any area that must be blurred. Empty array if none.
Keep quality_notes under 12 words.`;

async function classifyOpenAICompatible(cfg, imageB64) {
  const body = {
    model: cfg.model,
    max_tokens: 400,
    temperature: 0,
    messages: [
      { role: 'system', content: VISION_RUBRIC },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Classify this image.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
        ],
      },
    ],
  };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`vision API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('vision response contained no JSON');
  const parsed = JSON.parse(json);
  return {
    provider: 'openai-compatible',
    model: cfg.model,
    exposure_class: parsed.exposure_class,
    confidence: Number(parsed.confidence) || 0,
    contains_nudity: !!parsed.contains_nudity,
    boxes: Array.isArray(parsed.explicit_area_boxes) ? parsed.explicit_area_boxes : [],
    face_visible: !!parsed.face_visible,
    note: (parsed.quality_notes || '').slice(0, 120),
  };
}

// ---- Sightengine -----------------------------------------------------------
async function classifySightengine(cfg, imageB64) {
  const params = new URLSearchParams();
  params.set('models', 'nudity-2.1');
  params.set('api_user', cfg.user);
  params.set('api_secret', cfg.secret);
  params.set('media', imageB64);
  const res = await fetch('https://api.sightengine.com/1.0/check.json', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sightengine ${res.status}: ${text.slice(0, 300)}`);
  }
  const d = await res.json();
  const n = (d && d.nudity) ? d.nudity : {};
  const activity = Number(n.sexual_activity?.prob ?? 0);
  const display = Number(n.sexual_display?.prob ?? 0);
  const aggressive = Number(n.erotica?.prob ?? 0);
  const safe = Number(n.safe?.prob ?? 0);
  let exposure_class, confidence = Math.max(activity, display, aggressive, safe, 0.5);
  if (activity > 0.5 || display > 0.45) exposure_class = 'explicit_nudity';
  else if (aggressive > 0.55 || safe < 0.4) exposure_class = 'sensitive';
  else if (safe < 0.75) exposure_class = 'suggestive';
  else exposure_class = 'safe';
  return {
    provider: 'sightengine',
    model: 'nudity-2.1',
    exposure_class,
    confidence: Number(confidence.toFixed(3)),
    contains_nudity: activity > 0.5 || display > 0.45,
    boxes: [],
    face_visible: null,
    note: `safe=${safe.toFixed(2)} suggestive=${aggressive.toFixed(2)} display=${display.toFixed(2)}`,
  };
}

// ---- AWS Rekognition (Native SigV4, no SDK) --------------------------------
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest();
}
function hex(b) { return Buffer.from(b).toString('hex'); }

async function classifyRekognition(cfg, imageBytes) {
  const service = 'rekognition', host = `rekognition.${cfg.region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hex(sha256(imageBytes));
  const canonicalRequest = [
    'POST', '/', '',
    `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}`,
    'content-type;host;x-amz-date', payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${cfg.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(sha256(canonicalRequest))].join('\n');
  const kDate = hmac('AWS4' + cfg.secret, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hex(hmac(kSigning, stringToSign));
  const auth = `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`;
  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'RekognitionService.DetectModerationLabels',
      'x-amz-date': amzDate,
      authorization: auth,
    },
    body: JSON.stringify({ Image: { Bytes: imageBytes }, MinConfidence: 55 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`rekognition ${res.status}: ${text.slice(0, 300)}`);
  }
  const d = await res.json();
  const labels = (d.ModerationLabels || []).map((l) => ({
    name: String(l.Name || '').toLowerCase(),
    parent: String(l.ParentName || '').toLowerCase(),
    confidence: Number(l.Confidence || 0),
  }));
  const top = labels.slice(0, 8).map((l) => `${l.name}:${Math.round(l.confidence)}`);
  let exposure_class = 'safe';
  const names = labels.map((l) => l.name).join('|');
  if (/(explicit|sexual activity|obscen|genital|graphic|anal|oral).*\d/.test(names) ||
      labels.some((l) => l.confidence > 70 && (l.name.includes('sexual') || l.name.includes('explicit')))) {
    exposure_class = 'explicit_nudity';
  } else if (labels.some((l) => l.confidence > 70 && l.name.includes('nudity'))) {
    exposure_class = 'sensitive';
  } else if (labels.some((l) => l.confidence > 70 && (l.name.includes('suggestive') || l.name.includes('partial nudity') || l.name.includes('revealing')))) {
    exposure_class = 'sensitive';
  }
  const conf = labels.length ? Math.round(Math.max(...labels.map((l) => l.confidence))) / 100 : 0;
  return {
    provider: 'aws-rekognition',
    model: 'DetectModerationLabels',
    exposure_class,
    confidence: Number(Math.min(1, Math.max(0, conf)).toFixed(3)),
    contains_nudity: exposure_class !== 'safe',
    boxes: labels.filter((l) => l.confidence > 80).map((l) => ({ name: l.name, confidence: l.confidence })),
    face_visible: null,
    note: top.join(', '),
  };
}

// ---- orchestration ---------------------------------------------------------
async function prepareInput(originalPath) {
  const buf = await sharp(originalPath)
    .rotate()
    .resize({ width: 900, height: 1200, fit: 'inside' })
    .flatten({ background: '#101014' })
    .jpeg({ quality: 84 })
    .toBuffer();
  return { bytes: buf, b64: buf.toString('base64') };
}

export function resolveVisibility(classification, approvals = {}) {
  // Owner human-approval overrides at the highest level.
  if (approvals[classification.slug] === 'public') {
    return { visibility: 'public', blurRequired: false, reason: 'owner-approved' };
  }
  if (approvals[classification.slug] === 'preview') {
    return { visibility: 'preview', blurRequired: true, reason: 'owner-hidden' };
  }
  if (classification.ok && classification.exposure_class === 'safe') {
    return { visibility: 'public', blurRequired: false, reason: 'ai-safe' };
  }
  if (classification.ok && classification.exposure_class === 'suggestive') {
    return { visibility: 'public', blurRequired: false, reason: 'ai-suggestive' };
  }
  if (classification.ok) {
    return { visibility: 'preview', blurRequired: true, reason: `ai-${classification.exposure_class}` };
  }
  // No reliable AI verdict -> conservative safe default.
  return {
    visibility: 'preview',
    blurRequired: true,
    reason: classification.error === 'NO_AI_PROVIDER_CONFIGURED'
      ? 'no-ai-configured'
      : 'ai-error-cautious',
  };
}

export async function classifyAll() {
  const manifest = loadJson(MANIFEST, { assets: [] });
  if (!manifest.assets.length) throw new Error('manifest missing — run collect first');
  const env = loadEnv();
  const provider = detectProvider(env);
  const cache = loadJson(CLASSIFICATIONS, { bySlug: {} });

  if (!provider) {
    console.warn('⚠ No AI provider configured. Set AI_VISION_API_KEY / SIGHTENGINE_API_USER+SECRET / AWS_ACCESS_KEY_ID in .env to enable real classification.');
  } else {
    console.log(`AI provider: ${provider.id}${provider.model ? ` (${provider.model})` : ''}`);
  }

  const approvals = loadJson(path.join(ROOT, 'private', 'approvals.json'), {}) || {};

  let done = 0, cached = 0, failed = 0;
  for (const asset of manifest.assets) {
    const cachedEntry = cache.bySlug?.[asset.slug];
    if (cachedEntry && (cachedEntry.ok || cachedEntry.provider !== 'none' || cachedEntry.error === 'NO_AI_PROVIDER_CONFIGURED')) {
      cached++;
      cachedEntry.slug = asset.slug;
      cachedEntry.policy = resolveVisibility(cachedEntry, approvals);
      continue;
    }
    const original = path.join(ORIGINALS_DIR, asset.collection, asset.file);
    if (!fs.existsSync(original)) {
      console.warn(`!! missing original ${asset.slug}`);
      continue;
    }
    const entry = { slug: asset.slug, collection: asset.collection, file: asset.file, provider: 'none', model: null, ok: false, exposure_class: 'unknown', confidence: 0, boxes: [], note: '' };
    try {
      if (provider) {
        const { bytes, b64 } = await prepareInput(original);
        if (provider.id === 'openai-compatible') entry.ok = true, Object.assign(entry, await classifyOpenAICompatible(provider, b64));
        else if (provider.id === 'sightengine') entry.ok = true, Object.assign(entry, await classifySightengine(provider, b64));
        else if (provider.id === 'aws-rekognition') entry.ok = true, Object.assign(entry, await classifyRekognition(provider, bytes));
        done++;
      } else {
        entry.error = 'NO_AI_PROVIDER_CONFIGURED';
        entry.note = 'No AI credentials configured. Safe preview policy applied.';
      }
    } catch (e) {
      failed++;
      entry.error = `${e.message.slice(0, 250)}`;
      entry.note = 'Classification failed — safe preview policy applied.';
    }
    entry.policy = resolveVisibility(entry, approvals);
    cache.bySlug[asset.slug] = entry;
  }

  ensureDir(CACHE_DIR);
  saveJson(CLASSIFICATIONS, { generatedAt: new Date().toISOString(), bySlug: cache.bySlug });

  const human = Object.values(cache.bySlug).map((c) => ({
    slug: c.slug, collection: c.collection, exposure_class: c.exposure_class,
    ok: c.ok, error: c.error || null, visibility: c.policy.visibility,
    reason: c.policy.reason, note: c.note || '',
  }));
  const byVis = {};
  for (const h of human) byVis[h.visibility] = (byVis[h.visibility] || 0) + 1;
  saveJson(path.join(WORK_DIR, 'classifications-summary.json'), {
    generatedAt: new Date().toISOString(),
    provider: provider ? { id: provider.id, model: provider.model || null } : null,
    totals: { classified: done, cached, failed, total: manifest.assets.length },
    byVisibility: byVis,
    items: human,
  });
  console.log(`Classified total=${manifest.assets.length} new=${done} cached=${cached} failed=${failed}`);
  console.log('Visibility split:', JSON.stringify(byVis));
  return cache;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await classifyAll();
}