import { $ } from './ui.mjs';

const base = window.MIKA_CONFIG?.assets?.base || 'assets/data/';

function accessModal(item) {
  const cfg = window.MIKA_CONFIG || {};
  const c = cfg.contact || {};
  const wa = c.whatsappNumber ? `https://${c.whatsappDomain || 'wa.me'}/${c.whatsappNumber}?text=${encodeURIComponent(`Hi Mika I would like access to the ${item?.collectionTitle || 'full'} collection.`)}` : null;
  const tg = c.telegram ? `${c.telegram}?text=${encodeURIComponent('Hi Mika — I like your content and would like access.')}` : null;
  const mail = c.email ? `mailto:${c.email}?subject=${encodeURIComponent('Full gallery access request')}` : null;

  const wrap = document.createElement('div');
  wrap.className = 'lightbox access-modal';
  wrap.id = 'access-modal';
  wrap.innerHTML = `
    <div class="access-panel panel panel-pad" style="max-width:420px;width:90vw;text-align:center">
      <h3 style="font-size:1.5rem">See the real content</h3>
      <p class="muted" style="font-size:.9rem;margin-top:.6rem">This is a preview. Reach Mika directly for the full ${item?.collectionTitle || 'gallery'}.</p>
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

function tile(item) {
  const el = document.createElement('article');
  el.className = 'gallery-item';
  el.dataset.slug = item.slug;
  const src = item.urls.thumb || item.urls.blur;
  el.innerHTML = `
    <button class="item-open" aria-label="Preview — ${item.collectionTitle}"></button>
    <img src="${src}" alt="${item.collectionTitle || ''} teaser — Mika Creator" loading="lazy" draggable="false">
  `;
  el.querySelector('.item-open').addEventListener('click', () => {
    if (item.visibility === 'public') {
      const { openLightbox } = import('./lightbox.mjs');
      openLightbox([{
        collectionTitle: item.collectionTitle,
        collection: item.collection,
        urls: item.urls,
        visibility: 'public',
      }], 0);
    } else {
      accessModal(item);
    }
  });
  return el;
}

export async function initGallery() {
  const grid = $('#gallery-grid');
  if (!grid) return;
  const collection = document.body.dataset.collection;

  const res = await fetch(`${base}gallery.json`, { cache: 'no-cache' });
  if (!res.ok) { grid.innerHTML = '<p class="gallery-empty">The gallery is taking a quick breath — please refresh.</p>'; return; }
  const data = await res.json();

  const bySlug = new Map((data.assets || []).map((a) => [a.slug, a]));
  const colMeta = (data.collections || []).find((c) => c.slug === collection);

  const teaserSlugs = collection
    ? (colMeta?.teasers || [])
    : (data.collections || []).flatMap((c) => (c.teasers || []).slice(0, 1));

  const items = teaserSlugs.map((s) => bySlug.get(s)).filter(Boolean);

  if (!items.length) {
    grid.innerHTML = '<p class="gallery-empty">Curated previews are coming soon.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const a of items) {
    const el = tile(a);
    frag.appendChild(el);
    requestAnimationFrame(() => el.classList.add('revealed'));
  }
  grid.appendChild(frag);

  if (typeof window.MikaTrackGallery !== 'function') {
    window.MikaTrackGallery = (label) => window.gtag?.('event', 'view_item', { item_name: label });
  }
}
