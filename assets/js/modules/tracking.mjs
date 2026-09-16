export function initTracking() {
  const cfg = window.MIKA_CONFIG || {};
  if (!cfg.ga) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.ga}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', cfg.ga, { anonymize_ip: true, send_page_view: false });
  gtag('event', 'page_view', { page_title: document.title, page_location: location.href });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const url = a.href;
    if (!url.startsWith('http')) return;
    const same = url.startsWith(location.origin);
    if (!same) gtag('event', 'click', { event_category: 'outbound', event_label: url });
  }, { capture: true });
}