export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function initUI() {
  const header = $('#site-header');
  const toggle = $('.nav-toggle');
  const menu = $('#mobile-menu');

  // Use the cards' EXISTING WhatsApp links when visitors tap unused photo/text space.
  // No markup, pricing, imagery or layout is changed. Links/buttons inside the
  // cards keep their own behaviour and take precedence.
  $$('.vc-card, .pkg-card').forEach((card) => {
    const primary = card.querySelector('a[data-conversion][href^="https://wa.me/"]');
    if (!primary) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.target.closest('a, button, input, textarea, select, label, [role="button"]')) return;
      if (window.getSelection?.()?.toString()) return;
      primary.click();
    });
  });

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

  if (!document.body.matches('[data-admin], [data-admin-login]')) {
    const updateMenu = () => { const open = menu?.classList.contains('open'); menu?.setAttribute('aria-hidden', String(!open)); if (menu) menu.inert = !open; };
    updateMenu(); toggle?.addEventListener('click', updateMenu);
    $$('.mobile-menu a').forEach(a => a.addEventListener('click', updateMenu));
    document.addEventListener('keydown', e => { if(e.key === 'Escape') updateMenu(); });
    window.matchMedia('(min-width:901px)').addEventListener('change', e => { if(e.matches) { setMenu(false); updateMenu(); } });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => entries.forEach(e => { if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target);} }), {threshold: .08});
      $$('.section-head, .vc-card, .pkg-card, .persona, .cta-strip').forEach(el => {el.classList.add('reveal-pending');observer.observe(el);});
    }
  }
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
