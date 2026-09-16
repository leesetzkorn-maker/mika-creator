export function initProtection() {
  const isImage = (t) => t && t.tagName === 'IMG';
  document.addEventListener('contextmenu', (e) => {
    if (isImage(e.target)) {
      e.preventDefault();
      window.MikaToast?.(siteText('Please enjoy the view — downloads are disabled for creators.'));
    }
  });
  document.addEventListener('dragstart', (e) => {
    if (isImage(e.target)) e.preventDefault();
  });
  document.addEventListener('copy', (e) => {
    if (isImage(e.target)) e.preventDefault();
  });
}

function siteText(msg) {
  return msg;
}