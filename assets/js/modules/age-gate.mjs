import { $ } from './ui.mjs';

const KEY = 'mika_age_verified';
const MAX_MS = 30 * 24 * 60 * 60 * 1000;

export function isVerified() {
  try {
    const rec = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!rec || !rec.verified) return false;
    return Date.now() - rec.at < MAX_MS;
  } catch {
    return false;
  }
}

export function verify() {
  localStorage.setItem(KEY, JSON.stringify({ verified: true, at: Date.now() }));
  document.dispatchEvent(new CustomEvent('mika:gate-passed'));
}

export function initAgeGate() {
  const gate = $('#age-gate');
  if (!gate) return;
  if (isVerified()) {
    gate.remove();
    document.body.classList.add('gate-passed');
    return;
  }
  gate.classList.add('show');
  document.body.style.overflow = 'hidden';

  const pass = () => {
    verify();
    gate.classList.remove('show');
    document.body.style.overflow = '';
    document.body.classList.add('gate-passed');
    setTimeout(() => gate.remove(), 600);
  };
  $('#age-gate .btn-age-yes')?.addEventListener('click', pass);
  $('#age-gate .btn-age-no')?.addEventListener('click', () => {
    gate.classList.add('declined');
    document.title = 'You must be 18+ to continue';
    const card = $('#age-gate .age-gate-card');
    if (card) {
      card.innerHTML =
        '<p class="lead">We take this seriously.</p>' +
        '<p class="muted" style="margin-top:.6rem">This website is for adults only.<br>Please come back when you are 18 or older.</p>';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && gate.classList.contains('show') && !gate.classList.contains('declined')) pass();
  });

  const cfg = window.MIKA_CONFIG || {};
  if (cfg.contact?.whatsappDomain && cfg.contact?.whatsappNumber) {
    $('#age-gate .btn-contact-whatsapp')?.setAttribute(
      'href',
      `https://${cfg.contact.whatsappDomain}/${cfg.contact.whatsappNumber}`
    );
  }
}