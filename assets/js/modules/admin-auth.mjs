const cfg = window.MIKA_CONFIG || {};
const URL = cfg.supabase?.url;
const KEY = cfg.supabase?.anonKey;

function parseResponse(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function apiError(data, status, fallback, extra = {}) {
  const err = new Error(data?.message || data?.msg || data?.error_description || fallback);
  err.status = status;
  err.code = data?.code;
  err.details = data?.details;
  err.hint = data?.hint;
  if (extra.rpc) err.rpc = extra.rpc;
  return err;
}

async function request(path, body) {
  if (!URL || !KEY) throw Object.assign(new Error('Supabase is not configured.'), { code: 'SUPABASE_NOT_CONFIGURED' });
  const res = await fetch(`${URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${cfg.supabase.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = parseResponse(await res.text());
  if (!res.ok) throw apiError(data, res.status, `Sign in failed (${res.status})`);
  return data;
}

export async function adminSignIn(email, password) {
  const d = await request('/auth/v1/token?grant_type=password', { email, password });
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    user: d.user,
    expiresIn: d.expires_in ?? 3600,
  };
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

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return JSON.parse(atob(padded + pad));
  } catch { return null; }
}

export function sessionClaims(session = getSession()) {
  const jwt = decodeJwt(session?.accessToken);
  const expMs = jwt?.exp ? jwt.exp * 1000 : (session?.expires_at || 0);
  return {
    email: session?.user?.email || jwt?.email || jwt?.user_metadata?.email || '',
    role: jwt?.role || '',
    exp: jwt?.exp || 0,
    expiresAt: expMs,
    expired: expMs ? Date.now() >= expMs : false,
    sub: jwt?.sub || session?.user?.id || '',
  };
}

function persistRefreshed(session, data) {
  const jwt = decodeJwt(data.access_token);
  const expiresIn = data.expires_in || 3600;
  const fresh = {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || session.refreshToken,
    user: data.user || session.user,
    expires_at: Date.now() + expiresIn * 1000,
  };
  if (jwt?.email && fresh.user) fresh.user = { ...fresh.user, email: jwt.email };
  saveSession(fresh);
  return fresh;
}

export async function ensureFreshSession() {
  const s = getSession();
  if (!s?.accessToken) return null;
  const claims = sessionClaims(s);
  const refreshAt = (s.expires_at || claims.expiresAt || 0) - 60_000;
  if (refreshAt && Date.now() > refreshAt) {
    if (!s.refreshToken) { clearSession(); return null; }
    try {
      const d = await adminRefresh(s.refreshToken);
      return persistRefreshed(s, d);
    } catch {
      clearSession();
      return null;
    }
  }
  return s;
}

async function postRpc(name, payload, accessToken) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = parseResponse(await res.text());
  if (!res.ok) throw apiError(data, res.status, `Admin RPC ${name} failed (${res.status})`, { rpc: name });
  return data;
}

export function parseIsAdmin(value) {
  if (value === true || value === 't' || value === 'true' || value === 1) return true;
  if (Array.isArray(value)) return parseIsAdmin(value[0]);
  if (value && typeof value === 'object') {
    return value.is_admin === true || value.ok === true;
  }
  return false;
}

export async function checkIsAdmin() {
  return parseIsAdmin(await adminRpc('is_admin'));
}

export async function adminRpc(name, payload = {}) {
  let session = getSession();
  if (!session?.accessToken) throw Object.assign(new Error('Not signed in'), { status: 401, code: 'UNAUTHENTICATED', rpc: name });
  if (!URL || !KEY) throw Object.assign(new Error('Supabase is not configured.'), { code: 'SUPABASE_NOT_CONFIGURED', rpc: name });

  const claims = sessionClaims(session);
  if (claims.expired) {
    session = await ensureFreshSession();
    if (!session?.accessToken) throw Object.assign(new Error('Session expired'), { status: 401, code: 'UNAUTHENTICATED', rpc: name });
  }

  try {
    return await postRpc(name, payload, session.accessToken);
  } catch (err) {
    err.rpc = name;
    if (err.status === 401 && session.refreshToken) {
      try {
        const d = await adminRefresh(session.refreshToken);
        const fresh = persistRefreshed(session, d);
        return await postRpc(name, payload, fresh.accessToken);
      } catch (refreshErr) {
        clearSession();
        throw Object.assign(new Error('Session expired'), { status: 401, code: 'UNAUTHENTICATED', rpc: name, cause: refreshErr });
      }
    }
    throw err;
  }
}

export function classifyAdminError(error, { rpc } = {}) {
  const status = Number(error?.status) || 0;
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const rpcName = rpc || error?.rpc || '';
  const claims = sessionClaims();
  const who = claims.email ? `Signed in as ${claims.email}` : 'No verified admin email on this session';
  const role = claims.role ? `JWT role ${claims.role}` : 'JWT role unknown';

  if (code === 'SUPABASE_NOT_CONFIGURED') {
    return {
      kind: 'config',
      title: 'Supabase is not configured',
      message: 'Check the public Supabase URL and publishable key in the site configuration.',
    };
  }

  if ((!status && error instanceof TypeError) || /failed to fetch|networkerror|load failed/i.test(message)) {
    return {
      kind: 'network',
      title: 'Could not reach Supabase',
      message: 'Check the project URL, publishable key, network connection, and Content Security Policy.',
    };
  }

  if (code === 'P0001' || /(^|\b)unauthorized(\b|$)/i.test(message)) {
    return {
      kind: 'unauthorized',
      title: 'Authenticated, not authorized',
      message: `${who} (${role}). This account is signed in, but is_admin() rejected it. Confirm the Auth user exists and run authorize_admin for that email in the SQL Editor. Admin data stays private to authorized accounts.`,
    };
  }

  if (status === 403 || code === '42501' || /permission denied|row.level security|rls/i.test(message)) {
    return {
      kind: 'permission',
      title: 'Permission denied',
      message: `${who} (${role}). Postgres denied this call. Admin RPCs must stay granted to authenticated only — do not grant them to anon or public. Confirm EXECUTE on the admin functions for the authenticated role.`,
    };
  }

  if (status === 401 || code === 'PGRST301' || code === 'UNAUTHENTICATED' || /jwt expired|invalid jwt|not signed in|session expired/i.test(message)) {
    return {
      kind: 'unauthenticated',
      title: 'Not authenticated',
      message: claims.expired
        ? 'The admin session JWT has expired. Sign in again.'
        : 'There is no valid admin session. Sign in with the authorized account.',
    };
  }

  if (code === 'PGRST202' || code === 'PGRST205' || /could not find the (function|table)|schema cache/i.test(message)) {
    return {
      kind: 'schema_cache',
      title: 'RPC not visible to this session',
      message: `${who} (${role}). PostgREST returned ${code || 'schema-cache miss'} for ${rpcName || 'this RPC'}. That is the expected result for anonymous visitors because admin RPCs are revoked from anon. For a signed-in authorized admin it usually means the API schema cache is stale, or EXECUTE was never granted to authenticated. It is not proof that migrations 002/003 need to be rerun, and it is not a reason to expose admin data publicly. Reload the PostgREST schema cache, then refresh this page.`,
    };
  }

  if (code === '42P01' || code === '42883') {
    return {
      kind: 'missing_object',
      title: 'Database object missing',
      message: `Postgres reported ${code} for ${rpcName || 'this call'}: ${message}. Confirm the object with a read-only catalog query before applying any SQL.`,
    };
  }

  return {
    kind: 'database',
    title: 'Database error',
    message: message || 'Unknown database error',
  };
}
