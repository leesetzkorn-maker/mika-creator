# Mika Creator — Production Audit Report (v2 rebuild)

**Date:** 2026-09-15 · **Site:** mikacreator.co.za · **Runner:** `npm run audit` → **ALL PASS ✓**

---

## 1. Audit checklist results

| # | Check | Result |
|---|---|---|---|
| 1 | No "booking" wording anywhere in HTML | ✅ (legacy `booking.html` removed; old booking CSS/JS removed) |
| 2 | No `localhost` / `127.0.0.1` / dev ports in shipped HTML | ✅ |
| 3 | No secrets: `sb_secret_*`, `service_role`, provider API keys | ✅ (anon key is the publishable `sb_publishable_…`) |
| 4 | Public JSON exposes no original/private paths (`/originals/`, `private/`) | ✅ |
| 5 | All public URLs match `^/assets/images/<coll>/<slug>.<variant>` | ✅ (0 bad) |
| 6 | All 676 gallery derivative files exist on disk | ✅ |
| 7 | All hero candidate URLs (url/fallback/thumb) exist | ✅ 8 candidates |
| 8 | Sample blur variants ≥3× softer than their thumbs | ✅ 8/8 |
| 9 | Sample full variants EXIF-stripped | ✅ 8/8 |
| 10 | No duplicate element IDs across 14 pages | ✅ |
| 11 | Local `<img src>`/`<link>`/`<script>` resolve; rating/RTA/canonical on every page | ✅ |
| 12 | Sitemap (12 URLs) all resolve locally; robots.txt sane | ✅ |
| 13 | Rebuild is byte-deterministic | ✅ 0 diffs |
| 14 | `.gitignore` protects `private/` + `.env`; `CNAME` intact | ✅ |
| 15 | All 15 frontend ES modules parse | ✅ |

**Audit command:** `npm run audit` (exit code 0). The site was additionally smoke-tested over a local static server: **14/14 HTML, JS, JSON, image URLs returned 200.**

---

## 2. Sensitive-image handling

- All 169 photos ship as **blurred previews only** (`visibility: preview`). There is no public URL for any sharp full-size photo today.
- Lightbox never shows a sharpenable image for preview assets — it re-uses the blur variant and shows a "Safe preview only" trait; tiles carry a lock badge; clicking opens a *Request access* dialog (WhatsApp / Telegram / Email) instead of a viewer.
- Full-res derivates exist on the build machine for future approved use but are not linked anywhere.

## 3. Booking removal

- `booking.html` and `assets/css/booking.css` deleted.
- All prior booking nav entries, CTAs and copy removed; grep across HTML shows zero occurrences.
- The legacy `gallery.html` flat page was replaced by a canonical redirect → `/gallery/`.

## 4. Security hardening (frontend)

- `Content-Security-Policy` meta on every page (default-src 'self'; strict connect-src incl. Supabase; frame-src 'none'; base-uri 'self').
- RTA compliance: `<meta name="rating" content="adult">` + `<meta name="RATING" content="RTA-5042-1996-1400-1577-RTA">` on all pages.
- Right-click / drag / copy protection on images; no devtools-games.
- GA4 (`G-V1V3P6YJE3`) retained, `anonymize_ip: true`.

## 5. Supabase (live)

**Blocked (no DB access from this environment):** schema v2 and the data migration are shipped but **not yet applied**. Pending application the live `votes` table remains v1 and comments tables do not exist.

- **Shipped:** `supabase/schema.sql` (v2 fresh install) and `supabase/migrations/001_votes_v2.sql`.
- **Migration fidelity:** all **169 legacy vote keys** (`"<Category>|<index>"`) map 1:1 to new slugs — **0 unmapped**, preserving historical like counts. Votes for removed content are dropped with the attached note. Voter privacy shift: anon loses `SELECT` on raw `votes`; counts surface only through SECURITY-DEFINER views/RPCs (no `voter_id` ever exposed).
- **Frontend behaviour until migration:** likes/comments degrade gracefully (offline-style messaging, "warming up"; visitor's comment text is preserved client-side and re-queued — never localStorage-*only* as the permanent store).
- **To finish:** in Supabase dashboard apply `001_votes_v2.sql`, then run the idempotent RPCs in `schema.sql`, then `npm run migration` only if the manifest ever changes.

## 6. Visitor A/B persistence (design, server pending)

| Feature | Reads | Writes | Degrades to |
|---|---|---|---|
| Likes | `count_likes` / counts via RPC | `toggle_vote` (voter_id from localStorage) | disabled state + toast |
| Comments | `list_comments` (approved only) | `insert_comment` → moderation queue | queued + "kept for when comments go live" |
| Reviews | `get_review_stats` | `insert_review` (1–10 ×3) | offline + "connecting reviews shortly" |

## 7. Outstanding actions for the operator

1. **Apply the Supabase migration** (section 5) — enables live likes/comments/reviews.
2. **Optionally configure an AI provider** (`npm run classify`) to promote assets from preview → public.
3. Point the GitHub Pages custom domain is already set (`CNAME` = `mikacreator.co.za`). Push `main` to deploy — repo is not yet a git repository on this machine.
4. Re-run `npm run build && npm run audit` after any pipeline change.