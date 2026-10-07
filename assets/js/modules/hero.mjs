import { $ } from './ui.mjs';
import { isVerified } from './age-gate.mjs';

const MOBILE_QUERY = '(max-width: 700px)';
const SLIDE_MS = 9000;
const mq = () => window.matchMedia(MOBILE_QUERY);
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

export async function initHero() {
  const hero = $('#hero');
  const bg = $('#hero-bg');
  if (!hero || !bg) return;
  const url = window.MIKA_CONFIG?.assets?.base || 'assets/data/';

  let candidates = [];
  try {
    const res = await fetch(`${url}gallery.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('hero fetch failed');
    const assets = (await res.json()).assets || [];
    const portrait = assets.find((asset) => asset.slug === 'mika-river-img-20260702-151220');
    candidates = portrait ? [{
      slug: portrait.slug,
      url: portrait.urls.blur,
      fallback: portrait.urls.blur,
      // Use the uncropped existing derivative: the landscape hero export
      // cuts away the upper part of this portrait.
      sharpUrl: portrait.urls.full,
      mobile: portrait.urls.full,
    }] : [];
  } catch {
    candidates = [];
  }

  if (!candidates.length) {
    hero.classList.add('no-image');
    hero.classList.add('loaded');
    return;
  }

  // Both layouts use the existing uncropped portrait. CSS controls its
  // positioning separately on desktop and mobile without altering the photo.
  const sharpSrc = (c) => {
    const onMobile = mq().matches;
    return onMobile ? (c.mobile || c.sharpUrl || c.hero || '') : (c.sharpUrl || c.hero || '');
  };
  const lockedSrc = (c) => c.url || c.fallback || c.blur || '';

  const prevBtn = $('#hero-prev');
  const nextBtn = $('#hero-next');
  const dotsWrap = $('#hero-dots');

  // Build the slide layers inside the existing hero-bg container so the
  // existing blur / lock / zoom behaviour keeps working as one unit.
  const slides = candidates.map((c) => {
    const layer = document.createElement('div');
    layer.className = 'hero-slide';
    layer.setAttribute('aria-hidden', 'true');
    bg.appendChild(layer);
    return layer;
  });

  const single = slides.length === 1;
  hero.classList.toggle('hero-single', single);

  const lock = () => !isVerified();

  const dots = [];
  if (dotsWrap) {
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero-dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1} of ${slides.length}`);
      dot.addEventListener('click', () => go(i));
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });
  }

  let idx = -1;
  let timer = null;

  const paint = (i) => {
    const c = candidates[i];
    const layer = slides[i];
    const src = lock() ? lockedSrc(c) : sharpSrc(c);
    if (!src) return false;
    if (layer.dataset.src !== src) {
      layer.dataset.src = src;
      layer.style.backgroundImage = `url('${src}')`;
    }
    return true;
  };

  const show = (i) => {
    if (slides[i] === slides[idx]) return;
    slides.forEach((l) => l.classList.remove('is-active'));
    if (slides[idx]) slides[idx].setAttribute('aria-hidden', 'true');
    slides[i].classList.add('is-active');
    slides[i].setAttribute('aria-hidden', 'false');
    idx = i;
    hero.dataset.heroActive = candidates[i].slug;
    dots.forEach((d, j) => {
      d.classList.toggle('is-active', j === i);
      if (j === i) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
    // Only fired when a slide actually becomes visible — never on re-render,
    // repaint or blur/sharp swaps, so no duplicate hero_slide_view events.
    window.MikaTrack?.('hero_slide_view', {
      slide_number: i + 1,
      slide_image: candidates[i].slug,
    });
    window.MikaDbTrack?.('hero_slide_view', {
      slide_number: i + 1,
      slide_image: candidates[i].slug,
      location: 'hero',
    });
  };

  const schedule = () => {
    clearTimeout(timer);
    if (single || reduceMotion()) return;
    timer = setTimeout(() => go((idx + 1) % slides.length), SLIDE_MS);
  };

  async function go(i) {
    clearTimeout(timer);
    const target = ((i % slides.length) + slides.length) % slides.length;
    const c = candidates[target];
    const src = lock() ? lockedSrc(c) : sharpSrc(c);
    if (src && paint(target)) {
      await loadImage(src).catch(() => {});
      if (slides[target] && !slides[target].classList.contains('is-active')) show(target);
    } else if (target !== idx) {
      show(target);
    }
    if (!hero.classList.contains('loaded')) hero.classList.add('loaded');
    schedule();
    // Warm the cache for the next slide so the crossfade is instant.
    const nxt = candidates[(target + 1) % slides.length];
    const nxtSrc = lock() ? lockedSrc(nxt) : sharpSrc(nxt);
    if (nxtSrc) loadImage(nxtSrc).catch(() => {});
  }

  // First slide loads before anything is shown; fall back across candidates
  // if one of them fails to decode.
  const activate = async (start) => {
    if (start >= candidates.length) {
      hero.classList.add('no-image', 'loaded');
      return;
    }
    const c = candidates[start];
    const src = lock() ? lockedSrc(c) : sharpSrc(c);
    try {
      await loadImage(src);
      paint(start);
      show(start);
      hero.classList.add('loaded');
      schedule();
    } catch {
      activate(start + 1);
    }
  };
  await activate(0);

  // Swap to sharp once the visitor passes the age gate.
  const swapToSharp = async () => {
    if (lock() || idx < 0) return;
    const src = sharpSrc(candidates[idx]);
    if (src) {
      await loadImage(src).catch(() => {});
      paint(idx);
    }
  };
  document.addEventListener('mika:gate-passed', swapToSharp);

  // Swap derivative when the viewport crosses to/from mobile (no reload).
  mq().addEventListener('change', () => {
    if (idx < 0) return;
    const c = candidates[idx];
    if (lock()) {
      bg.classList.add('is-blur');
    } else {
      const src = sharpSrc(c);
      if (src) {
        loadImage(src).catch(() => {});
        bg.classList.remove('is-blur');
        paint(idx);
      }
    }
  });

  const inView = () => {
    const r = hero.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  };

  const total = slides.length;
  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.MikaTrack?.('hero_previous_click', {
      current_slide: idx + 1,
      previous_slide: ((idx - 1 + total) % total) + 1,
    });
    go(idx - 1);
  });
  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.MikaTrack?.('hero_next_click', {
      current_slide: idx + 1,
      next_slide: ((idx + 1) % total) + 1,
    });
    go(idx + 1);
  });

  document.addEventListener('keydown', (e) => {
    if (!inView()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
  });

  // Pause advancing while the tab is hidden; resume on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else schedule();
  });

  // Initial lock state: if the visitor is already verified on load the bg
  // should render sharp from the start.
  if (!lock()) bg.classList.remove('is-blur');
}
