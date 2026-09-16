import { $, $$ } from './ui.mjs';

let items = [];
let current = -1;

export function openLightbox(items_, startIndex, { preview=false, alt='' } = {}) {
  items = items_;
  current = startIndex;
  show(preview, alt);
}

function show(preview, name) {
  const lb = $('#lightbox');
  if (!lb) return;
  const img = $('#lightbox-img');
  const cap = $('#lightbox-caption');
  const note = $('#lightbox-preview-note');
  const it = items[current];
  const gatePassed = document.body.classList.contains('gate-passed');

  const isPreviewItem = preview || !it || (it && it.visibility !== 'public');
  const locked = !gatePassed && isPreviewItem;

  if (!it?.urls) {
    img.src = '';
  } else if (locked) {
    img.src = it.urls.blur;
  } else if (isPreviewItem) {
    img.src = it.urls.sharp || it.urls.thumb || it.urls.blur;
  } else {
    img.src = it.urls.full || it.urls.sharp || it.urls.blur;
  }

  if (locked) {
    img.classList.add('preview');
    if (note) note.hidden = false;
  } else {
    img.classList.remove('preview');
    if (note) note.hidden = true;
  }
  const c = it?.collectionTitle || it?.collection || name;
  if (cap) cap.textContent = c ? `${c} — Mika Creator` : '';
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
  const lb = $('#lightbox');
  if (!lb) return;
  lb.classList.remove('open');
  document.body.style.overflow = '';
}

export function initLightbox() {
  const lb = $('#lightbox');
  if (!lb) return;

  $('#lightbox-close')?.addEventListener('click', closeLightbox);
  $('#lightbox-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (items.length) { current = (current - 1 + items.length) % items.length; show(); }
  });
  $('#lightbox-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (items.length) { current = (current + 1) % items.length; show(); }
  });
  lb.addEventListener('click', (e) => {
    if (e.target === lb) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && items.length) { current = (current - 1 + items.length) % items.length; show(); }
    if (e.key === 'ArrowRight' && items.length) { current = (current + 1) % items.length; show(); }
  });

  let sx = 0, sy = 0, dx = 0;
  lb.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  lb.addEventListener('touchmove', (e) => {
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  }, { passive: false });
  lb.addEventListener('touchend', () => {
    if (Math.abs(dx) > 60 && items.length) {
      current = (current + (dx < 0 ? 1 : -1) + items.length) % items.length;
      show();
    }
    dx = 0;
  });
}