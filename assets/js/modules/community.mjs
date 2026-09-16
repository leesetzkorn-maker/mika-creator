import { $, $$ } from './ui.mjs';
import { rpc, select, count, isMissingError, visitorId } from './supabase.mjs';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function onlineGuard() {
  if (!navigator.onLine) {
    window.MikaToast?.('You appear to be offline.', 'err');
    return true;
  }
  return false;
}

export async function initLikes() {
  const btn = $('#like-btn');
  if (!btn) return;
  const objectType = btn.dataset.type || 'collection';
  const objectId = btn.dataset.object || document.body.dataset.collection;
  const countEl = $('#like-count');

  const refresh = async (optimistic) => {
    try {
      const n = await rpc('count_likes', { p_object_type: objectType, p_object_id: objectId });
      btn.classList.remove('is-offline');
      if (countEl) countEl.textContent = String(n?.count ?? 0);
      window.MikaLikes = n?.count ?? 0;
    } catch {
      if (!optimistic) btn.classList.add('is-offline');
      if (countEl && countEl.textContent === '') countEl.textContent = '…';
    }
  };

  const localLiked = localStorage.getItem(`mika_like_${objectType}:${objectId}`);
  if (localLiked === '1') btn.classList.add('liked');

  btn.addEventListener('click', async () => {
    if (onlineGuard()) return;
    const next = !btn.classList.contains('liked');
    const prev = btn.classList.contains('liked');
    btn.classList.toggle('liked', next);
    if (countEl) countEl.textContent = String(Math.max(0, Number(countEl.textContent || 0) + (next ? 1 : -1)));
    try {
      const out = await rpc('toggle_vote', {
        p_object_type: objectType,
        p_object_id: objectId,
        p_voter_id: visitorId(),
        p_action: 'like',
      });
      btn.classList.toggle('liked', !!out?.liked);
      if (countEl) countEl.textContent = String(out?.count ?? 0);
      localStorage.setItem(`mika_like_${objectType}:${objectId}`, out?.liked ? '1' : '0');
    } catch (e) {
      if (isMissingError(e) || e.status === 403) {
        btn.classList.toggle('liked', prev);
        if (countEl) countEl.textContent = String(Math.max(0, Number(countEl.textContent || 0) + (next ? -1 : 1)));
        window.MikaToast?.('Likes are warming up — try again shortly.', 'err');
        return;
      }
      btn.classList.toggle('liked', prev);
      if (countEl) countEl.textContent = String(Math.max(0, Number(countEl.textContent || 0) + (next ? -1 : 1)));
      window.MikaToast?.('Could not save that. Please try again.', 'err');
    }
  });

  await refresh();
}

function pendingComments(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
}

export async function initComments() {
  const listEl = $('#comment-list');
  const form = $('#comment-form');
  if (!listEl) return;

  const scope = document.body.dataset.scope || 'collection';
  const objectId = document.body.dataset.collection;
  const storageKey = `mika_pending_${scope}_${objectId || 'global'}`;
  const status = $('#comment-status');

  const renderLocalPending = () => {
    const mine = pendingComments(storageKey);
    if (!mine.length) return;
    mine.forEach((c) => appendComment($, listEl, { name: c.name, text: c.text, created_at: c.at, pending: true }));
  };

  const load = async () => {
    try {
      const rows = await rpc('list_comments', { p_object_type: scope, p_object_id: objectId, p_limit: 50 });
      renderLocalPending();
      (rows || []).forEach((r) => appendComment($, listEl, r));
      listEl.parentElement?.classList.remove('comments-offline');
    } catch {
      renderLocalPending();
      listEl.parentElement?.classList.add('comments-offline');
      if (status) {
        status.className = 'form-status err';
        status.textContent = 'Comments are switching servers — they will appear here shortly. Your thought is saved.';
      }
    }
    if (listEl.dataset.empty === undefined && !listEl.children.length) {
      listEl.innerHTML = '<p class="muted" style="font-size:.9rem">No comments yet — be the first.</p>';
    }
  };

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const honeypot = form._website?.value || $('#comment-website')?.value;
    if (honeypot) return;

    const f = new FormData(form);
    const name = String(f.get('name') || '').trim().slice(0, 60);
    const text = String(f.get('text') || '').trim().slice(0, 1000);
    if (!name || !text) { if (status) { status.className = 'form-status err'; status.textContent = 'Please add your name and a message.'; } return; }
    const last = localStorage.getItem('mika_comment_ts');
    if (last && Date.now() - Number(last) < 20000) {
      if (status) { status.className = 'form-status err'; status.textContent = 'Easy tiger — one comment at a time.'; }
      return;
    }

    const pending = { name, text, at: new Date().toISOString() };
    try {
      await rpc('insert_comment', {
        p_object_type: scope, p_object_id: objectId,
        p_voter_id: visitorId(), p_name: name, p_text: text, p_honeypot: honeypot || '',
      });
      localStorage.setItem('mika_comment_ts', String(Date.now()));
      if (status) { status.className = 'form-status ok'; status.textContent = 'Thanks — your comment is with Mika.'; }
      form.reset();
      const mine = pendingComments(storageKey);
      mine.push(pending);
      localStorage.setItem(storageKey, JSON.stringify(mine));
      appendComment($, listEl, pending);
    } catch (err) {
      const verboten = isMissingError(err) || err.status === 403 || err.status === 429;
      if (verboten) {
        if (status) { status.className = 'form-status err'; status.textContent = 'Comments are being set up — yours is kept for when they go live.'; }
        const mine = pendingComments(storageKey);
        mine.push(pending);
        localStorage.setItem(storageKey, JSON.stringify(mine));
        appendComment($, listEl, pending);
        localStorage.setItem('mika_comment_ts', String(Date.now()));
      } else {
        if (status) { status.className = 'form-status err'; status.textContent = 'Could not reach the server right now. Please try again.'; }
      }
    }
  });

  await load();
}

function appendComment($, listEl, { name, text, created_at: at, pending = false }) {
  const el = document.createElement('div');
  el.className = 'comment' + (pending ? ' comment-pending' : '');
  el.innerHTML = `
    <div class="comment-head">
      <span class="comment-name">${esc(name || 'Guest')}</span>
      <span class="comment-time">${pending ? 'saving…' : (at ? new Date(at).toLocaleDateString() : '')}</span>
      ${pending ? '<span class="pending-note">awaiting moderation</span>' : ''}
    </div>
    <p class="comment-text">${esc(text)}</p>`;
  listEl.appendChild(el);
}

export function initReviews() {
  const form = $('#review-form');
  const statWrap = $('#csat-stats');
  const status = $('#review-status');

  const showStats = async () => {
    try {
      const s = await rpc('get_review_stats', {});
      if (statWrap && s) {
        statWrap.innerHTML = [
          ['Service', s.avg_service], ['Needs', s.avg_needs], ['Content', s.avg_content], ['Likes', s.likes],
        ].filter(([, v]) => v != null)
          .map(([k, v]) => `<div class="item">${Number(v).toFixed(1)}<span>${k}</span></div>`)
          .join('');
      }
    } catch {}
  };

  $$('.chip', form).forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.type;
      $$(`.chip[data-type="${group}"]`, form).forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      const input = $(`input[name="${group}"]`, form);
      if (input) input.value = chip.dataset.value;
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (onlineGuard()) return;
    const f = new FormData(form);
    const service = Number(f.get('service')); const needs = Number(f.get('needs')); const content = Number(f.get('content'));
    const name = String(f.get('name') || '').trim().slice(0, 60);
    const comment = String(f.get('comment') || '').trim().slice(0, 500);
    if (!service || !needs || !content) { if (status) { status.className = 'form-status err'; status.textContent = 'Please pick a rating in all three areas.'; } return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await rpc('insert_review', { p_service: service, p_needs: needs, p_content: content, p_name: name, p_comment: comment, p_voter_id: visitorId() });
      if (status) { status.className = 'form-status ok'; status.textContent = 'Thank you — your review helps Mika keep improving.'; }
      form.reset();
      $$('.chip', form).forEach((c) => c.classList.remove('selected'));
      showStats();
    } catch (err) {
      if (status) {
        status.className = 'form-status ' + (isMissingError(err) || err.status === 403 ? 'err' : 'err');
        status.textContent = isMissingError(err) || err.status === 403
          ? 'Reviews are being connected — please come back shortly.'
          : 'Could not save your review. Please try again.';
      }
    } finally {
      btn.disabled = false;
    }
  });

  showStats();
}