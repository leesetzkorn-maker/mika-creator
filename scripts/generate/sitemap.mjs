/**
 * Mika Creator — sitemap.xml + robots.txt generator
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, loadJson, GALLERY_JSON, SITE_JSON,
} from '../lib/fs.mjs';

export function generateSitemap() {
  const site = loadJson(SITE_JSON, null);
  const gallery = loadJson(GALLERY_JSON, { collections: [] });
  if (!site) throw new Error('site.json missing');
  const domain = site.brand.domain.replace(/\/$/, '');
  const now = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: '', changefreq: 'weekly', priority: '1.0' },
    { loc: '/gallery/', changefreq: 'daily', priority: '0.9' },
    { loc: '/connect/', changefreq: 'monthly', priority: '0.6' },
    { loc: '/terms/', changefreq: 'yearly', priority: '0.2' },
    { loc: '/privacy-18.html', changefreq: 'yearly', priority: '0.2' },
    ...gallery.collections.map((c) => ({ loc: `/gallery/${c.slug}/`, changefreq: 'daily', priority: '0.8' })),
  ];

  const body = urls
    .map((u) => `  <url>\n    <loc>${domain}${u.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join('\n');

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  fs.writeFileSync(
    path.join(ROOT, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /private/\nDisallow: /admin/\nDisallow: /gallery/*/index.html?raw=1\n\nSitemap: ${domain}/sitemap.xml\n`
  );
  console.log(`sitemap.xml + robots.txt → ${urls.length} URLs under ${domain}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    generateSitemap();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}