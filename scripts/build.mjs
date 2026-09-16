/**
 * Mika Creator — build orchestrator
 * 1) gallery data (gallery.json, hero-candidates.json, site.json copy)
 * 2) all HTML pages
 * 3) sitemap.xml + robots.txt
 */
import { fileURLToPath } from 'node:url';
import { generateGalleryData } from './generate/gallery.mjs';
import { generateSitemap } from './generate/sitemap.mjs';
import { renderAll } from './pages.mjs';

export function build() {
  console.log('— data —');
  generateGalleryData();
  console.log('— pages —');
  renderAll();
  console.log('— sitemap —');
  generateSitemap();
  console.log('build complete ✓');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { build(); } catch (e) { console.error(e); process.exit(1); }
}