/**
 * Mika Creator — first-party Supabase analytics (conversion funnel)
 *
 * Lightweight anonymous events written to the supabase insert_event RPC.
 * Every event carries useful metadata: page path, referrer, device, a
 * pseudonymous visitor token and (where known) the traffic source + campaign.
 *
 * UTM parameters are captured on first load of a session (first-touch) and
 * preserved for the rest of that session, so attribution survives internal
 * navigation without overwriting the original source.
 *
 * Event types emitted here (mirrored in the analytics_events CHECK constraint):
 *   page_view, session_start, hero_slide_view, gallery_open, collection_open,
 *   cta_click, whatsapp_click, telegram_click, contact_click, pricing_view,
 *   custom_request_click, generate_lead, outbound_click, like, review_submit,
 *   gallery_interaction, redvelvet_click, esa_click,
 *   video_call_click, content_click, gallery_click, enquiry_click, lead_submit
 *
 * Privacy: no message content, names, phone numbers, emails or proof uploads
 * are collected. For WhatsApp/Telegram only the base destination is stored.
 */
import { visitorId } from './supabase.mjs';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const UTM_STORAGE = 'mika_utm_params'; // shared with GA4 tracking.mjs
const SESSION_TAG = 'mika_db_session_started';
const PRICING_TAG = 'mika_db_pricing_viewed';

const uaHash = (() => {
  try { return visitorId(); } catch { return ''; }
})();

let initialised = false;

function device() {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  if (uad?.mobile) return 'mobile';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function readQuery(url) {
  try { return new URL(url, window.location.href).searchParams; } catch { return new URLSearchParams(); }
}

function sessGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch {}
}

function captureUtm() {
  const q = readQuery(window.location.href);
  const found = {};
  let any = false;
  for (const k of UTM_KEYS) {
    const v = q.get(k);
    if (v) { found[k] = v; any = true; }
  }
  // First-touch for the session wins; later clicks never overwrite it.
  if (any) sessSet(UTM_STORAGE, JSON.stringify(found));
  return found;
}

function storedUtm() {
  try { return JSON.parse(sessGet(UTM_STORAGE) || '{}'); } catch { return {}; }
}

const SOURCE_MAP = {
  tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit',
  google: 'Google', telegram: 'Telegram', twitter: 'Twitter', x: 'Twitter',
  snapchat: 'Snapchat', youtube: 'YouTube', whatsapp: 'WhatsApp',
};

function normalizeSource(s) {
  const v = String(s || '').toLowerCase().trim();
  if (!v) return null;
  if (SOURCE_MAP[v] !== undefined) return SOURCE_MAP[v];
  if (v.includes('tiktok')) return 'TikTok';
  if (v.includes('facebook')) return 'Facebook';
  if (v.includes('instagram')) return 'Instagram';
  if (v.includes('reddit')) return 'Reddit';
  if (v.includes('google')) return 'Google';
  if (v.includes('telegram')) return 'Telegram';
  if (v.includes('twitter')) return 'Twitter';
  if (v.includes('whatsapp')) return 'WhatsApp';
  return 'Other';
}

function referrerSource() {
  const r = document.referrer || '';
  if (!r) return 'Direct';
  return normalizeSource(r) || (/^https?:\/\//i.test(r) ? 'Other' : 'Direct');
}

// First-touch UTM source if present, otherwise referrer-derived. Never invents
// attribution — no utm + no referrer = Direct.
function sourceName() {
  const utm = storedUtm();
  return (utm.utm_source ? normalizeSource(utm.utm_source) : null) || referrerSource();
}

function eventMeta() {
  const utm = storedUtm();
  const meta = { source: sourceName() };
  if (utm.utm_campaign) meta.campaign = utm.utm_campaign;
  for (const k of UTM_KEYS) if (utm[k]) meta[k] = utm[k];
  return meta;
}

const cleanBase = (href) => {
  try { return String(href || '').split('?')[0].split('#')[0]; } catch { return ''; }
};

function track(eventType, extra = {}) {
  const cfg = window.MIKA_CONFIG || {};
  const url = cfg.supabase?.url;
  if (!url) return;
  try {
    fetch(`${url}/rest/v1/rpc/insert_event`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabase.anonKey,
        Authorization: `Bearer ${cfg.supabase.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_event_type: eventType,
        p_path: location.pathname + location.search,
        p_referrer: document.referrer || '',
        p_device: device(),
        p_ua_hash: uaHash,
        p_extra: { ...eventMeta(), ...extra },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function pageZone() {
  const p = location.pathname;
  if (document.body?.dataset?.collection) return 'collection';
  if (/\/gallery\/?$/.test(p)) return 'gallery';
  if (/\/connect\/?$/.test(p)) return 'connect';
  return 'homepage';
}

function buttonLocation(el) {
  if (el.closest('.access-panel, .access-modal')) return 'access-modal';
  if (el.closest('#mobile-menu')) return 'menu';
  if (el.closest('.site-header')) return 'header';
  if (el.closest('.site-footer')) return 'footer';
  if (el.closest('.contact-card')) return 'connect-card';
  if (el.closest('#custom-build, .cb-form-panel, #cb-done')) return 'custom-build';
  if (el.closest('.pkg-card')) return 'package';
  if (el.closest('.vc-card')) return 'pricing';
  if (el.closest('.hero')) return 'homepage_hero';
  if (el.closest('.glimpse-item, .glimpse-grid')) return 'gallery-teaser';
  if (el.closest('.card, .collection-grid')) return 'collection-card';
  if (el.closest('.gallery-item, #gallery-grid')) return 'gallery-teaser';
  if (el.closest('.teaser-cta, .cta-strip')) return 'cta-strip';
  return pageZone();
}

function galleryName(el) {
  if (!el) return null;
  const tagged = el.closest('[data-gallery-name]');
  if (tagged) return tagged.getAttribute('data-gallery-name') || null;
  return document.body?.dataset?.collectionTitle || null;
}

function ctaLabel(el) {
  try {
    return String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
  } catch { return null; }
}

function clickIntent(el, href, cta) {
  const pkg = el.closest('[data-package]')?.getAttribute('data-package') || null;
  const videoCall =
    Boolean(el.closest('#video-call, .vc-card, .vc-actions, .vc-booking')) ||
    /#video-call/.test(href) ||
    /request=video-call/i.test(href) ||
    /video.?call/i.test(`${cta || ''} ${href}`);
  const content =
    Boolean(el.closest('#packages, .pkg-card, .pkg-grid, .pkg-cta')) ||
    /#packages/.test(href) ||
    /[?&]pkg=content-/i.test(href) ||
    Boolean(pkg);
  const gallery =
    Boolean(el.closest('.card-link, .glimpse-item, [data-gallery-name]')) ||
    /\/gallery(\/|$|\?)/.test(href);
  const enquiry =
    Boolean(el.closest('#custom-build, .cb-form-panel, #cb-done, .hero-chat')) ||
    /#custom-build/.test(href) ||
    /enquiry/i.test(`${cta || ''} ${href}`);
  return { videoCall, content, gallery, enquiry, pkg };
}

function trackIntent(intent, extra) {
  if (intent.videoCall) track('video_call_click', extra);
  else if (intent.content) track('content_click', { ...extra, package: intent.pkg });
  else if (intent.enquiry) track('enquiry_click', extra);
  else if (intent.gallery) track('gallery_click', extra);
}

function onClick(e) {
  const cfg = window.MIKA_CONFIG || {};
  const c = cfg.contact || {};
  const waDomain = (c.whatsappDomain || 'wa.me').replace(/\/$/, '');

  const likeBtn = e.target.closest('.like-btn');
  if (likeBtn) { track('like', { object: likeBtn.dataset.object || likeBtn.dataset.collection || 'home' }); return; }

  if (e.target.closest('form#review-form')) { track('review_submit'); return; }

  const el = e.target.closest('a[href], button');
  if (!el) return;
  const anchor = el.closest('a[href]');
  const href = anchor ? (anchor.getAttribute('href') || anchor.href || '') : '';
  const loc = buttonLocation(el);
  const gname = galleryName(anchor);
  const cta = ctaLabel(el);
  const intent = clickIntent(el, href, cta);
  const extra = { location: loc, cta, collection: gname };

  // WhatsApp — the primary lead CTA. Fire the event before the destination
  // opens. Only the base destination is stored (never the message text).
  const isWhatsApp =
    /^https:\/\/(?:www\.)?wa\.me\//.test(href) ||
    /^https:\/\/api\.whatsapp\.com\//.test(href) ||
    (waDomain !== 'wa.me' && href.indexOf(`https://${waDomain}`) === 0);
  if (isWhatsApp) {
    track('whatsapp_click', { ...extra, dest: cleanBase(href) });
    trackIntent(intent, extra);
    return;
  }

  const isTelegram =
    /^https:\/\/t\.me\//.test(href) ||
    (c.telegram && href.indexOf(c.telegram) === 0);
  if (isTelegram) {
    track('telegram_click', { ...extra, dest: cleanBase(href) });
    trackIntent(intent, extra);
    return;
  }

  if (c.redvelvet && href.indexOf(c.redvelvet) === 0) { track('redvelvet_click', { location: loc, href: cleanBase(href) }); return; }
  if (c.esa && href.indexOf(c.esa) === 0) { track('esa_click', { location: loc, href: cleanBase(href) }); return; }
  if (/^mailto:/i.test(href) || /^tel:/i.test(href)) {
    track('contact_click', { location: loc, cta, channel: /^mailto:/i.test(href) ? 'email' : 'phone' });
    if (intent.enquiry) track('enquiry_click', extra);
    return;
  }

  if (el.closest('.card-link, .glimpse-item')) {
    track('gallery_open', { location: loc, collection: gname });
    track('gallery_click', { location: loc, collection: gname });
    return;
  }

  if (/^https?:/i.test(href) && href.indexOf(window.location.origin) !== 0) {
    track('outbound_click', { location: loc, href: cleanBase(href) });
    return;
  }

  if (intent.videoCall || intent.content || intent.enquiry || intent.gallery) {
    trackIntent(intent, { ...extra, href: cleanBase(href) });
    return;
  }

  // Internal navigation CTAs (buttons linking within the site).
  if (el.closest('.btn')) {
    track('cta_click', { location: loc, cta, href: cleanBase(href) });
  }
}

function initPricingTracking() {
  if (sessGet(PRICING_TAG)) return;
  const targets = Array.from(document.querySelectorAll('#packages, #video-call, .pkg-card')).filter(Boolean);
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) { sessSet(PRICING_TAG, '1'); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        sessSet(PRICING_TAG, '1');
        track('pricing_view', {
          location: 'pricing',
          section: entry.target.id || (entry.target.classList.contains('pkg-card') ? 'package' : 'pricing'),
        });
        io.disconnect();
        return;
      }
    }
  }, { threshold: 0.15 });
  targets.forEach((t) => io.observe(t));
}

export function initAnalytics() {
  if (initialised) return;
  if (!(window.MIKA_CONFIG?.supabase?.url)) return;
  if (document.body?.dataset?.admin !== undefined || document.body?.dataset?.adminLogin !== undefined) return;
  if (/^\/admin(\/|$)/.test(location.pathname)) return;
  initialised = true;

  // Shared tracker for other modules (hero, lightbox, custom-build) so DB and
  // GA4 events both fire from a single call site in each module.
  window.MikaDbTrack = track;

  captureUtm();
  track('page_view');

  if (!sessGet(SESSION_TAG)) {
    sessSet(SESSION_TAG, '1');
    track('session_start');
  }

  const col = document.body?.dataset?.collection;
  const colTitle = document.body?.dataset?.collectionTitle;
  if (col) {
    track('collection_open', { collection: colTitle || col, location: 'collection' });
  } else if (/\/gallery\/?$/.test(location.pathname)) {
    track('gallery_open', { location: 'gallery' });
  }

  initPricingTracking();
  document.addEventListener('click', onClick, { capture: true });
}