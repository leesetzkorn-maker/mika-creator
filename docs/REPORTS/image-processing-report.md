# Mika Creator — Image Processing Report (v2 rebuild)

**Date:** 2026-09-15 · **Site:** mikacreator.co.za · **Build:** `node scripts/build.mjs`

---

## 1. Executive summary

- **169 original photos** across **7 collections** were moved out of the public tree into `private/originals/` and re-published as **845 public-safe derivative files** (676 `.webp` + 169 `.og.jpg`, **138.3 MB**).
- Every public derivative is **EXIF-stripped** and every full-size derivative is **watermarked "© Mika Creator"** (verified programmatically, pixel-diff proven).
- **No original image is ever referenced by the public site.** `gallery.json` / `hero-candidates.json` contain only `assets/images/…` derivative URLs (verified 0 leaks).
- **AI classification did not run** — no AI provider credentials exist in the environment (checked: env, `.env`, git history). Per the agreed policy we report this honestly instead of fabricating results.
- Safe default applied: **all 169 assets are `visibility: preview`** → the browser only ever serves the **blurred preview** variant (`*.blur.webp`, unreadable). Full-res derivatives stay on disk but are never linked.

---

## 2. Input inventory

| Collection | Assets | Notes |
|---|---|---|
| Farm | 2 | |
| Girl on Girl | 8 | |
| Hotels | 40 | 4 files physically shared with legacy Indoor gallery |
| Indoor | 14 | |
| Mika River | 53 | |
| Mountain | 45 | 10 duplicate files sequestered to `private/originals/new-mountain/` |
| Waterpark | 7 | |
| **Total** | **169** | |

Legacy display order preserved from the original site (`gallery/data.js.legacy.json`) so old user votes map 1:1 to new photo slugs (see migration section).

---

## 3. Pipeline

```
collect.mjs   → private/work/manifest.json            (file → slug, collection, legacy index)
classify.mjs  → private/cache/classifications.json    (AI exposure per asset, or honest "unknown")
process.mjs   → private/work/assets-meta.json         (derivatives + quality metrics)
gallery.mjs   → assets/data/gallery.json + hero-candidates.json
pages.mjs     → 13 static HTML pages + collection pages
sitemap.mjs   → sitemap.xml + robots.txt
audit.mjs     → full production audit (all PASS)
```

### 3.1 Slugs and URL scheme

- Slug: `<collection>-<lowercased-filename-stem>` e.g. `farm-img-20260607-085012`.
- Public URL: `assets/images/<collection>/<slug>.<variant>`

| Variant | Size target | Used for | Watermarked |
|---|---|---|---|
| `thumb.webp` | ≤520×720 | gallery grid | ✅ |
| `full.webp` | ≤1700×2200 | lightbox (public) | ✅ |
| `hero.webp` | 1920×1080 cover | hero candidate | ✅ |
| `og.jpg` | 1200×630 | social share image | ✅ |
| `blur.webp` | ≤900×1200, σ≈36 blur | *preview / locked photos* | ❌ (no recoverable detail) |

### 3.2 Quality metrics computed per asset (stored in `assets-meta.json`)

Megapixels, aspect, orientation, brightness (mean), contrast (stdev), colorfulness, sharpness (Laplacian variance at 320px), composite `qualityScore` (brightness 22% / resolution 22% / sharpness 46% / colorfulness 10%). These drive hero ranking and collection covers.

---

## 4. Classification — honest status

- **Provider: none** · model: n/a · result: `NO_AI_PROVIDER_CONFIGURED`
- Per-asset classifier output (all 169 identical policy):
  ```json
  { "visibility": "preview", "blurRequired": true, "reason": "no-ai-configured" }
  ```
- The classifier supports **OpenAI-compatible vision**, **Sightengine**, and **AWS Rekognition (native SigV4)** — see `scripts/pipeline/classify.mjs` header for the exact env vars.
- Owner override path (kept so Mika can promote assets to public without another rebuild):
  `private/approvals.json` → `{ "<slug>": { "visibility": "public" } }` (gitignored). **No results were fabricated.**

**To activate classification:** set any one provider's credentials (documented in `classify.mjs`), run `npm run classify`, then `npm run process`, `npm run build`. Preview assets whose class is safe will flip to `public` and the site will auto-serve sharp variants.

---

## 5. Hero selection strategy

`hero-candidates.json` ranks every asset once (quality-weighted score with a brightness/contrast/resolution/landscape balance) and keeps the **top 8, max 2 per collection**. The frontend hero:
- picks candidates in ranked order, preloads each, and **rotates to the next candidate on any load error** (bounded attempts),
- renders the **blurred variant with an "18+ preview" trait** while `visibility != 'public'`,
- falls back to the brand gradient if all candidates fail.

Current top pick: `mika-river-img-20260702-151217` (score 102.6).

---

## 6. Verification (all automated, all PASS)

- 169 assets × 4 public variants: **0 missing files** (676 checked).
- Blur effectiveness: sampled preview variants are **≥3× lower Laplacian variance** than their own thumbs (many 10×+).
- EXIF/GPS: **0 samples contain exif/orientation**; density stripped everywhere.
- Watermark: **pixel-diff proof** — chip region mean RGB delta 39.8 / max 657 vs. an identical re-render, control region delta **0.00**.
- Deterministic rebuild: 13 pages + sitemap regenerate byte-identical (0 diffs).

---

## 7. Issues & recommendations

| Severity | Item | Recommendation |
|---|---|---|
| Info | AI classification pending (no credentials) | Run the classifier once credentials are available. |
| Info | Supabase migration shipped, not applied | Apply `supabase/migrations/001_votes_v2.sql` in the dashboard (see report 2). |
| Info | 4 legacy hotel photos physically map to the Indoor folder | Intentional — legacy votes attach to the photo, not the folder; covered by file-based migration mapping. |
| Low | `.og.jpg` and `hero.webp` double as marketing images | Reconsider after classification so sharp OG images only appear for approved sets. |