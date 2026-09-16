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
  const preview = /\.blur\.webp$/.test(col.cover || '');
  return `<article class="card">
    <div class="card-media">
      <img src="${col.cover}" alt="${col.title} — Mika Creator preview" loading="lazy" draggable="false">
      <div class="card-shade"></div>
      <span class="card-count">${col.count} photos</span>
      ${preview ? `<div class="lock-badge" style="inset:auto 1rem 1rem auto;width:auto;padding:.4rem .9rem;background:rgba(10,10,14,.55)"><span class="lock-ico" style="width:15px;height:15px">${icons.lock}</span> preview</div>` : ''}
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

/* ---------------- pages ---------------- */

function pageIndex() {
  const persona = (site.personas || []).find((p) => p.active) || {};
  const stats = [
    [String(gallery.collections?.length || 0), 'Collections'],
    [String(gallery.assets?.length || 0), 'Original photos'],
    ['100%', 'Original & owned'],
  ];
  return `${HERO()}
<section class="section" id="about">
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
        <p class="eyebrow">a note on previews</p>
        <p class="lead" style="font-size:1.15rem">Every gallery here opens as a <strong>safe, blurred preview</strong> — the way premium 18+ content should be handled. Full galleries open once we are connected directly.</p>
        <a class="btn btn-primary" href="/connect/" style="margin-top:.6rem">Request full access</a>
      </div>
    </div>
  </div>
</section>
<section class="section section-tight" id="collections">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">the gallery</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">Collections</h2>
      <p class="lead">Seven worlds, one muse. Browse a blurred preview of each set below before stepping inside.</p>
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
      <p class="eyebrow">let’s talk</p>
      <h2 class="display">Prefer a private conversation?</h2>
      <p class="lead">Message Mika directly on WhatsApp or Telegram — that’s where full gallery access happens.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="https://${c.whatsappDomain}/${c.whatsappNumber}" target="_blank" rel="noopener">WhatsApp ${c.whatsappDisplay}</a>
        <a class="btn btn-ghost btn-lg" href="${c.telegram}" target="_blank" rel="noopener">Telegram</a>
      </div>
    </div>
  </div>
</section>`;
}

function pageGallery() {
  return `${pageHero({
    eyebrow: 'the gallery',
    title: 'Browse the worlds of Mika',
    lead: 'Original adult galleries, presented as safe blurred previews. Choose a collection to look closer.',
  })}
<section class="section section-tight" id="collections">
  <div class="container">
    <div class="collection-grid">
      ${gallery.collections.map((col) => collectionCard(col)).join('')}
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">latest sets</p>
      <div class="gold-rule"></div>
      <h2 class="section-title">Recently captured</h2>
    </div>
    <div class="gallery-grid" id="gallery-grid"></div>
    <div class="load-more">
      <button class="btn btn-ghost" id="load-more" hidden><span class="load-more-count"></span>Load more</button>
    </div>
  </div>
</section>`;
}

function pageCollection(col) {
  return `${pageHero({
    eyebrow: 'collection',
    title: col.title,
    lead: `${col.subtitle ? col.subtitle + '. ' : ''}${col.offer || ''} ${col.count} original photos — shown as safe previews.`,
  })}
<section class="section section-tight">
  <div class="container">
    <div style="display:flex;gap:1rem;align-items:center;justify-content:center;flex-wrap:wrap">
      <button class="like-btn" id="like-btn" data-type="collection" data-object="${col.slug}" aria-pressed="false">${icons.heart}<span class="count" id="like-count">…</span><span>Likes</span></button>
      <a class="btn btn-primary" href="https://${c.whatsappDomain}/${c.whatsappNumber}?text=${encodeURIComponent(`Hi Mika — I’d like full access to the ${col.title} collection.`)}" target="_blank" rel="noopener">Full access</a>
    </div>
  </div>
</section>
<section class="section section-tight">
  <div class="container">
    <div class="gallery-grid" id="gallery-grid"></div>
    <div class="load-more">
      <button class="btn btn-ghost" id="load-more" hidden><span class="load-more-count"></span>Load more</button>
    </div>
  </div>
</section>
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
      ['Your likes & comments', 'Likes and comments are stored on our secure servers as part of the community features. No profile is created from them.'],
      ['Analytics', 'We use Google Analytics, which may set cookies and collect pseudonymous usage data to understand how many people visit. Google’s own privacy policy governs that data.'],
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

/* ---------------- render ---------------- */

export function renderAll() {
  const checks = [];
  const pages = [
    { path: 'index.html', title: site.seo?.title, desc: site.seo?.description, body: () => pageIndex(), attrs: 'data-hero data-gallery' },
    { path: 'gallery/index.html', title: 'Gallery — Mika Creator | 18+', desc: 'Browse the 18+ photo collections of Mika. Safe blurred previews, original content, seven worlds to explore.', body: () => pageGallery(), attrs: 'data-gallery' },
    { path: 'connect/index.html', title: 'Connect — Mika Creator', desc: 'Reach Mika on WhatsApp, Telegram or email. Full gallery access and custom set requests happen here.', body: () => pageConnect(), attrs: 'data-reviews' },
    { path: 'terms/index.html', title: 'Terms of use — Mika Creator', desc: 'Terms of use for the Mika Creator website.', body: () => legalPage(LEGAL_TEXT.terms), attrs: '' },
    { path: 'privacy-18.html', title: 'Privacy (18+) — Mika Creator', desc: 'Privacy policy for the adult website Mika Creator.', body: () => legalPage(LEGAL_TEXT.privacy), attrs: '' },
    { path: '404.html', title: 'Page not found — Mika Creator', desc: 'The page you wanted could not be found.', body: () => page404(), attrs: '', robots: 'noindex,follow' },
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