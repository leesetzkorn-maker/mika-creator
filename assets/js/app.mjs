import './modules/ui.mjs';
import { initUI } from './modules/ui.mjs';
import { initTracking } from './modules/tracking.mjs';
import { initProtection } from './modules/protection.mjs';
import { initAgeGate } from './modules/age-gate.mjs';
import { initHero } from './modules/hero.mjs';
import { initLightbox } from './modules/lightbox.mjs';
import { initGallery } from './modules/gallery.mjs';
import { initLikes, initComments, initReviews } from './modules/community.mjs';
import { initAnalytics } from './modules/analytics.mjs';
import { initAdmin } from './modules/admin-dashboard.mjs';

function boot() {
  initUI();
  initTracking();
  initProtection();
  initAgeGate();
  initLightbox();
  initAnalytics();

  if (document.body.dataset.hero !== undefined) initHero();
  if (document.body.dataset.likes !== undefined) initLikes();
  if (document.body.dataset.comments !== undefined) initComments();
  if (document.body.dataset.reviews !== undefined) initReviews();
  if (document.body.dataset.gallery !== undefined) initGallery();
  if (document.body.dataset.admin !== undefined) initAdmin();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}