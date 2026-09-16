import { $, $$ } from './ui.mjs';
import { adminSignIn, ensureFreshSession, clearSession, getSession, adminRpc } from './admin-auth.mjs';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n) => Number(n || 0).toLocaleString('en-ZA');
const pct = (n, t) => (t ? Math.round((Number(n) / Number(t)) * 100) : 0);

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
    <div class="bar-col" title="${fmtDay(d.day)} — ${fmt(d.visitors)} visitor${d.visitors === 1 ? '' : 's'}">
      <div class="bar" style="height:${Math.max(4, Math.round((d.visitors / max) * 100))}%"></div>
      <div class="bar-label">${fmtDay(d.day)}</div>
    </div>`).join('')}</div>`;
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
  if (todayCard) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const today = (s.daily || []).find((d) => String(d.day).slice(0, 10) === day);
      todayCard.innerHTML = card('Visitors today', fmt(today?.visitors), fmt(today?.page_views) + ' page views', true);
    } catch {}
  }
  return `
    ${card('Total visitors', fmt(s.total_visitors), s.total_sessions + ' sessions')}
    ${card('Page views', fmt(s.total_page_views))}
    ${card('New visitors', fmt(s.new_visitors))}
    ${card('Likes', fmt(eng.likes))}
    ${card('Reviews', fmt(eng.reviews))}
    ${card('Clicks (RV/ESA/Cta)', fmt((eng.redvelvet_clicks || 0) + (eng.esa_clicks || 0) + (eng.contact_clicks || 0)))}
  `;
}

function renderModeration(rows) {
  const wrap = $('#admin-moderation');
  if (!wrap) return;
  if (!rows?.length) {
    wrap.innerHTML = '<p class="muted admin-empty">No comments waiting for review. Nothing pending — enjoy the quiet.</p>';
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
        window.MikaToast?.(e.status === 401 ? 'Session expired — sign in again.' : 'Could not update that comment.', 'err');
        btn.disabled = false;
        if (e.status === 401) showLogin();
      }
    });
  });
}

function showLogin() {
  const view = $('#admin-view');
  if (view) view.style.display = 'none';
  const login = $('#admin-login');
  if (login) login.style.display = '';
}

async function loadDashboard() {
  const session = await ensureFreshSession();
  if (!session) { showLogin(); return; }
  const view = $('#admin-view');
  if (view) view.style.display = '';
  const login = $('#admin-login');
  if (login) login.style.display = 'none';
  if (view.dataset.loaded) return;
  view.dataset.loaded = '1';

  const statsEl = $('#admin-stats');
  const chartEl = $('#admin-chart');
  const pagesEl = $('#admin-pages');
  const devicesEl = $('#admin-devices');
  const sourcesEl = $('#admin-sources');
  const engEl = $('#admin-engagement');
  const nameEl = $('#admin-name');

  try {
    const s = await adminRpc('admin_get_stats', { p_days: 7 });
    if (nameEl) nameEl.textContent = session.user?.email || 'Mika';
    if (statsEl) statsEl.innerHTML = renderStats(s);
    if (chartEl) chartEl.innerHTML = barChart(s.daily || []);
    if (pagesEl) pagesEl.innerHTML = listBlock('Top pages', (s.top_pages || []).map((p) => `${esc(p.path)} <span class="pct-num">${fmt(p.views)}</span>`), 'No page views recorded yet.');
    const devTotal = (s.devices || []).reduce((a, d) => a + d.count, 0);
    if (devicesEl) devicesEl.innerHTML = listBlock('Devices', (s.devices || []).map((d) => fmtPctBar(`${d.device} (${fmt(d.count)})`, devTotal)), 'No data collected yet.');
    const srcTotal = (s.traffic_sources || []).reduce((a, d) => a + d.count, 0);
    if (sourcesEl) sourcesEl.innerHTML = listBlock('Traffic sources', (s.traffic_sources || []).map((d) => fmtPctBar(d.source, srcTotal)), 'No traffic recorded yet.');
    const eng = s.engagement || {};
    if (engEl) engEl.innerHTML = `
      <div class="eng-row">${card('RedVelvet clicks', fmt(eng.redvelvet_clicks))}${card('ESA clicks', fmt(eng.esa_clicks))}${card('Contact clicks', fmt(eng.contact_clicks))}${card('Gallery interactions', fmt(eng.gallery_interactions))}</div>`;
  } catch (e) {
    if (e.status === 401) { showLogin(); return; }
    const msg = e.message || '';
    if (/unauthorized/i.test(msg)) {
      if (statsEl) statsEl.innerHTML = '<div class="admin-error">This account is not authorised for the dashboard. Please use Mika\'s admin account.</div>';
    } else if (/does not exist|could not find|relation/i.test(msg)) {
      if (statsEl) statsEl.innerHTML = '<div class="admin-error">The analytics tables/functions have not been created yet. Run the migration 002 SQL in the Supabase SQL Editor, then reload.</div>';
    } else {
      if (statsEl) statsEl.innerHTML = `<div class="admin-error">Could not load analytics: ${esc(msg)}</div>`;
    }
  }

  try {
    const rows = await adminRpc('admin_list_comments', { p_status: 'pending', p_limit: 50 });
    renderModeration(rows);
  } catch (e) {
    const mod = $('#admin-moderation');
    if (mod) mod.innerHTML = '<p class="muted admin-empty">Could not load comments for moderation.</p>';
  }
}

export function initAdmin() {
  const root = $('#admin-app');
  if (!root) return;
  const cfg = window.MIKA_CONFIG || {};
  if (!cfg.supabase?.url) {
    root.innerHTML = '<div class="admin-error">Admin tools require Supabase to be configured.</div>';
    return;
  }

  const login = $('#admin-login');
  const form = $('#admin-form');
  const status = $('#admin-form-status');
  const btn = $('#admin-submit');
  const emailInput = $('#admin-email');

  if (emailInput) {
    const s = localStorage.getItem('mika_admin_email');
    if (s) emailInput.value = s;
  }

  const tryAuto = async () => {
    if (await ensureFreshSession()) await loadDashboard();
    else showLogin();
  };

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(emailInput?.value || '').trim();
    const password = String($('#admin-password')?.value || '');
    if (!email || !password) { if (status) { status.className = 'form-status err'; status.textContent = 'Enter your email and password.'; } return; }
    if (btn) btn.disabled = true;
    if (status) { status.className = 'form-status'; status.textContent = 'Signing in…'; }
    try {
      const s = await adminSignIn(email, password);
      localStorage.setItem('mika_admin_email', email);
      saveSession({ ...s, expires_at: Date.now() + 3600 * 1000 });
      if (status) status.textContent = '';
      await loadDashboard();
    } catch (err) {
      if (status) {
        status.className = 'form-status err';
        status.textContent = err.message && !/failed/i.test(err.message) ? err.message : 'Incorrect email or password.';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $('#admin-logout')?.addEventListener('click', () => {
    clearSession();
    showLogin();
    window.MikaToast?.('Signed out.');
  });

  $('#admin-refresh')?.addEventListener('click', () => {
    const view = $('#admin-view');
    if (view) { delete view.dataset.loaded; view.style.display = 'none'; }
    loadDashboard();
  });

  tryAuto();
}