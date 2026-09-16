import { visitorId } from './supabase.mjs';

const uaHash = (() => {
  try { return visitorId(); } catch { return ''; }
})();

function device() {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  if (uad?.mobile) return 'mobile';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

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
        p_extra: extra,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function addOutboundListeners() {
  const hrefOf = (a) => (a && a.href ? a.href : '');
  const phoneOrMail = document.querySelectorAll('a[href^="tel"], a[href^="mailto:"]');

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]') || e.target.closest('button');
    if (!a) return;

    const btn = e.target.closest('.like-btn');
    if (btn) { track('like', { object: btn.dataset.object || btn.dataset.collection || 'home' }); return; }

    const form = a.closest && e.target.closest('form#review-form');
    if (form) { track('review_submit'); return; }

    const href = hrefOf(e.target.closest('a[href]'));
    if (!href) return;
    if (e.target.closest('[data-nav], .brand, .nav-toggle, .mobile-menu a, .card-link')) { track('gallery_interaction', { href }); return; }

    const cfg = window.MIKA_CONFIG || {};
    const c = cfg.contact || {};

    const label = String(href);
    if (c.redvelvet && label.startsWith(c.redvelvet)) { track('redvelvet_click', { href }); return; }
    if (c.esa && label.startsWith(c.esa)) { track('esa_click', { href }); return; }
    if (c.email && label.startsWith(`mailto:${c.email}`)) { track('contact_click', { href }); return; }
    if (label.startsWith('https://' + (c.whatsappDomain || 'wa.me')) || (c.telegram && label.startsWith(c.telegram))) { track('contact_click', { href }); return; }

    if (href.startsWith(location.origin)) {
      const t = e.target.closest('.btn');
      if (t && t.textContent) track('cta_click', { href });
    } else {
      track('outbound_click', { href });
    }
  }, { capture: true });

  phoneOrMail.forEach((a) => {
    a.addEventListener('click', () => track('contact_click', { href: a.href }));
  });
}

export function initAnalytics() {
  if (!(window.MIKA_CONFIG?.supabase?.url)) return;
  track('page_view');
  addOutboundListeners();
}