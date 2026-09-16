import { $, $$ } from './ui.mjs';
import { openLightbox } from './lightbox.mjs';

const PAGE = 48;
const base = window.MIKA_CONFIG?.assets?.base || 'assets/data/';

let all = [];

const lockSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`;

function accessModal(item) {
  const cfg = window.MIKA_CONFIG || {};
  const c = cfg.contact || {};
  const wa = c.whatsappNumber ? `https://${c.whatsappDomain || 'wa.me'}/${c.whatsappNumber}?text=${encodeURIComponent(`Hi Mika — I'd like access to the ${item?.collectionTitle || 'full'} collection.`)}` : null;
  const tg = c.telegram ? `${c.telegram}?text=${encodeURIComponent('Hi Mika — I like your content and would like access.')}` : null;
  const mail = c.email ? `mailto:${c.email}?subject=${encodeURIComponent('Full gallery access request')}` : null;

  const wrap = document.createElement('div');
  wrap.className = 'lightbox access-modal';
  wrap.id = 'access-modal';
  wrap.innerHTML = `
    <div class="access-panel panel panel-pad" style="max-width:420px;width:90vw;text-align:center">
      <h3 style="font-size:1.5rem">Request full access</h3>
      <p class="muted" style="font-size:.9rem;margin-top:.6rem">The preview you are browsing is safe and blurred. For the full gallery, reach Mika directly.</p>
      <div style="display:grid;gap:.8rem;margin-top:1.6rem">
        ${wa ? `<a class="btn btn-primary" href="${wa}" target="_blank" rel="noopener">WhatsApp Mika</a>` : ''}
        ${tg ? `<a class="btn btn-ghost" href="${tg}" target="_blank" rel="noopener">Telegram</a>` : ''}
        ${mail ? `<a class="btn btn-ghost" href="${mail}">Email</a>` : ''}
      </div>
      <button class="btn btn-ghost" data-close style="margin-top:1.2rem">Close</button>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => {
    wrap.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => wrap.remove(), 350);
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

function tile(item, lazy) {
  const preview = item.visibility !== 'public';
  const gatePassed = document.body.classList.contains('gate-passed');
  const el = document.createElement('article');
  el.className = 'gallery-item' + (preview && !gatePassed ? ' preview' : '');
  el.dataset.slug = item.slug;
  if (item.urls.thumb) el.dataset.thumb = item.urls.thumb;
  if (item.urls.blur) el.dataset.blur = item.urls.blur;
  const src = preview
    ? (gatePassed ? (item.urls.thumb || item.urls.blur) : item.urls.blur)
    : item.urls.thumb;
  el.innerHTML = `
    <button class="item-open" aria-label="Open preview — ${item.collectionTitle}"></button>
    <img src="${lazy ? '' : src}"${lazy ? ` data-src="${src}"` : ''} alt="${item.alts || ''}" width="${item.aspectKey || ''}" loading="${lazy ? 'lazy' : 'eager'}" draggable="false">
    ${preview && !gatePassed ? `<div class="lock-badge"><span class="lock-ico">${lockSvg}</span><span>18+ preview</span><span class="lock-hint">${item.collectionTitle.toUpperCase()}</span></div>` : ''}
  `;
  if (lazy && el.querySelector('img')) {
    const img = el.querySelector('img');
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting && !img.src) {
          img.src = img.dataset.src;
          io.disconnect();
        }
      }
    }, { rootMargin: '900px' });
    io.observe(img);
  }
  el.querySelector('.item-open').addEventListener('click', () => {
    if (preview && !document.body.classList.contains('gate-passed')) {
      accessModal(item);
    } else {
      const list = all.map((a) => ({
        collectionTitle: a.collectionTitle,
        collection: a.collection,
        urls: a.urls,
        visibility: a.visibility,
      }));
      const idx = all.findIndex((a) => a.slug === item.slug);
      openLightbox(list, idx);
    }
  });
  return el;
}

function unlockGallery() {
  const items = $$('.gallery-item.preview');
  for (const el of items) {
    const thumbUrl = el.dataset.thumb;
    if (thumbUrl) {
      const img = el.querySelector('img');
      if (img) img.src = thumbUrl;
    }
    el.classList.remove('preview');
    const badge = el.querySelector('.lock-badge');
    if (badge) badge.remove();
  }
}

export async function initGallery() {
  const grid = $('#gallery-grid');
  if (!grid) return;
  const collection = document.body.dataset.collection;

  const res = await fetch(`${base}gallery.json`, { cache: 'no-cache' });
  if (!res.ok) { grid.innerHTML = '<p class="gallery-empty">The gallery is taking a quick breath — please refresh.</p>'; return; }
  const data = await res.json();

  all = collection
    ? data.assets.filter((a) => a.collection === collection)
    : data.assets;

  if (!all.length) {
    grid.innerHTML = '<p class="gallery-empty">Nothing here yet. New sets drop soon.</p>';
    return;
  }

  let shown = 0;
  const renderNext = (n) => {
    const frag = document.createDocumentFragment();
    for (const a of all.slice(shown, shown + n)) {
      const el = tile(a, false);
      frag.appendChild(el);
      requestAnimationFrame(() => el.classList.add('revealed'));
    }
    grid.appendChild(frag);
    shown += n;
    const btn = $('#load-more');
    if (btn) btn.hidden = shown >= all.length;
    if (btn && shown < all.length) btn.querySelector('.load-more-count').textContent = `${Math.min(all.length, shown + PAGE) - shown} more `;
  };

  grid.innerHTML = '';
  renderNext(PAGE);
  $('#load-more')?.addEventListener('click', () => renderNext(PAGE));

  document.addEventListener('mika:gate-passed', unlockGallery);

  if (document.body.classList.contains('gate-passed')) {
    unlockGallery();
  }

  if (typeof window.MikaTrackGallery !== 'function') {
    window.MikaTrackGallery = (label) => window.gtag?.('event', 'view_item', { item_name: label });
  }
}
