const cfg = window.MIKA_CONFIG || {};
const BASE = cfg.supabase?.url || '';
const KEY = cfg.supabase?.anonKey || '';

const headers = (extra = {}) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

function isMissing(e) {
  return e && (e.code === 'PGRST103' || /does not exist|could not find|not found|relation|function .* does not exist/i.test(e.message || ''));
}

export async function rpc(name, payload = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || data?.error?.message || `RPC ${name} failed (${res.status})`);
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function select(table, params = {}) {
  const qs = new URLSearchParams();
  qs.set('select', params.select || '*');
  if (params.filters) for (const [k, v] of Object.entries(params.filters)) qs.append(k, v);
  qs.set('order', params.order || 'created_at.desc');
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));

  const res = await fetch(`${BASE}/rest/v1/${table}?${qs}`, {
    headers: headers(params.extra || {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || `select ${table} failed (${res.status})`);
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data || [];
}

export async function count(table, filters = {}) {
  const qs = new URLSearchParams();
  qs.set('select', 'count');
  for (const [k, v] of Object.entries(filters)) qs.append(k, v);
  qs.set('count', 'exact');
  qs.set('limit', '1');
  const res = await fetch(`${BASE}/rest/v1/${table}?${qs}`, {
    method: 'HEAD',
    headers: headers({ Prefer: 'count=exact' }),
  });
  if (!res.ok) {
    const err = new Error(`count ${table} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const range = res.headers.get('content-range') || res.headers.get('content-range');
  if (!range) return 0;
  const m = range.match(/\/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

export const isMissingError = isMissing;

export function visitorId() {
  const K = 'mika_voter_id';
  let id = localStorage.getItem(K);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(K, id);
  }
  return id;
}