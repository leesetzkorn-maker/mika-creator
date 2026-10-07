// Admin dashboard (/admin/). Protected: with no valid session it bounces to
// /admin/login/ and renders nothing. The login form lives in admin-login.mjs
// on its own page — this module never draws one.
import { $, $$ } from './ui.mjs';
import { ensureFreshSession, clearSession, getSession, adminRpc, classifyAdminError, sessionClaims, checkIsAdmin, parseIsAdmin } from './admin-auth.mjs';

const LOGIN_PATH = '/admin/login/';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n) => Number(n || 0).toLocaleString('en-ZA');
const pct = (n, t) => (t ? Math.round((Number(n) / Number(t)) * 100) : 0);

function errorContext(error) {
  return [error?.status ? `HTTP ${error.status}` : '', error?.code, error?.rpc].filter(Boolean).join(' · ');
}

function adminErrorMarkup(error, section, note = '') {
  const classified = classifyAdminError(error);
  const extra = [error?.details, error?.hint, note].filter(Boolean).join(' ');
  const context = errorContext(error);
  return `<div class="admin-error" role="alert" data-error-kind="${esc(classified.kind)}">
    <strong>${esc(classified.title)} — ${esc(section)}</strong>
    <p>${esc(classified.message)}</p>
    ${context ? `<small>${esc(context)}</small>` : ''}
    ${extra ? `<details open><summary>Database details</summary><p>${esc(extra)}</p></details>` : ''}
  </div>`;
}

async function describeAdminAccess() {
  try {
    const allowed = parseIsAdmin(await adminRpc('is_admin'));
    return allowed
      ? 'is_admin() returned true for this session. The failing RPC is missing from the API schema cache or its signature does not match the call.'
      : 'is_admin() returned false. This Auth user is signed in but is not listed in admin_users.';
  } catch (e) {
    const kind = classifyAdminError(e).kind;
    if (kind === 'unauthenticated') throw e;
    if (kind === 'unauthorized') return 'is_admin() rejected this session as unauthorized.';
    if (kind === 'schema_cache' || kind === 'missing_object') {
      return `is_admin() is also invisible to PostgREST (${e.code || e.status}). The API schema cache does not expose admin functions to this JWT role.`;
    }
    return `is_admin() probe failed: ${e.message || kind}`;
  }
}

function notifyAdminActionError(error, action) {
  const classified = classifyAdminError(error);
  if (classified.kind === 'unauthenticated') {
    window.MikaToast?.('Session expired — sign in again.', 'err');
    toLogin();
    return;
  }
  const context = errorContext(error);
  window.MikaToast?.(`${classified.title}: ${action}. ${classified.message}${context ? ` (${context})` : ''}`, 'err');
}

function fmtDay(day) {
  try { return new Date(day + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); } catch { return day; }
}

function card(label, value, sub = '', accent = false) {
  return `<div class="stat-card ${accent ? 'accent' : ''}"><div class="stat-value">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
}

function barChart(days) {
  if (!days?.length) return '<p class="muted admin-empty">No page views yet.</p>';
  const max = Math.max(...days.map((d) => d.visitors || 0), 1);
  return `<div class="bar-chart">${days.map((d) => `
    <div class="bar-col" title="${fmtDay(d.day)} — ${fmt(d.visitors)} visitors, ${fmt(d.page_views)} page views">
      <div class="bar${d.visitors ? '' : ' is-empty'}" style="height:${d.visitors ? Math.max(4, Math.round((d.visitors / max) * 100)) : 0}%"></div>
      <div class="bar-label">${fmtDay(d.day)}</div>
      <div class="bar-meta" aria-label="${fmt(d.page_views)} page views">${fmt(d.page_views)} pv</div>
    </div>`).join('')}</div>`;
}

function dailyTable(days) {
  if (!days?.length) return '';
  return `<div class="adm-table-wrap" style="margin-top:1rem"><table class="adm-table">
    <thead><tr><th>Day</th><th>Visitors</th><th>Page views</th><th>Sessions</th></tr></thead>
    <tbody>${days.map((d) => `
      <tr>
        <td>${esc(fmtDay(d.day))}</td>
        <td>${fmt(d.visitors)}</td>
        <td>${fmt(d.page_views)}</td>
        <td>${fmt(d.sessions)}</td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

function eventBreakdown(rows, engagement) {
  const fromRpc = Array.isArray(rows) && rows.length
    ? rows.map((r) => [r.event_type, r.count])
    : [];
  const fromEng = [
    ['whatsapp_click', engagement.whatsapp_clicks],
    ['video_call_click', engagement.video_call_clicks],
    ['content_click', engagement.content_clicks],
    ['gallery_click', engagement.gallery_clicks],
    ['gallery_open', engagement.gallery_opens],
    ['enquiry_click', engagement.enquiry_clicks],
    ['lead_submit', engagement.lead_submits],
    ['generate_lead', engagement.generate_lead],
    ['telegram_click', engagement.telegram_clicks],
    ['cta_click', engagement.cta_clicks],
    ['session_start', engagement.sessions],
  ].filter(([, n]) => Number(n) > 0);
  const list = fromRpc.length ? fromRpc : fromEng;
  if (!list.length) return '<p class="muted admin-empty">No events recorded yet.</p>';
  const total = list.reduce((a, [, n]) => a + Number(n || 0), 0);
  return `<ul class="admin-list">${list.map(([name, n]) => `<li>${esc(name)} <span class="pct-num">${fmt(n)}</span></li>`).join('')}</ul>
    <p class="admin-hint">${fmt(total)} events in this range</p>`;
}

function listBlock(title, rows, empty = 'Nothing here yet.') {
  return `<div class="admin-panel">
    <h3>${title}</h3>
    ${rows?.length ? `<ul class="admin-list">${rows.map((r) => `<li>${r}</li>`).join('')}</ul>` : `<p class="muted admin-empty">${empty}</p>`}
  </div>`;
}

function fmtPctBar(v, total) {
  const w = Math.max(2, pct(v, total));
  return `<div class="pct-row"><span class="pct-label">${esc(v)}</span><div class="pct-track"><div class="pct-fill" style="width:${w}%"></div></div><span class="pct-num">${fmt(total)}</span></div>`;
}

function renderStats(s) {
  const eng = s.engagement || {};
  const todayCard = document.getElementById('admin-today');
  const day = new Date().toISOString().slice(0, 10);
  const today = (s.daily || []).find((d) => String(d.day).slice(0, 10) === day);
  const viewsToday = s.page_views_today ?? today?.page_views ?? 0;
  const visitorsToday = s.visitors_today ?? today?.visitors ?? 0;
  const sessionsToday = s.sessions_today ?? today?.sessions ?? 0;
  if (todayCard) {
    todayCard.innerHTML = card(
      'Page views today',
      fmt(viewsToday),
      `${fmt(visitorsToday)} visitors · ${fmt(sessionsToday)} sessions`,
      true,
    );
  }
  return `
    ${card('Page views (7 days)', fmt(s.page_views_7d ?? s.total_page_views), `${fmt(s.visitors_7d ?? s.total_visitors)} visitors · ${fmt(s.sessions_7d ?? s.total_sessions)} sessions`)}
    ${card('Page views (30 days)', fmt(s.page_views_30d), `${fmt(s.visitors_30d)} visitors · ${fmt(s.sessions_30d)} sessions`)}
    ${card('Visitors (7 days)', fmt(s.visitors_7d ?? s.total_visitors), `${fmt(s.sessions_7d ?? s.total_sessions)} sessions`)}
    ${card('Visitors (30 days)', fmt(s.visitors_30d), `${fmt(s.sessions_30d)} sessions`)}
    ${card('WhatsApp clicks', fmt(eng.whatsapp_clicks))}
    ${card('Video Call clicks', fmt(eng.video_call_clicks))}
    ${card('Content clicks', fmt(eng.content_clicks))}
    ${card('Gallery clicks', fmt(eng.gallery_clicks))}
    ${card('Enquiry clicks', fmt(eng.enquiry_clicks))}
    ${card('Leads', fmt(Number(eng.lead_submits) || Number(eng.generate_lead) || 0))}
  `;
}

function renderModeration(rows) {
  const wrap = $('#admin-moderation');
  if (!wrap) return;
  if (!rows?.length) {
    wrap.innerHTML = '<p class="muted admin-empty">No comments awaiting moderation.</p>';
    return;
  }
  wrap.innerHTML = `<div class="admin-list">${rows.map((c) => `
    <div class="mod-item" data-id="${c.id}">
      <div class="mod-head">
        <span class="comment-name">${esc(c.name)}</span>
        <span class="comment-time">${new Date(c.created_at).toLocaleString()}</span>
        <span class="mod-scope">${esc(c.object_type)} / ${esc(c.object_id)}</span>
      </div>
      <p class="mod-text">${esc(c.text)}</p>
      <div class="mod-actions">
        <button class="btn btn-primary" data-act="approve">Approve</button>
        <button class="btn btn-ghost" data-act="reject">Hide</button>
      </div>
    </div>`).join('')}</div>`;
  $$('[data-act]', wrap).forEach((b) => {
    b.addEventListener('click', async () => {
      const item = b.closest('.mod-item');
      const id = item.dataset.id;
      const status = b.dataset.act === 'approve' ? 'approved' : 'rejected';
      const btn = b;
      btn.disabled = true;
      try {
        await adminRpc('admin_moderate_comment', { p_comment_id: id, p_status: status });
        window.MikaToast?.(status === 'approved' ? 'Comment approved.' : 'Comment hidden.', status === 'approved' ? 'ok' : undefined);
        item.remove();
      } catch (e) {
        notifyAdminActionError(e, 'comment moderation');
        btn.disabled = false;
      }
    });
  });
}

// A 401 from any admin RPC means the access token is gone or the user is no
// longer an admin. The session is unusable, so drop it and send them to the
// dedicated login page rather than rendering a dead dashboard.
function toLogin() {
  clearSession();
  window.location.replace(LOGIN_PATH);
}

function renderUnauthorized(email) {
  const view = $('#admin-view');
  if (!view) return;
  view.hidden = false;
  view.dataset.loaded = '1';
  view.dataset.gate = 'denied';
  view.innerHTML = `<div class="admin-error" role="alert" data-error-kind="unauthorized">
    <strong>Authenticated, not authorized</strong>
    <p>Signed in as ${esc(email || 'this account')}. This Auth user is not listed in admin_users, so private analytics, leads, conversions and moderation stay hidden.</p>
  </div>`;
}

async function loadDashboard() {
  const session = await ensureFreshSession();
  if (!session) { toLogin(); return; }
  const view = $('#admin-view');
  if (!view) { toLogin(); return; }
  if (view.dataset.loaded) return;
  view.dataset.loaded = '1';

  const statsEl = $('#admin-stats');
  const todayEl = $('#admin-today');
  const chartEl = $('#admin-chart');
  const pagesEl = $('#admin-pages');
  const devicesEl = $('#admin-devices');
  const sourcesEl = $('#admin-sources');
  const engEl = $('#admin-engagement');
  const nameEl = $('#admin-name');
  const claims = sessionClaims(session);
  const email = claims.email || session.user?.email || '';
  if (nameEl) nameEl.textContent = email || 'Admin';

  view.hidden = true;
  try {
    const allowed = await checkIsAdmin();
    if (!allowed) {
      renderUnauthorized(email);
      return;
    }
  } catch (e) {
    const classified = classifyAdminError(e);
    if (classified.kind === 'unauthenticated') { toLogin(); return; }
    if (classified.kind === 'unauthorized' || classified.kind === 'permission') {
      renderUnauthorized(email);
      return;
    }
    view.hidden = false;
    view.dataset.gate = 'denied';
    view.innerHTML = adminErrorMarkup(e, 'admin authorization', 'Private analytics were not loaded because is_admin() could not be verified.');
    return;
  }
  view.hidden = false;

  for (const el of [todayEl, statsEl, chartEl, pagesEl, devicesEl, sourcesEl, engEl]) {
    if (el) el.replaceChildren();
  }

  try {
    const s = await adminRpc('admin_get_stats', { p_days: 7 });
    let daily = s.daily || [];
    let breakdown = null;
    try { daily = await adminRpc('admin_daily_traffic', { p_days: 7 }) || daily; } catch (inner) {
      if (classifyAdminError(inner).kind === 'unauthenticated') { toLogin(); return; }
    }
    try { breakdown = await adminRpc('admin_event_breakdown', { p_days: 7 }); } catch (inner) {
      if (classifyAdminError(inner).kind === 'unauthenticated') { toLogin(); return; }
    }
    if (statsEl) statsEl.innerHTML = renderStats(s);
    if (chartEl) chartEl.innerHTML = `${barChart(daily)}${dailyTable(daily)}`;
    if (pagesEl) pagesEl.innerHTML = listBlock('Top pages', (s.top_pages || []).map((p) => `${esc(p.path)} <span class="pct-num">${fmt(p.views)}</span>`), 'No page views recorded yet.');
    const devTotal = (s.devices || []).reduce((a, d) => a + d.count, 0);
    if (devicesEl) devicesEl.innerHTML = listBlock('Devices', (s.devices || []).map((d) => fmtPctBar(`${d.device} (${fmt(d.count)})`, devTotal)), 'No data collected yet.');
    const srcTotal = (s.traffic_sources || []).reduce((a, d) => a + d.count, 0);
    if (sourcesEl) sourcesEl.innerHTML = listBlock('Traffic sources', (s.traffic_sources || []).map((d) => fmtPctBar(d.source, srcTotal)), 'No traffic recorded yet.');
    const eng = s.engagement || {};
    if (engEl) {
      const trackedEvents = [
        ['WhatsApp clicks', eng.whatsapp_clicks],
        ['Video Call clicks', eng.video_call_clicks],
        ['Content clicks', eng.content_clicks],
        ['Gallery clicks', eng.gallery_clicks],
        ['Enquiry clicks', eng.enquiry_clicks],
        ['Lead submits', eng.lead_submits],
        ['Telegram clicks', eng.telegram_clicks],
        ['Email clicks', eng.email_clicks],
        ['Gallery opens', eng.gallery_opens],
        ['CTA clicks', eng.cta_clicks],
        ['Pricing views', eng.pricing_views],
        ['Custom request clicks', eng.custom_request_clicks],
        ['Leads generated', eng.generate_lead],
        ['Hero slide views', eng.hero_slide_views],
        ['Likes', eng.likes],
        ['Reviews', eng.reviews],
      ];
      engEl.innerHTML = `<div class="admin-panel"><h3>Tracked events <span class="admin-hint">last 7 days</span></h3><div class="eng-row">${trackedEvents.map(([label, value]) => card(label, fmt(value))).join('')}</div>
        <h3 style="margin-top:1.4rem">Event breakdown</h3>
        ${eventBreakdown(breakdown, eng)}
      </div>`;
    }
  } catch (e) {
    const classified = classifyAdminError(e);
    if (classified.kind === 'unauthenticated') { toLogin(); return; }
    let note = '';
    try { note = await describeAdminAccess(); } catch (probe) {
      if (classifyAdminError(probe).kind === 'unauthenticated') { toLogin(); return; }
    }
    if (statsEl) statsEl.innerHTML = adminErrorMarkup(e, 'analytics', note);
    for (const el of [todayEl, chartEl, pagesEl, devicesEl, sourcesEl, engEl]) {
      if (el) el.innerHTML = '<p class="muted admin-empty">Analytics unavailable; see the error above.</p>';
    }
  }

  const moderation = $('#admin-moderation');
  if (moderation) moderation.innerHTML = '<p class="muted admin-empty">Loading comments…</p>';
  try {
    const rows = await adminRpc('admin_list_comments', { p_status: 'pending', p_limit: 50 });
    renderModeration(rows);
  } catch (e) {
    const classified = classifyAdminError(e);
    if (classified.kind === 'unauthenticated') { toLogin(); return; }
    const mod = $('#admin-moderation');
    if (mod) mod.innerHTML = adminErrorMarkup(e, 'comment moderation');
  }

  loadConversions();
}

/* ---------------- LEADS & CONVERSIONS ---------------- */

const STATUSES = ['new', 'contacted', 'interested', 'paid', 'completed', 'lost'];
const STATUS_LABEL = { new: 'New', contacted: 'Contacted', interested: 'Interested', paid: 'Paid', completed: 'Completed', lost: 'Lost' };
let leadFilter = 'all';

const money = (n) => `R ${Number(n || 0).toLocaleString('en-ZA')}`;
const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
const statusPill = (s) => `<span class="lead-status is-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;

function funnelCard(b, label) {
  return `<div class="funnel-card">
    <h4>${label}</h4>
    <dl class="funnel-rows">
      <div><dt>Visitors</dt><dd>${fmt(b.visitors)}</dd></div>
      <div><dt>Page views</dt><dd>${fmt(b.page_views)}</dd></div>
      <div><dt>WhatsApp clicks</dt><dd>${fmt(b.whatsapp_clicks)}</dd></div>
      <div><dt>Video Call clicks</dt><dd>${fmt(b.video_call_clicks)}</dd></div>
      <div><dt>Content clicks</dt><dd>${fmt(b.content_clicks)}</dd></div>
      <div><dt>Enquiry clicks</dt><dd>${fmt(b.enquiry_clicks)}</dd></div>
      <div><dt>Telegram clicks</dt><dd>${fmt(b.telegram_clicks)}</dd></div>
      <div><dt>Email clicks</dt><dd>${fmt(b.email_clicks)}</dd></div>
      <div><dt>Leads</dt><dd><strong>${fmt(b.leads)}</strong></dd></div>
      <div><dt>Customers</dt><dd>${fmt(b.customers)}</dd></div>
      <div><dt>Revenue</dt><dd><strong>${money(b.revenue)}</strong></dd></div>
      <div class="funnel-rate"><dt>Conversion</dt><dd>${Number(b.conversion_rate || 0).toFixed(1)}%</dd></div>
    </dl>
  </div>`;
}

function convSourcesTable(rows) {
  if (!rows?.length) return '<div class="admin-panel"><h3>Traffic source report</h3><p class="muted admin-empty">No data yet.</p></div>';
  return `<div class="admin-panel"><h3>Traffic source report <span class="admin-hint">28 days</span></h3>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Source</th><th>Visitors</th><th>WA clicks</th><th>Telegram clicks</th><th>Email clicks</th><th>Leads</th><th>Conv.</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${esc(r.source)}</td>
          <td>${fmt(r.visitors)}</td>
          <td>${fmt(r.whatsapp_clicks)}</td>
          <td>${fmt(r.telegram_clicks)}</td>
          <td>${fmt(r.email_clicks)}</td>
          <td>${fmt(r.leads)}</td>
          <td>${Number(r.conversion_rate || 0).toFixed(1)}%</td>
        </tr>`).join('')}</tbody>
    </table></div></div>`;
}

function convPagesTable(rows) {
  if (!rows?.length) return '<div class="admin-panel"><h3>Page &amp; collection conversion</h3><p class="muted admin-empty">No data yet.</p></div>';
  return `<div class="admin-panel"><h3>Page &amp; collection <span class="admin-hint">28 days</span></h3>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Page / collection</th><th>Visitors</th><th>Views</th><th>Gallery opens</th><th>WA clicks</th><th>Leads</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td class="adm-cell-path">${r.collection ? `<span class="admin-tag">collection</span> ` : ''}${esc(r.label)}</td>
          <td>${fmt(r.visitors)}</td>
          <td>${fmt(r.views)}</td>
          <td>${fmt(r.gallery_opens)}</td>
          <td>${fmt(r.whatsapp_clicks)}</td>
          <td>${fmt(r.leads)}</td>
        </tr>`).join('')}</tbody>
    </table></div></div>`;
}

function leadsBoard(rows) {
  const filtered = (rows || []).filter((l) => leadFilter === 'all' || l.status === leadFilter);
  const filterRow = ['all', ...STATUSES].map((s) => {
    const label = s === 'all' ? 'All' : STATUS_LABEL[s];
    return `<button class="chip${leadFilter === s ? ' is-active' : ''}" data-lead-filter="${s}">${label}</button>`;
  }).join('');
  return `<div class="admin-panel admin-leads">
    <div class="panel-head">
      <h3>Leads</h3>
      <span class="admin-hint">${fmt((rows || []).length)} total · newest first</span>
    </div>
    <div class="filter-row" id="lead-filters">${filterRow}</div>
    <form class="lead-form" id="lead-form">
      <input name="source" placeholder="Source (e.g. TikTok)" maxlength="40">
      <input name="campaign" placeholder="Campaign" maxlength="120">
      <input name="collection" placeholder="Collection" maxlength="120">
      <input name="page" placeholder="Page path" maxlength="150">
      <input name="note" placeholder="Note" maxlength="300">
      <button class="btn btn-ghost" type="submit">Add lead</button>
    </form>
    ${filtered.length ? `<ul class="lead-list">${filtered.map((l) => `
      <li class="lead-item" data-id="${l.id}">
        <div class="lead-head">
          <span class="lead-when">${fmtDateTime(l.created_at)}</span>
          ${statusPill(l.status)}
          <span class="lead-channel">${esc(l.channel)}</span>
        </div>
        <div class="lead-meta">
          <span>${esc(l.source)}</span>${l.campaign ? `<span> · ${esc(l.campaign)}</span>` : ''}${l.collection ? `<span> · ${esc(l.collection)}</span>` : ''}<span class="lead-path"> · ${esc(l.page_path)}</span>
        </div>
        ${l.note ? `<p class="lead-note">${esc(l.note)}</p>` : ''}
        <div class="lead-actions">
          ${STATUSES.filter((s) => s !== l.status).map((s) => `<button class="chip chip-sm" data-lead-status="${s}">${STATUS_LABEL[s]}</button>`).join('')}
          <button class="btn btn-ghost chip-sm" type="button" data-lead-del="1">Delete</button>
        </div>
      </li>`).join('')}</ul>` : `<p class="muted admin-empty">${leadFilter === 'all' ? 'No leads recorded yet.' : 'No leads for this filter yet.'}</p>`}
  </div>`;
}

function bindLeads(rows) {
  const wrap = $('#admin-leads');
  if (!wrap) return;
  wrap.innerHTML = leadsBoard(rows);

  $$('#lead-filters .chip', wrap).forEach((f) => {
    f.addEventListener('click', () => {
      leadFilter = f.dataset.leadFilter;
      bindLeads(rows);
    });
  });

  wrap.querySelectorAll('[data-lead-status], [data-lead-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      const item = b.closest('.lead-item');
      try {
        if (b.dataset.leadStatus) {
          await adminRpc('admin_update_lead_status', { p_lead_id: Number(item.dataset.id), p_status: b.dataset.leadStatus });
          window.MikaToast?.(`Lead → ${STATUS_LABEL[b.dataset.leadStatus]}`);
        } else {
          await adminRpc('admin_delete_lead', { p_lead_id: Number(item.dataset.id) });
          window.MikaToast?.('Lead deleted.');
        }
        item.remove();
      } catch (e) {
        notifyAdminActionError(e, 'lead update');
      }
    });
  });

  const form = $('#lead-form', wrap);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await adminRpc('admin_create_lead', {
        p_source: d.source, p_campaign: d.campaign, p_collection: d.collection,
        p_page_path: d.page, p_note: d.note, p_channel: 'manual',
      });
      window.MikaToast?.('Lead added.');
      form.reset();
      await loadConversions();
    } catch (err) {
      notifyAdminActionError(err, 'lead creation');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function customersBoard(rows) {
  const list = rows || [];
  const total = list.filter((c) => c.status !== 'refunded').reduce((a, c) => a + Number(c.amount || 0), 0);
  return `<div class="admin-panel admin-customers">
    <div class="panel-head">
      <h3>Customers / revenue</h3>
      <span class="admin-hint">${money(total)} total (excl. refunded)</span>
    </div>
    <form class="customer-form" id="customer-form">
      <input type="date" name="entry_date">
      <input name="source" placeholder="Source" maxlength="40">
      <input name="campaign" placeholder="Campaign" maxlength="120">
      <input name="collection" placeholder="Collection" maxlength="120">
      <input name="product" placeholder="Product / package" maxlength="120">
      <input name="amount" type="number" min="0" step="0.01" placeholder="Amount (ZAR)" required>
      <select name="status"><option value="paid">Paid</option><option value="completed">Completed</option><option value="refunded">Refunded</option></select>
      <input name="note" placeholder="Note" maxlength="300">
      <button class="btn btn-ghost" type="submit">Add customer</button>
    </form>
    ${list.length ? `<ul class="customer-list">${list.map((c) => `
      <li class="customer-item" data-id="${c.id}">
        <div class="lead-head">
          <span class="lead-when">${esc(c.entry_date)}</span>
          ${statusPill(c.status)}
          <strong class="cust-amount">${money(c.amount)}</strong>
        </div>
        <div class="lead-meta">
          <span>${esc(c.source)}</span>${c.campaign ? `<span> · ${esc(c.campaign)}</span>` : ''}${c.collection ? `<span> · ${esc(c.collection)}</span>` : ''}${c.product ? `<span> · ${esc(c.product)}</span>` : ''}
        </div>
        ${c.note ? `<p class="lead-note">${esc(c.note)}</p>` : ''}
        <div class="lead-actions"><button class="btn btn-ghost chip-sm" type="button" data-cust-del="1">Delete</button></div>
      </li>`).join('')}</ul>` : '<p class="muted admin-empty">No customers recorded yet.'}
  </div>`;
}

function bindCustomers(rows) {
  const wrap = $('#admin-customers');
  if (!wrap) return;
  wrap.innerHTML = customersBoard(rows);

  wrap.querySelectorAll('[data-cust-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      const item = b.closest('.customer-item');
      try {
        await adminRpc('admin_delete_customer', { p_customer_id: Number(item.dataset.id) });
        window.MikaToast?.('Customer entry deleted.');
        bindCustomers(rows.filter((c) => String(c.id) !== String(item.dataset.id)));
      } catch (e) {
        notifyAdminActionError(e, 'customer entry deletion');
      }
    });
  });

  const form = $('#customer-form', wrap);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await adminRpc('admin_add_customer', {
        p_entry_date: d.entry_date || null,
        p_source: d.source, p_campaign: d.campaign, p_collection: d.collection,
        p_product: d.product, p_amount: Number(d.amount || 0), p_status: d.status, p_note: d.note,
      });
      window.MikaToast?.('Customer entry added.');
      form.reset();
      await loadConversions();
    } catch (err) {
      notifyAdminActionError(err, 'customer entry');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

async function loadConversions() {
  const funnelEl = $('#admin-funnel');
  const sourceEl = $('#admin-conv-sources');
  const pagesEl = $('#admin-conv-pages');
  const leadsEl = $('#admin-leads');
  const customersEl = $('#admin-customers');
  for (const el of [funnelEl, sourceEl, pagesEl, leadsEl, customersEl]) {
    if (el) el.replaceChildren();
  }
  try {
    const c = await adminRpc('admin_get_conversions');
    if (funnelEl) funnelEl.innerHTML = `${funnelCard(c.today, 'Today')}${funnelCard(c.last7, 'Last 7 days')}${funnelCard(c.last28, 'Last 28 days')}`;
    if (sourceEl) sourceEl.innerHTML = convSourcesTable(c.sources || []);
    if (pagesEl) pagesEl.innerHTML = convPagesTable(c.pages || []);
    bindLeads(c.recent_leads || []);
    bindCustomers(c.recent_customers || []);
  } catch (e) {
    const classified = classifyAdminError(e);
    if (classified.kind === 'unauthenticated') { toLogin(); return; }
    if (funnelEl) funnelEl.innerHTML = adminErrorMarkup(e, 'leads and conversions');
    for (const el of [sourceEl, pagesEl, leadsEl, customersEl]) {
      if (el) el.innerHTML = '<p class="muted admin-empty">Conversions unavailable; see the error above.</p>';
    }
  }
}

export function initAdmin() {
  const root = $('#admin-app');
  if (!root) return;
  const cfg = window.MIKA_CONFIG || {};
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey) {
    root.innerHTML = adminErrorMarkup(Object.assign(new Error('Supabase is not configured.'), { code: 'SUPABASE_NOT_CONFIGURED' }), 'the dashboard');
    return;
  }

  // Gate immediately, before any panel is populated: no session -> login page.
  if (!getSession()) { toLogin(); return; }

  $('#admin-logout')?.addEventListener('click', () => {
    clearSession();
    window.MikaToast?.('Signed out.');
    window.location.replace(LOGIN_PATH);
  });

  $('#admin-refresh')?.addEventListener('click', async () => {
    const view = $('#admin-view');
    if (view?.dataset.gate === 'denied') {
      window.location.reload();
      return;
    }
    if (view) delete view.dataset.loaded;
    await loadDashboard();
  });

  loadDashboard();
}