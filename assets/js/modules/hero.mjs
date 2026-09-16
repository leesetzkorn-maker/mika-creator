import { $ } from './ui.mjs';
import { isVerified } from './age-gate.mjs';

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

  const unlocked = isVerified();

  let idx = -1;
  let attempts = 0;
  const apply = (candidate) => {
    const sharp = candidate.sharpUrl || candidate.hero || '';
    if (sharp) bg.dataset.sharp = sharp;
    bg.style.backgroundImage = `url('${unlocked && sharp ? sharp : candidate.url}')`;
    bg.classList.toggle('is-blur', !unlocked && candidate.visibility !== 'public');
    hero.classList.add('loaded');
    hero.dataset.heroActive = candidate.slug;
    if (!unlocked && candidate.visibility !== 'public') {
      const note = $('#hero-preview-note');
      if (note) note.hidden = false;
    } else {
      const note = $('#hero-preview-note');
      if (note) note.hidden = true;
    }
  };

  const tryNext = () => {
    if (attempts >= candidates.length) {
      hero.classList.add('no-image');
      return;
    }
    attempts++;
    idx = (idx + 1) % candidates.length;
    const c = candidates[idx];
    const sharp = unlocked ? (c.sharpUrl || c.hero || '') : '';
    const preloadSrc = sharp || c.url;
    const img = new Image();
    img.onload = () => apply(c);
    img.onerror = tryNext;
    img.src = preloadSrc;
  };

  tryNext();

  document.addEventListener('mika:gate-passed', () => {
    const sharpSrc = bg.dataset.sharp;
    if (sharpSrc && bg.classList.contains('is-blur')) {
      bg.style.backgroundImage = `url('${sharpSrc}')`;
      bg.classList.remove('is-blur');
      const note = $('#hero-preview-note');
      if (note) note.hidden = true;
    }
  });
}