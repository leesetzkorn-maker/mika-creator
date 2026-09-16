export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function initUI() {
  const header = $('#site-header');
  const toggle = $('.nav-toggle');
  const menu = $('#mobile-menu');

  const onScroll = () => {
    header?.classList.toggle('scrolled', window.scrollY > 24);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setMenu = (open) => {
    menu?.classList.toggle('open', open);
    toggle?.classList.toggle('open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle?.addEventListener('click', () => setMenu(!menu?.classList.contains('open')));

  $$('.mobile-menu a, .mobile-menu .btn').forEach((a) =>
    a.addEventListener('click', () => setMenu(false))
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });

  let toastTimer;
  const toast = $('#toast');
  window.MikaToast = (msg, kind = '') => {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  };

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}