// Thirty calendar days: 13 October through 11 November 2026 (South Africa).
const START = Date.parse('2026-10-13T00:00:00+02:00');
const END = Date.parse('2026-11-12T00:00:00+02:00');
const PRICES = {R400:'R300',R550:'R450',R700:'R600',R1000:'R900',R450:'R350'};
const discount = text => text.replace(/R(?:1000|700|550|450|400)\b/g, price => PRICES[price]);

export function initSpecials() {
  if (Date.now() < START || Date.now() >= END || document.body.matches('[data-admin], [data-admin-login]')) return;
  const undo = [];
  const services = window.MIKA_CONFIG?.services;
  for (const item of [...(services?.packages || []), ...(services?.videoCall ? [services.videoCall] : [])]) {
    const original = item.price;
    item.price = discount(original);
    undo.push(() => { item.price = original; });
  }
  const root = document.querySelector('main');
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style')) continue;
    nodes.push(node);
  }
  const originalPrices = [...root.querySelectorAll('#video-call .vc-price, #packages .pkg-price')].map(el => [el,el.textContent.trim()]);
  for (const node of nodes) {
    const original = node.textContent;
    const changed = discount(original);
    if (changed === original) continue;
    node.textContent = changed;
    undo.push(() => { node.textContent = original; });
  }
  for (const link of root.querySelectorAll('a[href*="wa.me/"]')) {
    const original = link.getAttribute('href');
    const url = new URL(original, location.href);
    const message = url.searchParams.get('text');
    if (!message || discount(message) === message) continue;
    url.searchParams.set('text', discount(message));
    link.setAttribute('href', url.toString());
    undo.push(() => link.setAttribute('href', original));
  }
  const added = [];
  for (const [el,price] of originalPrices) {
    const old = document.createElement('del');
    old.textContent = price;
    old.style.cssText = 'font-size:.48em;opacity:.65;margin-right:12px;';
    el.prepend(old);
    added.push(old);
  }
  for (const selector of ['#video-call .vc-booking > .eyebrow', '#packages .section-head .eyebrow']) {
    const label = root.querySelector(selector);
    if (!label) continue;
    const original = label.textContent;
    label.textContent = '30-DAY SPECIAL · SAVE R100';
    undo.push(() => { label.textContent = original; });
  }
  for (const section of root.querySelectorAll('#video-call .vc-booking, #packages .section-head')) {
    const note = document.createElement('p');
    note.className = 'cta-note';
    note.textContent = '13 October – 11 November 2026 · R100 off video calls and every content package.';
    section.append(note);
    added.push(note);
  }
  const timer = setInterval(() => {
    if (Date.now() < END) return;
    added.forEach(el => el.remove());
    undo.reverse().forEach(restore => restore());
    clearInterval(timer);
  }, 60000);
}
