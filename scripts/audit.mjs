/**
 * Mika Creator — production audit
 * Runs a battery of checks against the built site. Exits non-zero on FAIL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, loadJson } from './lib/fs.mjs';

let fails = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) fails++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
}
function allFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) allFiles(p, exts, out);
    else if (exts.includes(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out;
}

const htmlFiles = allFiles(ROOT, ['.html']).filter((p) => !p.includes(`${path.sep}node_modules${path.sep}`));
const jsFiles = allFiles(path.join(ROOT, 'assets', 'js'), ['.mjs', '.js']);
const pubCss = allFiles(path.join(ROOT, 'assets', 'css'), ['.css']);

console.log('\n== 1. forbidden content ==');
{
  const forbidden = ['booking', 'localhost', '127.0.0.1', ':4173'];
  for (const term of forbidden) {
    const hits = htmlFiles.filter((f) => fs.readFileSync(f, 'utf8').toLowerCase().includes(term));
    check(`html contains no "${term}"`, hits.length === 0, hits.map((h) => path.relative(ROOT, h)).join(', '));
  }
}

console.log('\n== 2. secrets ==');
{
  const secretPatterns = [
    /\bsb_secret_[A-Za-z0-9_\-]+\b/, /\bservice_role\b/, /AI_OPENAI_.*KEY|sk-[A-Za-z0-9]{20}/,
    /AWS_SECRET_ACCESS_KEY\s*[:=]\s*\S/, /SIGHTENGINE_API_[A-Z]+_KEY\s*[:=]\s*\S/,
  ];
  const scan = [...htmlFiles, ...jsFiles, ...pubCss, path.join(ROOT, 'assets', 'data', 'site.json')];
  const leaked = [];
  for (const f of scan) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of secretPatterns) if (re.test(src)) { leaked.push(path.relative(ROOT, f)); break; }
  }
  check('no secret material in public files', leaked.length === 0, leaked.join(', '));
  check('anon key is the publishable one', loadJson(path.join(ROOT, 'assets', 'data', 'site.json'))?.supabase?.anonKey?.startsWith('sb_publishable_'), 'key: sb_publishable_…');
}

console.log('\n== 3. no original/private exposure in public payload ==');
{
  const pub = [path.join(ROOT, 'assets', 'data', 'gallery.json'), path.join(ROOT, 'assets', 'data', 'hero-candidates.json')];
  const leaked = [];
  for (const f of pub) {
    const s = fs.readFileSync(f, 'utf8');
    if (/\/originals\//.test(s) || /private\//.test(s) || /\.jpg"|\.jpeg"/.test(s)) leaked.push(path.relative(ROOT, f));
  }
  check('gallery.json / hero-candidates.json expose no original paths', leaked.length === 0, leaked.join(', '));
  const g = loadJson(path.join(ROOT, 'assets', 'data', 'gallery.json'));
  const badUrls = (g.assets || []).flatMap((a) =>
    ['thumb', 'full', 'hero', 'blur'].filter((k) => !/^\/assets\/images\/[^/]+\/[a-z0-9.\-]+\.(webp|jpg)$/.test(a.urls?.[k] || ''))
  );
  check('all asset URLs match public webp/jpg pattern', badUrls.length === 0, `${badUrls.length} bad`);
}

console.log('\n== 4. asset integrity on disk ==');
{
  const g = loadJson(path.join(ROOT, 'assets', 'data', 'gallery.json'));
  const missing = [];
  const seen = new Set();
  for (const a of g.assets || []) {
    for (const k of ['thumb', 'full', 'hero', 'blur']) {
      const p = path.join(ROOT, a.urls[k]);
      if (!fs.existsSync(p)) missing.push(a.urls[k]);
    }
  }
  check(`all gallery derivative files exist (${(g.assets || []).length * 4} check-points)`, missing.length === 0, missing.slice(0, 10).join(', '));
  const h = loadJson(path.join(ROOT, 'assets', 'data', 'hero-candidates.json'));
  const hMissing = (h.candidates || []).flatMap((c) => [c.url, c.fallback, c.thumb]).filter((u) => !fs.existsSync(path.join(ROOT, u)));
  check(`all hero candidate urls exist (${(h.candidates || []).length} candidates × url/fallback/thumb)`, hMissing.length === 0, hMissing.join(', '));
  check('hero candidates within maxCandidates', (h.candidates || []).length <= (h.maxCandidates || 8));
  check('hero strategy documented', !!h.strategy);
}

console.log('\n== 5. blur & metadata sampling ==');
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const sharp = req('sharp');
  const g = loadJson(path.join(ROOT, 'assets', 'data', 'gallery.json'));
  const sample = (g.assets || []).filter((a) => a.visibility !== 'public').slice(0, 8);
  const lapVar = async (file) => {
    const raw = await sharp(file).resize(320).greyscale().raw().toBuffer();
    let acc = 0, acc2 = 0, n = 0;
    for (let i = 321; i < raw.length - 321; i++) {
      const v = 4 * raw[i] - raw[i - 1] - raw[i + 1] - raw[i - 320] - raw[i + 320];
      acc += v; acc2 += v * v; n++;
    }
    const m = acc / n;
    return acc2 / n - m * m;
  };
  let blurOk = 0, metaOk = 0;
  for (const a of sample) {
    const ratio = (await lapVar(path.join(ROOT, a.urls.blur))) / Math.max(1, await lapVar(path.join(ROOT, a.urls.thumb)));
    if (ratio < 0.35) blurOk++;
    const meta = await sharp(path.join(ROOT, a.urls.full)).metadata();
    if (!meta.exif && !meta.orientation) metaOk++;
  }
  check(`sample blur variants are ≥ ~3× softer than their thumbs (${blurOk}/${sample.length})`, blurOk === sample.length);
  check(`sample full variants have EXIF stripped (${metaOk}/${sample.length})`, metaOk === sample.length);
}

console.log('\n== 6. html structure ==');
{
  let dupFails = 0, missingRefs = 0;
  const refDetail = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const ids = [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dups = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dups.length) { dupFails++; console.log(`    dup ids in ${path.relative(ROOT, f)}: ${[...new Set(dups)].join(', ')}`); }

    // local references
    const dir = path.dirname(f);
    const refs = [...src.matchAll(/\b(?:src|href)="([^"#][^"]*?)"/g)].map((m) => m[1]);
    for (const r of refs) {
      if (/^(https?:|data:|mailto:|tel:|#|\/)/.test(r)) continue;
      const target = path.resolve(dir, r.split('?')[0]);
      if (!fs.existsSync(target)) { missingRefs++; refDetail.push(`${path.relative(ROOT, f)} → ${r}`); }
    }
    for (const tag of ['rating', 'RATING']) {
      if (tag === 'rating' && !/name="rating" content="adult"/.test(src)) { missingRefs++; refDetail.push(`missing rating meta: ${path.relative(ROOT, f)}`); }
      if (tag === 'RATING' && !/name="RATING" content="RTA-/.test(src)) { missingRefs++; refDetail.push(`missing RTA meta: ${path.relative(ROOT, f)}`); }
    }
    if (!/<link rel="canonical" /.test(src)) { missingRefs++; refDetail.push(`missing canonical: ${path.relative(ROOT, f)}`); }
    const isRedirect = /http-equiv="refresh"/.test(src);
    if (!/window\.MIKA_CONFIG/.test(src) && !isRedirect) refDetail.push(`missing config: ${path.relative(ROOT, f)}`);
  }
  check(`no duplicate element ids (${htmlFiles.length} pages)`, dupFails === 0);
  check('no broken local refs; rating/RTA/canonical present on every page', missingRefs === 0, refDetail.slice(0, 8).join(' | '));
}

console.log('\n== 7. sitemap / robots ==');
{
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const broken = locs.filter((u) => {
    const p = new URL(u).pathname;
    const t = path.join(ROOT, p === '/' ? 'index.html' : p.replace(/\/$/, '/index.html'));
    return !fs.existsSync(t);
  });
  check(`sitemap lists ${locs.length} URLs, all exist locally`, broken.length === 0, broken.join(', '));
  const rb = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  check('robots.txt allows crawling + lists sitemap', rb.includes('Allow: /') && rb.includes('Sitemap:'));
}

console.log('\n== 8. build reproducibility ==');
{
  const before = htmlFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]);
  execSync('node scripts/build.mjs', { cwd: ROOT, encoding: 'utf8' });
  let changed = 0;
  for (const [f, data] of before) if (fs.readFileSync(f, 'utf8') !== data) changed++;
  check('rebuild is deterministic (no diffs in HTML)', changed === 0, `${changed} changed`);
}

console.log('\n== 9. git hygiene ==');
{
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  check('.gitignore protects private/ and .env', /private\//.test(gi) && /\.env/.test(gi), '');
  check('CNAME intact', fs.existsSync(path.join(ROOT, 'CNAME')) && fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').includes('mikacreator.co.za'));
}

console.log('\n== 10. module syntax ==');
{
  let bad = 0;
  for (const f of jsFiles) {
    try { execSync(`node --check "${f}"`, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }); }
    catch { bad++; console.log(`    syntax error: ${path.relative(ROOT, f)}`); }
  }
  check(`all ${jsFiles.length} frontend modules parse`, bad === 0);
}

console.log(`\nAUDIT RESULT: ${fails === 0 ? 'ALL PASS ✓' : fails + ' FAILURE(S)'}`);
process.exit(fails === 0 ? 0 : 1);