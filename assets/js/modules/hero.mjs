import { $ } from './ui.mjs';
import { isVerified } from './age-gate.mjs';

const MOBILE_QUERY = '(max-width: 700px)';
const mq = () => window.matchMedia(MOBILE_QUERY);

export async function initHero() {
  const hero = $('#hero');
  const bg = $('#hero-bg');
  if (!hero || !bg) return;
  const url = window.MIKA_CONFIG?.assets?.base || 'assets/data/';

  let candidates = [];
  try {
    const res = await fetch(`${url}hero-candidates.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('hero fetch failed');
    candidates = (await res.json()).candidates || [];
  } catch {
    candidates = [];
  }

  if (!candidates.length) {
    hero.classList.add('no-image');
    hero.classList.add('loaded');
    return;
  }

  // Mobile uses a dedicated portrait derivative (9:16) so the subject stays
  // framed on phone viewports; desktop keeps the cinematic 16:9 hero crop.
  const sharpSrc = (c) => {
    const onMobile = mq().matches;
    return onMobile ? (c.mobile || c.sharpUrl || c.hero || '') : (c.sharpUrl || c.hero || '');
  };

  let idx = -1;
  let attempts = 0;
  const apply = (candidate) => {
    const unlocked = isVerified();
    const sharp = sharpSrc(candidate);
    if (sharp) bg.dataset.sharp = sharp;
    bg.style.backgroundImage = `url('${unlocked && sharp ? sharp : candidate.url}')`;
    bg.classList.toggle('is-blur', !unlocked && candidate.visibility !== 'public');
    hero.classList.add('loaded');
    hero.dataset.heroActive = candidate.slug;
    const note = $('#hero-preview-note');
    if (note) note.hidden = unlocked || candidate.visibility === 'public';
  };

  const tryNext = () => {
    if (attempts >= candidates.length) {
      hero.classList.add('no-image');
      return;
    }
    attempts++;
    idx = (idx + 1) % candidates.length;
    const c = candidates[idx];
    const sharp = sharpSrc(c);
    const preloadSrc = sharp || c.url;
    const img = new Image();
    img.onload = () => apply(c);
    img.onerror = tryNext;
    img.src = preloadSrc;
  };

  tryNext();

  const swapToSharp = () => {
    const sharp = bg.dataset.sharp;
    if (sharp && bg.classList.contains('is-blur') && isVerified()) {
      bg.style.backgroundImage = `url('${sharp}')`;
      bg.classList.remove('is-blur');
      const note = $('#hero-preview-note');
      if (note) note.hidden = true;
    }
  };

  document.addEventListener('mika:gate-passed', swapToSharp);

  // Swap derivative when the viewport crosses to/from mobile (no reload).
  mq().addEventListener('change', () => {
    const c = candidates[idx % candidates.length];
    if (!c) return;
    if (isVerified() && !bg.classList.contains('is-blur')) {
      const sharp = sharpSrc(c);
      if (sharp) {
        bg.dataset.sharp = sharp;
        bg.style.backgroundImage = `url('${sharp}')`;
      }
    } else {
      bg.dataset.sharp = sharpSrc(c);
    }
  });
}