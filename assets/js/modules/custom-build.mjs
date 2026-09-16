import { $, $$ } from './ui.mjs';

function setStep(n) {
  const form = $('#cb-form');
  if (!form) return;
  const steps = $$('.cb-step', form);
  const dots = $$('.cb-dot', form);
  steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === n));
  dots.forEach((d) => d.classList.toggle('is-active', Number(d.dataset.step) <= n));
  const prev = $('.cb-prev', form);
  const next = $('.cb-next', form);
  const submit = $('.cb-submit', form);
  if (prev) prev.hidden = n === 1;
  if (next) next.hidden = n >= steps.length;
  if (submit) submit.hidden = n < steps.length;
}

function validateStep(n) {
  const form = $('#cb-form');
  const step = $(`.cb-step[data-step="${n}"]`, form);
  if (!step) return true;
  let ok = true;
  $$('input, textarea, select', step).forEach((el) => {
    if (el.name === 'honeypot' || el.type === 'hidden') return;
    const bad = el.hasAttribute('required') && !String(el.value).trim();
    el.setAttribute('aria-invalid', String(bad));
    if (bad) ok = false;
  });
  return ok;
}

function field(name) {
  const el = $(`[name="${name}"]`, $('#cb-form'));
  return el ? String(el.value || '').trim() : '';
}

function buildMessage() {
  const lines = [
    'CUSTOM BUILD REQUEST',
    '—'.repeat(24),
    `Name: ${field('name')}`,
    `Package: ${field('package') || '—'}`,
    `Content type: ${field('type')}`,
    '',
    'Personalisation',
    `  Custom name/word: ${field('customword') || '—'}`,
    `  Text colour: ${field('colour') || '—'}`,
    `  Placement: ${field('placement') || '—'}`,
    `  Custom colour: ${field('colourcustom') || '—'}`,
    '',
    'Style / direction',
    `  Indoor/outdoor: ${field('location') || '—'}`,
    `  Lighting: ${field('lighting') || '—'}`,
    `  Outfit: ${field('outfit') || '—'}`,
    `  Background: ${field('background') || '—'}`,
    `  Mood: ${field('mood') || '—'}`,
    `  Camera/photo: ${field('camera') || '—'}`,
    `  Video: ${field('video') || '—'}`,
    `  Other: ${field('other') || '—'}`,
    '',
    'Detailed request',
    field('detailed'),
    '',
    `Delivery: ${field('delivery') || '—'}`,
    '',
    'Contact',
    `  Name: ${field('contactname')}`,
    `  Email: ${field('email')}`,
    `  Preferred method: ${field('method')}`,
  ].filter((l) => !/^  \w+:\s*—$/i.test(l) || !/:\s*—$/.test(l));
  return lines.join('\n');
}

async function sendPayload() {
  const cfg = window.MIKA_CONFIG || {};
  const url = cfg.supabase?.url;
  const data = {
    p_name: field('name'),
    p_package_id: field('package'),
    p_type: field('type'),
    p_custom_word: field('customword'),
    p_colour: field('colour'),
    p_placement: field('placement'),
    p_colour_custom: field('colourcustom'),
    p_location: field('location'),
    p_lighting: field('lighting'),
    p_outfit: field('outfit'),
    p_background: field('background'),
    p_mood: field('mood'),
    p_camera: field('camera'),
    p_video: field('video'),
    p_other: field('other'),
    p_detailed: field('detailed'),
    p_delivery: field('delivery'),
    p_contact_name: field('contactname'),
    p_email: field('email'),
    p_method: field('method'),
  };
  if (url) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/submit_custom_request`, {
        method: 'POST',
        headers: {
          apikey: cfg.supabase.anonKey,
          Authorization: `Bearer ${cfg.supabase.anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (res.ok) return { stored: true };
    } catch {}
  }
  return { stored: false };
}

function doneChannels() {
  const cfg = window.MIKA_CONFIG || {};
  const c = cfg.contact || {};
  const text = encodeURIComponent(buildMessage());
  const links = [];
  if (c.whatsappNumber) {
    links.push(`<a class="btn btn-ghost" href="https://wa.me/${c.whatsappNumber}?text=${text}" target="_blank" rel="noopener">Send via WhatsApp</a>`);
  }
  if (c.telegram) {
    links.push(`<a class="btn btn-ghost" href="${c.telegram}" target="_blank" rel="noopener">Continue on Telegram</a>`);
  }
  if (c.email) {
    links.push(`<a class="btn btn-ghost" href="mailto:${c.email}?subject=${encodeURIComponent('Custom build request')}&body=${text}">Send via email</a>`);
  }
  return links.join('');
}

async function submit(e) {
  e.preventDefault();
  const form = $('#cb-form');
  const status = $('#cb-status');
  if (!validateStep(6)) { if (status) status.textContent = 'Please fill in your contact details.'; return; }

  const hp = field('honeypot');
  if (hp) { if (status) status.textContent = 'Request could not be sent (spam check).'; return; }

  const now = Date.now();
  let last = 0;
  try { last = Number(localStorage.getItem('mc_cb_last') || 0); } catch {}
  if (now - last < 60000) { if (status) status.textContent = 'Please wait a moment before sending another request.'; return; }

  const btn = $('.cb-submit', form);
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  if (status) status.textContent = '';

  const { stored } = await sendPayload();

  if (stored) {
    try { localStorage.setItem('mc_cb_last', String(now)); } catch {}
    form.hidden = true;
    const done = $('#cb-done');
    if (done) done.hidden = false;
    window.MikaToast && MikaToast('Custom request sent — Mika will be in touch', 'ok');
    return;
  }

  // Backend not live yet: drop the customer into Mika's real contact channel.
  const done = $('#cb-done');
  const links = $('#cb-done-links');
  if (links) links.innerHTML = doneChannels();
  if (done) done.hidden = false;
  form.hidden = true;
  try { localStorage.setItem('mc_cb_last', String(now)); } catch {}
  window.MikaToast && MikaToast('Please send your request via one of the channels', 'ok');
}

function handlePackagesParam() {
  const params = new URLSearchParams(location.search || '');
  const pkg = params.get('pkg');
  const req = params.get('request');
  const sel = $('#cb-package');
  if (sel) {
    if (req === 'video-call') sel.value = 'video-call';
    else if (pkg && !Array.from(sel.options).some((o) => o.value === pkg)) sel.value = '';
    else if (pkg) sel.value = pkg;
  }
  if (location.search && $('#custom-build')) {
    $('#custom-build').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.history.replaceState({}, '', location.pathname);
}

function bindChips() {
  const chips = $$('.cb-chip');
  const hidden = $('#cb-delivery-val');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      if (hidden) hidden.value = chip.dataset.value;
    });
  });
}

export function initCustomBuild() {
  if (document.body.dataset.customBuild === undefined || !$('#cb-form')) return;
  const form = $('#cb-form');

  $('.cb-next', form)?.addEventListener('click', () => {
    const cur = Number($('.cb-step.is-active', form)?.dataset.step || 1);
    if (!validateStep(cur)) return;
    setStep(Math.min(6, cur + 1));
  });

  $('.cb-prev', form)?.addEventListener('click', () => {
    const cur = Number($('.cb-step.is-active', form)?.dataset.step || 1);
    setStep(Math.max(1, cur - 1));
  });

  form.addEventListener('submit', submit);
  bindChips();
  handlePackagesParam();
  setStep(1);
  const status = $('#cb-status');
  if (status) status.textContent = '';
}