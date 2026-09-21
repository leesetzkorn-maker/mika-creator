/**
 * Mika Creator — Google Analytics 4 tracking (single installation)
 *
 * Loads the existing GA4 tag (site.ga) once and wires the site's conversion
 * events on top of it. Event delegation is used everywhere, so there is one
 * listener per document and no per-element duplicate handlers.
 *
 * Events tracked:
 *   page_view           (GA4 page view, fired manually to control metadata)
 *   whatsapp_click      page_path, page_title, button_location, gallery_name, device_category
 *   telegram_click      page_path, page_title, button_location, gallery_name, device_category
 *   gallery_open        gallery_name, page_path, device_category
 *   new_shoot_open      gallery_name = "New Shoot", device_category
 *   gallery_image_view  gallery_name, image_index, device_category
 *   hero_slide_view     slide_number, slide_image, device_category
 *   hero_next_click     current_slide, next_slide
 *   hero_previous_click current_slide, previous_slide
 *
 * No message content, names, phone numbers or emails are ever collected — only
 * navigation + engagement metadata needed to understand traffic and conversion.
 */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const UTM_STORAGE = 'mika_utm_params';
const OPEN_PREFIX = 'mika_ga_open:';
const NEW_SHOOT_PREFIX = 'mika_ns_open:';

let initialized = false;

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

function sessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch {}
}

function baseParams() {
  return {
    page_path: window.location.pathname + window.location.search,
    page_title: document.title,
    device_category: device(),
  };
}

function track(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', eventName, { ...baseParams(), ...params });
  } catch {}
}

function captureUtm() {
  const q = readQuery(window.location.href);
  const found = {};
  let any = false;
  for (const k of UTM_KEYS) {
    const v = q.get(k);
    if (v) { found[k] = v; any = true; }
  }
  if (any) sessionSet(UTM_STORAGE, JSON.stringify(found));
  return found;
}

function storedUtm() {
  try { return JSON.parse(sessionGet(UTM_STORAGE) || '{}'); } catch { return {}; }
}

// Appends previously captured UTM params to internal links so attribution
// survives normal site navigation. Never invents attribution data — params
// only flow through when a visitor actually arrived with UTM in their URL.
function preserveUtm(href) {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return href;
  if (/^https?:/i.test(href) && !href.startsWith(window.location.origin)) return href;
  if (readQuery(href).has('utm_source')) return href;

  const utm = storedUtm();
  if (!Object.keys(utm).length) return href;
  const qs = readQuery(href);
  for (const k of UTM_KEYS) if (utm[k]) qs.set(k, utm[k]);
  const q = qs.toString();
  const base = href.split('?')[0];
  return q ? `${base}?${q}` : href;
}

function buttonLocation(el) {
  if (el.closest('.access-panel, .access-modal')) return 'access-modal';
  if (el.closest('#mobile-menu')) return 'menu';
  if (el.closest('.site-header')) return 'header';
  if (el.closest('.site-footer')) return 'footer';
  if (el.closest('.contact-card')) return 'connect-card';
  if (el.closest('.gallery-item, #gallery-grid')) return 'gallery-teaser';
  if (el.closest('#custom-build, .cb-form-panel, #cb-done')) return 'custom-build';
  if (el.closest('.pkg-card')) return 'package';
  if (el.closest('.teaser-cta, .cta-strip')) return 'cta-strip';
  return el.closest('button') ? 'button' : 'link';
}

function galleryName(el) {
  const tagged = el.closest('[data-gallery-name]');
  if (tagged) return tagged.getAttribute('data-gallery-name') || null;
  return document.body.dataset.collectionTitle || null;
}

function onClick(e) {
  const cfg = window.MIKA_CONFIG || {};
  const contact = cfg.contact || {};
  const waDomain = (contact.whatsappDomain || 'wa.me').replace(/\/$/, '');

  // Preserve UTM across internal navigation.
  const link = e.target.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href');
    const preserved = preserveUtm(href);
    if (preserved !== href) link.setAttribute('href', preserved);
  }

  const el = e.target.closest('a[href], button');
  if (!el) return;
  const href = el.tagName === 'A' ? el.getAttribute('href') || el.href || '' : '';

  // WhatsApp / Telegram conversion clicks.
  const isWhatsApp = href.startsWith(`https://${waDomain}`) || href.startsWith('https://wa.me/');
  const isTelegram =
    href.startsWith('https://t.me/') ||
    (contact.telegram && href.startsWith(contact.telegram));

  const loc = buttonLocation(el);
  const gname = galleryName(el);

  if (isWhatsApp) {
    track('whatsapp_click', { button_location: loc, gallery_name: gname });
    return;
  }
  if (isTelegram) {
    track('telegram_click', { button_location: loc, gallery_name: gname });
    return;
  }

  // Gallery open (a collection card or glimpse thumb on any page).
  if (el.closest('.card-link, .glimpse-item')) {
    track('gallery_open', { gallery_name: gname || loc });
    return;
  }
}

// Fired once per collection per session — prevents double counting the same
// open when a visitor clicks a card and then lands on the collection page.
function trackCollectionView() {
  const slug = document.body.dataset.collection;
  if (!slug) return;
  const title = document.body.dataset.collectionTitle || slug;

  if (!sessionGet(OPEN_PREFIX + slug)) {
    sessionSet(OPEN_PREFIX + slug, '1');
    track('gallery_open', { gallery_name: title });
  }

  if (slug === 'new-shoot' && !sessionGet(NEW_SHOOT_PREFIX + 'new-shoot')) {
    sessionSet(NEW_SHOOT_PREFIX + 'new-shoot', '1');
    track('new_shoot_open', { gallery_name: 'New Shoot' });
  }
}

export function initTracking() {
  if (initialized) return;
  initialized = true;

  const cfg = window.MIKA_CONFIG || {};
  if (!cfg.ga) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.ga}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', cfg.ga, { anonymize_ip: true, send_page_view: false });
  window.gtag('event', 'page_view', { page_title: document.title, page_location: location.href });

  // Shared helpers for the hero + lightbox modules.
  window.MikaTrack = track;
  window.MikaDevice = device;

  captureUtm();
  document.addEventListener('click', onClick, { capture: true });
  trackCollectionView();
}