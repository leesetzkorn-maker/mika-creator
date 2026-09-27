// Admin sign-in page (/admin/login/).
//
// Deliberately separate from the dashboard: the login form never renders
// dashboard markup, and the dashboard never renders a login form. That keeps
// the two routes independently cacheable and makes the redirect rules
// unambiguous —
//   no session on /admin/      -> /admin/login/
//   valid session on /admin/login/ -> /admin/
//   sign out                   -> /admin/login/
import { $ } from './ui.mjs';
import { adminSignIn, saveSession, getSession, ensureFreshSession } from './admin-auth.mjs';

const LOGIN_PATH = '/admin/login/';
const DASH_PATH = '/admin/';

function setStatus(el, text, kind = '') {
  if (!el) return;
  el.className = `form-status${kind ? ` ${kind}` : ''}`;
  el.textContent = text;
}

export async function initAdminLogin() {
  const form = $('#admin-form');
  const emailInput = $('#admin-email');
  const passInput = $('#admin-password');
  const status = $('#admin-form-status');
  const btn = $('#admin-submit');

  const remembered = localStorage.getItem('mika_admin_email');
  if (remembered && emailInput && !emailInput.value) emailInput.value = remembered;

  // Already signed in? Don't show a login form — go straight through.
  if (await ensureFreshSession()) {
    window.location.replace(DASH_PATH);
    return;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(emailInput?.value || '').trim();
    const password = String(passInput?.value || '');
    if (!email || !password) {
      setStatus(status, 'Enter your email and password.', 'err');
      return;
    }

    if (btn) btn.disabled = true;
    setStatus(status, 'Signing in…');
    try {
      const s = await adminSignIn(email, password);
      // Supabase returns expires_in (seconds); default to 1h if absent.
      saveSession({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        expires_at: Date.now() + (s.expiresIn ? s.expiresIn * 1000 : 3600 * 1000),
      });
      localStorage.setItem('mika_admin_email', email);
      if (passInput) passInput.value = '';
      setStatus(status, '');
      window.location.replace(DASH_PATH);
    } catch (err) {
      // Supabase returns "Invalid login credentials" for a wrong password AND
      // for a non-existent user — surface that verbatim rather than a vague
      // message, but never leak whether the account exists.
      const msg = /invalid login credentials/i.test(err?.message || '')
        ? 'Incorrect email or password.'
        : (err?.message || 'Sign in failed. Please try again.');
      setStatus(status, msg, 'err');
      if (btn) btn.disabled = false;
    }
  });
}

export { getSession, LOGIN_PATH, DASH_PATH };
