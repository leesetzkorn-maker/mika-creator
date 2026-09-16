/**
 * Mika Creator — static page renderer
 * "Authored" content lives here; site.json is the single source for facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, SRC, loadJson, ensureDir, GALLERY_JSON, SITE_JSON, HERO_JSON, DATA_DIR,
} from './lib/fs.mjs';

const site = loadJson(SITE_JSON, {});
const gallery = loadJson(GALLERY_JSON, { collections: [], assets: [] });
const heroes = loadJson(HERO_JSON, { candidates: [] });
const domain = (site.brand?.domain || 'https://www.mikacreator.co.za').replace(/\/$/, '');
const rta = site.seo?.rtaToken || 'RTA-5042-1996-1400-1577-RTA';
const c = site.contact || {};
const supabase = site.supabase || {};

const APP_CSS = '/assets/css/app.css';

const CONFIG = () =>
  `<script>window.MIKA_CONFIG=${JSON.stringify({ ...site, assets: { base: '/assets/data/' } })}</script>`;

const CSP = () =>
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ${supabase.url || ''} https://www.google-analytics.com https://www.googletagmanager.com; base-uri 'self'; form-action 'self' https://wa.me https://t.me; frame-src 'none'">`;

const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230a0a0e'/%3E%3Ctext x='32' y='44' font-family='Georgia,serif' font-size='40' font-weight='700' text-anchor='middle' fill='%23d8b98a'%3EM%3C/text%3E%3C/svg%3E`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,500&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">`;

function ogImage() {
  if (heroes.candidates?.[0]) {
    const h = heroes.candidates[0];
    return `${domain}/assets/images/${h.collection}/${h.slug}.og.jpg`;
  }
  return `${domain}/${site.seo?.ogImage || 'assets/images/brand/og-cover.jpg'}`;
}

function head({ title, description, path: p = '/', robots = 'index,follow', bodyAttrs = '' } = {}) {
  const canonical = domain + (p === '/' ? '/' : p);
  const og = ogImage();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta name="rating" content="adult">
<meta name="RATING" content="${rta}">
<meta name="theme-color" content="#0a0a0e">
<meta name="referrer" content="strict-origin-when-cross-origin">
${CSP()}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${site.brand?.name} ${site.brand?.suffix}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${og}">
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
${FONTS}
<link rel="stylesheet" href="${APP_CSS}">
${CONFIG()}
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: `${site.brand?.name} ${site.brand?.suffix}`,
  url: domain,
  description: site.seo?.description,
})}</script>
</head>
<body${bodyAttrs ? ' ' + bodyAttrs : ''}>
${NAV()}
<main id="main">`;
}

const NAV = () => {
  const navActive = (p) => { if (!p) return ''; };
  return `<header class="site-header" id="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="Mika Creator — home">
      <span class="brand-name">MIKA</span><span class="brand-suffix">Creator</span>
    </a>
    <nav class="site-nav" aria-label="Primary">
      <a href="/gallery/" data-nav="gallery">Gallery</a>
      <a href="/#collections" data-nav="collections">Collections</a>
      <a href="/connect/" data-nav="connect">Connect</a>
    </nav>
    <button class="nav-toggle" aria-expanded="false" aria-label="Menu"><span></span></button>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu">
  <a href="/">Home</a>
  <a href="/gallery/">Gallery</a>
  <a href="/#collections">Collections</a>
  <a href="/connect/">Connect</a>
  <div class="social-row">
    <a class="social-btn" href="https://${c.whatsappDomain}/${c.whatsappNumber}" target="_blank" rel="noopener" aria-label="WhatsApp">${icons.whatsapp}</a>
    <a class="social-btn" href="${c.telegram}" target="_blank" rel="noopener" aria-label="Telegram">${icons.telegram}</a>
    <a class="social-btn" href="mailto:${c.email}" aria-label="Email">${icons.mail}</a>
  </div>
</div>`;
};

const icons = {
  whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M9.2 8.2c.2.9.4 2 .9 3 .5 1.1 1.4 2 2.5 2.5 1 .5 2.1.7 3 .9M9.2 8.2l1-.4c.3-.1.6.1.7.4l.7 1.4"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 4 3 11l5 2 1.5 5 2.5-3 4.2 2.6L21 4Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.6-9.3-9C1 8.6 2.6 5.5 5.7 5.3c1.9-.1 3.2.9 4.1 2.2L12 9.6l2.2-2.1c.9-1.3 2.2-2.3 4.1-2.2 3.1.2 4.7 3.3 3 6.7-2.3 4.4-9.3 9-9.3 9Z"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13.5" r="3.4"/></svg>`,
};

const FOOTER = () => `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="/"><span class="brand-name">MIKA</span><span class="brand-suffix">Creator</span></a>
        <p class="footer-desc">Premium 18+ editorial content, captured naturally and honestly. Every photo is original and owned by Mika.</p>
        <div class="social-row" style="justify-content:flex-start;margin-top:1.2rem">
          <a class="social-btn" href="https://${c.whatsappDomain}/${c.whatsappNumber}" target="_blank" rel="noopener" aria-label="WhatsApp">${icons.whatsapp}</a>
          <a class="social-btn" href="${c.telegram}" target="_blank" rel="noopener" aria-label="Telegram">${icons.telegram}</a>
          <a class="social-btn" href="mailto:${c.email}" aria-label="Email">${icons.mail}</a>
        </div>
      </div>
      <div class="footer-col">
        <h4>Explore</h4>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/gallery/">Gallery</a></li>
          <li><a href="/connect/">Connect</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <ul>
          <li><a href="/terms/">Terms</a></li>
          <li><a href="/privacy-18.html">Privacy (18+)</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span id="year"></span> ${site.brand?.name} ${site.brand?.suffix}. All rights reserved.</span>
      <span class="adult-badge"><span class="age">18+</span> Adults only · ${rta}</span>
      <span>${site.brand?.tagline || ''}</span>
    </div>
  </div>
</footer>`;

const SHELL = ({ title, description, path, bodyAttrs = '', robots, content }) =>
  `${head({ title, description, path, bodyAttrs, robots })}
${content}
</main>
${FOOTER()}
${LIGHTBOX()}
${AGE_GATE()}
<div class="toast" id="toast" role="status"></div>
<script type="module" src="/assets/js/app.mjs"></script>
</body>
</html>`;

const LIGHTBOX = () => `<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
  <button class="lightbox-close" id="lightbox-close" aria-label="Close">✕</button>
  <button class="lightbox-prev" id="lightbox-prev" aria-label="Previous">‹</button>
  <button class="lightbox-next" id="lightbox-next" aria-label="Next">›</button>
  <div class="lightbox-stage"><img id="lightbox-img" alt="" draggable="false"></div>
  <div class="lightbox-preview-note" id="lightbox-preview-note" hidden>${icons.lock} Safe preview only</div>
  <div class="lightbox-caption" id="lightbox-caption"></div>
</div>`;

const AGE_GATE = () => `<div class="age-gate" id="age-gate" role="dialog" aria-modal="true" aria-label="Age verification">
  <div class="age-gate-card panel panel-pad">
    <a class="brand" href="/" tabindex="-1"><span class="brand-name">MIKA</span><span class="brand-suffix">Creator</span></a>
    <div class="age-num">18<span class="serif-i" style="font-size:.5em">&nbsp;+</span></div>
    <h1>Adults only</h1>
    <p>This website contains adult 18+ content. Enter only if you are of legal age in your country.</p>
    <div class="age-gate-actions">
      <button class="btn btn-primary btn-lg btn-age-yes">I am 18+ — Enter</button>
      <button class="btn btn-ghost btn-lg btn-age-no">Leave</button>
    </div>
    <p class="age-gate-note">By entering you agree to the <a href="/terms/">Terms</a> and <a href="/privacy-18.html">Privacy policy</a>.</p>
  </div>
</div>`;

const HERO = () => `<section class="hero" id="hero" aria-label="Introduction">
  <div class="hero-bg" id="hero-bg" role="img" aria-label="Featured photo preview"></div>
  <div class="hero-overlay"></div>
  <div class="hero-inner container">
    <p class="eyebrow hero-eyebrow">18+ premium creator content</p>
    <h1 class="hero-title">MIKA <span class="serif-i">creator</span></h1>
    <p class="hero-tagline">${site.brand?.tagline || ''} — original editorial galleries, captured in natural light. All content exclusive, all content real.</p>
    <div class="hero-actions">
      <a class="btn btn-primary btn-lg" href="/gallery/">Enter gallery</a>
      <a class="btn btn-ghost btn-lg" href="/#collections">View collections</a>
    </div>
  </div>
  <div class="hero-scroll">Scroll</div>
</section>`;

function collectionCard(col) {
  return `<article class="card">
    <div class="card-media">
      <img src="${col.cover}" alt="${col.title} — Mika Creator preview" loading="lazy" draggable="false">
      <div class="card-shade"></div>
      <span class="card-count">${col.count} photos</span>
    </div>
    <div class="card-body">
      <h3 class="card-title">${col.title}</h3>
      <p class="card-sub">${col.subtitle || col.offer || ''}</p>
    </div>
    <a class="card-link" href="/gallery/${col.slug}/" aria-label="Open collection: ${col.title}"></a>
  </article>`;
}

function pageHero({ eyebrow, title, lead }) {
  return `<section class="page-hero">
    <div class="container center">
      <p class="eyebrow">${eyebrow}</p>
      <div class="gold-rule" style="display:block;margin:1.4rem auto 0"></div>
      <h1 class="display">${title}</h1>
      <p class="lead">${lead}</p>
    </div>
  </section>`;
}

function TEASER_CTA() {
  return `<section class="section section-tight teaser-cta">
  <div class="container">
    <div class="cta-strip">
      <p class="eyebrow">full access</p>
      <h2 class="display">Want to see the real content?</h2>
      <p class="lead">Get in touch with Mika.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="/connect/">Get in touch with Mika</a>
      </div>
      <p class="cta-note">Private galleries and full content available on request.</p>
    </div>
  </div>
</section>`;
}

function CTA_REDVELVET_ESA() {
  const btns = [];
  if (c.redvelvet) btns.push(`<a class="btn btn-primary btn-lg cta-brand" data-track="redvelvet" href="${c.redvelvet}" target="_blank" rel="noopener">REDVELVET</a>`);
  if (c.esa) btns.push(`<a class="btn btn-primary btn-lg cta-brand" data-track="esa" href="${c.esa}" target="_blank" rel="noopener">ESA</a>`);
  btns.push(`<a class="btn btn-ghost btn-lg" href="/connect/">Contact Mika</a>`);
  return `<div class="hero-actions">${btns.join('')}</div>`;
}

function glimpseGrid() {
  const bySlug = new Map((gallery.assets || []).map((a) => [a.slug, a]));
  const items = [];
  for (const col of gallery.collections || []) {
    const t = (col.teasers || []).slice(0, 1)[0];
    const asset = bySlug.get(t);
    if (asset) {
      items.push({
        slug: asset.slug,
        url: asset.urls?.thumb || asset.urls?.blur,
        col: col.slug,
        title: col.title,
      });
    }
  }
  if (!items.length) return '';
  return `<div class="glimpse-grid">
    ${items.map((it) => `<a class="glimpse-item" href="/gallery/${it.col}/" aria-label="A glimpse of ${esc(it.title)} — open collection">
      <img src="${it.url}" alt="${esc(it.title)} glimpse — Mika Creator" loading="lazy" draggable="false">
      <span class="glimpse-cap">${esc(it.title)}</span>
    </a>`).join('')}
  </div>`;
}

const esc = (s) => String(s || '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

/* ---------------- services ---------------- */

const svcPackages = (site.services?.packages || []);
const videoCall = site.services?.videoCall || {};

function CONTENT_PACKAGES() {
  if (!svcPackages.length) return '';
  return `<section class="section section-tight" id="packages">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">content packages</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">Content packages</h2>
      <p class="lead">Flexible content packages — captured naturally, delivered privately. Choose a package, then request your build below.</p>
    </div>
    <div class="pkg-grid">
      ${svcPackages.map((p) => `
      <article class="pkg-card${p.featured ? ' is-featured' : ''}">
        ${p.featured ? '<span class="pkg-badge">Most chosen</span>' : ''}
        <h3 class="pkg-name">${esc(p.name)}</h3>
        <div class="pkg-price">${esc(p.price)}</div>
        <ul class="pkg-spec">
          <li><strong>${p.videos}</strong> video${p.videos === 1 ? '' : 's'}</li>
          <li><strong>${p.photos}</strong> photo${p.photos === 1 ? '' : 's'}</li>
          <li class="pkg-note">${esc(p.note || '')}</li>
        </ul>
        <a class="btn btn-primary pkg-cta" href="/?pkg=${esc(p.id)}#custom-build">Request this package</a>
      </article>`).join('')}
    </div>
    <p class="pkg-foot-note muted">Prices in South African Rand (ZAR). Packages are produced as original, individually planned content — contact Mika to confirm availability before ordering.</p>
  </div>
</section>`;
}

function VIDEO_CALL() {
  const price = videoCall.price || 'R450';
  const dur = videoCall.duration || '10–15 minutes';
  return `<section class="section section-tight" id="video-call">
  <div class="container">
    <div class="vc-card">
      <div class="vc-icon">${icons.camera}</div>
      <p class="eyebrow">video call</p>
      <h2 class="section-title">Spend time with ${'Mika'}</h2>
      <p class="vc-meta"><span class="vc-price">${esc(price)}</span><span class="vc-dur">${esc(dur)}</span></p>
      <p class="vc-tag muted">${esc(videoCall.tag || 'A personal, 1-on-1 chat — the closest way to connect.')}</p>
      <div class="hero-actions vc-actions">
        <a class="btn btn-primary btn-lg" href="/?request=video-call#custom-build">Book / request video call</a>
        <a class="btn btn-ghost btn-lg" href="/connect/" >Prefer WhatsApp?</a>
      </div>
      <p class="cta-note">Scheduled at a time that works for you. Availability confirmed directly with Mika.</p>
    </div>
  </div>
</section>`;
}

function CUSTOM_BUILD() {
  const colourOptions = ['White', 'Black', 'Gold', 'Red', 'Pink', 'Custom'];
  const placementOptions = ['Hand', 'Arm', 'Foot', 'Leg', 'Other / describe'];
  return `<section class="section section-tight" id="custom-build">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">custom build</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">Build your own custom content</h2>
      <p class="lead">Tell Mika exactly how you want your custom shoot styled and personalised. Every custom request is produced as a quality, individually planned shoot.</p>
    </div>

    <div class="cb-layout">
      <div class="panel panel-pad cb-form-panel">
        <form id="cb-form" novalidate>
          <input type="hidden" name="source" value="homepage">

          <div class="cb-steps" role="tablist" aria-label="Custom build progress">
            <span class="cb-dot is-active" data-step="1"></span><span class="cb-dot" data-step="2"></span><span class="cb-dot" data-step="3"></span><span class="cb-dot" data-step="4"></span><span class="cb-dot" data-step="5"></span><span class="cb-dot" data-step="6"></span>
          </div>

          <div class="cb-step is-active" data-step="1">
            <h3 class="cb-title">1 · Your details</h3>
            <div class="field"><label for="cb-name">Your name / display name</label><input id="cb-name" name="name" maxlength="80" autocomplete="name" required></div>
            <div class="field"><label for="cb-package">Content package</label>
              <select id="cb-package" name="package">
                <option value="">Select a package…</option>
                ${svcPackages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.price)} (${p.videos} videos · ${p.photos} photos)</option>`).join('')}
                <option value="video-call">Video Call — ${esc(videoCall.price || 'R450')} (${esc(videoCall.duration || '10–15 minutes')})</option>
                <option value="custom">Custom package / discuss with Mika</option>
              </select>
            </div>
            <input type="text" name="honeypot" id="cb-honeypot" tabindex="-1" autocomplete="off" class="cb-hp" aria-hidden="true">
          </div>

          <div class="cb-step" data-step="2">
            <h3 class="cb-title">2 · Content type</h3>
            <div class="field"><label for="cb-type">Describe your request</label><textarea id="cb-type" name="type" rows="4" maxlength="2000" placeholder="Describe the type of content you are requesting." required></textarea></div>
            <p class="cb-help">Be as clear and specific as you like. No template needed — this is your space to describe it in your own words.</p>
          </div>

          <div class="cb-step" data-step="3">
            <h3 class="cb-title">3 · Custom personalisation</h3>
            <div class="field"><label for="cb-customword">Custom name / word</label><input id="cb-customword" name="customword" maxlength="40" placeholder="e.g. a name, word or phrase"></div>
            <div class="field"><label for="cb-colour">Text colour</label>
              <select id="cb-colour" name="colour">
                ${colourOptions.map((o) => `<option value="${esc(o.toLowerCase())}">${o}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label for="cb-placement">Text placement</label>
              <select id="cb-placement" name="placement">
                ${placementOptions.map((o) => `<option value="${esc(o.toLowerCase())}">${o}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label for="cb-colourcustom">Custom colour</label>
              <input id="cb-colourcustom" name="colourcustom" maxlength="40" placeholder="Describe or name the colour you have in mind">
            </div>
            <p class="cb-help">Whenever a colour or word is written on the body it is done tastefully and only where Mika confirms.</p>
          </div>

          <div class="cb-step" data-step="4">
            <h3 class="cb-title">4 · Style &amp; shoot direction</h3>
            <div class="field"><label for="cb-location">Indoor / outdoor</label>
              <select id="cb-location" name="location">
                <option value="">No preference</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="both">Both</option>
              </select>
            </div>
            <div class="field"><label for="cb-lighting">Lighting preference</label><input id="cb-lighting" name="lighting" maxlength="200" placeholder="e.g. natural light, golden hour, moody"></div>
            <div class="field"><label for="cb-outfit">Outfit / style preference</label><input id="cb-outfit" name="outfit" maxlength="200" placeholder="Describe the look or outfit style you have in mind"></div>
            <div class="field"><label for="cb-background">Background preference</label><input id="cb-background" name="background" maxlength="200" placeholder="e.g. water, hotel, plain, mountain"></div>
            <div class="field"><label for="cb-mood">Mood / style</label><input id="cb-mood" name="mood" maxlength="200" placeholder="e.g. soft, confident, playful, elegant"></div>
            <div class="field"><label for="cb-camera">Camera / photo preference</label><input id="cb-camera" name="camera" maxlength="200" placeholder="Any angles, framing or photo notes"></div>
            <div class="field"><label for="cb-video">Video preference</label><input id="cb-video" name="video" maxlength="200" placeholder="Any video notes — length, style, audio"></div>
            <div class="field"><label for="cb-other">Other creative instructions</label><input id="cb-other" name="other" maxlength="500" placeholder="Anything else Mika should know"></div>
          </div>

          <div class="cb-step" data-step="5">
            <h3 class="cb-title">5 · Detailed request</h3>
            <div class="field"><label for="cb-detailed">Describe exactly how you would like your custom shoot planned.</label><textarea id="cb-detailed" name="detailed" rows="6" maxlength="4000" required></textarea></div>
            <p class="cb-help">Please provide as much detail as possible. Mika will review your request and confirm what can be produced before the order is accepted.</p>
            <div class="field"><label>Preferred delivery format</label>
              <div class="cb-chips" id="cb-delivery">
                ${['Photos', 'Videos', 'Photos + Videos'].map((d, i) => `<button type="button" class="chip cb-chip" data-value="${esc(d.toLowerCase().replace(/\s+/g, '-'))}">${d}</button>`).join('')}
              </div>
              <input type="hidden" name="delivery" id="cb-delivery-val" value="">
            </div>
          </div>

          <div class="cb-step" data-step="6">
            <h3 class="cb-title">6 · Contact details</h3>
            <div class="field"><label for="cb-contact-name">Name</label><input id="cb-contact-name" name="contactname" maxlength="80" autocomplete="name" required></div>
            <div class="field"><label for="cb-email">Email</label><input id="cb-email" name="email" type="email" maxlength="120" autocomplete="email" required></div>
            <div class="field"><label for="cb-method">Preferred contact method</label>
              <select id="cb-method" name="method">
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>

          <div class="cb-nav">
            <button type="button" class="btn btn-ghost cb-prev" hidden>Back</button>
            <button type="button" class="btn btn-primary cb-next">Continue</button>
            <button type="submit" class="btn btn-primary cb-submit" hidden>Request custom build</button>
          </div>
          <p class="form-status cb-status" id="cb-status" role="status"></p>
          <p class="cb-privacy muted">Only Mika reads these requests. Contact details are used solely to respond to your request — never shared publicly.</p>
        </form>

        <div class="cb-done" id="cb-done" hidden>
          <div class="cb-done-mark">✓</div>
          <h3 class="cb-title" style="text-align:center">Request received</h3>
          <p class="cb-help" style="text-align:center">Your custom request has been received. Mika will review the details and contact you regarding availability, pricing and production.</p>
          <div class="cb-done-links" id="cb-done-links"></div>
        </div>
      </div>

      <aside class="quality-panel">
        <div class="quality-card">
          <p class="eyebrow">the promise</p>
          <div class="gold-rule"></div>
          <h3 class="section-title" style="font-size:1.7rem">Quality custom shoots</h3>
          <p class="muted">Every custom request is individually planned and produced with attention to:</p>
          <ul class="quality-list">
            <li>Image quality</li>
            <li>Lighting</li>
            <li>Composition</li>
            <li>Styling</li>
            <li>Personalisation</li>
            <li>Requested colours</li>
            <li>Requested text</li>
            <li>Requested placement</li>
            <li>Video / photo specifications</li>
            <li>Customer instructions</li>
          </ul>
          <p class="muted" style="font-size:.9rem">Nothing is promised automatically — all custom requests remain subject to Mika's confirmation and availability.</p>
        </div>
      </aside>
    </div>
  </div>
</section>`;
}

/* ---------------- pages ---------------- */

function pageIndex() {
  const persona = (site.personas || []).find((p) => p.active) || {};
  const stats = [
    [String(gallery.collections?.length || 0), 'Collections'],
    [String(gallery.assets?.length || 0), 'Original photos'],
    ['100%', 'Original & owned'],
  ];
  return `${HERO()}
<section class="section section-tight" id="about">
  <div class="container">
    <div class="persona">
      <div>
        <p class="eyebrow">the muse</p>
        <div class="gold-rule"></div>
        <h2 class="section-title">Meet <span class="serif-i">${persona.name || 'Mika'}</span></h2>
        <p class="lead">${persona.bio || site.brand?.tagline || ''}</p>
        <div style="margin-top:1.2rem">
          <span class="persona-sign">${persona.signature || persona.name || ''}</span>
        </div>
        <div class="persona-stats">
          ${stats.map(([n, cap]) => `<div class="persona-stat"><div class="num">${n}</div><div class="cap">${cap}</div></div>`).join('')}
        </div>
      </div>
      <div class="panel panel-pad" style="text-align:center">
        <p class="eyebrow">a glimpse of mika</p>
        <p class="lead" style="font-size:1.15rem">This is a curated showcase — a small selection of preview photos from each collection. The full sets stay between Mika and those she invites closer.</p>
        <a class="btn btn-primary" href="/connect/" style="margin-top:.6rem">Get in touch</a>
      </div>
    </div>
  </div>
</section>
${glimpseGrid() ? `<section class="section section-tight" id="glimpse">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">a glimpse of mika</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">A glimpse inside</h2>
      <p class="lead">A small, curated selection — one preview from each world.</p>
    </div>
    ${glimpseGrid()}
  </div>
</section>` : ''}
${CONTENT_PACKAGES()}
${VIDEO_CALL()}
${CUSTOM_BUILD()}
<section class="section section-tight" id="collections">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">the gallery</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">Collections</h2>
      <p class="lead">A curated preview from each world. Full galleries are shared privately — get in touch to see more.</p>
    </div>
    <div class="collection-grid">
      ${gallery.collections.map((col) => collectionCard(col)).join('')}
    </div>
    <div style="display:grid;place-items:center;margin-top:3rem">
      <a class="btn btn-ghost btn-lg" href="/gallery/">Open the full gallery</a>
    </div>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    <div class="cta-strip">
      <p class="eyebrow">ready to know more?</p>
      <h2 class="display">Get in touch with Mika</h2>
      <p class="lead">Full gallery access, custom sets and collaborations. Pick the channel that feels right.</p>
      ${CTA_REDVELVET_ESA()}
      <p class="cta-note">Private galleries and full content available on request.</p>
    </div>
  </div>
</section>`;
}

function pageGallery() {
  return `${pageHero({
    eyebrow: 'the gallery',
    title: 'Browse the worlds of Mika',
    lead: 'A curated preview from each collection. Full galleries open once you’re connected with Mika.',
  })}
<section class="section section-tight" id="collections">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">the gallery</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">Collections</h2>
      <p class="lead">Choose a collection to look closer.</p>
    </div>
    <div class="collection-grid">
      ${gallery.collections.map((col) => collectionCard(col)).join('')}
    </div>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">latest teasers</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">A glimpse inside</h2>
    </div>
    <div class="gallery-grid teaser-grid" id="gallery-grid"></div>
  </div>
</section>
${TEASER_CTA()}`;
}

function pageCollection(col) {
  const teaserNote = `${col.count} original photos — a select few are shown as previews here.`;
  return `${pageHero({
    eyebrow: 'collection',
    title: col.title,
    lead: `${col.subtitle ? col.subtitle + '. ' : ''}${col.offer || ''} ${teaserNote}`,
  })}
<section class="section section-tight">
  <div class="container">
    <div style="display:flex;gap:1rem;align-items:center;justify-content:center;flex-wrap:wrap">
      <button class="like-btn" id="like-btn" data-type="collection" data-object="${col.slug}" aria-pressed="false">${icons.heart}<span class="count" id="like-count">…</span><span>Likes</span></button>
      <a class="btn btn-primary" href="/connect/">Get in touch</a>
    </div>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    <div class="gallery-grid teaser-grid" id="gallery-grid"></div>
  </div>
</section>
${TEASER_CTA()}
<section class="section section-tight">
  <div class="container">
    <div class="panel panel-pad" style="max-width:760px;margin-inline:auto">
      <p class="eyebrow">join the conversation</p>
      <div class="gold-rule"></div>
      <h2 class="section-title" style="font-size:1.8rem">Comments</h2>
      <form class="comment-form" id="comment-form">
        <div class="field"><label for="comment-name">Name</label><input id="comment-name" name="name" maxlength="60" autocomplete="name" required></div>
        <div class="field" hidden><input id="comment-website" name="website" tabindex="-1" autocomplete="off"></div>
        <div class="field"><label for="comment-text">Message</label><textarea id="comment-text" name="text" maxlength="1000" required></textarea></div>
        <button class="btn btn-ghost" type="submit">Post comment</button>
        <p class="form-status" id="comment-status" role="status"></p>
      </form>
      <div id="comment-list"></div>
    </div>
  </div>
</section>`;
}

function pageConnect() {
  const wa = `https://${c.whatsappDomain}/${c.whatsappNumber}`;
  const revRatings = [
    ['service', 'Service'], ['needs', 'Needs'], ['content', 'Content'],
  ];
  return `${pageHero({
    eyebrow: 'connect',
    title: 'Talk to Mika',
    lead: 'The fastest way to full gallery access and custom requests — pick your favourite channel.',
  })}
<section class="section section-tight">
  <div class="container">
    <div class="contact-grid">
      <a class="contact-card" href="${wa}" target="_blank" rel="noopener" style="display:block">
        <span class="ico">${icons.whatsapp}</span>
        <h3>WhatsApp</h3>
        <p>Direct, quick, friendly.</p>
        <div class="value">${c.whatsappDisplay}</div>
      </a>
      <a class="contact-card" href="${c.telegram}" target="_blank" rel="noopener" style="display:block">
        <span class="ico">${icons.telegram}</span>
        <h3>Telegram</h3>
        <p>The quieter room.</p>
        <div class="value">@ ${c.telegram.split('+').pop() || 'mika'}</div>
      </a>
      <a class="contact-card" href="mailto:${c.email}" style="display:block">
        <span class="ico">${icons.mail}</span>
        <h3>Email</h3>
        <p>For formal requests &amp; collaborations.</p>
        <div class="value">${c.email}</div>
      </a>
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="panel panel-pad" style="max-width:820px;margin-inline:auto">
      <p class="eyebrow">6-month check-in</p>
      <div class="gold-rule"></div>
      <h2 class="section-title" style="font-size:2rem">Rate your experience</h2>
      <p class="muted">Anonymous, one per rating per visit. Honest feedback keeps the content sharp.</p>
      <div style="margin-top:1.6rem;display:grid;gap:1rem">
        <div id="csat-stats" class="csat-stats"></div>
      </div>
      <form id="review-form" style="margin-top:2rem">
        ${revRatings.map(([key, label]) => `
          <div class="field">
            <label>${label}</label>
            <input type="hidden" name="${key}" value="0">
            <div class="rating-row">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => `<button type="button" class="chip" data-type="${key}" data-value="${v}" aria-label="${label} ${v} of 10">${v}</button>`).join('')}
            </div>
          </div>`).join('')}
        <div class="field"><label for="review-name">Name (optional)</label><input id="review-name" name="name" maxlength="60"></div>
        <div class="field"><label for="review-comment">A little more?</label><textarea id="review-comment" name="comment" maxlength="500"></textarea></div>
        <button class="btn btn-primary" type="submit">Submit review</button>
        <p class="form-status" id="review-status" role="status"></p>
      </form>
    </div>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    <div class="cta-strip">
      <p class="eyebrow">custom sets</p>
      <h2 class="display">Looking for something specific?</h2>
      <p class="lead">Mika shoots bespoke adult sets on request — natural light, natural places, fully yours.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="${wa}" target="_blank" rel="noopener">Start a conversation</a>
      </div>
    </div>
  </div>
</section>`;
}

const LEGAL_TEXT = {
  terms: {
    eyebrow: 'legal',
    title: 'Terms of use',
    sections: [
      ['Age restriction', 'This website is strictly for adults who are 18 years of age or older (or the age of majority in their jurisdiction, whichever is greater). By using this website you confirm you are of legal age.'],
      ['Adult content', 'All galleries are adult in nature. Content is presented as safe, blurred previews by default. Full galleries are only shared through the direct channels Mika provides after appropriate verification.'],
      ['Ownership', 'All photos, designs and text on this website are the exclusive property of Mika Creator and are protected by copyright. They may not be copied, downloaded, edited, redistributed or used commercially without written permission.'],
      ['No redistribution', 'You may not re-upload, share or sell any of the content found here. Respect the creator.'],
      ['Accuracy', 'Details about collections, counts and availability are provided in good faith and may change without notice.'],
      ['Contact', `Questions about these terms? Reach Mika at ${c.email}.`],
    ],
  },
  privacy: {
    eyebrow: 'privacy',
    title: 'Privacy policy (18+)',
    sections: [
      ['What we collect', 'We keep the privacy very light: a visitor token stored on your device (localStorage) so your likes and comments can be tied to you for a visit, plus a "verified adult" note so the age gate does not nag you.'],
      ['Analytics', 'We collect lightweight, first-party analytics (page views, device type, link clicks) stored on our own secure servers to help Mika understand how the site is used. A pseudonymous visitor token is used — no personally identifiable information is stored. Google Analytics may also be active on this site; Google\'s own privacy policy governs any data it collects.'],
      ['Your likes & comments', 'Likes and comments are stored on our secure servers as part of the community features. Comments are visible only after manual approval. No profile is created from them.'],
      ['Contact channels', 'Using the WhatsApp, Telegram or Email links will share whatever you choose to send with Mika directly.'],
      ['Advertisers', 'This website does not use third-party advertising or ad-tracking networks.'],
      ['Your rights', 'You may clear your device storage at any time to remove local tokens. For data you posted in comments or distributed serverside, contact ${c.email} to request removal.'],
      ['Age-appropriate', 'Because this site is 18+, personal data of minors is neither intentionally collected nor processed.'],
    ],
  },
};

function legalPage({ eyebrow, title, sections, path }) {
  return `${pageHero({ eyebrow, title, lead: 'The fine print, kept readable.' })}
<section class="section section-tight">
  <div class="container" style="max-width:820px">
    ${sections.map(([h, p]) => `
      <div class="panel panel-pad" style="margin-bottom:1.2rem">
        <h2 style="font-size:1.4rem;margin-bottom:.5rem">${h}</h2>
        <p class="muted" style="margin:0">${p}</p>
      </div>`).join('')}
  </div>
</section>`;
}

function page404() {
  return `<section class="page-hero" style="min-height:60vh;display:flex;flex-direction:column;justify-content:center">
  <div class="container center">
    <p class="eyebrow">error 404</p>
    <div class="display" style="font-size:clamp(5rem,20vw,11rem);line-height:1">404</div>
    <p class="lead">This page wandered off on its own photoshoot.</p>
    <div class="hero-actions" style="margin-top:2rem">
      <a class="btn btn-primary btn-lg" href="/">Back home</a>
      <a class="btn btn-ghost btn-lg" href="/gallery/">Browse gallery</a>
    </div>
  </div>
</section>`;
}

function pageAdmin() {
  return `
  <section class="section section-tight" id="admin-app">
    <div class="container" style="max-width:1100px">
      <div class="admin-head">
        <div>
          <p class="eyebrow">private · admin</p>
          <h1 class="section-title" style="margin-bottom:0">Dashboard</h1>
        </div>
        <div class="admin-head-actions">
          <button class="btn btn-ghost" id="admin-refresh" hidden>Refresh</button>
          <button class="btn btn-ghost" id="admin-logout" hidden>Sign out</button>
        </div>
      </div>

      <div class="panel panel-pad" id="admin-login" style="max-width:420px;margin:2rem auto">
        <p class="eyebrow">sign in</p>
        <div class="gold-rule"></div>
        <h2 class="section-title" style="font-size:1.8rem">Authorised access only</h2>
        <p class="muted" style="font-size:.9rem">Sign in with the account Mika created in the Supabase dashboard. This area is private — analytics and moderation live here.</p>
        <style>#admin-form .field{margin-bottom:1rem}</style>
        <form id="admin-form" style="margin-top:1.4rem">
          <div class="field"><label for="admin-email">Email</label><input id="admin-email" name="email" type="email" autocomplete="username" required></div>
          <div class="field"><label for="admin-password">Password</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary" type="submit" id="admin-submit" style="width:100%">Sign in</button>
          <p class="form-status" id="admin-form-status" role="status" style="text-align:center"></p>
        </form>
      </div>

      <div id="admin-view" style="display:none" data-loaded="">
        <div id="admin-today" class="stat-card accent" style="margin-bottom:1rem"></div>
        <div class="stat-grid" id="admin-stats"></div>

        <div class="admin-panel">
          <h3>Daily visitors (7 days)</h3>
          <div id="admin-chart"></div>
        </div>

        <div class="admin-grid-2">
          <div id="admin-pages"></div>
          <div id="admin-devices"></div>
        </div>
        <div class="admin-grid-2">
          <div id="admin-sources"></div>
          <div id="admin-engagement"></div>
        </div>

        <p class="eyebrow" style="margin-top:2.5rem">moderation</p>
        <div class="gold-rule"></div>
        <h2 class="section-title" style="font-size:1.8rem">Comments to review</h2>
        <div id="admin-moderation"></div>
      </div>
    </div>
  </section>`;
}

/* ---------------- render ---------------- */

export function renderAll() {
  const checks = [];
  const pages = [
    { path: 'index.html', title: site.seo?.title, desc: site.seo?.description, body: () => pageIndex(), attrs: 'data-hero data-gallery data-custom-build' },
    { path: 'gallery/index.html', title: 'Gallery — Mika Creator | 18+', desc: 'Browse the 18+ photo collections of Mika. Safe blurred previews, original content, seven worlds to explore.', body: () => pageGallery(), attrs: 'data-gallery' },
    { path: 'connect/index.html', title: 'Connect — Mika Creator', desc: 'Reach Mika on WhatsApp, Telegram or email. Full gallery access and custom set requests happen here.', body: () => pageConnect(), attrs: 'data-reviews' },
    { path: 'terms/index.html', title: 'Terms of use — Mika Creator', desc: 'Terms of use for the Mika Creator website.', body: () => legalPage(LEGAL_TEXT.terms), attrs: '' },
    { path: 'privacy-18.html', title: 'Privacy (18+) — Mika Creator', desc: 'Privacy policy for the adult website Mika Creator.', body: () => legalPage(LEGAL_TEXT.privacy), attrs: '' },
    { path: '404.html', title: 'Page not found — Mika Creator', desc: 'The page you wanted could not be found.', body: () => page404(), attrs: '', robots: 'noindex,follow' },
    { path: 'admin/index.html', title: 'Admin — Mika Creator', desc: 'Private admin dashboard.', body: () => pageAdmin(), attrs: 'data-admin', robots: 'noindex,nofollow' },
  ];

  const rendered = [];
  for (const page of pages) {
    const html = SHELL({
      title: page.title,
      description: page.desc,
      path: page.path.replace('index.html', ''),
      robots: page.robots,
      bodyAttrs: page.attrs,
      content: page.body(),
    });
    rendered.push([page.path, html]);
  }
  for (const col of gallery.collections || []) {
    const html = SHELL({
      title: `${col.title} — Mika Creator | 18+ gallery`,
      description: `${col.subtitle || col.offer || col.title}. ${col.count} original 18+ photos by Mika, shown as safe previews.`,
      path: `/gallery/${col.slug}/`,
      bodyAttrs: ` data-gallery data-collection="${col.slug}" data-likes data-comments`,
      content: pageCollection(col),
    });
    rendered.push([`gallery/${col.slug}/index.html`, html]);
  }

  for (const [rel, html] of rendered) {
    const out = path.join(ROOT, rel);
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, html);
  }
  console.log(`rendered ${rendered.length} pages`);
  return rendered.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  renderAll();
}