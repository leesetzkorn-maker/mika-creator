const cfg = window.MIKA_CONFIG || {};
const URL = cfg.supabase?.url;

async function request(path, body) {
  const res = await fetch(`${URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${cfg.supabase.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.msg || data.error_description || data.message || `Sign in failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function adminSignIn(email, password) {
  const d = await request('/auth/v1/token?grant_type=password', { email, password });
  return { accessToken: d.access_token, refreshToken: d.refresh_token, user: d.user };
}

export async function adminRefresh(refreshToken) {
  return request('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
}

export function getSession() {
  try {
    const raw = localStorage.getItem('mika_admin_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSession(s) {
  localStorage.setItem('mika_admin_session', JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem('mika_admin_session');
}

export async function adminRpc(name, payload = {}) {
  const session = getSession();
  if (!session?.accessToken) throw Object.assign(new Error('Not signed in'), { status: 401 });

  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || `Admin RPC ${name} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function ensureFreshSession() {
  const s = getSession();
  if (!s) return null;
  if (s.expires_at && Date.now() > s.expires_at - 60_000) {
    try {
      const d = await adminRefresh(s.refreshToken);
      const fresh = { ...s, accessToken: d.access_token, refreshToken: d.refresh_token || s.refreshToken, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
      saveSession(fresh);
      return fresh;
    } catch {
      clearSession();
      return null;
    }
  }
  return s;
}