// ==UserScript==
// @name         Jarvis Bot
// @namespace    http://tampermonkey.net/
// @version      2000.287
// @description  Jarvis Bot — automated game assistant with Office-style UI, light/dark theme, Telegram alerts, OC/DTM auto-accept, online watch, garage management
// @author       Jarvis
// @match        *://www.tmn2010.net/login.aspx*
// @match        *://www.tmn2010.net/authenticated/*
// @match        *://www.tmn2010.net/Login.aspx*
// @match        *://www.tmn2010.net/Authenticated/*
// @match        *://www.tmn2010.net/Default.aspx*
// @match        *://www.tmn2010.net/default.aspx*
// @match        *://www.tmn2010.net/Authenticated/Default.aspx*
// @match        *https://www.tmn2010.net/authenticated/
// @match        *://tmn2010.net/login.aspx*
// @match        *://tmn2010.net/authenticated/*
// @match        *://tmn2010.net/Login.aspx*
// @match        *://tmn2010.net/Authenticated/*
// @match        *://tmn2010.net/Default.aspx*
// @match        *://tmn2010.net/default.aspx*
// @match        *://tmn2010.net/Authenticated/Default.aspx*
// @match        *https://tmn2010.net/authenticated/
// @match        *://*.tmn2010.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.telegram.org
// @connect      discord.com
// @connect      raw.githubusercontent.com
// @connect      starvinggeeks.net
// @updateURL    https://raw.githubusercontent.com/scoobyghub/v100/refs/heads/main/Jarvis.meta.js
// @downloadURL  https://raw.githubusercontent.com/scoobyghub/v100/refs/heads/main/Jarvis.user.js
// ==/UserScript==

/*  Jarvis Bot 2000.287
 *  Game automation assistant — MS Office inspired UI
 *  Features: auto crime/gta/booze/jail, garage crusher,
 *  OC/DTM invite accept, team creation, online watch,
 *  Telegram alerts, staff-check detection, auto-login
 */

(function () {
    try {
        const s = document.createElement('script');
        s.textContent = `window.confirm = function(m) { console.log('[JB][AUTOCONFIRM]', m); return true; };`;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
    } catch (_) {}
})();

/* === PAGE-LOAD WATCHDOG (standalone) ===
 * Reloads the page if it hangs mid-load (laggy/dropped connection can freeze a
 * page before readyState reaches 'complete'). Capped at MAX_RELOADS to avoid
 * loops; the counter self-clears once a load succeeds or after a quiet period.
 * Directly targets the "tablet runs hours then the page is half-loaded" failure.
 */
(function initPageLoadWatchdog() {
    try {
        if (window.top !== window.self) return; // main frame only
        const LOAD_TIMEOUT_MS = 45000;  // not 'complete' within 45s → reload
        const MAX_RELOADS = 4;          // give up after a few tries to avoid loops
        const startedAt = Date.now();
        const reloadKey = 'cbLoadStuckReloads';
        const lastReloadKey = 'cbLoadStuckLastReload';

        // Reset the stuck-reload counter if the last one was a while ago (loads are healthy now)
        const lastReload = parseInt(localStorage.getItem(lastReloadKey) || '0', 10);
        if (lastReload && Date.now() - lastReload > 5 * 60 * 1000) {
            localStorage.removeItem(reloadKey);
            localStorage.removeItem(lastReloadKey);
        }

        const checkLoad = () => {
            if (document.readyState === 'complete') return; // loaded fine
            if (Date.now() - startedAt < LOAD_TIMEOUT_MS) {
                setTimeout(checkLoad, 5000);
                return;
            }
            const reloads = parseInt(localStorage.getItem(reloadKey) || '0', 10);
            if (reloads >= MAX_RELOADS) {
                console.warn('[JB][LOADWATCHDOG] Page hung but max stuck-reloads reached — not reloading again');
                return;
            }
            localStorage.setItem(reloadKey, String(reloads + 1));
            localStorage.setItem(lastReloadKey, String(Date.now()));
            console.warn(`[JB][LOADWATCHDOG] Page hung mid-load (>${LOAD_TIMEOUT_MS/1000}s) — reloading (attempt ${reloads + 1}/${MAX_RELOADS})`);
            try { window.stop(); } catch (e) {}
            location.reload();
        };

        // Clear the counter once the page finishes loading normally
        window.addEventListener('load', () => {
            localStorage.removeItem(reloadKey);
            localStorage.removeItem(lastReloadKey);
        });

        setTimeout(checkLoad, 5000);
    } catch (e) {}
})();

(function blockLogoutRedirect() {
  try {
    if (!window.location.search.includes('act=out')) return;
    // A deliberate logout (e.g. sleep-mode sign-out) sets this flag first, so
    // only accidental/stray logout URLs get bounced back to the game.
    if (localStorage.getItem('cbLogoutIntent') === '1') {
      localStorage.removeItem('cbLogoutIntent');
      console.log('[JB] Intentional logout — allowing');
      return;
    }
    console.log('[JB] Logout URL intercepted — redirecting to home');
    window.location.replace('/authenticated/default.aspx');
  } catch (_) {}
})();

(function () {
  'use strict';

  /* === CONSTANTS & HELPERS === */

  const APP_NAME    = 'Jarvis Bot';
  const APP_VERSION = '2000.287';
  const APP_TAG     = '[JB]';

  // Verbose logging (off by default) — gates high-frequency chatter like the
  // 60s travel-timer poll so the console stays readable overnight. Real events
  // (crimes, watch triggers, logouts, watchdog) always log.
  let _debug = GM_getValue('cbDebug', false);
  function dlog(...a) { if (_debug) console.log(...a); }

  // Known staff accounts (profile IDs)
  const STAFF_IDS = {
    system: 1,
    marc:   2,
    sql:    3,
    stipe:  4
  };
  const STAFF_NAMES = Object.keys(STAFF_IDS);

  function isStaffSender(name) {
    return STAFF_NAMES.includes(String(name || '').trim().toLowerCase());
  }

  function isStaffProfileLink(href) {
    const m = String(href || '').match(/[?&]id=(\d+)/i);
    if (!m) return false;
    const id = parseInt(m[1], 10);
    return Object.values(STAFF_IDS).includes(id);
  }

  function isStaffRow(row) {
    if (!row) return false;
    const links = row.querySelectorAll('a[href*="profile.aspx"]');
    for (const lnk of links) {
      if (isStaffProfileLink(lnk.getAttribute('href'))) return true;
      if (isStaffSender(lnk.textContent)) return true;
    }
    return false;
  }

  const _pad = n => String(n).padStart(2, '0');
  function fmtDate(d) {
    if (!(d instanceof Date)) d = new Date();
    return `${_pad(d.getDate())}.${_pad(d.getMonth()+1)}.${d.getFullYear()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
  }

  function esc(s) {
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function fmtAgo(ts) {
    if (!ts) return 'Never';
    const d = Date.now() - ts;
    return `${Math.floor(d/60000)}m ${Math.floor((d%60000)/1000)}s ago`;
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* === PAGE EXCLUSIONS === */

  /* DELIBERATELY EMPTY (2000.254) — Jarvis now runs on every authenticated page.
   *
   * An excluded page is a page where this whole IIFE returns before init(), so
   * nothing runs there: no UI, no main loop, and — the reason for emptying it —
   * no XP interceptor. The game's own status poll fires every 15s while a page
   * sits open, but with the script absent there is nobody listening, so time
   * spent on an excluded page produced no XP readings and its gains surfaced
   * later bundled into one lump.
   *
   * TEMPER YOUR EXPECTATIONS, and know the history before re-running it as an
   * experiment: 2000.225 already cut this list to the forum alone, for exactly
   * this reason, and it did NOT fix XP capture. The cause then was timing, not
   * exclusions — solved by maybeForceStatRefresh (226) and the 20s poll (245).
   * This buys back the readings lost while parked on one of these pages; it is
   * not a fix for anything else.
   *
   * THE REAL COST is behavioural, not technical: these were the pages you could
   * browse by hand without Jarvis dragging you off them. The main loop now runs
   * here too, so opening the forum or a statistics page while the actions are on
   * means being navigated to crimes.aspx a few seconds later. If that becomes
   * annoying, the answer is to re-add the specific page below rather than to
   * reach for the ALL switch.
   *
   * The matching logic underneath is untouched and handles an empty list fine —
   * re-add any of these to restore the old behaviour for that page:
   *   '/authenticated/forum.aspx', '/authenticated/personal.aspx',
   *   '/authenticated/store.aspx?p=b', '/authenticated/statistics.aspx?p=C',
   *   '/authenticated/statistics.aspx?p=G', '/authenticated/statistics.aspx?p=p',
   *   '/authenticated/statistics.aspx?p=n'
   */
  const SKIP_PAGES = [];
  // Query-string values are matched case-sensitively (path is not) — e.g.
  // "?p=C" must not accidentally exclude "?p=c".
  const _curPathLower = window.location.pathname.toLowerCase();
  const _curSearch = window.location.search;
  const _curPath = _curPathLower + _curSearch;
  if (SKIP_PAGES.some(p => {
    const qIdx = p.indexOf('?');
    if (qIdx === -1) return _curPathLower.includes(p.toLowerCase());
    return _curPathLower.includes(p.slice(0, qIdx).toLowerCase()) && _curSearch.includes(p.slice(qIdx));
  })) {
    console.log(APP_TAG, 'Excluded page, skipping:', _curPath);
    return;
  }

  /* === OFFICE THEME SYSTEM === */

  const THEMES = {
    light: {
      bg:          '#f3f2f1',
      surface:     '#ffffff',
      surfaceAlt:  '#faf9f8',
      border:      '#edebe9',
      borderStrong:'#c8c6c4',
      text:        '#323130',
      textSec:     '#605e5c',
      textTer:     '#a19f9d',
      accent:      '#0078d4',
      accentHover: '#106ebe',
      accentLight: '#deecf9',
      success:     '#107c10',
      warning:     '#797673',
      danger:      '#a4262c',
      dangerBg:    '#fde7e9',
      headerBg:    '#0078d4',
      headerText:  '#ffffff',
      inputBg:     '#ffffff',
      inputBorder: '#8a8886',
      shadow:      '0 1.6px 3.6px rgba(0,0,0,.132), 0 0.3px 0.9px rgba(0,0,0,.108)',
      switchOn:    '#0078d4',
      switchOff:   '#c8c6c4',
      ribbonBg:    '#f3f2f1',
      ribbonBorder:'#edebe9',
      ribbonOn:    '#0078d4',
      ribbonOnText:'#ffffff',
      ribbonOff:   '#c8c6c4',
      ribbonOffText:'#323130'
    },
    dark: {
      bg:          '#1b1a19',
      surface:     '#252423',
      surfaceAlt:  '#2d2c2b',
      border:      '#3b3a39',
      borderStrong:'#484644',
      text:        '#f3f2f1',
      textSec:     '#c8c6c4',
      textTer:     '#8a8886',
      accent:      '#2b88d8',
      accentHover: '#3aa0f0',
      accentLight: '#1a3a5c',
      success:     '#57a773',
      warning:     '#c8c6c4',
      danger:      '#e74856',
      dangerBg:    '#442726',
      headerBg:    '#0078d4',
      headerText:  '#ffffff',
      inputBg:     '#1b1a19',
      inputBorder: '#605e5c',
      shadow:      '0 1.6px 3.6px rgba(0,0,0,.4), 0 0.3px 0.9px rgba(0,0,0,.3)',
      switchOn:    '#2b88d8',
      switchOff:   '#484644',
      ribbonBg:    '#2d2c2b',
      ribbonBorder:'#3b3a39',
      ribbonOn:    '#2b88d8',
      ribbonOnText:'#ffffff',
      ribbonOff:   '#484644',
      ribbonOffText:'#c8c6c4'
    },
    classic: {
      bg:          '#111827',
      surface:     '#111827',
      surfaceAlt:  '#0f1724',
      border:      '#1f2937',
      borderStrong:'#2d3748',
      text:        '#e5e7eb',
      textSec:     '#9ca3af',
      textTer:     '#6b7280',
      accent:      '#10b981',
      accentHover: '#34d399',
      accentLight: '#064e3b',
      success:     '#10b981',
      warning:     '#f59e0b',
      danger:      '#ef4444',
      dangerBg:    '#7f1d1d',
      headerBg:    'linear-gradient(180deg, #0b1220, #0f1724)',
      headerText:  '#e5e7eb',
      inputBg:     '#0b1220',
      inputBorder: '#334155',
      shadow:      '0 2px 6px rgba(0,0,0,.5)',
      switchOn:    '#10b981',
      switchOff:   '#475569',
      ribbonBg:    '#0f1724',
      ribbonBorder:'#1f2937',
      ribbonOn:    '#10b981',
      ribbonOnText:'#ffffff',
      ribbonOff:   '#334155',
      ribbonOffText:'#9ca3af'
    },
    /* Maximum legibility: near-black behind pure white, and every "secondary"
       tone pulled far brighter than the other themes dare. Nothing here is
       subtle — that is the point. Best pick for a dim room or tired eyes. */
    contrast: {
      bg:          '#000000',
      surface:     '#0a0a0a',
      surfaceAlt:  '#161616',
      border:      '#3a3a3a',
      borderStrong:'#6a6a6a',
      text:        '#ffffff',
      textSec:     '#e0e0e0',
      textTer:     '#b0b0b0',
      accent:      '#00b3ff',
      accentHover: '#4dcaff',
      accentLight: '#00131f',
      success:     '#00e676',
      warning:     '#ffd400',
      danger:      '#ff5252',
      dangerBg:    '#2b0000',
      headerBg:    '#00b3ff',
      headerText:  '#000000',
      inputBg:     '#000000',
      inputBorder: '#8a8a8a',
      shadow:      '0 0 0 1px #6a6a6a, 0 4px 12px rgba(0,0,0,.9)',
      switchOn:    '#00e676',
      switchOff:   '#5a5a5a',
      ribbonBg:    '#0a0a0a',
      ribbonBorder:'#3a3a3a',
      ribbonOn:    '#00e676',
      ribbonOnText:'#000000',
      ribbonOff:   '#3a3a3a',
      ribbonOffText:'#e0e0e0'
    },
    // Deep blue dark — softer than pure dark, still high separation.
    midnight: {
      bg:          '#0d1b2a',
      surface:     '#12263a',
      surfaceAlt:  '#1b3a4d',
      border:      '#274b6d',
      borderStrong:'#3d6a92',
      text:        '#e8f1f8',
      textSec:     '#a9c4da',
      textTer:     '#7d9db6',
      accent:      '#4cc9f0',
      accentHover: '#7ad9f7',
      accentLight: '#123449',
      success:     '#52d98a',
      warning:     '#ffc857',
      danger:      '#ff6b6b',
      dangerBg:    '#3d1a1a',
      headerBg:    'linear-gradient(180deg, #17324c, #12263a)',
      headerText:  '#e8f1f8',
      inputBg:     '#0d1b2a',
      inputBorder: '#3d6a92',
      shadow:      '0 2px 8px rgba(0,0,0,.6)',
      switchOn:    '#4cc9f0',
      switchOff:   '#3d6a92',
      ribbonBg:    '#12263a',
      ribbonBorder:'#274b6d',
      ribbonOn:    '#4cc9f0',
      ribbonOnText:'#04283a',
      ribbonOff:   '#274b6d',
      ribbonOffText:'#a9c4da'
    },
    // Warm and low-blue — easier for long evening sessions.
    amber: {
      bg:          '#1c1710',
      surface:     '#241d14',
      surfaceAlt:  '#2f261a',
      border:      '#453724',
      borderStrong:'#63502f',
      text:        '#f5e6d0',
      textSec:     '#d4bd9a',
      textTer:     '#a8916f',
      accent:      '#ffab40',
      accentHover: '#ffc06b',
      accentLight: '#3a2a12',
      success:     '#a8c256',
      warning:     '#ffd54f',
      danger:      '#e57373',
      dangerBg:    '#3a1f1c',
      headerBg:    '#8a5a1a',
      headerText:  '#fff6e6',
      inputBg:     '#1c1710',
      inputBorder: '#63502f',
      shadow:      '0 2px 8px rgba(0,0,0,.55)',
      switchOn:    '#ffab40',
      switchOff:   '#453724',
      ribbonBg:    '#241d14',
      ribbonBorder:'#453724',
      ribbonOn:    '#ffab40',
      ribbonOnText:'#2b1c05',
      ribbonOff:   '#453724',
      ribbonOffText:'#d4bd9a'
    },
    // Bright, low-glare light alternative to the stark white Office one.
    ocean: {
      bg:          '#eef4f8',
      surface:     '#ffffff',
      surfaceAlt:  '#e3edf4',
      border:      '#cbdce8',
      borderStrong:'#9ebacd',
      text:        '#10303f',
      textSec:     '#3c5f73',
      textTer:     '#6c8ba0',
      accent:      '#00796b',
      accentHover: '#00968a',
      accentLight: '#d3ece8',
      success:     '#2e7d32',
      warning:     '#a1651a',
      danger:      '#b3261e',
      dangerBg:    '#fbe2e0',
      headerBg:    '#00796b',
      headerText:  '#ffffff',
      inputBg:     '#ffffff',
      inputBorder: '#7fa3b8',
      shadow:      '0 1.6px 4px rgba(16,48,63,.18)',
      switchOn:    '#00796b',
      switchOff:   '#9ebacd',
      ribbonBg:    '#e3edf4',
      ribbonBorder:'#cbdce8',
      ribbonOn:    '#00796b',
      ribbonOnText:'#ffffff',
      ribbonOff:   '#cbdce8',
      ribbonOffText:'#10303f'
    }
  };

  // Order + labels for the picker and the header cycle button.
  const THEME_LIST = [
    ['dark',     '◑ Dark'],
    ['light',    '☀ Light'],
    ['classic',  '🟢 Classic'],
    ['contrast', '⬛ High contrast'],
    ['midnight', '🌌 Midnight'],
    ['amber',    '🔶 Amber (warm)'],
    ['ocean',    '🌊 Ocean (light)']
  ];

  let activeTheme = GM_getValue('cbTheme', 'dark');
  function T() { return THEMES[activeTheme] || THEMES.dark; }

  function setTheme(name) {
    activeTheme = name;
    GM_setValue('cbTheme', name);
    applyThemeVars();
  }

  function applyThemeVars() {
    if (!_shadow) return;
    const t = T();
    const root = _shadow.querySelector('.jb-root');
    if (!root) return;
    for (const [k,v] of Object.entries(t)) {
      root.style.setProperty(`--jb-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`, v);
    }
  }

  /* === HOST CONTAINER CSS === */

  GM_addStyle(`
    #jb-host {
      position: fixed !important;
      top: 12px; right: 12px;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      visibility: hidden !important;
    }
    #jb-host.jb-ready { visibility: visible !important; }
  `);

  /* === LOGIN CONFIG === */

  const LOGIN = {
    user: GM_getValue('cbLoginUser', 'username'),
    pass: GM_getValue('cbLoginPass', 'password'),
    autoSubmit: GM_getValue('cbAutoSubmit', true),
    maxAttempts: 3,
    delay: 3000
  };

  /* === CAPTCHA SOLVER (CapSolver API — optional) ===
   * Optional automated reCAPTCHA v2 solve on the login page. Off unless a
   * CapSolver key is set in settings; with no key, Jarvis keeps its existing
   * behaviour of pausing and alerting for a manual solve. Talks only to
   * api.capsolver.com (a paid third-party service that consumes solver credits).
   * Uses plain fetch so no @connect entry is needed.
   */

  const LS_CAPSOLVER_KEY = 'cbCapsolverKey';
  function getCapsolverKey() { return (localStorage.getItem(LS_CAPSOLVER_KEY) || '').trim(); }
  function setCapsolverKey(k) { localStorage.setItem(LS_CAPSOLVER_KEY, (k || '').trim()); }

  /* WHICH CHALLENGE IS ON THE PAGE (2000.287).
   *
   * The site serves Cloudflare Turnstile on some login visits and reCAPTCHA on
   * others (see 2000.276). CapSolver needs a DIFFERENT TASK TYPE for each —
   * submitting a Turnstile sitekey as a ReCaptchaV2 task simply fails — it
   * returns the answer under a different key, and the answer has to be written
   * into a different field. All three were reCAPTCHA-only here, so with a
   * CapSolver key set the paid auto-solve could never work on a Turnstile page.
   *
   * 2000.276 is unaffected and was a different problem: READING a token that
   * something else had already solved. That handles both providers already.
   * This is only the auto-solve path.
   */
  function capIsTurnstile() {
    return !!document.querySelector('.cf-turnstile[data-sitekey], input[name="cf-turnstile-response"]');
  }

  async function solveCaptchaWithCapsolver(siteKey, pageUrl) {
    const apiKey = getCapsolverKey();
    if (!apiKey) return null;
    const clog = (...a) => console.log('[JB CapSolver]', ...a);
    // Turnstile and reCAPTCHA are different products with different task types.
    const taskType = capIsTurnstile() ? 'AntiTurnstileTaskProxyLess' : 'ReCaptchaV2TaskProxyless';
    try {
      clog('Submitting captcha as ' + taskType + '…');
      const createRes = await fetch('https://api.capsolver.com/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: apiKey,
          task: { type: taskType, websiteURL: pageUrl, websiteKey: siteKey }
        })
      });
      const createData = await createRes.json();
      if (createData.errorId > 0) { clog('create error:', createData.errorCode, createData.errorDescription); return null; }
      const taskId = createData.taskId;
      clog('task created:', taskId);

      const POLL_DEADLINE_MS = 120000;
      const start = Date.now();
      await new Promise(r => setTimeout(r, 2000));
      let poll = 0;
      while (Date.now() - start < POLL_DEADLINE_MS) {
        const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientKey: apiKey, taskId })
        });
        const resultData = await resultRes.json();
        if (resultData.errorId > 0) { clog('result error:', resultData.errorCode); return null; }
        if (resultData.status === 'ready') {
          // Turnstile answers under `token`, reCAPTCHA under `gRecaptchaResponse`.
          const sol = resultData.solution || {};
          const token = sol.token || sol.gRecaptchaResponse;
          clog(`solved in ${Math.round((Date.now() - start) / 1000)}s`);
          return token || null;
        }
        poll++;
        if (poll % 5 === 0) clog(`pending… (${Math.round((Date.now() - start) / 1000)}s)`);
        await new Promise(r => setTimeout(r, 1500));
      }
      clog('timed out after 120s');
      return null;
    } catch (e) {
      clog('fetch error:', e);
      return null;
    }
  }

  // The sitekey of whichever widget is present (data-sitekey, or the reCAPTCHA
  // iframe's k= param). Turnstile is checked FIRST: a page carrying both must be
  // solved as Turnstile, because that is the one gating the form.
  function findCaptchaSiteKey() {
    const el = document.querySelector('.cf-turnstile[data-sitekey]') ||
               document.querySelector('.g-recaptcha[data-sitekey]') ||
               document.querySelector('[data-sitekey]');
    if (el && el.getAttribute('data-sitekey')) return el.getAttribute('data-sitekey');
    const ifr = document.querySelector('iframe[src*="recaptcha"][src*="k="]');
    if (ifr) { const m = ifr.getAttribute('src').match(/[?&]k=([^&]+)/); if (m) return decodeURIComponent(m[1]); }
    return null;
  }

  // Write a solved token into whichever response field this page uses, and fire
  // any grecaptcha callback so the page treats the captcha as completed.
  function injectCaptchaToken(token) {
    if (!token) return false;
    if (capIsTurnstile()) {
      let inp = document.querySelector('input[name="cf-turnstile-response"]');
      if (!inp) {
        inp = document.createElement('input');
        inp.type = 'hidden'; inp.name = 'cf-turnstile-response';
        // Into the FORM, not the body — it has to be posted to be worth anything.
        (document.forms[0] || document.body).appendChild(inp);
      }
      inp.value = token;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      /* No callback to invoke: Turnstile keeps its widget in a CLOSED shadow
       * root, so there is nothing reachable to call the way grecaptcha's config
       * can be walked below. Writing the field is the whole of what a page can
       * do — and the field is what gets posted, which is what matters. */
      return true;
    }
    let ta = document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
    if (!ta) {
      ta = document.createElement('textarea');
      ta.name = 'g-recaptcha-response';
      ta.id = 'g-recaptcha-response';
      ta.style.display = 'none';
      document.body.appendChild(ta);
    }
    ta.value = token;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
        // Best-effort: walk the widget config for a callback and invoke it.
        const clients = window.___grecaptcha_cfg.clients;
        for (const cid in clients) {
          const c = clients[cid];
          for (const k in c) {
            const o = c[k];
            if (o && typeof o === 'object') {
              for (const kk in o) {
                const oo = o[kk];
                if (oo && typeof oo.callback === 'function') { try { oo.callback(token); } catch(_){} }
              }
            }
          }
        }
      }
    } catch(_) {}
    return true;
  }

  /* === LOGOUT ALERTS === */

  const logoutAlert = {
    tabFlash:  GM_getValue('cbLogoutFlash', true),
    notify:    GM_getValue('cbLogoutNotify', true)
  };

  function saveLogoutAlert() {
    GM_setValue('cbLogoutFlash', logoutAlert.tabFlash);
    GM_setValue('cbLogoutNotify', logoutAlert.notify);
  }

  let _flashTimer = null;
  const _origTitle = document.title;

  function startFlash() {
    if (_flashTimer) return;
    let tog = false;
    _flashTimer = setInterval(() => {
      document.title = tog ? '🔴 LOGIN NEEDED' : _origTitle;
      tog = !tog;
    }, 1000);
  }

  function stopFlash() {
    if (_flashTimer) { clearInterval(_flashTimer); _flashTimer = null; document.title = _origTitle; }
  }

  function canNotify() { return 'Notification' in window; }

  function askNotifyPerm() {
    if (!canNotify()) return Promise.resolve('unsupported');
    if (Notification.permission === 'default') return Notification.requestPermission().catch(() => 'denied');
    return Promise.resolve(Notification.permission);
  }

  function showNotify(title, body) {
    if (!canNotify()) return;
    const fire = () => {
      try { new Notification(title, { body, requireInteraction: true }); } catch(_){}
    };
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission === 'default') Notification.requestPermission().then(p => { if (p==='granted') fire(); });
  }

  function fireLogoutAlerts() {
    if (logoutAlert.tabFlash) startFlash();
    if (logoutAlert.notify) showNotify('Session Expired', 'Click to log back in');
  }

  /* === EARLY LOGOUT TELEGRAM === */

  const LS_LO_TS  = 'cbLogoutTs';
  const LS_LO_KEY = 'cbLogoutKey';
  const LO_COOLDOWN = 2 * 60 * 1000;

  function loAlertKey(url) {
    if (url.includes('act=out')) return 'act-out';
    if (url.includes('timeout')) return 'timeout';
    if (url.includes('session')) return 'session';
    if (url.includes('auto=true')) return 'auto';
    return 'login-page';
  }

  function loWasSent(key) {
    try {
      const ts = parseInt(localStorage.getItem(LS_LO_TS)||'0',10);
      const k  = localStorage.getItem(LS_LO_KEY)||'';
      return ts && (Date.now()-ts) < LO_COOLDOWN && k === key;
    } catch(_) { return false; }
  }

  function loMarkSent(key) {
    try {
      localStorage.setItem(LS_LO_TS, String(Date.now()));
      localStorage.setItem(LS_LO_KEY, key);
    } catch(_){}
  }

  function loClearState() {
    try { localStorage.removeItem(LS_LO_TS); localStorage.removeItem(LS_LO_KEY); } catch(_){}
  }

  function earlyLogoutTelegram(src = 'login') {
    try {
      const tgOn   = GM_getValue('cbTgEnabled', false);
      const loOn   = GM_getValue('cbNotifyLogout', true);
      const token  = GM_getValue('cbTgToken', '');
      const chatId = GM_getValue('cbTgChat', '');
      if (!tgOn || !loOn || !token || !chatId) return false;

      const url = window.location.href.toLowerCase();
      const key = loAlertKey(url);
      const isExplicit = key !== 'login-page';
      const hasForm = !!document.querySelector('input[name="ctl00$main$txtUsername"], input[type="password"]');
      if (!url.includes('login.aspx') && !hasForm) return false;
      if (!isExplicit && !hasForm && document.readyState === 'loading') return false;
      if (loWasSent(key)) return false;

      const kind = isExplicit ? 'LOGOUT/TIMEOUT' : 'SESSION LOST';
      const msg = `🚪 <b>${kind}</b>\n${GM_getValue('cbPlayer','')||'?'} | ${fmtDate()}\nPlease log back in`;

      loMarkSent(key);
      GM_xmlhttpRequest({
        method:'POST', url:`https://api.telegram.org/bot${token}/sendMessage`,
        timeout:15000, headers:{'Content-Type':'application/json'},
        data:JSON.stringify({chat_id:chatId, text:msg, parse_mode:'HTML'}),
        onload: r => { if(r.status!==200) loClearState(); },
        onerror: () => loClearState(),
        ontimeout: () => loClearState()
      });
      return true;
    } catch(_) { return false; }
  }

  /* === SESSION REFRESH REDIRECT === */

  const _path   = window.location.pathname.toLowerCase();
  const _search  = window.location.search.toLowerCase();

  if (_path.includes('/default.aspx') && _search.includes('show=1')) {
    console.log(APP_TAG, 'Session refresh — redirecting in 6s');
    const ov = document.createElement('div');
    Object.assign(ov.style, {
      position:'fixed',top:'10px',right:'10px',background:'rgba(0,0,0,.85)',color:'#fff',
      padding:'12px',borderRadius:'4px',fontFamily:'Segoe UI,sans-serif',fontSize:'13px',
      zIndex:'9999',textAlign:'center',minWidth:'220px',border:'1px solid #0078d4'
    });
    ov.innerHTML = `🔄 <b>Redirecting</b> in <span id="jb-cd">6</span>s...`;
    document.body.appendChild(ov);
    let cd = 6;
    const ci = setInterval(() => {
      cd--;
      const el = document.getElementById('jb-cd');
      if (el) el.textContent = cd;
      if (cd <= 0) { clearInterval(ci); window.location.href = 'https://www.tmn2010.net/login.aspx'; }
    }, 1000);
    return;
  }

  /* === LOGIN PAGE HANDLER === */

  const _isLogin = _path.includes('/login.aspx');

  if (_isLogin) {
    fireLogoutAlerts();
    earlyLogoutTelegram('login-start');
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', () => earlyLogoutTelegram('login-dom'), { once:true });
    else
      setTimeout(() => earlyLogoutTelegram('login-ready'), 800);

    const UID = 'ctl00_main_txtUsername';
    const PID = 'ctl00_main_txtPassword';
    const BID = 'ctl00_main_btnLogin';
    /* THE RESPONSE FIELD, WHOEVER PROVIDES IT (2000.276).
     *
     * This matched only reCAPTCHA's `g-recaptcha-response` textarea. The site now
     * puts a Cloudflare challenge on some pages, and Turnstile writes its token
     * to a differently-named HIDDEN INPUT — so getToken() returned '', and the
     * submit condition below (which requires a token) never opened. The
     * challenge was being solved and Login was simply never clicked.
     *
     * Matched by SHAPE rather than one exact name, so a provider change or a
     * renamed field does not silently break it again. The exact names are logged
     * once per page, which is the thing that was missing when this had to be
     * diagnosed. */
    const TOK = [
      'textarea[name="g-recaptcha-response"]', '#g-recaptcha-response',
      'input[name="cf-turnstile-response"]', 'textarea[name="h-captcha-response"]',
      '[name*="turnstile" i]', '[name*="captcha-response" i]', '[name*="cf-chl" i]'
    ].join(',');
    const ERR = '.TMNErrorFont';
    const LS_ATT = 'cbLoginAttempts';
    const LS_PAU = 'cbLoginPaused';
    const LS_TOK = 'cbLastToken';

    let att = parseInt(localStorage.getItem(LS_ATT)||'0',10);
    let paused = localStorage.getItem(LS_PAU) === 'true';
    let lastTok = localStorage.getItem(LS_TOK)||'';
    let subTimer = null, cdTimer = null, overlay = null, locked = false, endTs = 0;

    function log(...a) { console.log('[JB Login]', ...a); }

    /* === STUCK ON THE LOGIN PAGE (2000.287) ===
     *
     * We fire one alert on landing here and then go quiet, so a device that
     * cannot get back in is a DEAD PLAYER, silently, all night — no crimes, no
     * jail, and no answer if a staff check arrives. This chases it.
     *
     * THE NUDGE IS THE USEFUL HALF. ASP.NET keeps the Login button disabled
     * until its handlers are satisfied the fields have been touched, and setting
     * .value programmatically fires none of the events those handlers listen
     * for — so a perfectly filled form can sit there with a dead button for ever.
     * Re-dispatching focus/input/change/blur is what re-enables it. Taken from
     * the reference's tmnNudgeLoginButton (4.20.265).
     *
     * Nudge FIRST and only alert if that did not help: a fault we can fix without
     * bothering you is not worth a notification.
     */
    const LS_LP_SINCE   = 'cbLoginPageSince';
    const LS_LP_ALERTED = 'cbLoginPageAlerted';
    const LS_LP_NUDGE   = 'cbLoginPageNudged';
    const LP_STUCK_MS   = 60 * 1000;         // grace before anything happens
    const LP_REPEAT_MS  = 10 * 60 * 1000;    // then re-alert this often

    /* Self-contained sender, deliberately. `tg` and `tgMsgOn` are declared far
     * BELOW this block and the login branch returns before ever reaching them,
     * so touching either would throw on the temporal dead zone. This is the same
     * reason earlyLogoutTelegram() reads GM storage directly — do not 'tidy'
     * this into sendTg(). */
    function loginStuckTelegram(msg) {
      try {
        if (!GM_getValue('cbTgEnabled', false)) return;
        if (GM_getValue('cbTgMsg_loginStuck', true) === false) return;
        const token = GM_getValue('cbTgToken', ''), chat = GM_getValue('cbTgChat', '');
        if (!token || !chat) return;
        GM_xmlhttpRequest({
          method:'POST', url:'https://api.telegram.org/bot' + token + '/sendMessage',
          timeout:15000, headers:{'Content-Type':'application/json'},
          data:JSON.stringify({ chat_id: chat, text: msg, parse_mode:'HTML' })
        });
      } catch(_) {}
    }

    function nudgeLoginFields() {
      try {
        const u = document.getElementById(UID), p = document.getElementById(PID);
        if (!u || !p) return false;
        [u, p].forEach(el => {
          el.focus();
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        });
        log('Nudged the login fields — trying to re-enable the button');
        return true;
      } catch(_) { return false; }
    }

    function loginStuckTick() {
      const now = Date.now();
      const since = parseInt(localStorage.getItem(LS_LP_SINCE) || '0', 10);
      if (!since) { localStorage.setItem(LS_LP_SINCE, String(now)); return; }
      if (now - since < LP_STUCK_MS) return;

      const btn = document.getElementById(BID);
      if (btn && btn.disabled) {
        const lastNudge = parseInt(localStorage.getItem(LS_LP_NUDGE) || '0', 10);
        if (now - lastNudge >= LP_STUCK_MS) {
          localStorage.setItem(LS_LP_NUDGE, String(now));
          if (nudgeLoginFields()) return;   // give it a cycle before complaining
        }
      }

      const last = parseInt(localStorage.getItem(LS_LP_ALERTED) || '0', 10);
      if (last && now - last < LP_REPEAT_MS) return;
      localStorage.setItem(LS_LP_ALERTED, String(now));
      const mins  = Math.max(1, Math.round((now - since) / 60000));
      const state = !btn ? 'missing' : (btn.disabled ? 'DISABLED' : 'enabled');
      console.warn('[JB Login] Stuck on the login page ' + mins + 'm — button ' + state);
      showOverlay('🔐 Stuck ' + mins + 'm — login button ' + state);
      loginStuckTelegram('🔐 <b>STUCK ON LOGIN</b>' + String.fromCharCode(10) +
        (GM_getValue('cbPlayer','') || '?') + ' | ' + fmtDate() + String.fromCharCode(10) +
        'On the login page ' + mins + 'm — button <b>' + state + '</b>.' + String.fromCharCode(10) +
        'You are logged out and nothing is running.');
    }

    function showOverlay(msg) {
      if (!overlay) {
        overlay = document.createElement('div');
        Object.assign(overlay.style, {
          position:'fixed',top:'10px',right:'10px',background:'rgba(0,0,0,.85)',color:'#fff',
          padding:'12px',borderRadius:'4px',fontFamily:'Segoe UI,sans-serif',fontSize:'13px',
          zIndex:'9999',whiteSpace:'pre-line',lineHeight:'1.4',textAlign:'center',
          minWidth:'220px',border:'1px solid #0078d4'
        });
        document.body.appendChild(overlay);
      }
      overlay.textContent = `${APP_NAME} ${APP_VERSION}\n${msg}`;
    }

    function clearTimers() {
      if (subTimer) { clearTimeout(subTimer); subTimer = null; }
      if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
      locked = false; endTs = 0;
    }

    function resetLogin() {
      if (paused || att >= LOGIN.maxAttempts) {
        localStorage.setItem(LS_ATT, '0');
        localStorage.setItem(LS_PAU, 'false');
        att = 0; paused = false;
      }
    }

    let _tokLogged = false;
    // Every candidate response field on the page, de-duplicated.
    function tokenFields() {
      const seen = new Set(), out = [];
      document.querySelectorAll(TOK).forEach(el => {
        const k = el.name || el.id || String(out.length);
        if (seen.has(k)) return;
        seen.add(k); out.push(el);
      });
      return out;
    }
    function getToken() {
      const fields = tokenFields();
      if (!_tokLogged) {
        _tokLogged = true;
        log(fields.length
          ? 'captcha response field(s): ' + fields.map(e => `${e.name || e.id || '(unnamed)'} [${e.tagName.toLowerCase()}] = ${(e.value||'').trim() ? 'FILLED' : 'empty'}`).join(' · ')
          : 'no captcha response field found on this page');
      }
      for (const el of fields) {
        const v = (el.value || '').trim();
        if (v) return v;
      }
      return '';
    }

    function captchaDone() {
      // Any provider's token counts, not just reCAPTCHA's — see getToken().
      if (getToken()) return true;
      const btn = document.getElementById(BID);
      const u = document.getElementById(UID);
      const p = document.getElementById(PID);
      return btn && !btn.disabled && u && u.value.length > 0 && p && p.value.length > 0;
    }

    function fillCreds() {
      if (LOGIN.user === 'your_username_here' || LOGIN.pass === 'your_password_here') {
        showOverlay('⚠️ Set credentials in settings'); return false;
      }
      const u = document.getElementById(UID);
      const p = document.getElementById(PID);
      if (u && p) { u.value = LOGIN.user; p.value = LOGIN.pass; return true; }
      return false;
    }

    function canAuto() {
      if (LOGIN.user === 'your_username_here' || LOGIN.pass === 'your_password_here') return false;
      if (!LOGIN.autoSubmit) { showOverlay('Credentials filled.\nSolve captcha manually.'); return false; }
      return true;
    }

    function tryLogin() {
      const btn = document.getElementById(BID);
      const tok = getToken();
      if (!btn || btn.disabled || !tok) {
        if (!tryLogin._r) tryLogin._r = 0;
        tryLogin._r++;
        if (tryLogin._r <= 3) { setTimeout(tryLogin, 500); return; }
        tryLogin._r = 0; clearTimers();
        showOverlay('⚠️ Waiting for captcha...'); return;
      }
      tryLogin._r = 0; clearTimers();
      att++; localStorage.setItem(LS_ATT, String(att));
      lastTok = tok; localStorage.setItem(LS_TOK, lastTok);
      showOverlay(`🔐 Submitting ${att}/${LOGIN.maxAttempts}...`);
      btn.click();
    }

    function scheduleSubmit(delay = LOGIN.delay) {
      if (locked) return;
      clearTimers(); locked = true;
      endTs = Date.now() + delay;
      const updateCd = () => {
        const rem = Math.ceil((endTs - Date.now())/1000);
        if (rem > 0) showOverlay(`✅ Captcha done — submitting in ${rem}s`);
      };
      updateCd();
      cdTimer = setInterval(updateCd, 500);
      subTimer = setTimeout(() => { clearInterval(cdTimer); cdTimer = null; tryLogin(); }, delay);
    }

    function checkLogin() {
      if (locked) return;
      const err = document.querySelector(ERR);
      if (err) {
        const msg = (err.textContent||'').trim().toLowerCase();
        if (msg.includes('incorrect validation') || msg.includes('invalid')) {
          clearTimers(); lastTok = '';
          localStorage.removeItem(LS_TOK);
          localStorage.setItem(LS_ATT,'0'); localStorage.setItem(LS_PAU,'false');
          showOverlay('❌ Failed — redirecting...');
          setTimeout(() => { window.location.href = 'https://www.tmn2010.net/Default.aspx?show=1'; }, 2000);
          return;
        }
      }
      if (!canAuto()) return;
      const btn = document.getElementById(BID);
      const done = captchaDone();
      const tok = getToken();
      if (btn && !btn.disabled && done && tok && tok !== lastTok && !subTimer) {
        showOverlay('✅ Captcha done — submitting...');
        scheduleSubmit(LOGIN.delay + Math.floor(Math.random()*2000));
      } else if (subTimer && (!done || !tok || (btn && btn.disabled))) {
        clearTimers();
        showOverlay(done ? (tok ? '⏳ Waiting...' : '⏳ Waiting for token...') : '⏳ Waiting for captcha...');
      }
    }

    let _autoSolveTried = false, _autoSolveWaits = 0;
    function maybeAutoSolveCaptcha() {
      if (_autoSolveTried) return;
      if (!getCapsolverKey()) return;   // no key → keep existing manual-solve behaviour
      if (getToken()) return;           // already solved
      const siteKey = findCaptchaSiteKey();
      if (!siteKey) {                   // widget may not have loaded yet — retry briefly
        if (_autoSolveWaits++ < 20) setTimeout(maybeAutoSolveCaptcha, 1000);
        return;
      }
      _autoSolveTried = true;
      showOverlay(capIsTurnstile() ? '🤖 Solving Turnstile…' : '🤖 Solving captcha…');
      solveCaptchaWithCapsolver(siteKey, window.location.href).then(token => {
        if (token) {
          injectCaptchaToken(token);
          showOverlay('✅ Captcha solved — submitting…');
          // checkLogin()'s 1s interval detects the injected token and submits.
        } else {
          _autoSolveTried = false;      // let a manual solve (or later retry) take over
          showOverlay('⚠️ Auto-solve failed — solve captcha manually.');
        }
      });
    }

    function initLogin() {
      resetLogin();

      /* Halted — do not log back in.
       *
       * The halt lets the session lapse on purpose, so an auto-login here would
       * undo the whole thing: back in, keep-alive running, polls resuming, right
       * after you deliberately stopped. Read straight from GM storage because
       * this branch runs long before `st` exists.
       */
      if (GM_getValue('cbHalted', false)) {
        showOverlay('⛔ Jarvis STOPPED\nAuto-login disabled.\nTick ALL on the panel to resume.');
        console.log('[JB Login] Halted — not logging in');
        return;
      }

      // Watch-logout parking: we've just logged out because a watched player
      // came online. Leave TMN entirely so the captcha/auto-login can't fire.
      // The tab sits off-site until you manually come back.
      if (GM_getValue('cbLogoutPark', '') === '1') {
        GM_setValue('cbLogoutPark', '');   // consume — park once
        const park = GM_getValue('cbLogoutParkUrl', 'https://www.google.co.uk') || 'https://www.google.co.uk';
        console.log('[JB Login] Watch-logout — parking off-site at', park);
        try { showOverlay('🚪 Logged out — leaving site'); } catch(_) {}
        location.replace(park);
        return;
      }

      // Check sleep mode — don't auto-login during sleep window
      if (GM_getValue('jbSleepOn', false)) {
        const sleepTime = GM_getValue('jbSleepTime', '23:00');
        const wakeTime = GM_getValue('jbWakeTime', '07:00');
        const sleepMode = GM_getValue('jbSleepMode', 'daily');
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = String(sleepTime).split(':').map(Number);
        const [wh, wm] = String(wakeTime).split(':').map(Number);
        const sleepMin = (sh||23) * 60 + (sm||0);
        const wakeMin = (wh||7) * 60 + (wm||0);
        const dow = now.getDay();

        let inSleep = false;
        const dayMatch = (sleepMode === 'daily') ||
                         (sleepMode === 'weekdays' && dow >= 1 && dow <= 5) ||
                         (sleepMode === 'weekends' && (dow === 0 || dow === 6));

        if (dayMatch) {
          if (sleepMin > wakeMin) inSleep = nowMin >= sleepMin || nowMin < wakeMin;
          else inSleep = nowMin >= sleepMin && nowMin < wakeMin;
        }

        if (inSleep) {
          GM_setValue('jbIsSleeping', true);
          showOverlay(`😴 Sleep mode\nAuto-login disabled until ${wakeTime}`);
          console.log('[JB Login] Sleep mode active — skipping auto-login until', wakeTime);
          // Recheck every 60s in case wake time arrives
          setTimeout(() => location.reload(), 60000);
          return;
        } else {
          GM_setValue('jbIsSleeping', false);
        }
      }

      if (!fillCreds()) return;

      // Online-watch logout window: stay signed out until it expires.
      const owUntil = GM_getValue('cbOwLogoutUntil', 0);
      if (owUntil && Date.now() < owUntil) {
        const remMin = Math.ceil((owUntil - Date.now()) / 60000);
        showOverlay(`🚪 Watched player online\\nAuto-login paused (${remMin}m left)`);
        console.log('[JB Login] Watch-logout active — skipping auto-login for', remMin, 'min');
        setTimeout(() => location.reload(), 60000);
        return;
      }

      /* Past every deliberate reason to be here (halted, parked, sleeping, a
       * watch-logout window), so from now on still sitting on this page is a
       * fault worth chasing rather than a state we chose. */
      const lpIv = setInterval(loginStuckTick, 20000);
      window.addEventListener('beforeunload', () => clearInterval(lpIv));
      loginStuckTick();

      if (canAuto()) {
        showOverlay('Solve captcha to continue...');
        const iv = setInterval(checkLogin, 1000);
        window.addEventListener('beforeunload', () => { clearInterval(iv); clearTimers(); });
        maybeAutoSolveCaptcha();
      }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLogin);
    else setTimeout(initLogin, 500);
    return;
  }

  /* === AUTH PAGE SETUP === */

  if (_path.includes('/authenticated/')) {
    localStorage.removeItem(LS_LO_TS);
    // We are in — retire the stuck-login watchdog's stamps so the next visit to
    // the login page starts its clock from scratch.
    ['cbLoginPageSince','cbLoginPageAlerted','cbLoginPageNudged'].forEach(k => localStorage.removeItem(k));
    const la = parseInt(localStorage.getItem('cbLoginAttempts')||'0',10);
    if (la > 0 || localStorage.getItem('cbLoginPaused') === 'true') {
      localStorage.setItem('cbLoginAttempts','0');
      localStorage.setItem('cbLoginPaused','false');
      localStorage.removeItem('cbLastToken');
    }
  }

  /* === CAPTCHA HANDLER (AUTHENTICATED) === */

  if (_path.includes('/authenticated/')) {
    let _captchaSent = false;
    setInterval(() => {
      const frame = document.querySelector('iframe[src*="recaptcha"]');
      const resp  = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (frame || resp) {
        const tok = resp?.value?.trim();
        if (tok && tok.length > 0) {
          if (_captchaSent) return;
          const btn = document.querySelector('input[type="submit"], button[type="submit"]') ||
                      document.getElementById('ctl00_main_btnVerify') ||
                      [...document.querySelectorAll('input,button')].find(b =>
                        (b.value||b.textContent||'').toLowerCase().includes('verify'));
          if (btn && !btn.disabled) {
            _captchaSent = true;
            setTimeout(() => { try { btn.click(); } catch(_) { _captchaSent = false; } }, 1000);
          }
        } else { _captchaSent = false; }
      } else { _captchaSent = false; }
    }, 1000);
  }

  /* === CONFIG & STATE === */

  const cfg = {
    crimeInt:    GM_getValue('cbCrimeInt', 125),
    gtaInt:      GM_getValue('cbGtaInt', 245),
    jailInt:     GM_getValue('cbJailInt', 3),
    jailDailyLimit: GM_getValue('cbJailDailyLimit', 2000),
    jailCheckInt:GM_getValue('cbJailCheckInt', 5),
    // Randomised pause after leaving jail before automation resumes — a human
    // doesn't carry straight on the instant the cell door opens. Seconds.
    jailDelayOn:  GM_getValue('cbJailDelayOn', false),
    jailDelayMin: GM_getValue('cbJailDelayMin', 15),
    jailDelayMax: GM_getValue('cbJailDelayMax', 90),
    // Don't start a jail bust when a crime/GTA/booze/travel is due within this
    // many seconds — a failed bust jails you and blocks the action. 0 disables.
    jailYieldSec: GM_getValue('cbJailYieldSec', 30),
    boozeInt:    GM_getValue('cbBoozeInt', 120),
    boozeBuy:    GM_getValue('cbBoozeBuy', 5),
    boozeSell:   GM_getValue('cbBoozeSell', 1),
    healthInt:   GM_getValue('cbHealthInt', 30),
    garageInt:   GM_getValue('cbGarageInt', 300),
    minHealth:   GM_getValue('cbMinHealth', 90),
    targetHealth:GM_getValue('cbTargetHealth', 100),
    // No-XP streak limiter: if an action yields no XP this many attempts in a row,
    // treat it as the game's daily cap and disable it until the next game-day.
    noXpStreakLimit: GM_getValue('cbNoXpStreakLimit', 5),
    noXpLimiterOn:   GM_getValue('cbNoXpLimiterOn', false),
    // Smart crime picking: take the most VALUABLE crime still succeeding at or
    // above this percentage. See pickCrime for why raw "highest %" is wrong.
    smartMinPct:  GM_getValue('cbSmartMinPct', 85),
    /* Performance tuning — the only costs that had no switch of their own.
     * Everything else expensive (hover, SG lists, props, silent audio, worker
     * ticker) already has its own toggle. For a low-RAM device where the tab
     * gets discarded, longer polls mean fewer parsed documents held in memory
     * at once — and unlike trimming stored history, raising these destroys
     * nothing and is fully reversible. */
    // Panel text size: 'n' normal, 'l' large, 'x' largest (also widens the panel).
    uiSize:       GM_getValue('cbUiSize', 'n'),
    timerDispSec: GM_getValue('cbTimerDispSec', 5),    // panel refresh
    bgPollSec:    GM_getValue('cbBgPollSec', 60),      // OC/DTM/travel background fetches
    // Anti-bot / soft-ban message detection — pauses everything and alerts.
    antiBotOn:    GM_getValue('cbAntiBotOn', true),
    // Scrap → FMJ conversion at store.aspx?p=s (5 scrap = 1000 FMJ).
    scrapOn:      GM_getValue('cbScrapOn', false),
    scrapProt:    GM_getValue('cbScrapProt', true),    // grab Armoured Vehicle protection first
    scrapFloor:   GM_getValue('cbScrapFloor', 5),      // stop converting below this much scrap
    // Background heal: top health up via same-origin POSTs instead of navigating.
    bgHealOn:     GM_getValue('cbBgHealOn', true),
    // Smart action picking: crime by success %, booze by rank carry limit.
    smartPick:    GM_getValue('cbSmartPick', false),
    // DTM partner kick: drop a partner who never accepts / sits offline.
    dtmKickOn:      GM_getValue('cbDtmKickOn', false),
    // Create DTM: pick an online advertiser off the DTM list instead of the fixed partner.
    dtmAutoPartner: GM_getValue('cbDtmAutoPartner', false),
    dtmKickWaitSec: GM_getValue('cbDtmKickWaitSec', 210),  // pending-invite timeout
    dtmKickGraceSec:GM_getValue('cbDtmKickGraceSec', 180), // seated-but-offline grace
    // Per-action daily attempt limits (0 = unlimited). Jail keeps its own.
    dailyLimitOn:  GM_getValue('cbDailyLimitOn', false),
    dailyLimitCrime: GM_getValue('cbDailyLimitCrime', 0),
    dailyLimitGta:   GM_getValue('cbDailyLimitGta', 0),
    dailyLimitBooze: GM_getValue('cbDailyLimitBooze', 0),
    // No-XP limiter extra trigger: also cap an action if it has gained no XP for
    // this many minutes despite firing. 0 disables (streak count still applies).
    noXpStaleMin:  GM_getValue('cbNoXpStaleMin', 0),
    /* Seconds between XP readings. The game's own page polls every 15s, and our
     * refresh fires the identical request, so anything near 15-20s matches what a
     * browser left open does by itself. See xpPollMs(). */
    xpPollSec:     GM_getValue('cbXpPollSec', 20),
    /* Ready reminders: OC/DTM goes ready and then sits there unused because you
     * didn't see the one alert. Re-ping every N minutes while it's STILL ready,
     * capped, and disarming the moment the timer goes back on cooldown. 0 = off. */
    readyRepeatMin: GM_getValue('cbReadyRepeatMin', 15),
    readyRepeatMax: GM_getValue('cbReadyRepeatMax', 4),
    /* Mod presence. Staff are the four STAFF_IDS accounts; presence comes from the
     * online watch's own players.aspx parse, so it works whether or not Watch is on. */
    modWatchOn:     GM_getValue('cbModWatchOn', false),
    modPollSec:     GM_getValue('cbModPollSec', 60),
    noJailOnMod:    GM_getValue('cbNoJailOnMod', false),
    modBreakOn:     GM_getValue('cbModBreakOn', false),
    modBreakMin:    GM_getValue('cbModBreakMin', 60),   // minutes
    modBreakMax:    GM_getValue('cbModBreakMax', 120),
    modBreakLogout: GM_getValue('cbModBreakLogout', true),
    /* Hold HQ (panic) — hide inside your network HQ so you can't be shot.
     * Capped, and it switches ITSELF off at the cap: this is a panic button, not
     * a way of life, and forgetting it was on would cost you a whole day. */
    holdHqOn:      GM_getValue('cbHoldHqOn', false),
    holdHqMins:    GM_getValue('cbHoldHqMins', 10),   // minutes per entry
    holdHqMax:     GM_getValue('cbHoldHqMax', 6),     // entries before auto-off (~1h)
    /* Shot response (2000.278). Three separate switches on purpose:
     *  - the ALERT is the safe part and defaults ON;
     *  - the RETREAT acts on its own and spends credits healing, so it is opt-in;
     *  - TRAVELLING to the HQ additionally buys a jail reset and a travel reset,
     *    which is real money and strands you somewhere, so it is opt-in again.
     * Hold HQ has always refused to travel for exactly that reason ("stranding
     * you somewhere under fire is your call") — this keeps the same line. */
    shotAlertOn:   GM_getValue('cbShotAlertOn', true),
    shotRetreatOn: GM_getValue('cbShotRetreatOn', false),
    shotTravelOn:  GM_getValue('cbShotTravelOn', false),
    /* Hourly forum refresh — camouflage. Ours FETCHES rather than navigates; see
     * doForumRefresh for why navigating would strand us. */
    forumRefreshOn: GM_getValue('cbForumRefreshOn', false),
    forumRefreshMin: GM_getValue('cbForumRefreshMin', 60),
    /* OC/DTM allow-list gating off the Starvinggeeks lists. Stacks with the
     * existing whitelist/blacklist — every gate must pass. */
    inviteAlliedOnly: GM_getValue('cbInviteAlliedOnly', false),
    inviteSafeOnly:   GM_getValue('cbInviteSafeOnly', false)
  };

  /* === DELAY SYSTEM === */

  const DLY = {
    quick:  [1100, 1900],
    normal: [1200, 3000],
    slow:   [2500, 6000],
    error:  [5000, 15000]
  };

  function rndDelay(range = DLY.normal) {
    const r = Array.isArray(range) ? range : DLY.normal;
    const lo = Math.max(0, Number(r[0]||0));
    const hi = Math.max(lo, Number(r[1]||lo));
    const u = (Math.random() + Math.random() + Math.random()) / 3;
    let ms = Math.floor(lo + (hi - lo) * u) + Math.floor((Math.random()-0.5)*240);
    if (Math.random() < 0.03) ms += 400 + Math.floor(Math.random()*1200);
    return Math.max(0, ms);
  }

  function humanWait(range = DLY.normal) { return wait(rndDelay(range)); }

  /* === TELEGRAM === */

  const tg = {
    token:       GM_getValue('cbTgToken', ''),
    chat:        GM_getValue('cbTgChat', ''),
    enabled:     GM_getValue('cbTgEnabled', false),
    captcha:     GM_getValue('cbNotifyCaptcha', true),
    messages:    GM_getValue('cbNotifyMessages', true),
    scriptTest:  GM_getValue('cbNotifyScriptTest', true),
    staffMail:   GM_getValue('cbNotifyStaffMail', true),
    sqlCheck:    GM_getValue('cbNotifySqlCheck', true),
    logout:      GM_getValue('cbNotifyLogout', true),
    lastMsgCheck:GM_getValue('cbLastMsgCheck', 0),
    // Seconds between background inbox polls. This is the ONLY thing that finds
    // new mail while Jarvis is sitting idle — see mailIntervalMs() for why.
    msgCheckInt: GM_getValue('cbMsgCheckInt', 30)
  };

  /* === DISCORD WEBHOOK ===
   * A second alert channel, for the two events that are genuinely nicer as a
   * Discord post than a phone notification: rank-ups (worth keeping) and witness
   * statements (worth sharing).
   *
   * THE WEBHOOK URL IS DELIBERATELY NOT HARDCODED, unlike the reference script.
   * `scoobyghub/v100` is a PUBLIC repo and `Jarvis.user.js` is served raw from
   * githubusercontent, so a URL baked in here is a URL published to the world —
   * and a Discord webhook URL is a credential: anyone holding it can post to that
   * channel as often as they like. The reference can hardcode its own because it
   * lives on a local disk, not in a public repo. Paste yours once; it is stored in
   * GM storage, which is per-device and never leaves the machine.
   *
   * Sends go through the SAME persistent queue as Telegram — see the queue
   * section for why one-shot fire-and-forget is not good enough here.
   */
  const dc = {
    enabled: GM_getValue('cbDcEnabled', false),
    url:     GM_getValue('cbDcUrl', ''),
    rankup:  GM_getValue('cbDcRankup', true),
    witness: GM_getValue('cbDcWitness', true),
    shot:    GM_getValue('cbDcShot', true),
    /* Script/staff checks and soft bans. Defaults ON, unlike the other two —
     * these are the BAN-RISK events, and the whole reason the critical-alert
     * queue exists is that missing one cost a 12h soft ban. */
    critical: GM_getValue('cbDcCritical', true),
    /* Optional mention prefixed to a critical post — "<@123…>" for yourself,
     * "<@&123…>" for a role, or @here / @everyone. This is the closest thing to
     * the flashing light: an embed alone is silent, a mention actually pushes a
     * notification to your phone. Blank by default because @everyone in a shared
     * channel is somebody else's problem, not just yours. */
    mention: GM_getValue('cbDcMention', ''),
    /* Post from THIS device.
     *
     * ⚠️ LEAVE THIS ON EVERYWHERE. The four installs are four DIFFERENT PLAYERS
     * (3 PCs + a tablet, separate logins, separate storage) — not one account on
     * four machines. So four rank-ups are four separate events by four accounts,
     * each embed carrying its own st.player. There is nothing to dedup across
     * machines and nothing to suppress.
     *
     * This switch is NOT a duplicate guard, and using it as one would silence
     * three players outright. It exists only because "don't post from this
     * account" is a reasonable thing to want on its own. The real duplicate
     * guards — master tab, seenOnce by event, and the content hash — are all
     * per-device and cover the cases that genuinely repeat. */
    thisDevice: GM_getValue('cbDcThisDevice', true)
  };

  /* ONE-TIME REPAIR OF A SETTING WE TOLD YOU TO SET WRONG (2000.266).
   *
   * 2000.252/253 shipped on the false premise that the four installs were one
   * account on four machines, and instructed: "leave this ON for one device and
   * OFF for the rest." Each device is a different PLAYER, so anyone who followed
   * that muted three players entirely.
   *
   * 2000.265 corrected the wording — but wording does not un-flip a switch. The
   * stored false is still false, and a muted player looks exactly like a webhook
   * that has stopped working, which is what prompted this.
   *
   * So: turn it back on ONCE, say so loudly, and never touch it again. Anyone
   * who genuinely wants this account silent can switch it off and it stays off,
   * because the flag below is already set.
   */
  if (!GM_getValue('cbDcDeviceAdviceFixed', false)) {
    GM_setValue('cbDcDeviceAdviceFixed', true);
    if (dc.thisDevice === false) {
      dc.thisDevice = true;
      GM_setValue('cbDcThisDevice', true);
      console.warn(APP_TAG, '[DC] "Post from this device" was OFF — almost certainly from the incorrect advice in 2000.252/253. Each device is a DIFFERENT player, so that setting silenced this account entirely. Turned back ON. Switch it off again in Settings if you really do want this account quiet.');
    }
  }

  function saveDc() {
    GM_setValue('cbDcEnabled', dc.enabled);
    GM_setValue('cbDcUrl', dc.url);
    GM_setValue('cbDcRankup', dc.rankup);
    GM_setValue('cbDcWitness', dc.witness);
    GM_setValue('cbDcCritical', dc.critical);
    GM_setValue('cbDcMention', dc.mention);
    GM_setValue('cbDcThisDevice', dc.thisDevice);
  }

  function dcConfigured() {
    return !!(dc.enabled && /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(dc.url));
  }

  function saveTg() {
    GM_setValue('cbTgToken', tg.token); GM_setValue('cbTgChat', tg.chat);
    GM_setValue('cbTgEnabled', tg.enabled); GM_setValue('cbNotifyCaptcha', tg.captcha);
    GM_setValue('cbNotifyMessages', tg.messages); GM_setValue('cbNotifyScriptTest', tg.scriptTest);
    GM_setValue('cbNotifyStaffMail', tg.staffMail); GM_setValue('cbMsgCheckInt', tg.msgCheckInt);
    GM_setValue('cbNotifySqlCheck', tg.sqlCheck); GM_setValue('cbNotifyLogout', tg.logout);
  }

  // One-time: the poll was hardcoded at 60s while this setting sat unread, so
  // existing installs still carry that stale 60. Move them to the new 30s default
  // once; after that the settings field is authoritative and is left alone.
  if (!GM_getValue('cbMsgCheckIntMigrated', false)) {
    GM_setValue('cbMsgCheckIntMigrated', true);
    if (Number(tg.msgCheckInt) === 60) { tg.msgCheckInt = 30; GM_setValue('cbMsgCheckInt', 30); }
  }

  // Per-message Telegram toggles. Each sendTg now carries a key; if its toggle is
  // off, the message is suppressed. All default ON so behaviour is unchanged until
  // the user turns specific ones off.
  const TG_MSGS = [
    { key:'startup',     label:'Startup / test',        def:true  },
    { key:'coffee',      label:'Coffee break',          def:true  },
    { key:'lunch',       label:'Lunch break',           def:true  },
    { key:'sleep',       label:'Sleep mode',            def:true  },
    { key:'wake',        label:'Wake up',               def:true  },
    { key:'health',      label:'Low health',            def:true  },
    { key:'online',      label:'Player online',         def:true  },
    { key:'offline',     label:'Player offline',        def:true  },
    { key:'dtmReady',    label:'DTM ready',             def:true  },
    { key:'ocReady',     label:'OC ready',              def:true  },
    { key:'protection',  label:'Protection warning',    def:true  },
    { key:'newmail',     label:'New mail',              def:true  },
    { key:'dtmInvite',   label:'DTM invite',            def:true  },
    { key:'ocInvite',    label:'OC invite',             def:true  },
    { key:'dtmAccept',   label:'DTM accepted',          def:true  },
    { key:'ocAccept',    label:'OC accepted',           def:true  },
    { key:'dtmBuy',      label:'DTM bought/done',       def:true  },
    { key:'ocCommit',    label:'OC committed',          def:true  },
    { key:'dtmCreate',   label:'DTM create steps',      def:true  },
    { key:'ocCreate',    label:'OC create steps',       def:true  },
    { key:'blocked',     label:'Invite blocked',        def:true  },
    { key:'invalid',     label:'Invalid invite',        def:true  },
    { key:'travel',      label:'Auto travel',           def:true  },
    { key:'dtmList',     label:'DTM list add',          def:true  },
    { key:'jail',        label:'Jail limit/reset',      def:true  },
    { key:'crusher',     label:'Crusher events',        def:true  },
    { key:'propDrop',    label:'Property dropped',      def:true  },
    { key:'watchdog',    label:'Watchdog',              def:true  },
    { key:'loginStuck',  label:'Stuck on login',        def:true  },
    { key:'rankup',      label:'Rank up',               def:true  },
    { key:'xpReport',    label:'Hourly XP report',      def:true  },
    { key:'readyAgain',  label:'OC/DTM still ready',    def:true  },
    { key:'witness',     label:'Witness mail',          def:true  },
    { key:'modOnline',   label:'Staff/mod online',      def:true  },
    { key:'holdHq',      label:'Hold HQ (panic)',       def:true  },
    { key:'shot',        label:'Shot at / attacked',    def:true  }
  ];

  const tgMsgOn = {};
  TG_MSGS.forEach(m => { tgMsgOn[m.key] = GM_getValue('cbTgMsg_'+m.key, m.def); });

  function saveTgMsgs() {
    TG_MSGS.forEach(m => GM_setValue('cbTgMsg_'+m.key, tgMsgOn[m.key]));
  }

  // Wrapper: only sends if this message category is enabled
  function tgMsg(key, message) {
    if (tgMsgOn[key] === false) return;
    sendTg(message);
  }

  /* === TELEGRAM DELIVERY QUEUE (reliable send) ===
   * The old sendTg fired a single GM_xmlhttpRequest with no retry. If the request
   * was interrupted — page navigating right after an action, the tab backgrounded
   * and throttled, or Telegram returning 429 to a burst — the message was lost or
   * stalled (that's the "DTM at 16:49 arrived at 17:15"). Every send now goes into
   * a persistent localStorage queue and is pumped until Telegram returns 200, with
   * 429 retry_after handling and backoff. The queue resumes on the next page load,
   * so an interrupted send is redelivered within seconds rather than half an hour.
   */
  const LS_TGQ = 'cbTgSendQueue';
  let _tgInFlight = {};   // in-memory per-page; resets on load so interrupted items retry
  let _tgPumpTimer = null;

  function _loadTgQ() {
    try { const q = JSON.parse(localStorage.getItem(LS_TGQ) || '[]'); return Array.isArray(q) ? q : []; }
    catch(_) { return []; }
  }
  function _saveTgQ(q) { try { localStorage.setItem(LS_TGQ, JSON.stringify(q)); } catch(_){} }
  function _removeTgQ(id) { _saveTgQ(_loadTgQ().filter(i => i.id !== id)); }
  /* Deferring also clears sentAt: we got a definite answer from the server, so
   * this is a genuine retry, not an interrupted send. */
  function _deferTgQ(id, at) { const q = _loadTgQ(); const it = q.find(i => i.id === id); if (it) { it.nextAt = at; it.sentAt = 0; _saveTgQ(q); } }
  function _backoffOrDropTgQ(id, attempts) {
    if (attempts >= 8) { _removeTgQ(id); console.error(APP_TAG, 'TG give up after', attempts, 'tries'); return; }
    _deferTgQ(id, Date.now() + Math.min(60000, 2000 * attempts));
  }

  /* The queue is SHARED with Telegram, which sends far more traffic (28-odd
   * message categories). The cap used to drop the oldest items outright, so a
   * Discord post could be evicted by a burst of Telegram ones before it was ever
   * sent. Telegram messages are the expendable ones — Discord carries rank-ups,
   * witness statements and script checks, and there are only ever a handful. */
  function _capTgQ(q, max) {
    if (q.length <= max) return q;
    while (q.length > max) {
      const i = q.findIndex(it => it.dest !== 'dc');   // oldest Telegram item first
      if (i === -1) break;                             // all Discord — keep them all
      q.splice(i, 1);
    }
    if (q.length > max) q.splice(0, q.length - max);   // still over: they are all Discord
    return q;
  }

  /* `critical` marks a message that must NEVER be lost — script checks, staff
   * mail, anti-bot. Those keep the original at-least-once behaviour (a rare
   * duplicate beats a missed ban warning). Everything else is at-most-once: see
   * the sweep in pumpTgQueue. */
  function sendTg(msg, critical) {
    if (!tg.enabled || !tg.token || !tg.chat) return;
    const q = _loadTgQ();
    q.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 7), msg, attempts: 0, nextAt: 0,
             crit: !!critical, sentAt: 0 });
    _capTgQ(q, 50);   // evicts Telegram before Discord — see _capTgQ
    _saveTgQ(q);
    pumpTgQueue();
  }

  /* Queue an embed for Discord. Same persistent queue as Telegram — a webhook
   * post interrupted by navigation is exactly as lost as a Telegram one, and the
   * retry/backoff/429 machinery here was built the hard way. Items carry a `dest`
   * so one pump serves both; anything without one is Telegram, which keeps every
   * pre-existing queued item working across the upgrade. */
  function sendDiscord(embed, content) {
    if (!dcConfigured()) return;
    const q = _loadTgQ();
    /* `content` is the plain line above the embed, used only to carry a mention.
     * allowed_mentions is stated explicitly rather than relying on the webhook
     * default, so a mention pings on purpose and never by accident. */
    const payload = { embeds: [embed] };
    if (content) {
      payload.content = String(content).slice(0, 300);
      payload.allowed_mentions = { parse: ['users', 'roles', 'everyone'] };
    }
    q.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
             dest: 'dc', payload, attempts: 0, nextAt: 0 });
    _capTgQ(q, 50);
    _saveTgQ(q);
    pumpTgQueue();
  }

  function pumpTgQueue() {
    /* Gated PER ITEM, not up front. The old single check returned early unless
     * Telegram was configured, which would have stranded every Discord item for
     * anyone using Discord alone. */
    const tgOk = !!(tg.enabled && tg.token && tg.chat);
    const dcOk = dcConfigured();
    if (!tgOk && !dcOk) return;
    const q = _loadTgQ();
    if (!q.length) return;

    /* === AT-MOST-ONCE FOR ORDINARY MESSAGES (2000.275) ===
     *
     * The duplicate you saw. An item is stamped sentAt when its request starts;
     * a definite outcome (200, 429, error, timeout) either removes it or clears
     * the stamp. So a stamp still present on a FRESH PAGE means the previous page
     * began the send and died before recording the result — and Telegram had
     * almost certainly already received it. Retrying is what produced two
     * identical "Traveled" messages, and travel is the worst case because the
     * send happens milliseconds before the flight navigates the page.
     *
     * Ordinary messages are therefore assumed delivered and dropped. CRITICAL
     * ones are not: a duplicated script-check alert is a nuisance, a missed one
     * cost a 12-hour soft ban, so those keep at-least-once and simply retry.
     *
     * _tgInFlight is per-page and empty on load, which is exactly what makes
     * "started on a previous page" detectable at all. */
    let swept = 0;
    for (let i = q.length - 1; i >= 0; i--) {
      const it = q[i];
      if (!it.sentAt || _tgInFlight[it.id]) continue;
      if (it.crit) { it.sentAt = 0; continue; }     // never assume for these
      q.splice(i, 1); swept++;
    }
    if (swept) {
      _saveTgQ(q);
      console.log(APP_TAG, `TG ${swept} message(s) were mid-send when the page changed — assuming delivered rather than sending twice`);
      if (!q.length) return;
    }

    const now = Date.now();
    for (const item of q) {
      if (_tgInFlight[item.id]) continue;
      if (now < (item.nextAt || 0)) continue;
      const isDc = item.dest === 'dc';
      if (isDc ? !dcOk : !tgOk) continue;      // channel switched off — leave it queued
      const label = isDc ? 'Discord' : 'TG';
      _tgInFlight[item.id] = true;
      item.attempts = (item.attempts || 0) + 1;
      item.sentAt = Date.now();     // survives the page; see the sweep above
      _saveTgQ(q);
      GM_xmlhttpRequest({
        method:'POST',
        url: isDc ? dc.url : `https://api.telegram.org/bot${tg.token}/sendMessage`,
        timeout:15000, headers:{'Content-Type':'application/json'},
        data: isDc ? JSON.stringify(item.payload)
                   : JSON.stringify({chat_id:tg.chat, text:item.msg, parse_mode:'HTML'}),
        onload: r => {
          delete _tgInFlight[item.id];
          // Discord webhooks answer 204 No Content on success, Telegram 200.
          if (r.status === 200 || r.status === 204) {
            _removeTgQ(item.id);
            console.log(APP_TAG, label, 'sent');
          } else if (r.status === 429) {
            /* Two different shapes: Telegram nests it under `parameters`, Discord
             * puts `retry_after` at the top level and in SECONDS as a float. */
            let wait = 5000;
            try {
              const j = JSON.parse(r.responseText);
              const ra = (j.parameters && j.parameters.retry_after) != null ? j.parameters.retry_after : j.retry_after;
              if (ra != null) wait = Math.ceil((Number(ra) + 1) * 1000);
            } catch(_){}
            console.error(APP_TAG, label, '429 — retry in', wait, 'ms');
            _deferTgQ(item.id, Date.now() + wait);
          } else {
            console.error(APP_TAG, label, 'fail', r.status, isDc ? (r.responseText||'').slice(0,120) : '');
            _backoffOrDropTgQ(item.id, item.attempts);
          }
        },
        onerror: () => { delete _tgInFlight[item.id]; console.error(APP_TAG, label, 'err'); _backoffOrDropTgQ(item.id, item.attempts); },
        ontimeout: () => { delete _tgInFlight[item.id]; console.error(APP_TAG, label, 'timeout'); _backoffOrDropTgQ(item.id, item.attempts); }
      });
    }
  }

  /* === DISCORD EMBEDS ===
   * Reworked from the reference's, which repeat your own name in the title, the
   * description and again in a field, and carry no context beyond the bare event.
   *
   * The shape here is: AUTHOR = who this is about, TITLE = what happened,
   * FIELDS = the specifics, FOOTER = provenance. Your name appears once.
   *
   * Both carry information the reference cannot: our rank-up is detected from the
   * status bar as a from→to transition (theirs parses a mail blob), and we have
   * live XP totals to hang off it.
   */
  const DC_COLOUR = { rankup: 0xF1C40F, witness: 0xC0392B, critical: 0xFF0000 };

  /* === CRITICAL ALERTS → DISCORD (2000.262) ===
   *
   * The ban-risk events: an inbox script check, an on-page staff check, staff
   * mail, and an anti-bot / soft-ban message. Telegram has chased these since
   * 2000.175, when missing one cost a 12-hour soft ban; this is a second channel
   * for the same thing.
   *
   * MADE AS LOUD AS DISCORD ACTUALLY ALLOWS. There is no animation in an embed —
   * a webhook cannot flash anything — so "flashing lights" here means everything
   * that genuinely competes for attention:
   *   · a MENTION on the line above the embed, which is the only part that fires
   *     a phone notification. This is the real attention-getter; the rest is
   *     decoration. Off unless you set one, because @everyone in a channel other
   *     people read is their problem too.
   *   · pure red, sirens in the title, and a marquee row of alternating symbols
   *     top and bottom, which is as close to blinking as a static embed gets.
   *
   * Hooked into queueCriticalAlert rather than each caller, because that is the
   * one funnel every ban-risk event already passes through — so this cannot be
   * forgotten when a new kind of check is added. It posts ONCE per event (the
   * queue's own key dedup plus dcSendOnce); only Telegram does the repeating,
   * since a channel other people read should not be hammered.
   */
  const DC_MARQUEE = '🚨🔴🚨🔴🚨🔴🚨🔴🚨🔴🚨🔴🚨🔴🚨';

  // Telegram markup → something Discord renders. Same text, different dialect.
  function dcFromTgText(msg) {
    return String(msg || '')
      .replace(/<pre>([\s\S]*?)<\/pre>/gi, (_m, x) => '```\n' + x.trim() + '\n```')
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .trim();
  }

  // Human name for the kind of check, taken from the alert key's prefix.
  const DC_CRIT_KIND = {
    sqlcheck:    'STAFF CHECK ON SCREEN',
    scriptcheck: 'SCRIPT CHECK IN YOUR INBOX',
    staffmail:   'MAIL FROM STAFF',
    antibot:     'ANTI-BOT / SOFT BAN'
  };

  function discordCriticalAlert(key, msg) {
    if (!dc.critical || !dcConfigured()) return;
    const kind = DC_CRIT_KIND[String(key).split(':')[0]] || 'STAFF ALERT';
    const body = dcFromTgText(msg).slice(0, 500);
    const e = {
      title: `🚨 ${kind}`,
      description: body || 'A ban-risk alert was received.',
      color: DC_COLOUR.critical,
      author: { name: st.player || 'Unknown player' },
      fields: [{
        name: 'What to do',
        value: 'Answer it **in the game**. Jarvis never answers a check for you.',
        inline: false
      }],
      timestamp: new Date().toISOString(),
      footer: { text: `Ignoring this risks a soft ban · ${APP_NAME} ${APP_VERSION}` }
    };
    // Keyed by the alert key, so one post per distinct check no matter how many
    // times Telegram re-pings it.
    dcSendOnce('dccrit', key, e, (dc.mention || '').trim());
  }

  function dcBase(title, colour) {
    return {
      title,
      color: colour,
      author: { name: st.player || 'Unknown player' },
      timestamp: new Date().toISOString(),
      footer: { text: `${APP_NAME} ${APP_VERSION}` }
    };
  }

  /* === POST ONCE, NEVER FLOOD ===
   * Four ways the same event could post more than once, and all four are real:
   *
   *   1. MULTIPLE TABS on one device. updateTimers runs per tab, not master-only,
   *      so two open tabs both see the rank change. → master tab only.
   *   2. THE SAME EVENT RE-DETECTED. A rank-up is spotted by comparing the status
   *      bar to a stored name; anything that resets that stored name re-fires it.
   *      → seenOnce(), which is localStorage-backed and therefore shared by every
   *      tab on the device and survives reloads.
   *   3. THE QUEUE'S AT-LEAST-ONCE DELIVERY. Documented and accepted for Telegram:
   *      if the page navigates in the ~100ms before a 200 is recorded, the item is
   *      retried and can land twice. → a short content-hash guard, which is the
   *      "duplicate-suppression guard" §8 has listed as optional since 177.
   *   4. MULTIPLE DEVICES — NOT a duplicate source. Each device is a different
 *      PLAYER, so two devices posting means two players did the thing. Nothing
 *      to dedup; see dc.thisDevice.
   *
   * The event key is what makes 2 work, so it must identify the EVENT, not the
   * message: a rank-up is keyed from→to, a witness by its mail id.
   */
  const DC_DUP_WINDOW_MS = 60000;

  function dcRecentlySent(embed) {
    const h = contentHash(JSON.stringify(embed));
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('cbDcRecent') || '[]'); } catch(_) {}
    if (!Array.isArray(arr)) arr = [];
    const now = Date.now();
    arr = arr.filter(e => e && now - e.t < DC_DUP_WINDOW_MS);
    if (arr.some(e => e.h === h)) {
      console.log(APP_TAG, '[DC] Suppressed an identical embed sent moments ago');
      try { localStorage.setItem('cbDcRecent', JSON.stringify(arr)); } catch(_){}
      return true;
    }
    arr.push({ h, t: now });
    while (arr.length > 20) arr.shift();
    try { localStorage.setItem('cbDcRecent', JSON.stringify(arr)); } catch(_){}
    return false;
  }

  // `key` identifies the EVENT. Returns true if it was actually queued.
  function dcSendOnce(bucket, key, embed, content) {
    if (!dcConfigured()) return false;
    /* These two were dlog() — invisible unless verbose debug was on. A Discord
     * post silently not happening is exactly the case you need to SEE, so they
     * are plain logs now. */
    if (!dc.thisDevice) { console.warn(APP_TAG, `[DC] NOT POSTING ${bucket}: this device is set not to post. Each device is a different player — this should normally be ON.`); return false; }
    if (!tabs.isMaster)  { console.warn(APP_TAG, `[DC] NOT POSTING ${bucket}: this tab is not the master tab.`); return false; }
    if (!seenOnce(bucket, key, 60)) { console.log(APP_TAG, `[DC] Already posted ${bucket}:${key} — not posting again`); return false; }
    if (dcRecentlySent(embed)) return false;
    sendDiscord(embed, content);
    return true;
  }

  function discordRankUp(fromName, toName) {
    if (!dc.rankup || !dcConfigured()) return;
    const e = dcBase(`⭐ Ranked up to ${toName}`, DC_COLOUR.rankup);
    e.description = `**${fromName}**  →  **${toName}**`;
    const fields = [];
    if (xpState.total > 0) fields.push({ name: 'Total XP', value: xpState.total.toFixed(2), inline: true });
    if (xpState.sessionGain > 0) fields.push({ name: 'This session', value: `+${xpState.sessionGain}`, inline: true });
    try {
      const rp = xpRankProgress(xpState.total);
      if (rp && rp.next) fields.push({ name: 'Next rank', value: `${rp.next} — ${rp.toNext.toFixed(0)} XP to go`, inline: false });
      else if (rp && !rp.next) fields.push({ name: 'Next rank', value: 'Max rank reached', inline: false });
    } catch(_){}
    if (fields.length) e.fields = fields;
    // Keyed by the transition, so the same rank-up can never post twice however
    // many times it is re-detected.
    dcSendOnce('dcrank', `${fromName}>${toName}`, e);
  }

  function discordWitness(mailId, killer, victim) {
    if (!dc.witness || !dcConfigured()) return;
    const e = dcBase('👁️ Witness statement', DC_COLOUR.witness);
    e.description = `Saw **${killer}** kill **${victim}**.`;
    e.fields = [
      { name: 'Killer', value: killer, inline: true },
      { name: 'Victim', value: victim, inline: true }
    ];
    const city = getCurCity();
    if (city) e.fields.push({ name: 'Where', value: city, inline: true });
    // Keyed by the mail id — one statement per mail, for ever.
    dcSendOnce('dcwit', String(mailId || `${killer}>${victim}`), e);
  }

  /* A shot is a red embed like the critical alerts, because it is the same class
   * of thing: something happened TO you that you want to know about away from the
   * keyboard. Keyed by the mail id, so one post per shot for ever. */
  function discordShot(mailId, info) {
    if (!dc.shot || !dcConfigured()) return;
    const e = dcBase(info.survived ? '💥 Shot at' : '☠️ Killed', DC_COLOUR.witness);
    e.description = `**${info.shooter}** fired ${info.rounds} ${info.ammo}.`;
    e.fields = [
      { name: 'Shooter',      value: String(info.shooter), inline: true },
      { name: 'Outcome',      value: info.survived ? 'Survived' : '**Died**', inline: true },
      { name: 'Health lost',  value: `${info.healthLost}%`, inline: true }
    ];
    const city = getCurCity();
    if (city) e.fields.push({ name: 'Where', value: city, inline: true });
    dcSendOnce('dcshot', String(mailId || `${info.shooter}:${info.healthLost}`), e);
  }

  /* The test deliberately bypasses the once-only dedup — you may well want to
   * press it twice — but it must be UNMISTAKABLY a test, in the title, the body
   * and the footer. A test post that reads like a real rank-up is worse than no
   * test at all, especially in a channel other people can see. */
  function testDiscord() {
    if (!dcConfigured()) {
      alert('Enable Discord and paste a valid webhook URL first.\n\nIt should look like:\nhttps://discord.com/api/webhooks/…');
      return;
    }
    const e = {
      title: '🧪 THIS IS A TEST',
      description: '**THIS IS A TEST MESSAGE — no rank-up and no murder has happened.**\n\n' +
                   'You pressed "Test Discord" in Jarvis. Real alerts look different and are posted once each.',
      color: 0x95A5A6,                       // deliberately grey: not the gold or red of a real alert
      author: { name: `${st.player || 'Unknown player'} — test` },
      fields: [
        { name: 'Rank-up alerts', value: dc.rankup ? '✅ on' : '⛔ off', inline: true },
        { name: 'Witness alerts', value: dc.witness ? '✅ on' : '⛔ off', inline: true },
        { name: 'Script/staff checks', value: dc.critical ? '✅ on' : '⛔ off', inline: true },
        { name: 'Ping on a check', value: dc.mention ? `\`${dc.mention}\`` : 'none set — the alert will be **silent**', inline: false },
        { name: 'Posting from this device', value: dc.thisDevice ? '✅ yes' : '⛔ no', inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `THIS IS A TEST · ${APP_NAME} ${APP_VERSION}` }
    };
    /* The mention is included deliberately. It is the one part that can be
     * misconfigured silently, and a real script check is precisely the wrong
     * moment to find that out — so the test proves the ping, not just the post. */
    sendDiscord(e, (dc.mention || '').trim());   // not dcSendOnce: repeat tests are fine
    alert('Test sent — check the channel.\n\nIt is clearly marked THIS IS A TEST.' +
          (dc.mention ? '\n\nIt includes your ping, so you can confirm the notification works.'
                      : '\n\nNo ping is set, so a real script check would post SILENTLY. Set one if you want your phone to buzz.'));
  }

  function startTgPump() {
    if (_tgPumpTimer) return;
    pumpTgQueue(); // resume anything left over from a previous page immediately
    _tgPumpTimer = setInterval(pumpTgQueue, 3000);
  }

  function sendTgRepeat(msg, count=5, gap=1500, label='alert') {
    const n = Math.max(1, Math.min(10, count));
    for (let i = 0; i < n; i++)
      setTimeout(() => { console.log(APP_TAG, `${label} ${i+1}/${n}`); sendTg(msg, true); }, i * gap);
  }

  /* === CRITICAL ALERT QUEUE (reload-proof) ===
   * sendTgRepeat schedules its repeats with setTimeout, which are DESTROYED when
   * Jarvis navigates between pages — so a 5x burst could deliver only 2 before a
   * page change killed the rest. That's how a missed script check turned into a
   * 12h no-reply soft ban. This queue persists the remaining sends to localStorage
   * and resumes them on the next page load + every tick, so the full burst always
   * lands. It also schedules slower follow-up pings as a backstop, so even a burst
   * you miss gets chased up for a while afterwards.
   */
  const LS_CRIT = 'cbCritAlerts';

  function _loadCrit() {
    try { const q = JSON.parse(localStorage.getItem(LS_CRIT) || '[]'); return Array.isArray(q) ? q : []; }
    catch(_) { return []; }
  }
  function _saveCrit(q) { try { localStorage.setItem(LS_CRIT, JSON.stringify(q)); } catch(_){} }

  // Queue a critical alert: `burst` quick sends `gapMs` apart, then `followups`
  // slower re-pings `followupGapMs` apart as a backstop. Deduped by `key` so the
  // same check isn't queued twice while still pending.
  function queueCriticalAlert(key, msg, burst=5, gapMs=2000, followups=10, followupGapMs=180000) {
    const q = _loadCrit();
    if (q.some(a => a.key === key)) return; // already pending
    q.push({
      key, msg,
      remaining: Math.max(1, Math.min(10, burst)),
      gapMs,
      followups: Math.max(0, followups),
      followupGapMs,
      nextAt: Date.now() // first fires immediately on next pump
    });
    _saveCrit(q);
    /* Mirror to Discord ONCE. Sits here rather than in each caller so it covers
     * every ban-risk event by construction — including any added later. Below
     * the `already pending` return above, so a re-queued check can't re-post. */
    try { discordCriticalAlert(key, msg); } catch(e) { console.warn(APP_TAG, '[DC] critical alert', e); }
    pumpCriticalAlerts();
  }

  // Cancel a pending critical alert (e.g. once its check is cleared).
  function clearCriticalAlert(key) {
    const q = _loadCrit().filter(a => a.key !== key);
    _saveCrit(q);
  }

  let _critPumpTimer = null;
  function pumpCriticalAlerts() {
    const q = _loadCrit();
    if (!q.length) return;
    const now = Date.now();
    for (const a of q) {
      if (a.remaining > 0 && now >= a.nextAt) {
        sendTg(a.msg, true);        // critical: never dropped
        a.remaining--;
        if (a.remaining > 0) {
          a.nextAt = now + a.gapMs;                 // continue the quick burst
        } else if (a.followups > 0) {
          a.remaining = 1;                          // schedule a slower backstop ping
          a.followups--;
          a.nextAt = now + a.followupGapMs;
        }
      }
    }
    _saveCrit(q.filter(a => a.remaining > 0));
  }

  // Run the pump on its own steady interval (independent of the main loop), plus
  // immediately, so a burst interrupted by a reload resumes as soon as the next
  // page initialises.
  function startCriticalPump() {
    if (_critPumpTimer) return;
    pumpCriticalAlerts();
    _critPumpTimer = setInterval(pumpCriticalAlerts, 2000);
  }

  // Send a Telegram message at most once per N seconds for a given key
  function tgOnce(key, throttleSec, msg) {
    const lsk = 'cbTgOnce_' + key;
    const last = parseInt(localStorage.getItem(lsk) || '0', 10);
    if (Date.now() - last < (throttleSec * 1000)) return;
    localStorage.setItem(lsk, String(Date.now()));
    sendTg(msg);
  }

  /* === PERSISTENT CONTENT-KEYED DEDUP ===
   * Returns true the FIRST time a given id is seen in a bucket, false thereafter
   * (across page loads / reloads). Each bucket is a capped array in GM storage,
   * so genuinely new content alerts exactly once while reloads stay silent. This
   * is the generalised form of the cbSqlCheckFp fingerprint, borrowed from the
   * moderator script's per-message sent-lists. `id` should be content-derived
   * (a message id, or a short hash of the text) so identical content dedups.
   */
  function seenOnce(bucket, id, cap = 50) {
    if (id == null) return true; // no id to key on — treat as already-seen (don't alert)
    const lsk = 'cbSeen_' + bucket;
    let arr;
    try { arr = JSON.parse(localStorage.getItem(lsk) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const key = String(id);
    if (arr.includes(key)) return false; // already seen — caller should stay silent
    arr.push(key);
    if (arr.length > cap) arr.splice(0, arr.length - cap); // keep newest `cap`
    try { localStorage.setItem(lsk, JSON.stringify(arr)); } catch (e) {}
    return true; // first sighting — caller may alert
  }

  // Cheap stable hash for content-derived dedup ids (FNV-1a, hex string).
  function contentHash(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  }

  function testTg() {
    if (!tg.token || !tg.chat) return alert('Set Bot Token and Chat ID first');
    tgMsg('startup', `🤖 <b>${APP_NAME} ${APP_VERSION}</b>\nTelegram working!\nAlerts: captcha, messages, staff, logout, health`);
    alert('Test sent — check Telegram');
  }

  /* === ONLINE WATCH CONFIG === */

  const OW_MAX = 20, OW_DEF_SEC = 60, OW_MIN_SEC = 20;

  // Per-player actions — each watched name fires only the actions ticked for it.
  const OW_ACTIONS = [
    { key:'notify',   icon:'🔔', label:'On-screen notify' },
    { key:'telegram', icon:'✈️', label:'Telegram' },
    { key:'sound',    icon:'🔊', label:'Sound' },
    { key:'flash',    icon:'⚡', label:'Tab flash' },
    { key:'logout',   icon:'🚪', label:'Log out & stay off' },
    { key:'stop',     icon:'⏸',  label:'Stop script & wait' }
  ];
  const OW_DEFAULT_ACTIONS = ['notify','telegram'];
  const OW_COOLDOWN = 5*60*1000, OW_TIMEOUT = 15000;
  const OW_PAGES = ['/authenticated/players.aspx', '/Authenticated/players.aspx'];

  const ow = {
    on:       GM_getValue('cbOwOn', false),
    on2:      GM_getValue('cbOwOn2', false),
    sec:      GM_getValue('cbOwSec', OW_DEF_SEC),
    notify:   GM_getValue('cbOwNotify', true),
    flash:    GM_getValue('cbOwFlash', true),
    sound:    GM_getValue('cbOwSound', true),
    telegram: GM_getValue('cbOwTg', true),
    notifyOff: GM_getValue('cbOwNotifyOff', false),
    logout:    GM_getValue('cbOwLogout', false),
    logoutMins:GM_getValue('cbOwLogoutMins', 60),
    logoutPark:GM_getValue('cbOwLogoutPark', true),
    parkUrl:   GM_getValue('cbOwParkUrl', 'https://www.google.co.uk'),
    list:     GM_getValue('cbOwList', []),
    actions:  GM_getValue('cbOwActions', {}),
    group:    GM_getValue('cbOwGroup', {}),
    lastOn:   GM_getValue('cbOwLastOn', {}),
    lastAlert:GM_getValue('cbOwLastAlert', {}),
    scanAt:   GM_getValue('cbOwScanAt', 0),
    scanOk:   GM_getValue('cbOwScanOk', false),
    scanMsg:  GM_getValue('cbOwScanMsg', 'Not scanned')
  };

  if (!Array.isArray(ow.list)) ow.list = [];
  ow.list = ow.list.slice(0, OW_MAX);
  if (!ow.lastOn || typeof ow.lastOn !== 'object') ow.lastOn = {};
  if (!ow.lastAlert || typeof ow.lastAlert !== 'object') ow.lastAlert = {};
  ow.sec = Math.max(OW_MIN_SEC, Math.min(3600, Number(ow.sec || OW_DEF_SEC)));

  let owTimer = null, owBusy = false, owFlashTimer = null;

  function saveOw() {
    GM_setValue('cbOwOn', ow.on); GM_setValue('cbOwOn2', ow.on2); GM_setValue('cbOwSec', ow.sec);
    GM_setValue('cbOwNotify', ow.notify); GM_setValue('cbOwFlash', ow.flash);
    GM_setValue('cbOwSound', ow.sound); GM_setValue('cbOwTg', ow.telegram);
    GM_setValue('cbOwNotifyOff', ow.notifyOff);
    GM_setValue('cbOwLogout', ow.logout); GM_setValue('cbOwLogoutMins', ow.logoutMins);
    GM_setValue('cbOwLogoutPark', ow.logoutPark); GM_setValue('cbOwParkUrl', ow.parkUrl);
    GM_setValue('cbOwActions', ow.actions || {});
    GM_setValue('cbOwGroup', ow.group || {});
    GM_setValue('cbOwList', ow.list.slice(0,OW_MAX)); GM_setValue('cbOwLastOn', ow.lastOn);
    GM_setValue('cbOwLastAlert', ow.lastAlert); GM_setValue('cbOwScanAt', ow.scanAt);
    GM_setValue('cbOwScanOk', ow.scanOk); GM_setValue('cbOwScanMsg', ow.scanMsg);
  }

  /* === STATE === */

  let st = {
    crime:    GM_getValue('cbAutoCrime', false),
    gta:      GM_getValue('cbAutoGta', false),
    jail:     GM_getValue('cbAutoJail', false),
    booze:    GM_getValue('cbAutoBooze', false),
    health:   GM_getValue('cbAutoHealth', false),
    garage:   GM_getValue('cbAutoGarage', false),
    crusher:  GM_getValue('cbAutoCrusher', true),
    crusherOwned: GM_getValue('cbCrusherOwned', null),
    lastCrime: GM_getValue('cbLastCrime', 0),
    lastGta:   GM_getValue('cbLastGta', 0),
    lastJail:  GM_getValue('cbLastJail', 0),
    lastBooze: GM_getValue('cbLastBooze', 0),
    lastHealth:GM_getValue('cbLastHealth', 0),
    lastGarage:GM_getValue('cbLastGarage', 0),
    crimes:    GM_getValue('cbSelCrimes', [1,3,5]),
    gtas:      GM_getValue('cbSelGtas', [5]),
    player:    GM_getValue('cbPlayer', ''),
    inJail:    GM_getValue('cbInJail', false),
    jailReleaseUntil: GM_getValue('cbJailReleaseUntil', 0),
    collapsed: {
      crime: GM_getValue('cbCollCrime', false),
      gta:   GM_getValue('cbCollGta', false),
      booze: GM_getValue('cbCollBooze', false)
    },
    minimized: GM_getValue('cbMinimized', false),
    acting:    false,
    lastJailCk:GM_getValue('cbLastJailCk', 0),
    action:    GM_getValue('cbAction', ''),
    refresh:   GM_getValue('cbRefresh', false),
    pending:   GM_getValue('cbPending', ''),
    buyHealth: GM_getValue('cbBuyHealth', false),
    autoOC:    GM_getValue('cbAutoOC', false),
    autoDTM:   GM_getValue('cbAutoDTM', false),
    notifyReady:GM_getValue('cbNotifyReady', true),
    whitelist: GM_getValue('cbWhitelist', false),
    wlNames:   GM_getValue('cbWlNames', []),
    blNames:   GM_getValue('cbBlNames', []),
    carCats:   GM_getValue('cbCarCats', {}),
    createOC:  GM_getValue('cbCreateOC', false),
    ocTrans:   GM_getValue('cbOcTrans', ''),
    ocWeapon:  GM_getValue('cbOcWeapon', ''),
    ocExplo:   GM_getValue('cbOcExplo', ''),
    ocSched:   GM_getValue('cbOcSched', ''),
    ocType:    GM_getValue('cbOcType', 'Casino'),
    ocRepeat:  GM_getValue('cbOcRepeat', 'once'),
    ocLeft:    GM_getValue('cbOcLeft', 0),
    autoTravel:GM_getValue('cbAutoTravel', false),
    autoDtmList:GM_getValue('cbAutoDtmList', false),
    /* HALTED — the ALL switch is a power switch, not a summary of the others.
     * See the HARD HALT section for what this actually stops and why it has to
     * be more than "turn the actions off". */
    halted:    GM_getValue('cbHalted', false)
  };

  /* === BREAK SYSTEM CONFIG === */

  const breaks = {
    // Coffee breaks: random 5-min pauses
    coffeeOn:       GM_getValue('jbCoffeeOn', false),
    coffeeMinGap:   GM_getValue('jbCoffeeMinGap', 45),   // min minutes between breaks
    coffeeMaxGap:   GM_getValue('jbCoffeeMaxGap', 90),   // max minutes between breaks
    coffeeDuration: GM_getValue('jbCoffeeDur', 5),        // break duration in minutes
    coffeeNextAt:   GM_getValue('jbCoffeeNext', 0),       // timestamp of next break
    coffeeEndAt:    GM_getValue('jbCoffeeEnd', 0),        // timestamp break ends

    // Lunch break: daily, configurable time + duration, ±10 min jitter
    lunchOn:        GM_getValue('jbLunchOn', false),
    lunchTime:      GM_getValue('jbLunchTime', '12:30'),  // HH:MM format
    lunchDuration:  GM_getValue('jbLunchDur', 30),        // minutes
    lunchMode:      GM_getValue('jbLunchMode', 'daily'),  // daily | once
    lunchJitter:    GM_getValue('jbLunchJitter', 10),     // random ±minutes
    lunchTakenToday:GM_getValue('jbLunchTaken', ''),      // date string of last lunch
    lunchEndAt:     GM_getValue('jbLunchEnd', 0),

    // Sleep/wake: logout at night, login in morning
    sleepOn:        GM_getValue('jbSleepOn', false),
    sleepTime:      GM_getValue('jbSleepTime', '23:00'),  // HH:MM
    wakeTime:       GM_getValue('jbWakeTime', '07:00'),   // HH:MM
    sleepJitter:    GM_getValue('jbSleepJitter', 10),     // random ±minutes
    sleepMode:      GM_getValue('jbSleepMode', 'daily'),  // daily | weekdays | weekends
    sleepLogout:    GM_getValue('jbSleepLogout', true),    // actually navigate to logout
    isSleeping:     GM_getValue('jbIsSleeping', false)
  };

  function saveBreaks() {
    GM_setValue('jbCoffeeOn', breaks.coffeeOn);
    GM_setValue('jbCoffeeMinGap', breaks.coffeeMinGap);
    GM_setValue('jbCoffeeMaxGap', breaks.coffeeMaxGap);
    GM_setValue('jbCoffeeDur', breaks.coffeeDuration);
    GM_setValue('jbCoffeeNext', breaks.coffeeNextAt);
    GM_setValue('jbCoffeeEnd', breaks.coffeeEndAt);
    GM_setValue('jbLunchOn', breaks.lunchOn);
    GM_setValue('jbLunchTime', breaks.lunchTime);
    GM_setValue('jbLunchDur', breaks.lunchDuration);
    GM_setValue('jbLunchMode', breaks.lunchMode);
    GM_setValue('jbLunchJitter', breaks.lunchJitter);
    GM_setValue('jbLunchTaken', breaks.lunchTakenToday);
    GM_setValue('jbLunchEnd', breaks.lunchEndAt);
    GM_setValue('jbSleepOn', breaks.sleepOn);
    GM_setValue('jbSleepTime', breaks.sleepTime);
    GM_setValue('jbWakeTime', breaks.wakeTime);
    GM_setValue('jbSleepJitter', breaks.sleepJitter);
    GM_setValue('jbSleepMode', breaks.sleepMode);
    GM_setValue('jbSleepLogout', breaks.sleepLogout);
    GM_setValue('jbIsSleeping', breaks.isSleeping);
  }

  function scheduleCoffee() {
    if (!breaks.coffeeOn) return;
    const minMs = breaks.coffeeMinGap * 60000;
    const maxMs = breaks.coffeeMaxGap * 60000;
    const gap = minMs + Math.floor(Math.random() * (maxMs - minMs));
    breaks.coffeeNextAt = Date.now() + gap;
    breaks.coffeeEndAt = 0;
    saveBreaks();
    console.log(`[JB] Coffee break scheduled in ${Math.round(gap/60000)}min`);
  }

  function todayStr() { const d = new Date(); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`; }

  function parseTimeToday(hhmm) {
    const [h, m] = String(hhmm||'12:00').split(':').map(Number);
    const d = new Date(); d.setHours(h||0, m||0, 0, 0);
    return d.getTime();
  }

  function applyJitter(ts, jitterMin) {
    const jitterMs = (jitterMin||0) * 60000;
    return ts + Math.floor((Math.random() * 2 - 1) * jitterMs);
  }

  function isLunchTime() {
    if (!breaks.lunchOn) return false;
    // Already on lunch break
    if (breaks.lunchEndAt > 0 && Date.now() < breaks.lunchEndAt) return true;
    // Already taken today
    if (breaks.lunchMode === 'daily' && breaks.lunchTakenToday === todayStr()) return false;
    if (breaks.lunchMode === 'once' && breaks.lunchTakenToday) return false;
    // Check if it's lunch time (with jitter applied once per day)
    const target = applyJitter(parseTimeToday(breaks.lunchTime), breaks.lunchJitter);
    const now = Date.now();
    // Window: target to target + 5 min (catch window)
    if (now >= target && now < target + 5*60000) {
      // Start lunch
      breaks.lunchEndAt = now + breaks.lunchDuration * 60000;
      breaks.lunchTakenToday = todayStr();
      saveBreaks();
      tgMsg('lunch', `🍔 <b>Lunch Break</b>\n${st.player||'?'} | ${breaks.lunchDuration}min`);
      console.log(`[JB] Lunch started, ends at ${fmtDate(new Date(breaks.lunchEndAt))}`);
      return true;
    }
    return false;
  }

  // True if any enabled core action is due (or about to be) within `withinMs`.
  // Used so a coffee break never starts in the exact moment an action would fire —
  // more human (do the action, then break) and avoids delaying a ready action.
  // Mirrors the moderator script's "bail the long wait when an action is due".
  function actionDueSoon(withinMs = 4000) {
    const now = Date.now();
    const checks = [
      ['crime', st.crime,  st.lastCrime,  cfg.crimeInt],
      ['gta',   st.gta,    st.lastGta,    cfg.gtaInt],
      ['booze', st.booze,  st.lastBooze,  cfg.boozeInt],
      ['jail',  st.jail,   st.lastJail,   cfg.jailInt]
    ];
    for (const [act, on, last, intSec] of checks) {
      if (!on) continue;
      // The persisted delay, not the raw interval — see cooldownDelayMs.
      if (cooldownRemainingMs(act, last, intSec) <= withinMs) return true;
    }
    return false;
  }

  function isCoffeeTime() {
    if (!breaks.coffeeOn) return false;
    // Currently on coffee break
    if (breaks.coffeeEndAt > 0 && Date.now() < breaks.coffeeEndAt) return true;
    // Time for a new break
    if (breaks.coffeeNextAt > 0 && Date.now() >= breaks.coffeeNextAt) {
      // Don't start the break while an action is due — fire the action first, then
      // the break begins on the next pass (nudge coffeeNextAt forward a few seconds).
      if (actionDueSoon(4000)) {
        breaks.coffeeNextAt = Date.now() + 5000;
        saveBreaks();
        return false;
      }
      breaks.coffeeEndAt = Date.now() + breaks.coffeeDuration * 60000;
      saveBreaks();
      tgMsg('coffee', `☕ <b>Coffee Break</b>\n${st.player||'?'} | ${breaks.coffeeDuration}min`);
      console.log(`[JB] Coffee break started, ${breaks.coffeeDuration}min`);
      return true;
    }
    // Not scheduled yet — schedule one
    if (breaks.coffeeNextAt === 0) scheduleCoffee();
    return false;
  }

  function coffeeJustEnded() {
    if (breaks.coffeeEndAt > 0 && Date.now() >= breaks.coffeeEndAt) {
      breaks.coffeeEndAt = 0;
      scheduleCoffee(); // schedule next
      console.log('[JB] Coffee break ended');
      return true;
    }
    return false;
  }

  function lunchJustEnded() {
    if (breaks.lunchEndAt > 0 && Date.now() >= breaks.lunchEndAt) {
      breaks.lunchEndAt = 0;
      saveBreaks();
      console.log('[JB] Lunch break ended');
      return true;
    }
    return false;
  }

  function isSleepWindow() {
    if (!breaks.sleepOn) return false;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = String(breaks.sleepTime||'23:00').split(':').map(Number);
    const [wh, wm] = String(breaks.wakeTime||'07:00').split(':').map(Number);
    const sleepMin = (sh||23) * 60 + (sm||0);
    const wakeMin = (wh||7) * 60 + (wm||0);

    // Check day-of-week for mode
    const dow = now.getDay(); // 0=Sun, 6=Sat
    if (breaks.sleepMode === 'weekdays' && (dow === 0 || dow === 6)) return false;
    if (breaks.sleepMode === 'weekends' && dow >= 1 && dow <= 5) return false;

    // Handle overnight window (sleep 23:00, wake 07:00)
    if (sleepMin > wakeMin) {
      return nowMin >= sleepMin || nowMin < wakeMin;
    } else {
      return nowMin >= sleepMin && nowMin < wakeMin;
    }
  }

  /* === SESSION LOGOUT ===
   * Ends the session properly (real logout link, or the act=out URL) instead of
   * leaving it open to time out. Sets cbLogoutIntent first so the
   * blockLogoutRedirect guard at the top lets this one through. Used by both
   * scheduled sleep and the online-watch logout action.
   */
  function doLogout(reason) {
    try {
      try { tabs.release(); } catch(_) {}
      try { stopKaWorker(); stopKaAudio(); releaseWakeLock(); } catch(_) {}
      localStorage.setItem('cbLogoutIntent', '1');
      const link = document.querySelector('a[href*="act=out" i]');
      const url  = link ? link.href : '/authenticated/default.aspx?act=out';
      console.log('[JB][LOGOUT]', reason || 'logout', '→', url);
      window.location.href = url;
    } catch (e) {
      console.warn('[JB][LOGOUT] failed:', e.message);
      try { localStorage.removeItem('cbLogoutIntent'); } catch(_) {}
    }
  }

  function doSleepLogout() { doLogout('sleep window'); }

  // Triggered by the online-watch when a listed player comes online, if the
  // logout action is enabled. Sets a suppression window so auto-login stays off
  // for the configured number of minutes rather than signing straight back in.
  function watchLogout(name) {
    const mins = Math.max(1, Number(ow.logoutMins) || 60);
    if (ow.logoutPark) {
      // Parking is the suppression mechanism — leave TMN and stay off until the
      // user returns manually. No timed window, so a manual return logs in cleanly.
      GM_setValue('cbLogoutPark', '1');
      GM_setValue('cbLogoutParkUrl', ow.parkUrl || 'https://www.google.co.uk');
    } else {
      // No parking: hold on the login page for the configured window instead.
      GM_setValue('cbOwLogoutUntil', Date.now() + mins * 60000);
    }
    if (ow.telegram) tgMsg('online', `🚪 <b>Logging out</b> — ${esc(name)} online\\n${st.player||'?'} | ${ow.logoutPark ? 'parked off-site' : 'back in ' + mins + 'm'}`);
    setTimeout(() => doLogout('watched player online: ' + name), 2000);
  }

  // Pause the automation and wait for a manual decision (stays logged in).
  function watchStop(name) {
    paused = true;
    setStatus(`⏸ Stopped — ${name} online`);
    owBrowserNotify(`${APP_NAME}: stopped`, `Paused because ${name} is online`);
    if (ow.telegram) tgMsg('online', `⏸ <b>Stopped</b> — ${esc(name)} online\n${st.player||'?'} | script paused, waiting for you`);
    console.log('[JB][WATCH] Script paused —', name, 'online');
  }

  function handleSleep() {
    if (!breaks.sleepOn) { breaks.isSleeping = false; saveBreaks(); return false; }
    if (isSleepWindow()) {
      if (!breaks.isSleeping) {
        breaks.isSleeping = true;
        saveBreaks();
        tgMsg('sleep', `😴 <b>Sleep Mode</b>\n${st.player||'?'} | Until ${breaks.wakeTime}`);
        console.log(`[JB] Entering sleep mode until ${breaks.wakeTime}`);
        if (breaks.sleepLogout) {
          setTimeout(doSleepLogout, 3000);
        }
      }
      return true;
    } else {
      if (breaks.isSleeping) {
        breaks.isSleeping = false;
        saveBreaks();
        tgMsg('wake', `☀️ <b>Wake Up</b>\n${st.player||'?'} | Good morning!`);
        console.log('[JB] Waking up from sleep mode');
      }
      return false;
    }
  }

  function getBreakStatus() {
    if (breaks.isSleeping) return { active:true, type:'sleep', msg:`😴 Sleeping until ${breaks.wakeTime}` };
    // Mod-online break — reported as a break so the panel, the ready reminders and
    // the watchdog's "deliberate wait" check all treat it as one.
    if (typeof modBreakActive === 'function' && modBreakActive())
      return { active:true, type:'mod', msg:`🛑 Mod break (${modBreakRemainingMin()}m left)` };
    if (breaks.lunchEndAt > 0 && Date.now() < breaks.lunchEndAt) {
      const rem = Math.ceil((breaks.lunchEndAt - Date.now())/60000);
      return { active:true, type:'lunch', msg:`🍔 Lunch (${rem}m left)` };
    }
    if (breaks.coffeeEndAt > 0 && Date.now() < breaks.coffeeEndAt) {
      const rem = Math.ceil((breaks.coffeeEndAt - Date.now())/60000);
      return { active:true, type:'coffee', msg:`☕ Coffee (${rem}m left)` };
    }
    return { active:false, type:null, msg:null };
  }

  let paused = false;

  /* === HARD HALT (the ALL switch) ===
   *
   * "Off" has to mean OFF AT THE NETWORK, not just "the actions are unticked".
   *
   * The reason is the script check. A moderator sends one and then watches
   * whether the account keeps behaving like somebody is sitting at it. With the
   * actions merely switched off, Jarvis still polled the inbox every 30s, fetched
   * the OC/DTM/travel timers every 60s, re-fetched protection, scanned the
   * players page, pinged keep-alive every 5 minutes and fired the XP status
   * refresh — a steady drumbeat of requests on your session cookie saying "still
   * here" while you are demonstrably not answering. That is the exact opposite of
   * what "I've stopped" is supposed to look like, and it is worse than useless:
   * it is evidence against you.
   *
   * So halting stops every request Jarvis makes TO THE GAME, and stops
   * navigating. Three layers, because timers are not the only entry point:
   *   1. mainLoop returns immediately (kills every loop-driven action + nav)
   *   2. the fetching timers are cleared, so there are no wakeups to leak through
   *   3. each fetch entry point checks isHalted() itself, so a stray call from a
   *      handler, a retry or a setTimeout still can't reach the network
   * plus safeNav() refusing outright, as the single navigation choke point.
   *
   * WHAT DELIBERATELY KEEPS RUNNING — all of it local or outbound-to-Telegram,
   * none of it visible to the game:
   *   · the Telegram send queue and the critical-alert queue. A queued script
   *     check alert MUST still reach you; that is the whole point of stopping.
   *   · the panel, so you can turn it back on.
   *   · reading the page already in front of you (staff-check / anti-bot
   *     detection), which costs nothing and is worth keeping.
   *
   * KNOWN CONSEQUENCE, and it is the correct one: with keep-alive stopped the
   * session will eventually time out. Being logged out is what "stopped" should
   * look like. Auto-login is suppressed while halted for the same reason —
   * otherwise the halt would quietly log you back in and start the drumbeat again.
   */
  function isHalted() { return !!st.halted; }

  function haltAll(reason) {
    st.halted = true;
    GM_setValue('cbHalted', true);   // written directly too: the login page reads it before st exists
    saveSt();
    try { if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; } _loopDueAt = 0; } catch(_){}
    try { owStop(); } catch(_){}
    try { propWatchStop(); } catch(_){}
    try { modWatchStop(); } catch(_){}
    try { stopKeepAlive(); } catch(_){}
    try { stopFetchTimers(); } catch(_){}
    // Anything mid-flight must not resume on the next page.
    try {
      st.acting = false; st.action = ''; st.pending = ''; GM_setValue('cbActStart', 0);
      localStorage.removeItem('cbActionLockUntil');
    } catch(_){}
    saveSt();
    console.log(`${APP_TAG}[HALT] Stopped — no further requests to the game.${reason ? ' (' + reason + ')' : ''}`);
    setStatus('⛔ STOPPED — no activity');
  }

  /* Everything that polls, watches or keeps the session warm, in one idempotent
   * place. Called by init() when not halted, and by resumeAll().
   *
   * It has to be BOTH places: a page that loads while halted never runs the
   * start-up path, so resuming has to be able to bring the whole lot up from
   * cold. The `_oneShotsDone` flag covers the inits that are not safe to run
   * twice — initServerTime sets an unheld interval, and initKeepAliveExtras adds
   * event listeners — while the rest are start/stop pairs that clear first.
   */
  let _oneShotsDone = false;
  function startAllServices() {
    if (isHalted()) return;
    try { startTimers(); } catch(_){}
    try { migrateOwList(); } catch(_){}
    try { owStart(); } catch(_){}
    try { propWatchStart(); } catch(_){}
    try { modWatchStart(); } catch(_){}
    try { startWatchdog(); } catch(_){}
    try { startKeepAlive(); } catch(_){}
    try { initSgLists(); } catch(_){}
    try { initPlayerHover(); } catch(_){}
    if (!_oneShotsDone) {
      _oneShotsDone = true;
      try { initKeepAliveExtras(); } catch(_){}
      try { initServerTime(); } catch(_){}
      try { initHot(); } catch(_){}
    }
  }

  function resumeAll(reason) {
    st.halted = false;
    GM_setValue('cbHalted', false);
    saveSt();
    startAllServices();
    console.log(`${APP_TAG}[HALT] Resumed.${reason ? ' (' + reason + ')' : ''}`);
    setStatus('▶️ Resumed');
    try { schedLoop(1000); } catch(_){}
  }

  function saveSt() {
    const m = {
      cbAutoCrime:st.crime, cbAutoGta:st.gta, cbAutoJail:st.jail, cbAutoBooze:st.booze,
      cbAutoHealth:st.health, cbAutoGarage:st.garage, cbAutoCrusher:st.crusher,
      cbCrusherOwned:st.crusherOwned,
      cbLastCrime:st.lastCrime, cbLastGta:st.lastGta, cbLastJail:st.lastJail,
      cbLastBooze:st.lastBooze, cbLastHealth:st.lastHealth, cbLastGarage:st.lastGarage,
      cbSelCrimes:st.crimes, cbSelGtas:st.gtas, cbPlayer:st.player, cbInJail:st.inJail,
      cbJailReleaseUntil:st.jailReleaseUntil,
      cbCollCrime:st.collapsed.crime, cbCollGta:st.collapsed.gta, cbCollBooze:st.collapsed.booze,
      cbMinimized:st.minimized, cbLastJailCk:st.lastJailCk, cbAction:st.action,
      cbRefresh:st.refresh, cbPending:st.pending, cbBuyHealth:st.buyHealth,
      cbAutoOC:st.autoOC, cbAutoDTM:st.autoDTM, cbNotifyReady:st.notifyReady,
      cbWhitelist:st.whitelist, cbWlNames:st.wlNames, cbBlNames:st.blNames, cbCarCats:st.carCats,
      cbCreateOC:st.createOC, cbOcTrans:st.ocTrans, cbOcWeapon:st.ocWeapon,
      cbOcExplo:st.ocExplo, cbOcSched:st.ocSched, cbOcType:st.ocType,
      cbOcRepeat:st.ocRepeat, cbOcLeft:st.ocLeft,
      cbAutoTravel:st.autoTravel, cbAutoDtmList:st.autoDtmList,
      cbHalted:st.halted
    };
    for (const [k,v] of Object.entries(m)) GM_setValue(k, v);
  }


  /* === TAB MANAGER === */

  const LS_MASTER = 'cbMaster', LS_HB = 'cbHeartbeat', LS_LOCK = 'cbLock';

  class TabCtrl {
    constructor() {
      // Stable per-tab id: sessionStorage survives this tab's own navigations
      // (crimes → travel → jail …) but is unique per browser tab. Without this,
      // every page load minted a new id that no longer matched the master
      // record, so the tab demoted itself to "secondary" for ~15s after each
      // navigation while it waited for the previous page's heartbeat to expire.
      let id = null;
      try { id = sessionStorage.getItem('cbTabId'); } catch(_) {}
      if (!id) {
        id = `t_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
        try { sessionStorage.setItem('cbTabId', id); } catch(_) {}
      }
      this.id = id;
      this.hbIv = null;
      this.isMaster = false;
      this.HB_MS = 2000;
      // Takeover threshold is now dynamic — see timeoutMs().
    }
    // A hidden tab's heartbeat interval gets throttled to ~1/min, so a 6s
    // takeover threshold would let another tab steal mastership from a
    // perfectly healthy worker. Be generous while hidden.
    timeoutMs() { return document.hidden ? 120000 : 15000; }
    // Stamp the heartbeat out-of-band (called by the worker ticker, which keeps
    // running when normal intervals are throttled).
    beat() {
      if (this.isMaster && localStorage.getItem(LS_MASTER) === this.id)
        localStorage.setItem(LS_HB, String(Date.now()));
    }
    check() {
      const cur = localStorage.getItem(LS_MASTER);
      const hb  = parseInt(localStorage.getItem(LS_HB)||'0',10);
      const now = Date.now();
      if (cur === this.id) {
        this.isMaster = true;
        localStorage.setItem(LS_HB, String(now));
        return true;
      }
      if (!cur || (now - hb) > this.timeoutMs()) {
        const lk = localStorage.getItem(LS_LOCK);
        if (!lk || (now - parseInt(lk,10)) > 1000) {
          localStorage.setItem(LS_LOCK, String(now));
          this.become();
          return true;
        }
        return this.isMaster;
      }
      this.isMaster = false;
      return false;
    }
    become() {
      this.isMaster = true;
      localStorage.setItem(LS_MASTER, this.id);
      localStorage.setItem(LS_HB, String(Date.now()));
      this.startHb();
    }
    startHb() {
      if (this.hbIv) clearInterval(this.hbIv);
      this.hbIv = setInterval(() => {
        if (!this.isMaster) return;
        if (localStorage.getItem(LS_MASTER) === this.id)
          localStorage.setItem(LS_HB, String(Date.now()));
        else { this.stopHb(); this.isMaster = false; }
      }, this.HB_MS);
    }
    stopHb() { if (this.hbIv) { clearInterval(this.hbIv); this.hbIv = null; } }
    release() {
      if (this.isMaster && localStorage.getItem(LS_MASTER) === this.id) {
        localStorage.removeItem(LS_MASTER);
        localStorage.removeItem(LS_HB);
      }
      this.stopHb(); this.isMaster = false;
    }
    force() {
      localStorage.setItem(LS_MASTER, this.id);
      localStorage.setItem(LS_HB, String(Date.now()));
      this.isMaster = true; this.startHb();
    }
    hasOther() {
      const cur = localStorage.getItem(LS_MASTER);
      const hb  = parseInt(localStorage.getItem(LS_HB)||'0',10);
      return cur && cur !== this.id && (Date.now()-hb) <= this.timeoutMs();
    }
  }

  const tabs = new TabCtrl();

  /* === AUTO-RESUME CONFIG === */

  const resume = { on: GM_getValue('cbResumeOn', true) };
  function saveResume() { GM_setValue('cbResumeOn', resume.on); }

  /* === STATS COLLECTION === */

  const stats = {
    on:    GM_getValue('cbStatsOn', true),
    intv:  GM_getValue('cbStatsInt', 60),
    last:  GM_getValue('cbStatsLast', 0),
    cache: GM_getValue('cbStatsCache', null)
  };
  function saveStats() {
    GM_setValue('cbStatsOn', stats.on); GM_setValue('cbStatsInt', stats.intv);
    GM_setValue('cbStatsLast', stats.last); GM_setValue('cbStatsCache', stats.cache);
  }

  /* === GAME DEFINITIONS === */

  const CRIMES = [
    { id:1, name:'Credit card fraud',   el:'ctl00_main_btnCrime1' },
    { id:2, name:'Rob gas station',     el:'ctl00_main_btnCrime2' },
    { id:3, name:'Sell illegal weapons', el:'ctl00_main_btnCrime3' },
    { id:4, name:'Rob a store',         el:'ctl00_main_btnCrime4' },
    { id:5, name:'Rob a bank',          el:'ctl00_main_btnCrime5' }
  ];

  /* === EXCLUDED CRIMES — NEVER AUTOMATE ===
   * ctl00_main_btnCrime6 is "Pick a player's pockets": a crime aimed at another
   * PLAYER, not an NPC target. Everything else on the page is victimless as far
   * as the community is concerned; this one steals from a real person and invites
   * retaliation, so it is off-limits to automation regardless of its odds.
   *
   * It is absent from CRIMES and the settings list, so today it cannot be picked.
   * That is an accident of two hardcoded bounds (this array, and the 1..5 fallback
   * loop in doCrime) rather than a stated rule — change either and it would
   * silently become selectable. This set makes the exclusion explicit and is
   * enforced at the point of click, so no future edit can re-enable it by mistake.
   *
   * Note it is an <input type="image">, so it looks nothing like the others in the
   * DOM and would not stand out in a selector sweep.
   */
  const EXCLUDED_CRIME_IDS = new Set([6]);
  const EXCLUDED_CRIME_ELS = new Set(['ctl00_main_btnCrime6']);

  function crimeAllowed(id, el) {
    if (EXCLUDED_CRIME_IDS.has(Number(id))) return false;
    if (el && el.id && EXCLUDED_CRIME_ELS.has(el.id)) return false;
    return true;
  }
  const GTAS = [
    { id:1, name:'Public parking lot',  val:'1' },
    { id:2, name:'Building parking lot',val:'2' },
    { id:3, name:'Residential place',   val:'3' },
    { id:4, name:'Pick Pocket Keys',    val:'4' },
    { id:5, name:'Car jack from street', val:'5' }
  ];

  /* === STATUS BAR PARSER === */

  function readBar() {
    const r = { city:'', rank:'', rankPct:0, net:'', cash:0, hp:0, fmj:0, jhp:0, credits:0, ts:Date.now() };
    try {
      const g = id => { const e = document.getElementById(id); return e ? e.textContent.trim() : ''; };
      r.city = g('ctl00_userInfo_lblcity');
      r.rank = g('ctl00_userInfo_lblrank');
      const rp = g('ctl00_userInfo_lblRankbarPerc');
      const pm = rp.match(/\(([\d]+)[.,]?(\d+)?%\)/);
      if (pm) r.rankPct = parseFloat(pm[1]+'.'+(pm[2]||'00'));
      r.cash = parseInt(g('ctl00_userInfo_lblcash').replace(/[$,]/g,''))||0;
      r.hp = parseInt(g('ctl00_userInfo_lblhealth').replace('%',''))||0;
      r.net = g('ctl00_userInfo_lblnetwork');
      r.fmj = parseInt(g('ctl00_userInfo_lblfmj'))||0;
      r.jhp = parseInt(g('ctl00_userInfo_lbljhp'))||0;
      r.credits = parseInt(g('ctl00_userInfo_lblcredits'))||0;
    } catch(_) { return null; }
    return r;
  }

  /* === UI HELPERS === */

  let _shadow = null;
  // Assigned by buildUI; no-op until then so callers never need to guard.
  let repaintRibbon = () => {};

  function setStatus(msg) {
    if (_shadow) {
      const el = _shadow.querySelector('#jb-status');
      const ji = st.inJail ? '🔒' : '✅';
      const pi = st.pending ? `<br>Pending: ${st.pending}` : '';
      if (el) el.innerHTML = `${esc(msg)}<br>Player: ${esc(st.player)}<br>Jail: ${ji}${pi}<br>Crime: ${fmtAgo(st.lastCrime)}<br>GTA: ${fmtAgo(st.lastGta)}<br>Booze: ${fmtAgo(st.lastBooze)}`;
    }
    console.log(APP_TAG, msg);
  }

  /* === TELEGRAM CHECKS === */

  const TG_SEND_TIMEOUT = 15000;
  let _lastHealthAlert = 0;

  function checkLowHp() {
    if (!tg.enabled) return false;
    const hp = getHp();
    const now = Date.now();
    if (hp < cfg.minHealth) {
      if (now - _lastHealthAlert >= 10000) {
        _lastHealthAlert = now;
        tgMsg('health', `🏥 <b>LOW HEALTH</b>\n${st.player||'?'} | ${hp}% (min: ${cfg.minHealth}%)\n${st.health ? '💊 Auto-buy ON' : '⚠️ Auto-buy OFF'}`);
        return true;
      }
    } else { _lastHealthAlert = 0; }
    return false;
  }

  let _captchaSent = false;
  function checkCaptcha() {
    if (!tg.enabled || !tg.captcha) return false;
    if (isOnCaptcha()) {
      if (!_captchaSent) {
        sendTg(`⚠️ <b>SCRIPT CHECK</b>\n${st.player||'?'} | ${fmtDate()}\nAutomation paused`, true);
        _captchaSent = true;
      }
      return true;
    }
    _captchaSent = false;
    return false;
  }

  let _lastMsgCt = 0;
  function checkNewMsgs() {
    if (!tg.enabled && !st.autoOC && !st.autoDTM) return false;
    let has = false, ct = 0;
    const sp = document.querySelector('span[id*="imgMessages"]');
    if (sp) {
      const t = sp.getAttribute('title');
      const c = sp.getAttribute('class');
      if (t && t !== '0') { ct = parseInt(t)||0; if (ct>0) has = true; }
      if (!has && c) { const m = c.match(/message(\d+)/); if (m) { ct = parseInt(m[1])||1; has = true; } }
    }
    if (!has) { const m = document.title.match(/(\d+)\s+new\s+mails?/i); if (m) { has=true; ct=parseInt(m[1]); } }
    if (!has) { if (document.querySelector('img[src*="new_message_1.gif"]')) { has=true; ct=1; } }
    if (has && ct > _lastMsgCt) {
      _lastMsgCt = ct;
      localStorage.setItem('cbLastMailTs','0');
      return true;
    }
    if (has) _lastMsgCt = ct; else _lastMsgCt = 0;
    return false;
  }

  /* === ANTI-BOT / SOFT-BAN MESSAGE DETECTION ===
   * The game posts warnings and soft bans into an "Important message" panel. Until
   * now Jarvis had no idea what one looked like: checkSqlCheck() treats ANY such
   * panel as a staff question, alerts, and pauses — which is right for a question
   * but useless for a ban, where the useful information is the expiry time.
   *
   * CLAUDE.md listed this as blocked on "needs the exact warning phrases". It
   * isn't: the reference script keys off the panel's STRUCTURE, not its wording,
   * and only then parses an expiry out of the body. The wording matters solely to
   * tell a ban apart from a staff question, and for that a broad pattern is safe —
   * getting it wrong costs a pause and an alert, never an auto-answer.
   *
   * Runs BEFORE checkSqlCheck and returns true to claim the page, so a soft ban is
   * never mistaken for a script check (which would have Jarvis nagging you to
   * "answer in-game" a message that has no question in it).
   */
  const LS_SOFTBAN_UNTIL = 'cbSoftBanUntil';

  // Phrases that mark a message as enforcement rather than a staff question.
  const ANTIBOT_RE = /(expires\s+at\s*:|soft\s*ban|temporar(?:y|ily)\s+(?:ban|block|suspend)|you\s+have\s+been\s+(?:banned|blocked|suspended|warned)|(?:bot|script|macro|automat\w+)\s*(?:ting|ed)?\s*(?:use|usage|detect\w*|activity)|use\s+of\s+(?:a\s+)?(?:bot|script|macro))/i;

  function softBanRemainingMs() {
    const until = parseInt(GM_getValue(LS_SOFTBAN_UNTIL, 0) || 0, 10);
    if (!until) return 0;
    const rem = until - Date.now();
    if (rem <= 0) { GM_setValue(LS_SOFTBAN_UNTIL, 0); return 0; }
    return rem;
  }

  // Parse "expires at: DD-MM-YYYY HH:MM:SS" into an epoch ms, treating the
  // wall-clock as Amsterdam (the game's timezone) with correct DST handling.
  function parseSoftBanExpiry(body) {
    const m = String(body || '').match(/expires\s+at\s*:?\s*(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/i);
    if (!m) return 0;
    const [, dd, mo, yyyy, hh, mi, ss] = m.map(Number);
    try { return amsterdamWallclockToTs(yyyy, mo, dd, hh, mi, ss); } catch (_) { return 0; }
  }

  function detectAntiBotMsg() {
    if (!cfg.antiBotOn) return false;
    const panel = document.querySelector('#ctl00_main_pnlMessage');
    if (!panel) return false;
    const title = panel.querySelector('.NewGridTitle');
    if (!title || !/important message/i.test(title.textContent || '')) return false;

    const body = (panel.innerText || panel.textContent || '').trim();
    if (!ANTIBOT_RE.test(body)) return false;   // a staff question — leave it to checkSqlCheck

    paused = true;

    // Expiry: park it so the pause survives reloads and lifts by itself. Without
    // one we still pause, we just can't say for how long.
    let until = parseInt(GM_getValue(LS_SOFTBAN_UNTIL, 0) || 0, 10);
    if (!until) {
      until = parseSoftBanExpiry(body);
      if (until > Date.now()) {
        GM_setValue(LS_SOFTBAN_UNTIL, until);
        const amsStr = new Date(until).toLocaleTimeString('en-GB', { timeZone:'Europe/Amsterdam' });
        console.warn(`${APP_TAG}[ANTIBOT] Soft ban until ${amsStr} Amsterdam`);
      }
    }

    const rem = softBanRemainingMs();
    const mins = rem > 0 ? Math.ceil(rem / 60000) : 0;
    setStatus(rem > 0 ? `🚨 ANTI-BOT — paused, ${mins}m left` : '🚨 ANTI-BOT MESSAGE — paused');

    // One critical alert per distinct message. Reload-proof like the staff check,
    // because this is the one you most need to actually see.
    const sig = body.replace(/\s+/g, ' ').trim().substring(0, 160);
    if (seenOnce('antibot', contentHash(sig), 20)) {
      const untilLine = rem > 0
        ? `\n⏰ Until ${new Date(until).toLocaleString('en-GB', { timeZone:'Europe/Amsterdam' })} (Amsterdam) — ${mins}m`
        : '';
      queueCriticalAlert('antibot:' + contentHash(sig),
        `🚨 <b>ANTI-BOT MESSAGE</b>\n${st.player||'?'} | ${fmtDate()}${untilLine}\n<pre>${esc(body.substring(0, 400))}</pre>\n⛔ Automation paused`,
        5, 2000, 8, 300000);
      console.warn(`${APP_TAG}[ANTIBOT] ${sig}`);
    }
    return true;
  }

  // Called each tick while paused so the pause lifts on its own once the stated
  // expiry passes — no reload needed, and it survives navigation either way.
  function softBanHold() {
    const rem = softBanRemainingMs();
    if (rem <= 0) return false;
    setStatus(`🚨 Soft ban — ${Math.ceil(rem/60000)}m remaining`);
    return true;
  }

  let _sqlSent = false;
  function checkSqlCheck() {
    if (!tg.enabled || !tg.sqlCheck) return false;
    const div = document.querySelector('div.NewGridTitle');
    const hasImp = div && div.textContent.includes('Important message');
    const txt = document.body.textContent;
    const hasSql = /(SQL|Stipe|Marc)\s*(Script Check|what your favourite|tell .* what)/i.test(txt);
    if (hasImp || hasSql) {
      let q = 'Check the page';
      for (const p of document.querySelectorAll('p,div')) {
        const t = p.textContent;
        if (/(SQL|Stipe|Marc)/i.test(t) && t.includes('?')) { q = t.trim(); break; }
      }
      // Persist a content-keyed fingerprint so reloads don't re-alert. Using the
      // list-based seenOnce (not a single last-value) means a check that cycles
      // between two questions (A→B→A) won't re-alert on A's reappearance — each
      // distinct question alerts exactly once. Borrowed from the moderator script.
      const sig = q.substring(0,120);
      if (seenOnce('sqlcheck', contentHash(sig), 30)) {
        localStorage.setItem('cbSqlCheckFp', sig); // keep for the clear-on-gone logic below
        queueCriticalAlert('sqlcheck:' + contentHash(sig),
          `❗ <b>STAFF CHECK</b>\n${st.player||'?'} | ${fmtDate()}\n${esc(sig)}\n⚠️ Answer in-game to avoid a soft ban`,
          5, 2000, 10, 180000);
      }
      _sqlSent = true;
      return true; // still pause automation while the check is on screen
    }
    if (!hasImp && !hasSql) {
      if (_sqlSent) {
        // Check has cleared — stop chasing it (whatever the last fingerprint was)
        const lastSig = localStorage.getItem('cbSqlCheckFp') || '';
        if (lastSig) clearCriticalAlert('sqlcheck:' + contentHash(lastSig));
      }
      _sqlSent = false;
      localStorage.removeItem('cbSqlCheckFp');
      if (paused) { paused = false; setStatus('Staff check cleared'); }
    }
    return false;
  }

  let _logoutSent = false;
  function checkLogout() {
    if (!tg.enabled || !tg.logout) return false;
    const url = window.location.href.toLowerCase();
    if (!url.includes('login.aspx')) {
      if (url.includes('/authenticated/')) { _logoutSent = false; loClearState(); stopFlash(); }
      return false;
    }
    const key = loAlertKey(url);
    if (!_logoutSent && !loWasSent(key)) {
      const kind = key !== 'login-page' ? 'LOGOUT/TIMEOUT' : 'SESSION LOST';
      loMarkSent(key);
      sendTg(`🚪 <b>${kind}</b>\n${st.player||'?'} | ${fmtDate()}\nPlease log back in`);
      fireLogoutAlerts();
      _logoutSent = true;
      return true;
    }
    return false;
  }

  /* === STAFF-MAIL ALERT HELPERS === */

  function sendScriptTestAlert(mailId, sender, subject) {
    // Ban-risk alert — must reach you even across page navigations. 5 quick sends,
    // then re-pings every 3 min (×10 = ~30 min backstop) so a missed burst still
    // chases you down before the no-reply window closes.
    queueCriticalAlert(
      'scriptcheck:' + (mailId || contentHash(sender + subject)),
      `❗ <b>SCRIPT CHECK (inbox)</b>\n${st.player||'?'} | ${fmtDate()}\nFrom: ${esc(sender)} | ${esc(subject)}\n⚠️ Reply in-game to avoid a soft ban`,
      5, 2000, 10, 180000
    );
  }

  function isSqlStipeSender(name) { return /^(sql|stipe|marc)$/i.test(String(name||'').trim()); }

  function hasStaffSignal(sender, subject, row, body='') {
    const all = `${sender||''} ${subject||''} ${row||''} ${body||''}`;
    return /\b(SQL|Stipe|Marc)\b/i.test(all) &&
           /(script\s*check|staff|admin|answer|question|reply|respond|favourite|favorite|important|mail|message)/i.test(all);
  }

  function sendStaffAlert(mailId, sender, subject, body='') {
    const preview = body ? `\n<pre>${esc(body.substring(0,300))}</pre>` : '';
    queueCriticalAlert(
      'staffmail:' + (mailId || contentHash(sender + subject)),
      `❗ <b>STAFF MAIL</b>\n${st.player||'?'} | ${fmtDate()}\nFrom: <b>${esc(sender)}</b> | ${esc(subject)}${preview}`,
      5, 2000, 6, 180000
    );
  }

  function isScriptTestSubject(subject, row) {
    return /^script\s*test$/i.test(String(subject||'').trim()) || /\bscript\s*test\b/i.test(String(row||''));
  }

  /* === ONLINE WATCH FUNCTIONS === */

  function normName(n) { return String(n||'').trim().replace(/\s+/g,' ').toLowerCase(); }

  function owAuthBase() {
    const m = window.location.pathname.match(/^\/(authenticated)/i);
    return m ? `/${m[1]}` : '/authenticated';
  }

  function owUrl(p='players.aspx') {
    return `${window.location.origin}${owAuthBase()}/${String(p).replace(/^\/?(authenticated\/)?/i,'')}`;
  }

  function isLoginDoc(doc) {
    try {
      return !!(doc.querySelector('input[type="password"]') ||
                (doc.body?.textContent||'').toLowerCase().includes('login') && (doc.body?.textContent||'').toLowerCase().includes('password'));
    } catch(_) { return false; }
  }

  /* Chokepoint for the online watch, property watch and mod watch. Rejecting
   * rather than resolving empty keeps every caller's existing error path — they
   * all log a failed scan and keep their last reading, which is exactly right. */
  function owFetch(url) {
    if (isHalted()) return Promise.reject(new Error('halted'));
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), OW_TIMEOUT);
    return fetch(url, { method:'GET', credentials:'include', cache:'no-store', signal:ac.signal, headers:{'X-CB-Watch':'1'} })
      .finally(() => clearTimeout(tm));
  }

  /* === ONE players.aspx FETCH, SHARED (2000.286) ===
   *
   * The online watch and the mod watch both poll this page every 60s on their
   * own timers, so it was fetched TWICE A MINUTE for one document. modScan also
   * never reused the page already in front of it, which owScan has always done.
   *
   * The cache is a plain per-page variable, which is exactly the right lifetime:
   * a page lives seconds here, so it can never go stale across a navigation.
   *
   * `allowLive` matters and is NOT a convenience flag. The mod watch identifies
   * staff by the game's inline `color: #FF9900` on the profile link — and the SG
   * list colouring overwrites that very attribute with !important on the LIVE
   * document. So a staff member who is also on an SG list would be invisible to
   * a scan of the live page. The online watch only reads names and hrefs, which
   * the colouring does not touch, so it may use the live page; the mod watch
   * must always parse a freshly fetched copy. */
  let _playersDoc = null, _playersAt = 0;
  const PLAYERS_CACHE_MS = 30000;

  async function getPlayersDoc(allowLive) {
    if (allowLive && /players\.aspx/i.test(window.location.pathname)) {
      return { doc: document, url: 'current page' };
    }
    if (_playersDoc && (Date.now() - _playersAt) <= PLAYERS_CACHE_MS) {
      return { doc: _playersDoc, url: 'cached' };
    }
    const f = await fetchOwPage();
    _playersDoc = f.doc; _playersAt = Date.now();
    return f;
  }

  async function fetchOwPage() {
    let lastErr = null;
    for (const p of OW_PAGES) {
      try {
        const r = await owFetch(window.location.origin + p);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const html = await r.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (isLoginDoc(doc)) throw new Error('Logged out');
        return { doc, url: window.location.origin + p };
      } catch(e) { lastErr = e; }
    }
    try {
      const url = owUrl('players.aspx');
      const r = await owFetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (isLoginDoc(doc)) throw new Error('Logged out');
      return { doc, url };
    } catch(e) { lastErr = e; }
    throw lastErr || new Error('Cannot fetch players');
  }

  function parseOwPlayers(doc) {
    const map = new Map();
    for (const a of doc.querySelectorAll('a[href*="profile.aspx" i]')) {
      const nm = (a.textContent||'').trim().replace(/\s+/g,' ');
      const href = a.getAttribute('href')||'';
      if (!nm || nm.length > 40) continue;
      if (/^(profile|view|user|players|online|home|logout)$/i.test(nm)) continue;
      const idm = href.match(/[?&]id=(\d+)/i);
      map.set(normName(nm), { name:nm, href:new URL(href, window.location.origin).href, id:idm?idm[1]:'' });
    }
    return map;
  }

  /* curOwPlayers() was removed in 2000.286 — getPlayersDoc(true) does the same
   * job, and leaving a second copy of 'read the live players page' lying about
   * is precisely the trap the duplicate isInHot() turned out to be in 250:
   * harmless while nothing calls it, wrong the moment somebody does. */

  function owBrowserNotify(title, body, url) {
    if (!ow.notify || !canNotify()) return;
    const fire = () => {
      try {
        const n = new Notification(title, { body, requireInteraction:true });
        n.onclick = () => { window.focus(); if (url) window.open(url,'_blank','noopener'); n.close(); };
      } catch(_) {}
    };
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission === 'default') Notification.requestPermission().then(p => { if(p==='granted') fire(); }).catch(()=>{});
  }

  function owSound() {
    if (!ow.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC(), osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880; g.gain.value = 0.08;
      osc.connect(g); g.connect(ctx.destination); osc.start();
      setTimeout(() => { osc.frequency.value = 660; }, 130);
      setTimeout(() => { try{osc.stop();}catch(e){} try{ctx.close();}catch(e){} }, 280);
    } catch(_){}
  }

  function owFlashTitle(name) {
    if (!ow.flash) return;
    if (owFlashTimer) clearInterval(owFlashTimer);
    let c = 0;
    owFlashTimer = setInterval(() => {
      document.title = (c%2===0) ? `🟢 ${name} ONLINE` : _origTitle;
      c++;
      if (c > 12) { clearInterval(owFlashTimer); owFlashTimer = null; document.title = _origTitle; }
    }, 1000);
  }

  // State-change detection: only alert on transitions, not repeat online
  function owShouldAlertOnline(key) {
    const was = !!ow.lastOn[key];
    return !was; // was offline, now online = alert
  }

  function owShouldAlertOffline(key) {
    if (!ow.notifyOff) return false;
    const was = !!ow.lastOn[key];
    return was; // was online, now offline = alert
  }

  // Fire a player's configured actions immediately, as if they'd just come
  // online — for testing your setup without waiting for a real offline→online
  // flip. Runs the REAL actions (so a logout-configured player really logs out).
  function owTestPlayer(id) {
    const entry = (ow.list || []).find(e => owId(e) === id);
    if (!entry) return;
    console.log('[JB][WATCH] TEST fire for', owName(entry));
    owTriggerOnline(entry, { name: owName(entry), href: '' });
  }

  function owTriggerOnline(entry, hit) {
    const id = owId(entry), name = owName(entry), href = (hit && hit.href) || '';
    ow.lastAlert[id] = Date.now();
    saveOw();
    const acts = getOwActions(id);
    console.log('[JB][WATCH]', name, `(G${getOwGroup(id)}) came ONLINE — actions:`, acts.join(',') || 'none');
    setStatus(`🟢 ${name} online`);
    if (acts.includes('notify'))   owBrowserNotify(`${APP_NAME}: player online`, `${name} is online`, href);
    if (acts.includes('sound'))    owSound();
    if (acts.includes('flash'))    owFlashTitle(name);
    if (acts.includes('telegram')) tgMsg('online', `🟢 <b>ONLINE</b> — ${esc(name)}\n${st.player||'?'} | ${fmtDate()}`);
    if (acts.includes('stop'))     watchStop(name);
    if (acts.includes('logout'))   watchLogout(name);
  }

  function owTriggerOffline(entry) {
    if (!ow.notifyOff) return;
    const name = owName(entry);
    owBrowserNotify(`${APP_NAME}: player offline`, `${name} went offline`);
    if (ow.telegram) tgMsg('offline', `🔴 <b>OFFLINE</b> — ${esc(name)}\n${st.player||'?'} | ${fmtDate()}`);
    setStatus(`🔴 ${name} offline`);
    console.log('[JB][WATCH]', name, 'went OFFLINE');
  }

  async function owScan(reason='timer') {
    if (!owEnabled() || !tabs.isMaster || owBusy) return;
    if (!ow.list.length) {
      ow.scanAt = Date.now(); ow.scanOk = true; ow.scanMsg = 'No names in list';
      saveOw(); renderOwUI(); return;
    }
    owBusy = true;
    try {
      // allowLive: the watch reads names and hrefs only, which SG colouring
      // does not alter — see getPlayersDoc.
      const f = await getPlayersDoc(true);
      const map = parseOwPlayers(f.doc), src = f.url;
      for (const entry of ow.list) {
        const id = owId(entry), nm = owName(entry);
        const hit = map.get(normName(nm));
        const isOnline = !!hit;
        const wasOnline = !!ow.lastOn[id];
        const grpOn = groupOn(getOwGroup(id));   // only act if this entry's group is enabled

        // State change: offline → online
        if (isOnline && !wasOnline && grpOn) {
          owTriggerOnline(entry, hit);
        }
        // State change: online → offline
        if (!isOnline && wasOnline && grpOn) {
          owTriggerOffline(entry);
        }

        ow.lastOn[id] = isOnline;
      }
      ow.scanAt = Date.now(); ow.scanOk = true;
      ow.scanMsg = `OK: ${map.size} online (${src})`;
      saveOw(); renderOwUI();
    } catch(e) {
      ow.scanAt = Date.now(); ow.scanOk = false;
      ow.scanMsg = e?.name==='AbortError' ? 'Timeout' : (e?.message||String(e));
      saveOw(); renderOwUI();
    } finally { owBusy = false; }
  }

  function owStart() {
    owStop();
    if (!owEnabled()) { renderOwUI(); return; }
    const ms = Math.max(OW_MIN_SEC, Number(ow.sec||OW_DEF_SEC)) * 1000;
    owTimer = setInterval(() => owScan('timer'), ms);
    setTimeout(() => owScan('startup'), 2500);
    renderOwUI();
  }

  function owStop() { if (owTimer) clearInterval(owTimer); owTimer = null; }

  // --- watch-entry helpers (entries are {id, name}; legacy entries were plain strings) ---
  function genOwId() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function owId(e)   { return (e && typeof e === 'object') ? e.id : ('legacy_' + normName(e)); }
  function owName(e) { return (e && typeof e === 'object') ? e.name : String(e||''); }

  // One-time migration: turn old string-list entries into {id,name} objects and
  // carry their name-keyed settings across to the new per-entry id keys.
  function migrateOwList() {
    if (!Array.isArray(ow.list)) { ow.list = []; return; }
    let changed = false;
    ow.list = ow.list.map(item => {
      if (item && typeof item === 'object' && item.id) return item; // already migrated
      const name = String(item||'').trim();
      const id = genOwId(), k = normName(name);
      if (ow.actions && Array.isArray(ow.actions[k])) ow.actions[id] = ow.actions[k].slice();
      if (ow.group && ow.group[k]) ow.group[id] = ow.group[k];
      if (ow.lastOn && k in ow.lastOn) ow.lastOn[id] = ow.lastOn[k];
      changed = true;
      return { id, name };
    });
    if (changed) saveOw();
  }

  function owAdd(name) {
    const clean = String(name||'').trim().replace(/\s+/g,' ');
    if (!clean) return alert('Enter a name');
    if (ow.list.length >= OW_MAX) return alert(`Max ${OW_MAX} entries`);
    // Duplicates allowed: each entry is independent, so the same person can
    // appear twice with different groups/actions (e.g. a day one and a night one).
    const id = genOwId();
    ow.list.push({ id, name: clean });
    ow.lastOn[id] = false;
    if (!ow.actions) ow.actions = {};
    ow.actions[id] = OW_DEFAULT_ACTIONS.slice();
    if (!ow.group) ow.group = {};
    ow.group[id] = 1;
    saveOw(); renderOwUI();
  }

  function owRemove(id) {
    ow.list = ow.list.filter(e => owId(e) !== id);
    delete ow.lastOn[id]; delete ow.lastAlert[id];
    if (ow.actions) delete ow.actions[id];
    if (ow.group) delete ow.group[id];
    saveOw(); renderOwUI();
  }

  // Actions ticked for a given entry id (falls back to defaults if never set).
  function getOwActions(id) {
    if (!ow.actions) ow.actions = {};
    if (!Array.isArray(ow.actions[id])) ow.actions[id] = OW_DEFAULT_ACTIONS.slice();
    return ow.actions[id];
  }

  function toggleOwAction(id, actionKey) {
    const arr = getOwActions(id);
    const i = arr.indexOf(actionKey);
    if (i >= 0) arr.splice(i, 1); else arr.push(actionKey);
    saveOw(); renderOwUI();
  }

  // Two groups sharing one scan — each has its own Enabled toggle so you can
  // switch e.g. friends and enemies on/off independently.
  function owEnabled() { return ow.on || ow.on2; }
  function groupOn(g) { return g === 2 ? ow.on2 : ow.on; }
  function getOwGroup(id) {
    if (!ow.group) ow.group = {};
    return ow.group[id] === 2 ? 2 : 1;   // default group 1
  }
  function setOwGroup(id, g) {
    if (!ow.group) ow.group = {};
    ow.group[id] = (g === 2 ? 2 : 1);
    saveOw(); renderOwUI();
  }

  function renderOwUI() {
    // Will be implemented in UI section
  }

  /* === MOD PRESENCE (no jail on Mod · mod-online break) ===
   *
   * Two separate behaviours off one detection, both default OFF:
   *
   *   NO JAIL ON MOD  — while staff are online, stop attempting jail busts.
   *     Jail is the loudest thing Jarvis does: cfg.jailInt defaults to THREE
   *     SECONDS, so it's a page load every few seconds, all day. That is the
   *     activity a moderator watching the jail list would notice first. Nothing
   *     else is suppressed, because nothing else is anywhere near as noisy.
   *
   *   MOD-ONLINE BREAK — roll a 1-2h break, optionally logging out. The blunt
   *     option for when you'd rather simply not be there.
   *
   * DETECTION IS THE GAME'S OWN MARKER, not a name list. players.aspx renders a
   * staff member's profile link with an inline `color: #FF9900`, so the site
   * itself tells us who is staff. That catches EVERY moderator, including ones we
   * could never have named — an earlier draft matched the four STAFF_IDS accounts
   * and would have sat blind to anyone else. Fetching reuses the online watch's
   * fetchOwPage (same proven request), but the parse is separate because the
   * watch's parseOwPlayers deliberately discards styling.
   *
   * MARC IS EXCLUDED. The owner's account shows highlighted essentially always, so
   * counting it would leave the feature permanently triggered — jail off forever,
   * or a break that re-arms the moment it ends. The reference script skips marc in
   * exactly the same place and for the same reason.
   *
   * FAILING OPEN IS DELIBERATE. A failed fetch does not assert "a mod is online"
   * and pause you indefinitely on a network blip; the last good reading is kept
   * and allowed to go stale, and a stale reading stops suppressing anything (see
   * modsOnline). The cost of failing closed — a silent all-day halt you'd only
   * notice hours later — is far worse than the cost of one unsuppressed bust.
   */
  const MOD_STALE_MS = 5 * 60 * 1000;   // a reading older than this suppresses nothing
  const LS_MOD_BREAK_UNTIL = 'cbModBreakUntil';
  const MOD_HILITE_RE = /color:\s*#FF9900/i;
  const MOD_IGNORE = new Set(['marc']);  // owner — permanently highlighted, see above
  let _modBusy = false, _modTimer = null;

  /* Staff names on a players.aspx document, read from the game's own highlight.
   * Separate from parseOwPlayers because that one drops the inline style, and
   * changing it would risk the online watch for no gain here. */
  function parseModsFromDoc(doc) {
    const out = [], seen = new Set();
    for (const a of doc.querySelectorAll('a[href*="profile.aspx?id="]')) {
      const name = (a.textContent || '').trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      if (MOD_IGNORE.has(name.toLowerCase())) continue;
      if (!MOD_HILITE_RE.test(a.getAttribute('style') || '')) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
    return out;
  }

  function modState() {
    try { const s = JSON.parse(localStorage.getItem('cbModOnline') || 'null'); return s && typeof s === 'object' ? s : null; }
    catch(_) { return null; }
  }

  // Names of staff currently online, or [] — an unavailable/stale reading yields
  // [] so every caller treats "we don't know" as "don't suppress".
  function modsOnline() {
    const s = modState();
    if (!s || !Array.isArray(s.names)) return [];
    if (Date.now() - (s.at || 0) > MOD_STALE_MS) return [];
    return s.names;
  }

  // The gate doJailbreak consults. Separate from jailShouldHoldOff() (which yields
  // to a due action) because the reasons are unrelated and both must be able to
  // hold jail independently.
  function modJailBlocked() {
    if (!cfg.modWatchOn || !cfg.noJailOnMod) return false;
    return modsOnline().length > 0;
  }

  function modBreakActive() {
    const until = parseInt(localStorage.getItem(LS_MOD_BREAK_UNTIL) || '0', 10);
    if (!until) return false;
    if (Date.now() >= until) {
      localStorage.removeItem(LS_MOD_BREAK_UNTIL);
      console.log(`${APP_TAG}[MOD] Break over — resuming`);
      tgMsg('modOnline', `▶️ <b>Mod break over</b>\n${st.player||'?'} | back on`);
      return false;
    }
    return true;
  }

  function modBreakRemainingMin() {
    const until = parseInt(localStorage.getItem(LS_MOD_BREAK_UNTIL) || '0', 10);
    return until ? Math.max(0, Math.ceil((until - Date.now()) / 60000)) : 0;
  }

  function startModBreak(names) {
    if (modBreakActive()) return;                       // already on one
    const lo = Math.max(1, Number(cfg.modBreakMin) || 60);
    const hi = Math.max(lo, Number(cfg.modBreakMax) || lo);
    const mins = lo + Math.floor(Math.random() * (hi - lo + 1));
    localStorage.setItem(LS_MOD_BREAK_UNTIL, String(Date.now() + mins * 60000));
    console.log(`${APP_TAG}[MOD] ${names.join(', ')} online — taking a ${mins}m break`);
    tgMsg('modOnline', `🛑 <b>Mod online</b> — ${esc(names.join(', '))}\n${st.player||'?'} | ${mins}m break${cfg.modBreakLogout ? ', logging out' : ''}`);
    if (cfg.modBreakLogout) {
      /* Reuse the watch-logout suppression so auto-login doesn't sign straight
       * back in — without this the login page would log us back in within
       * seconds and the break would be over before it started. */
      GM_setValue('cbOwLogoutUntil', Date.now() + mins * 60000);
      setTimeout(() => doLogout('mod online: ' + names.join(', ')), 2000);
    }
  }

  async function modScan() {
    if (!cfg.modWatchOn || !tabs.isMaster || _modBusy) return;
    _modBusy = true;
    try {
      // NOT allowLive — SG colouring overwrites the #FF9900 staff highlight on
      // the live page, which would hide any moderator who is also on a list.
      const f = await getPlayersDoc(false);
      const names = parseModsFromDoc(f.doc);
      const prev = modState();
      const was = (prev && Array.isArray(prev.names)) ? prev.names : [];
      localStorage.setItem('cbModOnline', JSON.stringify({ names, at: Date.now(), ok: true }));

      // Alert + break only on the transition, so a mod sitting online all evening
      // doesn't re-trigger every poll.
      const fresh = names.filter(n => !was.includes(n));
      if (fresh.length) {
        console.log(`${APP_TAG}[MOD] Staff online: ${names.join(', ')}`);
        if (cfg.modBreakOn) startModBreak(names);
        else tgMsg('modOnline', `👮 <b>Staff online</b> — ${esc(names.join(', '))}\n${st.player||'?'}${cfg.noJailOnMod ? ' | jail paused' : ''}`);
      } else if (was.length && !names.length) {
        console.log(`${APP_TAG}[MOD] Staff offline — all clear`);
        tgMsg('modOnline', `✅ <b>Staff offline</b>\n${st.player||'?'} | all clear`);
      }
    } catch (e) {
      /* Keep the last reading and let it age out rather than asserting anything.
       * See the section note: failing open is the deliberate choice here. */
      console.warn(APP_TAG, '[MOD] scan failed:', e && e.message ? e.message : e);
    } finally { _modBusy = false; }
  }

  function modWatchStart() {
    modWatchStop();
    if (!cfg.modWatchOn) return;
    const ms = Math.max(30, Math.min(600, Number(cfg.modPollSec) || 60)) * 1000;
    _modTimer = setInterval(modScan, ms);
    setTimeout(modScan, 7000);
  }

  function modWatchStop() { if (_modTimer) clearInterval(_modTimer); _modTimer = null; }

  /* === SCRIPT CHECK MONITOR === */

  let _scActive = false, _scSubmitted = false;

  function startScMonitor() {
    if (!resume.on || _scActive) return;
    _scActive = true; _scSubmitted = false;
    const iv = setInterval(() => {
      if (!isOnCaptcha()) {
        clearInterval(iv); _scActive = false;
        localStorage.removeItem('cbScriptCheck');
        paused = false; setStatus('Script check cleared');
        return;
      }
      const resp = document.querySelector('textarea[name="g-recaptcha-response"]');
      const tok = resp?.value?.trim();
      if (tok && tok.length > 0 && !_scSubmitted) {
        _scSubmitted = true;
        const btn = document.querySelector('#ctl00_main_MyScriptTest_btnSubmit') ||
                    document.querySelector('#ctl00_main_btnVerify') ||
                    document.querySelector('input[type="submit"], button[type="submit"]') ||
                    [...document.querySelectorAll('input,button')].find(b =>
                      (b.value||b.textContent||'').toLowerCase().match(/verify|submit/));
        if (btn && !btn.disabled) setTimeout(() => btn.click(), 3000 + Math.random()*2000);
      }
    }, 1500);
    setTimeout(() => { if (_scActive) { clearInterval(iv); _scActive = false; } }, 600000);
  }


  /* === DTM & OC TIMER SYSTEM === */

  const DTM_PATH = '/authenticated/organizedcrime.aspx?p=dtm';
  const OC_PATH  = '/authenticated/organizedcrime.aspx';

  async function fetchDtmTimer() {
    try {
      const url = `${window.location.origin}${DTM_PATH}&_=${Date.now()}`;
      const r = await fetch(url, { method:'GET', headers:{'Cache-Control':'no-cache'}, credentials:'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const msg = doc.querySelector('#ctl00_lblMsg');
      if (msg) {
        const m = (msg.textContent||'').match(/wait (\d+) hours? (\d+) minutes? and (\d+) seconds?/i);
        if (m) {
          const [,h,mi,s] = m.map(Number);
          return { ready:false, h, m:mi, s, total:h*3600+mi*60+s, at:Date.now() };
        }
      }
      const div = doc.querySelector('.NewGridTitle');
      if (div && div.textContent.includes('Start a Drugs Transportation Mission'))
        return { ready:true, h:0, m:0, s:0, total:0, at:Date.now() };
      return null;
    } catch(e) { console.error(APP_TAG,'DTM timer err',e); return null; }
  }

  async function fetchOcTimer() {
    try {
      const url = `${window.location.origin}${OC_PATH}?_=${Date.now()}`;
      const r = await fetch(url, { method:'GET', headers:{'Cache-Control':'no-cache'}, credentials:'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const msg = doc.querySelector('#ctl00_lblMsg');
      if (msg) {
        const m = (msg.textContent||'').match(/wait (\d+) hours? (\d+) minutes? and (\d+) seconds?/i);
        if (m) {
          const [,h,mi,s] = m.map(Number);
          return { ready:false, h, m:mi, s, total:h*3600+mi*60+s, at:Date.now() };
        }
      }
      const div = doc.querySelector('.NewGridTitle');
      if (div && div.textContent.includes('Start an Organized Crime'))
        return { ready:true, h:0, m:0, s:0, total:0, at:Date.now() };
      return null;
    } catch(e) { console.error(APP_TAG,'OC timer err',e); return null; }
  }

  function storeDtm(d) { if(d) localStorage.setItem('cbDtmTimer', JSON.stringify({...d, fetchAt:Date.now(), expires:Date.now()+d.total*1000})); }
  function storeOc(d)  { if(d) localStorage.setItem('cbOcTimer',  JSON.stringify({...d, fetchAt:Date.now(), expires:Date.now()+d.total*1000})); }

  function getDtm() {
    const raw = localStorage.getItem('cbDtmTimer');
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      const rem = Math.max(0, Math.floor((d.expires - Date.now())/1000));
      if (rem <= 0) return { ready:true, h:0, m:0, s:0, total:0 };
      return { ready:false, h:Math.floor(rem/3600), m:Math.floor((rem%3600)/60), s:rem%60, total:rem };
    } catch(_) { return null; }
  }

  function getOc() {
    const raw = localStorage.getItem('cbOcTimer');
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      const rem = Math.max(0, Math.floor((d.expires - Date.now())/1000));
      if (rem <= 0) return { ready:true, h:0, m:0, s:0, total:0 };
      return { ready:false, h:Math.floor(rem/3600), m:Math.floor((rem%3600)/60), s:rem%60, total:rem };
    } catch(_) { return null; }
  }

  function fmtTimer(t, readyKey) {
    if (!t) return { txt:'—', clr:'gray', rdy:false };
    if (t[readyKey] || t.total <= 0) return { txt:'Ready', clr:'green', rdy:true };
    const {h,m} = t;
    let txt = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : (m > 0 ? `${m}m` : '< 1m');
    return { txt, clr:'red', rdy:false };
  }

  /* === TRAVEL TIMER === */

  const TRAVEL_PATH = '/authenticated/travel.aspx';

  /* Is the page SAYING you have to wait, whether or not we can parse how long?
   *
   * This is the fix for "the timer says Ready when there's time left" (2000.255).
   * The five patterns below extract a duration; if none of them match, the old
   * code fell straight through to a "can I travel?" test that was satisfied by
   * the destination radios or the Travel button merely EXISTING. The game renders
   * that form on the cooldown page too — with the button disabled and a wait
   * message above it — so any wording we couldn't parse was read as Ready, the
   * panel showed Ready, and auto-travel would set off for a flight the game was
   * never going to allow.
   *
   * So presence of a wait message now VETOES ready on its own. Being told "you
   * must wait" is information even when the duration isn't. */
  const TRAVEL_WAIT_RE = /before\s+you\s+can\s+travel|you\s+have\s+to\s+wait|you\s+cannot\s+travel|have\s+to\s+wait\s+\d/i;

  async function fetchTravel() {
    if (isHalted()) return;
    try {
      const url = `${window.location.origin}${TRAVEL_PATH}?_=${Date.now()}`;
      dlog('[JB][TRAVEL] Fetching:', url);
      const r = await fetch(url, { method:'GET', headers:{'Cache-Control':'no-cache'}, credentials:'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // BEST: read ctl00_lblMsg span directly
      const msgEl = doc.querySelector('#ctl00_lblMsg');
      const msgTxt = msgEl ? (msgEl.textContent||'').trim() : '';
      const bodyTxt = doc.body.textContent||'';
      const lower = bodyTxt.toLowerCase();

      dlog('[JB][TRAVEL] lblMsg:', msgTxt || '(empty)');

      let h = 0, m = 0, s = 0, found = false;

      // Pattern A: exact TMN "It is X hours Y minutes and Z seconds before you can travel"
      if (msgTxt) {
        const ma = msgTxt.match(/(\d+)\s+hours?\s+(\d+)\s+minutes?\s+and\s+(\d+)\s+seconds?/i);
        if (ma) { h = parseInt(ma[1],10)||0; m = parseInt(ma[2],10)||0; s = parseInt(ma[3],10)||0; found = true; }
      }

      // Pattern B: same but in full body text
      if (!found) {
        const mb = bodyTxt.match(/(\d+)\s+hours?\s+(\d+)\s+minutes?\s+and\s+(\d+)\s+seconds?\s+before/i);
        if (mb) { h = parseInt(mb[1],10)||0; m = parseInt(mb[2],10)||0; s = parseInt(mb[3],10)||0; found = true; }
      }

      // Pattern C: "X hours Y minutes" no seconds
      if (!found) {
        const mc = bodyTxt.match(/(\d+)\s+hours?\s+(?:and\s+)?(\d+)\s+minutes?/i);
        if (mc && (lower.includes('travel') || lower.includes('before'))) {
          h = parseInt(mc[1],10)||0; m = parseInt(mc[2],10)||0; found = true;
        }
      }

      // Pattern D: "X minutes and Y seconds"
      if (!found) {
        const md = bodyTxt.match(/(\d+)\s+minutes?\s+(?:and\s+)?(\d+)\s+seconds?/i);
        if (md && (lower.includes('travel') || lower.includes('before') || lower.includes('wait'))) {
          m = parseInt(md[1],10)||0; s = parseInt(md[2],10)||0; found = true;
        }
      }

      // Pattern E: just "X seconds before"
      if (!found) {
        const me = bodyTxt.match(/(\d+)\s+seconds?\s+before/i);
        if (me) { s = parseInt(me[1],10)||0; found = true; }
      }

      const commTotal = found ? (h*3600+m*60+s) : null;

      /* === THE PAGE CARRIES TWO COOLDOWNS — READ THE JET ONE (2000.260) ===
       *
       * This is the bug behind "travel was fine until we removed the 40m option".
       *
       * travel.aspx states BOTH:
       *   "It is 0 hours 45 minutes and 0 seconds before you can travel commercially.
       *    Private Jet travel is now available at increased cost."
       * or with the jet still cooling:
       *    "Private Jet travel is available in 0 hours 19 minutes and 46 seconds!"
       *
       * Every one of the five duration patterns above matches the COMMERCIAL
       * sentence — it is the one that says "before you can travel". That was
       * correct while we actually flew the commercial plane. 2000.255 made us
       * JET ONLY and left the parse alone, so ever since, Jarvis has been sitting
       * out the 45-minute commercial timer while the jet had been ready for 25
       * minutes. It also explains the panel jumping: we store 20m after our own
       * flight, then the next fetch overwrites it with the commercial 45m.
       *
       * Wording taken from the reference script's parseTravelCooldownFromPage,
       * which has had this right all along.
       *
       * THE ENABLED BUTTON OUTRANKS BOTH NUMBERS. The game enables it exactly
       * when you may fly, so it is the one signal that can't be out of step with
       * whatever the sentence happens to say. */
      const jetBtnReady = (() => { const b = doc.querySelector('#ctl00_main_btnTravelPrivate'); return !!b && !b.disabled; })();
      let jetSecs = null;
      if (/private\s*jet\s+travel\s+is\s+now\s+available/i.test(bodyTxt)) jetSecs = 0;
      else {
        const jm = bodyTxt.match(/private\s*jet[^.!]*?(?:available\s+in|remaining|:)\s*(?:(\d+)\s*hours?\s*)?(\d+)\s*minutes?\s*and\s*(\d+)\s*seconds?/i);
        if (jm) jetSecs = (parseInt(jm[1]||'0',10))*3600 + (parseInt(jm[2],10)||0)*60 + (parseInt(jm[3],10)||0);
      }

      if (jetBtnReady || jetSecs !== null) {
        const cd = jetBtnReady ? 0 : jetSecs;
        storeTravel({ cd, canNormal:false, comm: commTotal, at:Date.now() });
        dlog(APP_TAG, `[TRAVEL] Jet ${cd > 0 ? `in ${Math.round(cd/60)}m` : 'READY'}` +
                      (commTotal != null ? ` (commercial ${Math.round(commTotal/60)}m — not used, jet only)` : ''));
        updateTimers();
        return;
      }

      if (found && commTotal > 0) {
        /* Jet line unreadable. Fall back to the commercial number so we still
         * hold SOME cooldown rather than claiming Ready — but say so, because on
         * a jet-only setup this is the wrong timer and will read ~25m long. */
        storeTravel({ cd:commTotal, canNormal:false, comm: commTotal, at:Date.now() });
        console.warn(APP_TAG, `[TRAVEL] Could not read the Private Jet time — falling back to the commercial ${h}h ${m}m ${s}s, which runs ~25m long on jet-only. Page said:`,
                     (msgTxt || bodyTxt.replace(/\s+/g, ' ').slice(0, 200)));
        updateTimers();
        return;
      }

      /* Nothing parsed. Before concluding "ready", check whether the page is
       * telling us to wait in wording we don't recognise — see TRAVEL_WAIT_RE. */
      const waiting = TRAVEL_WAIT_RE.test(msgTxt) || TRAVEL_WAIT_RE.test(bodyTxt);
      if (waiting) {
        /* On cooldown, duration unknown. Keep whatever timer we already had
         * rather than claiming Ready, and log the exact text so the patterns
         * above can be widened to cover it. */
        console.warn(APP_TAG, '[TRAVEL] On cooldown but the remaining time did not parse — keeping the existing timer. Message:',
                     (msgTxt || bodyTxt.replace(/\s+/g, ' ').slice(0, 200)));
        updateTimers();
        return;
      }

      /* Ready needs a control we could actually USE, not merely one present in
       * the markup. Both buttons render on the cooldown page as well, disabled —
       * testing only for existence is what made a cooldown look like Ready. */
      const btnUsable = sel => { const b = doc.querySelector(sel); return !!b && !b.disabled; };
      const canNow = btnUsable('#ctl00_main_btnTravelPrivate') ||
                     btnUsable('#ctl00_main_btnTravelNormal') ||
                     ((lower.includes('select a destination') || lower.includes('where would you like')) &&
                      doc.querySelector('input[type=radio][name="ctl00$main$citieslist"]') !== null);

      if (canNow) {
        storeTravel({ cd:0, canNormal:true, at:Date.now() });
        dlog('[JB][TRAVEL] Ready to travel');
      } else {
        dlog('[JB][TRAVEL] Could not parse — keeping existing timer');
      }
      updateTimers();
    } catch(e) { console.error(APP_TAG,'Travel fetch err',e); }
  }

  function storeTravel(d) { if(d) localStorage.setItem('cbTravelTimer', JSON.stringify({...d, fetchAt:Date.now()})); }

  function getTravel() {
    const raw = localStorage.getItem('cbTravelTimer');
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      const elapsed = Math.floor((Date.now()-d.fetchAt)/1000);
      const remaining = Math.max(0, (d.cd||0)-elapsed);
      return { ready: remaining <= 0, remaining };
    } catch(_) { return null; }
  }

  function fmtTravel(ts) {
    if (!ts) return { txt:'—', clr:'gray' };
    if (ts.ready) return { txt:'Ready', clr:'green' };
    const m = Math.floor(ts.remaining / 60);
    const s = ts.remaining % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return { txt:`${h}h ${m % 60}m`, clr:'red' };
    }
    return { txt: m > 0 ? `${m}m ${s}s` : `${s}s`, clr:'red' };
  }

  /* === PROTECTION TIMER === */

  const LS_PROT_END = 'cbProtEnd', LS_PROT_ST = 'cbProtStatus';

  async function fetchProt() {
    if (isHalted()) return;
    try {
      const url = `${window.location.origin}/authenticated/statistics.aspx?p=p&_=${Date.now()}`;
      const r = await fetch(url, { method:'GET', headers:{'Cache-Control':'no-cache'}, credentials:'same-origin' });
      if (!r.ok) return;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const el = doc.getElementById('ctl00_main_lblNewPlayerProtectionEndDate');
      if (el) {
        const txt = el.textContent.trim();
        const rm = txt.match(/\((?:(\d+)d\s*)?(\d+):(\d{2}):(\d{2})\s*remaining\)/i);
        if (rm) {
          const ms = ((parseInt(rm[1]||'0',10)*24+parseInt(rm[2],10))*3600+parseInt(rm[3],10)*60+parseInt(rm[4],10))*1000;
          localStorage.setItem(LS_PROT_END, String(Date.now()+ms));
          localStorage.setItem(LS_PROT_ST, 'active');
          return;
        }
        const dm = txt.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (dm) {
          const [,dd,mm,yy,H,M,S] = dm;
          const ts = Date.UTC(+yy, +mm-1, +dd, +H, +M, +S);
          localStorage.setItem(LS_PROT_END, String(ts));
          localStorage.setItem(LS_PROT_ST, 'active');
          return;
        }
      }
      const existing = localStorage.getItem(LS_PROT_ST);
      if (existing === 'active') {
        const end = parseInt(localStorage.getItem(LS_PROT_END)||'0',10);
        localStorage.setItem(LS_PROT_ST, (end > 0 && Date.now() < end) ? 'left' : 'expired');
      } else if (!existing) { localStorage.setItem(LS_PROT_ST, 'none'); }
    } catch(e) { console.error(APP_TAG,'Prot err',e); }
  }

  function getProt() {
    const st = localStorage.getItem(LS_PROT_ST);
    if (!st) return null;
    if (st === 'none') return { txt:'None', clr:'#888' };
    if (st === 'left') return { txt:'Left Early', clr:'#e74856' };
    if (st === 'expired') return { txt:'Expired', clr:'#888' };
    const end = parseInt(localStorage.getItem(LS_PROT_END)||'0',10);
    if (!end) return { txt:'Active', clr:'#107c10' };
    const rem = end - Date.now();
    if (rem <= 0) { localStorage.setItem(LS_PROT_ST, 'expired'); return { txt:'Expired', clr:'#888' }; }
    const d = Math.floor(rem/86400000), h = Math.floor((rem%86400000)/3600000), m = Math.floor((rem%3600000)/60000);
    let txt = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    return { txt, clr:'#107c10' };
  }

  /* === NOTE: forced stat refresh lives in the XP section (maybeForceStatRefresh) ===
   * The comment that used to sit here argued a forced refresh was pointless,
   * because the icon's anchor is just onclick="pstats(N)" — the same call the
   * page's own inline setInterval already makes every 15 seconds. That reasoning
   * was wrong, and it cost us the 222-225 arc.
   *
   * The call is identical; the TIMING is not. Under bot navigation a page often
   * doesn't survive 15 seconds, so the page's own interval never fires even once
   * and the interceptor sees nothing at all. Clicking the icon fires the poll on
   * OUR schedule. That is why the total sat frozen at 3944.20 for three hours
   * while the endpoint was demonstrably still serving real JSON.
   *
   * What WAS genuinely broken in 219 was the fallback selector: it targeted
   * span[id*="imgMessages"], a plain <a href="mailbox.aspx"> with no handler, so
   * clicking it navigated Jarvis to the mailbox. The re-added version clicks
   * #ctl00_imgRefresh only, and refuses any anchor whose href looks like a real
   * navigation.
   */

  /* === OC/DTM READY ALERTS === */

  /* Re-ping while an OC/DTM sits READY and unused.
   *
   * The first alert fires once on the cooldown→ready transition. If you miss it,
   * a 2h cooldown can sit finished all evening — the alert is gone and nothing
   * says so again. These reminders repeat while the timer is STILL ready.
   *
   * Three rules that keep it a reminder rather than a nag:
   *   CAPPED     — at most cfg.readyRepeatMax re-pings, then it gives up. An OC
   *                you're deliberately holding shouldn't buzz you all night.
   *   AUTO-DISARM— the counter resets the moment the timer goes back on cooldown,
   *                so doing the OC silently ends the reminders. So does jail, a
   *                break, or sleep: those are times you can't act anyway.
   *   RELOAD-PROOF— the next-due time lives in localStorage and is checked on the
   *                timer tick, never a setTimeout. Jarvis navigates every few
   *                seconds, so a pending timer would rarely survive to fire.
   */
  function readyReminder(kind, rdy, label) {
    const nk = 'cbRdyNext_' + kind, ck = 'cbRdyCount_' + kind;
    const every = Math.max(0, Number(cfg.readyRepeatMin) || 0);
    const cap   = Math.max(0, Number(cfg.readyRepeatMax) || 0);

    // Not ready any more (or the feature is off) — disarm and forget the count.
    if (!rdy || !every || !cap) {
      localStorage.removeItem(nk); localStorage.removeItem(ck);
      return;
    }
    // Can't act on it right now, so don't nag — but keep the count, because the
    // reminder is still owed once you're free.
    if (st.inJail || paused || getBreakStatus().active) return;

    const now = Date.now();
    const due = parseInt(localStorage.getItem(nk) || '0', 10);
    if (!due) { localStorage.setItem(nk, String(now + every * 60000)); return; }
    if (now < due) return;

    const n = parseInt(localStorage.getItem(ck) || '0', 10) + 1;
    if (n > cap) { localStorage.removeItem(nk); return; }   // capped — stop, stay disarmed
    localStorage.setItem(ck, String(n));
    localStorage.setItem(nk, String(now + every * 60000));
    tgMsg('readyAgain', `🔔 <b>${label} STILL READY</b>\n${st.player||'?'} | reminder ${n}/${cap} · ready ${every*n}m ago`);
    console.log(`${APP_TAG}[READY] ${label} still ready — reminder ${n}/${cap}`);
  }

  function checkReadyAlerts() {
    if (!tg.enabled || !st.notifyReady || st.inJail) return;
    const dtm = getDtm();
    if (dtm) {
      const rdy = dtm.ready || (dtm.total||0) <= 0;
      const last = localStorage.getItem('cbDtmReadyState');
      if (rdy && last !== 'ready') {
        localStorage.setItem('cbDtmReadyState','ready');
        tgMsg('dtmReady', `✅ <b>DTM READY</b>\n${st.player||'?'} | ${fmtDate()}`);
      } else if (!rdy && last === 'ready') localStorage.setItem('cbDtmReadyState','cd');
      readyReminder('dtm', rdy, 'DTM');
    }
    const oc = getOc();
    if (oc) {
      const rdy = oc.ready || (oc.total||0) <= 0;
      const last = localStorage.getItem('cbOcReadyState');
      if (rdy && last !== 'ready') {
        localStorage.setItem('cbOcReadyState','ready');
        tgMsg('ocReady', `✅ <b>OC READY</b>\n${st.player||'?'} | ${fmtDate()}`);
        if (st.createOC && getCreateOCState() === 'idle') try { triggerCreateOC(); } catch(e){}
      } else if (!rdy && last === 'ready') localStorage.setItem('cbOcReadyState','cd');
      readyReminder('oc', rdy, 'OC');
    }
  }

  /* === PROTECTION WARNINGS === */

  function checkProtWarn() {
    if (!tg.enabled) return;
    if (localStorage.getItem(LS_PROT_ST) !== 'active') return;
    const end = parseInt(localStorage.getItem(LS_PROT_END)||'0',10);
    if (!end) return;
    const rem = end - Date.now();
    if (rem <= 0) return;
    const hrs = rem / 3600000;
    if (!localStorage.getItem('cbProtW12') && hrs <= 12 && hrs > 11) {
      localStorage.setItem('cbProtW12','1');
      tgMsg('protection', `⚠️ <b>Protection ~12h</b>\n${st.player||'?'} | ${Math.floor(hrs)}h left`);
    }
    if (!localStorage.getItem('cbProtW6') && hrs <= 6 && hrs > 5) {
      localStorage.setItem('cbProtW6','1');
      tgMsg('protection', `🚨 <b>Protection ~6h</b>\n${st.player||'?'} | ${Math.floor(hrs)}h left`);
    }
  }

  /* === TIMER DISPLAY SYSTEM === */

  let _timerEls = {}, _timerCache = {
    dtm: GM_getValue('cbCacheDtm',''), oc: GM_getValue('cbCacheOc',''),
    travel: GM_getValue('cbCacheTravel',''), hp: GM_getValue('cbCacheHp',''),
    prot: GM_getValue('cbCacheProt',''), hotCity: ''
  };
  let _timerDispIv = null, _timerFetchIv = null, _protIv = null;

  function clrForTimer(clr) {
    if (clr === 'green') return 'var(--jb-success)';
    if (clr === 'red' || clr === 'danger') return 'var(--jb-danger)';
    if (clr === 'amber') return '#f59e0b';
    return 'var(--jb-text-ter)';
  }

  function hpColor(hp) {
    if (hp >= 100) return 'var(--jb-success)';
    if (hp > 60) return '#f59e0b';
    return 'var(--jb-danger)';
  }

  function updateTimers() {
    if (!_shadow) return;
    if (!_timerEls.dtm) {
      _timerEls.dtm = _shadow.querySelector('#jb-dtm');
      _timerEls.oc = _shadow.querySelector('#jb-oc');
      _timerEls.travel = _shadow.querySelector('#jb-travel');
      _timerEls.hp = _shadow.querySelector('#jb-hp');
      _timerEls.prot = _shadow.querySelector('#jb-prot');
    }

    const dtm = fmtTimer(getDtm(), 'ready');
    const oc  = fmtTimer(getOc(), 'ready');
    const trv = fmtTravel(getTravel());
    const bar = readBar();
    const prt = getProt();

    const setEl = (el, key, html) => {
      if (el && _timerCache[key] !== html) { _timerCache[key] = html; GM_setValue('cbCache'+key.charAt(0).toUpperCase()+key.slice(1), html); el.innerHTML = html; }
    };

    setEl(_timerEls.dtm, 'dtm', `<span style="color:${clrForTimer(dtm.clr)}">●</span> ${dtm.txt}`);
    setEl(_timerEls.oc, 'oc', `<span style="color:${clrForTimer(oc.clr)}">●</span> ${oc.txt}`);
    setEl(_timerEls.travel, 'travel', `<span style="color:${clrForTimer(trv.clr)}">●</span> ${trv.txt}`);

    if (bar) {
      const hp = bar.hp||0;
      setEl(_timerEls.hp, 'hp', `<span style="color:${hpColor(hp)}">●</span> ${hp}%`);
      // Capture rank for the Experience panel + stats page. Rank-up is detected by
      // the NAME changing (model-independent), which also marks the XP charts.
      try {
        if (bar.rank) {
          rankState.name = bar.rank;
          GM_setValue('cbRankName', rankState.name);
          /* THE TRANSITION IS THE MASTER TAB'S TO CONSUME (2000.266).
           *
           * updateTimers runs in EVERY tab, and this used to write
           * cbRankLastName from any of them. A non-master tab would therefore
           * see the change, store the new name — and then be refused by
           * dcSendOnce for not being master. The master tab, re-reading that
           * already-updated name, never saw a transition at all, so the rank-up
           * was swallowed and nothing posted anywhere.
           *
           * Only the tab allowed to ANNOUNCE the change may record it. */
          if (tabs.isMaster) {
            if (rankState.lastName && bar.rank !== rankState.lastName) {
              onRankUp(rankState.lastName, bar.rank);
            }
            rankState.lastName = bar.rank;
            GM_setValue('cbRankLastName', rankState.lastName);
          }
        }
        if (typeof bar.rankPct === 'number') {
          rankState.pct = bar.rankPct;
          GM_setValue('cbRankPct', rankState.pct);
        }
      } catch(_){}
    }
    if (prt) setEl(_timerEls.prot, 'prot', `<span style="color:${prt.clr}">●</span> ${prt.txt}`);

    // Hot city display
    if (!_timerEls.hotCity) _timerEls.hotCity = _shadow.querySelector('#jb-hot-display');
    if (_timerEls.hotCity) {
      const hot = getHot();
      const inHot = isInHot();
      const cur = getCurCity();
      const clr = inHot ? 'var(--jb-success)' : hot ? 'var(--jb-danger)' : 'var(--jb-text-ter)';
      const label = hot ? (inHot ? `✅ ${hot}` : `${hot} (in ${cur||'?'})`) : '—';
      const newHtml = `<span style="color:${clr}">●</span> ${label}`;
      if (_timerCache.hotCity !== newHtml) { _timerCache.hotCity = newHtml; _timerEls.hotCity.innerHTML = newHtml; }
    }

    try { checkReadyAlerts(); } catch(_){}
    try { checkProtWarn(); } catch(_){}
    try { syncXpFromBar(); } catch(_){}
    try { updateXpUI(); } catch(_){}
    try { checkXpCapResets(); } catch(_){}
    try { pumpCriticalAlerts(); } catch(_){}
    try { pumpTgQueue(); } catch(_){}
  }

  async function collectTimers() {
    if (isHalted()) return;
    if (st.inJail || paused) return;
    try {
      const [d, o] = await Promise.all([fetchDtmTimer(), fetchOcTimer()]);
      if (d) storeDtm(d);
      if (o) storeOc(o);
      updateTimers();
    } catch(_){}
  }

  function startTimers() {
    if (_shadow) {
      ['dtm','oc','travel','hp','prot'].forEach(k => {
        const el = _shadow.querySelector(`#jb-${k}`);
        if (el && _timerCache[k]) el.innerHTML = _timerCache[k];
      });
    }
    restartTimerIntervals();
    /* The 3s/4s/5s startup fetches that used to live here are GONE (2000.258).
     * A page lasts about 2.5-3s under automation, so the 4s and 5s ones mostly
     * died with it and the OC/DTM one was marginal. maybeBgFetch() below runs
     * from the main loop instead, ~1.5s into every page load — sooner than any
     * of them, and it can't be outrun by a navigation. */
  }

  /* === BACKGROUND FETCHES ARE DUE-TIME DRIVEN, NOT INTERVAL DRIVEN (2000.258) ===
   *
   * This is why "the travel, OC and DTM times take a long time to appear".
   *
   * Every schedule here used to be a timer created fresh on each page load and
   * destroyed by teardown on the next navigation:
   *
   *     setTimeout(collectTimers, 3000) · setTimeout(fetchTravel, 4000)
   *     setTimeout(fetchProt, 5000)     · setInterval(…, 60000)
   *
   * A page lives roughly 2.5-3 SECONDS while Jarvis is working — init schedules
   * the first loop tick at 1.5s, the loop acts, and it navigates. So the 4s and
   * 5s timeouts usually died with the page, the 3s one was marginal, and THE 60s
   * INTERVAL COULD NEVER FIRE AT ALL: nothing survives sixty seconds under
   * constant navigation. Travel and protection were effectively only fetched on
   * the odd occasion Jarvis happened to sit still for five seconds.
   *
   * The fix is the pattern the rest of this file already uses for anything that
   * has to outlive a page — the ready reminders, the forum refresh, the XP
   * report, the scrap backoff: keep the DUE TIME in storage and test it on a
   * tick. maybeBgFetch() is called from the main loop, which runs ~1.5s into
   * every page load, so the real gap between fetches is now the poll interval
   * you set rather than "whenever a page happens to sit still long enough".
   *
   * ONE FETCH PER TICK, in priority order. The loop ticks every ~2-3s, so the
   * three naturally stagger themselves — which is what the old 3/4/5s offsets
   * were reaching for, without depending on the page living that long.
   *
   * The due time is stamped BEFORE the fetch, so a failure or a mid-flight
   * navigation costs one cycle rather than retrying on every tick. Same
   * reasoning as doForumRefresh rescheduling before it fires.
   */
  const BG_DUE = { ocdtm: 'cbDueOcDtm', travel: 'cbDueTravel', prot: 'cbDueProt', hot: 'cbDueHot' };
  function bgDueAt(k) { return parseInt(GM_getValue(BG_DUE[k], 0) || 0, 10); }
  function bgSetDue(k, ms) { GM_setValue(BG_DUE[k], Date.now() + ms); }

  /* === POLL WHEN IT MATTERS, NOT ON A METRONOME (2000.260) ===
   *
   * The complaint that started this: travel checks the page too often. It does —
   * and the checks buy nothing, because these are COUNTDOWNS WE ALREADY HOLD.
   * getTravel/getOc/getDtm derive the remaining time locally from the stored
   * cooldown, so re-fetching during a 2h OC tells us what we could have worked
   * out for free. Only the fetch near zero carries information.
   *
   * So the next check is scheduled for just after the timer is due, the way the
   * reference script does it (scheduleNext('hotcity', remaining + 10)) rather
   * than every bgPollSec regardless.
   *
   * Capped at BG_QUIET_CAP so we still re-sync now and then — a cooldown can
   * change for reasons we didn't cause (you travel by hand, an OC completes),
   * and going silent for two hours would leave the panel confidently wrong.
   *
   * Never SHORTER than bgPollSec, so this can only ever reduce traffic.
   */
  const BG_QUIET_CAP = 10 * 60 * 1000;

  /* Protection is a countdown we ALREADY HOLD (LS_PROT_END), exactly like the
   * OC/DTM/travel timers — so re-reading it every two minutes told us what
   * getProt() computes for free, at 30 requests an hour. Same treatment as
   * bgGapFor: land just after it expires, capped so a change we did not cause
   * still gets noticed. The cap is longer than BG_QUIET_CAP because protection
   * moves by the DAY, and the 12h/6h warnings are checked locally against the
   * stored end time, not against a fetch. */
  const PROT_QUIET_CAP = 30 * 60 * 1000;

  function bgGapForProt(minMs) {
    try {
      if (localStorage.getItem(LS_PROT_ST) !== 'active') return Math.max(minMs, PROT_QUIET_CAP);
      const end = parseInt(localStorage.getItem(LS_PROT_END) || '0', 10);
      const rem = end - Date.now();
      if (rem > 0) return Math.min(PROT_QUIET_CAP, Math.max(minMs, rem + 5000 + Math.floor(Math.random() * 10000)));
    } catch (_) {}
    return minMs;
  }

  function bgGapFor(kind, pollMs) {
    let remMs = 0;
    try {
      if (kind === 'ocdtm') {
        const o = getOc(), d = getDtm();          // whichever comes ready first
        const a = (o && !o.ready) ? (o.total || 0) * 1000 : 0;
        const b = (d && !d.ready) ? (d.total || 0) * 1000 : 0;
        remMs = (a && b) ? Math.min(a, b) : (a || b);
      } else if (kind === 'travel') {
        const t = getTravel();
        remMs = (t && !t.ready) ? (t.remaining || 0) * 1000 : 0;
      }
    } catch(_) {}
    if (remMs <= 0) return pollMs;                // ready, or nothing stored yet
    // Land just after it comes ready. Jittered, so it isn't a predictable beat.
    return Math.min(BG_QUIET_CAP, Math.max(pollMs, remMs + 5000 + Math.floor(Math.random() * 10000)));
  }

  // Returns true if it fired something (the caller doesn't wait on it).
  function maybeBgFetch() {
    if (isHalted() || st.inJail || paused || st.acting) return false;
    const pollMs = Math.max(30, Math.min(900, Number(cfg.bgPollSec) || 60)) * 1000;
    const now = Date.now();
    if (now >= bgDueAt('ocdtm'))  { bgSetDue('ocdtm',  bgGapFor('ocdtm', pollMs));  collectTimers(); return true; }
    if (now >= bgDueAt('travel')) { bgSetDue('travel', bgGapFor('travel', pollMs)); fetchTravel();   return true; }
    /* The hot city. Re-read on a schedule rather than once a day, because a
     * stale one sends you flying to the wrong city — and until 2000.261 nothing
     * ever corrected it. Checked more eagerly while it is unknown. */
    if (now >= bgDueAt('hot'))    { bgSetDue('hot', getHot() ? HOT_REFRESH_MS : pollMs); fetchHotBg(); return true; }
    // Protection moves by the hour, not the minute — half the rate is plenty.
    if (now >= bgDueAt('prot'))   { bgSetDue('prot',   bgGapForProt(pollMs * 2));    fetchProt();     return true; }
    return false;
  }

  // Settings changed the poll rate — bring the next fetch forward rather than
  // leaving it parked behind the old, longer gap.
  function resetBgDue() { Object.keys(BG_DUE).forEach(k => GM_setValue(BG_DUE[k], 0)); }

  /* Rebuilt rather than created once, so the Performance settings apply live.
   * Each background fetch parses a whole document with DOMParser, so on a
   * low-RAM device stretching this is the single biggest lever available
   * without turning a feature off entirely.
   * The protection poll piggybacks at 2x the interval — it changes by the hour,
   * not the minute. It used to be a bare setInterval with no handle, so it could
   * never be cleared or retuned.
   */
  /* Clears only the FETCHING timers. The display timer is deliberately left
   * alone by haltAll — it is local work (panel repaint, Telegram pumps) and
   * stopping it would freeze the UI you need in order to un-halt. */
  function stopFetchTimers() {
    if (_timerFetchIv) { clearInterval(_timerFetchIv); _timerFetchIv = null; }
    if (_protIv)       { clearInterval(_protIv);       _protIv = null; }
  }

  function restartTimerIntervals() {
    if (_timerDispIv)  { clearInterval(_timerDispIv);  _timerDispIv = null; }
    if (_timerFetchIv) { clearInterval(_timerFetchIv); _timerFetchIv = null; }
    if (_protIv)       { clearInterval(_protIv);       _protIv = null; }

    const dispMs = Math.max(2, Math.min(60, Number(cfg.timerDispSec) || 5)) * 1000;
    const pollMs = Math.max(30, Math.min(900, Number(cfg.bgPollSec) || 60)) * 1000;

    _timerDispIv = setInterval(updateTimers, dispMs);
    /* Both fetch timers now just call maybeBgFetch, which owns the due times.
     * They are a BACKSTOP for a page that genuinely sits still — the main loop
     * is what actually drives this under navigation. Kept short (and equal) so
     * neither one can be the thing a fetch depends on: the old ones were, and
     * that is precisely why they never fired. */
    _timerFetchIv = setInterval(maybeBgFetch, Math.min(pollMs, 15000));
    _protIv = null;   // protection is scheduled by maybeBgFetch at 2× the poll
    dlog(APP_TAG, `[PERF] timers: display ${dispMs/1000}s, background ${pollMs/1000}s`);
  }


  /* === MAIL SYSTEM (OC/DTM INVITE ACCEPT) === */

  const LS_LAST_OC_MAIL  = 'cbLastOcMail';
  const LS_LAST_DTM_MAIL = 'cbLastDtmMail';
  const LS_LAST_OC_ACC   = 'cbLastOcAcc';
  const LS_LAST_DTM_ACC  = 'cbLastDtmAcc';

  /* Persistent invite dedup — once an OC/DTM invite mail has been acted on it
   * must never be re-read, even after the cooldown timer completes and the
   * single last-mail marker is cleared (which is exactly when stale invites
   * used to fire again). Keyed by mail id, pruned by age and capped. */
  const INVITE_HANDLED_TTL = 14 * 24 * 3600 * 1000; // 14 days
  function _handledKey(kind) { return kind === 'dtm' ? 'cbHandledDtm' : 'cbHandledOc'; }
  function _loadHandled(kind) { try { return JSON.parse(localStorage.getItem(_handledKey(kind)) || '{}') || {}; } catch(_) { return {}; } }
  function wasHandledInvite(kind, mailId) {
    if (!mailId) return false;
    return !!_loadHandled(kind)[String(mailId)];
  }
  function markHandledInvite(kind, mailId) {
    if (!mailId) return;
    const m = _loadHandled(kind), now = Date.now();
    m[String(mailId)] = now;
    for (const k in m) { if (now - m[k] > INVITE_HANDLED_TTL) delete m[k]; }
    const keys = Object.keys(m);
    if (keys.length > 200) keys.sort((a,b)=>m[a]-m[b]).slice(0, keys.length-200).forEach(k => delete m[k]);
    try { localStorage.setItem(_handledKey(kind), JSON.stringify(m)); } catch(_){}
  }
  const LS_PEND_DTM      = 'cbPendDtmUrl';
  const LS_PEND_OC       = 'cbPendOcUrl';
  /* Background inbox poll interval.
   *
   * There are two ways new mail gets noticed, and only one of them works when
   * Jarvis is idle:
   *
   *  1. checkNewMsgs() reads the on-page envelope indicator. That is rendered by
   *     the SERVER, so it only refreshes when a page actually loads. With jail
   *     enabled Jarvis navigates every few seconds, so this catches mail almost
   *     instantly and the poll below barely matters.
   *  2. checkMail() background-fetches the inbox on a timer. This is the only
   *     mechanism that works while the page sits still.
   *
   * Turn jail off and, in Away mode, the page can sit unchanged for minutes —
   * the AFK band alone runs 8-20 minutes — so route 1 goes silent entirely and
   * detection latency becomes exactly this interval. It was hardcoded at 60s
   * while tg.msgCheckInt was loaded, saved and never read; now the setting
   * actually drives it.
   */
  function mailIntervalMs() {
    const s = Number(tg.msgCheckInt);
    return Math.max(15, Math.min(300, Number.isFinite(s) && s > 0 ? s : 30)) * 1000;
  }
  const GM_TIMEOUT       = 20000;
  const INVITE_STALE     = 15*60*1000;
  const SCRIPT_TEST_STALE= 5*60*1000;

  /* === INVITE SUBJECT MATCHING (2000.241) ===
   * These two patterns were asymmetric, and OC was the loser. DTM accepted
   * "invitation" OR "invite"; OC demanded the literal word "invitation" AND the
   * American spelling, so a mail reading "OC invite" — or "Organised crime
   * invitation" — matched nothing and was silently skipped. That asymmetry fits
   * "DTM auto-accept works, OC doesn't" exactly.
   *
   * Both now accept either spelling, either noun, and the body phrasing the game
   * uses ("X has invited you to an organised crime"), in either word order.
   *
   * A loose pattern is the safe direction here: the worst a false match can do is
   * make Jarvis open one mail, find no accept link, and log it. A missed invite
   * costs a whole OC.
   */
  const INV_WORD = '(?:invit(?:ation|e|ed|es|ing))';
  const OC_SUBJ  = '(?:organi[sz]ed\\s*crime|\\boc\\b)';
  const DTM_SUBJ = '(?:\\bdtm\\b|drugs?\\s*transport\\w*|drug\\s*trade)';
  const OC_INVITE_RE  = new RegExp(`(?:${OC_SUBJ}[\\s\\S]{0,60}?${INV_WORD})|(?:${INV_WORD}[\\s\\S]{0,60}?${OC_SUBJ})`, 'i');
  const DTM_INVITE_RE = new RegExp(`(?:${DTM_SUBJ}[\\s\\S]{0,60}?${INV_WORD})|(?:${INV_WORD}[\\s\\S]{0,60}?${DTM_SUBJ})`, 'i');

  /* === COMPLETION NOTIFICATIONS (2000.247) ===
   * The game mails you when an OC or DTM finishes:
   *     "Organized Crime Notification"   /   "DTM notification"
   * (ids change every time, so match on the wording, not the link.)
   *
   * This is the missing timing signal. A payout arrives when the crime EXECUTES —
   * potentially hours after we snapshotted the commit — so it always landed in
   * the unattributed bucket and, with jail running, got labelled jail. The
   * notification tells us exactly WHEN, so the gain can be moved to where it
   * belongs, and the jail busts caught up in the same reading subtracted out at
   * the learned per-bust rate.
   *
   * Deliberately does NOT match the invitations: "notification" contains no
   * invite word, so OC_INVITE_RE / DTM_INVITE_RE can't fire on these, and these
   * can't fire on an invite.
   */
  const OC_DONE_RE  = /organi[sz]ed\s*crime\s*notification/i;
  const DTM_DONE_RE = /\bdtm\s*notification\b/i;

  /* === WITNESS MAIL ===
   * YOU witnessed somebody else's murder — not somebody witnessing you. The game
   * mails you when a kill happens in front of you, and the body names both
   * parties:  "You've witnessed [KILLER] kill [VICTIM]!"
   *
   * Alert-only. This is intelligence about two other PLAYERS, and what you do
   * with it — tell the victim, stay quiet, avoid the killer — is a judgement
   * call Jarvis has no business making automatically. Same line
   * EXCLUDED_CRIME_IDS draws: no automated action aimed at a real person.
   *
   * Both patterns are the reference script's, verified against its source rather
   * than guessed (an earlier draft guessed, and guessed the direction backwards).
   * The subject test is deliberately kept as loose as theirs — witness + murder
   * in either order — while the body extraction is exact.
   */

  /* === SHOT AT (2000.278) ===
   * Subject patterns taken from the reference script's own mail classifier, which
   * matches either wording. Kept loose for the same reason as the invite patterns:
   * a false match costs one wasted mail fetch, a missed one costs a retreat.
   *
   * The body is the useful part — it names the shooter, the ammunition and, most
   * importantly, whether you SURVIVED and how much health went. A shot that cost
   * no health needs no retreat. */
  const SHOT_RE = /you[\s\S]{0,20}?got\s+shot|shot\s+you/i;
  const SHOT_BODY_RE = /([A-Za-z0-9_\-]+)\s+has\s+just\s+shot\s+(\d+)\s+(.+?)\s+at\s+you\.\s*You\s+(survived|died)(?:\s+and\s+lost\s+(\d+)\s*%\s*health)?/i;
  const WITNESS_RE = /witness[\s\S]{0,40}?murder|murder[\s\S]{0,40}?witness/i;
  // Straight and curly apostrophe: the mail is matched after HTML→text, so the
  // entity has already decoded and either form can reach us.
  const WITNESS_BODY_RE = /You['’]ve\s+witnessed\s+(.+?)\s+kill\s+(.+?)\s*!/i;

  /* Retry budget per invite mail.
   *
   * markHandledInvite() used to be called BEFORE the accept was attempted, so a
   * single failure — link parse failed, network blip, page returned the login
   * form — burned that invite for 14 days with nothing to retry it. But dropping
   * the marker entirely would let a chatty mail that merely mentions "OC invite"
   * be re-fetched on every poll forever. So: allow a few goes, then give up and
   * mark it handled.
   */
  const INVITE_MAX_TRIES = 3;
  function _triesKey(kind) { return kind === 'dtm' ? 'cbTryDtm' : 'cbTryOc'; }
  function inviteTries(kind, mailId) {
    try { return (JSON.parse(localStorage.getItem(_triesKey(kind)) || '{}') || {})[String(mailId)] || 0; }
    catch(_) { return 0; }
  }
  function bumpInviteTries(kind, mailId) {
    let m = {};
    try { m = JSON.parse(localStorage.getItem(_triesKey(kind)) || '{}') || {}; } catch(_) {}
    const n = (m[String(mailId)] || 0) + 1;
    m[String(mailId)] = n;
    const keys = Object.keys(m);
    if (keys.length > 50) delete m[keys[0]];
    try { localStorage.setItem(_triesKey(kind), JSON.stringify(m)); } catch(_){}
    return n;
  }

  // Chokepoint for every mail read — inbox poll, bodies, accept links.
  function gmGet(url) {
    if (isHalted()) return Promise.reject(new Error('halted'));
    return new Promise((res, rej) => {
      GM_xmlhttpRequest({
        method:'GET', url, timeout:GM_TIMEOUT,
        headers:{'Cache-Control':'no-cache,no-store','Pragma':'no-cache'},
        onload: r => {
          const fin = r.finalUrl||url;
          if (r.status >= 200 && r.status < 300) res({html:r.responseText, finalUrl:fin, status:r.status});
          else rej(new Error(`HTTP ${r.status} for ${fin}`));
        },
        onerror: e => rej(e),
        ontimeout: () => rej(new Error(`Timeout ${url}`))
      });
    });
  }

  function isOlderThan(ts, ms) { return ts > 0 && ts < (Date.now()-ms); }

  function toAuthUrl(href) {
    const h = (href||'').trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (/^\/authenticated\//i.test(h)) return new URL(h, location.origin).href;
    if (/^\/?mailbox\.aspx/i.test(h)) return `${location.origin}/authenticated/${h.replace(/^\//,'')}`;
    return new URL(h, `${location.origin}/authenticated/`).href;
  }

  function parseMailId(href) { const m = String(href||'').match(/[?&]id=(\d+)/i); return m?m[1]:null; }

  function parseTmnDate(s) {
    const m = String(s).match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    return Date.UTC(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0));
  }

  /* Find the accept link inside an invite mail.
   *
   * Was a single strict test: the URL had to carry act=accept&ocid=N or
   * accept=1&id=N. Any other shape returned null, the invite was reported as
   * "no accept link found", and (before 241) that burned it for 14 days.
   *
   * Now tiered, strictest first, so a known-good shape still wins outright:
   *   1. the exact parameter shapes above
   *   2. a link whose visible text is "accept"
   *   3. an organizedcrime.aspx link carrying any accept-ish parameter
   * Anything found is logged with its tier, so a future mismatch is visible in
   * the console rather than silent.
   */
  async function getAcceptUrl(mailHref, type='oc') {
    const url = toAuthUrl(mailHref);
    const r = await gmGet(url);
    if (!/\/authenticated\/mailbox\.aspx/i.test(r.finalUrl)) {
      console.warn(APP_TAG, '[INVITE] mail fetch did not land on the mailbox:', r.finalUrl);
      return null;
    }
    const doc = new DOMParser().parseFromString(r.html, 'text/html');
    const links = [...doc.querySelectorAll('a[href*="organizedcrime.aspx"]')];
    if (!links.length) {
      console.warn(APP_TAG, `[INVITE] ${type.toUpperCase()}: mail has no organizedcrime.aspx link at all`);
      return null;
    }

    const paramsOf = a => {
      try { return new URL((a.getAttribute('href')||'').replace(/&amp;/g,'&'), location.origin).searchParams; }
      catch(_) { return null; }
    };

    // 1 — the documented shapes.
    let hit = links.find(a => {
      const u = paramsOf(a); if (!u) return false;
      if ((u.get('act')||'').toLowerCase() === 'accept' && /^\d+$/.test(u.get('ocid')||'')) return true;
      if (u.get('accept') === '1' && /^\d+$/.test(u.get('id')||'')) return true;
      return false;
    });
    let tier = 'params';

    // 2 — the link that literally says Accept. The strongest human signal, and
    // independent of whatever query string the game happens to use.
    if (!hit) {
      hit = links.find(a => /^\s*accept\b/i.test((a.textContent||'').trim()));
      tier = 'link text';
    }

    // 3 — anything accept-shaped at all.
    if (!hit) {
      hit = links.find(a => {
        const u = paramsOf(a); if (!u) return false;
        for (const [k, v] of u) if (/accept|join/i.test(k) || /accept|join/i.test(v)) return true;
        return false;
      });
      tier = 'loose param';
    }

    if (!hit) {
      console.warn(APP_TAG, `[INVITE] ${type.toUpperCase()}: none of the ${links.length} link(s) look like an accept —`,
                   links.map(a => `"${(a.textContent||'').trim().slice(0,20)}" ${a.getAttribute('href')}`));
      return null;
    }
    const out = toAuthUrl(hit.getAttribute('href'));
    dlog(APP_TAG, `[INVITE] ${type.toUpperCase()} accept link matched by ${tier}: ${out}`);
    return out;
  }

  async function extractInviter(mailHref) {
    try {
      const url = toAuthUrl(mailHref);
      const r = await gmGet(url);
      if (!/\/authenticated\/mailbox\.aspx/i.test(r.finalUrl)) return null;
      const doc = new DOMParser().parseFromString(r.html, 'text/html');
      const body = doc.body.textContent||'';
      const m = body.match(/(.+?)\s+has\s+invited\s+you/i);
      if (m) {
        let n = m[1].trim();
        const nl = n.lastIndexOf('\n');
        if (nl >= 0) n = n.substring(nl+1).trim();
        n = n.replace(/^.*?(invitation|invite)\s*/i,'').trim();
        if (n) return n;
      }
      const by = body.match(/invited\s+by\s+(.+?)[\s.!,]/i);
      if (by) return by[1].trim();
      const from = doc.querySelector('#ctl00_main_hlFromMember');
      if (from) { const n = (from.textContent||'').trim(); if (n && n.toLowerCase() !== (st.player||'').toLowerCase()) return n; }
      return null;
    } catch(_) { return null; }
  }

  // Dedup tracker
  const LS_ALERTED = 'cbAlertedMails';
  const ALERT_TTL  = 24*60*60*1000;

  function _loadAlerted() { try { const r = localStorage.getItem(LS_ALERTED); return r ? JSON.parse(r) : {}; } catch(_) { return {}; } }
  function _saveAlerted(o) {
    const now = Date.now(), c = {};
    for (const [k,v] of Object.entries(o)) if (typeof v === 'number' && (now-v) < ALERT_TTL) c[k] = v;
    try { localStorage.setItem(LS_ALERTED, JSON.stringify(c)); } catch(_){}
  }
  function wasAlerted(kind, id) { if (!id) return false; const o = _loadAlerted(); const t = o[`${kind}:${id}`]; return typeof t === 'number' && (Date.now()-t) < ALERT_TTL; }
  function markAlerted(kind, id) { if (!id) return; const o = _loadAlerted(); o[`${kind}:${id}`] = Date.now(); _saveAlerted(o); }

  let _mailBusy = false;

  async function checkMail() {
    if (isHalted()) return;
    if (_mailBusy) return;
    _mailBusy = true;
    try {
      if (!tabs.isMaster) return;
      if (!st.autoOC && !st.autoDTM && !(tg.enabled && (tg.messages || tg.scriptTest || tg.staffMail))) return;

      const inboxUrl = `${location.origin}/authenticated/mailbox.aspx?p=m`;
      const res = await gmGet(inboxUrl);
      if (!/\/authenticated\/mailbox\.aspx/i.test(res.finalUrl)) return;
      const doc = new DOMParser().parseFromString(res.html, 'text/html');
      const grid = doc.querySelector('#ctl00_main_gridMail');
      if (!grid) return;
      const rows = [...grid.querySelectorAll('tr')].slice(1);

      for (const r of rows) {
        const link = [...r.querySelectorAll('a[href*="mailbox.aspx"]')].find(a => /[?&]id=\d+/i.test(a.getAttribute('href')||''));
        if (!link) continue;
        const href = link.getAttribute('href')||'';
        const mailId = parseMailId(href);
        if (!mailId) continue;

        const cells = r.querySelectorAll('td');
        const rowTxt = (r.textContent||'').trim();
        let sender = 'Unknown', subject = 'No subject';

        // Check if this is from staff via profile link ID
        const isFromStaff = isStaffRow(r);

        // Extract sender
        const profLink = r.querySelector('a[href*="profile.aspx"]');
        if (profLink) sender = (profLink.textContent||'').trim();
        if (sender === 'Unknown' && cells.length >= 2) {
          for (let i = 0; i < Math.min(cells.length, 3); i++) {
            const ct = (cells[i].textContent||'').trim();
            if (ct && !/^\d{2}-\d{2}-\d{4}/.test(ct) && ct.length > 1 && ct.length < 30 && cells[i].querySelector('a')) {
              sender = (cells[i].querySelector('a').textContent||'').trim();
              break;
            }
          }
        }
        if (sender === 'Unknown' && cells.length >= 1) {
          const fc = (cells[0].textContent||'').trim();
          if (fc && fc !== 'Unknown') sender = fc;
        }

        // Extract subject
        for (let i = 0; i < cells.length; i++) {
          const cl = cells[i].querySelector('a[href*="mailbox.aspx"]');
          if (cl) { subject = (cl.textContent||cells[i].textContent||'').trim()||subject; break; }
        }

        /* OC/DTM completion notification — the signal that a payout has landed.
         * Recorded, then deliberately FALLS THROUGH: it's a real game message and
         * should still reach the normal new-mail alert if that's switched on.
         *
         * Guarded by a highest-id watermark rather than a timestamp, because
         * parseTmnDate reads the game's Amsterdam clock as UTC and is an hour or
         * two out. On the first ever poll it just records the watermark, so a
         * mailbox full of old notifications can't retro-label today's history. */
        const doneKind = OC_DONE_RE.test(rowTxt) ? 'oc'
                       : DTM_DONE_RE.test(rowTxt) ? 'dtm' : null;
        if (doneKind) {
          const seen = GM_getValue('cbLastPayoutMailId', null);
          const nId = parseInt(mailId, 10) || 0;
          if (seen === null) {
            let maxId = 0;
            for (const row of rows) {
              const rl = [...row.querySelectorAll('a[href*="mailbox.aspx"]')].find(a => /[?&]id=\d+/i.test(a.getAttribute('href')||''));
              if (rl) { const rid = parseInt(parseMailId(rl.getAttribute('href')||''),10)||0; if (rid > maxId) maxId = rid; }
            }
            GM_setValue('cbLastPayoutMailId', maxId);
            console.log(`${APP_TAG}[XP] Completion-notification watermark set at mail ${maxId}`);
          } else if (nId > Number(seen || 0)) {
            GM_setValue('cbLastPayoutMailId', nId);
            console.log(`${APP_TAG}[XP] ${doneKind.toUpperCase()} completion notification (mail ${mailId})`);
            try { notePayout(doneKind); } catch(e) { console.warn(APP_TAG, '[XP] payout note failed', e); }
          }
        }

        /* Witness mail — alert only, never acted on. Same highest-id watermark as
         * the completion notifications above and for the same reason: on a first
         * poll a mailbox full of old witness mail must not fire a burst of stale
         * alerts. Falls through, so it still reaches the normal new-mail alert.
         *
         * The full subject is logged on every match because WITNESS_RE was written
         * without a confirmed example — read a real one off the console and tighten
         * the pattern from that. */
        if (WITNESS_RE.test(rowTxt)) {
          const seenW = GM_getValue('cbLastWitnessMailId', null);
          const nId = parseInt(mailId, 10) || 0;
          if (seenW === null) {
            let maxId = 0;
            for (const row of rows) {
              const rl = [...row.querySelectorAll('a[href*="mailbox.aspx"]')].find(a => /[?&]id=\d+/i.test(a.getAttribute('href')||''));
              if (rl) { const rid = parseInt(parseMailId(rl.getAttribute('href')||''),10)||0; if (rid > maxId) maxId = rid; }
            }
            GM_setValue('cbLastWitnessMailId', maxId);
            console.log(`${APP_TAG}[WITNESS] Watermark set at mail ${maxId} — alerts start from the next one`);
          } else if (nId > Number(seenW || 0)) {
            GM_setValue('cbLastWitnessMailId', nId);
            let wBody = '';
            try { wBody = await fetchMailBody(href) || ''; } catch(_){}
            const wm = wBody.match(WITNESS_BODY_RE);
            if (wm) {
              const killer = wm[1].trim(), victim = wm[2].trim();
              console.log(`${APP_TAG}[WITNESS] ${killer} killed ${victim} (mail ${mailId})`);
              tgMsg('witness', `👁️ <b>WITNESSED A MURDER</b>\n${st.player||'?'} | ${fmtDate()}\n<b>${esc(killer)}</b> killed <b>${esc(victim)}</b>`);
              try { discordWitness(mailId, killer, victim); } catch(e) { console.warn(APP_TAG, '[DC] witness', e); }
            } else {
              /* Body didn't parse. Still alert — knowing a murder happened in
               * front of you matters even without the names — and log the body so
               * the pattern can be corrected if the game rewords it. */
              console.warn(`${APP_TAG}[WITNESS] mail ${mailId} matched the subject but not the body — subject: "${subject}" | body: ${wBody.substring(0,200)}`);
              const preview = wBody ? `\n<pre>${esc(wBody.substring(0,300))}</pre>` : '';
              tgMsg('witness', `👁️ <b>WITNESSED A MURDER</b>\n${st.player||'?'} | ${fmtDate()}\n${esc(subject)}${preview}`);
            }
          }
        }

        /* === SHOT AT (2000.278) ===
         * Highest-id watermark, same as the witness and payout notifications and
         * for the same reason: a first poll over an old mailbox must not fire a
         * burst of stale alerts - and here it would be worse than noise, because
         * it would retreat to the HQ and spend credits over a shot from last week.
         * Falls through, so the mail still reaches the normal new-mail alert. */
        if (cfg.shotAlertOn && SHOT_RE.test(rowTxt)) {
          const seenS = GM_getValue('cbLastShotMailId', null);
          const nId = parseInt(mailId, 10) || 0;
          if (seenS === null) {
            let maxId = 0;
            for (const row of rows) {
              const rl = [...row.querySelectorAll('a[href*="mailbox.aspx"]')].find(a => /[?&]id=\d+/i.test(a.getAttribute('href')||''));
              if (rl) { const rid = parseInt(parseMailId(rl.getAttribute('href')||''),10)||0; if (rid > maxId) maxId = rid; }
            }
            GM_setValue('cbLastShotMailId', maxId);
            console.log(`${APP_TAG}[SHOT] Watermark set at mail ${maxId} — alerts start from the next one`);
          } else if (nId > Number(seenS || 0)) {
            GM_setValue('cbLastShotMailId', nId);
            let sBody = '';
            try { sBody = await fetchMailBody(href) || ''; } catch(_){}
            const sm = sBody.match(SHOT_BODY_RE);
            if (sm) {
              const info = {
                shooter:    sm[1].trim(),
                rounds:     sm[2],
                ammo:       sm[3].trim(),
                survived:   /survived/i.test(sm[4]),
                healthLost: parseInt(sm[5] || '0', 10) || 0
              };
              console.log(`${APP_TAG}[SHOT] ${info.shooter} fired ${info.rounds} ${info.ammo} — ` +
                          `${info.survived ? 'survived' : 'DIED'}, -${info.healthLost}% (mail ${mailId})`);
              tgMsg('shot', `💥 <b>SHOT AT</b>\n${st.player||'?'} | ${fmtDate()}\n` +
                `<b>${esc(info.shooter)}</b> fired ${esc(info.rounds)} ${esc(info.ammo)}\n` +
                `${info.survived ? 'Survived' : '<b>DIED</b>'} — lost ${info.healthLost}% health`);
              try { discordShot(mailId, info); } catch(e) { console.warn(APP_TAG, '[DC] shot', e); }

              /* Respond only when it actually cost health. A shot that missed
               * needs no response, and spending credits on one would be a fine
               * way to be drained by somebody firing blanks at you. */
              if (info.healthLost > 0) {
                try { await doShotRetreat(info); } catch(e) { console.warn(APP_TAG, '[SHOT] retreat', e); }
              } else {
                console.log(`${APP_TAG}[SHOT] no health lost — no retreat`);
              }
            } else {
              /* Body didn't parse. Still alert — being shot matters even without
               * the details — but deliberately do NOT retreat: the whole decision
               * rests on how much health went, and acting on an unknown would
               * spend credits on a guess. Log it so the pattern can be corrected. */
              console.warn(`${APP_TAG}[SHOT] mail ${mailId} matched the subject but not the body — subject: "${subject}" | body: ${sBody.substring(0,200)}`);
              const preview = sBody ? `\n<pre>${esc(sBody.substring(0,300))}</pre>` : '';
              tgMsg('shot', `💥 <b>SHOT AT</b>\n${st.player||'?'} | ${fmtDate()}\n${esc(subject)}${preview}\n<i>Details unreadable — no automatic response</i>`);
            }
          }
        }

        /* Invite handling. Both kinds run the identical gate sequence, so it lives
         * in one place — the OC and DTM versions had drifted apart, which is how
         * OC ended up with a stricter subject rule than DTM (see the patterns
         * above). Every skip is logged with its reason: this path used to fail
         * completely silently, which made "auto-accept isn't working" impossible
         * to diagnose without guessing. */
        const inviteKind = OC_INVITE_RE.test(rowTxt) ? 'oc'
                         : DTM_INVITE_RE.test(rowTxt) ? 'dtm' : null;
        if (inviteKind) {
          const K = inviteKind.toUpperCase();
          const on      = inviteKind === 'dtm' ? st.autoDTM : st.autoOC;
          const ACC_KEY = inviteKind === 'dtm' ? LS_LAST_DTM_ACC : LS_LAST_OC_ACC;
          const MAIL_KEY= inviteKind === 'dtm' ? LS_LAST_DTM_MAIL : LS_LAST_OC_MAIL;
          const PEND_KEY= inviteKind === 'dtm' ? LS_PEND_DTM : LS_PEND_OC;
          const HANDLING= inviteKind === 'dtm' ? 'cbPendDtmHandle' : 'cbPendOcHandle';
          const skip = why => console.log(`${APP_TAG}[INVITE] ${K} mail ${mailId} skipped — ${why}`);

          if (!on) { localStorage.setItem(MAIL_KEY, mailId); skip(`auto-${inviteKind} is OFF`); continue; }
          if (wasHandledInvite(inviteKind, mailId)) { dlog(APP_TAG, `[INVITE] ${K} ${mailId} already handled`); continue; }

          const lastAcc = parseInt(localStorage.getItem(ACC_KEY)||'0',10);
          if (lastAcc > 0 && (Date.now()-lastAcc) < 7200000) {
            localStorage.setItem(MAIL_KEY, mailId);
            skip(`${K} cooldown active (${Math.round((Date.now()-lastAcc)/60000)}m of 120m since the last one)`);
            continue;
          }
          if (localStorage.getItem(HANDLING) === 'true' || localStorage.getItem(PEND_KEY)) {
            localStorage.setItem(MAIL_KEY, mailId);
            skip('another invite of this kind is mid-accept');
            continue;
          }
          if (localStorage.getItem(MAIL_KEY) === mailId) { dlog(APP_TAG, `[INVITE] ${K} ${mailId} is the last-seen id`); continue; }

          const ts = parseTmnDate(rowTxt);
          if (isOlderThan(ts, INVITE_STALE)) {
            localStorage.setItem(MAIL_KEY, mailId);
            skip(`older than ${INVITE_STALE/60000}m`);
            continue;
          }
          if (ts === 0 && localStorage.getItem(MAIL_KEY) && parseInt(mailId) <= parseInt(localStorage.getItem(MAIL_KEY))) {
            skip('no timestamp and id not newer than the last seen');
            continue;
          }

          /* Only give up permanently after a few real attempts — see
           * INVITE_MAX_TRIES. Marking it handled up-front is what turned a single
           * transient failure into a 14-day blackout for that invite. */
          const tries = bumpInviteTries(inviteKind, mailId);
          console.log(`${APP_TAG}[INVITE] ${K} mail ${mailId} from ${sender} — accepting (try ${tries}/${INVITE_MAX_TRIES})`);
          const ok = inviteKind === 'dtm'
            ? await handleDtmInvite(mailId, href)
            : await handleOcInvite(mailId, href);
          if (ok || tries >= INVITE_MAX_TRIES) {
            markHandledInvite(inviteKind, mailId);
            if (!ok) console.warn(`${APP_TAG}[INVITE] ${K} ${mailId} failed ${tries}× — giving up on it`);
          }
          continue;
        }

        // Script test inbox alert (by title OR staff profile ID)
        if (tg.enabled && tg.scriptTest && (isScriptTestSubject(subject, rowTxt) || isFromStaff)) {
          const lastSt = GM_getValue('cbLastScriptTestId', 0);
          const nId = parseInt(mailId,10)||0;
          if (nId > Number(lastSt||0)) {
            GM_setValue('cbLastScriptTestId', nId);
            const ts = parseTmnDate(rowTxt);
            if (!isOlderThan(ts, SCRIPT_TEST_STALE)) {
              sendScriptTestAlert(mailId, sender, subject);
              continue;
            }
          }
        }

        // Staff mail alert (SQL/Stipe/Marc by name OR profile ID)
        if (tg.enabled && tg.staffMail) {
          const lastStaff = GM_getValue('cbLastStaffMailId', null);
          const nId = parseInt(mailId,10)||0;
          if (lastStaff === null) {
            let maxId = 0;
            for (const row of rows) {
              const rl = [...row.querySelectorAll('a[href*="mailbox.aspx"]')].find(a => /[?&]id=\d+/i.test(a.getAttribute('href')||''));
              if (rl) { const rid = parseInt(parseMailId(rl.getAttribute('href')||''),10)||0; if (rid > maxId) maxId = rid; }
            }
            GM_setValue('cbLastStaffMailId', maxId);
          } else if (nId > Number(lastStaff||0)) {
            const ts = parseTmnDate(rowTxt);
            if (isOlderThan(ts, INVITE_STALE)) {
              GM_setValue('cbLastStaffMailId', nId);
            } else if (isFromStaff || isSqlStipeSender(sender) || hasStaffSignal(sender, subject, rowTxt)) {
              GM_setValue('cbLastStaffMailId', nId);
              let body = '';
              try { body = await fetchMailBody(href)||''; } catch(_){}
              if (isFromStaff || isSqlStipeSender(sender) || hasStaffSignal(sender, subject, rowTxt, body)) {
                sendStaffAlert(mailId, sender, subject, body);
                continue;
              }
            }
          }
        }

        // Regular mail notification
        if (tg.enabled && tg.messages) {
          const lastNot = GM_getValue('cbLastNotifiedId', null);
          if (lastNot === null) {
            let maxId = 0;
            for (const row of rows) {
              const rl = [...row.querySelectorAll('a[href*="mailbox.aspx"]')].find(a => /[?&]id=\d+/i.test(a.getAttribute('href')||''));
              if (rl) { const rid = parseInt(parseMailId(rl.getAttribute('href')||''),10)||0; if (rid > maxId) maxId = rid; }
            }
            GM_setValue('cbLastNotifiedId', maxId);
            break;
          }
          const nId = parseInt(mailId);
          if (nId > lastNot) {
            GM_setValue('cbLastNotifiedId', nId);
            const ts = parseTmnDate(rowTxt);
            if (isOlderThan(ts, 5*60*1000)) continue;
            try {
              const body = await fetchMailBody(href);
              const preview = body ? `\n<pre>${esc(body.substring(0,300))}</pre>` : '';
              tgMsg('newmail', `📬 <b>New Mail</b>\n${st.player||'?'} | From: ${esc(sender)}\n${esc(subject)}${preview}`);
            } catch(_) {
              tgMsg('newmail', `📬 <b>New Mail</b>\n${st.player||'?'} | From: ${esc(sender)}\n${esc(subject)}`);
            }
          }
        }
      }
    } catch(e) { console.warn(APP_TAG, 'Mail check err:', e); }
    finally { _mailBusy = false; }
  }

  /* === ALLIED / SAFE INVITE GATE ===
   * Only accept OC/DTM invites from people on your Starvinggeeks allied and/or
   * safe lists. Stacks with the existing whitelist and blacklist — every gate has
   * to pass, and this is an ALLOW-list, so the safe direction on any doubt is to
   * refuse.
   *
   * Two failure modes worth naming, because both are silent otherwise:
   *   - The lists come from the SG fetch, which only runs when SG lists are on.
   *     Enabling either gate therefore switches SG on and forces a fetch (see the
   *     settings handler) — without that you'd be gating against an empty list and
   *     refusing everything for no visible reason.
   *   - An EMPTY list still refuses, because "allied only" with no allied names
   *     means nobody qualifies. That is correct allow-list behaviour, but it looks
   *     identical to a bug, so it logs loudly and says which list was empty.
   *
   * `extractInviter` returning null also refuses, exactly as an unknown name
   * would — same safe direction as the existing whitelist, same caveat.
   */
  function inviteListGate(kind, inviter) {
    if (!cfg.inviteAlliedOnly && !cfg.inviteSafeOnly) return { ok: true };
    const K = kind.toUpperCase();
    const who = String(inviter || '').trim().toLowerCase();
    if (!who) return { ok: false, why: 'the inviter could not be read from the mail' };

    const allied = cfg.inviteAlliedOnly ? (sgAllied || []) : [];
    const safe   = cfg.inviteSafeOnly   ? (sgSafe   || []) : [];
    if (cfg.inviteAlliedOnly && !allied.length)
      console.warn(`${APP_TAG}[INVITE] ${K}: "allied only" is on but the allied list is EMPTY — are the SG lists switched on and fetching?`);
    if (cfg.inviteSafeOnly && !safe.length)
      console.warn(`${APP_TAG}[INVITE] ${K}: "safe only" is on but the safe list is EMPTY — are the SG lists switched on and fetching?`);

    if (allied.includes(who)) return { ok: true, via: 'allied' };
    if (safe.includes(who))   return { ok: true, via: 'safe' };

    const on = [cfg.inviteAlliedOnly && 'allied', cfg.inviteSafeOnly && 'safe'].filter(Boolean).join('/');
    return { ok: false, why: `not on your ${on} list` };
  }

  /* Both return TRUE for a settled outcome — accepted, or deliberately refused by
   * a list — and FALSE for a failure worth retrying (no accept link, exception).
   * The caller only burns the invite permanently on true, or after
   * INVITE_MAX_TRIES falses. */
  async function handleDtmInvite(mailId, href) {
    try {
      localStorage.setItem(LS_LAST_DTM_MAIL, mailId);
      if (!wasAlerted('DTM', mailId)) {
        markAlerted('DTM', mailId);
        tgMsg('dtmInvite', `📬 <b>DTM Invite</b>\n${st.player||'?'} | ${fmtDate()}\n${st.inJail ? '⛓ In jail' : '🚚 Accepting...'}`);
      }
      const url = await getAcceptUrl(href, 'dtm');
      const inv = await extractInviter(href);
      if (st.blNames && st.blNames.length && inv && st.blNames.some(n => n && n.toLowerCase().trim() === inv.toLowerCase().trim())) {
        console.log(`${APP_TAG}[INVITE] DTM blocked — ${inv} is blacklisted`);
        tgMsg('blocked', `🚫 <b>DTM Blocked</b>\n${st.player||'?'} | ${inv} blacklisted`);
        return true;                      // a decision, not a failure
      }
      if (st.whitelist && st.wlNames.length > 0) {
        const ok = inv && st.wlNames.some(n => n && n.toLowerCase().trim() === inv.toLowerCase().trim());
        if (!ok) {
          console.log(`${APP_TAG}[INVITE] DTM blocked — inviter "${inv||'(unreadable)'}" not on the whitelist`);
          tgMsg('blocked', `🚫 <b>DTM Blocked</b>\n${st.player||'?'} | ${inv||'Unknown'} not whitelisted`);
          return true;
        }
      }
      { const g = inviteListGate('dtm', inv);
        if (!g.ok) {
          console.log(`${APP_TAG}[INVITE] DTM blocked — "${inv||'(unreadable)'}" ${g.why}`);
          tgMsg('blocked', `🚫 <b>DTM Blocked</b>\n${st.player||'?'} | ${esc(inv||'Unknown')} ${esc(g.why)}`);
          return true;
        }
        if (g.via) dlog(APP_TAG, `[INVITE] DTM allowed — ${inv} is on the ${g.via} list`);
      }
      if (!url) {
        console.warn(`${APP_TAG}[INVITE] DTM ${mailId}: no accept link in the mail body`);
        tgMsg('dtmInvite', `⚠️ <b>DTM</b> — no accept link found`);
        return false;                     // retryable
      }
      localStorage.setItem(LS_PEND_DTM, url);
      console.log(`${APP_TAG}[INVITE] DTM accept queued: ${url}`);
      return true;
    } catch(e) { console.warn(APP_TAG, '[INVITE] DTM err:', e); return false; }
  }

  async function handleOcInvite(mailId, href) {
    try {
      localStorage.setItem(LS_LAST_OC_MAIL, mailId);
      const url = await getAcceptUrl(href, 'oc');
      const inv = await extractInviter(href);
      if (st.blNames && st.blNames.length && inv && st.blNames.some(n => n && n.toLowerCase().trim() === inv.toLowerCase().trim())) {
        console.log(`${APP_TAG}[INVITE] OC blocked — ${inv} is blacklisted`);
        tgMsg('blocked', `🚫 <b>OC Blocked</b>\n${st.player||'?'} | ${inv} blacklisted`);
        return true;
      }
      if (st.whitelist && st.wlNames.length > 0) {
        const ok = inv && st.wlNames.some(n => n && n.toLowerCase().trim() === inv.toLowerCase().trim());
        if (!ok) {
          /* Note the failure mode worth knowing: extractInviter returning null
           * also lands here, so an unparseable sender blocks the invite exactly
           * as a stranger would. That is the safe direction for a whitelist, but
           * it is why this logs the raw value. */
          console.log(`${APP_TAG}[INVITE] OC blocked — inviter "${inv||'(unreadable)'}" not on the whitelist`);
          tgMsg('blocked', `🚫 <b>OC Blocked</b>\n${st.player||'?'} | ${inv||'Unknown'} not whitelisted`);
          return true;
        }
      }
      { const g = inviteListGate('oc', inv);
        if (!g.ok) {
          console.log(`${APP_TAG}[INVITE] OC blocked — "${inv||'(unreadable)'}" ${g.why}`);
          tgMsg('blocked', `🚫 <b>OC Blocked</b>\n${st.player||'?'} | ${esc(inv||'Unknown')} ${esc(g.why)}`);
          return true;
        }
        if (g.via) dlog(APP_TAG, `[INVITE] OC allowed — ${inv} is on the ${g.via} list`);
      }
      if (!wasAlerted('OC', mailId)) {
        markAlerted('OC', mailId);
        let role = '';
        if (url) try { const u = new URL(url); const p = u.searchParams.get('pos'); if(p) role = ` (${p})`; } catch(_){}
        tgMsg('ocInvite', `📬 <b>OC Invite</b>${role}\n${st.player||'?'} | ${fmtDate()}\n${st.inJail ? '⛓ In jail' : '🕵️ Accepting...'}`);
      }
      if (!url) {
        console.warn(`${APP_TAG}[INVITE] OC ${mailId}: no accept link in the mail body`);
        tgMsg('ocInvite', `⚠️ <b>OC</b> — no accept link found`);
        return false;                     // retryable
      }
      localStorage.setItem(LS_PEND_OC, url);
      console.log(`${APP_TAG}[INVITE] OC accept queued: ${url}`);
      return true;
    } catch(e) { console.warn(APP_TAG, '[INVITE] OC err:', e); return false; }
  }

  async function fetchMailBody(href) {
    try {
      const url = toAuthUrl(href);
      const r = await gmGet(url);
      if (!/\/authenticated\/mailbox\.aspx/i.test(r.finalUrl)) return null;
      const doc = new DOMParser().parseFromString(r.html, 'text/html');
      let div = null;
      const panel = doc.querySelector('#ctl00_main_pnlMailRead');
      if (panel) div = panel.querySelector('.GridRow div[style*="padding"]') || panel.querySelector('.GridRow');
      if (!div) div = doc.querySelector('#ctl00_main_lblBody') || doc.querySelector('#ctl00_main_lblMessage');
      if (!div) div = doc.querySelector('div[style*="padding: 5px"],div[style*="padding:5px"]');
      if (!div) return null;
      let html = div.innerHTML||'';
      html = html.replace(/<br\s*\/?>/gi,'\n').replace(/<img[^>]*>/gi,'');
      const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      return (parsed.body.textContent||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()||null;
    } catch(_) { return null; }
  }


  /* === OC/DTM PAGE HANDLERS === */

  function handleOcPage() {
    if (localStorage.getItem('cbPendOcHandle') !== 'true') return false;
    const pts = parseInt(localStorage.getItem('cbPendOcHandleTs')||'0',10);
    if (pts > 0 && Date.now()-pts > 120000) {
      localStorage.removeItem('cbPendOcHandle'); localStorage.removeItem('cbPendOcHandleTs');
      st.acting = false; return false;
    }
    if (!window.location.pathname.toLowerCase().includes('organizedcrime.aspx')) {
      const retry = localStorage.getItem(LS_PEND_OC);
      if (retry) { localStorage.removeItem(LS_PEND_OC); try { const u = new URL(retry); window.location.href = u.pathname+u.search; } catch(_) { window.location.href = retry.replace(/^https?:\/\/[^/]+/,''); } return true; }
      return false;
    }
    st.acting = true; st.action = 'oc'; GM_setValue('cbActStart', Date.now());

    const acceptLink = [...document.querySelectorAll('a')].find(a => (a.textContent||'').trim().toLowerCase() === 'accept' && (a.getAttribute('href')||'').toLowerCase().includes('organizedcrime.aspx'));
    if (acceptLink) { setTimeout(() => acceptLink.click(), rndDelay(DLY.quick)); return true; }

    const selIds = ['ctl00_main_explosiveslist','ctl00_main_weaponslist','ctl00_main_carslist','ctl00_main_vehicleslist','ctl00_main_weaponlist','ctl00_main_carlist'];
    for (const sid of selIds) { const sel = document.getElementById(sid); if (sel && sel.tagName === 'SELECT' && sel.options.length > 0) { if (sel.selectedIndex < 0) sel.selectedIndex = 0; try { sel.dispatchEvent(new Event('change',{bubbles:true})); } catch(_){} } }

    const btnIds = ['ctl00_main_btnchooseexplosive','ctl00_main_btnChooseWeapon','ctl00_main_btnchooseweapons','ctl00_main_btnchooseweapon','ctl00_main_btnchoosecar','ctl00_main_btnchoosevehicle','ctl00_main_btnchoosevehicles','ctl00_main_btnchoose','ctl00_main_btnselect'];
    for (const id of btnIds) {
      const btn = document.getElementById(id);
      if (btn && !btn.disabled) {
        setTimeout(() => { snapshotXP('oc'); btn.click(); localStorage.removeItem('cbPendOcHandle'); st.acting = false; setStatus('✅ OC role selected');
          tgMsg('ocCreate', `🕵️ <b>OC Role Set</b>\n${st.player||'?'}`); }, 2000);
        return true;
      }
    }

    const fb = [...document.querySelectorAll("input[type='submit'],button")].find(el => { if (el.disabled) return false; const v = ((el.value||el.textContent||'')+'').trim().toLowerCase(); return v.includes('choose') || v.includes('select'); });
    if (fb) { setTimeout(() => { fb.click(); localStorage.removeItem('cbPendOcHandle'); st.acting = false; }, 2000); return true; }

    const bt = (document.body.textContent||'').toLowerCase();
    if (/you cannot do an organized crime|you have to wait/.test(bt)) { localStorage.removeItem('cbPendOcHandle'); localStorage.removeItem('cbPendOcHandleTs'); localStorage.setItem(LS_LAST_OC_ACC, String(Date.now())); st.acting = false; return true; }
    if (/invalid request|invalid invite|expired|no longer/i.test(bt)) { localStorage.removeItem('cbPendOcHandle'); localStorage.removeItem('cbPendOcHandleTs'); localStorage.removeItem(LS_PEND_OC); localStorage.removeItem(LS_LAST_OC_MAIL); st.acting = false; tgMsg('invalid', `❌ <b>OC Invalid</b>\n${st.player||'?'}`); return true; }
    return true;
  }

  function handleDtmPage() {
    if (localStorage.getItem('cbPendDtmHandle') !== 'true') return false;

    // Guard: if we just acted (clicked buy/complete) in the last 30s, the page we're
    // now seeing is the postback result — don't re-process or re-alert.
    const guard = parseInt(localStorage.getItem('cbDtmJustActed')||'0',10);
    if (guard > 0 && Date.now()-guard < 30000) {
      clearDtmHandle(); st.acting = false; st.action = ''; GM_setValue('cbActStart',0);
      return false;
    }

    const pts = parseInt(localStorage.getItem('cbPendDtmHandleTs')||'0',10);
    if (pts > 0 && Date.now()-pts > 120000) { clearDtmHandle(); st.acting = false; return false; }
    if (!window.location.pathname.toLowerCase().includes('organizedcrime.aspx')) {
      const retry = localStorage.getItem(LS_PEND_DTM);
      if (retry) { localStorage.removeItem(LS_PEND_DTM); try { const u = new URL(retry); window.location.href = u.pathname+u.search; } catch(_) { window.location.href = retry.replace(/^https?:\/\/[^/]+/,''); } return true; }
      return false;
    }

    // Block other actions while on the DTM page
    st.acting = true; st.action = 'dtm'; GM_setValue('cbActStart', Date.now());

    // On cooldown? (normal — the 2h timer already tracks this) Just clear the flag and walk away.
    const bt = (document.body.textContent||'').toLowerCase();
    if (/you cannot do a dtm|you have to wait/.test(bt)) {
      clearDtmHandle(); st.acting = false; st.action = ''; GM_setValue('cbActStart',0);
      return false;
    }
    if (/invalid request|invalid invite|expired|no longer/i.test(bt)) {
      clearDtmHandle(); localStorage.removeItem(LS_PEND_DTM); localStorage.removeItem(LS_LAST_DTM_MAIL);
      st.acting = false; tgMsg('invalid', `❌ <b>DTM Invalid</b>\n${st.player||'?'}`); return true;
    }

    // Complete DTM button present?
    const compBtn = document.getElementById('ctl00_main_btnCompleteDTM') || [...document.querySelectorAll('input[type="submit"],button')].find(b => /complete\s*dtm/i.test((b.value||b.textContent||'').trim()));
    if (compBtn && !compBtn.disabled) {
      // Clear flag + set guard + store cooldown SYNCHRONOUSLY before the click triggers postback
      clearDtmHandle();
      localStorage.setItem('cbDtmJustActed', String(Date.now()));
      localStorage.setItem(LS_LAST_DTM_ACC, String(Date.now()));
      storeDtm({ready:false,total:7200,h:2,m:0,s:0,at:Date.now()});
      tgMsg('dtmBuy', `🚚 <b>DTM Done</b>\n${st.player||'?'} | 2h cooldown`);
      // Persistent lock survives the postback reload; checkStuck respects it
      localStorage.setItem('cbActionLockUntil', String(Date.now() + 8000));
      snapshotXP('dtm');
      setTimeout(() => { compBtn.click(); }, 1500);
      return true;
    }

    // Find max amount + buy form
    const pageTxt = document.body.textContent||'';
    let maxAmt = 0;
    for (const pat of [/maximum amount you can carry is (\d+)/i, /maximum amount you can buy is (\d+)/i, /maximum amount.*?is (\d+)/i, /can buy.*?(\d+)\s*units/i, /max(?:imum)?[:\s]+(\d+)/i, /you can (?:carry|buy)\D*(\d+)/i]) {
      const m = pageTxt.match(pat); if (m) { maxAmt = parseInt(m[1],10); break; }
    }
    if (!maxAmt && st.player) {
      const pm = pageTxt.match(new RegExp(st.player.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\([^)]*?-\\s*(\\d+)\\s*units?\\)','i'));
      if (pm) maxAmt = parseInt(pm[1],10);
    }

    let drugIn = document.getElementById('ctl00_main_tbDrugLAmount') || document.getElementById('ctl00_main_tbDrugAmount') || document.getElementById('ctl00_main_txtDrugAmount') || document.querySelector('input[id*="tbDrug"],input[id*="txtDrug"],input[id*="Drug"][type="text"],input[id*="Amount"][type="text"]');
    let buyBtn = document.getElementById('ctl00_main_btnBuyLDrugs') || document.getElementById('ctl00_main_btnBuyDrugs') || document.getElementById('ctl00_main_btnBuy') || [...document.querySelectorAll('input[type="submit"],button')].find(b => /buy\s*drugs/i.test((b.value||b.textContent||'').trim()));
    if (!drugIn && buyBtn) drugIn = buyBtn.parentElement?.querySelector('input[type="text"],input:not([type])') || buyBtn.closest('div,td,tr,form')?.querySelector('input[type="text"],input:not([type])');
    if (!buyBtn) buyBtn = [...document.querySelectorAll('input[type="submit"]')].find(b => /buy/i.test(b.value||''));
    if (!drugIn && (maxAmt > 0 || buyBtn)) {
      const all = [...document.querySelectorAll('input[type="text"],input:not([type="submit"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"])')].filter(i => !i.id.includes('search') && !i.id.includes('chat'));
      if (all.length === 1) drugIn = all[0];
    }

    // If we found the form but couldn't parse the max, fall back to the input's own max attribute,
    // or a high number the game will cap — so we never miss a buy just because the text didn't match.
    if (maxAmt === 0 && drugIn && buyBtn && !buyBtn.disabled) {
      const attrMax = parseInt(drugIn.getAttribute('max') || drugIn.getAttribute('maxlength') || '0', 10);
      maxAmt = attrMax > 0 && attrMax < 100000 ? attrMax : 99999;
      console.log('[JB][DTM] maxAmt not parsed from text — using fallback', maxAmt);
    }

    if (maxAmt > 0 && drugIn && buyBtn && !buyBtn.disabled) {
      // Fill the value and fire events so ASP.NET registers it
      drugIn.value = String(maxAmt);
      try { drugIn.dispatchEvent(new Event('input', {bubbles:true})); drugIn.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}

      // Clear flag + set guard + store cooldown SYNCHRONOUSLY before the click triggers postback.
      // This is what stops the repeat-alert loop: if the page reloads, the guard blocks re-entry.
      clearDtmHandle();
      localStorage.setItem('cbDtmJustActed', String(Date.now()));
      localStorage.setItem(LS_LAST_DTM_ACC, String(Date.now()));
      storeDtm({ready:false,total:7200,h:2,m:0,s:0,at:Date.now()});
      tgMsg('dtmBuy', `🚚 <b>DTM Bought ${maxAmt}</b>\n${st.player||'?'} | 2h cooldown`);
      // Persistent lock survives the postback reload; checkStuck respects it
      localStorage.setItem('cbActionLockUntil', String(Date.now() + 8000));
      snapshotXP('dtm');
      setTimeout(() => { buyBtn.click(); }, 900 + Math.floor(Math.random()*400));
      return true;
    }

    // Buy form not ready yet (e.g. partner hasn't accepted). Stay put; mainLoop retries.
    return true;
  }

  function clearDtmHandle() {
    localStorage.removeItem('cbPendDtmHandle');
    localStorage.removeItem('cbPendDtmHandleTs');
  }

  /* === PROPERTY DROP WATCH ===
   * Background-fetches the cities statistics page on a timer and flags any
   * property with no owner shown (dropped — free to claim). Alerts once per new
   * drop via Telegram; stays silent while the dropped set is unchanged. Fully
   * local — only touches the game's own statistics.aspx. Master tab only.
   */

  const PROP_MIN_SEC = 120, PROP_DEF_SEC = 300;
  const PROP_COLUMNS = [
    { name:'Airport',         col:1 },
    { name:'Bullets Factory', col:2 },
    { name:'Roulette',        col:3 },
    { name:'Blackjack',       col:4 },
    { name:'Racetrack',       col:5 },
    { name:'Slots',           col:6 },
    { name:'War',             col:7 },
    { name:'Double Up',       col:8 }
  ];

  const propWatch = {
    on:      GM_getValue('cbPropOn', false),
    sec:     GM_getValue('cbPropSec', PROP_DEF_SEC),
    lastSig: GM_getValue('cbPropLastSig', ''),
    scanAt:  GM_getValue('cbPropScanAt', 0),
    scanOk:  GM_getValue('cbPropScanOk', false),
    scanMsg: GM_getValue('cbPropScanMsg', 'Not scanned'),
    dropped: GM_getValue('cbPropDropped', [])
  };
  if (!Array.isArray(propWatch.dropped)) propWatch.dropped = [];
  propWatch.sec = Math.max(PROP_MIN_SEC, Math.min(3600, Number(propWatch.sec || PROP_DEF_SEC)));

  let propTimer = null, propBusy = false;

  function savePropWatch() {
    GM_setValue('cbPropOn', propWatch.on);
    GM_setValue('cbPropSec', propWatch.sec);
    GM_setValue('cbPropLastSig', propWatch.lastSig);
    GM_setValue('cbPropScanAt', propWatch.scanAt);
    GM_setValue('cbPropScanOk', propWatch.scanOk);
    GM_setValue('cbPropScanMsg', propWatch.scanMsg);
    GM_setValue('cbPropDropped', propWatch.dropped);
  }

  // Read the cities table out of a parsed statistics doc. Returns an array of
  // {city, property} for every unowned cell, or null if the table is absent
  // (treated as inconclusive so we never false-alarm "everything dropped").
  function scanDroppedProps(doc) {
    const table = doc.getElementById('ctl00_main_gvCitiesInformation');
    if (!table) return null;
    const dropped = [];
    const rows = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('[id^="City"]'));
    for (const row of rows) {
      const citySpan = row.querySelector('[id^="City"]');
      const city = citySpan ? citySpan.textContent.trim() : 'Unknown';
      const cells = row.querySelectorAll('td');
      for (const col of PROP_COLUMNS) {
        const cell = cells[col.col];
        if (!cell) continue;
        const link = cell.querySelector('a[href*="profile.aspx"]');
        if (!link || !link.textContent.trim()) dropped.push({ city, property: col.name });
      }
    }
    return dropped;
  }

  function renderPropUI() {
    if (!_shadow) return;
    const cb = _shadow.querySelector('#jb-prop-on');
    if (!cb) return;
    cb.checked = propWatch.on;
    const lbl = cb.closest('.jb-switch');
    if (lbl) lbl.title = `${propWatch.scanMsg}${propWatch.scanAt ? ' · ' + fmtAgo(propWatch.scanAt) : ''}`;
  }

  async function propScan(reason = 'timer') {
    if (!propWatch.on || !tabs.isMaster || propBusy) return;
    if (st.inJail || paused) return;
    propBusy = true;
    try {
      const r = await owFetch(owUrl('statistics.aspx') + '?_=' + Date.now());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (isLoginDoc(doc)) throw new Error('Logged out');
      const dropped = scanDroppedProps(doc);
      if (dropped === null) throw new Error('Cities table not found');

      propWatch.scanAt = Date.now();
      propWatch.scanOk = true;
      propWatch.dropped = dropped;
      propWatch.scanMsg = dropped.length ? `${dropped.length} dropped` : 'All owned';

      const sig = dropped.map(d => `${d.city}:${d.property}`).sort().join('|');
      const lastSet = new Set((propWatch.lastSig || '').split('|').filter(Boolean));
      const fresh = dropped.filter(d => !lastSet.has(`${d.city}:${d.property}`));
      propWatch.lastSig = sig;
      savePropWatch();
      renderPropUI();

      if (fresh.length) {
        const body = fresh.map(d => `• ${esc(d.property)} in ${esc(d.city)}`).join('\n');
        tgMsg('propDrop', `🏠 <b>Property dropped!</b>\n${body}`);
      }
    } catch (e) {
      propWatch.scanAt = Date.now();
      propWatch.scanOk = false;
      propWatch.scanMsg = 'Scan failed: ' + (e && e.message ? e.message : e);
      savePropWatch();
      renderPropUI();
    } finally {
      propBusy = false;
    }
  }

  function propWatchStart() {
    propWatchStop();
    if (!propWatch.on) { renderPropUI(); return; }
    const ms = Math.max(PROP_MIN_SEC, Number(propWatch.sec || PROP_DEF_SEC)) * 1000;
    propTimer = setInterval(() => propScan('timer'), ms);
    setTimeout(() => propScan('startup'), 6000);
    renderPropUI();
  }

  function propWatchStop() { if (propTimer) clearInterval(propTimer); propTimer = null; }

  /* === STARVINGGEEKS LISTS (READ-ONLY) ===
   * Fetches three name lists the user maintains on their own server and uses them
   * to colour player profile links: watched (orange), safe (green), allied (blue).
   * 5-minute TTL, cached in GM storage so a failed fetch keeps the previous list
   * rather than blanking the colours.
   *
   * STRICTLY READ-ONLY — three GETs and nothing else. The reference script also
   * carries add-player-profile.php (pushes profiles up) and a 12s check-in to a
   * Cloudflare worker; neither is ported, and neither should be. Data flows one
   * way only: down.
   *
   * Uses GM_xmlhttpRequest rather than the reference's plain fetch(), so it works
   * regardless of whether the endpoint sends CORS headers. That needs
   * @connect starvinggeeks.net, which is why the header is now 33 lines.
   */
  const SG_SAFE_URL    = 'https://starvinggeeks.net/helper/safe.php';
  const SG_ALLIED_URL  = 'https://starvinggeeks.net/helper/allied.php';
  const SG_WATCHED_URL = 'https://starvinggeeks.net/helper/watched.php';
  /* FIVE MINUTES — what the reference ACTUALLY uses (2000.284).
   *
   * 2000.282 raised this to 30 minutes and justified it as matching the
   * reference's freshness window. It did the opposite: the reference has
   * SAFE_LIST_REFRESH_MS = 5 * 60 * 1000, unchanged across both copies on disk
   * (4.20.252 and 4.20.259), so the change moved us SIX TIMES further away from
   * it while claiming to match. Five minutes is also what Jarvis had before 282.
   *
   * The cost of a stale list is not cosmetic. The allied/safe invite gate is an
   * ALLOW-list that REFUSES on a miss, so a half-hour window means somebody you
   * have just added can have their OC/DTM invite turned down for half an hour —
   * and §4 already records that such a refusal looks identical to a fault.
   */
  const SG_TTL_MS = 5 * 60 * 1000;
  /* Retry gate after a FAILED attempt. The reference has no equivalent — it
   * stamps only on success, so a dead endpoint is retried on every page load,
   * which under bot navigation is roughly every 2.5 seconds. Keep this: it is
   * the thing that stops a broken endpoint turning into a request flood. */
  const SG_RETRY_MS = 30 * 1000;

  const sgCfg = { on: GM_getValue('cbSgOn', false) };
  function saveSgCfg() { GM_setValue('cbSgOn', sgCfg.on); }

  function sgReadList(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return Array.isArray(fallback) ? fallback.slice() : [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : (Array.isArray(fallback) ? fallback.slice() : []);
    } catch (e) {
      return Array.isArray(fallback) ? fallback.slice() : [];
    }
  }

  function sgWriteList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) {}
  }

  function sgReadStamp(key, fallback = 0) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function sgWriteStamp(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) {}
  }

  let sgSafe    = sgReadList('cbSgSafe', []);
  let sgAllied  = sgReadList('cbSgAllied', []);
  let sgWatched = sgReadList('cbSgWatched', []);

  function sgGetJson(url) {
    return new Promise((res, rej) => {
      GM_xmlhttpRequest({
        method:'GET', url, timeout:15000,
        headers:{'Cache-Control':'no-cache'},
        onload: r => {
          if (r.status < 200 || r.status >= 300) return rej(new Error('HTTP ' + r.status));
          try { res(JSON.parse(r.responseText)); } catch(e) { rej(new Error('bad JSON')); }
        },
        onerror:   () => rej(new Error('network')),
        ontimeout: () => rej(new Error('timeout'))
      });
    });
  }

  // Accepts either ["name", …] or [{name:"…"}, …] — watched.php returns objects.
  function sgNorm(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map(n => String(n && typeof n === 'object' && n.name != null ? n.name : n).trim().toLowerCase())
      .filter(Boolean);
  }

  let _sgFetching = false;
  async function fetchSgLists(force) {
    if (!sgCfg.on || _sgFetching) return;
    /* THE THROTTLE USED TO BLOCK ON AN ATTEMPT, NOT A SUCCESS (2000.269).
     *
     * This is why the colours only appeared after toggling the switch off and on.
     * cbSgLastFetch was stamped BEFORE the awaits, and Jarvis navigates every
     * couple of seconds — so the page died mid-fetch, the lists were never
     * stored, and the stamp then blocked every retry for five minutes. Every
     * subsequent page load skipped the fetch and had nothing to colour with.
     * Toggling the switch called fetchSgLists(true), which bypasses the
     * throttle — hence "it works if you turn it off and on again".
     *
     * Two clocks now: lastOk gates the 5-minute freshness, lastTry only stops a
     * dead endpoint being hammered. And with NO list data at all the freshness
     * gate does not apply — having nothing to colour with is not a state worth
     * preserving for five minutes. */
    const haveAny = (sgSafe.length + sgAllied.length + sgWatched.length) > 0;
    const lastOk  = sgReadStamp('cbSgLastOk', 0);
    const lastTry = sgReadStamp('cbSgLastTry', 0);
    if (!force) {
      if (haveAny && Date.now() - lastOk < SG_TTL_MS) return;   // fresh enough already
      if (Date.now() - lastTry < SG_RETRY_MS) return;           // don't hammer a dead endpoint
    }
    _sgFetching = true;
    sgWriteStamp('cbSgLastTry', Date.now());
    const pull = async (url, key, label) => {
      try {
        const list = sgNorm(await sgGetJson(url));
        sgWriteList(key, list);
        console.log(`${APP_TAG}[SG] ${label}: ${list.length} names`);
        return list;
      } catch (e) {
        console.warn(`${APP_TAG}[SG] ${label} fetch failed: ${e.message} — keeping previous list`);
        return null;
      }
    };
    /* SEQUENTIAL, NOT A PARALLEL BURST (2000.284). Three simultaneous GETs is
     * the shape a naive rate limiter objects to, and the concurrency buys
     * nothing — this runs once every five minutes and nothing waits on it. The
     * reference fetches them in this same order, one after another.
     *
     * Each still fails INDEPENDENTLY, which the reference does not do: there,
     * allied and watched sit inside the safe-list try block, so if safe.php is
     * down those two never update at all. */
    const s = await pull(SG_SAFE_URL,    'cbSgSafe',    'safe');
    const a = await pull(SG_ALLIED_URL,  'cbSgAllied',  'allied');
    const w = await pull(SG_WATCHED_URL, 'cbSgWatched', 'watched');
    if (s) sgSafe = s;
    if (a) sgAllied = a;
    if (w) sgWatched = w;
    // Only a real result refreshes the freshness clock.
    if (s || a || w) sgWriteStamp('cbSgLastOk', Date.now());
    else console.warn(APP_TAG, '[SG] All three list fetches failed — will retry shortly');
    _sgFetching = false;
    try { colourPlayerLinks(); } catch(_){}
  }

  // Precedence follows the reference implementation: watched > safe > allied.
  // (Its own hover code applies safe > allied and skips watched — an
  // inconsistency there; one order is used everywhere here.)
  function sgLookup(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    if (sgWatched.includes(n)) return { colour:'#ff7a18', badge:'👁️ WATCHED' };
    if (sgSafe.includes(n))    return { colour:'#00a550', badge:'✅ SAFE' };
    if (sgAllied.includes(n))  return { colour:'#4466ff', badge:'🤝 ALLIED' };
    return null;
  }

  function getSgState() {
    if (!sgCfg.on) return { state:'off', label:'OFF', colour:'var(--jb-text-ter)' };
    const now = Date.now();
    const lastOk = sgReadStamp('cbSgLastOk', 0);
    const lastTry = sgReadStamp('cbSgLastTry', 0);
    const haveAny = (sgSafe.length + sgAllied.length + sgWatched.length) > 0;
    if (!haveAny) {
      if (!lastTry || (now - lastTry) > SG_RETRY_MS) {
        return { state:'waiting', label:'waiting', colour:'var(--jb-warning)' };
      }
      return { state:'stale', label:'fetching', colour:'var(--jb-warning)' };
    }
    if ((now - lastOk) > SG_TTL_MS) {
      const ageMin = Math.max(0, Math.round((now - lastOk) / 60000));
      return { state:'stale', label:`stale ${ageMin}m`, colour:'var(--jb-warning)' };
    }
    return { state:'fresh', label:'fresh', colour:'var(--jb-success)' };
  }

  function renderSgStatusUI() {
    const el = _shadow && _shadow.querySelector('#jb-sg-status');
    if (!el) return;
    const s = getSgState();
    el.textContent = `${s.label}`;
    el.style.color = s.colour;
    el.style.fontWeight = '600';
    el.title = s.state === 'fresh' ? 'Starvinggeeks lists are fresh' :
      s.state === 'stale' ? 'Starvinggeeks lists are stale — gating will fail open, not block' :
      s.state === 'waiting' ? 'Waiting for the first SG list fetch' : 'SG lists are off';
  }

  function colourPlayerLinks(root) {
    if (!sgCfg.on) return;
    (root || document).querySelectorAll('a[href*="profile.aspx?id="]').forEach(a => {
      const hit = sgLookup(a.textContent);
      if (!hit) return;
      /* !important: the game sets its own inline colours on these links (your
       * own name in #AA0000, staff in #FF9900), so a plain assignment can be
       * overwritten when the page re-renders a row. */
      a.style.setProperty('color', hit.colour, 'important');
      a.style.setProperty('font-weight', 'bold', 'important');
    });
  }

  let _sgInited = false, _sgPaintTimer = null;
  function scheduleColourPaint() {
    if (_sgPaintTimer) return;   // coalesce mutation bursts into one repaint
    _sgPaintTimer = setTimeout(() => {
      _sgPaintTimer = null;
      try { colourPlayerLinks(); } catch(_){}
    }, 250);
  }

  function initSgLists() {
    if (_sgInited || !sgCfg.on || !document.body) return;
    _sgInited = true;
    fetchSgLists();
    colourPlayerLinks();
    /* Paint again when the page has finished loading and once more shortly
     * after. init() runs at DOMContentLoaded, so a single paint there can land
     * before the last rows exist — and the observer below only sees childList
     * changes in the light DOM, which a same-row restyle does not produce. */
    window.addEventListener('load', () => { try { colourPlayerLinks(); } catch(_){} }, { once:true });
    setTimeout(() => { try { colourPlayerLinks(); } catch(_){} }, 1200);
    // Re-colour links added by postbacks/AJAX.
    new MutationObserver(scheduleColourPaint).observe(document.body, { childList:true, subtree:true });
  }

  /* === PLAYER HOVER TOOLTIP ===
   * Hover any player profile link to get a quick card — rank, wealth, network,
   * join date, new-player protection — fetched same-origin from the game's own
   * profile page and cached. Fully local: no external lists or servers. Runs
   * per-tab as a UI helper, independent of master-tab status.
   */

  const hoverCfg = { on: GM_getValue('cbHoverOn', true) };
  function saveHoverCfg() { GM_setValue('cbHoverOn', hoverCfg.on); }

  let _hoverInited = false;
  function initPlayerHover() {
    if (_hoverInited || !hoverCfg.on || !document.body) return;
    _hoverInited = true;

    const cache = new Map();

    const tip = document.createElement('div');
    tip.id = 'jb-hover-tip';
    Object.assign(tip.style, {
      position:'fixed', display:'none',
      background:'rgba(20,20,20,0.97)', color:'#fff',
      padding:'8px 12px', borderRadius:'7px',
      font:'12px/1.6 system-ui, sans-serif',
      zIndex:'2147483647', pointerEvents:'none',
      boxShadow:'0 4px 18px rgba(0,0,0,0.6)',
      border:'1px solid var(--jb-accent, #7a1f1f)', maxWidth:'260px'
    });
    document.body.appendChild(tip);

    function positionTip(e) {
      const pad = 14;
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + 270 > window.innerWidth)  x = e.clientX - 270 - pad;
      if (y + 180 > window.innerHeight) y = e.clientY - 180 - pad;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    }

    async function fetchProfile(id) {
      if (cache.has(id)) return cache.get(id);
      try {
        const html = await fetch(`/authenticated/profile.aspx?id=${id}`, { method:'GET', credentials:'same-origin', cache:'no-store' }).then(r => r.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const panel = doc.querySelector('#ctl00_main_pnlMainProfile');
        if (!panel) return null;
        const get = sel => panel.querySelector(sel)?.textContent?.trim() || '';
        let protection = null;
        const protSpan = panel.querySelector('#ctl00_main_lblNewPlayerProtection');
        if (protSpan) { const m = protSpan.textContent.match(/(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/); if (m) protection = m[1]; }
        const info = {
          name:     get('#ctl00_main_hlName'),
          rank:     get('#ctl00_main_lblRank'),
          wealth:   get('#ctl00_main_lblWealth'),
          network:  get('#ctl00_main_hlNetwork'),
          joinDate: get('#ctl00_main_lblJoin'),
          protection
        };
        if (cache.size > 300) cache.delete(cache.keys().next().value);
        cache.set(id, info);
        return info;
      } catch(_) { return null; }
    }

    function attachHover(a) {
      if (a._jbHover) return;
      a._jbHover = true;
      const m = (a.getAttribute('href') || '').match(/id=(\d+)/);
      if (!m) return;
      const id = m[1];
      let hoverTimer = null, cancelled = false;

      a.addEventListener('mouseenter', e => {
        cancelled = false;
        hoverTimer = setTimeout(async () => {
          if (cancelled) return;
          const info = await fetchProfile(id);
          if (cancelled || !info) return;
          let html = `<b style="font-size:13px">${esc(info.name)}</b>`;
          const sg = sgLookup(info.name);
          if (sg) html += ` <span style="color:${sg.colour};font-size:11px;font-weight:bold">${sg.badge}</span>`;
          html += `<br><span style="color:#aaa">Rank:</span> ${esc(info.rank)}`;
          html += `<br><span style="color:#aaa">Wealth:</span> ${esc(info.wealth)}`;
          html += `<br><span style="color:#aaa">Network:</span> ${esc(info.network) || '—'}`;
          html += `<br><span style="color:#aaa">Joined:</span> ${esc(info.joinDate)}`;
          if (info.protection) html += `<br><span style="color:#ffc107">🛡️ Protected until:</span> ${esc(info.protection)}`;
          tip.innerHTML = html;
          tip.style.display = 'block';
          positionTip(e);
        }, 300);
      });
      a.addEventListener('mousemove', e => { if (tip.style.display === 'block') positionTip(e); });
      a.addEventListener('mouseleave', () => { cancelled = true; clearTimeout(hoverTimer); tip.style.display = 'none'; });
    }

    document.querySelectorAll('a[href*="profile.aspx?id="]').forEach(attachHover);

    new MutationObserver(mutations => {
      for (const mm of mutations) {
        for (const node of mm.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('a[href*="profile.aspx?id="]')) attachHover(node);
          node.querySelectorAll?.('a[href*="profile.aspx?id="]').forEach(attachHover);
        }
      }
    }).observe(document.body, { childList:true, subtree:true });
  }

  /* === PAGE HELPERS === */

  function curPage() {
    const p = window.location.pathname.toLowerCase();
    const s = window.location.search.toLowerCase();
    if (p.includes('crimes.aspx')) { if (s.includes('p=g')) return 'gta'; if (s.includes('p=b')) return 'booze'; return 'crimes'; }
    if (p.includes('jail.aspx')) return 'jail';
    if (p.includes('players.aspx')) return 'players';
    if (p.includes('resetscriptcounter.aspx')) return 'captcha';
    if (p.includes('playerproperty.aspx') && s.includes('p=g')) return 'garage';
    if (p.includes('credits.aspx')) return 'credits';
    if (p.includes('travel.aspx')) return 'travel';
    if (p.includes('mailbox.aspx')) return 'mailbox';
    return 'other';
  }

  function isOnCaptcha() {
    return curPage() === 'captcha' || document.querySelector('.g-recaptcha') || document.querySelector('#ctl00_main_pnlVerify') || document.title.includes('Script Check') || (document.body.textContent||'').includes('complete the script test');
  }

  function getHp() {
    const el = document.querySelector('#ctl00_userInfo_lblhealth');
    if (!el) return 100;
    return parseInt(el.textContent.trim().replace('%',''),10)||100;
  }

  function getCredits() {
    const el = document.querySelector('#ctl00_userInfo_lblcredits');
    if (!el) return 0;
    return parseInt(el.textContent.trim().replace(/[,$]/g,''),10)||0;
  }

  function getPlayerName() {
    if (curPage() !== 'players') { setStatus('Finding player...'); window.location.href = '/authenticated/players.aspx?'+Date.now(); return; }
    const TARGET = 'rgb(170, 0, 0)';
    for (const a of document.querySelectorAll('a[href*="profile.aspx"]')) {
      const c = window.getComputedStyle(a).color;
      const ic = a.style.color.toUpperCase();
      if (c === TARGET || ic === '#AA0000' || ic === 'RED') { st.player = a.textContent.trim(); saveSt(); setStatus(`Player: ${st.player}`); return; }
    }
    setStatus('Could not identify player');
  }

  /* === POST-RELEASE JAIL HOLD ===
   * Resuming crimes the instant you're out of jail is a very machine-like tell.
   * On the in-jail → free transition we roll a one-off random pause and park it
   * in st.jailReleaseUntil (persisted, so it survives the page reloads Jarvis
   * does while checking jail). mainLoop gates on jailHoldActive() right after
   * checkJailAny(), so nothing else runs until it expires.
   */
  function startJailHold() {
    if (!cfg.jailDelayOn) return;
    const lo = Math.max(0, Number(cfg.jailDelayMin) || 0);
    const hi = Math.max(lo, Number(cfg.jailDelayMax) || lo);
    const secs = lo + Math.floor(Math.random() * (hi - lo + 1));
    st.jailReleaseUntil = Date.now() + secs * 1000;
    saveSt();
    console.log(`${APP_TAG}[JAIL] Released — holding ${secs}s before resuming`);
  }

  function jailHoldRemainingSec() {
    return st.jailReleaseUntil ? Math.max(0, Math.ceil((st.jailReleaseUntil - Date.now()) / 1000)) : 0;
  }

  function jailHoldActive() {
    if (!st.jailReleaseUntil) return false;
    // Honour a hold already in flight even if the toggle was switched off mid-way,
    // but clear it so it can't linger.
    if (!cfg.jailDelayOn) { st.jailReleaseUntil = 0; saveSt(); return false; }
    if (Date.now() >= st.jailReleaseUntil) {
      st.jailReleaseUntil = 0; saveSt();
      console.log(`${APP_TAG}[JAIL] Hold finished — resuming`);
      return false;
    }
    return true;
  }

  /* === JAIL YIELD ===
   * A bust is the one action that can cost you the next one: fail it and you're
   * jailed, which blocks crime/GTA/booze until you're out again. So when another
   * action is about to come due, stand aside and let it go first.
   *
   * Travel is included, but only when auto-travel would genuinely act — enabled,
   * hot city known, and not already in it. Without that check a ready travel
   * timer while sitting in the hot city would block jail permanently.
   */
  function jailShouldHoldOff() {
    const sec = Math.max(0, Number(cfg.jailYieldSec) || 0);
    if (sec <= 0) return false;                 // slider at 0 = feature off
    const within = sec * 1000, now = Date.now();

    const checks = [
      ['crime', st.crime, st.lastCrime, cfg.crimeInt],
      ['gta',   st.gta,   st.lastGta,   cfg.gtaInt],
      ['booze', st.booze, st.lastBooze, cfg.boozeInt]
    ];
    for (const [act, on, last, intSec] of checks) {
      if (!on) continue;
      // Real due time, not the raw interval — see cooldownDelayMs.
      if (cooldownRemainingMs(act, last, intSec) <= within) return true;
    }

    if (st.autoTravel && getHot() && !isInHot()) {
      const t = getTravel();
      if (t && (t.ready || (t.remaining * 1000) <= within)) return true;
    }
    return false;
  }

  /* === JAIL DETECTION === */

  function processJail() {
    if (curPage() !== 'jail') return;
    let inJail = false;
    if (st.player) {
      const tbl = document.querySelector('#ctl00_main_gvJail');
      if (tbl) {
        for (const row of [...tbl.querySelectorAll('tr')].slice(1)) {
          const pl = row.querySelector('a[href*="profile.aspx"]');
          if (pl && pl.textContent.trim().toLowerCase() === st.player.toLowerCase()) { inJail = true; break; }
        }
      }
    }
    if (!inJail) {
      const txt = document.body.textContent.toLowerCase();
      if (txt.includes('you are in jail') || txt.includes('you have been jailed')) inJail = true;
    }
    const was = st.inJail;
    st.inJail = inJail;
    if (!was && inJail) {
      if (st.action && !st.pending) st.pending = st.action;
      st.acting = false; st.action = ''; st.refresh = true; GM_setValue('cbActStart',0);
    } else if (was && !inJail) {
      st.refresh = true;
      startJailHold();   // out of jail — pause before carrying on
    }
    saveSt();
  }

  function checkJailAny() {
    if (curPage() === 'jail') return processJail();
    const txt = document.body.textContent.toLowerCase();
    if (txt.includes('you are in jail') || txt.includes('you have been jailed')) {
      const was = st.inJail; st.inJail = true;
      if (!was) { if (st.action && !st.pending) st.pending = st.action; st.acting = false; st.action = ''; st.refresh = true; GM_setValue('cbActStart',0); saveSt(); setTimeout(() => { window.location.href = '/authenticated/jail.aspx?'+Date.now(); }, 1000); }
      return true;
    }
    return st.inJail;
  }

  function checkStuck() {
    // Respect a persistent post-action lock (e.g. DTM buy postback) that survives reloads
    const lockUntil = parseInt(localStorage.getItem('cbActionLockUntil')||'0',10);
    if (lockUntil > Date.now()) return false; // still in a deliberate lock window
    if (lockUntil > 0) localStorage.removeItem('cbActionLockUntil'); // expired, clear it

    if (st.acting) {
      const start = GM_getValue('cbActStart',0);
      if (Date.now()-start > 15000) { st.acting = false; st.action = ''; st.refresh = true; saveSt(); GM_setValue('cbActStart',0); return true; }
    }
    return false;
  }

  let _navigating = false;
  function safeNav(url) {
    /* The single navigation choke point. Loading a page is the loudest "I'm
     * here" signal there is, so this refuses outright while halted rather than
     * relying on every caller having been gated. */
    if (isHalted()) { dlog(APP_TAG, '[HALT] Navigation refused:', url); return true; }
    if (st.inJail && !url.includes('jail.aspx')) { setStatus('Blocked — in jail'); return true; }
    if (_navigating) return true; // already navigating — don't stack redirects
    _navigating = true;
    if (st.acting) {
      setTimeout(() => { st.acting = false; st.action = ''; st.refresh = false; GM_setValue('cbActStart',0); saveSt(); window.location.href = url; }, 600 + Math.floor(Math.random()*400));
      return true;
    }
    // Fast navigation — human clicks a link quickly
    setTimeout(() => { window.location.href = url; }, 150 + Math.floor(Math.random()*350));
    return false;
  }

  function donePending(type) { if (st.pending === type) { st.pending = ''; saveSt(); } }

  /* === GAME ACTIONS === */

  // Cooldown jitter: adds ±1-4 seconds to any interval check
  /* === HUMAN ACTION CADENCE (max camouflage) ===
   * The old jitteredCooldown returned interval ± 1–4s and was re-rolled on EVERY
   * loop tick, so the action fired on the first low roll — collapsing the spread to
   * ~interval−4s every time (a needle-sharp, slightly-early, very botty pattern).
   * Instead we now pick ONE delay per action cycle from a heavily right-skewed
   * distribution floored at the game cooldown (never early), persist it so it
   * survives page reloads, and only re-roll it after the action actually fires.
   * Result: most actions land a few seconds after ready, many drift to 30s–2.5min,
   * some wander off for several minutes, a few go properly AFK — a human curve, not
   * a metronome. Throughput drops (by design — you chose max camouflage).
   */
  function humanCooldownMs(intervalSec) {
    const floor = Math.max(0, intervalSec * 1000); // game cooldown — never act before this
    const r = Math.random();
    let extra;
    if      (r < 0.45) extra = 3000   + Math.random() * 22000;   // 3–25s: still at the screen
    else if (r < 0.80) extra = 25000  + Math.random() * 125000;  // 25s–2.5min: half-watching
    else if (r < 0.95) extra = 150000 + Math.random() * 330000;  // 2.5–8min: wandered off
    else               extra = 480000 + Math.random() * 720000;  // 8–20min: properly AFK
    extra += (Math.random() - 0.5) * 6000; // soften the band edges
    return floor + Math.max(0, extra);
  }

  /* JAIL IS NOT SUBJECT TO THE CAMOUFLAGE CURVE (2000.285).
   *
   * humanCooldownMs adds 3s-20min ON TOP of the interval. That is right for a
   * crime on a 125s timer. It is nonsense for jail, whose interval is THREE
   * SECONDS by default: the tail is up to 400x the setting, so "every 3 seconds"
   * actually meant a ~2 MINUTE average and, one time in twenty, an 8-20 minute
   * gap. Until 2000.283 the At-PC switch was the escape hatch; removing it left
   * jail permanently on the slow curve, which is when it began feeling broken.
   *
   * The reference busts on a 1-3s loop (JAIL_COOLDOWN_MIN/MAX = 1/3, with a 7s
   * penalty after a failure) and applies no long tail at all. Jail's camouflage
   * was never its spacing — it is the mod-presence suppression and the daily
   * cap, and both still apply untouched. So jail gets its interval plus a small
   * jitter, and the number in Settings means what it says.
   *
   * ONE LINE TO REVERT: empty FAST_ACTIONS.
   */
  const FAST_ACTIONS = new Set(['jail']);

  /* ONE-TIME: bin the delay rolled under the old curve.
   *
   * cbDly_jail is only ever re-rolled by markActed(), i.e. after the action next
   * FIRES. So a device updating to 285 mid-wait would sit out one last delay of
   * up to twenty minutes before any of this took effect — and would look exactly
   * as broken as it did before the fix, which is the worst possible first
   * impression of a repair. Zero makes cooldownDelayMs() roll a fresh one on the
   * next read. */
  if (!GM_getValue('cbFastJailMigrated', false)) {
    GM_setValue('cbFastJailMigrated', true);
    FAST_ACTIONS.forEach(a => GM_setValue('cbDly_' + a, 0));
    console.log(APP_TAG, '[CADENCE] Cleared the pending jail delay so the new cadence applies now');
  }

  // Pick the delay for this action. `action` is optional; without it you get the
  // camouflage curve, which is the safe default for anything added later.
  function nextCooldownMs(intervalSec, action) {
    if (action && FAST_ACTIONS.has(action)) {
      return Math.max(0, intervalSec * 1000) + 500 + Math.random() * 4000;
    }
    return humanCooldownMs(intervalSec);
  }

  /* === ONE SOURCE OF TRUTH FOR WHEN AN ACTION IS DUE (2000.285) ===
   *
   * The delay actually in force is the PERSISTED randomised one in cbDly_<action>,
   * re-rolled only by markActed(). Five other places instead computed the wait
   * from the RAW interval: mainLoop's crimeRdy/gtaRdy/boozeRdy/jailRdy gates, its
   * crime-vs-GTA tie-break, its status countdown, actionDueSoon() and
   * jailShouldHoldOff(). So the loop believed an action was due long before the
   * action itself agreed — and with jail at 3s the two views were MINUTES apart.
   *
   * Four symptoms, all of that one fault:
   *   · jailRdy went true 3s after a bust, so mainLoop navigated to jail.aspx —
   *     and doJailbreak() then refused, because ITS gate was still counting. A
   *     page load every couple of seconds on the noisiest page in the game, with
   *     no bust to show for it.
   *   · the panel read J:0s while the real wait was minutes.
   *   · setStatus() lives in the else branch, so a permanently-ready jail meant
   *     the status line stopped updating at all.
   *   · scrap and garage sit BELOW jail in the chain, and scrap additionally
   *     requires !jailRdy — so a jail that was always ready but never firing
   *     starved both of them completely.
   *
   * Everything reads cooldownDelayMs() now, so the loop and the action cannot
   * disagree again.
   */
  function cooldownDelayMs(action, intervalSec) {
    let dly = GM_getValue('cbDly_' + action, 0);
    if (!dly) { dly = nextCooldownMs(intervalSec, action); GM_setValue('cbDly_' + action, dly); }
    return dly;
  }

  // Milliseconds until this action is due; 0 means now.
  function cooldownRemainingMs(action, lastTs, intervalSec) {
    return Math.max(0, (lastTs + cooldownDelayMs(action, intervalSec)) - Date.now());
  }

  // True once the action's chosen (persisted) delay has elapsed since lastTs.
  // The delay is stable between fires — only markActed() re-rolls it.
  function cooldownElapsed(action, lastTs, intervalSec) {
    return cooldownRemainingMs(action, lastTs, intervalSec) <= 0;
  }

  // Roll and persist the delay until the NEXT action of this type. Call right after firing.
  function markActed(action, intervalSec) {
    GM_setValue('cbDly_' + action, nextCooldownMs(intervalSec, action));
  }

  // Re-roll all pending action delays so a new cadence is applied immediately.
  function rerollCadence() {
    [['crime',cfg.crimeInt],['gta',cfg.gtaInt],['booze',cfg.boozeInt],['jail',cfg.jailInt]]
      .forEach(([a, iv]) => GM_setValue('cbDly_' + a, nextCooldownMs(iv, a)));
  }

  /* === SMART ACTION PICKING ===
   * Two ways to choose which crime to commit, switched by cfg.smartPick:
   *
   *  Random (default, unchanged): pick uniformly from the crimes you ticked. Wide
   *  spread, and every crime you selected genuinely gets used.
   *
   *  Smart: the most VALUABLE crime still succeeding at or above cfg.smartMinPct.
   *
   * NOTE — this deliberately does NOT copy the reference script, which simply
   * takes the highest success percentage. That is the wrong optimisation once
   * your rank is high. Sampled live at Global Dominator the five crimes read
   * 97 / 95 / 94 / 94 / 90 %, so "highest %" selects crime 1, Credit card fraud —
   * the cheapest crime on the page. The reference's rule makes sense at low rank,
   * where the spread is wide and a failure means jail; at a 3%-vs-10% failure
   * difference the reward gap dominates completely.
   *
   * IMPORTANT: the game RE-ROLLS these percentages on every visit to the page.
   * The figures above are one sample, not a fixed table — do not assume the
   * ordering holds. What IS fixed is value: crime id ascends with reward (id 5,
   * Rob a bank, is always worth more than id 1). So the rule is "highest id that
   * clears the threshold", evaluated fresh from the labels on the page we are
   * about to click, never from anything cached.
   *
   * The re-rolling actually makes this adapt rather than break: on a visit where
   * Rob a bank rolls below the threshold, it steps down to the best crime that
   * IS safe enough this time, and steps back up on the next visit that allows it.
   *
   * Falls back to plain highest-% if nothing clears the threshold, and to random
   * if no percentages can be read at all (labels missing or page not loaded).
   */
  const CRIME_PCT_LABEL = {
    1:'ctl00_main_lblCr1', 2:'ctl00_main_lblCr2', 3:'ctl00_main_lblCr3',
    4:'ctl00_main_lblCr4', 5:'ctl00_main_lblCr5'
  };

  function crimeSuccessPct(id) {
    const el = document.getElementById(CRIME_PCT_LABEL[id]);
    if (!el) return null;
    const n = parseInt((el.textContent || '').replace('%', '').trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  // cands: [{ id, btn }] — returns the button to click.
  function pickCrime(cands) {
    if (!cfg.smartPick || cands.length < 2) {
      return cands[Math.floor(Math.random() * cands.length)].btn;
    }
    const rated = [];
    for (const c of cands) {
      const pct = crimeSuccessPct(c.id);
      if (pct !== null) rated.push({ ...c, pct });
    }
    if (!rated.length) {                       // no percentages readable at all
      return cands[Math.floor(Math.random() * cands.length)].btn;
    }

    const floor = Math.max(0, Math.min(100, Number(cfg.smartMinPct) || 0));
    const safe = rated.filter(c => c.pct >= floor);
    if (safe.length) {
      // Most valuable of the safe ones = highest id.
      const chosen = safe.reduce((a, b) => (b.id > a.id ? b : a));
      dlog(APP_TAG, `[CRIME] Smart pick: crime ${chosen.id} at ${chosen.pct}% (best value ≥${floor}%)`);
      return chosen.btn;
    }

    /* Nothing clears the threshold — your rank is too low for these crimes, or
     * the daily cap has crushed the odds. Fall back to the safest, breaking ties
     * randomly so we don't fixate on the lowest-numbered one. */
    let bestPct = -1, best = [];
    for (const c of rated) {
      if (c.pct > bestPct) { bestPct = c.pct; best = [c]; }
      else if (c.pct === bestPct) best.push(c);
    }
    const chosen = best[Math.floor(Math.random() * best.length)];
    dlog(APP_TAG, `[CRIME] Smart pick: crime ${chosen.id} at ${bestPct}% (nothing ≥${floor}%, taking safest)`);
    return chosen.btn;
  }

  /* Live preview next to the threshold, so you can see which crime the current
   * setting selects instead of inferring it. Only meaningful on a crimes page,
   * where the percentage labels exist — and only as a SNAPSHOT: the game re-rolls
   * the percentages every visit, so this shows what would be picked right now,
   * not a standing decision. */
  function updateSmartPreview() {
    if (!_shadow) return;
    const el = _shadow.querySelector('#jb-smart-preview');
    if (!el) return;
    if (!cfg.smartPick) { el.textContent = 'random mode'; return; }
    const ids = ((st.crimes && st.crimes.length) ? st.crimes : [1,2,3,4,5]).filter(id => crimeAllowed(id));
    const rated = ids.map(id => ({ id, pct: crimeSuccessPct(id) })).filter(c => c.pct !== null);
    if (!rated.length) { el.textContent = 'open a crimes page'; return; }
    const floor = Math.max(0, Math.min(100, Number(cfg.smartMinPct) || 0));
    const safe = rated.filter(c => c.pct >= floor);
    const pick = safe.length
      ? safe.reduce((a,b) => (b.id > a.id ? b : a))
      : rated.reduce((a,b) => (b.pct > a.pct ? b : a));
    const nm = (CRIMES.find(c => c.id === pick.id) || {}).name || ('crime ' + pick.id);
    el.textContent = `now: ${nm} (${pick.pct}%)${safe.length ? '' : ' — none qualify'}`;
  }

  /* Booze carry limit by rank — CLOSED FORM (2000.242).
   *
   *     limit = 10 + rankLevel²      (rankLevel is 1-based: Scum 1 … Legend 17)
   *
   * Supplied by the user; e.g. Criminal is rank 5 → 10 + 25 = 35. It reproduces
   * the hardcoded table it replaces EXACTLY at all 17 ranks (11,14,19,26,35,46,
   * 59,74,91,110,131,154,179,206,235,266,299), which is the reason to trust it —
   * the table was a set of observations, this is the rule behind them. Derived
   * from the RANKS index so there is one ordered list of rank names in the file
   * rather than two that can drift.
   *
   * Only used when smart picking is on; otherwise cfg.boozeBuy stands.
   */
  function boozeCarryLimit(rankName) {
    const i = RANKS.findIndex(r => r[0].toLowerCase() === String(rankName||'').trim().toLowerCase());
    if (i < 0) return null;              // unknown name — caller falls back
    return 10 + Math.pow(i + 1, 2);      // RANKS is 0-based, the formula is 1-based
  }

  function boozeBuyQty() {
    if (!cfg.smartPick) return cfg.boozeBuy;
    // "Broke" cycle: a failed buy means no cash, so buy 1 to restart the loop.
    if (localStorage.getItem('cbBoozeBroke') === 'true') return 1;
    const rank = (document.querySelector('#ctl00_userInfo_lblrank')?.textContent || '').trim();
    const lim = boozeCarryLimit(rank);
    if (lim !== null) { dlog(APP_TAG, `[BOOZE] Rank "${rank}" → carry limit ${lim}`); return lim; }
    console.warn(APP_TAG, `[BOOZE] Rank "${rank}" not in RANKS — using the fixed amount ${cfg.boozeBuy}`);
    return cfg.boozeBuy;
  }

  /* Sell ONE at a time in smart mode.
   *
   * It used to sell a random 1–3, on the assumption that varying the number
   * looked more human. That is the wrong trade: the user reports the XP is per
   * SALE, not per unit, so selling singly turns one full carry-load into as many
   * XP-earning sales as you have units — buy your rank limit, then sell them off
   * one by one. Three at a time simply threw two thirds of the XP away.
   * Camouflage comes from the cadence system, not from the quantity field. */
  function boozeSellQty(available) {
    const want = cfg.smartPick ? 1 : cfg.boozeSell;
    return Math.max(1, Math.min(want, available));
  }

  function doCrime() {
    if (st.inJail || !st.crime || st.acting || paused) return;
    if (dailyLimitReached('crime')) return;
    const now = Date.now();
    if (!cooldownElapsed('crime', st.lastCrime, cfg.crimeInt)) return;
    if (st.refresh || curPage() !== 'crimes') { st.refresh = false; saveSt(); safeNav('/authenticated/crimes.aspx?'+Date.now()); return; }
    st.acting = true; st.action = 'crime'; GM_setValue('cbActStart', now);
    // Carries the crime id alongside the button so smart picking can look up its
    // success percentage; random picking ignores the id.
    let avail = [];
    if (st.crimes.length > 0) {
      avail = st.crimes.map(id => { const c = CRIMES.find(x=>x.id===id); if(c) { const b = document.getElementById(c.el); if(b && !b.disabled) return { id, btn:b }; } return null; }).filter(Boolean);
    } else { for(let i=1;i<=5;i++) { const b = document.getElementById(`ctl00_main_btnCrime${i}`); if(b && !b.disabled) avail.push({ id:i, btn:b }); } }
    // Drop anything excluded (pickpocket) before a pick is even considered.
    avail = avail.filter(c => crimeAllowed(c.id, c.btn));
    if (!avail.length) {
      const rk = 'cbCrimeRetry';
      const rc = parseInt(localStorage.getItem(rk)||'0',10);
      if (rc < 3) { localStorage.setItem(rk, String(rc+1)); st.acting = false; st.action = ''; GM_setValue('cbActStart',0); setTimeout(() => { st.refresh = true; saveSt(); }, 2000); return; }
      localStorage.removeItem(rk); st.acting = false; st.action = ''; GM_setValue('cbActStart',0); return;
    }
    localStorage.removeItem('cbCrimeRetry');
    // Click immediately — humans click fast, the delay is in the cooldown
    const chosenBtn = pickCrime(avail);
    /* Last line of defence. The filter above should make this unreachable, but an
     * excluded crime must never be clicked, so the check sits on the click itself
     * rather than only on the paths that lead to it. */
    if (!chosenBtn || (chosenBtn.id && EXCLUDED_CRIME_ELS.has(chosenBtn.id))) {
      console.warn(APP_TAG, '[CRIME] Refusing excluded crime button:', chosenBtn && chosenBtn.id);
      st.acting = false; st.action = ''; GM_setValue('cbActStart', 0);
      return;
    }
    snapshotXP('crime');
    chosenBtn.click();
    incDailyCount('crime');
    st.lastCrime = now; markActed('crime', cfg.crimeInt); st.refresh = true; donePending('crime'); saveSt();
    // Short reset — just enough for the page to process the click
    setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
  }

  function doGta() {
    if (st.inJail || !st.gta || st.acting || paused) return;
    if (dailyLimitReached('gta')) return;
    const now = Date.now();
    if (!cooldownElapsed('gta', st.lastGta, cfg.gtaInt)) return;
    if (st.refresh || curPage() !== 'gta') { st.refresh = false; saveSt(); safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); return; }
    st.acting = true; st.action = 'gta'; GM_setValue('cbActStart', now);
    const radios = document.querySelectorAll('input[name="ctl00$main$carslist"]');
    let avail = [];
    if (st.gtas.length > 0) { avail = st.gtas.map(id => { const g = GTAS.find(x=>x.id===id); if(g) return [...radios].find(r=>r.value===g.val); return null; }).filter(Boolean); }
    else avail = [...radios];
    if (!avail.length) {
      const rk = 'cbGtaRetry'; const rc = parseInt(localStorage.getItem(rk)||'0',10);
      if (rc < 3) { localStorage.setItem(rk, String(rc+1)); st.acting = false; st.action = ''; GM_setValue('cbActStart',0); setTimeout(() => { st.refresh = true; saveSt(); }, 2000); return; }
      localStorage.removeItem(rk); st.acting = false; st.action = ''; st.refresh = true; GM_setValue('cbActStart',0); saveSt(); return;
    }
    localStorage.removeItem('cbGtaRetry');
    avail[Math.floor(Math.random()*avail.length)].checked = true;
    // Quick human-like gap between selecting car and clicking steal (200-600ms)
    setTimeout(() => {
      const btn = document.getElementById('ctl00_main_btnStealACar');
      if (!btn) { st.acting = false; st.action = ''; st.refresh = true; GM_setValue('cbActStart',0); saveSt(); return; }
      snapshotXP('gta');
      btn.click(); incDailyCount('gta');
      st.lastGta = now; markActed('gta', cfg.gtaInt); st.refresh = true; donePending('gta'); saveSt();
      setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
    }, 200 + Math.floor(Math.random()*400));
  }

  function doBooze() {
    if (st.inJail || !st.booze || st.acting || paused) return;
    if (dailyLimitReached('booze')) return;
    const now = Date.now();
    if (!cooldownElapsed('booze', st.lastBooze, cfg.boozeInt)) return;
    if (st.refresh || curPage() !== 'booze') { st.refresh = false; saveSt(); safeNav('/authenticated/crimes.aspx?p=b&'+Date.now()); return; }
    st.acting = true; st.action = 'booze'; GM_setValue('cbActStart', now);

    /* Broke detection (smart mode): a buy that fails for lack of cash leaves this
     * message on the page. Without noticing it, the next cycle buys the full rank
     * allowance again and fails again. Flagging it drops the next buy to 1 unit,
     * which sells for cash and restarts the cycle. */
    if (cfg.smartPick) {
      const lm = document.querySelector('#ctl00_lblMsg');
      if (lm && /don'?t have enough money/i.test(lm.textContent || '')) {
        localStorage.setItem('cbBoozeBroke', 'true');
        dlog(APP_TAG, '[BOOZE] Not enough money — will buy 1 next cycle');
      }
    }

    const invRows = [...document.querySelectorAll('table tr')].filter(row => { const c = row.querySelector('td:nth-child(3)'); if(!c) return false; const inv = c.textContent.trim(); return inv && inv !== '0' && !isNaN(inv); });
    if (invRows.length > 0) {
      const row = invRows[0]; const si = row.querySelector('input[id*="tbAmtSell"]'); const sb = row.querySelector('input[id*="btnSell"]');
      if (si && sb && !sb.disabled) {
        const cur = parseInt(row.querySelector('td:nth-child(3)').textContent.trim());
        si.value = boozeSellQty(cur);
        snapshotXP('booze', 'booze-sell');   // the one that actually earns
        sb.click(); incDailyCount('booze');
        localStorage.removeItem('cbBoozeBroke');   // sold = cash back
        st.lastBooze = now; markActed('booze', cfg.boozeInt); st.refresh = true; donePending('booze'); saveSt();
        setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
        return;
      }
    }
    const buyOpts = [];
    for (let i=2; i<=6; i++) { const inp = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_tbAmtBuy`); const btn = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_btnBuy`); if (inp && btn && !btn.disabled) buyOpts.push({inp,btn}); }
    if (buyOpts.length > 0) {
      const c = buyOpts[Math.floor(Math.random()*buyOpts.length)];
      const qty = boozeBuyQty();
      c.inp.value = qty;
      try { c.inp.dispatchEvent(new Event('input',{bubbles:true})); c.inp.dispatchEvent(new Event('change',{bubbles:true})); } catch(_){}
      snapshotXP('booze', 'booze-buy'); c.btn.click(); incDailyCount('booze');   // earns nothing
      localStorage.removeItem('cbBoozeBroke');
      st.lastBooze = now; markActed('booze', cfg.boozeInt); st.refresh = true; donePending('booze'); saveSt();
      setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
    } else { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }
  }

  /* === JAIL DAILY ATTEMPT COUNTER (game-time reset at 00:00) === */

  // Returns the current game-day string (YYYY-MM-DD) based on server time
  function gameDayStr() {
    // Day boundary must match the game's (Amsterdam midnight), not UTC midnight,
    // or the jail daily counter resets at the wrong time. getServerTime() already
    // gives us the calibrated server instant; format its Amsterdam calendar day.
    const d = getServerTime();
    try {
      // en-CA yields YYYY-MM-DD directly
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(d);
    } catch (e) {
      // Fallback: UTC day (previous behaviour)
      return `${d.getUTCFullYear()}-${_pad(d.getUTCMonth()+1)}-${_pad(d.getUTCDate())}`;
    }
  }

  function getJailCount() {
    const today = gameDayStr();
    const storedDay = GM_getValue('cbJailCountDay', '');
    if (storedDay !== today) {
      // New game-day — reset counter
      GM_setValue('cbJailCountDay', today);
      GM_setValue('cbJailCount', 0);
      // Re-enable jail if it was auto-disabled by the limit
      if (GM_getValue('cbJailAutoOff', false)) {
        GM_setValue('cbJailAutoOff', false);
        st.jail = GM_getValue('cbJailWasOn', true);
        saveSt(); repaintRibbon();
        console.log('[JB][JAIL] New game-day — counter reset, jail re-enabled');
        tgMsg('jail', `⛓️ <b>Jail Reset</b>\n${st.player||'?'} | New day, counter cleared`);
      }
      return 0;
    }
    return GM_getValue('cbJailCount', 0);
  }

  function incJailCount() {
    const today = gameDayStr();
    const storedDay = GM_getValue('cbJailCountDay', '');
    if (storedDay !== today) { GM_setValue('cbJailCountDay', today); GM_setValue('cbJailCount', 0); }
    const n = GM_getValue('cbJailCount', 0) + 1;
    GM_setValue('cbJailCount', n);

    // Hit the daily limit? Turn off jail to avoid attention.
    if (n >= cfg.jailDailyLimit) {
      GM_setValue('cbJailWasOn', st.jail);
      GM_setValue('cbJailAutoOff', true);
      st.jail = false; saveSt(); repaintRibbon();
      console.log(`[JB][JAIL] Daily limit ${cfg.jailDailyLimit} reached — jail disabled`);
      tgMsg('jail', `🛑 <b>Jail Limit</b>\n${st.player||'?'} | ${n}/${cfg.jailDailyLimit} reached, jail OFF`);
      updateJailCountUI();
    }
    return n;
  }

  function updateJailCountUI() {
    if (!_shadow) return;
    const hEl = _shadow.querySelector('#jb-jail-hold');
    if (hEl) {
      const rem = jailHoldActive() ? jailHoldRemainingSec() : 0;
      hEl.textContent = rem > 0 ? `⏳ ${rem}s · ` : '';
    }
    const el = _shadow.querySelector('#jb-jail-count');
    if (el) {
      const n = getJailCount();
      const lim = cfg.jailDailyLimit;
      const pct = lim > 0 ? (n/lim) : 0;
      const clr = pct >= 1 ? 'var(--jb-danger)' : pct >= 0.9 ? 'var(--jb-warning)' : 'var(--jb-text-sec)';
      el.innerHTML = `<span style="color:${clr}">${n}/${lim}</span>`;
    }
  }

  function jailLimitReached() {
    return getJailCount() >= cfg.jailDailyLimit;
  }

  /* === PER-ACTION DAILY COUNTS + LIMITS ===
   * Generalises the jail counter to crime / GTA / booze. Jail keeps its own
   * dedicated counter and UI — it predates this, has its own limit field and its
   * own auto-off flags, and rewriting it to route through here would risk a
   * well-tested path for no behavioural gain.
   *
   * COUNTING IS UNCONDITIONAL (2000.240). It used to be gated on cfg.dailyLimitOn
   * AND a non-zero limit, which disabled the feature for the one job it is most
   * needed for: working out what the game's real cap is. You cannot choose a
   * sensible limit without first watching an uncapped day, and the cap MOVES WITH
   * RANK, so the figure has to be re-learned as you climb. Counting costs one
   * GM_setValue per action, so it always runs; cfg.dailyLimitOn now controls only
   * whether hitting a limit switches the action off.
   *
   * Each finished game-day is archived to cbDayHist_<action> with the rank it was
   * played at, so the panel can show "best day ever / best at this rank" — the two
   * numbers you actually need. Rank is stamped at each increment, so a day spanning
   * a rank-up records the rank you FINISHED it at.
   *
   * The limit itself is a HARD cap, unlike the no-XP limiter which infers the
   * game's cap from XP going flat. They stack: whichever notices first wins.
   */
  const DAILY_ACTIONS = {
    crime: { label:'👜 Crime', limitKey:'dailyLimitCrime' },
    gta:   { label:'🏎️ GTA',   limitKey:'dailyLimitGta'   },
    booze: { label:'🍺 Booze', limitKey:'dailyLimitBooze' }
  };
  const DAILY_HIST_CAP = 60;   // game-days kept per action

  function dailyLimitOf(action) {
    const d = DAILY_ACTIONS[action];
    if (!d) return 0;
    const n = Number(cfg[d.limitKey]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function dailyHist(action) {
    const h = GM_getValue('cbDayHist_' + action, null);
    return Array.isArray(h) ? h : [];
  }

  // Archive a finished day. Silently ignores empty/zero days so a fresh install
  // (stored day '') and days you didn't play don't pollute the sample.
  function archiveDailyCount(action, day, n, rank) {
    if (!day || !(n > 0)) return;
    const h = dailyHist(action);
    if (h.some(r => r.day === day)) return;          // already archived
    h.push({ day, n, rank: rank || '' });
    while (h.length > DAILY_HIST_CAP) h.shift();
    GM_setValue('cbDayHist_' + action, h);
    console.log(`${APP_TAG}[LIMIT] ${action} ${day}: ${n} attempts at ${rank || 'unknown rank'} — archived`);
  }

  // Best day recorded overall and best at a given rank. Today is deliberately NOT
  // included: it isn't finished, so it isn't evidence of a cap yet.
  function dailyPeak(action, rank) {
    let all = 0, atRank = 0, days = 0, rankDays = 0;
    for (const r of dailyHist(action)) {
      days++;
      if (r.n > all) all = r.n;
      if (rank && r.rank === rank) { rankDays++; if (r.n > atRank) atRank = r.n; }
    }
    return { all, atRank, days, rankDays };
  }

  // Counter is keyed by game-day, so a rollover resets it lazily on first read —
  // no timer needed, and it stays correct across a tab that was closed overnight.
  function getDailyCount(action) {
    if (!DAILY_ACTIONS[action]) return 0;
    const today = gameDayStr();
    const storedDay = GM_getValue('cbDayCountDay_' + action, '');
    if (storedDay !== today) {
      // Archive the day that just ended BEFORE zeroing — this is the research data.
      archiveDailyCount(action, storedDay, GM_getValue('cbDayCount_' + action, 0),
                        GM_getValue('cbDayRank_' + action, ''));
      GM_setValue('cbDayCountDay_' + action, today);
      GM_setValue('cbDayCount_' + action, 0);
      GM_setValue('cbDayRank_' + action, rankState.name || '');
      // Re-enable if the limit is what turned it off (not a manual switch-off).
      if (GM_getValue('cbDayAutoOff_' + action, false)) {
        GM_setValue('cbDayAutoOff_' + action, false);
        if (action in st) { st[action] = GM_getValue('cbDayWasOn_' + action, true); saveSt(); repaintRibbon(); }
        console.log(`${APP_TAG}[LIMIT] ${action} daily limit reset — re-enabled`);
        tgMsg('jail', `♻️ <b>${DAILY_ACTIONS[action].label} reset</b>\n${st.player||'?'} | new game-day, back on`);
      }
      return 0;
    }
    return GM_getValue('cbDayCount_' + action, 0);
  }

  function dailyLimitReached(action) {
    if (!cfg.dailyLimitOn) return false;
    const lim = dailyLimitOf(action);
    if (!lim) return false;
    return getDailyCount(action) >= lim;
  }

  function incDailyCount(action) {
    if (!DAILY_ACTIONS[action]) return;
    const n = getDailyCount(action) + 1;    // getDailyCount also handles rollover
    GM_setValue('cbDayCount_' + action, n);
    if (rankState.name) GM_setValue('cbDayRank_' + action, rankState.name);

    const lim = dailyLimitOf(action);
    if (cfg.dailyLimitOn && lim && n >= lim) {
      GM_setValue('cbDayWasOn_' + action, !!st[action]);
      GM_setValue('cbDayAutoOff_' + action, true);
      if (action in st) { st[action] = false; saveSt(); repaintRibbon(); }
      console.log(`${APP_TAG}[LIMIT] ${action} hit ${n}/${lim} — disabled until next game-day`);
      tgMsg('jail', `🛑 <b>${DAILY_ACTIONS[action].label} limit</b>\n${st.player||'?'} | ${n}/${lim} reached, off till tomorrow`);
    }
    try { updateDailyCountUI(); } catch(_){}
  }

  /* Panel strip: "👜 128 · 🏎️ 41 · 🍺 12", or "👜 128/500" where a limit applies.
   * Shown whenever anything has been done today, limits on or off — the count is
   * the point, the limit is optional decoration. */
  function updateDailyCountUI() {
    if (!_shadow) return;
    const el = _shadow.querySelector('#jb-daily-counts');
    const row = _shadow.querySelector('#jb-daily-row');
    if (!el || !row) return;
    const parts = [];
    for (const [action, d] of Object.entries(DAILY_ACTIONS)) {
      const n = getDailyCount(action);
      const lim = dailyLimitOf(action);
      const capped = cfg.dailyLimitOn && lim > 0;
      if (!n && !capped) continue;               // nothing worth a slot yet
      const icon = d.label.split(' ')[0];
      if (capped) {
        const pct = n / lim;
        const clr = pct >= 1 ? 'var(--jb-danger)' : pct >= 0.9 ? 'var(--jb-warning)' : 'var(--jb-text-sec)';
        parts.push(`<span style="color:${clr}">${icon} ${n}/${lim}</span>`);
      } else {
        parts.push(`<span style="color:var(--jb-text-sec)">${icon} ${n}</span>`);
      }
    }
    row.style.display = parts.length ? 'flex' : 'none';
    el.innerHTML = parts.join(' · ');
    // The settings readout is only worth building while it's on screen.
    try {
      const m = _shadow.querySelector('#jb-settings-modal');
      if (m && m.classList.contains('open')) renderDailyResearch();
    } catch(_){}
  }

  /* Settings readout: today, the best day recorded, and the best day recorded at
   * your CURRENT rank, plus a by-day table. This is the whole point of counting
   * unconditionally — you set a limit from evidence rather than from a guess, and
   * you re-read it after each rank-up. */
  function renderDailyResearch() {
    if (!_shadow) return;
    const host = _shadow.querySelector('#jb-daily-research');
    if (!host) return;
    const rank = rankState.name || '';
    const acts = Object.keys(DAILY_ACTIONS);

    const head = `<div style="display:grid;grid-template-columns:52px 1fr 1fr 1fr;gap:2px 6px;font-size:9px">
      <span style="color:var(--jb-text-ter)"></span>
      <span style="color:var(--jb-text-sec);font-weight:600">Today</span>
      <span style="color:var(--jb-text-sec);font-weight:600">Best</span>
      <span style="color:var(--jb-text-sec);font-weight:600" title="${esc(rank||'rank unknown')}">This rank</span>`;
    const rows = acts.map(a => {
      const p = dailyPeak(a, rank);
      const icon = DAILY_ACTIONS[a].label.split(' ')[0];
      return `<span>${icon}</span>
        <span style="font-weight:600">${getDailyCount(a)}</span>
        <span>${p.all || '—'}${p.days ? ` <span style="color:var(--jb-text-ter)">(${p.days}d)</span>` : ''}</span>
        <span>${p.atRank || '—'}${p.rankDays ? ` <span style="color:var(--jb-text-ter)">(${p.rankDays}d)</span>` : ''}</span>`;
    }).join('');

    // Merge the per-action histories into one row per day.
    const byDay = {};
    acts.forEach(a => dailyHist(a).forEach(r => {
      if (!byDay[r.day]) byDay[r.day] = { day:r.day, rank:r.rank || '' };
      byDay[r.day][a] = r.n;
      if (!byDay[r.day].rank && r.rank) byDay[r.day].rank = r.rank;
    }));
    const days = Object.values(byDay).sort((x, y) => y.day.localeCompare(x.day)).slice(0, 14);
    const table = days.length
      ? `<div style="margin-top:6px;max-height:110px;overflow-y:auto;font-size:9px">
           <div style="display:grid;grid-template-columns:60px 30px 30px 30px 1fr;gap:1px 4px">
             <span style="color:var(--jb-text-sec);font-weight:600">Day</span>
             ${acts.map(a => `<span style="color:var(--jb-text-sec);font-weight:600">${DAILY_ACTIONS[a].label.split(' ')[0]}</span>`).join('')}
             <span style="color:var(--jb-text-sec);font-weight:600">Rank</span>
             ${days.map(d => `<span style="color:var(--jb-text-ter)">${esc(d.day.slice(5))}</span>
               ${acts.map(a => `<span>${d[a] != null ? d[a] : '—'}</span>`).join('')}
               <span style="color:var(--jb-text-ter)">${esc(d.rank || '?')}</span>`).join('')}
           </div>
         </div>`
      : `<div style="margin-top:6px;color:var(--jb-text-ter);font-size:9px">No finished days recorded yet — the first archives at game midnight.</div>`;

    host.innerHTML = head + rows + '</div>' + table;
  }

  /* === XP UI + CHARTS === */

  function _xpRate() {
    const mins = (Date.now() - xpState.sessionStart) / 60000;
    return mins >= 2 && xpState.sessionGain > 0
      ? ((xpState.sessionGain / mins) * 60).toFixed(1)
      : null;
  }

  function _fmtAge(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  // Front-panel summary line (cheap; runs on each xp read + timer tick)
  function updateXpUI() {
    if (!_shadow) return;
    const totalEl = _shadow.querySelector('#jb-xp-total');
    const sessEl  = _shadow.querySelector('#jb-xp-session');
    const rateEl  = _shadow.querySelector('#jb-xp-rate');
    const lastEl  = _shadow.querySelector('#jb-xp-last');
    if (totalEl) totalEl.textContent = xpState.total > 0 ? xpState.total.toFixed(2) : '—';
    if (sessEl)  sessEl.textContent  = xpState.sessionGain > 0 ? `+${xpState.sessionGain}` : '—';
    if (rateEl)  { const r = _xpRate(); rateEl.textContent = r ? `${r}/hr` : '…'; }
    if (lastEl) {
      const h = xpState.history[0];
      lastEl.textContent = h ? (h.rankUp ? '⭐ rank up' : `${h.icon} +${h.gained}`) : '—';
    }

    // Rank line + progress bar (from the status bar, enriched by perRankReq)
    const r = resolveRank();
    const nameEl = _shadow.querySelector('#jb-rank-name');
    const pctEl  = _shadow.querySelector('#jb-rank-pct');
    const nextEl = _shadow.querySelector('#jb-rank-tonext');
    const barEl  = _shadow.querySelector('#jb-rank-bar');
    if (nameEl) nameEl.textContent = r.name || '—';
    if (pctEl)  pctEl.textContent = r.pct > 0 ? `${r.pct.toFixed(1)}% to next` : '—';
    if (nextEl) {
      if (r.toNext != null) nextEl.textContent = `${r.withinXp}/${(r.withinXp + r.toNext).toFixed(r.confident?2:1)} XP${r.confident?'':' ~'}`;
      else nextEl.textContent = '';
    }
    if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, r.pct))}%`;

    // If the charts modal is open, refresh it live too
    const m = _shadow.querySelector('#jb-xp-modal');
    if (m && m.classList.contains('open')) renderXpCharts();
  }

  // Build the full charts modal contents (SVG line + bar chart + history list)
  function renderXpCharts() {
    if (!_shadow) return;
    const rate = _xpRate();

    const setTxt = (sel, txt) => { const e = _shadow.querySelector(sel); if (e) e.textContent = txt; };
    setTxt('#jb-xpm-total', xpState.total > 0 ? xpState.total.toFixed(2) : '—');
    setTxt('#jb-xpm-session', xpState.sessionGain > 0 ? `+${xpState.sessionGain}` : '—');
    setTxt('#jb-xpm-rate', rate ? `${rate}/hr` : '…');
    setTxt('#jb-xpm-age', _fmtAge(Date.now() - xpState.sessionStart));

    // ── Rank progress + ladder ──────────────────────────────────────
    const rankHost = _shadow.querySelector('#jb-xp-rank');
    if (rankHost) {
      const r = resolveRank();
      const pct = Math.max(0, Math.min(100, r.pct || 0));
      const absLine = (r.toNext != null)
        ? `<div style="font-size:10px;color:var(--jb-text-sec);margin-top:3px">${r.withinXp} / ${(r.withinXp + r.toNext).toFixed(r.confident?2:1)} XP this rank · <b>${r.toNext}${r.confident?'':'~'}</b> to next${r.confident?'':' <span style="color:var(--jb-text-ter)">(approx)</span>'}</div>`
        : `<div style="font-size:10px;color:var(--jb-text-ter);margin-top:3px">Collecting XP data to estimate XP-to-next…</div>`;
      // Ladder: each rank step, its XP cost + cumulative total; highlight current step
      const ladder = perRankReq.map((req, i) => {
        const isCur = i === r.idx;
        const cum = cumRankReq[i];
        // RANKS[i+1] is the rank this step unlocks (RANKS[0] is the Scum floor at 0 XP).
        const nm = (RANKS[i+1] && RANKS[i+1][0]) || `Step ${i+1}`;
        return `<div style="display:flex;justify-content:space-between;font-size:9px;padding:1px 4px;border-radius:2px;${isCur?'background:var(--jb-accent);color:#fff;font-weight:600':'color:var(--jb-text-ter)'}">
          <span>${esc(nm)}${isCur?' ◄':''}</span>
          <span>${req} XP <span style="opacity:.6">(Σ ${cum})</span></span>
        </div>`;
      }).join('');
      rankHost.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:baseline">
           <span style="font-weight:600">${r.name || '—'}</span>
           <span style="font-size:10px;color:var(--jb-text-sec)">${r.pct>0?pct.toFixed(1)+'% to next':''}</span>
         </div>
         <div style="background:var(--jb-border);border-radius:3px;height:8px;overflow:hidden;margin-top:4px">
           <div style="height:100%;width:${pct}%;background:var(--jb-accent);border-radius:3px"></div>
         </div>
         ${absLine}
         <div style="margin-top:6px;max-height:120px;overflow-y:auto">${ladder}</div>`;
    }

    // ── Cumulative XP line chart (SVG) ──────────────────────────────
    const lineHost = _shadow.querySelector('#jb-xp-line');
    if (lineHost) {
      const s = xpState.samples;
      if (s.length < 2) {
        lineHost.innerHTML = `<div class="jb-sub" style="text-align:center;padding:30px 0;color:var(--jb-text-ter)">Collecting data… (need a couple of XP reads)</div>`;
      } else {
        const W = 312, H = 88, pad = 4;
        const xs = s.map(p => p.t), ys = s.map(p => p.total);
        const minX = xs[0], maxX = xs[xs.length-1];
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
        const px = t => pad + ((t - minX) / spanX) * (W - 2*pad);
        const py = v => (H - pad) - ((v - minY) / spanY) * (H - 2*pad);
        let d = '';
        s.forEach((p, i) => { d += (i === 0 ? 'M' : 'L') + px(p.t).toFixed(1) + ',' + py(p.total).toFixed(1) + ' '; });
        // Area fill path
        const areaD = d + `L${px(maxX).toFixed(1)},${(H-pad).toFixed(1)} L${px(minX).toFixed(1)},${(H-pad).toFixed(1)} Z`;
        lineHost.innerHTML =
          `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
             <path d="${areaD}" fill="var(--jb-accent)" opacity="0.13"/>
             <path d="${d.trim()}" fill="none" stroke="var(--jb-accent)" stroke-width="1.5"/>
           </svg>
           <div class="jb-sub" style="display:flex;justify-content:space-between;font-size:9px;color:var(--jb-text-ter);margin-top:2px">
             <span>+${(maxY-minY).toFixed(2)} over ${_fmtAge(maxX-minX)}</span>
             <span>${ys[ys.length-1].toFixed(2)}</span>
           </div>`;
      }
    }

    // ── XP by action (horizontal bars) ──────────────────────────────
    const barsHost = _shadow.querySelector('#jb-xp-bars');
    if (barsHost) {
      const entries = XP_ACTIONS
        .map(a => ({ a, v: xpState.perAction[a] || 0 }))
        .filter(e => e.v > 0)
        .sort((x, y) => y.v - x.v);
      const otherV = xpState.perAction.other || 0;
      if (otherV > 0) entries.push({ a: 'other', v: otherV });
      if (!entries.length) {
        barsHost.innerHTML = `<div class="jb-sub" style="text-align:center;color:var(--jb-text-ter)">No XP gained yet this session.</div>`;
      } else {
        const max = Math.max(...entries.map(e => e.v));
        barsHost.innerHTML = entries.map(e => {
          const pct = max > 0 ? (e.v / max) * 100 : 0;
          return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:10px">
            <span style="width:54px;flex:0 0 auto">${ACTION_ICON[e.a]||'⚡'} ${e.a}</span>
            <span style="flex:1;background:var(--jb-border);border-radius:3px;height:11px;position:relative;overflow:hidden">
              <span style="position:absolute;left:0;top:0;bottom:0;width:${pct.toFixed(1)}%;background:var(--jb-accent);border-radius:3px"></span>
            </span>
            <span style="width:48px;flex:0 0 auto;text-align:right;font-weight:600">+${e.v.toFixed(2)}</span>
          </div>`;
        }).join('');
      }
    }

    /* ── Recent gains list ──────────────────────────────────────────
     * Shows up to 120 of the stored 250, and marks each figure with its source.
     * An entry from the status bar is a ROUNDED bundle, not one action's gain —
     * see onExperienceRead. Without the marker a "+0.3 booze" sitting among
     * "+0.06 booze" reads as wild inconsistency in the game; with it, it reads
     * as what it is: several actions' XP surfacing in one lump because the bar
     * cannot resolve anything finer. */
    const histHost = _shadow.querySelector('#jb-xp-hist');
    if (histHost) {
      if (!xpState.history.length) {
        histHost.innerHTML = `<div class="jb-sub" style="text-align:center;color:var(--jb-text-ter)">No gains recorded yet.</div>`;
      } else {
        const rows = xpState.history.slice(0, 120).map(h => {
          const t = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          if (h.rankUp) {
            return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-top:1px solid var(--jb-border)">
              <span>⭐ <b style="color:var(--jb-accent)">RANK UP</b> <span style="color:var(--jb-text-sec)">${esc(h.label||'')}</span></span>
              <span style="color:var(--jb-text-ter)">${t}</span>
            </div>`;
          }
          /* h.src is absent on anything recorded before 242 — those are shown
           * plain rather than guessed at. */
          const bar = h.src === 'bar';
          const mark = bar
            ? `<span title="From the status bar — rounded to its resolution, so this covers several actions, not just this one" style="color:var(--jb-warning)">≈</span>`
            : '';
          /* A reading that covered more than one action. The gain is real, the
           * LABEL is the last action of several — so say what it really covered
           * rather than implying that one action was worth the whole amount. */
          const many = h.n > 1
            ? `<span title="This one reading covered ${h.n} actions: ${esc(h.mix||'')}. The total is right; it is credited to the last of them because there is no way to split it." style="color:var(--jb-warning)">⊕${h.n}</span> `
            : '';
          /* Inferred = nothing claimed the reading but a jail bust was in the
           * window, so we attributed it to jail. Worth distinguishing from a
           * measured attribution. */
          const inf = h.inf
            ? `<span title="Inferred: no action claimed this reading, but a jail bust happened in the window. Jail deliberately doesn't claim readings, so leftover XP alongside a bust is taken as jail's." style="color:var(--jb-text-ter)">?</span>`
            : '';
          /* Reconciled against the game's own completion mail — the most certain
           * attribution in the list, so it gets the strongest mark. */
          const pay = h.pay
            ? `<span title="Confirmed by the game's own completion notification${h.split ? `, with ${h.split} XP split back to the jail busts in the same reading at the learned per-bust rate` : ''}." style="color:var(--jb-success)">✓</span> `
            : '';
          const label = h.n > 1
            ? `<span style="color:var(--jb-text-sec)">${esc(h.mix || h.action)}</span>${inf}`
            : `<span style="color:var(--jb-text-sec)">${h.action}</span>${inf}`;
          const amountClr = h.pay ? 'var(--jb-success)'
                          : (bar || h.n > 1) ? 'var(--jb-warning)' : 'var(--jb-success)';
          return `<div style="display:flex;justify-content:space-between;padding:1px 0;gap:6px">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pay}${many}${h.icon} ${label}</span>
            <span style="flex:0 0 auto">${mark}<b style="color:${amountClr}">+${h.gained}</b>${h.split ? `<span style="color:var(--jb-text-ter)" title="split back to jail"> −${h.split}</span>` : ''} <span style="color:var(--jb-text-ter)">${t}</span></span>
          </div>`;
        }).join('');
        const step = barXpStep();
        const clean = xpState.cleanReads || 0, bund = xpState.bundledReads || 0;
        const pct = (clean + bund) ? Math.round((clean / (clean + bund)) * 100) : null;
        const attrib = pct === null ? ''
          : ` <b style="color:${pct >= 80 ? 'var(--jb-success)' : 'var(--jb-warning)'}">${pct}%</b> of readings covered a single action — the rest are shared, so treat the per-action bars as approximate below that.`;
        const jr = jailAvgXp();
        const jailRate = jr > 0
          ? ` Jail measures <b>${jr.toFixed(3)}</b> XP per bust over ${xpState.jailSamples} clean reading${xpState.jailSamples===1?'':'s'} — that rate is what gets subtracted when a payout shares a reading with busts.`
          : '';
        const note = `<div class="jb-sub" style="border-top:1px solid var(--jb-border);margin-top:4px;padding-top:3px;font-size:9px;color:var(--jb-text-ter)">
          <b style="color:var(--jb-warning)">≈</b> = read from the status bar, rounded to ${step ? '±' + step + ' XP' : 'its resolution'} at this rank.
          <b style="color:var(--jb-warning)">⊕n</b> = one reading covering n actions; the amount is right but it is credited to the last of them.
          <b style="color:var(--jb-success)">✓</b> = matched to the game's own OC/DTM completion mail — the most certain line here.
          <b style="color:var(--jb-text-ter)">?</b> = inferred jail (nothing claimed it, but a bust was in the window).
          Unmarked figures are exact and cover a single action.${attrib}${jailRate}
          Showing ${Math.min(120, xpState.history.length)} of ${xpState.history.length} kept.
        </div>`;
        histHost.innerHTML = rows + note;
      }
    }
  }

  function doJailbreak() {
    if (!st.jail || st.acting || st.inJail || paused) return;
    /* Staff online and "no jail on Mod" enabled — stand down. Checked here as well
     * as in mainLoop so a bust can never slip through a path that reaches
     * doJailbreak directly. */
    if (modJailBlocked()) return;
    if (jailLimitReached()) {
      // Safety: should already be off, but double-check
      if (st.jail) { st.jail = false; saveSt(); }
      return;
    }
    const now = Date.now();
    if (!cooldownElapsed('jail', st.lastJail, cfg.jailInt)) return;
    if (curPage() !== 'jail') { safeNav('/authenticated/jail.aspx?'+Date.now()); return; }
    const links = [...document.querySelectorAll('a[id*="btnBreak"]')].filter(a => !a.hasAttribute('disabled') && a.href && a.href.includes('javascript:'));
    if (links.length > 0) {
      st.acting = true; st.action = 'jailbreak'; GM_setValue('cbActStart', now);
      snapshotXPQuiet('jail');   // never steals a reading — see snapshotXPQuiet
      links[Math.floor(Math.random()*links.length)].click();
      // This is a real attempt (success or fail) — count it
      incJailCount();
      updateJailCountUI();
      st.lastJail = now; markActed('jail', cfg.jailInt); saveSt();
      /* RELEASE THE GUARD, BUT DO NOT NAVIGATE (2000.286).
       *
       * The break link is an ASP.NET postback: it reloads jail.aspx by itself.
       * The safeNav that used to sit here was therefore a SECOND full page load
       * for every bust — and jail is over half of all the traffic Jarvis makes,
       * so it was up to 654 wasted page loads an hour on its own.
       *
       * Worse than wasteful: it fired 500-900ms after the click, and safeNav
       * adds another 150-500ms before assigning window.location. On any server
       * response slower than ~650-1750ms that assignment CANCELLED the in-flight
       * POST, so the bust never happened and we paid two requests for nothing.
       * That is a plausible part of what 'jail is glitchy' looked like.
       *
       * Nothing breaks if the postback ever turns out to be a partial one that
       * does not reload: doJailbreak simply clicks again once the cooldown
       * elapses, and checkStuck() releases the guard after 15s regardless. */
      setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 500 + Math.floor(Math.random()*400));
    } else { st.lastJail = now; markActed('jail', cfg.jailInt); saveSt(); }
  }

  /* === BACKGROUND HEAL ===
   * The old auto-health navigated to credits.aspx, clicked Buy, reloaded, and
   * repeated — several full page loads to recover 10% at a time, all of it
   * yanking Jarvis away from whatever it was doing. Worse, it abandoned the
   * page mid-action, so a heal during a crime cycle cost the crime too.
   *
   * This does the same purchases as same-origin POSTs: GET credits.aspx, lift
   * __VIEWSTATE / __EVENTVALIDATION / __VIEWSTATEGENERATOR out of the response,
   * POST them back with btnBuyHealth, repeat until health reads 100%. No
   * navigation at all, so it can run from any page, including mid-cooldown.
   *
   * Guards: single-flight, hard try cap, stops the moment the response says you
   * can't afford it. Read health back from each response rather than trusting an
   * assumed +10 per buy, so a changed heal amount can't loop it forever.
   */
  const HEAL_PATH  = '/authenticated/credits.aspx';
  const HEAL_TRIES = 30;
  const HEAL_GAP_MS = 450;

  let _healActive = false;

  function _healKeys(html) {
    const d = new DOMParser().parseFromString(html || '', 'text/html');
    const vs  = d.getElementById('__VIEWSTATE')?.value;
    const ev  = d.getElementById('__EVENTVALIDATION')?.value;
    const gen = d.getElementById('__VIEWSTATEGENERATOR')?.value;
    if (!vs || !ev) return null;
    return { vs, ev, gen, doc: d };
  }

  function _healHpOf(doc) {
    const t = doc.getElementById('ctl00_userInfo_lblhealth')?.textContent || '';
    const n = parseInt(t.replace('%', '').trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  function _healCreditsOf(doc) {
    const t = doc.getElementById('ctl00_userInfo_lblcredits')?.textContent || '';
    const n = parseInt(t.replace(/[,$]/g, '').trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  async function bgHeal(target) {
    if (isHalted()) return false;
    if (_healActive) return false;
    _healActive = true;
    const want = Math.max(1, Math.min(100, Number(target) || 100));
    let healed = 0, startHp = null;
    try {
      for (let i = 0; i < HEAL_TRIES; i++) {
        const r = await fetch(HEAL_PATH, { method:'GET', credentials:'same-origin', cache:'no-store' });
        if (!r.ok) { console.warn(APP_TAG, '[HEAL] GET failed', r.status); break; }
        const k = _healKeys(await r.text());
        if (!k) { console.warn(APP_TAG, '[HEAL] ViewState unreadable — aborting'); break; }

        const hp = _healHpOf(k.doc);
        if (startHp === null) startHp = hp;
        if (hp !== null && hp >= want) break;

        const cr = _healCreditsOf(k.doc);
        if (cr !== null && cr < 10) { console.log(APP_TAG, '[HEAL] Out of credits — stopping'); break; }

        const p = new URLSearchParams();
        p.append('__VIEWSTATE', k.vs);
        p.append('__EVENTVALIDATION', k.ev);
        if (k.gen) p.append('__VIEWSTATEGENERATOR', k.gen);
        p.append('ctl00$main$btnBuyHealth', 'Buy');

        const pr = await fetch(HEAL_PATH, {
          method:'POST', credentials:'same-origin',
          headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
          body: p.toString()
        });
        if (!pr.ok) { console.warn(APP_TAG, '[HEAL] POST failed', pr.status); break; }
        const ph = await pr.text();
        if (/don'?t have enough (credits|money)/i.test(ph)) {
          console.log(APP_TAG, '[HEAL] Not enough credits — stopping');
          break;
        }
        healed++;
        await wait(HEAL_GAP_MS);
      }
    } catch (e) {
      console.warn(APP_TAG, '[HEAL] error:', e && e.message ? e.message : e);
    } finally {
      _healActive = false;
      st.lastHealth = Date.now(); st.buyHealth = false; saveSt();
      if (healed > 0) {
        console.log(`${APP_TAG}[HEAL] ${healed} purchase(s) from ${startHp}%`);
        tgMsg('health', `💊 <b>Healed</b>\n${st.player||'?'} | ${startHp}% → target ${want}% (${healed} buy${healed===1?'':'s'})`);
      }
    }
    return healed > 0;
  }

  function checkHealth() {
    if (!st.health || paused) return;
    const hp = getHp();
    if (hp >= Math.min(100, cfg.targetHealth || 100)) { st.buyHealth = false; saveSt(); return; }

    /* Background path: no navigation, so it does NOT need st.acting to be clear
     * and cannot strand an action mid-flight. Fire and let it run. */
    if (cfg.bgHealOn) {
      if (_healActive) return;
      /* Rate limit. getHp() reads the CURRENT page's status bar, which is server
       * rendered and therefore frozen until the next page load — after a
       * background heal it still shows the old value, so without this the loop
       * would re-fire a heal every tick on stale data. bgHeal re-reads health
       * from its own fetch and exits immediately when already full, so each
       * repeat costs only a wasted GET, but at one every couple of seconds that
       * still adds up. Reuse healthInt as the gap. */
      const gap = Math.max(10, Number(cfg.healthInt) || 30) * 1000;
      if (st.lastHealth && (Date.now() - st.lastHealth) < gap) return;
      const cr = getCredits();
      if (cr > 0 && cr < 10) { st.health = false; saveSt(); return; }
      st.lastHealth = Date.now(); saveSt();   // claim the slot before the await
      bgHeal(cfg.targetHealth || 100);
      return;
    }

    // Legacy navigation path, kept for anyone who wants the old visible behaviour.
    if (st.acting) return;
    const cr = getCredits();
    if (cr < 10) { st.health = false; saveSt(); return; }
    if (!/\/authenticated\/credits\.aspx$/i.test(location.pathname)) {
      st.buyHealth = true; saveSt(); setTimeout(() => location.href = '/authenticated/credits.aspx', 1500); return;
    }
    if (st.buyHealth) {
      const btn = document.querySelector('#ctl00_main_btnBuyHealth');
      if (btn) {
        st.acting = true; st.action = 'health'; GM_setValue('cbActStart', Date.now());
        btn.click();
        setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); st.lastHealth = Date.now(); if (hp+10 >= 100) st.buyHealth = false; saveSt(); location.reload(); }, 1500);
      } else { st.buyHealth = false; saveSt(); }
    }
  }


  /* === GARAGE === */

  const CARS = [
    { name:'Bentley Arnage',        def:'OC',    locked:true },
    { name:'Audi RS6 Avant',        def:'OC',    locked:true },
    { name:'Bugatti Chiron SS',     def:'Manual', locked:true, manual:true },
    { name:'Bentley Continental',   def:'Crush' },
    { name:'Lamborghini Aventador', def:'Crush' },
    { name:'Lamborghini Huracan',   def:'Crush' },
    { name:'Lamborghini Gallardo',  def:'Crush' },
    { name:'Ferrari Purosangue',    def:'Crush' },
    { name:'Mercedes-Benz G-Wagon', def:'Crush' },
    { name:'Tesla Cybertruck',      def:'Crush' },
    { name:'Dodge Challenger Hellcat', def:'Sell' },
    { name:'Porsche 911 Turbo',     def:'Sell' },
    { name:'Audi A8',               def:'Sell' },
    { name:'Audi R8',               def:'Sell' },
    { name:'Mercedes-Benz SLK 55',  def:'Sell' },
    { name:'BMW X5M',               def:'Sell' },
    { name:'Chevrolet Corvette',    def:'Sell' },
    { name:'Porsche Cayenne',       def:'Sell' }
  ];

  function _normCar(s) { return String(s||'').toLowerCase().replace(/[-.\s]+/g,''); }
  function carCat(name) {
    const n = _normCar(name); if(!n) return null;
    const known = CARS.find(c => _normCar(c.name) === n);
    if (known && known.locked) return known.def;
    const ov = st.carCats||{};
    for (const [k,v] of Object.entries(ov)) if (_normCar(k) === n) return v;
    return known ? known.def : null;
  }
  function isOcCar(n) { return carCat(n) === 'OC'; }
  function isCrushCar(n) { return carCat(n) === 'Crush'; }
  function isManualCar(n) { const k = CARS.find(c => _normCar(c.name) === _normCar(n)); return !!(k && k.manual); }

  function escRe(s) { return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function readRow(row) {
    const txt = (row ? row.textContent : '').replace(/\s+/g,' ').trim();
    const cells = row ? [...row.children] : [];
    let name = '';
    const hit = CARS.slice().sort((a,b)=>b.name.length-a.name.length).find(c => new RegExp(`(^|\\b)${escRe(c.name)}($|\\b)`,'i').test(txt));
    if (hit) name = hit.name;
    else { for (const cell of cells) { const t = (cell.textContent||'').replace(/\s+/g,' ').trim(); if(!t||/^\d+%$/.test(t)||/^\$?[\d,]+$/.test(t)||/^(sell|repair|crush|location|value|damage)$/i.test(t)||cell.querySelector('input[type="checkbox"]')) continue; name = t; break; } }
    let dmg = 0;
    const pm = txt.match(/(\d{1,3})\s*%/);
    if (pm) dmg = Math.max(0, Math.min(100, parseInt(pm[1],10)||0));
    return { name, dmg, parsed:!!pm, cb:row?row.querySelector('input[type="checkbox"]'):null, txt };
  }

  // Gifted model cooldown
  const LS_GIFT_PRE = 'cbGifted_';
  const LS_CRUSH_NAME = 'cbPendCrush';
  const LS_CRUSH_FULL = 'cbCrushFull';
  const LS_CRUSH_LOOP = 'cbCrushLoop';
  const CRUSH_ERR_RE = /you can only crush cars that you stole yourself/i;
  const CRUSH_FULL_RE = /crusher queue full|daily capacity reached/i;
  const CRUSH_FULL_PAUSE = 60*60*1000;
  const GIFT_CD = 30*60*1000;
  const CRUSH_LOOP_MAX = 3;

  function _giftKey() { return LS_GIFT_PRE+(st.player||'unknown'); }
  function getGifts() { try { return JSON.parse(localStorage.getItem(_giftKey())||'{}'); } catch(_) { return {}; } }
  function saveGifts(o) { const now = Date.now(), c = {}; for(const [k,v] of Object.entries(o)) if(typeof v==='number'&&v>now) c[k]=v; try{localStorage.setItem(_giftKey(),JSON.stringify(c));}catch(_){} }
  function markGifted(n) { if(!n)return; const o=getGifts(); o[n]=Date.now()+GIFT_CD; saveGifts(o); }
  function isGifted(n) { if(!n)return false; const o=getGifts(); const u=o[n]; return typeof u==='number'&&u>Date.now(); }

  function disableCrusher(reason) {
    st.crusherOwned = false; st.crusher = false; saveSt();
    localStorage.removeItem(LS_CRUSH_NAME); localStorage.removeItem(LS_CRUSH_LOOP);
    tgMsg('crusher', `⚙️ <b>Crusher Off</b>\n${st.player||'?'} | ${reason}`);
  }

  function doGarage() {
    if (!st.garage || st.acting || st.inJail || paused) return;
    const now = Date.now();
    if (now - st.lastGarage < cfg.garageInt*1000) return;
    if (curPage() !== 'garage') { safeNav('/authenticated/playerproperty.aspx?p=g&'+Date.now()); return; }

    const table = document.getElementById('ctl00_main_gvCars');
    if (!table) { st.lastGarage = now; st.acting = false; st.action = ''; GM_setValue('cbActStart',0); saveSt(); return; }

    const rows = [...table.querySelectorAll('tr')].slice(1);
    const carRows = rows.filter(r => r.querySelector('input[type="checkbox"]'));
    if (!carRows.length) { st.lastGarage = now; saveSt(); return; }

    // Blocking error gate
    { const errEl = document.getElementById('ctl00_lblMsg');
      const errTxt = (errEl && errEl.classList.contains('TMNErrorFont')) ? (errEl.textContent||'').trim() : '';
      const isKnown = errTxt && (CRUSH_ERR_RE.test(errTxt) || CRUSH_FULL_RE.test(errTxt));
      if (errTxt && !isKnown) { localStorage.removeItem(LS_CRUSH_NAME); st.lastGarage = now; saveSt(); return; }
    }

    st.acting = true; st.action = 'garage'; GM_setValue('cbActStart', now);

    // Crusher logic
    if (st.crusher && st.crusherOwned !== false) {
      const crushBtn = document.getElementById('ctl00_main_btnSendtoCrusher');
      const usable = crushBtn && !crushBtn.disabled && !crushBtn.hasAttribute('disabled');
      if (!usable) { disableCrusher(crushBtn ? 'button disabled' : 'button missing'); }
      else {
        if (st.crusherOwned !== true) { st.crusherOwned = true; saveSt(); localStorage.removeItem(LS_CRUSH_LOOP); }

        // Error recovery
        try {
          const errMsg = document.getElementById('ctl00_lblMsg');
          const msgTxt = errMsg ? (errMsg.textContent||'').trim() : '';
          const pendName = localStorage.getItem(LS_CRUSH_NAME);
          if (msgTxt && CRUSH_FULL_RE.test(msgTxt)) {
            localStorage.setItem(LS_CRUSH_FULL, String(Date.now()+CRUSH_FULL_PAUSE));
            localStorage.removeItem(LS_CRUSH_LOOP); localStorage.removeItem(LS_CRUSH_NAME);
            if (st.crusherOwned !== true) { st.crusherOwned = true; saveSt(); }
          } else if (pendName) {
            if (msgTxt && CRUSH_ERR_RE.test(msgTxt)) {
              if (st.crusherOwned !== true) { st.crusherOwned = true; saveSt(); }
              localStorage.removeItem(LS_CRUSH_LOOP);
              markGifted(pendName);
              tgMsg('crusher', `🚫 <b>Crusher Reject</b>\n${st.player||'?'} | ${pendName} (gifted)`);
            } else if (msgTxt) {
              const isErr = errMsg && errMsg.classList.contains('TMNErrorFont') && /crusher/i.test(msgTxt);
              if (isErr && st.crusherOwned !== true) {
                const cnt = parseInt(localStorage.getItem(LS_CRUSH_LOOP)||'0',10)+1;
                localStorage.setItem(LS_CRUSH_LOOP, String(cnt));
                if (cnt >= CRUSH_LOOP_MAX) { disableCrusher(`${CRUSH_LOOP_MAX} fails`); localStorage.removeItem(LS_CRUSH_NAME); return; }
              } else { localStorage.removeItem(LS_CRUSH_LOOP); if(st.crusherOwned!==true){st.crusherOwned=true;saveSt();} }
            } else { localStorage.removeItem(LS_CRUSH_LOOP); if(st.crusherOwned!==true){st.crusherOwned=true;saveSt();} }
            localStorage.removeItem(LS_CRUSH_NAME);
          }
        } catch(_) { localStorage.removeItem(LS_CRUSH_NAME); }

        const fullUntil = parseInt(localStorage.getItem(LS_CRUSH_FULL)||'0',10);
        const crushPaused = fullUntil > Date.now();
        if (fullUntil > 0 && !crushPaused) localStorage.removeItem(LS_CRUSH_FULL);

        if (!crushPaused) {
          let chosen = null, chosenName = '';
          for (const row of carRows) {
            const info = readRow(row);
            if (!info.cb || !info.name || isManualCar(info.name) || !isCrushCar(info.name) || isOcCar(info.name)) continue;
            if (!info.parsed || info.dmg <= 0 || isGifted(info.name)) continue;
            chosen = row; chosenName = info.name; break;
          }
          if (chosen) {
            table.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
            const cb = chosen.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = true;
            const ticked = [...table.querySelectorAll('input[type="checkbox"]')].filter(c=>c.checked).length;
            if (ticked !== 1) { localStorage.removeItem(LS_CRUSH_NAME); }
            else {
              try { localStorage.setItem(LS_CRUSH_NAME, chosenName); } catch(_){}
              crushBtn.click();
              setTimeout(() => { st.acting=false; st.action=''; st.lastGarage=Date.now(); st.refresh=true; GM_setValue('cbActStart',0); saveSt(); window.location.href='/authenticated/crimes.aspx?'+Date.now(); }, rndDelay(DLY.normal));
              return;
            }
          }
        }
      }
    }

    // Sell remaining
    const noOwn = st.crusherOwned === false;
    let sellCt = 0;
    carRows.forEach(row => {
      const info = readRow(row);
      if (!info.cb) return;
      if (isOcCar(info.name) || isManualCar(info.name)) return;
      if (isCrushCar(info.name)) {
        if (isGifted(info.name) || noOwn) { info.cb.checked = true; sellCt++; }
        return;
      }
      info.cb.checked = true; sellCt++;
    });
    if (sellCt > 0) {
      const sellBtn = document.getElementById('ctl00_main_btnSellSelected');
      /* No snapshotXP here: selling cars earns NO XP (confirmed by the user,
       * 2000.246). Claiming the next reading for it would have credited garage
       * with whatever the following crime or bust earned — and with the no-XP
       * limiter on, garage would eventually disable itself for "gaining no XP",
       * which was never a fault. */
      if (sellBtn) { sellBtn.click(); setTimeout(() => { st.acting=false; st.action=''; st.lastGarage=Date.now(); st.refresh=true; GM_setValue('cbActStart',0); saveSt(); window.location.href='/authenticated/crimes.aspx?'+Date.now(); }, rndDelay(DLY.normal)); return; }
    }

    // Repair VIP
    for (const row of carRows) {
      const info = readRow(row);
      if (info.cb && isOcCar(info.name) && info.dmg > 0) {
        table.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
        info.cb.checked = true;
        const ticked = [...table.querySelectorAll('input[type="checkbox"]')].filter(c=>c.checked).length;
        if (ticked !== 1) continue;
        const repBtn = document.getElementById('ctl00_main_btnRepair');
        if (repBtn) { repBtn.click(); setTimeout(() => { st.acting=false; st.action=''; st.refresh=true; GM_setValue('cbActStart',0); saveSt(); window.location.href='/authenticated/crimes.aspx?'+Date.now(); }, rndDelay(DLY.normal)); return; }
      }
    }

    st.acting = false; st.action = ''; st.lastGarage = now; GM_setValue('cbActStart',0); saveSt();
  }

  /* === SCRAP → FMJ ===
   * store.aspx?p=s converts scrap into bullets: 5 scrap = 1000 FMJ, bought via a
   * __doPostBack link (ctl00$main$lbBuy1kFMJScrap) rather than a normal button,
   * so it needs a synthesised postback rather than a click.
   *
   * The page rate-limits at roughly 2 seconds, so this deliberately fires ONE
   * purchase per page load and then reloads, instead of looping in place. Slower,
   * but it never trips the limiter — and the limiter's message is indistinguishable
   * from a real failure, so avoiding it entirely is worth the extra seconds.
   *
   * Runs only when scrap is at or above the floor; below that it backs off for
   * hours rather than re-checking a page that cannot do anything useful.
   */
  const SCRAP_PATH = '/authenticated/store.aspx?p=s';
  const SCRAP_COST = 5;                       // scrap per 1000 FMJ
  const SCRAP_IDLE_MS = 6 * 3600 * 1000;      // nothing to convert → re-check in 6h

  function scrapNextDue() { return parseInt(GM_getValue('cbScrapNextAt', 0) || 0, 10); }
  function setScrapNext(ms) { GM_setValue('cbScrapNextAt', Date.now() + ms); }

  // Synthesised ASP.NET postback — the buy control is an <a> calling __doPostBack,
  // so there is no element whose .click() does the right thing on its own.
  function scrapPostBack(eventTarget) {
    const f = document.getElementById('aspnetForm') || document.querySelector('form');
    if (!f) { console.warn(APP_TAG, '[SCRAP] no form found'); return false; }
    const ensure = id => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('input');
        el.type = 'hidden'; el.id = id; el.name = id;
        f.appendChild(el);
      }
      return el;
    };
    ensure('__EVENTTARGET').value = eventTarget;
    ensure('__EVENTARGUMENT').value = '';
    f.submit();
    return true;
  }

  function getScrapBalance() {
    const m = (document.body.innerText || document.body.textContent || '')
      .match(/have\s+([\d,]+(?:\.\d+)?)\s+scrap/i);
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
  }

  // Owned already? The buy link is absent once you have it — see doScrap.
  function armVehDone() { return GM_getValue('cbArmVehDone', false); }

  function scrapDue() {
    /* The Armoured Vehicle protection is bought ON the scrap page, so this used
     * to require cfg.scrapOn — meaning ticking "buy the protection" on its own
     * did nothing whatsoever, because nothing ever navigated to the store. The
     * two are presented as independent switches, so either must be able to get
     * us there. Once the protection is owned it stops being a reason to go. */
    const wantProt = cfg.scrapProt && !armVehDone();
    if ((!cfg.scrapOn && !wantProt) || st.inJail || st.acting || paused) return false;
    const due = scrapNextDue();
    return !due || Date.now() >= due;
  }

  // Returns true if it took over the page (navigated, or fired a postback).
  async function doScrap() {
    if (!scrapDue()) return false;

    const onScrap = window.location.pathname.toLowerCase().includes('/store.aspx')
                 && /(^|[?&])p=s(&|$)/i.test(window.location.search);
    if (!onScrap) {
      setStatus('♻️ Scrap → FMJ...');
      safeNav(SCRAP_PATH + '&_=' + Date.now());
      return true;
    }

    st.acting = true; st.action = 'scrap'; GM_setValue('cbActStart', Date.now());
    const done = (waitMs, msg) => {
      setScrapNext(waitMs);
      st.acting = false; st.action = ''; GM_setValue('cbActStart', 0); saveSt();
      if (msg) setStatus(msg);
    };

    // Rate-limited: back off and let the next cycle retry rather than hammering.
    const msg = (document.querySelector('#ctl00_lblMsg, .TMNErrorFont')?.textContent || '');
    if (/wait a few seconds|too fast|try again/i.test(msg)) {
      console.log(APP_TAG, '[SCRAP] Rate limited — backing off 15s');
      done(15000, '♻️ Scrap rate-limited');
      return false;
    }

    const scrap = getScrapBalance();
    if (scrap === null) {
      console.warn(APP_TAG, '[SCRAP] Could not read balance — backing off 30m');
      done(30 * 60 * 1000, '♻️ Scrap balance unreadable');
      return false;
    }

    /* THE PROTECTION IS DECIDED BEFORE THE RESERVE FLOOR (2000.271).
     *
     * This block used to sit BELOW the floor check, which returns "nothing to
     * convert" and leaves — so any reserve set above your scrap balance made the
     * Armoured Vehicle permanently unreachable. The floor exists to stop
     * repeated FMJ conversion draining your scrap; a ONE-OFF 5-scrap protection
     * purchase is not that. The reference script has no floor here at all and
     * checks only that you can afford the 5.
     *
     * The buy link is absent once you own it, so its presence is the game itself
     * telling us this is still available. */
    const protLink = document.getElementById('ctl00_main_lbBuyArmVehProtection');
    const fmjLink  = document.getElementById('ctl00_main_lbBuy1kFMJScrap');

    if (!protLink && fmjLink && !armVehDone()) {
      /* Store page rendered, FMJ link present, protection link gone — it is
       * already owned. Record that so "protection only" stops bringing us back. */
      GM_setValue('cbArmVehDone', true);
      console.log(APP_TAG, '[SCRAP] Armoured Vehicle protection already owned — not checking again');
    }

    if (protLink && cfg.scrapProt) {
      if (scrap < SCRAP_COST) {
        console.log(APP_TAG, `[SCRAP] Armoured Vehicle needs ${SCRAP_COST} scrap, balance is ${scrap} — waiting`);
        done(SCRAP_IDLE_MS, `♻️ Need ${SCRAP_COST} scrap for the vehicle`);
        return false;
      }
      console.log(APP_TAG, `[SCRAP] Buying Armoured Vehicle protection (${SCRAP_COST} scrap, balance ${scrap})`);
      tgMsg('crusher', `🛡️ <b>Armoured Vehicle</b>\n${st.player||'?'} | protection bought (${SCRAP_COST} scrap)`);
      GM_setValue('cbArmVehDone', true);
      setScrapNext(8000);
      await humanWait([2200, 2600]);   // stay clear of the ~2s page limiter
      scrapPostBack('ctl00$main$lbBuyArmVehProtection');
      return true;
    }

    /* We only came here for the protection and it is dealt with — do not start
     * converting scrap the user never asked to convert. */
    if (!cfg.scrapOn) {
      done(SCRAP_IDLE_MS, '♻️ Vehicle protection handled');
      return false;
    }

    const floor = Math.max(SCRAP_COST, Number(cfg.scrapFloor) || SCRAP_COST);
    if (scrap < floor || scrap < SCRAP_COST) {
      console.log(APP_TAG, `[SCRAP] ${scrap} scrap left (floor ${floor}) — nothing to convert`);
      done(SCRAP_IDLE_MS, `♻️ Scrap ${scrap} — idle`);
      return false;
    }

    const buyLink = fmjLink;
    if (!buyLink) {
      console.warn(APP_TAG, '[SCRAP] Buy link not found — backing off 30m');
      done(30 * 60 * 1000, '♻️ Scrap buy link missing');
      return false;
    }

    const runs = GM_getValue('cbScrapRuns', 0) + 1;
    GM_setValue('cbScrapRuns', runs);
    console.log(APP_TAG, `[SCRAP] Converting ${SCRAP_COST} scrap → 1000 FMJ (${scrap} left)`);
    setStatus(`♻️ Scrap ${scrap} → 1000 FMJ`);
    setScrapNext(8000);
    await humanWait([2200, 2600]);
    scrapPostBack('ctl00$main$lbBuy1kFMJScrap');
    return true;
  }

  /* === HOLD HQ (PANIC) ===
   * You're being shot at and want out of reach. Entering your network HQ takes
   * you off the street for N minutes at a time; this re-enters until you turn it
   * off or the cap trips.
   *
   * THREE RULES, and the first is the important one:
   *
   * 1. NEVER ENTER A DAMAGED HQ. If the building is destroyed while you're inside
   *    it, you die. `#ctl00_main_lbldamage` above zero means we refuse, alert, and
   *    keep refusing — a panic button that kills you is worse than no button.
   * 2. IT SWITCHES ITSELF OFF at `cfg.holdHqMax` entries (~1h by default). This is
   *    a panic mode, not a way to play: left on and forgotten it would idle away a
   *    whole day's actions. The cap is the thing that makes it safe to reach for.
   * 3. It does NOT auto-travel to the HQ. If you're in the wrong city it says so
   *    and waits. Travelling has its own long cooldown and would strand you
   *    somewhere you didn't choose while under fire — that's your call, not ours.
   *
   * Everything else is paused while this runs: hiding and committing crimes at the
   * same time is not hiding.
   */
  const HQ_PATH = '/authenticated/network.aspx?p=p';
  const LS_HQ_CITY = 'cbHqCity', LS_HQ_NEXT = 'cbHqNextAt', LS_HQ_COUNT = 'cbHqEnterCount';

  function hqCityKey(s) {
    // The HQ location reads "Miami - Something"; the status bar reads "Miami".
    return String(s || '').trim().toLowerCase().replace(/\s*-\s*.*/, '');
  }

  function hqEnterCount() { return parseInt(localStorage.getItem(LS_HQ_COUNT) || '0', 10) || 0; }
  function hqNextAt()     { return parseInt(localStorage.getItem(LS_HQ_NEXT)  || '0', 10) || 0; }

  function hqDisable(why) {
    cfg.holdHqOn = false;
    GM_setValue('cbHoldHqOn', false);
    localStorage.removeItem(LS_HQ_COUNT);
    localStorage.removeItem(LS_HQ_NEXT);
    console.log(`${APP_TAG}[HQ] Hold HQ off — ${why}`);
    tgMsg('holdHq', `🏠 <b>Hold HQ off</b>\n${st.player||'?'} | ${esc(why)}`);
    try { const cb = _shadow && _shadow.querySelector('#jb-holdhq-on'); if (cb) cb.checked = false; } catch(_){}
    try { updateHqUI(); } catch(_){}
  }

  function updateHqUI() {
    if (!_shadow) return;
    const row = _shadow.querySelector('#jb-hq-row'), el = _shadow.querySelector('#jb-hq-state');
    if (!row || !el) return;
    if (!cfg.holdHqOn) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    const n = hqEnterCount(), max = Math.max(1, Number(cfg.holdHqMax) || 6);
    const next = hqNextAt(), rem = next ? Math.max(0, Math.ceil((next - Date.now()) / 1000)) : 0;
    el.innerHTML = rem > 0
      ? `<span style="color:var(--jb-success)">inside · ${Math.floor(rem/60)}:${String(rem%60).padStart(2,'0')} · ${n}/${max}</span>`
      : `<span style="color:var(--jb-warning)">entering · ${n}/${max}</span>`;
  }

  // Returns true if it took control of this tick.
  async function doHoldHq() {
    if (!cfg.holdHqOn) return false;

    const max = Math.max(1, Number(cfg.holdHqMax) || 6);
    if (hqEnterCount() >= max) {
      hqDisable(`safety cap reached (${max} entries)`);
      return false;
    }

    const curCity = hqCityKey(getCurCity());
    const onNet = /\/authenticated\/network\.aspx/i.test(location.pathname);

    if (!onNet) {
      const next = hqNextAt();
      if (next && Date.now() < next) {          // inside and still counting down
        setStatus(`🏠 Hold HQ — ${Math.ceil((next - Date.now())/60000)}m left`);
        updateHqUI();
        return true;                            // hold the loop; nothing else should run
      }
      const hqCity = localStorage.getItem(LS_HQ_CITY) || '';
      if (hqCity && curCity && hqCityKey(hqCity) !== curCity) {
        // Wrong city — say so and wait. Deliberately does not travel; see the note.
        setStatus(`🏠 Hold HQ — travel to ${hqCity}`);
        tgOnce('hq_city', 900, `🏠 <b>Hold HQ</b>\n${st.player||'?'} | you're in ${esc(getCurCity()||'?')}, HQ is in ${esc(hqCity)} — travel there to hide`);
        return true;
      }
      setStatus('🏠 Hold HQ — going to the HQ');
      safeNav(HQ_PATH + '&_=' + Date.now());
      return true;
    }

    // On the network page.
    const loc = (document.getElementById('ctl00_main_lblLocation')?.textContent || '').trim();
    if (loc) localStorage.setItem(LS_HQ_CITY, loc);

    if (loc && curCity && hqCityKey(loc) !== curCity) {
      setStatus(`🏠 Hold HQ — travel to ${loc}`);
      tgOnce('hq_city', 900, `🏠 <b>Hold HQ</b>\n${st.player||'?'} | HQ is in ${esc(loc)}, you're in ${esc(getCurCity()||'?')}`);
      return true;
    }

    /* Rule 1. A damaged HQ can be destroyed while you're in it, and that kills
     * you. Refuse, and keep refusing — this is the one condition where doing
     * nothing is unambiguously right. */
    const dmg = parseInt((document.getElementById('ctl00_main_lbldamage')?.textContent || '0').replace(/[^\d]/g, ''), 10) || 0;
    if (dmg > 0) {
      setStatus(`🏠 Hold HQ — REFUSING, HQ at ${dmg}% damage`);
      tgOnce('hq_damage', 600, `⚠️ <b>Hold HQ refused</b>\n${st.player||'?'} | HQ has ${dmg}% damage — entering could kill you if it's destroyed`);
      console.warn(`${APP_TAG}[HQ] ${dmg}% damage — not entering`);
      return true;
    }

    const enterBtn = document.getElementById('ctl00_main_btnenter');
    const minsBox  = document.getElementById('ctl00_main_txtmins');
    if (enterBtn && minsBox && !enterBtn.disabled) {
      const mins = Math.max(1, Math.min(60, Number(cfg.holdHqMins) || 10));
      const n = hqEnterCount() + 1;
      minsBox.value = String(mins);
      try { minsBox.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){}
      localStorage.setItem(LS_HQ_COUNT, String(n));
      localStorage.setItem(LS_HQ_NEXT, String(Date.now() + mins * 60000));
      console.log(`${APP_TAG}[HQ] Entering for ${mins}m (${n}/${max})`);
      setStatus(`🏠 Hold HQ — entering ${mins}m (${n}/${max})`);
      if (n === 1) tgMsg('holdHq', `🏠 <b>Hold HQ</b>\n${st.player||'?'} | hiding in ${esc(loc||'HQ')}, ${mins}m at a time, max ${max}`);
      updateHqUI();
      await humanWait(DLY.quick);
      enterBtn.click();
      return true;
    }

    // No enter button: already inside. Sit out the timer.
    const next = hqNextAt();
    setStatus(next ? `🏠 Hold HQ — inside, ${Math.max(1, Math.ceil((next - Date.now())/60000))}m left` : '🏠 Hold HQ — inside');
    updateHqUI();
    return true;
  }

  /* === SHOT -> RETREAT TO HQ (2000.278) ===
   * The automatic counterpart to the Hold HQ panic button: somebody has shot you
   * and cost you health, so heal and get behind a door.
   *
   * ALL BACKGROUND FETCH/POST - it never navigates. Same reasoning as bgHeal
   * (234): a page lives ~2.5s under automation, so a navigating sequence of five
   * steps would be torn up halfway through and leave an action stranded.
   *
   * IT HEALS FIRST, unconditionally, before anything else is attempted. Healing
   * has no preconditions and always helps, whereas every later step can
   * legitimately refuse - no HQ city recorded, wrong city, travel switched off,
   * damaged HQ. The reference script gets the same effect by calling its heal on
   * five separate bail-out paths; doing it once up front cannot be missed when
   * someone adds a sixth.
   *
   * THE DAMAGE CHECK IS THE LOAD-BEARING ONE, exactly as in doHoldHq: if the
   * building is destroyed while you are inside it, YOU DIE. A retreat that kills
   * you is worse than staying in the street, so a damaged HQ refuses to be
   * entered - and because we healed first, refusing still leaves you better off
   * than when we started.
   */
  const SHOT_CREDITS = '/authenticated/credits.aspx';
  const SHOT_TRAVEL  = '/authenticated/travel.aspx';
  let _shotActive = false;

  async function shotGet(url) {
    try {
      const r = await fetch(url, { method:'GET', credentials:'same-origin', cache:'no-store' });
      return r.ok ? await r.text() : null;
    } catch(e) { console.warn(APP_TAG, '[SHOT] GET failed', url, e); return null; }
  }
  async function shotPost(url, params) {
    try {
      const r = await fetch(url, { method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: params.toString() });
      return r.ok ? await r.text() : null;
    } catch(e) { console.warn(APP_TAG, '[SHOT] POST failed', url, e); return null; }
  }
  function shotParams(k) {
    const p = new URLSearchParams();
    p.append('__VIEWSTATE', k.vs);
    p.append('__EVENTVALIDATION', k.ev);
    if (k.gen) p.append('__VIEWSTATEGENERATOR', k.gen);
    return p;
  }

  /* Buys a jail reset and a travel reset, then flies. All three spend credits,
   * which is the whole reason cfg.shotTravelOn is off by default.
   * JET, never the commercial plane - 255 removed the 45-minute option on
   * purpose, and re-introducing it here would bring it back at the one moment
   * nobody is watching. */
  async function shotTravelTo(hqCity) {
    setStatus('\u{1F6E1}️ Shot - clearing cooldowns for ' + hqCity);
    for (const [btn, what] of [['ctl00$main$btnBuyJailRelease', 'jail reset'],
                               ['ctl00$main$btnResetTravel',   'travel reset']]) {
      const h = await shotGet(SHOT_CREDITS);
      const k = h && _healKeys(h);
      if (!k) { console.warn(APP_TAG, '[SHOT] credits page unreadable - skipping the ' + what); continue; }
      const p = shotParams(k); p.append(btn, 'Buy');
      await shotPost(SHOT_CREDITS, p);
      console.log(APP_TAG + '[SHOT] bought the ' + what);
    }

    const h = await shotGet(SHOT_TRAVEL);
    const k = h && _healKeys(h);
    if (!k) { console.warn(APP_TAG, '[SHOT] travel page unreadable - healed only'); return false; }

    const radios = [...k.doc.querySelectorAll('input[type=radio][name="ctl00$main$citieslist"]')];
    if (!radios.length) {
      /* Same guard as 264: no destinations on the page means the game is not
       * offering travel (a cooldown the reset did not clear), NOT a missing city.
       * Saying "couldn't identify the city" here is what sent three releases
       * hunting the wrong subsystem. */
      console.warn(APP_TAG, '[SHOT] the game is offering no destinations - cannot reach the HQ, healed only');
      return false;
    }
    const cities = radios.map(r => ({ r, label: travelLabelOf(r, k.doc) }));
    const near = travelMatch(cities, hqCityKey(hqCity));
    if (near.length !== 1) {
      const unlabelled = cities.filter(c => !c.label).length;
      console.warn(APP_TAG, '[SHOT] "' + hqCity + '" matched ' + near.length + ' of ' + cities.length + ' destinations' +
        (unlabelled === cities.length ? ' - and NONE had a readable label, so this is a markup problem' : '') +
        ' - refusing to guess, healed only');
      return false;
    }

    const p = shotParams(k);
    p.append('ctl00$main$citieslist', near[0].r.value);
    p.append('ctl00$main$btnTravelPrivate', 'Private Jet');
    console.log(APP_TAG + '[SHOT] flying to ' + near[0].label + ' (value ' + near[0].r.value + ')');
    await shotPost(SHOT_TRAVEL, p);
    return true;
  }

  /* Fetch the HQ page, verify it, and enter. Mirrors doHoldHq's checks because
   * it is the same building and the same way to die. */
  async function shotEnterHq(hqCity) {
    const h = await shotGet(HQ_PATH);
    const k = h && _healKeys(h);
    if (!k) { console.warn(APP_TAG, '[SHOT] HQ page unreadable - healed only'); return false; }

    const enterBtn = k.doc.getElementById('ctl00_main_btnenter');
    const minsBox  = k.doc.getElementById('ctl00_main_txtmins');
    if (!enterBtn || !minsBox) {
      console.warn(APP_TAG, '[SHOT] no Enter-HQ control on the page - not in your network city, or no HQ set up. Healed only');
      setStatus('\u{1F6E1}️ Shot - healed (cannot enter HQ)');
      return false;
    }

    const dmg = parseInt((k.doc.getElementById('ctl00_main_lbldamage')?.textContent || '0').replace(/[^\d]/g, ''), 10) || 0;
    if (dmg > 0) {
      /* REFUSE. If the HQ is destroyed while you are inside, you die. */
      console.warn(APP_TAG, '[SHOT] HQ is ' + dmg + '% damaged - NOT entering. Healed only');
      setStatus('\u{1F6E1}️ Shot - healed, HQ damaged (' + dmg + '%)');
      tgMsg('shot', '\u{1F6E1}️ <b>Shot response</b>\n' + (st.player || '?') +
        ' | healed, but the HQ is <b>' + dmg + '% damaged</b> - refusing to enter it (you die if it is destroyed while you are inside)');
      return false;
    }

    const mins = Math.max(1, Number(cfg.holdHqMins) || 10);
    const p = shotParams(k);
    p.append('__VIEWSTATEENCRYPTED', '');
    p.append('ctl00$main$txtmins', String(mins));
    p.append('ctl00$main$btnenter', 'Enter HQ');
    await shotPost(HQ_PATH, p);

    /* Record the stay the same way doHoldHq does, so the panel countdown, the
     * safety cap and the break/ready logic all see one consistent state. */
    localStorage.setItem(LS_HQ_COUNT, String(hqEnterCount() + 1));
    localStorage.setItem(LS_HQ_NEXT,  String(Date.now() + mins * 60000));
    try { updateHqUI(); } catch(_){}
    console.log(APP_TAG + '[SHOT] secured inside the HQ for ' + mins + 'm');
    setStatus('\u{1F6E1}️ Shot - hiding in the HQ, ' + mins + 'm');
    return true;
  }

  async function doShotRetreat(info) {
    if (!cfg.shotRetreatOn) return false;
    if (isHalted()) return false;
    if (_shotActive) { console.warn(APP_TAG, '[SHOT] retreat already running - ignoring duplicate'); return false; }
    _shotActive = true;
    const wasActing = st.acting;
    st.acting = true;                 // keep the main loop off the page mid-sequence
    try {
      console.log(APP_TAG + '[SHOT] shot by ' + (info && info.shooter || '?') +
                  ' (-' + (info && info.healthLost || '?') + '%) - responding');
      setStatus('\u{1F6E1}️ Shot - healing');
      await bgHeal(100);

      const hqCity = localStorage.getItem(LS_HQ_CITY) || '';
      if (!hqCity) {
        console.warn(APP_TAG, '[SHOT] no HQ city recorded yet - open your Network HQ once so Jarvis learns it. Healed only');
        setStatus('\u{1F6E1}️ Shot - healed (HQ city unknown)');
        tgMsg('shot', '\u{1F6E1}️ <b>Shot response</b>\n' + (st.player || '?') +
          ' | healed, but no HQ city is recorded yet - open your Network HQ once so Jarvis learns where it is');
        return true;
      }

      const cur = hqCityKey(getCurCity());
      if (cur && hqCityKey(hqCity) !== cur) {
        if (!cfg.shotTravelOn) {
          console.log(APP_TAG + '[SHOT] HQ is in ' + hqCity + ', you are in ' + getCurCity() + ' - travel is off, healed only');
          setStatus('\u{1F6E1}️ Shot - healed, HQ is in ' + hqCity);
          tgMsg('shot', '\u{1F6E1}️ <b>Shot response</b>\n' + (st.player || '?') +
            ' | healed. HQ is in <b>' + esc(hqCity) + '</b>, you are in <b>' + esc(getCurCity() || '?') +
            '</b> - travel there to hide (auto-travel on a shot is off)');
          return true;
        }
        if (!(await shotTravelTo(hqCity))) {
          setStatus('\u{1F6E1}️ Shot - healed, could not reach the HQ');
          tgMsg('shot', '\u{1F6E1}️ <b>Shot response</b>\n' + (st.player || '?') +
            ' | healed, but could not reach <b>' + esc(hqCity) + '</b> - see the console');
          return true;
        }
      }

      return await shotEnterHq(hqCity);
    } catch (e) {
      console.warn(APP_TAG, '[SHOT] retreat error', e);
      return false;
    } finally {
      _shotActive = false;
      st.acting = wasActing;
    }
  }

  /* === HOURLY FORUM REFRESH (camouflage) ===
   * A real player's session touches the forum now and then. This does the same
   * on a jittered ~hourly schedule.
   *
   * IT FETCHES, IT DOES NOT NAVIGATE. This used to be forced on us — the forum
   * was in SKIP_PAGES, so navigating there made Jarvis return early, stop dead
   * and sit on the forum until you noticed. SKIP_PAGES is empty as of 2000.254,
   * so that trap is gone and a navigation would now work.
   *
   * Fetching is still the right call, and is now a choice rather than a
   * workaround: a same-origin GET produces the identical request server-side
   * with the identical session cookie — which is the entire basis of the
   * camouflage — while costing no page load and, crucially, not yanking you off
   * whatever you were doing once an hour. Don't "upgrade" this to a navigation.
   */
  const FORUM_PATH = '/authenticated/forum.aspx';

  function forumNextDue() { return parseInt(GM_getValue('cbForumNextAt', 0) || 0, 10); }

  function scheduleForumRefresh(fromNow) {
    const base = Math.max(5, Math.min(1440, Number(cfg.forumRefreshMin) || 60)) * 60000;
    // ±25% so it isn't on the hour every hour, which is its own tell.
    const ms = fromNow != null ? fromNow : base * (0.75 + Math.random() * 0.5);
    GM_setValue('cbForumNextAt', Date.now() + ms);
  }

  async function doForumRefresh() {
    if (isHalted()) return;
    if (!cfg.forumRefreshOn || !tabs.isMaster) return;
    const due = forumNextDue();
    if (!due) { scheduleForumRefresh(); return; }      // first run: schedule, don't fire
    if (Date.now() < due) return;
    scheduleForumRefresh();                            // reschedule first, so a failure can't loop
    try {
      const r = await fetch(FORUM_PATH + '?_=' + Date.now(), { credentials:'same-origin', cache:'no-store' });
      dlog(APP_TAG, `[FORUM] Refreshed (HTTP ${r.status})`);
    } catch (e) {
      dlog(APP_TAG, '[FORUM] Refresh failed:', e && e.message ? e.message : e);
    }
  }

  /* === HOT CITY === */

  const LS_HOT = 'cbHotCity', LS_HOT_UNTIL = 'cbHotUntil', LS_HOT_PEND = 'cbHotPend';
  const LS_HOT_AT = 'cbHotAt';   // when it was last actually read — see getHot()

  /* Next Amsterdam midnight, WITHOUT a date round-trip (2000.261).
   *
   * This used to be `new Date(new Date().toLocaleString('en-US', {timeZone:…}))`
   * — format a date to a string, then parse the string back. That parse is
   * implementation-defined, and if it ever returns Invalid Date then getHours()
   * is NaN, the arithmetic is NaN, and `Date.now()+NaN` gets stored as the
   * literal string "NaN". Combined with the old getHot() (which only expired on
   * `until > 0`), that pinned the hot city FOR EVER — one bad write and Jarvis
   * would keep flying to a city that stopped being hot days ago.
   *
   * Reads the fields directly instead, the way gameDayStr() already does, and
   * cannot return NaN under any branch. */
  function midnightCET() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam', hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date());
      const g = t => parseInt((parts.find(x => x.type === t) || {}).value, 10);
      let H = g('hour'); const M = g('minute'), S = g('second');
      if (H === 24) H = 0;                               // some builds render midnight as 24
      if (![H, M, S].every(Number.isFinite)) throw new Error('unparsed');
      return Date.now() + ((24*3600 - (H*3600 + M*60 + S)) * 1000);
    } catch(_) {
      return Date.now() + 24*3600*1000;                  // still a real number
    }
  }

  function saveHot(city) {
    localStorage.setItem(LS_HOT, city);
    localStorage.setItem(LS_HOT_UNTIL, String(midnightCET()));
    localStorage.setItem(LS_HOT_AT, String(Date.now()));
  }

  /* FAIL TOWARD REFRESHING, NEVER TOWARD A STALE CITY (2000.261).
   *
   * Observed live: the panel read "Hot: Amsterdam (in Sydney)" while Sydney was
   * actually the hot city — and auto-travel was about to fly to Amsterdam. The
   * destination pick was right all along; the STORED CITY was wrong.
   *
   * The old test was `if (until > 0 && Date.now() > until)`. A missing, zero or
   * NaN expiry makes that false, so it returned the cached city — for ever. Any
   * one bad write and there was no way back short of the manual Refresh button.
   *
   * Now anything that isn't a usable future timestamp counts as expired, plus a
   * hard ceiling on age regardless of what the expiry claims. Being wrong about
   * the hot city costs a 20-minute cooldown and leaves you in the wrong place;
   * re-reading a page costs one GET. The asymmetry is not close. */
  const HOT_MAX_AGE_MS = 26 * 60 * 60 * 1000;   // a day plus slack — a backstop, not the mechanism

  function getHot() {
    const until = Number(localStorage.getItem(LS_HOT_UNTIL));
    const at    = Number(localStorage.getItem(LS_HOT_AT));
    const drop = why => {
      if (localStorage.getItem(LS_HOT)) dlog(APP_TAG, `[HOT] Dropping cached hot city — ${why}`);
      localStorage.removeItem(LS_HOT); localStorage.removeItem(LS_HOT_UNTIL); localStorage.removeItem(LS_HOT_AT);
      return null;
    };
    if (!Number.isFinite(until) || until <= 0) return drop('no usable expiry stored');
    if (Date.now() > until)                     return drop('past the stored expiry');
    // A stored `at` is optional (older installs won't have one), but if it is
    // there and absurdly old, don't trust the expiry either.
    if (Number.isFinite(at) && at > 0 && (Date.now() - at) > HOT_MAX_AGE_MS) return drop('older than the max age');
    return localStorage.getItem(LS_HOT) || null;
  }

  function scrapeHot(doc) {
    if (!doc) return null;
    try {
      for (const sp of doc.querySelectorAll('span.mat-inline-symbol')) {
        if (!/990000/.test(sp.getAttribute('style')||'')) continue;
        if (sp.textContent.trim() === 'Swords') {
          const next = sp.nextElementSibling;
          if (next) { const c = next.textContent.trim(); if (c && c.length < 30) return c; }
        }
      }
    } catch(_){}
    return null;
  }

  /* isInHot() lives with the auto-travel code further down — there used to be a
   * second copy here, which hoisting made dead. Worth knowing WHY it had to go
   * rather than just being tidied: it lacked the empty-city guard, and
   * `hot.includes('')` is true, so it reported "in the hot city" whenever the
   * status bar hadn't rendered. Harmless while the later definition won, but it
   * would have silently started OCs in the wrong city the moment anyone moved
   * or deleted that one. */

  function getCurCity() { try { const el = document.getElementById('ctl00_userInfo_lblcity'); return (el?el.textContent:'').trim(); } catch(_) { return ''; } }

  function initHot() {
    if (/\/authenticated\/statistics\.aspx/i.test(location.pathname) && !/p=/i.test(location.search)) {
      setTimeout(() => {
        const city = scrapeHot(document);
        if (city) { saveHot(city); if (localStorage.getItem(LS_HOT_PEND)==='1') { localStorage.removeItem(LS_HOT_PEND); window.location.href='/authenticated/crimes.aspx?'+Date.now(); } }
        else localStorage.removeItem(LS_HOT_PEND);
      }, 2000);
    }
  }

  /* === RE-READ THE HOT CITY IN THE BACKGROUND (2000.261) ===
   *
   * The hot city used to be read ONCE A DAY at best, and only by NAVIGATING to
   * the statistics page. Two consequences, both bad:
   *   · it went stale the moment the game rotated the city, and there was no
   *     mechanism to notice — see getHot() for how it could stick permanently;
   *   · re-reading it meant yanking Jarvis off whatever it was doing.
   *
   * scrapeHot() already takes a document, so it works just as well on a fetched
   * one. Same request server-side, no navigation, and it can therefore run often
   * enough that the stored city is never more than HOT_REFRESH_MS old.
   */
  const HOT_REFRESH_MS = 15 * 60 * 1000;
  let _hotBusy = false;

  async function fetchHotBg() {
    if (isHalted() || _hotBusy) return false;
    _hotBusy = true;
    try {
      const r = await fetch('/authenticated/statistics.aspx?_=' + Date.now(),
                            { credentials:'same-origin', cache:'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      if (isLoginDoc(doc)) throw new Error('logged out');
      const city = scrapeHot(doc);
      if (!city) {
        /* Keep whatever we had rather than blanking it — but say so, because a
         * silently unparsed hot city is how we ended up flying to Amsterdam. */
        console.warn(APP_TAG, '[HOT] Could not read the hot city from the statistics page — keeping the stored one');
        return false;
      }
      const prev = (localStorage.getItem(LS_HOT) || '').trim();
      saveHot(city);
      if (prev && prev.toLowerCase() !== city.toLowerCase()) {
        console.log(`${APP_TAG}[HOT] Hot city changed: ${prev} → ${city}`);
        tgMsg('travel', `🔥 <b>Hot city changed</b>\n${st.player||'?'} | ${esc(prev)} → <b>${esc(city)}</b>`);
      } else if (!prev) {
        console.log(`${APP_TAG}[HOT] Hot city: ${city}`);
      } else {
        dlog(APP_TAG, `[HOT] Still ${city}`);
      }
      try { updateTimers(); } catch(_){}
      return true;
    } catch (e) {
      console.warn(APP_TAG, '[HOT] Background read failed:', e && e.message ? e.message : e);
      return false;
    } finally { _hotBusy = false; }
  }

  /* Kept for the callers that just want "make sure we know the hot city". It no
   * longer NAVIGATES — the background read does the same job without dragging
   * Jarvis to the statistics page. */
  function fetchHot() {
    if (isHalted()) return;
    if (getHot()) return;
    const last = parseInt(localStorage.getItem('cbHotFetchAt')||'0',10);
    if (Date.now() - last < 60000) return;   // one attempt a minute is plenty
    localStorage.setItem('cbHotFetchAt', String(Date.now()));
    fetchHotBg();
  }

  /* === OC TEAM CREATION === */

  const LS_OC_ST = 'cbOcState', LS_OC_STEP = 'cbOcStep', LS_OC_NEXT = 'cbOcNext', LS_OC_RETRY = 'cbOcRetry', LS_OC_POLL = 'cbOcPoll';

  function getCreateOCState() { return localStorage.getItem(LS_OC_ST)||'idle'; }
  function getCreateOCStep() { return parseInt(localStorage.getItem(LS_OC_STEP)||'0',10); }
  function resetCreateOC() { localStorage.setItem(LS_OC_ST,'idle'); localStorage.setItem(LS_OC_STEP,'0'); localStorage.removeItem(LS_OC_NEXT); localStorage.removeItem(LS_OC_POLL); }

  function parseSchedTime(s) { if(!s||!s.trim()) return 0; const d = new Date(s.trim()); return isNaN(d.getTime())?0:d.getTime(); }
  function isSchedReady() { const ms = parseSchedTime(st.ocSched); return ms === 0 || Date.now() >= ms; }

  function triggerCreateOC() {
    if (!st.createOC) return;
    if (!isSchedReady()) return;
    const retry = parseInt(localStorage.getItem(LS_OC_RETRY)||'0',10);
    if (retry && Date.now() < retry) return;
    if (!getHot()) { fetchHot(); return; }
    if (!isInHot()) { tgOnce('oc_skip_city', 3600, `⚠️ <b>OC Skip</b>\n${st.player||'?'} | Not in hot city (${getCurCity()} vs ${getHot()})`); return; }
    if (!st.ocTrans.trim() || !st.ocWeapon.trim() || !st.ocExplo.trim()) { tgOnce('oc_no_team', 3600, `⚠️ <b>OC</b> — team not set`); return; }
    localStorage.removeItem('cbTgOnce_oc_skip_city');
    localStorage.removeItem('cbTgOnce_oc_no_team');
    tgMsg('ocCreate', `🏢 <b>OC Setup</b>\n${st.player||'?'} | ${getCurCity()}\nTeam: ${st.ocTrans}, ${st.ocWeapon}, ${st.ocExplo}`);
    localStorage.setItem(LS_OC_ST, 'setup'); localStorage.setItem(LS_OC_STEP, '0'); localStorage.setItem(LS_OC_NEXT, String(Date.now()));
    const onOc = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && !/p=dtm/i.test(location.search);
    if (onOc) setTimeout(() => handleCreateOC(), 600);
    else window.location.href = OC_PATH+'?'+Date.now();
  }

  function formSubmit(btn) {
    try { const f = btn.form||document.forms[0]; if(f) { const prev=f.querySelector('input[data-jb-sub]'); if(prev)prev.remove(); const h=document.createElement('input'); h.type='hidden'; h.name=btn.name; h.value=btn.value||''; h.setAttribute('data-jb-sub','1'); f.appendChild(h); f.submit(); return true; } } catch(_){}
    btn.click(); return true;
  }

  async function handleCreateOC() {
    if (!st.createOC) return false;
    const onOc = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && !/p=dtm/i.test(location.search);
    if (!onOc) return false;
    const ocSt = getCreateOCState();
    if (ocSt === 'idle') return false;
    const next = parseInt(localStorage.getItem(LS_OC_NEXT)||'0',10);
    if (next > Date.now()) return false;

    const step = getCreateOCStep();
    const t = st.ocTrans.trim(), w = st.ocWeapon.trim(), e = st.ocExplo.trim();

    try {
      if (ocSt === 'polling') {
        const commitBtn = document.getElementById('ctl00_main_btnCommitOC');
        if (commitBtn && !commitBtn.disabled) {
          await wait(rndDelay(DLY.normal));
          snapshotXP('oc');   // nothing tagged OC before 242, so every OC gain landed in "other"
          formSubmit(commitBtn);
          const mode = st.ocRepeat||'once';
          let willRepeat = false;
          if (mode === 'continuous') willRepeat = true;
          else if (mode === 'once') willRepeat = false;
          else { const left = (st.ocLeft||0)-1; if(left>0){st.ocLeft=left;willRepeat=true;}else willRepeat=false; }
          tgMsg('ocCommit', `✅ <b>OC Committed</b>\n${st.player||'?'}`);
          resetCreateOC();
          if (!willRepeat) { st.createOC = false; st.ocSched = ''; st.ocLeft = 0; }
          saveSt();
          return true;
        }
        localStorage.setItem(LS_OC_NEXT, String(Date.now()+60000));
        window.location.href = '/authenticated/crimes.aspx?'+Date.now();
        return true;
      }

      if (step >= 1 && step <= 4) {
        const hasForm = !!document.getElementById('ctl00_main_txtinvitename');
        const hasStart = !!(document.getElementById('ctl00_main_btnStartOCRobCasino')?.disabled===false || document.getElementById('ctl00_main_btnStartOCRobArmoury')?.disabled===false || document.getElementById('ctl00_main_btnStartOCRobBank')?.disabled===false);
        const hasCommit = !!document.getElementById('ctl00_main_btnCommitOC');
        const hasBuy = !!document.getElementById('ctl00_main_btnBuySecurity');
        if (!hasForm && !hasCommit && !hasBuy && hasStart) { tgMsg('ocCreate', `⚠️ <b>OC Cancelled</b>\n${st.player||'?'}`); resetCreateOC(); return false; }
      }

      if (step === 0) {
        const casino = document.getElementById('ctl00_main_btnStartOCRobCasino');
        const armoury = document.getElementById('ctl00_main_btnStartOCRobArmoury');
        const bank = document.getElementById('ctl00_main_btnStartOCRobBank');
        const pref = (st.ocType||'Casino').toLowerCase();
        let preferred;
        if (pref==='casino') preferred=[casino,armoury,bank]; else if(pref==='armoury') preferred=[armoury,casino,bank]; else preferred=[bank,casino,armoury];
        const btn = preferred.find(b=>b&&!b.disabled);
        if (!btn) { localStorage.setItem(LS_OC_NEXT, String(Date.now()+5000)); return false; }
        await wait(rndDelay(DLY.normal));
        localStorage.setItem(LS_OC_ST,'setup'); localStorage.setItem(LS_OC_STEP,'1'); localStorage.setItem(LS_OC_NEXT, String(Date.now()+10000));
        formSubmit(btn); return true;
      }

      if (step >= 1 && step <= 3) {
        const names = [t, w, e];
        const roles = ['Transporter','WeaponMaster','ExplosiveExpert'];
        const member = names[step-1];
        const role = roles[step-1];
        if (!member) { resetCreateOC(); return false; }
        const nameIn = document.getElementById('ctl00_main_txtinvitename') ||
                       document.getElementById('ctl00_main_tbParticipant') ||
                       document.querySelector('input[id*="invitename"],input[id*="Participant"]');
        const roleIn = document.getElementById('ctl00_main_roleslist');
        const invBtn = document.getElementById('ctl00_main_btninvite') ||
                       document.getElementById('ctl00_main_btnInvite') ||
                       [...document.querySelectorAll('input[type="submit"],button')].find(b => /invite/i.test((b.value||b.textContent||'').trim()));
        if (!nameIn||!roleIn||!invBtn) { localStorage.setItem(LS_OC_NEXT, String(Date.now()+5000)); return true; }
        nameIn.value = ''; await wait(rndDelay(DLY.normal));
        nameIn.value = member;
        try { nameIn.dispatchEvent(new Event('input', {bubbles:true})); nameIn.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
        await wait(rndDelay(DLY.normal));
        roleIn.value = role;
        try { roleIn.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
        await wait(rndDelay(DLY.normal));
        tgMsg('ocCreate', `🏢 <b>OC ${step+1}/5</b>\n${st.player||'?'} | Invited ${member} as ${role}`);
        localStorage.setItem(LS_OC_STEP, String(step+1));
        localStorage.setItem(LS_OC_NEXT, String(Date.now()+(step===3?60000:10000)));
        invBtn.click(); return true;
      }

      if (step === 4) {
        const secSel = document.getElementById('ctl00_main_securitydeviceslist');
        const buyBtn = document.getElementById('ctl00_main_btnBuySecurity');
        if (!secSel||!buyBtn) { localStorage.setItem(LS_OC_NEXT, String(Date.now()+5000)); return true; }
        secSel.value = '6'; await wait(rndDelay(DLY.normal));
        tgMsg('ocCreate', `🏢 <b>OC 5/5</b>\n${st.player||'?'} | Laptop bought, waiting for commits`);
        localStorage.setItem(LS_OC_STEP,'5'); localStorage.setItem(LS_OC_ST,'polling');
        localStorage.setItem(LS_OC_POLL, String(Date.now()));
        localStorage.setItem(LS_OC_NEXT, String(Date.now()+60000));
        buyBtn.click(); return true;
      }
    } catch(e) { console.error(APP_TAG,'CreateOC err',e); resetCreateOC(); return false; }
    return false;
  }


  /* === OFFICE-STYLE UI === */

  function buildUI() {
    if (document.getElementById('jb-host')) return;
    const host = document.createElement('div');
    host.id = 'jb-host';
    document.body.appendChild(host);
    _shadow = host.attachShadow({ mode:'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .jb-root {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px; line-height: 1.4; width: 310px;
        color: var(--jb-text); background: var(--jb-surface);
        border: 1px solid var(--jb-border-strong); border-radius: 3px;
        box-shadow: var(--jb-shadow);
      }
      .jb-header {
        background: var(--jb-header-bg); color: var(--jb-header-text);
        padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; font-weight: 600; cursor: default; border-radius: 2px 2px 0 0;
        user-select: none;
      }
      .jb-modal-head {
        background: var(--jb-header-bg); color: var(--jb-header-text);
        padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;
        font-size: 13px; font-weight: 600; border-radius: 2px 2px 0 0;
      }
      .jb-header-btns { display: flex; gap: 4px; }
      .jb-hbtn {
        background: rgba(255,255,255,.15); border: none; color: #fff; width: 22px; height: 22px;
        border-radius: 2px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center;
        transition: background .15s;
      }
      .jb-hbtn:hover { background: rgba(255,255,255,.3); }
      .jb-ribbon {
        background: var(--jb-ribbon-bg); border-bottom: 1px solid var(--jb-ribbon-border);
        padding: 4px 8px; display: flex; gap: 6px; flex-wrap: wrap;
      }
      .jb-ribbon-btn {
        background: var(--jb-ribbon-on); color: var(--jb-ribbon-on-text); border: none; border-radius: 2px;
        padding: 3px 8px; font-size: 10px; font-weight: 600; cursor: pointer;
        font-family: inherit; transition: background .15s, color .15s;
      }
      .jb-ribbon-btn:hover { filter: brightness(1.15); }
      .jb-ribbon-btn.off { background: var(--jb-ribbon-off); color: var(--jb-ribbon-off-text); }
      .jb-body { padding: 8px 10px; max-height: 420px; overflow-y: auto; }
      .jb-body::-webkit-scrollbar { width: 6px; }
      .jb-body::-webkit-scrollbar-thumb { background: var(--jb-border-strong); border-radius: 3px; }
      .jb-sect { margin-bottom: 8px; }
      .jb-sect-title {
        font-size: 11px; font-weight: 600; color: var(--jb-accent);
        text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px;
        border-bottom: 1px solid var(--jb-border); padding-bottom: 2px;
      }
      .jb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
      .jb-switch {
        display: flex; align-items: center; gap: 6px; padding: 2px 0;
        cursor: pointer; user-select: none; font-size: 11px;
      }
      .jb-switch input[type="checkbox"] {
        appearance: none; -webkit-appearance: none; width: 28px; height: 14px;
        background: var(--jb-switch-off); border-radius: 7px; position: relative;
        cursor: pointer; transition: background .2s; flex-shrink: 0;
      }
      .jb-switch input[type="checkbox"]::after {
        content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px;
        background: #fff; border-radius: 50%; transition: transform .2s;
      }
      .jb-switch input[type="checkbox"]:checked { background: var(--jb-switch-on); }
      .jb-switch input[type="checkbox"]:checked::after { transform: translateX(14px); }
      .jb-timer-grid {
        display: grid; grid-template-columns: 48px 1fr 48px 1fr; gap: 2px 4px;
        font-size: 11px; align-items: center;
      }
      .jb-timer-label { color: var(--jb-text-sec); font-weight: 500; }
      .jb-timer-val { font-weight: 600; min-width: 60px; }
      .jb-footer {
        background: var(--jb-surface-alt); border-top: 1px solid var(--jb-border);
        padding: 6px 10px; font-size: 10px; color: var(--jb-text-sec);
        min-height: 100px; max-height: 100px; overflow: hidden; line-height: 1.5;
      }
      .jb-modal-bg {
        position: fixed; inset: 0; background: rgba(0,0,0,.5);
        z-index: 2147483646; display: none;
      }
      .jb-modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        z-index: 2147483647; display: none; max-height: 85vh;
      }
      .jb-modal.open { display: block; }
      .jb-modal-content {
        background: var(--jb-surface); border: 1px solid var(--jb-border-strong);
        border-radius: 3px; box-shadow: var(--jb-shadow); max-width: 420px; width: 380px;
        max-height: 80vh; overflow-y: auto;
      }
      .jb-modal-body { padding: 12px; font-size: 12px; }
      .jb-input {
        background: var(--jb-input-bg); color: var(--jb-text); border: 1px solid var(--jb-input-border);
        border-radius: 2px; padding: 4px 6px; font-size: 11px; font-family: inherit;
        width: 100%; transition: border-color .15s;
      }
      .jb-input:focus { border-color: var(--jb-accent); outline: none; }
      .jb-input-sm { width: 70px; display: inline-block; }
      .jb-btn {
        background: var(--jb-accent); color: #fff; border: none; border-radius: 2px;
        padding: 4px 12px; font-size: 11px; font-weight: 500; cursor: pointer;
        font-family: inherit; transition: background .15s;
      }
      .jb-btn:hover { background: var(--jb-accent-hover); }
      .jb-btn-danger { background: var(--jb-danger); }
      .jb-btn-danger:hover { background: #c42b31; }
      .jb-btn-outline {
        background: transparent; color: var(--jb-accent); border: 1px solid var(--jb-accent);
      }
      .jb-btn-outline:hover { background: var(--jb-accent-light); }
      /* Tabbed settings. The modal had grown to 18 stacked sections in one
         scroll — finding anything meant hunting. Panes keep the daily-use panel
         (UI 1) untouched and give UI 2 a shape you can navigate. */
      .jb-tabs {
        display: flex; flex-wrap: wrap; gap: 3px;
        margin: -12px -12px 10px -12px; padding: 6px 8px;
        background: var(--jb-surface-alt); border-bottom: 1px solid var(--jb-border);
        position: sticky; top: 0; z-index: 2;
      }
      .jb-tab {
        flex: 1 1 auto; background: transparent; color: var(--jb-text-sec);
        border: 1px solid transparent; border-radius: 3px;
        padding: 4px 6px; font-size: 10px; font-weight: 600; cursor: pointer;
        font-family: inherit; white-space: nowrap; transition: background .15s, color .15s;
      }
      .jb-tab:hover { background: var(--jb-border); color: var(--jb-text); }
      .jb-tab.active {
        background: var(--jb-accent); color: #fff; border-color: var(--jb-accent);
      }
      .jb-pane { display: none; }
      .jb-pane.active { display: block; }

      /* Text size. Much of the panel carries INLINE font-size (9-11px) written
         straight into the markup, so a plain font-size bump on .jb-root moves
         almost nothing. These overrides deliberately use !important — it is the
         only thing that beats an inline style, and legibility beats tidiness.
         The panel widens with the text so nothing wraps into a mess. */
      .jb-root.jb-lg { width: 355px; font-size: 13px; }
      .jb-root.jb-lg .jb-sub, .jb-root.jb-lg .jb-switch,
      .jb-root.jb-lg .jb-timer-grid, .jb-root.jb-lg .jb-input,
      .jb-root.jb-lg label.jb-label, .jb-root.jb-lg .jb-btn,
      .jb-root.jb-lg .jb-ribbon-btn, .jb-root.jb-lg .jb-tab,
      .jb-root.jb-lg .jb-sect-title, .jb-root.jb-lg .jb-footer,
      .jb-root.jb-lg [style*="font-size:9px"], .jb-root.jb-lg [style*="font-size:10px"],
      .jb-root.jb-lg [style*="font-size:11px"] { font-size: 12px !important; }
      .jb-root.jb-lg .jb-timer-grid { grid-template-columns: 56px 1fr 56px 1fr; }

      .jb-root.jb-xl { width: 410px; font-size: 15px; }
      .jb-root.jb-xl .jb-sub, .jb-root.jb-xl .jb-switch,
      .jb-root.jb-xl .jb-timer-grid, .jb-root.jb-xl .jb-input,
      .jb-root.jb-xl label.jb-label, .jb-root.jb-xl .jb-btn,
      .jb-root.jb-xl .jb-ribbon-btn, .jb-root.jb-xl .jb-tab,
      .jb-root.jb-xl .jb-sect-title, .jb-root.jb-xl .jb-footer,
      .jb-root.jb-xl [style*="font-size:9px"], .jb-root.jb-xl [style*="font-size:10px"],
      .jb-root.jb-xl [style*="font-size:11px"] { font-size: 14px !important; }
      .jb-root.jb-xl .jb-timer-grid { grid-template-columns: 64px 1fr 64px 1fr; }
      .jb-root.jb-xl .jb-input-sm { width: 84px; }
      .jb-root.jb-xl .jb-footer { min-height: 120px; max-height: 120px; }
      .jb-sep { border: none; border-top: 1px solid var(--jb-border); margin: 8px 0; }
      .jb-sub { font-size: 10px; color: var(--jb-text-ter); }
      .jb-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
      .jb-flex { display: flex; gap: 6px; align-items: center; }
      .jb-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--jb-text-ter); box-shadow: 0 0 6px currentColor; }
      .jb-mb { margin-bottom: 6px; }
      label.jb-label { font-size: 11px; color: var(--jb-text-sec); font-weight: 500; }
    `;
    _shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'jb-root';
    root.innerHTML = `
      <div class="jb-header" id="jb-drag">
        <span>${APP_NAME} ${APP_VERSION}</span>
        <div class="jb-header-btns">
          <button class="jb-hbtn" id="jb-theme-btn" title="Theme">◑</button>
          <button class="jb-hbtn" id="jb-lock-btn" title="Lock">🔒</button>
          <button class="jb-hbtn" id="jb-settings-btn" title="Settings">⚙</button>
          <button class="jb-hbtn" id="jb-min-btn" title="Minimize">—</button>
        </div>
      </div>

      <div id="jb-panel-body">
        <div class="jb-ribbon">
          <button class="jb-ribbon-btn ${st.crime?'':'off'}" id="jb-r-crime">Crime</button>
          <button class="jb-ribbon-btn ${st.gta?'':'off'}" id="jb-r-gta">GTA</button>
          <button class="jb-ribbon-btn ${st.booze?'':'off'}" id="jb-r-booze">Booze</button>
          <button class="jb-ribbon-btn ${st.jail?'':'off'}" id="jb-r-jail">Jail</button>
          <button class="jb-ribbon-btn ${st.health?'':'off'}" id="jb-r-health">Health</button>
          <button class="jb-ribbon-btn ${st.garage?'':'off'}" id="jb-r-garage">Garage</button>
          <button class="jb-ribbon-btn ${st.autoOC?'':'off'}" id="jb-r-oc" title="Auto-ACCEPT organised crime invites sent to you">OC</button>
          <button class="jb-ribbon-btn ${st.autoDTM?'':'off'}" id="jb-r-dtm" title="Auto-ACCEPT DTM invites sent to you (not the same as Create DTM)">DTM</button>
        </div>

        <div class="jb-body">
          <div class="jb-sect">
            <div class="jb-sect-title">Status</div>
            <div class="jb-grid" style="grid-template-columns: 1fr 1fr;">
              <div class="jb-flex"><span class="jb-timer-label">Player:</span> <span id="jb-player-badge">${esc(st.player||'—')}</span></div>
              <div class="jb-flex"><span class="jb-timer-label">Mod:</span><span id="jb-mod-light" title="Staff watch state" style="display:inline-flex;align-items:center;gap:5px"><span class="jb-status-dot" id="jb-mod-light-dot" style="color:var(--jb-text-ter)"></span><span id="jb-mod-light-text" style="font-size:9px;letter-spacing:0.02em">off</span></span></div>
              <div class="jb-flex">
                <label class="jb-switch"><input type="checkbox" id="jb-all-toggle"> <span style="font-weight:600" id="jb-all-label">ALL</span></label>
              </div>
              <div class="jb-flex" style="justify-content:flex-end; min-width:0;">
                <label class="jb-switch" title="Stop attempting jail busts while staff are online. Jail runs every few seconds by default, so it is by far the noisiest thing Jarvis does — nothing else is suppressed."><input type="checkbox" id="jb-mod-nojail" ${cfg.noJailOnMod?'checked':''}> ⛓️ No Jail on Mod</label>
              </div>
            </div>
          </div>

          <div class="jb-sect">
            <div class="jb-sect-title">Timers</div>
            <div class="jb-timer-grid">
              <span class="jb-timer-label">HP:</span>
              <span class="jb-timer-val" id="jb-hp">${_timerCache.hp||'—'}</span>
              <span class="jb-timer-label">Travel:</span>
              <span class="jb-timer-val" id="jb-travel">${_timerCache.travel||'—'}</span>
              <span class="jb-timer-label">OC:</span>
              <span class="jb-timer-val" id="jb-oc">${_timerCache.oc||'—'}</span>
              <span class="jb-timer-label">DTM:</span>
              <span class="jb-timer-val" id="jb-dtm">${_timerCache.dtm||'—'}</span>
              <span class="jb-timer-label">Prot:</span>
              <span class="jb-timer-val" id="jb-prot">${_timerCache.prot||'—'}</span>
              <span class="jb-timer-label">Hot:</span>
              <span class="jb-timer-val" id="jb-hot-display" style="font-size:10px">${getHot()||'—'}</span>
            </div>
          </div>

          <div class="jb-sect">
            <div class="jb-sect-title" style="display:flex;justify-content:space-between;align-items:center">
              <span>Experience</span>
              <span id="jb-xp-charts-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent);font-size:10px;font-weight:500">📈 Charts</span>
            </div>
            <div class="jb-timer-grid">
              <span class="jb-timer-label">Rank:</span>
              <span class="jb-timer-val" id="jb-rank-name" style="font-size:11px">—</span>
              <span class="jb-timer-label">Total:</span>
              <span class="jb-timer-val" id="jb-xp-total">—</span>
              <span class="jb-timer-label">Session:</span>
              <span class="jb-timer-val" id="jb-xp-session">—</span>
              <span class="jb-timer-label">Rate:</span>
              <span class="jb-timer-val" id="jb-xp-rate">—</span>
              <span class="jb-timer-label">Last:</span>
              <span class="jb-timer-val" id="jb-xp-last" style="font-size:10px">—</span>
            </div>
            <div style="margin-top:5px">
              <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--jb-text-ter);margin-bottom:2px">
                <span id="jb-rank-pct">—</span>
                <span id="jb-rank-tonext"></span>
              </div>
              <div style="background:var(--jb-border);border-radius:3px;height:7px;overflow:hidden">
                <div id="jb-rank-bar" style="height:100%;width:0%;background:var(--jb-accent);border-radius:3px;transition:width .3s"></div>
              </div>
            </div>
          </div>

          <div class="jb-sect">
            <div class="jb-grid">
              <div class="jb-switch" title="Crusher for owned cars"><input type="checkbox" id="jb-crusher"> Crusher</div>
              <div class="jb-switch" title="START a DTM yourself and invite a partner. Click the text to set the partner, schedule and repeat."><input type="checkbox" id="jb-create-dtm"> <span id="jb-dtm-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">Create DTM</span></div>
              <div class="jb-switch"><input type="checkbox" id="jb-wl-on"> <span id="jb-wl-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">Whitelist</span></div>
              <div class="jb-switch"><input type="checkbox" id="jb-create-oc"> <span id="jb-oc-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">Create OC</span></div>
              <div class="jb-switch" title="Master switch for Online Watch — off means neither group can fire. Enable/disable Group 1 and Group 2 individually inside the Watch window."><input type="checkbox" id="jb-ow-on"> <span id="jb-ow-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">🟢 Watch</span></div>
              <label class="jb-switch" title="Property drop watch"><input type="checkbox" id="jb-prop-on"> 🏠 Props</label>
              <label class="jb-switch" title="Player hover tooltip (reload to apply)"><input type="checkbox" id="jb-hover-on"> 🔍 Hover</label>
              <label class="jb-switch" title="Colour player links from your Starvinggeeks lists — watched (orange), safe (green), allied (blue). Read-only: three GETs, nothing is ever sent."><input type="checkbox" id="jb-sg-on"> 🎨 SG lists <span id="jb-sg-status" style="font-size:9px;letter-spacing:0.02em">—</span></label>
              <label class="jb-switch"><input type="checkbox" id="jb-notify-ready"> 🔔 Alerts</label>
              <label class="jb-switch"><input type="checkbox" id="jb-auto-travel" ${st.autoTravel?'checked':''}> ✈️ Auto Travel</label>
              <label class="jb-switch" title="ADVERTISE yourself on the DTM list (ocads.aspx) when a DTM is ready, so others can invite you"><input type="checkbox" id="jb-auto-dtmlist" ${st.autoDtmList?'checked':''}> 📋 DTM List</label>
              <label class="jb-switch" title="PANIC: hide inside your network HQ so you can't be shot. Pauses everything else, re-enters until the cap, then switches itself off. Never enters a damaged HQ — if it's destroyed while you're inside, you die."><input type="checkbox" id="jb-holdhq-on" ${cfg.holdHqOn?'checked':''}> 🏠 Hold HQ</label>
            </div>
          </div>
        </div>
      </div>

      <div class="jb-jail-counter" id="jb-jail-counter-row" style="display:flex;justify-content:space-between;align-items:center;padding:3px 10px;font-size:10px;border-top:1px solid var(--jb-border);color:var(--jb-text-ter)">
        <span>⛓️ Jail attempts today:</span>
        <span><span id="jb-jail-hold" style="color:var(--jb-warning)"></span><span id="jb-jail-count" style="font-weight:600">0/2000</span></span>
      </div>

      <div id="jb-daily-row" style="display:none;justify-content:space-between;align-items:center;padding:3px 10px;font-size:10px;border-top:1px solid var(--jb-border);color:var(--jb-text-ter)" title="Attempts today, counted whether or not limits are switched on. A limit is shown as n/limit.">
        <span>📅 Today:</span>
        <span id="jb-daily-counts" style="font-weight:600"></span>
      </div>

      <div id="jb-dtmkick-row" style="display:none;justify-content:space-between;align-items:center;padding:3px 10px;font-size:10px;border-top:1px solid var(--jb-border);color:var(--jb-text-ter)">
        <span>🥾 DTM partner:</span>
        <span id="jb-dtmkick" style="font-weight:600"></span>
      </div>

      <div id="jb-hq-row" style="display:none;justify-content:space-between;align-items:center;padding:3px 10px;font-size:10px;border-top:1px solid var(--jb-border);color:var(--jb-text-ter)">
        <span>🏠 Hold HQ:</span>
        <span id="jb-hq-state" style="font-weight:600"></span>
      </div>

      <div class="jb-footer" id="jb-status">Ready</div>

      <div class="jb-modal-bg" id="jb-backdrop"></div>
      <div class="jb-modal" id="jb-settings-modal">
        <div class="jb-modal-content">
          <div class="jb-modal-head">
            <span>Settings</span>
            <button class="jb-hbtn" id="jb-modal-close">✕</button>
          </div>
          <div class="jb-modal-body" id="jb-settings-body">
            <div class="jb-tabs" id="jb-tabs">
              <button class="jb-tab" data-tab="actions">⚡ Actions</button>
              <button class="jb-tab" data-tab="assets">🏪 Assets</button>
              <button class="jb-tab" data-tab="alerts">🔔 Alerts</button>
              <button class="jb-tab" data-tab="human">🕵️ Human</button>
              <button class="jb-tab" data-tab="system">⚙️ System</button>
            </div>
            <div class="jb-pane" data-pane="actions">
            <div class="jb-sect-title">Action selection</div>
            <label class="jb-switch jb-mb" title="OFF = pick at random from the crimes you've ticked, and buy/sell fixed booze amounts. ON = pick the most valuable crime still succeeding at or above the threshold below, buy your full rank carry limit of booze, and sell it one unit at a time."><input type="checkbox" id="jb-smartpick" ${cfg.smartPick?'checked':''}> 🎯 <span id="jb-smartpick-label">${cfg.smartPick?'Smart (best value)':'Random (spread)'}</span></label>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Min success %:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-smart-minpct" value="${cfg.smartMinPct}" min="0" max="100" step="5">
              <span class="jb-sub" id="jb-smart-preview">—</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Smart takes the <b>most valuable</b> crime still at or above that success rate — not simply the safest. At high rank the odds barely differ (sampled 97/95/94/94/90%), so picking on odds alone would always choose the cheapest crime. The game re-rolls the odds every visit, so this is re-decided from the live page each time: on a bad roll it steps down to the best crime that's safe enough, and back up next visit. The preview above is a snapshot of right now. Raise to play safer, lower to reach for bigger jobs.<br><b>Booze:</b> smart buys your full rank carry limit (10 + rank level², so 35 at Criminal) and then sells <b>one at a time</b> — the XP is per sale, not per unit, so a full load sold singly earns it once per unit instead of once per batch.</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Daily counts &amp; limits</div>
            <label class="jb-switch jb-mb" title="Counting always runs. This switch only decides whether hitting a limit turns the action off for the rest of the game-day."><input type="checkbox" id="jb-daily-on" ${cfg.dailyLimitOn?'checked':''}> 📅 Enforce the limits below</label>
            <div class="jb-row">
              <label class="jb-label" style="width:46px">👜 Crime</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-daily-crime" value="${cfg.dailyLimitCrime}" min="0" max="10000" step="10">
              <label class="jb-label" style="width:38px">🏎️ GTA</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-daily-gta" value="${cfg.dailyLimitGta}" min="0" max="10000" step="10">
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="width:46px">🍺 Booze</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-daily-booze" value="${cfg.dailyLimitBooze}" min="0" max="10000" step="10">
              <span class="jb-sub">0 = unlimited · resets 00:00 game time</span>
            </div>
            <div class="jb-sub jb-mb" id="jb-daily-status" style="color:var(--jb-text-ter);font-size:9px">Jail has its own limit in the Jail section.</div>
            <div class="jb-sub" style="font-weight:600;color:var(--jb-text-sec)">Observed daily totals</div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Attempts are counted every day whether limits are enforced or not, so you can see what the game actually allows before choosing a number. <b>The cap moves with rank</b> — "This rank" only counts days played at <b id="jb-daily-rank">—</b>, so re-read it after each rank-up. Leave the limits at 0 for a few full days first; a day that ended early tells you nothing.</div>
            <div id="jb-daily-research" style="background:var(--jb-surface-alt);border-radius:3px;padding:6px"></div>
            <div class="jb-row jb-mb" style="margin-top:6px">
              <button class="jb-btn jb-btn-outline" id="jb-daily-suggest" style="padding:2px 8px;font-size:9px">Use observed peaks</button>
              <button class="jb-btn jb-btn-outline" id="jb-daily-hist-reset" style="padding:2px 8px;font-size:9px">Clear history</button>
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Crimes</div>
            <div id="jb-crime-opts" class="jb-mb"></div>
            <div class="jb-row">
              <label class="jb-label">Interval (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-crime-int" value="${cfg.crimeInt}" min="1" max="999">
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">GTA</div>
            <div id="jb-gta-opts" class="jb-mb"></div>
            <div class="jb-row">
              <label class="jb-label">Interval (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-gta-int" value="${cfg.gtaInt}" min="1" max="999">
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Booze</div>
            <div class="jb-row">
              <label class="jb-label">Interval (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-booze-int" value="${cfg.boozeInt}">
              <label class="jb-label">Buy:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-booze-buy" value="${cfg.boozeBuy}">
              <label class="jb-label">Sell:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-booze-sell" value="${cfg.boozeSell}">
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Jail</div>
            <div class="jb-row">
              <label class="jb-label">Interval (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-jail-int" value="${cfg.jailInt}">
            </div>
            <div class="jb-row">
              <label class="jb-label">Daily limit:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-jail-limit" value="${cfg.jailDailyLimit}" min="50" max="4000" step="50">
              <span class="jb-sub">(50–4000)</span>
            </div>
            <div class="jb-row" title="Don't start a jail bust when a crime, GTA, booze or auto-travel is due within this many seconds — a failed bust jails you and blocks that action. Slide to 0 to disable.">
              <label class="jb-label" style="white-space:nowrap">Yield to actions:</label>
              <input type="range" id="jb-jailyield" min="0" max="90" step="5" value="${cfg.jailYieldSec}" style="flex:1;accent-color:var(--jb-accent)">
              <span class="jb-sub" id="jb-jailyield-val" style="min-width:30px;text-align:right">${cfg.jailYieldSec}s</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">0 = never yield, jail competes with everything else.</div>
            <label class="jb-switch jb-mb" title="After getting out of jail, wait a random gap before resuming. Carrying straight on the instant you're released is an obvious tell."><input type="checkbox" id="jb-jaildelay-on" ${cfg.jailDelayOn?'checked':''}> ⏳ Pause after release</label>
            <div class="jb-row jb-mb">
              <label class="jb-label">Wait:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-jaildelay-min" value="${cfg.jailDelayMin}" min="0" max="600">
              <span class="jb-sub">to</span>
              <input class="jb-input jb-input-sm" type="number" id="jb-jaildelay-max" value="${cfg.jailDelayMax}" min="0" max="600">
              <span class="jb-sub">s</span>
            </div>
            <div class="jb-sub jb-mb">Today: <span id="jb-jail-count-settings">${getJailCount()}/${cfg.jailDailyLimit}</span> · resets 00:00 game time
              <button class="jb-btn jb-btn-outline" id="jb-jail-reset" style="margin-left:6px;padding:1px 6px;font-size:9px">Reset now</button>
            </div>
            </div>
            <div class="jb-pane" data-pane="assets">
            <div class="jb-sect-title">Health</div>
            <div class="jb-row">
              <label class="jb-label">Min %:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-min-hp" value="${cfg.minHealth}" min="1" max="99">
              <label class="jb-label">Target %:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-target-hp" value="${cfg.targetHealth}" min="10" max="100">
            </div>
            <label class="jb-switch jb-mb" title="Heal via background POSTs to the credits page instead of navigating there. Works from any page, doesn't interrupt an action, and tops up in one go."><input type="checkbox" id="jb-bgheal" ${cfg.bgHealOn?'checked':''}> 💊 Background heal (no navigation)</label>
            <div class="jb-row jb-mb">
              <button class="jb-btn jb-btn-outline" id="jb-heal-now" style="padding:2px 8px;font-size:10px">Heal now</button>
              <span class="jb-sub" id="jb-heal-status">Buys repeatedly until Target %, or credits run out.</span>
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Shot response</div>
            <label class="jb-switch jb-mb" title="Alert on the game's &quot;you got shot&quot; mail, naming the shooter, the ammunition and the health lost."><input type="checkbox" id="jb-shot-alert" ${cfg.shotAlertOn?'checked':''}> 💥 Alert when you're shot</label>
            <label class="jb-switch jb-mb" title="On a shot that COST HEALTH: heal to 100%, then hide inside your network HQ. All background requests — it never navigates. Never enters a damaged HQ: if it's destroyed while you're inside, you die."><input type="checkbox" id="jb-shot-retreat" ${cfg.shotRetreatOn?'checked':''}> 🛡️ Heal &amp; retreat to HQ</label>
            <label class="jb-switch jb-mb" title="If the HQ is in another city, buy a jail reset and a travel reset and fly there by private jet. This SPENDS CREDITS every time, which is why it is separate from the retreat itself."><input type="checkbox" id="jb-shot-travel" ${cfg.shotTravelOn?'checked':''}> ✈️ Travel to the HQ (spends credits)</label>
            <div class="jb-sub jb-mb">Healing always happens first — every later step can refuse (no HQ city known, wrong city, damaged HQ), so the part that always helps never sits behind them. A shot that cost no health gets no response.</div>

            <hr class="jb-sep">
            <div class="jb-sect-title">Garage</div>
            <div class="jb-row">
              <label class="jb-label">Interval (min):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-garage-int" value="${Math.round(cfg.garageInt/60)}" min="1" max="120">
            </div>
            <div class="jb-mb jb-sub">Crusher: <span id="jb-crush-st">${st.crusherOwned===false?'Not owned':st.crusherOwned===true?'Owned':'Unknown'}</span>
              <button class="jb-btn jb-btn-outline" id="jb-crush-reset" style="margin-left:6px;padding:2px 6px;font-size:10px;">Reset</button>
            </div>

            <div class="jb-sub jb-mb">Per-car category — choose what happens to each car:</div>
            <div style="background:var(--jb-surface-alt);border-radius:3px;padding:6px;max-height:200px;overflow-y:auto;">
              <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:3px 8px;align-items:center;font-size:10px;">
                <div style="color:var(--jb-text-sec);font-weight:600">Car</div>
                <div style="color:var(--jb-success);font-weight:600;text-align:center" title="Keep & repair for OC">OC</div>
                <div style="color:var(--jb-warning);font-weight:600;text-align:center" title="Send to crusher">Crush</div>
                <div style="color:var(--jb-danger);font-weight:600;text-align:center" title="Sell immediately">Sell</div>
                ${CARS.map(car => {
                  const sid = car.name.replace(/[^A-Za-z0-9]/g,'');
                  if (car.manual) return `<div style="color:var(--jb-text-ter);font-style:italic">${car.name} 🔧</div><div style="grid-column:2/span 3;text-align:center;color:var(--jb-text-ter);font-size:9px">Manual only</div>`;
                  const cat = car.locked ? car.def : ((st.carCats && st.carCats[car.name]) || car.def);
                  const dis = car.locked ? 'disabled' : '';
                  const lock = car.locked ? ' 🔒' : '';
                  const sty = car.locked ? 'color:var(--jb-text-ter);font-style:italic' : 'color:var(--jb-text)';
                  return `<div style="${sty}">${car.name}${lock}</div>
                    <div style="text-align:center"><input type="radio" name="jb-cc-${sid}" data-car="${car.name}" value="OC" ${cat==='OC'?'checked':''} ${dis}></div>
                    <div style="text-align:center"><input type="radio" name="jb-cc-${sid}" data-car="${car.name}" value="Crush" ${cat==='Crush'?'checked':''} ${dis}></div>
                    <div style="text-align:center"><input type="radio" name="jb-cc-${sid}" data-car="${car.name}" value="Sell" ${cat==='Sell'?'checked':''} ${dis}></div>`;
                }).join('')}
              </div>
              <button class="jb-btn jb-btn-outline" id="jb-cc-reset" style="margin-top:6px;font-size:9px;padding:2px 8px">Reset to defaults</button>
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Scrap → FMJ</div>
            <label class="jb-switch jb-mb" title="Converts scrap into bullets at store.aspx?p=s — 5 scrap per 1000 FMJ. One purchase per page load to stay under the game's ~2s rate limit."><input type="checkbox" id="jb-scrap-on" ${cfg.scrapOn?'checked':''}> ♻️ Convert scrap to FMJ</label>
            <label class="jb-switch jb-mb" title="Armoured Vehicle protection costs 5 scrap. The link only appears while you don't own it, so it is bought once, before any bullets. This works on its own — the scrap-to-FMJ switch above does NOT have to be on."><input type="checkbox" id="jb-scrap-prot" ${cfg.scrapProt?'checked':''}> 🛡️ Buy Armoured Vehicle protection first</label>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Keep at least:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-scrap-floor" value="${cfg.scrapFloor}" min="5" max="10000" step="5">
              <span class="jb-sub">scrap in reserve</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Below the reserve it stops and re-checks in 6 hours. <b>The reserve does not block the Armoured Vehicle</b> — that is a one-off 5-scrap purchase and is made before the reserve is considered. Converted so far: <span id="jb-scrap-runs">${GM_getValue('cbScrapRuns',0)}</span>k FMJ.</div>
            </div>
            <div class="jb-pane" data-pane="alerts">
            <div class="jb-sect-title">Telegram</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-tg-on" ${tg.enabled?'checked':''}> Enable</label>
            <div class="jb-mb">
              <label class="jb-label">Bot Token</label>
              <input class="jb-input" id="jb-tg-token" value="${esc(tg.token)}" placeholder="From @BotFather">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Chat ID</label>
              <input class="jb-input" id="jb-tg-chat" value="${esc(tg.chat)}" placeholder="From @userinfobot">
            </div>
            <div class="jb-row" title="How often the inbox is polled in the background. This is the ONLY thing that spots new mail while Jarvis is idle — the on-page envelope only updates when a page loads, so with jail off and Away cadence the page can sit still for many minutes.">
              <label class="jb-label" style="white-space:nowrap">Mail check (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-msg-int" value="${tg.msgCheckInt}" min="15" max="300" step="5">
              <span class="jb-sub">15–300</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Lower = faster mail and staff-check alerts when idle.</div>
            <div class="jb-grid jb-mb">
              <label class="jb-switch"><input type="checkbox" id="jb-tg-captcha" ${tg.captcha?'checked':''}> Script Check</label>
              <label class="jb-switch"><input type="checkbox" id="jb-tg-msgs" ${tg.messages?'checked':''}> Messages</label>
              <label class="jb-switch"><input type="checkbox" id="jb-tg-st" ${tg.scriptTest?'checked':''}> Script test 5x</label>
              <label class="jb-switch"><input type="checkbox" id="jb-tg-staff" ${tg.staffMail?'checked':''}> Staff mail 5x</label>
              <label class="jb-switch"><input type="checkbox" id="jb-tg-sql" ${tg.sqlCheck?'checked':''}> SQL/Staff page</label>
              <label class="jb-switch"><input type="checkbox" id="jb-tg-logout" ${tg.logout?'checked':''}> Logout</label>
            </div>
            <button class="jb-btn" id="jb-tg-test">Test Connection</button>

            <div class="jb-sub" style="margin-top:8px;font-weight:600;color:var(--jb-text-sec)">Per-message alerts</div>
            <div class="jb-row" style="gap:4px;margin-bottom:4px">
              <button class="jb-btn jb-btn-outline" id="jb-tgmsg-all" style="flex:1;padding:2px;font-size:9px">All On</button>
              <button class="jb-btn jb-btn-outline" id="jb-tgmsg-none" style="flex:1;padding:2px;font-size:9px">All Off</button>
            </div>
            <div style="background:var(--jb-surface-alt);border-radius:3px;padding:6px;max-height:180px;overflow-y:auto">
              <div class="jb-grid" id="jb-tgmsg-grid">
                ${TG_MSGS.map(m => `<label class="jb-switch" style="font-size:10px"><input type="checkbox" class="jb-tgmsg-cb" data-key="${m.key}" ${tgMsgOn[m.key]?'checked':''}> ${m.label}</label>`).join('')}
              </div>
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Discord</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-dc-on" ${dc.enabled?'checked':''}> 🎮 Send to a Discord webhook</label>
            <div class="jb-mb">
              <label class="jb-label">Webhook URL</label>
              <input class="jb-input" id="jb-dc-url" value="${esc(dc.url)}" placeholder="https://discord.com/api/webhooks/…">
              <div class="jb-sub" id="jb-dc-url-state" style="font-size:9px"></div>
            </div>
            <div class="jb-grid jb-mb">
              <label class="jb-switch"><input type="checkbox" id="jb-dc-rankup" ${dc.rankup?'checked':''}> ⭐ Rank ups</label>
              <label class="jb-switch"><input type="checkbox" id="jb-dc-witness" ${dc.witness?'checked':''}> 👁️ Witness</label>
              <label class="jb-switch" title="Script checks, staff mail and anti-bot messages — the ban-risk ones. Posted in red with sirens, once each."><input type="checkbox" id="jb-dc-critical" ${dc.critical?'checked':''}> 🚨 Script/staff checks</label>
            </div>
            <div class="jb-mb">
              <label class="jb-label">Ping on a script check (optional)</label>
              <input class="jb-input" id="jb-dc-mention" value="${esc(dc.mention)}" placeholder="&lt;@your-user-id&gt;  ·  @here  ·  @everyone">
              <div class="jb-sub" style="font-size:9px;color:var(--jb-text-ter)">An embed on its own is <b>silent</b> — a mention is the only part that actually pushes a notification to your phone, so this is the "flashing light". Your own user ID (<code>&lt;@123456789&gt;</code>, from right-click → Copy User ID with Developer Mode on) pings only you. <b>@everyone pings the whole server</b> — don't use it in a channel other people read.</div>
            </div>
            <label class="jb-switch jb-mb" title="Leave this ON. Each device is a DIFFERENT player, so its posts are that player's own events — turning it off just silences that account. It is not a duplicate guard."><input type="checkbox" id="jb-dc-device" ${dc.thisDevice?'checked':''}> 📮 Post from <b>this</b> device</label>
            <button class="jb-btn" id="jb-dc-test">Test Discord</button>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px;margin-top:6px"><b>Each event posts once.</b> Rank-ups are keyed by the rank change and witness statements by their mail, so neither can post twice however often it is re-detected, and only the master tab posts. Your <b>other devices are different players</b>, so their posts are their own events, not copies of yours — <b>leave "post from this device" ON everywhere</b>. Switch it off only if you want that particular account to stop posting.<br>Independent of Telegram; they share the retry queue, so a post interrupted by a page change is redelivered rather than lost.<br><b>The URL is stored on this device only</b> and is deliberately not built into the script: this repo is public and the script is served raw from GitHub, so a webhook in the source would be one anyone could post to.</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Ready reminders</div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">The OC/DTM ready alert fires once. Miss it and a finished 2h cooldown can sit unused all evening with nothing to say so. These re-ping while it is <b>still</b> ready, and stop the moment you use it.</div>
            <div class="jb-row">
              <label class="jb-label" style="white-space:nowrap">Remind every:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-ready-every" value="${cfg.readyRepeatMin}" min="0" max="240" step="5">
              <span class="jb-sub">min · 0 = off</span>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Give up after:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-ready-max" value="${cfg.readyRepeatMax}" min="0" max="20">
              <span class="jb-sub">reminders</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Silent while you're in jail, paused, or on a break — you couldn't act on it anyway, and the reminder is still owed when you're free. The "OC/DTM still ready" switch in the per-message grid above turns them off entirely.</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Logout Alerts</div>
            <div class="jb-grid jb-mb">
              <label class="jb-switch"><input type="checkbox" id="jb-lo-flash" ${logoutAlert.tabFlash?'checked':''}> Tab Flash</label>
              <label class="jb-switch"><input type="checkbox" id="jb-lo-notify" ${logoutAlert.notify?'checked':''}> Browser Notify</label>
            </div>
            </div>
            <div class="jb-pane" data-pane="human">
            <div class="jb-sect-title">Breaks (Human Simulation)</div>

            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-coffee-on" ${breaks.coffeeOn?'checked':''}> ☕ Coffee Breaks</label>
            <div class="jb-row">
              <label class="jb-label">Every:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-coffee-min" value="${breaks.coffeeMinGap}" min="10" max="180">
              <span class="jb-sub">to</span>
              <input class="jb-input jb-input-sm" type="number" id="jb-coffee-max" value="${breaks.coffeeMaxGap}" min="20" max="300">
              <span class="jb-sub">min</span>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Duration:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-coffee-dur" value="${breaks.coffeeDuration}" min="1" max="15">
              <span class="jb-sub">min</span>
            </div>

            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-lunch-on" ${breaks.lunchOn?'checked':''}> 🍔 Lunch Break</label>
            <div class="jb-row">
              <label class="jb-label">Time:</label>
              <input class="jb-input jb-input-sm" type="time" id="jb-lunch-time" value="${breaks.lunchTime}" style="width:90px">
              <label class="jb-label">Dur:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-lunch-dur" value="${breaks.lunchDuration}" min="5" max="120">
              <span class="jb-sub">min</span>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Jitter ±</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-lunch-jitter" value="${breaks.lunchJitter}" min="0" max="30">
              <span class="jb-sub">min</span>
              <select class="jb-input" id="jb-lunch-mode" style="width:80px">
                <option value="daily" ${breaks.lunchMode==='daily'?'selected':''}>Daily</option>
                <option value="once" ${breaks.lunchMode==='once'?'selected':''}>Once</option>
              </select>
            </div>

            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-sleep-on" ${breaks.sleepOn?'checked':''}> 😴 Sleep / Wake</label>
            <div class="jb-row">
              <label class="jb-label">Sleep:</label>
              <input class="jb-input jb-input-sm" type="time" id="jb-sleep-time" value="${breaks.sleepTime}" style="width:90px">
              <label class="jb-label">Wake:</label>
              <input class="jb-input jb-input-sm" type="time" id="jb-wake-time" value="${breaks.wakeTime}" style="width:90px">
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Jitter ±</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-sleep-jitter" value="${breaks.sleepJitter}" min="0" max="30">
              <span class="jb-sub">min</span>
              <select class="jb-input" id="jb-sleep-mode" style="width:90px">
                <option value="daily" ${breaks.sleepMode==='daily'?'selected':''}>Daily</option>
                <option value="weekdays" ${breaks.sleepMode==='weekdays'?'selected':''}>Weekdays</option>
                <option value="weekends" ${breaks.sleepMode==='weekends'?'selected':''}>Weekends</option>
              </select>
            </div>
            <label class="jb-switch jb-mb" title="Signs out properly when the sleep window opens, instead of leaving the session open to time out. Logs back in automatically at wake time."><input type="checkbox" id="jb-sleep-logout" ${breaks.sleepLogout?'checked':''}> Log out on sleep</label>
            <div class="jb-sub jb-mb" style="color:var(--jb-warning)">⚠️ Health is monitored during coffee/lunch breaks. With "Logout on sleep" ON, no health monitoring while logged out overnight.</div>
            <div class="jb-sub jb-mb" id="jb-break-status">Break status: ${getBreakStatus().msg||'None active'}</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Staff / mod online</div>
            <label class="jb-switch jb-mb" title="Reads the players page for anyone the game itself highlights as staff. Runs independently of Online Watch — you don't need Watch on for this."><input type="checkbox" id="jb-mod-on" ${cfg.modWatchOn?'checked':''}> 👮 Watch for staff online</label>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Check every:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-mod-poll" value="${cfg.modPollSec}" min="30" max="600" step="30">
              <span class="jb-sub">s</span>
            </div>
            <label class="jb-switch jb-mb" title="The blunt option: when staff come online, stop everything for a random 1-2 hours."><input type="checkbox" id="jb-mod-break" ${cfg.modBreakOn?'checked':''}> 🛑 Take a break when staff come online</label>
            <div class="jb-row">
              <label class="jb-label">Break:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-mod-break-min" value="${cfg.modBreakMin}" min="1" max="600">
              <span class="jb-sub">to</span>
              <input class="jb-input jb-input-sm" type="number" id="jb-mod-break-max" value="${cfg.modBreakMax}" min="1" max="600">
              <span class="jb-sub">min</span>
            </div>
            <label class="jb-switch jb-mb" title="Log out for the duration as well, instead of idling on the page. Auto-login is suppressed for the same period so it can't sign straight back in."><input type="checkbox" id="jb-mod-break-logout" ${cfg.modBreakLogout?'checked':''}> 🚪 Log out for the break</label>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Staff are detected by <b>the game's own highlight</b> on the players page (the orange name), so this covers every moderator rather than a list of names we'd have to keep up to date. <b>Marc is ignored</b> — the owner's account is highlighted essentially always, and counting it would leave this permanently triggered. A failed or stale check suppresses <b>nothing</b>: it fails open deliberately, because a silent all-day halt caused by a network blip is far worse than one unsuppressed bust. Jail shows <b>⏸M</b> in the status line while held.</div>
            <div class="jb-sub jb-mb" id="jb-mod-status">Not checked yet</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Hold HQ (panic)</div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">The switch is on the front panel — it's a panic button, so it lives where you can reach it. These are its limits.</div>
            <div class="jb-row">
              <label class="jb-label" style="white-space:nowrap">Enter for:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-hq-mins" value="${cfg.holdHqMins}" min="1" max="60">
              <span class="jb-sub">min at a time</span>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Give up after:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-hq-max" value="${cfg.holdHqMax}" min="1" max="50">
              <span class="jb-sub">entries, then switch off</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px"><b>It never enters a damaged HQ</b> — if the building is destroyed while you're inside it, you die, so a non-zero damage reading means it refuses and alerts instead. <b>It won't travel for you</b> either: wrong city and it says so and waits, because travel has its own long cooldown and stranding you somewhere under fire should be your call. And it <b>switches itself off at the cap</b> — left on and forgotten this would idle away a whole day.</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Forum refresh (camouflage)</div>
            <label class="jb-switch jb-mb" title="Touches the forum on a jittered hourly schedule, like a real session would."><input type="checkbox" id="jb-forum-on" ${cfg.forumRefreshOn?'checked':''}> 🌐 Hourly forum refresh</label>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Roughly every:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-forum-min" value="${cfg.forumRefreshMin}" min="5" max="1440" step="5">
              <span class="jb-sub">min · ±25% jitter</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">This <b>fetches</b> the forum rather than navigating to it. The forum is on Jarvis's excluded-pages list, so actually going there would stop the script dead and leave the tab sitting on it. A background request produces the same thing server-side.</div>
            </div>
            <div class="jb-pane" data-pane="system">
            <div class="jb-sect-title">Appearance</div>
            <div class="jb-row">
              <label class="jb-label" style="white-space:nowrap">Colour scheme:</label>
              <select class="jb-input" id="jb-theme-sel" style="flex:1">
                ${THEME_LIST.map(([k,l]) => `<option value="${k}" ${activeTheme===k?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Text size:</label>
              <select class="jb-input" id="jb-uisize-sel" style="flex:1">
                <option value="n" ${cfg.uiSize==='n'?'selected':''}>Normal</option>
                <option value="l" ${cfg.uiSize==='l'?'selected':''}>Large</option>
                <option value="x" ${cfg.uiSize==='x'?'selected':''}>Largest</option>
              </select>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">The ◑ button in the title bar cycles the same schemes. <b>High contrast</b> is the one to reach for if anything is hard to read; <b>Amber</b> is warmer for long evenings. Larger text also widens the panel so nothing wraps.</div>

            <hr class="jb-sep">
            <div class="jb-sect-title">Login</div>
            <div class="jb-mb">
              <label class="jb-label">Username</label>
              <input class="jb-input" id="jb-login-user" value="${esc(LOGIN.user)}">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Password</label>
              <input class="jb-input" id="jb-login-pass" type="text" value="${esc(LOGIN.pass)}">
            </div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-auto-submit" ${LOGIN.autoSubmit?'checked':''}> Auto-submit</label>
            <div class="jb-mb">
              <label class="jb-label">CapSolver key (optional — auto-solves captcha; blank = manual)</label>
              <input class="jb-input" id="jb-capsolver-key" type="text" value="${esc(getCapsolverKey())}" placeholder="CAP-… (paid service)">
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Keep-alive (anti-throttle)</div>
            <label class="jb-switch jb-mb" title="Silent inaudible tone — stops the browser throttling this tab in the background. Most effective option."><input type="checkbox" id="jb-ka-audio" ${ka.audio?'checked':''}> 🔊 Silent audio</label>
            <label class="jb-switch jb-mb" title="Stops the screen sleeping while this tab is visible. Does not prevent the PC sleeping."><input type="checkbox" id="jb-ka-wake" ${ka.wakeLock?'checked':''}> 💡 Screen wake lock</label>
            <label class="jb-switch jb-mb" title="Background worker ticker — keeps the loop and master heartbeat alive when timers are throttled."><input type="checkbox" id="jb-ka-worker" ${ka.worker?'checked':''}> ⚙️ Worker ticker</label>
            <div class="jb-label" style="opacity:.75;line-height:1.5">Note: nothing here can keep running if Windows sleeps. Set power mode to Never sleep, and in Chrome add tmn2010.net to "Always keep these sites active" under Performance.</div>
            <label class="jb-switch jb-mb" title="Verbose console logging for diagnostics. Off keeps the console quiet (real events still log)."><input type="checkbox" id="jb-debug" ${_debug?'checked':''}> 🐛 Verbose debug logging</label>
            <hr class="jb-sep">
            <div class="jb-sect-title">Performance (low-RAM devices)</div>
            <div class="jb-sub jb-mb" style="line-height:1.5">For an old tablet: raise these to cut memory and CPU. Everything else costly — Hover, SG lists, Props, Silent audio, Worker ticker — already has its own switch on the panel or above.</div>
            <div class="jb-row">
              <label class="jb-label" style="white-space:nowrap">Panel refresh (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-perf-disp" value="${cfg.timerDispSec}" min="2" max="60">
              <span class="jb-sub">2–60 · default 5</span>
            </div>
            <div class="jb-row">
              <label class="jb-label" style="white-space:nowrap">Background polls (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-perf-poll" value="${cfg.bgPollSec}" min="30" max="900" step="30">
              <span class="jb-sub">30–900 · default 60</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Each background poll parses a whole page into memory (OC, DTM, travel; protection at 2× this). Biggest single lever on a slow device, and nothing is lost by raising it.</div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Advanced</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-resume" ${resume.on?'checked':''}> Auto-Resume</label>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-stats-on" ${stats.on?'checked':''}> Stats Collection</label>
            <label class="jb-switch jb-mb" title="Backstop for when the game's exact XP feed goes quiet: derives XP from the status-bar rank %, which is server-rendered on every page load. It STANDS DOWN whenever an exact reading has arrived in the last 10 minutes — it is rounded to the rank's step (0.3 XP at Global Dominator), so it must never compete with the real figures."><input type="checkbox" id="jb-xpbar-on" ${GM_getValue('cbXpBarOn',true)!==false?'checked':''}> 📊 Status-bar XP fallback</label>
            <div class="jb-row" title="How often to read your XP. The game's own page polls every 15 seconds while it sits open, and Jarvis fires the identical request — so 15-20s matches what an ordinary open browser does by itself.">
              <label class="jb-label" style="white-space:nowrap">XP read every (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-xp-poll" value="${cfg.xpPollSec}" min="10" max="300" step="5">
              <span class="jb-sub">10–300 · default 20</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Every action inside one gap shares a single reading and is credited to whichever fired last (shown as <b>⊕</b> in the charts). Reading more often is what makes per-action XP accurate. This was 60–180s until 2000.245 — <b>slower than the game's own page</b>, which cost accuracy for camouflage it never actually bought. ±25% jitter is applied so it isn't a metronome.</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-noxp-on" ${cfg.noXpLimiterOn?'checked':''}> 📉 No-XP daily limiter</label>
            <div class="jb-row jb-mb">
              <label class="jb-label">No-XP streak limit:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-noxp-streak" value="${cfg.noXpStreakLimit}" min="2" max="20">
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">If an action gains no XP this many times in a row, it's treated as the game's daily cap and disabled until the next game-day.</div>
            <div class="jb-row jb-mb" title="Also cap an action that has gained no XP for this long despite still firing. In Away cadence an action may only fire a few times an hour, so a 5-attempt streak can take most of an evening to trip.">
              <label class="jb-label">Or no XP for (min):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-noxp-stale" value="${cfg.noXpStaleMin}" min="0" max="600" step="5">
              <span class="jb-sub">0 = off</span>
            </div>

            <label class="jb-switch jb-mb" title="Detects the game's Important-message panel when it carries a warning or soft ban, pauses everything, and alerts repeatedly until you see it. Never auto-answers anything."><input type="checkbox" id="jb-antibot-on" ${cfg.antiBotOn?'checked':''}> 🚨 Anti-bot / soft-ban detection</label>
            <div class="jb-sub jb-mb" id="jb-antibot-status" style="color:var(--jb-text-ter);font-size:9px">Pauses on detection and parses the stated expiry, so the pause lifts by itself. Staff questions are untouched — they still go through the script-check path.</div>
            <hr class="jb-sep">
            <div class="jb-row">
              <button class="jb-btn jb-btn-danger" id="jb-reset-all">Reset All</button>
              <button class="jb-btn jb-btn-outline" id="jb-clear-player">Clear Player</button>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div class="jb-modal-bg" id="jb-wl-backdrop" style="display:none"></div>
      <div class="jb-modal" id="jb-wl-modal">
        <div class="jb-modal-content" style="width:280px">
          <div class="jb-modal-head"><span>OC/DTM Invite Filters</span><button class="jb-hbtn" id="jb-wl-close">✕</button></div>
          <div class="jb-modal-body">
            <div class="jb-sect-title">Whitelist</div>
            <div class="jb-sub jb-mb">Only accept invites from these players. Empty = accept all.</div>
            <div id="jb-wl-entries"></div>
            <button class="jb-btn jb-btn-outline" id="jb-wl-add" style="width:100%;margin-top:6px">+ Add Player</button>
            <hr class="jb-sep">
            <div class="jb-sect-title">Blacklist</div>
            <div class="jb-sub jb-mb">Never auto-join invites from these players (e.g. ones who invite then go offline for hours). Always applies, even if the whitelist is off.</div>
            <div id="jb-bl-entries"></div>
            <button class="jb-btn jb-btn-outline" id="jb-bl-add" style="width:100%;margin-top:6px">+ Add Player</button>
            <hr class="jb-sep">
            <div class="jb-sect-title">Starvinggeeks lists</div>
            <div class="jb-sub jb-mb">Only accept invites from people on your own allied / safe lists. Stacks with the whitelist and blacklist above — every filter has to pass.</div>
            <label class="jb-switch jb-mb" title="Only accept OC/DTM invites from players on your allied list."><input type="checkbox" id="jb-inv-allied" ${cfg.inviteAlliedOnly?'checked':''}> 🤝 Allied only <span class="jb-sub" id="jb-inv-allied-n"></span></label>
            <label class="jb-switch jb-mb" title="Only accept OC/DTM invites from players on your safe list."><input type="checkbox" id="jb-inv-safe" ${cfg.inviteSafeOnly?'checked':''}> ✅ Safe only <span class="jb-sub" id="jb-inv-safe-n"></span></label>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">With both on, either list qualifies. These need the <b>SG lists</b> switch on the front panel — turning one of these on enables it and fetches. An <b>empty list refuses everything</b>, which is correct for an allow-list but looks exactly like a fault, so the counts are shown above and every refusal is logged with its reason.</div>
            <hr class="jb-sep">
            <button class="jb-btn" id="jb-clear-cd" style="width:100%;margin-top:6px;background:var(--jb-warning)">Clear Cooldowns</button>
          </div>
        </div>
      </div>

      <div class="jb-modal" id="jb-ow-modal">
        <div class="jb-modal-content" style="width:320px">
          <div class="jb-modal-head"><span>🟢 Online Watch</span><button class="jb-hbtn" id="jb-ow-close">✕</button></div>
          <div class="jb-modal-body">
            <div class="jb-sub jb-mb">Watch up to 20 entries (the same person can appear twice for different day/night options). Alerts when they come online.</div>
            <div class="jb-row jb-mb" style="gap:12px">
              <label class="jb-switch" title="Enable Group 1 players"><input type="checkbox" id="jb-ow-modal-on" ${ow.on?'checked':''}> <b>Group 1</b></label>
              <label class="jb-switch" title="Enable Group 2 players"><input type="checkbox" id="jb-ow-modal-on2" ${ow.on2?'checked':''}> <b>Group 2</b></label>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Scan (s):</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-ow-sec" value="${ow.sec}" min="20" max="3600">
            </div>
            <div class="jb-grid jb-mb">
              <label class="jb-switch"><input type="checkbox" id="jb-ow-notify" ${ow.notify?'checked':''}> Browser</label>
              <label class="jb-switch"><input type="checkbox" id="jb-ow-flash" ${ow.flash?'checked':''}> Tab Flash</label>
              <label class="jb-switch"><input type="checkbox" id="jb-ow-sound" ${ow.sound?'checked':''}> Sound</label>
              <label class="jb-switch"><input type="checkbox" id="jb-ow-tg" ${ow.telegram?'checked':''}> Telegram</label>
              <label class="jb-switch"><input type="checkbox" id="jb-ow-offnotify" ${ow.notifyOff?'checked':''}> Offline alerts</label>
            </div>
            <div class="jb-row jb-mb" style="align-items:center;gap:8px">
              <span class="jb-sub" style="flex:1">Stay logged out after a 🚪 logout action:</span>
              <input class="jb-input jb-input-sm" type="number" id="jb-ow-logout-mins" value="${ow.logoutMins}" min="1" max="1440" title="Minutes to stay logged out" style="width:64px">
              <span class="jb-sub">min</span>
            </div>
            <label class="jb-switch jb-mb" title="After a 🚪 logout, leave TMN and sit on an off-site page so nothing can auto-log-in. Stays off until you go back manually."><input type="checkbox" id="jb-ow-park" ${ow.logoutPark?'checked':''}> 🅿️ Park off-site after logout (stops auto-login)</label>
            <div class="jb-row jb-mb">
              <label class="jb-label">Park page:</label>
              <input class="jb-input" id="jb-ow-park-url" value="${esc(ow.parkUrl)}" placeholder="https://www.google.co.uk" style="flex:1">
            </div>
            <div id="jb-ow-list"></div>
            <div class="jb-row" style="margin-top:6px">
              <input class="jb-input" id="jb-ow-name" maxlength="40" placeholder="Player name" style="flex:1">
              <button class="jb-btn" id="jb-ow-add">+ Add</button>
            </div>
            <div class="jb-sub jb-mb" style="line-height:1.5">Tap icons per player: 🔔 notify · ✈️ Telegram · 🔊 sound · ⚡ flash · 🚪 log out · ⏸ stop &amp; wait. <b>G1/G2</b> = group (tap to switch); each group has its own on/off above.</div>
            <div class="jb-sub jb-mb" id="jb-ow-status">${ow.scanMsg}</div>
            <div class="jb-row">
              <button class="jb-btn jb-btn-outline" id="jb-ow-scan" style="flex:1">Scan Now</button>
              <button class="jb-btn" id="jb-ow-clear" style="flex:1;background:var(--jb-warning)">Clear</button>
            </div>
          </div>
        </div>
      </div>

      <div class="jb-modal" id="jb-oc-modal">
        <div class="jb-modal-content" style="width:320px">
          <div class="jb-modal-head"><span>🏢 OC Team (Leader)</span><button class="jb-hbtn" id="jb-oc-close">✕</button></div>
          <div class="jb-modal-body">
            <div class="jb-sub jb-mb">Team members for auto OC creation. You are Leader.</div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Type:</label>
              <select class="jb-input" id="jb-oc-type" style="flex:1">
                <option value="Casino" ${st.ocType==='Casino'?'selected':''}>Casino (best XP)</option>
                <option value="Armoury" ${st.ocType==='Armoury'?'selected':''}>Armoury (best bullets)</option>
                <option value="Bank" ${st.ocType==='Bank'?'selected':''}>Bank</option>
              </select>
            </div>
            <div class="jb-mb">
              <label class="jb-label">Transporter</label>
              <input class="jb-input" id="jb-oc-trans" value="${esc(st.ocTrans)}" placeholder="Username">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Weapon Master</label>
              <input class="jb-input" id="jb-oc-weapon" value="${esc(st.ocWeapon)}" placeholder="Username">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Explosive Expert</label>
              <input class="jb-input" id="jb-oc-explo" value="${esc(st.ocExplo)}" placeholder="Username">
            </div>
            <hr class="jb-sep">
            <label class="jb-label">Schedule</label>
            <input class="jb-input jb-mb" type="datetime-local" id="jb-oc-sched" value="${esc(st.ocSched)||''}" style="color-scheme:dark">
            <div class="jb-sub jb-mb">Triggers when time + cooldown both ready. Blank = cooldown only.</div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Repeat:</label>
              <select class="jb-input" id="jb-oc-repeat" style="flex:1">
                <option value="once" ${st.ocRepeat==='once'?'selected':''}>Once</option>
                <option value="repeat_1" ${st.ocRepeat==='repeat_1'?'selected':''}>+1 (2 total)</option>
                <option value="repeat_2" ${st.ocRepeat==='repeat_2'?'selected':''}>+2 (3 total)</option>
                <option value="repeat_3" ${st.ocRepeat==='repeat_3'?'selected':''}>+3 (4 total)</option>
                <option value="continuous" ${st.ocRepeat==='continuous'?'selected':''}>Continuous</option>
              </select>
            </div>
            <div class="jb-sub jb-mb">Hot City: <b id="jb-hot-city">${getHot()||'Unknown'}</b> <button class="jb-btn jb-btn-outline" id="jb-hot-refresh" style="padding:1px 6px;font-size:9px">Refresh</button></div>
            <div class="jb-sub jb-mb">State: <span id="jb-oc-state">${getCreateOCState()} (step ${getCreateOCStep()})</span></div>
            <button class="jb-btn jb-btn-danger" id="jb-oc-reset" style="width:100%">Reset OC Creation</button>
          </div>
        </div>
      </div>

      <div class="jb-modal" id="jb-dtm-modal">
        <div class="jb-modal-content" style="width:300px">
          <div class="jb-modal-head"><span>🚚 DTM Team (Leader)</span><button class="jb-hbtn" id="jb-dtm-close">✕</button></div>
          <div class="jb-modal-body">
            <div class="jb-sub jb-mb">You start the DTM and invite the partner. (Not to be confused with the ribbon's <b>DTM</b>, which accepts invites other people send you, or <b>DTM List</b> on the panel, which advertises you on the list for others to find.)</div>
            <label class="jb-switch jb-mb" title="Instead of always inviting the same person, take someone off the DTM list (ocads.aspx) who is currently online. Falls back to the partner below if nobody suitable is there."><input type="checkbox" id="jb-dtm-autopartner" ${cfg.dtmAutoPartner?'checked':''}> 🎲 Pick an online partner from the DTM list</label>
            <div class="jb-mb">
              <label class="jb-label">Partner <span class="jb-sub" id="jb-dtm-partner-role">${cfg.dtmAutoPartner?'(fallback if the list is empty — may be left blank)':'(always invited)'}</span></label>
              <input class="jb-input" id="jb-dtm-partner" value="${esc(st.dtmPartner)}" placeholder="Username">
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">Who's online is read from the players page, not from the list itself, so it stays right whatever the list shows. Your blacklist always applies; the whitelist applies when it's switched on. Anyone who ignores the invite is skipped for the rest of this DTM, so each retry reaches for somebody new.</div>
            <hr class="jb-sep">
            <label class="jb-label">Schedule</label>
            <input class="jb-input jb-mb" type="datetime-local" id="jb-dtm-sched" value="${esc(st.dtmSched)||''}" style="color-scheme:dark">
            <div class="jb-sub jb-mb">Triggers when time + cooldown both ready. Blank = cooldown only.</div>
            <div class="jb-row jb-mb">
              <label class="jb-label">Repeat:</label>
              <select class="jb-input" id="jb-dtm-repeat" style="flex:1">
                <option value="once" ${st.dtmRepeat==='once'?'selected':''}>Once</option>
                <option value="repeat_1" ${st.dtmRepeat==='repeat_1'?'selected':''}>+1 (2 total)</option>
                <option value="repeat_2" ${st.dtmRepeat==='repeat_2'?'selected':''}>+2 (3 total)</option>
                <option value="continuous" ${st.dtmRepeat==='continuous'?'selected':''}>Continuous</option>
              </select>
            </div>
            <hr class="jb-sep">
            <div class="jb-sect-title">Partner not playing ball</div>
            <label class="jb-switch jb-mb" title="Drop a partner who never accepts, or kick one who takes the seat then stalls. Never kicks a partner showing Ready — they've bought their drugs and kicking destroys the purchase."><input type="checkbox" id="jb-dtmkick-on" ${cfg.dtmKickOn?'checked':''}> 🥾 Drop / kick a stalled partner</label>
            <div class="jb-row">
              <label class="jb-label" style="white-space:nowrap">Never accepted:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-dtmkick-wait" value="${cfg.dtmKickWaitSec}" min="30" max="1800" step="30">
              <span class="jb-sub">s</span>
            </div>
            <div class="jb-row jb-mb">
              <label class="jb-label" style="white-space:nowrap">Accepted but stalled:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-dtmkick-grace" value="${cfg.dtmKickGraceSec}" min="30" max="1800" step="30">
              <span class="jb-sub">s</span>
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">A random 0–60s is added to the first timer so the drop isn't a predictable round number. The seat is re-checked live immediately before any kick — the kick removes whoever is seated at that instant, not who was seated when the page loaded. Gives up after 3 re-invites.</div>

            <hr class="jb-sep">
            <div class="jb-sub jb-mb">State: <span id="jb-dtm-state">${getCreateDtmState()} (step ${getCreateDtmStep()})</span></div>
            <button class="jb-btn jb-btn-danger" id="jb-dtm-reset" style="width:100%">Reset DTM Creation</button>
          </div>
        </div>
      </div>

      <div class="jb-modal" id="jb-xp-modal">
        <div class="jb-modal-content" style="width:340px">
          <div class="jb-modal-head"><span>📈 XP Charts</span><button class="jb-hbtn" id="jb-xp-close">✕</button></div>
          <div class="jb-modal-body" id="jb-xp-modal-body">
            <div class="jb-timer-grid" style="margin-bottom:8px">
              <span class="jb-timer-label">Total XP:</span>
              <span class="jb-timer-val" id="jb-xpm-total">—</span>
              <span class="jb-timer-label">Session:</span>
              <span class="jb-timer-val" id="jb-xpm-session">—</span>
              <span class="jb-timer-label">Rate:</span>
              <span class="jb-timer-val" id="jb-xpm-rate">—</span>
              <span class="jb-timer-label">Session age:</span>
              <span class="jb-timer-val" id="jb-xpm-age">—</span>
            </div>

            <div class="jb-sect-title">Rank progress</div>
            <div id="jb-xp-rank" style="background:var(--jb-surface-alt);border-radius:4px;padding:6px;margin-bottom:8px"></div>

            <div class="jb-sect-title">Cumulative XP</div>
            <div id="jb-xp-line" style="background:var(--jb-surface-alt);border-radius:4px;padding:4px;margin-bottom:8px;min-height:90px"></div>

            <div class="jb-sect-title">XP by action (session)</div>
            <div id="jb-xp-bars" style="background:var(--jb-surface-alt);border-radius:4px;padding:6px;margin-bottom:8px"></div>

            <div class="jb-sect-title">Recent gains</div>
            <div id="jb-xp-hist" style="background:var(--jb-surface-alt);border-radius:4px;padding:6px;max-height:280px;overflow-y:auto;font-size:10px"></div>

            <button class="jb-btn" id="jb-xp-report-now" style="width:100%;margin-top:8px">📤 Send XP Report Now</button>
            <button class="jb-btn jb-btn-danger" id="jb-xp-reset" style="width:100%;margin-top:6px">Reset XP Session</button>
          </div>
        </div>
      </div>
    `;
    _shadow.appendChild(root);

    // Apply theme
    applyThemeVars();
    host.classList.add('jb-ready');

    // Wire up crime/gta options
    const crimeEl = _shadow.querySelector('#jb-crime-opts');
    // Excluded crimes are never offered — see EXCLUDED_CRIME_IDS (pickpocket).
    crimeEl.innerHTML = CRIMES.filter(c => crimeAllowed(c.id)).map(c => `<label class="jb-switch"><input type="checkbox" class="jb-crime-cb" value="${c.id}" ${st.crimes.includes(c.id)?'checked':''}> ${c.name}</label>`).join('');

    const gtaEl = _shadow.querySelector('#jb-gta-opts');
    gtaEl.innerHTML = GTAS.map(g => `<label class="jb-switch"><input type="checkbox" class="jb-gta-cb" value="${g.id}" ${st.gtas.includes(g.id)?'checked':''}> ${g.name}</label>`).join('');

    // Ribbon toggles — use CSS vars for theme-aware colours
    const ribbonMap = { 'jb-r-crime':'crime','jb-r-gta':'gta','jb-r-booze':'booze','jb-r-jail':'jail','jb-r-health':'health','jb-r-garage':'garage','jb-r-oc':'autoOC','jb-r-dtm':'autoDTM' };
    /* Published so code outside buildUI can repaint the ribbon when it flips an
     * action programmatically. The daily limits, the no-XP limiter and the jail
     * cap all switch actions off by themselves; before this the buttons kept
     * showing the old colour until the next page load, so the panel disagreed
     * with what Jarvis was actually doing. */
    repaintRibbon = () => {
      for (const [id, key] of Object.entries(ribbonMap)) {
        const btn = _shadow && _shadow.querySelector(`#${id}`);
        if (!btn) continue;
        btn.style.background = st[key] ? 'var(--jb-ribbon-on)' : 'var(--jb-ribbon-off)';
        btn.style.color = st[key] ? 'var(--jb-ribbon-on-text)' : 'var(--jb-ribbon-off-text)';
      }
    };
    for (const [id, key] of Object.entries(ribbonMap)) {
      const btn = _shadow.querySelector(`#${id}`);
      // Set initial colours from theme
      if (btn) {
        btn.style.background = st[key] ? 'var(--jb-ribbon-on)' : 'var(--jb-ribbon-off)';
        btn.style.color = st[key] ? 'var(--jb-ribbon-on-text)' : 'var(--jb-ribbon-off-text)';
      }
      btn.addEventListener('click', e => {
        st[key] = !st[key]; saveSt();
        e.target.style.background = st[key] ? 'var(--jb-ribbon-on)' : 'var(--jb-ribbon-off)';
        e.target.style.color = st[key] ? 'var(--jb-ribbon-on-text)' : 'var(--jb-ribbon-off-text)';
        setStatus(`${key} ${st[key]?'ON':'OFF'}`);
      });
    }

    // ALL toggle
    const allCb = _shadow.querySelector('#jb-all-toggle');
    const allLabel = _shadow.querySelector('#jb-all-label');
    /* ALL toggle.
     *
     * It used to write eight flags and read six, and — far worse — left five
     * things running that it never touched: Create OC, Create DTM, auto-travel,
     * DTM list and scrap. FOUR OF THOSE NAVIGATE, and in mainLoop they are
     * handled ABOVE the idle gate, so "ALL off" could not reach them at all.
     * Hitting ALL off with a Create DTM cycle in flight left Jarvis merrily
     * driving to organizedcrime.aspx — which reads exactly as "it carried on
     * where I left it". One tab is enough to see it.
     *
     * ALL now means all: everything that can act on its own, read and written
     * from the same list so the two can't drift again.
     */
    const ALL_ST_KEYS  = ['crime','gta','booze','jail','health','garage','autoOC','autoDTM',
                          'createOC','createDTM','autoTravel','autoDtmList','crusher'];
    const ALL_CFG_KEYS = [['scrapOn','cbScrapOn']];

    /* The ALL box is a POWER SWITCH, not a summary of the other toggles.
     *
     * Deriving it from the individual flags meant unticking one action made it
     * read "ALL OFF" while the script was still very much running. It now
     * reflects st.halted only: unchecked = stopped dead, checked = running.
     * Turning a single action off no longer touches it, which is the honest
     * reading — the script is still on, that action isn't. */
    function syncAll() {
      const running = !st.halted;
      allCb.checked = running;
      allLabel.textContent = running ? 'RUNNING' : 'STOPPED';
      allLabel.style.color = running ? 'var(--jb-success)' : 'var(--jb-danger)';
      allLabel.title = running
        ? 'Jarvis is running. Unticking this stops it completely — no actions, no navigation, no background requests to the game at all.'
        : 'Jarvis is STOPPED. Nothing is being requested from the game; only Telegram alerts still go out.';
    }
    syncAll();

    /* SWITCHING BACK ON MUST RESTORE, NOT ENABLE EVERYTHING (2000.256).
     *
     * The handler used to do `ALL_ST_KEYS.forEach(k => st[k] = v)` in both
     * directions. Off was right — everything off. ON was wrong: it set every
     * flag TRUE, so Create OC, Create DTM, auto-travel, the DTM list and the
     * crusher all came on even if you had deliberately left them off. Switching
     * the script off and on again silently rewrote your setup, and the four that
     * navigate would then start driving somewhere on the next tick.
     *
     * So the off direction snapshots your selection first, and the on direction
     * puts exactly that back. */
    const ALL_SNAP_KEY = 'cbAllWasOn';

    function snapshotAllFlags() {
      /* Never snapshot while already halted — the flags are all false then, and
       * overwriting a good snapshot with that would lose the selection for real.
       * (The checkbox only fires on a transition, so this is belt-and-braces.) */
      if (st.halted) return;
      const snap = { st: {}, cfg: {} };
      ALL_ST_KEYS.forEach(k => { snap.st[k] = !!st[k]; });
      ALL_CFG_KEYS.forEach(([k]) => { snap.cfg[k] = !!cfg[k]; });
      GM_setValue(ALL_SNAP_KEY, snap);
    }

    // Returns false when there is nothing stored — see the handler for why that
    // deliberately leaves the flags alone rather than defaulting them on.
    function restoreAllFlags() {
      const snap = GM_getValue(ALL_SNAP_KEY, null);
      if (!snap || !snap.st) return false;
      ALL_ST_KEYS.forEach(k => { if (k in snap.st) st[k] = !!snap.st[k]; });
      ALL_CFG_KEYS.forEach(([k, gm]) => {
        if (snap.cfg && k in snap.cfg) { cfg[k] = !!snap.cfg[k]; GM_setValue(gm, cfg[k]); }
      });
      return true;
    }

    let _allRestored = false;
    allCb.addEventListener('change', () => {
      const v = allCb.checked;
      if (v) {
        /* No snapshot — an install halted before 2000.256, or one that has never
         * been switched off. Leave every flag exactly as it is rather than
         * turning them all on: guessing "all on" is precisely the bug this
         * replaces, and it would be the one moment you weren't watching. */
        _allRestored = restoreAllFlags();
        if (!_allRestored) console.log(`${APP_TAG} ALL on — no saved selection to restore, leaving the toggles as they are`);
        // Never switch the crusher on for someone who doesn't own one — the garage
        // logic tolerates it, but the panel would claim a feature you don't have.
        if (st.crusherOwned === false) st.crusher = false;
      } else {
        snapshotAllFlags();                       // must run BEFORE anything is cleared
        ALL_ST_KEYS.forEach(k => { st[k] = false; });
        ALL_CFG_KEYS.forEach(([k, gm]) => { cfg[k] = false; GM_setValue(gm, false); });
        /* Switching off must also ABANDON work already in flight. The creation
         * state machines live in localStorage and resume from wherever they were,
         * so clearing the toggle alone would leave a half-built OC waiting to
         * carry on the moment you switched it back on. */
        try { resetCreateOC(); } catch(_){}
        try { resetCreateDTM(); } catch(_){}
        try { localStorage.removeItem(LS_TRAVEL_PENDING); } catch(_){}
        st.acting = false; st.action = ''; GM_setValue('cbActStart', 0);
      }
      /* The hard part, and the reason this switch exists at all. Unticking must
       * stop every request to the game, not merely untick the actions — see the
       * HARD HALT section for why a "quiet" script that still polls is worse
       * than useless. haltAll/resumeAll own that; this handler owns the flags. */
      if (v) resumeAll('ALL switched on'); else haltAll('ALL switched off');
      saveSt(); syncAll(); repaintRibbon();
      // The panel switches for the non-ribbon toggles need moving too, or the
      // UI disagrees with what Jarvis is actually doing.
      [['#jb-create-oc','createOC'], ['#jb-create-dtm','createDTM'],
       ['#jb-auto-travel','autoTravel'], ['#jb-auto-dtmlist','autoDtmList'],
       ['#jb-crusher','crusher']].forEach(([sel, k]) => {
        const el = _shadow.querySelector(sel);
        if (el && !el.disabled) el.checked = st[k];
      });
      const sc = _shadow.querySelector('#jb-scrap-on');
      if (sc) sc.checked = cfg.scrapOn;
      setStatus(!v ? 'ALL OFF — everything stopped'
                : _allRestored ? 'ALL ON — your previous selection restored'
                : 'ALL ON — nothing saved, tick what you want');
    });

    // Other checkboxes
    _shadow.querySelector('#jb-crusher').checked = st.crusher;
    if (st.crusherOwned === false) { _shadow.querySelector('#jb-crusher').disabled = true; }
    _shadow.querySelector('#jb-crusher').addEventListener('change', e => {
      if (e.target.checked && st.crusherOwned === false) { e.target.checked = false; return; }
      st.crusher = e.target.checked; saveSt();
    });

    _shadow.querySelector('#jb-wl-on').checked = st.whitelist;
    _shadow.querySelector('#jb-wl-on').addEventListener('change', e => { st.whitelist = e.target.checked; saveSt(); });

    { const pcb = _shadow.querySelector('#jb-prop-on');
      if (pcb) { pcb.checked = propWatch.on;
        pcb.addEventListener('change', e => { propWatch.on = e.target.checked; savePropWatch(); propWatchStart(); }); } }
    try { renderPropUI(); } catch(_){}

    { const scb = _shadow.querySelector('#jb-sg-on');
      if (scb) { scb.checked = sgCfg.on;
        scb.addEventListener('change', e => {
          sgCfg.on = e.target.checked; saveSgCfg();
          if (sgCfg.on) { try { initSgLists(); fetchSgLists(true); } catch(_){} setStatus('🎨 SG lists on'); }
          else {
            try { renderSgStatusUI(); } catch(_){ }
            setStatus('🎨 SG lists off — reload to clear colours');
          }
          try { renderSgStatusUI(); } catch(_){ }
        }); } }

    { const hcb = _shadow.querySelector('#jb-hover-on');
      if (hcb) { hcb.checked = hoverCfg.on;
        // Toggling on takes effect immediately; toggling off needs a reload to detach.
        hcb.addEventListener('change', e => { hoverCfg.on = e.target.checked; saveHoverCfg(); if (hoverCfg.on) { try { initPlayerHover(); } catch(_){} } }); } }

    _shadow.querySelector('#jb-create-oc').checked = st.createOC;
    _shadow.querySelector('#jb-create-oc').addEventListener('change', e => { st.createOC = e.target.checked; saveSt(); if(st.createOC && !getHot()) fetchHot(); });

    // Front-panel Watch is a MASTER switch: it reads as "watching or not", so it
    // must reflect BOTH groups. It used to be bound to ow.on (Group 1) alone,
    // which meant a Group 2 player could still fire its actions — including a
    // logout — while the panel showed Watch as off.
    _shadow.querySelector('#jb-ow-on').checked = owEnabled();
    _shadow.querySelector('#jb-ow-on').addEventListener('change', e => {
      if (e.target.checked) {
        // Restore whichever groups were on before, defaulting to Group 1 so the
        // switch always actually does something.
        const w1 = GM_getValue('cbOwWas1', true), w2 = GM_getValue('cbOwWas2', false);
        ow.on = w1; ow.on2 = w2;
        if (!ow.on && !ow.on2) ow.on = true;
      } else {
        GM_setValue('cbOwWas1', ow.on); GM_setValue('cbOwWas2', ow.on2);
        ow.on = false; ow.on2 = false;
      }
      saveOw(); owStart(); renderOwUI();
      setStatus(owEnabled() ? `🟢 Watch on (G1:${ow.on?'on':'off'} G2:${ow.on2?'on':'off'})` : '🟢 Watch off — both groups');
    });

    _shadow.querySelector('#jb-notify-ready').checked = st.notifyReady;
    _shadow.querySelector('#jb-notify-ready').addEventListener('change', e => { st.notifyReady = e.target.checked; saveSt(); });

    _shadow.querySelector('#jb-auto-travel').addEventListener('change', e => {
      st.autoTravel = e.target.checked; saveSt();
      setStatus('✈️ Auto Travel ' + (st.autoTravel ? 'ON' : 'OFF'));
      if (st.autoTravel && !getHot()) fetchHot();
    });

    _shadow.querySelector('#jb-auto-dtmlist').addEventListener('change', e => {
      st.autoDtmList = e.target.checked; saveSt();
      setStatus('📋 DTM List ' + (st.autoDtmList ? 'ON' : 'OFF'));
      if (st.autoDtmList && !getHot()) fetchHot();
    });

    /* Theme. The title-bar button cycles every scheme; the Settings → System
     * dropdown jumps straight to one, which matters now there are seven rather
     * than three. Both go through applyTheme so the picker, the button icon and
     * the ribbon never disagree. */
    const THEME_ICONS = {
      dark:'◑', light:'☀', classic:'🟢',
      contrast:'⬛', midnight:'🌌', amber:'🔶', ocean:'🌊'
    };
    const themeBtn = _shadow.querySelector('#jb-theme-btn');
    function applyTheme(name) {
      setTheme(name);
      themeBtn.textContent = THEME_ICONS[name] || '◑';
      themeBtn.title = 'Theme: ' + (THEME_LIST.find(t => t[0] === name)?.[1] || name);
      const sel = _shadow.querySelector('#jb-theme-sel');
      if (sel && sel.value !== name) sel.value = name;
      repaintRibbon();   // ribbon colours are inline, so they need re-stamping
    }
    applyTheme(activeTheme);
    themeBtn.addEventListener('click', () => {
      const order = THEME_LIST.map(t => t[0]);
      applyTheme(order[(order.indexOf(activeTheme) + 1) % order.length]);
    });
    { const ts = _shadow.querySelector('#jb-theme-sel');
      if (ts) ts.addEventListener('change', e => {
        applyTheme(e.target.value);
        setStatus('🎨 ' + (THEME_LIST.find(t => t[0] === e.target.value)?.[1] || e.target.value));
      }); }

    // Text size — applied as a class on .jb-root (see the jb-lg / jb-xl rules).
    function applyUiSize(sz) {
      root.classList.remove('jb-lg', 'jb-xl');
      if (sz === 'l') root.classList.add('jb-lg');
      else if (sz === 'x') root.classList.add('jb-xl');
      cfg.uiSize = sz; GM_setValue('cbUiSize', sz);
    }
    applyUiSize(cfg.uiSize || 'n');
    { const us = _shadow.querySelector('#jb-uisize-sel');
      if (us) us.addEventListener('change', e => {
        applyUiSize(e.target.value);
        setStatus('🔠 Text size: ' + (e.target.value === 'n' ? 'normal' : e.target.value === 'l' ? 'large' : 'largest'));
      }); }

    // Minimize
    const body = _shadow.querySelector('#jb-panel-body');
    const footer = _shadow.querySelector('#jb-status');
    if (st.minimized) { body.style.display = 'none'; footer.style.display = 'none'; }
    _shadow.querySelector('#jb-min-btn').addEventListener('click', () => {
      st.minimized = !st.minimized;
      body.style.display = st.minimized ? 'none' : '';
      footer.style.display = st.minimized ? 'none' : '';
      saveSt();
    });

    // Settings modal
    const modal = _shadow.querySelector('#jb-settings-modal');
    const backdrop = _shadow.querySelector('#jb-backdrop');
    function openModal() {
      paused = true; modal.classList.add('open'); backdrop.style.display = 'block';
      const rk = _shadow.querySelector('#jb-daily-rank');
      if (rk) rk.textContent = rankState.name || 'your current rank';
      try { renderDailyResearch(); } catch(_){}
    }
    function closeModal() { modal.classList.remove('open'); backdrop.style.display = 'none'; paused = false; saveSt(); }
    _shadow.querySelector('#jb-settings-btn').addEventListener('click', openModal);
    _shadow.querySelector('#jb-modal-close').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    /* Settings tabs. Remembers the last tab you were on, because settings visits
     * come in runs — you rarely open it once. Scrolls back to the top on switch
     * so a long pane doesn't leave you halfway down the next one. */
    function showTab(key) {
      _shadow.querySelectorAll('.jb-tab').forEach(t =>
        t.classList.toggle('active', t.getAttribute('data-tab') === key));
      _shadow.querySelectorAll('.jb-pane').forEach(p =>
        p.classList.toggle('active', p.getAttribute('data-pane') === key));
      GM_setValue('cbSettingsTab', key);
      /* Scroll the MODAL CONTENT, not the body — .jb-modal-content is the
       * element carrying overflow-y, so the body's scrollTop is always 0 and
       * setting it would do nothing. */
      const sc = _shadow.querySelector('#jb-settings-modal .jb-modal-content');
      if (sc) sc.scrollTop = 0;
    }
    _shadow.querySelectorAll('.jb-tab').forEach(t =>
      t.addEventListener('click', () => showTab(t.getAttribute('data-tab'))));
    showTab(GM_getValue('cbSettingsTab', 'actions'));

    // Settings inputs
    _shadow.querySelector('#jb-login-user').addEventListener('input', e => { LOGIN.user = e.target.value.trim(); GM_setValue('cbLoginUser', LOGIN.user); });
    _shadow.querySelector('#jb-login-pass').addEventListener('input', e => { LOGIN.pass = e.target.value.trim(); GM_setValue('cbLoginPass', LOGIN.pass); });
    _shadow.querySelector('#jb-auto-submit').addEventListener('change', e => { LOGIN.autoSubmit = e.target.checked; GM_setValue('cbAutoSubmit', LOGIN.autoSubmit); });
    { const ck = _shadow.querySelector('#jb-capsolver-key'); if (ck) ck.addEventListener('input', e => setCapsolverKey(e.target.value)); }

    { const a = _shadow.querySelector('#jb-ka-audio');
      if (a) a.addEventListener('change', e => { ka.audio = e.target.checked; saveKa(); if (ka.audio) startKaAudio(); else stopKaAudio(); }); }
    { const w = _shadow.querySelector('#jb-ka-wake');
      if (w) w.addEventListener('change', e => { ka.wakeLock = e.target.checked; saveKa(); if (ka.wakeLock) requestWakeLock(); else releaseWakeLock(); }); }
    { const k = _shadow.querySelector('#jb-ka-worker');
      if (k) k.addEventListener('change', e => { ka.worker = e.target.checked; saveKa(); if (ka.worker) startKaWorker(); else stopKaWorker(); }); }
    { const d = _shadow.querySelector('#jb-debug');
      if (d) d.addEventListener('change', e => { _debug = e.target.checked; GM_setValue('cbDebug', _debug); }); }

    // Performance — display/poll changes restart the timers immediately, so
    // there's no reload needed to feel the effect on a struggling device.
    { const pd = _shadow.querySelector('#jb-perf-disp');
      if (pd) pd.addEventListener('change', e => {
        cfg.timerDispSec = Math.max(2, Math.min(60, parseInt(e.target.value,10)||5));
        e.target.value = cfg.timerDispSec; GM_setValue('cbTimerDispSec', cfg.timerDispSec);
        restartTimerIntervals(); setStatus(`⚙️ Panel refresh ${cfg.timerDispSec}s`);
      }); }
    { const pp = _shadow.querySelector('#jb-perf-poll');
      if (pp) pp.addEventListener('change', e => {
        cfg.bgPollSec = Math.max(30, Math.min(900, parseInt(e.target.value,10)||60));
        e.target.value = cfg.bgPollSec; GM_setValue('cbBgPollSec', cfg.bgPollSec);
        // Shortening the gap should take effect now, not after the old one runs out.
        try { resetBgDue(); } catch(_){}
        restartTimerIntervals(); setStatus(`⚙️ Background polls ${cfg.bgPollSec}s`);
      }); }

    _shadow.querySelectorAll('.jb-crime-cb').forEach(cb => cb.addEventListener('change', () => {
      st.crimes = [..._shadow.querySelectorAll('.jb-crime-cb:checked')].map(c => parseInt(c.value)); saveSt();
    }));
    _shadow.querySelectorAll('.jb-gta-cb').forEach(cb => cb.addEventListener('change', () => {
      st.gtas = [..._shadow.querySelectorAll('.jb-gta-cb:checked')].map(c => parseInt(c.value)); saveSt();
    }));

    _shadow.querySelector('#jb-crime-int').addEventListener('change', e => { cfg.crimeInt = Math.max(1,Math.min(999,parseInt(e.target.value))); GM_setValue('cbCrimeInt',cfg.crimeInt); });
    _shadow.querySelector('#jb-gta-int').addEventListener('change', e => { cfg.gtaInt = Math.max(1,Math.min(999,parseInt(e.target.value))); GM_setValue('cbGtaInt',cfg.gtaInt); });
    _shadow.querySelector('#jb-booze-int').addEventListener('change', e => { cfg.boozeInt = Math.max(1,Math.min(999,parseInt(e.target.value))); GM_setValue('cbBoozeInt',cfg.boozeInt); });
    _shadow.querySelector('#jb-booze-buy').addEventListener('change', e => { cfg.boozeBuy = Math.max(1,Math.min(300,parseInt(e.target.value))); GM_setValue('cbBoozeBuy',cfg.boozeBuy); });
    _shadow.querySelector('#jb-booze-sell').addEventListener('change', e => { cfg.boozeSell = Math.max(1,Math.min(300,parseInt(e.target.value))); GM_setValue('cbBoozeSell',cfg.boozeSell); });
    _shadow.querySelector('#jb-jail-int').addEventListener('change', e => { cfg.jailInt = Math.max(1,Math.min(999,parseInt(e.target.value))); GM_setValue('cbJailInt',cfg.jailInt); });
    _shadow.querySelector('#jb-jail-limit').addEventListener('change', e => {
      cfg.jailDailyLimit = Math.max(50, Math.min(4000, parseInt(e.target.value)||2000));
      e.target.value = cfg.jailDailyLimit;
      GM_setValue('cbJailDailyLimit', cfg.jailDailyLimit);
      // If we're now under the new limit and jail was auto-disabled, re-enable
      if (GM_getValue('cbJailAutoOff', false) && getJailCount() < cfg.jailDailyLimit) {
        GM_setValue('cbJailAutoOff', false);
        st.jail = GM_getValue('cbJailWasOn', true); saveSt();
        syncAll();
      }
      updateJailCountUI();
      const sEl = _shadow.querySelector('#jb-jail-count-settings');
      if (sEl) sEl.textContent = `${getJailCount()}/${cfg.jailDailyLimit}`;
    });
    { const y = _shadow.querySelector('#jb-jailyield');
      if (y) y.addEventListener('input', e => {
        cfg.jailYieldSec = Math.max(0, Math.min(90, parseInt(e.target.value,10)||0));
        GM_setValue('cbJailYieldSec', cfg.jailYieldSec);
        const v = _shadow.querySelector('#jb-jailyield-val');
        if (v) v.textContent = cfg.jailYieldSec + 's';
      }); }
    { const d = _shadow.querySelector('#jb-jaildelay-on');
      if (d) d.addEventListener('change', e => {
        cfg.jailDelayOn = e.target.checked; GM_setValue('cbJailDelayOn', cfg.jailDelayOn);
        if (!cfg.jailDelayOn && st.jailReleaseUntil) { st.jailReleaseUntil = 0; saveSt(); }
        setStatus(cfg.jailDelayOn ? '⏳ Post-jail pause on' : '⏳ Post-jail pause off');
      }); }
    { const mn = _shadow.querySelector('#jb-jaildelay-min');
      if (mn) mn.addEventListener('change', e => {
        cfg.jailDelayMin = Math.max(0, Math.min(600, parseInt(e.target.value,10)||0));
        if (cfg.jailDelayMax < cfg.jailDelayMin) {   // keep the range coherent
          cfg.jailDelayMax = cfg.jailDelayMin;
          GM_setValue('cbJailDelayMax', cfg.jailDelayMax);
          const mx = _shadow.querySelector('#jb-jaildelay-max'); if (mx) mx.value = cfg.jailDelayMax;
        }
        e.target.value = cfg.jailDelayMin; GM_setValue('cbJailDelayMin', cfg.jailDelayMin);
      }); }
    { const mx = _shadow.querySelector('#jb-jaildelay-max');
      if (mx) mx.addEventListener('change', e => {
        cfg.jailDelayMax = Math.max(cfg.jailDelayMin, Math.min(600, parseInt(e.target.value,10)||0));
        e.target.value = cfg.jailDelayMax; GM_setValue('cbJailDelayMax', cfg.jailDelayMax);
      }); }

    // --- Smart / random action picking ---
    { const sp = _shadow.querySelector('#jb-smartpick');
      if (sp) sp.addEventListener('change', e => {
        cfg.smartPick = e.target.checked; GM_setValue('cbSmartPick', cfg.smartPick);
        const l = _shadow.querySelector('#jb-smartpick-label');
        if (l) l.textContent = cfg.smartPick ? 'Smart (best value)' : 'Random (spread)';
        localStorage.removeItem('cbBoozeBroke');   // quantities change — start clean
        updateSmartPreview();
        setStatus(cfg.smartPick ? '🎯 Smart action picking' : '🎯 Random action picking');
      }); }
    { const mp = _shadow.querySelector('#jb-smart-minpct');
      if (mp) mp.addEventListener('input', e => {
        cfg.smartMinPct = Math.max(0, Math.min(100, parseInt(e.target.value,10)||0));
        GM_setValue('cbSmartMinPct', cfg.smartMinPct);
        updateSmartPreview();
      }); }

    // --- Per-action daily limits ---
    { const d = _shadow.querySelector('#jb-daily-on');
      if (d) d.addEventListener('change', e => {
        cfg.dailyLimitOn = e.target.checked; GM_setValue('cbDailyLimitOn', cfg.dailyLimitOn);
        /* Switching the feature off must also undo anything it switched off, or
         * an action disabled by a limit stays dark with nothing left on screen to
         * explain why. */
        if (!cfg.dailyLimitOn) {
          Object.keys(DAILY_ACTIONS).forEach(action => {
            if (!GM_getValue('cbDayAutoOff_'+action, false)) return;
            GM_setValue('cbDayAutoOff_'+action, false);
            if (action in st) st[action] = GM_getValue('cbDayWasOn_'+action, true);
          });
          saveSt(); syncAll(); repaintRibbon();
        }
        updateDailyCountUI();
        setStatus(cfg.dailyLimitOn ? '📅 Daily limits on' : '📅 Daily limits off');
      }); }
    [['#jb-daily-crime','crime','dailyLimitCrime','cbDailyLimitCrime'],
     ['#jb-daily-gta',  'gta',  'dailyLimitGta',  'cbDailyLimitGta'],
     ['#jb-daily-booze','booze','dailyLimitBooze','cbDailyLimitBooze']].forEach(([sel, action, key, gmKey]) => {
      const el = _shadow.querySelector(sel);
      if (!el) return;
      el.addEventListener('change', e => {
        cfg[key] = Math.max(0, Math.min(10000, parseInt(e.target.value,10)||0));
        e.target.value = cfg[key]; GM_setValue(gmKey, cfg[key]);
        // Raising the limit past today's count should bring the action back on
        // straight away, not leave it off until midnight.
        if (GM_getValue('cbDayAutoOff_'+action, false) && (!cfg[key] || getDailyCount(action) < cfg[key])) {
          GM_setValue('cbDayAutoOff_'+action, false);
          if (action in st) { st[action] = GM_getValue('cbDayWasOn_'+action, true); saveSt(); syncAll(); repaintRibbon(); }
        }
        updateDailyCountUI();
      });
    });
    /* "Use observed peaks": fills each limit from the best day recorded at the
     * current rank, falling back to the best overall. Deliberately +0 headroom —
     * the peak IS the cap you hit, so matching it stops exactly where the game
     * would have. Does nothing for an action with no history rather than writing
     * a made-up number. */
    { const sg = _shadow.querySelector('#jb-daily-suggest');
      if (sg) sg.addEventListener('click', () => {
        const rank = rankState.name || '';
        const map = { crime:['#jb-daily-crime','dailyLimitCrime','cbDailyLimitCrime'],
                      gta:['#jb-daily-gta','dailyLimitGta','cbDailyLimitGta'],
                      booze:['#jb-daily-booze','dailyLimitBooze','cbDailyLimitBooze'] };
        let n = 0;
        for (const [action, [sel, key, gmKey]] of Object.entries(map)) {
          const p = dailyPeak(action, rank);
          const v = p.atRank || p.all;
          if (!v) continue;
          cfg[key] = v; GM_setValue(gmKey, v);
          const el = _shadow.querySelector(sel); if (el) el.value = v;
          n++;
        }
        updateDailyCountUI();
        setStatus(n ? `📅 ${n} limit${n===1?'':'s'} set from observed peaks` : '📅 No finished days recorded yet');
      }); }
    { const hr = _shadow.querySelector('#jb-daily-hist-reset');
      if (hr) hr.addEventListener('click', () => {
        if (!confirm('Clear the recorded daily history? Today\'s running count is kept.')) return;
        Object.keys(DAILY_ACTIONS).forEach(a => GM_setValue('cbDayHist_' + a, []));
        renderDailyResearch();
        setStatus('📅 Daily history cleared');
      }); }

    // --- Background heal ---
    { const bh = _shadow.querySelector('#jb-bgheal');
      if (bh) bh.addEventListener('change', e => {
        cfg.bgHealOn = e.target.checked; GM_setValue('cbBgHealOn', cfg.bgHealOn);
        setStatus(cfg.bgHealOn ? '💊 Background heal on' : '💊 Heal by navigation');
      }); }
    // Shot response (278). Three independent switches; see the Assets pane.
    { const b=(id,key,gm)=>{ const el=_shadow.querySelector(id); if(el) el.onchange=e=>{ cfg[key]=e.target.checked; GM_setValue(gm,cfg[key]); }; };
      b('#jb-shot-alert','shotAlertOn','cbShotAlertOn');
      b('#jb-shot-retreat','shotRetreatOn','cbShotRetreatOn');
      b('#jb-shot-travel','shotTravelOn','cbShotTravelOn'); }
    { const hn = _shadow.querySelector('#jb-heal-now');
      if (hn) hn.addEventListener('click', async () => {
        const s = _shadow.querySelector('#jb-heal-status');
        if (s) s.textContent = 'Healing…';
        const did = await bgHeal(cfg.targetHealth || 100);
        if (s) s.textContent = did ? 'Done — check the status bar.' : 'Nothing bought (already full, or no credits).';
      }); }

    // --- Scrap → FMJ ---
    { const so = _shadow.querySelector('#jb-scrap-on');
      if (so) so.addEventListener('change', e => {
        cfg.scrapOn = e.target.checked; GM_setValue('cbScrapOn', cfg.scrapOn);
        GM_setValue('cbScrapNextAt', 0);   // act on the next tick rather than waiting out a stale backoff
        setStatus(cfg.scrapOn ? '♻️ Scrap → FMJ on' : '♻️ Scrap → FMJ off');
      }); }
    { const sp = _shadow.querySelector('#jb-scrap-prot');
      if (sp) sp.addEventListener('change', e => { cfg.scrapProt = e.target.checked; GM_setValue('cbScrapProt', cfg.scrapProt); }); }
    { const sf = _shadow.querySelector('#jb-scrap-floor');
      if (sf) sf.addEventListener('change', e => {
        cfg.scrapFloor = Math.max(5, Math.min(10000, parseInt(e.target.value,10)||5));
        e.target.value = cfg.scrapFloor; GM_setValue('cbScrapFloor', cfg.scrapFloor);
        GM_setValue('cbScrapNextAt', 0);
      }); }

    // --- DTM partner kick ---
    { const dk = _shadow.querySelector('#jb-dtmkick-on');
      if (dk) dk.addEventListener('change', e => {
        cfg.dtmKickOn = e.target.checked; GM_setValue('cbDtmKickOn', cfg.dtmKickOn);
        if (!cfg.dtmKickOn) { try { dtmClearKickState(); } catch(_){} }
        updateDtmKickUI();
        setStatus(cfg.dtmKickOn ? '🥾 DTM kick on' : '🥾 DTM kick off');
      }); }
    { const dw = _shadow.querySelector('#jb-dtmkick-wait');
      if (dw) dw.addEventListener('change', e => {
        cfg.dtmKickWaitSec = Math.max(30, Math.min(1800, parseInt(e.target.value,10)||210));
        e.target.value = cfg.dtmKickWaitSec; GM_setValue('cbDtmKickWaitSec', cfg.dtmKickWaitSec);
      }); }
    { const dg = _shadow.querySelector('#jb-dtmkick-grace');
      if (dg) dg.addEventListener('change', e => {
        cfg.dtmKickGraceSec = Math.max(30, Math.min(1800, parseInt(e.target.value,10)||180));
        e.target.value = cfg.dtmKickGraceSec; GM_setValue('cbDtmKickGraceSec', cfg.dtmKickGraceSec);
      }); }

    // --- Anti-bot detection ---
    { const ab = _shadow.querySelector('#jb-antibot-on');
      if (ab) ab.addEventListener('change', e => {
        cfg.antiBotOn = e.target.checked; GM_setValue('cbAntiBotOn', cfg.antiBotOn);
        setStatus(cfg.antiBotOn ? '🚨 Anti-bot detection on' : '🚨 Anti-bot detection off');
      }); }
    { const xp = _shadow.querySelector('#jb-xp-poll');
      if (xp) xp.addEventListener('change', e => {
        cfg.xpPollSec = Math.max(10, Math.min(300, parseInt(e.target.value,10)||20));
        e.target.value = cfg.xpPollSec; GM_setValue('cbXpPollSec', cfg.xpPollSec);
        GM_setValue('cbLastStatRefresh', 0);   // take effect now, not after the old gap
        setStatus(`📊 XP read every ~${cfg.xpPollSec}s`);
      }); }
    { const ns = _shadow.querySelector('#jb-noxp-stale');
      if (ns) ns.addEventListener('change', e => {
        cfg.noXpStaleMin = Math.max(0, Math.min(600, parseInt(e.target.value,10)||0));
        e.target.value = cfg.noXpStaleMin; GM_setValue('cbNoXpStaleMin', cfg.noXpStaleMin);
      }); }
    _shadow.querySelector('#jb-jail-reset').addEventListener('click', () => {
      GM_setValue('cbJailCount', 0);
      GM_setValue('cbJailCountDay', gameDayStr());
      if (GM_getValue('cbJailAutoOff', false)) {
        GM_setValue('cbJailAutoOff', false);
        st.jail = GM_getValue('cbJailWasOn', true); saveSt(); syncAll();
      }
      updateJailCountUI();
      const sEl = _shadow.querySelector('#jb-jail-count-settings');
      if (sEl) sEl.textContent = `0/${cfg.jailDailyLimit}`;
      setStatus('⛓️ Jail counter reset');
    });
    _shadow.querySelector('#jb-min-hp').addEventListener('change', e => { cfg.minHealth = Math.max(1,Math.min(99,parseInt(e.target.value))); GM_setValue('cbMinHealth',cfg.minHealth); });
    _shadow.querySelector('#jb-target-hp').addEventListener('change', e => { cfg.targetHealth = Math.max(10,Math.min(100,parseInt(e.target.value))); GM_setValue('cbTargetHealth',cfg.targetHealth); });
    _shadow.querySelector('#jb-garage-int').addEventListener('change', e => { const m = Math.max(1,Math.min(120,parseInt(e.target.value))); cfg.garageInt = m*60; GM_setValue('cbGarageInt',cfg.garageInt); });

    _shadow.querySelector('#jb-crush-reset').addEventListener('click', () => {
      st.crusherOwned = null; saveSt(); localStorage.removeItem(LS_CRUSH_LOOP);
      const cb = _shadow.querySelector('#jb-crusher'); if(cb) cb.disabled = false;
      const stEl = _shadow.querySelector('#jb-crush-st'); if(stEl) stEl.textContent = 'Unknown';
    });

    // Car category radio buttons
    _shadow.querySelectorAll('input[type="radio"][name^="jb-cc-"]').forEach(radio => {
      radio.addEventListener('change', e => {
        if (!e.target.checked) return;
        const carName = e.target.getAttribute('data-car');
        const category = e.target.value;
        if (!carName || !category) return;
        const known = CARS.find(c => c.name === carName);
        if (known && known.locked) {
          e.target.checked = false;
          const defR = _shadow.querySelector(`input[type="radio"][name="${e.target.name}"][value="${known.def}"]`);
          if (defR) defR.checked = true;
          return;
        }
        if (!st.carCats) st.carCats = {};
        st.carCats[carName] = category;
        saveSt();
        setStatus(`${carName} → ${category}`);
      });
    });

    // Reset car categories to defaults
    const ccResetBtn = _shadow.querySelector('#jb-cc-reset');
    if (ccResetBtn) ccResetBtn.addEventListener('click', () => {
      st.carCats = {}; saveSt();
      CARS.forEach(car => {
        const sid = car.name.replace(/[^A-Za-z0-9]/g,'');
        _shadow.querySelectorAll(`input[type="radio"][name="jb-cc-${sid}"]`).forEach(r => { r.checked = (r.value === car.def); });
      });
      setStatus('Car categories reset');
    });

    // Telegram
    _shadow.querySelector('#jb-tg-on').addEventListener('change', e => { tg.enabled = e.target.checked; saveTg(); });
    _shadow.querySelector('#jb-tg-token').addEventListener('input', e => { tg.token = e.target.value.trim(); saveTg(); });
    _shadow.querySelector('#jb-tg-chat').addEventListener('input', e => { tg.chat = e.target.value.trim(); saveTg(); });
    _shadow.querySelector('#jb-tg-captcha').addEventListener('change', e => { tg.captcha = e.target.checked; saveTg(); });
    _shadow.querySelector('#jb-tg-msgs').addEventListener('change', e => { tg.messages = e.target.checked; saveTg(); });
    _shadow.querySelector('#jb-tg-st').addEventListener('change', e => { tg.scriptTest = e.target.checked; saveTg(); });
    _shadow.querySelector('#jb-tg-staff').addEventListener('change', e => { tg.staffMail = e.target.checked; saveTg(); });
    _shadow.querySelector('#jb-tg-sql').addEventListener('change', e => { tg.sqlCheck = e.target.checked; saveTg(); });
    _shadow.querySelector('#jb-tg-logout').addEventListener('change', e => { tg.logout = e.target.checked; saveTg(); });
    { const mi = _shadow.querySelector('#jb-msg-int');
      if (mi) mi.addEventListener('change', e => {
        tg.msgCheckInt = Math.max(15, Math.min(300, parseInt(e.target.value,10)||30));
        e.target.value = tg.msgCheckInt; saveTg();
        // Clear the last-poll stamp so a shortened interval takes effect now
        // rather than after the old, longer one has elapsed.
        localStorage.setItem('cbLastMailTs','0');
        setStatus(`📬 Mail check every ${tg.msgCheckInt}s`);
      }); }
    _shadow.querySelector('#jb-tg-test').addEventListener('click', testTg);

    /* --- Discord ---
     * The URL field validates as you type and says so, because a mistyped
     * webhook fails silently otherwise: sends just queue up and 404, and you'd
     * have no reason to look in the console. */
    function renderDcState() {
      const el = _shadow.querySelector('#jb-dc-url-state');
      if (!el) return;
      if (!dc.url) { el.textContent = 'No webhook set — nothing will be sent.'; el.style.color = 'var(--jb-text-ter)'; return; }
      if (dcConfigured()) { el.textContent = '✓ Looks like a valid Discord webhook.'; el.style.color = 'var(--jb-success)'; return; }
      if (!dc.enabled) { el.textContent = 'Discord is switched off.'; el.style.color = 'var(--jb-text-ter)'; return; }
      el.textContent = '⚠️ That does not look like a Discord webhook URL — nothing will be sent.';
      el.style.color = 'var(--jb-danger)';
    }
    { const d = _shadow.querySelector('#jb-dc-on');
      if (d) d.addEventListener('change', e => {
        dc.enabled = e.target.checked; saveDc(); renderDcState();
        setStatus(dc.enabled ? '🎮 Discord on' : '🎮 Discord off');
      }); }
    { const u = _shadow.querySelector('#jb-dc-url');
      if (u) u.addEventListener('input', e => { dc.url = e.target.value.trim(); saveDc(); renderDcState(); }); }
    { const r = _shadow.querySelector('#jb-dc-rankup');
      if (r) r.addEventListener('change', e => { dc.rankup = e.target.checked; saveDc(); }); }
    { const w = _shadow.querySelector('#jb-dc-witness');
      if (w) w.addEventListener('change', e => { dc.witness = e.target.checked; saveDc(); }); }
    { const c = _shadow.querySelector('#jb-dc-critical');
      if (c) c.addEventListener('change', e => {
        dc.critical = e.target.checked; saveDc();
        setStatus(dc.critical ? '🚨 Script checks go to Discord' : '🚨 Script checks: Telegram only');
      }); }
    { const mn = _shadow.querySelector('#jb-dc-mention');
      if (mn) mn.addEventListener('input', e => { dc.mention = e.target.value.trim(); saveDc(); }); }
    { const dv = _shadow.querySelector('#jb-dc-device');
      if (dv) dv.addEventListener('change', e => {
        dc.thisDevice = e.target.checked; saveDc();
        setStatus(dc.thisDevice ? '📮 This device posts to Discord' : '📮 This device will NOT post to Discord');
      }); }
    { const t = _shadow.querySelector('#jb-dc-test');
      if (t) t.addEventListener('click', testDiscord); }
    renderDcState();

    // --- Hold HQ (panic) ---
    { const hq = _shadow.querySelector('#jb-holdhq-on');
      if (hq) hq.addEventListener('change', e => {
        cfg.holdHqOn = e.target.checked; GM_setValue('cbHoldHqOn', cfg.holdHqOn);
        // A fresh panic starts a fresh budget — otherwise a previous session's
        // count could trip the cap on the first entry, when you most need it.
        localStorage.removeItem(LS_HQ_COUNT); localStorage.removeItem(LS_HQ_NEXT);
        updateHqUI();
        setStatus(cfg.holdHqOn ? '🏠 Hold HQ ON — hiding, everything else paused' : '🏠 Hold HQ off');
      }); }
    { const hm = _shadow.querySelector('#jb-hq-mins');
      if (hm) hm.addEventListener('change', e => {
        cfg.holdHqMins = Math.max(1, Math.min(60, parseInt(e.target.value,10)||10));
        e.target.value = cfg.holdHqMins; GM_setValue('cbHoldHqMins', cfg.holdHqMins);
      }); }
    { const hx = _shadow.querySelector('#jb-hq-max');
      if (hx) hx.addEventListener('change', e => {
        cfg.holdHqMax = Math.max(1, Math.min(50, parseInt(e.target.value,10)||6));
        e.target.value = cfg.holdHqMax; GM_setValue('cbHoldHqMax', cfg.holdHqMax);
      }); }

    // --- Forum refresh ---
    { const fr = _shadow.querySelector('#jb-forum-on');
      if (fr) fr.addEventListener('change', e => {
        cfg.forumRefreshOn = e.target.checked; GM_setValue('cbForumRefreshOn', cfg.forumRefreshOn);
        GM_setValue('cbForumNextAt', 0);   // reschedule from now either way
        setStatus(cfg.forumRefreshOn ? '🌐 Forum refresh on' : '🌐 Forum refresh off');
      }); }
    { const fm = _shadow.querySelector('#jb-forum-min');
      if (fm) fm.addEventListener('change', e => {
        cfg.forumRefreshMin = Math.max(5, Math.min(1440, parseInt(e.target.value,10)||60));
        e.target.value = cfg.forumRefreshMin; GM_setValue('cbForumRefreshMin', cfg.forumRefreshMin);
        GM_setValue('cbForumNextAt', 0);
      }); }

    /* --- Allied / safe invite gating ---
     * Turning either on ENABLES the SG lists and forces a fetch. Without that
     * you'd be gating against an empty list and silently refusing every invite —
     * the lists are the whole dependency, so the switch has to bring them with it. */
    function renderInviteListCounts() {
      const a = _shadow.querySelector('#jb-inv-allied-n'), s = _shadow.querySelector('#jb-inv-safe-n');
      const fmt = (n, on) => !on ? '' : (n ? `(${n} names)` : '(EMPTY — nothing will be accepted)');
      if (a) { a.textContent = fmt((sgAllied||[]).length, cfg.inviteAlliedOnly);
               a.style.color = cfg.inviteAlliedOnly && !(sgAllied||[]).length ? 'var(--jb-danger)' : 'var(--jb-text-ter)'; }
      if (s) { s.textContent = fmt((sgSafe||[]).length, cfg.inviteSafeOnly);
               s.style.color = cfg.inviteSafeOnly && !(sgSafe||[]).length ? 'var(--jb-danger)' : 'var(--jb-text-ter)'; }
    }
    function ensureSgFor(which) {
      if (!sgCfg.on) {
        sgCfg.on = true; saveSgCfg();
        const cb = _shadow.querySelector('#jb-sg-on'); if (cb) cb.checked = true;
        console.log(`${APP_TAG}[INVITE] "${which} only" needs the SG lists — switching them on`);
      }
      try { initSgLists(); } catch(_){}
      Promise.resolve(fetchSgLists(true)).then(renderInviteListCounts).catch(()=>{});
    }
    { const ia = _shadow.querySelector('#jb-inv-allied');
      if (ia) ia.addEventListener('change', e => {
        cfg.inviteAlliedOnly = e.target.checked; GM_setValue('cbInviteAlliedOnly', cfg.inviteAlliedOnly);
        if (cfg.inviteAlliedOnly) ensureSgFor('allied');
        renderInviteListCounts();
        setStatus(cfg.inviteAlliedOnly ? '🤝 Invites: allied only' : '🤝 Allied-only off');
      }); }
    { const is = _shadow.querySelector('#jb-inv-safe');
      if (is) is.addEventListener('change', e => {
        cfg.inviteSafeOnly = e.target.checked; GM_setValue('cbInviteSafeOnly', cfg.inviteSafeOnly);
        if (cfg.inviteSafeOnly) ensureSgFor('safe');
        renderInviteListCounts();
        setStatus(cfg.inviteSafeOnly ? '✅ Invites: safe only' : '✅ Safe-only off');
      }); }
    renderInviteListCounts();

    // --- Ready reminders ---
    { const re = _shadow.querySelector('#jb-ready-every');
      if (re) re.addEventListener('change', e => {
        cfg.readyRepeatMin = Math.max(0, Math.min(240, parseInt(e.target.value,10)||0));
        e.target.value = cfg.readyRepeatMin; GM_setValue('cbReadyRepeatMin', cfg.readyRepeatMin);
        // Re-arm from now, so a shortened interval doesn't wait out the old one.
        ['dtm','oc'].forEach(k => localStorage.removeItem('cbRdyNext_' + k));
        setStatus(cfg.readyRepeatMin ? `🔔 Ready reminders every ${cfg.readyRepeatMin}m` : '🔔 Ready reminders off');
      }); }
    { const rm = _shadow.querySelector('#jb-ready-max');
      if (rm) rm.addEventListener('change', e => {
        cfg.readyRepeatMax = Math.max(0, Math.min(20, parseInt(e.target.value,10)||0));
        e.target.value = cfg.readyRepeatMax; GM_setValue('cbReadyRepeatMax', cfg.readyRepeatMax);
        // Raising the cap should let an already-exhausted reminder speak again.
        ['dtm','oc'].forEach(k => localStorage.removeItem('cbRdyCount_' + k));
      }); }

    // --- Staff / mod presence ---
    { const mo = _shadow.querySelector('#jb-mod-on');
      if (mo) mo.addEventListener('change', e => {
        cfg.modWatchOn = e.target.checked; GM_setValue('cbModWatchOn', cfg.modWatchOn);
        // Drop the cached reading on the way off, so a stale "mod online" can't
        // keep suppressing jail after the feature is switched back on later.
        if (!cfg.modWatchOn) localStorage.removeItem('cbModOnline');
        modWatchStart();
        setStatus(cfg.modWatchOn ? '👮 Staff watch on' : '👮 Staff watch off');
      }); }
    { const mp = _shadow.querySelector('#jb-mod-poll');
      if (mp) mp.addEventListener('change', e => {
        cfg.modPollSec = Math.max(30, Math.min(600, parseInt(e.target.value,10)||60));
        e.target.value = cfg.modPollSec; GM_setValue('cbModPollSec', cfg.modPollSec);
        modWatchStart();
      }); }
    { const mj = _shadow.querySelector('#jb-mod-nojail');
      if (mj) mj.addEventListener('change', e => {
        cfg.noJailOnMod = e.target.checked; GM_setValue('cbNoJailOnMod', cfg.noJailOnMod);
        setStatus(cfg.noJailOnMod ? '⛓️ Jail pauses while staff are on' : '⛓️ Jail ignores staff');
      }); }
    { const mb = _shadow.querySelector('#jb-mod-break');
      if (mb) mb.addEventListener('change', e => {
        cfg.modBreakOn = e.target.checked; GM_setValue('cbModBreakOn', cfg.modBreakOn);
        // Switching it off must also end a break it started, or you'd be stuck
        // sitting out an hour with nothing left on screen explaining why.
        if (!cfg.modBreakOn) localStorage.removeItem(LS_MOD_BREAK_UNTIL);
        setStatus(cfg.modBreakOn ? '🛑 Mod break on' : '🛑 Mod break off');
      }); }
    { const bn = _shadow.querySelector('#jb-mod-break-min');
      if (bn) bn.addEventListener('change', e => {
        cfg.modBreakMin = Math.max(1, Math.min(600, parseInt(e.target.value,10)||60));
        if (cfg.modBreakMax < cfg.modBreakMin) {          // keep the range coherent
          cfg.modBreakMax = cfg.modBreakMin; GM_setValue('cbModBreakMax', cfg.modBreakMax);
          const mx = _shadow.querySelector('#jb-mod-break-max'); if (mx) mx.value = cfg.modBreakMax;
        }
        e.target.value = cfg.modBreakMin; GM_setValue('cbModBreakMin', cfg.modBreakMin);
      }); }
    { const bx = _shadow.querySelector('#jb-mod-break-max');
      if (bx) bx.addEventListener('change', e => {
        cfg.modBreakMax = Math.max(cfg.modBreakMin, Math.min(600, parseInt(e.target.value,10)||120));
        e.target.value = cfg.modBreakMax; GM_setValue('cbModBreakMax', cfg.modBreakMax);
      }); }
    { const bl = _shadow.querySelector('#jb-mod-break-logout');
      if (bl) bl.addEventListener('change', e => { cfg.modBreakLogout = e.target.checked; GM_setValue('cbModBreakLogout', cfg.modBreakLogout); }); }

    // Per-message Telegram toggles
    _shadow.querySelectorAll('.jb-tgmsg-cb').forEach(cb => {
      cb.addEventListener('change', e => {
        const key = e.target.getAttribute('data-key');
        tgMsgOn[key] = e.target.checked;
        saveTgMsgs();
      });
    });
    _shadow.querySelector('#jb-tgmsg-all').addEventListener('click', () => {
      TG_MSGS.forEach(m => { tgMsgOn[m.key] = true; });
      saveTgMsgs();
      _shadow.querySelectorAll('.jb-tgmsg-cb').forEach(cb => { cb.checked = true; });
      setStatus('All TG messages on');
    });
    _shadow.querySelector('#jb-tgmsg-none').addEventListener('click', () => {
      TG_MSGS.forEach(m => { tgMsgOn[m.key] = false; });
      saveTgMsgs();
      _shadow.querySelectorAll('.jb-tgmsg-cb').forEach(cb => { cb.checked = false; });
      setStatus('All TG messages off');
    });

    // Logout alerts
    _shadow.querySelector('#jb-lo-flash').addEventListener('change', e => { logoutAlert.tabFlash = e.target.checked; saveLogoutAlert(); });
    _shadow.querySelector('#jb-lo-notify').addEventListener('change', e => { logoutAlert.notify = e.target.checked; saveLogoutAlert(); if(e.target.checked) askNotifyPerm(); });

    // Advanced
    _shadow.querySelector('#jb-resume').addEventListener('change', e => { resume.on = e.target.checked; saveResume(); });
    _shadow.querySelector('#jb-stats-on').addEventListener('change', e => { stats.on = e.target.checked; saveStats(); });
    const xpBarCb = _shadow.querySelector('#jb-xpbar-on');
    if (xpBarCb) xpBarCb.addEventListener('change', e => {
      GM_setValue('cbXpBarOn', e.target.checked);
      _lastBarXp = 0; _barXpLogged = false;   // re-baseline so it re-reads on the next tick
      setStatus(e.target.checked ? 'Status-bar XP on' : 'Status-bar XP off');
    });
    const noXpCb = _shadow.querySelector('#jb-noxp-on');
    if (noXpCb) noXpCb.addEventListener('change', e => { cfg.noXpLimiterOn = e.target.checked; GM_setValue('cbNoXpLimiterOn', cfg.noXpLimiterOn); setStatus(cfg.noXpLimiterOn?'No-XP limiter on':'No-XP limiter off'); });
    const noXpStreak = _shadow.querySelector('#jb-noxp-streak');
    if (noXpStreak) noXpStreak.addEventListener('change', e => { cfg.noXpStreakLimit = Math.max(2,Math.min(20,parseInt(e.target.value)||5)); GM_setValue('cbNoXpStreakLimit', cfg.noXpStreakLimit); });

    // Reset/clear
    _shadow.querySelector('#jb-reset-all').addEventListener('click', () => {
      if (confirm('Reset ALL settings?')) {
        localStorage.removeItem('cbMaster'); localStorage.removeItem('cbHeartbeat');

        const keys = [
          'cbAutoCrime','cbAutoGta','cbAutoJail','cbAutoBooze','cbLastCrime','cbLastGta','cbLastJail','cbLastBooze',
          'cbSelCrimes','cbSelGtas','cbPlayer','cbInJail','cbAction','cbPending','cbAutoOC','cbAutoDTM',
          'cbAutoHealth','cbAutoGarage','cbAutoCrusher','cbCrusherOwned','cbLastGarage','cbLastHealth','cbLastJailCk',
          'cbBuyHealth','cbMinimized','cbRefresh','cbTheme','cbNotifyReady','cbWhitelist','cbWlNames','cbCarCats',
          'cbCreateOC','cbOcTrans','cbOcWeapon','cbOcExplo','cbOcSched','cbOcType','cbOcRepeat','cbOcLeft'
        ];

        // Write explicit safe defaults rather than `undefined`. GM storage can be
        // left in a broken state by undefined writes, which is exactly the kind of
        // persistent corruption that requires reinstalling the script. Deleting the
        // key and letting the code fall back to the runtime defaults is safe.
        keys.forEach(k => {
          try { GM_deleteValue(k); } catch(_) {}
        });

        // Also clear the state object and rebuild it from defaults on next load.
        try {
          st = {
            crime: false, gta: false, jail: false, booze: false,
            health: false, garage: false, crusher: true, crusherOwned: null,
            lastCrime: 0, lastGta: 0, lastJail: 0, lastBooze: 0, lastHealth: 0, lastGarage: 0,
            crimes: [1,3,5], gtas: [5], player: '', inJail: false,
            jailReleaseUntil: 0, collapsed: { crime: false, gta: false, booze: false },
            minimized: false, acting: false, lastJailCk: 0, action: '', refresh: false,
            pending: '', buyHealth: false, autoOC: false, autoDTM: false,
            notifyReady: true, whitelist: false, wlNames: [], blNames: [], carCats: {},
            createOC: false, ocTrans: '', ocWeapon: '', ocExplo: '', ocSched: '',
            ocType: 'Casino', ocRepeat: 'once', ocLeft: 0, autoTravel: false, autoDtmList: false,
            halted: false
          };
          saveSt();
        } catch(_) {}

        alert('Reset complete — refreshing');
        setTimeout(() => window.location.reload(), 500);
      }
    });
    _shadow.querySelector('#jb-clear-player').addEventListener('click', () => {
      if (confirm('Clear player data?')) { st.player = ''; GM_setValue('cbPlayer',''); GM_setValue('cbLastNotifiedId',null); setStatus('Player cleared'); }
    });

    // Break settings
    _shadow.querySelector('#jb-coffee-on').addEventListener('change', e => { breaks.coffeeOn = e.target.checked; saveBreaks(); if(breaks.coffeeOn) scheduleCoffee(); });
    _shadow.querySelector('#jb-coffee-min').addEventListener('change', e => { breaks.coffeeMinGap = Math.max(10,parseInt(e.target.value)||45); saveBreaks(); });
    _shadow.querySelector('#jb-coffee-max').addEventListener('change', e => { breaks.coffeeMaxGap = Math.max(20,parseInt(e.target.value)||90); saveBreaks(); });
    _shadow.querySelector('#jb-coffee-dur').addEventListener('change', e => { breaks.coffeeDuration = Math.max(1,Math.min(15,parseInt(e.target.value)||5)); saveBreaks(); });
    _shadow.querySelector('#jb-lunch-on').addEventListener('change', e => { breaks.lunchOn = e.target.checked; saveBreaks(); });
    _shadow.querySelector('#jb-lunch-time').addEventListener('change', e => { breaks.lunchTime = e.target.value; saveBreaks(); });
    _shadow.querySelector('#jb-lunch-dur').addEventListener('change', e => { breaks.lunchDuration = Math.max(5,Math.min(120,parseInt(e.target.value)||30)); saveBreaks(); });
    _shadow.querySelector('#jb-lunch-jitter').addEventListener('change', e => { breaks.lunchJitter = Math.max(0,Math.min(30,parseInt(e.target.value)||10)); saveBreaks(); });
    _shadow.querySelector('#jb-lunch-mode').addEventListener('change', e => { breaks.lunchMode = e.target.value; saveBreaks(); });
    _shadow.querySelector('#jb-sleep-on').addEventListener('change', e => { breaks.sleepOn = e.target.checked; saveBreaks(); });
    _shadow.querySelector('#jb-sleep-time').addEventListener('change', e => { breaks.sleepTime = e.target.value; saveBreaks(); });
    _shadow.querySelector('#jb-wake-time').addEventListener('change', e => { breaks.wakeTime = e.target.value; saveBreaks(); });
    _shadow.querySelector('#jb-sleep-jitter').addEventListener('change', e => { breaks.sleepJitter = Math.max(0,Math.min(30,parseInt(e.target.value)||10)); saveBreaks(); });
    _shadow.querySelector('#jb-sleep-mode').addEventListener('change', e => { breaks.sleepMode = e.target.value; saveBreaks(); });
    _shadow.querySelector('#jb-sleep-logout').addEventListener('change', e => { breaks.sleepLogout = e.target.checked; saveBreaks(); });

    // Update break status periodically
    setInterval(() => {
      const el = _shadow.querySelector('#jb-break-status');
      if (el) el.textContent = 'Break: ' + (getBreakStatus().msg || 'None active');
      // Refresh jail counter too (catches game-day rollover during idle)
      updateJailCountUI();
      try { updateDailyCountUI(); } catch(_){}
      try { updateDtmKickUI(); } catch(_){}
      try { updateHqUI(); } catch(_){}
      /* Staff readout. Deliberately distinguishes "nobody on" from "we don't
       * know" — a stale reading suppresses nothing, so saying "all clear" when
       * the check is actually failing would be a lie you'd act on. */
      try {
        const ms = _shadow.querySelector('#jb-mod-status');
        if (ms) {
          if (!cfg.modWatchOn) { ms.textContent = 'Staff watch off'; ms.style.color = 'var(--jb-text-ter)'; }
          else {
            const s = modState(), on = modsOnline();
            if (!s) { ms.textContent = 'Not checked yet'; ms.style.color = 'var(--jb-text-ter)'; }
            else if (Date.now() - (s.at||0) > MOD_STALE_MS) {
              ms.textContent = `⚠️ Last check ${fmtAgo(s.at)} — stale, suppressing nothing`;
              ms.style.color = 'var(--jb-warning)';
            } else if (on.length) {
              ms.textContent = `👮 Online: ${on.join(', ')}${modBreakActive() ? ` · break ${modBreakRemainingMin()}m` : (cfg.noJailOnMod ? ' · jail held' : '')}`;
              ms.style.color = 'var(--jb-danger)';
            } else {
              ms.textContent = `✅ No staff online (checked ${fmtAgo(s.at)})`;
              ms.style.color = 'var(--jb-success)';
            }
          }
        }
      } catch(_){}
    }, 5000);

    try {
      const dot = _shadow.querySelector('#jb-mod-light-dot');
      const txt = _shadow.querySelector('#jb-mod-light-text');
      const wrap = _shadow.querySelector('#jb-mod-light');
      if (wrap && dot && txt) {
        if (!cfg.modWatchOn) {
          dot.style.color = 'var(--jb-text-ter)';
          dot.style.background = 'var(--jb-text-ter)';
          txt.textContent = 'off';
          wrap.title = 'Staff watch is off';
        } else {
          const s = modState();
          if (!s) {
            dot.style.color = 'var(--jb-text-ter)';
            dot.style.background = 'var(--jb-text-ter)';
            txt.textContent = 'n/a';
            wrap.title = 'Staff watch has not checked yet';
          } else if (Date.now() - (s.at || 0) > MOD_STALE_MS) {
            dot.style.color = 'var(--jb-warning)';
            dot.style.background = 'var(--jb-warning)';
            txt.textContent = 'stale';
            wrap.title = 'Staff check is stale — jail suppression is not active';
          } else if (modsOnline().length) {
            dot.style.color = 'var(--jb-danger)';
            dot.style.background = 'var(--jb-danger)';
            txt.textContent = 'online';
            wrap.title = 'Staff is online — jail suppression is active';
          } else {
            dot.style.color = 'var(--jb-success)';
            dot.style.background = 'var(--jb-success)';
            txt.textContent = 'clear';
            wrap.title = 'No staff online';
          }
        }
      }
    } catch(_){ }

    // Whitelist modal
    function openModal2(id) { const m = _shadow.querySelector(id); const bg = _shadow.querySelector('#jb-backdrop'); if(m){m.classList.add('open');} if(bg)bg.style.display='block'; }
    function closeModal2(id) { const m = _shadow.querySelector(id); const bg = _shadow.querySelector('#jb-backdrop'); if(m)m.classList.remove('open'); if(bg)bg.style.display='none'; }

    _shadow.querySelector('#jb-wl-on').addEventListener('click', e => {
      // Checkbox only — no label wrapping, so no conflict
    });
    // Open whitelist modal from the text link (single click)
    _shadow.querySelector('#jb-wl-link').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openModal2('#jb-wl-modal');
      renderWl();
    });

    _shadow.querySelector('#jb-wl-close').addEventListener('click', () => closeModal2('#jb-wl-modal'));

    // XP Charts modal
    const xpChartsLink = _shadow.querySelector('#jb-xp-charts-link');
    if (xpChartsLink) xpChartsLink.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openModal2('#jb-xp-modal');
      renderXpCharts();
    });
    const xpClose = _shadow.querySelector('#jb-xp-close');
    if (xpClose) xpClose.addEventListener('click', () => closeModal2('#jb-xp-modal'));
    const xpReset = _shadow.querySelector('#jb-xp-reset');
    if (xpReset) xpReset.addEventListener('click', () => {
      resetXpSession();
      renderXpCharts();
      setStatus('XP session reset');
    });
    // Fire a report immediately and re-baseline, so the next scheduled one measures
    // from now rather than double-counting this period.
    const xpReportNow = _shadow.querySelector('#jb-xp-report-now');
    if (xpReportNow) xpReportNow.addEventListener('click', () => {
      if (!tg.enabled || !tg.token || !tg.chat) { setStatus('⚠️ Telegram not configured'); return; }
      try { sendXpReport(); resetXpReportClock(); setStatus('📤 XP report sent'); }
      catch(e) { setStatus('⚠️ XP report failed'); console.warn(APP_TAG, e); }
    });

    function renderWl() {
      const el = _shadow.querySelector('#jb-wl-entries');
      if (!el) return;
      el.innerHTML = '';
      if (!st.wlNames.length) { el.innerHTML = '<div class="jb-sub">No players — all invites accepted.</div>'; return; }
      st.wlNames.forEach((name, i) => {
        const row = document.createElement('div');
        row.className = 'jb-row';
        const inp = document.createElement('input');
        inp.className = 'jb-input'; inp.value = name; inp.placeholder = `Player ${i+1}`; inp.style.flex = '1';
        inp.addEventListener('change', () => { st.wlNames[i] = inp.value.trim(); saveSt(); });
        const btn = document.createElement('button');
        btn.className = 'jb-btn jb-btn-danger'; btn.textContent = '✕'; btn.style.padding = '2px 6px';
        btn.addEventListener('click', () => { st.wlNames.splice(i,1); saveSt(); renderWl(); });
        row.appendChild(inp); row.appendChild(btn);
        el.appendChild(row);
      });
    }
    _shadow.querySelector('#jb-wl-add').addEventListener('click', () => { if(st.wlNames.length >= 10) return alert('Max 10'); st.wlNames.push(''); saveSt(); renderWl(); });

    function renderBl() {
      const el = _shadow.querySelector('#jb-bl-entries');
      if (!el) return;
      el.innerHTML = '';
      if (!st.blNames || !st.blNames.length) { el.innerHTML = '<div class="jb-sub">No blacklisted players.</div>'; return; }
      st.blNames.forEach((name, i) => {
        const row = document.createElement('div');
        row.className = 'jb-row';
        const inp = document.createElement('input');
        inp.className = 'jb-input'; inp.value = name; inp.placeholder = `Player ${i+1}`; inp.style.flex = '1';
        inp.addEventListener('change', () => { st.blNames[i] = inp.value.trim(); saveSt(); });
        const btn = document.createElement('button');
        btn.className = 'jb-btn jb-btn-danger'; btn.textContent = '✕'; btn.style.padding = '2px 6px';
        btn.addEventListener('click', () => { st.blNames.splice(i,1); saveSt(); renderBl(); });
        row.appendChild(inp); row.appendChild(btn);
        el.appendChild(row);
      });
    }
    if (!Array.isArray(st.blNames)) st.blNames = [];
    _shadow.querySelector('#jb-bl-add').addEventListener('click', () => { if(st.blNames.length >= 20) return alert('Max 20'); st.blNames.push(''); saveSt(); renderBl(); });
    renderBl();
    _shadow.querySelector('#jb-clear-cd').addEventListener('click', () => {
      localStorage.removeItem(LS_LAST_DTM_ACC); localStorage.removeItem(LS_LAST_OC_ACC);
      localStorage.removeItem(LS_LAST_DTM_MAIL); localStorage.removeItem(LS_LAST_OC_MAIL);
      localStorage.removeItem('cbHandledOc'); localStorage.removeItem('cbHandledDtm');
      localStorage.removeItem('cbPendDtmHandle'); localStorage.removeItem('cbPendOcHandle');
      localStorage.removeItem(LS_PEND_DTM); localStorage.removeItem(LS_PEND_OC);
      setStatus('Cooldowns cleared');
    });

    // Online Watch modal
    // (the front-panel #jb-ow-on handler is registered once, further up — it used
    // to be bound here a second time as well, so every toggle restarted the scan
    // timer twice)
    const owModalOn = _shadow.querySelector('#jb-ow-modal-on');
    if (owModalOn) owModalOn.addEventListener('change', e => {
      ow.on = e.target.checked; saveOw(); owStart(); renderOwUI();
    });
    { const g2 = _shadow.querySelector('#jb-ow-modal-on2');
      if (g2) g2.addEventListener('change', e => { ow.on2 = e.target.checked; saveOw(); owStart(); renderOwUI(); }); }
    _shadow.querySelector('#jb-ow-close').addEventListener('click', () => closeModal2('#jb-ow-modal'));
    _shadow.querySelector('#jb-ow-sec').addEventListener('change', e => { ow.sec = Math.max(OW_MIN_SEC,Math.min(3600,parseInt(e.target.value)||OW_DEF_SEC)); saveOw(); owStart(); });
    _shadow.querySelector('#jb-ow-notify').addEventListener('change', e => { ow.notify = e.target.checked; saveOw(); if(ow.notify) askNotifyPerm(); });
    _shadow.querySelector('#jb-ow-flash').addEventListener('change', e => { ow.flash = e.target.checked; saveOw(); });
    _shadow.querySelector('#jb-ow-sound').addEventListener('change', e => { ow.sound = e.target.checked; saveOw(); });
    _shadow.querySelector('#jb-ow-tg').addEventListener('change', e => { ow.telegram = e.target.checked; saveOw(); });
    _shadow.querySelector('#jb-ow-offnotify').addEventListener('change', e => { ow.notifyOff = e.target.checked; saveOw(); });
    { const lm = _shadow.querySelector('#jb-ow-logout-mins'); if (lm) lm.addEventListener('change', e => { ow.logoutMins = Math.max(1, Math.min(1440, parseInt(e.target.value,10)||60)); e.target.value = ow.logoutMins; saveOw(); }); }
    { const pk = _shadow.querySelector('#jb-ow-park'); if (pk) pk.addEventListener('change', e => { ow.logoutPark = e.target.checked; saveOw(); }); }
    { const pu = _shadow.querySelector('#jb-ow-park-url'); if (pu) pu.addEventListener('change', e => { const v = e.target.value.trim(); ow.parkUrl = v || 'https://www.google.co.uk'; e.target.value = ow.parkUrl; saveOw(); }); }
    _shadow.querySelector('#jb-ow-scan').addEventListener('click', () => owScan('manual'));
    _shadow.querySelector('#jb-ow-clear').addEventListener('click', () => { ow.lastOn={}; ow.lastAlert={}; ow.scanAt=0; ow.scanOk=false; ow.scanMsg='Cleared'; saveOw(); renderOwUI(); });

    const owAddBtn = _shadow.querySelector('#jb-ow-add');
    const owNameInp = _shadow.querySelector('#jb-ow-name');
    if (owAddBtn && owNameInp) {
      const addOw = () => { owAdd(owNameInp.value); owNameInp.value = ''; owNameInp.focus(); };
      owAddBtn.addEventListener('click', addOw);
      owNameInp.addEventListener('keydown', e => { if(e.key==='Enter') addOw(); });
    }

    // Implement renderOwUI properly now
    renderOwUI = function() {
      const mainCb = _shadow.querySelector('#jb-ow-on'); if(mainCb) mainCb.checked = owEnabled();
      const modalCb = _shadow.querySelector('#jb-ow-modal-on'); if(modalCb) modalCb.checked = ow.on;
      const modalCb2 = _shadow.querySelector('#jb-ow-modal-on2'); if(modalCb2) modalCb2.checked = ow.on2;
      const listEl = _shadow.querySelector('#jb-ow-list');
      if (listEl) {
        if (!ow.list.length) { listEl.innerHTML = '<div class="jb-sub">No watched players.</div>'; }
        else {
          listEl.innerHTML = ow.list.map(entry => {
            const id = owId(entry), name = owName(entry), on = !!ow.lastOn[id];
            const grp = getOwGroup(id);
            const acts = getOwActions(id);
            const chips = OW_ACTIONS.map(a => {
              const active = acts.includes(a.key);
              return `<button class="jb-ow-act" data-id="${id}" data-act="${a.key}" title="${a.label}${active?' (on)':''}"
                style="padding:1px 4px;font-size:11px;border-radius:3px;cursor:pointer;border:1px solid var(--jb-border);
                background:${active?'var(--jb-accent)':'transparent'};opacity:${active?'1':'0.45'}">${a.icon}</button>`;
            }).join('');
            return `<div style="padding:4px;background:var(--jb-surface-alt);border-radius:3px;margin-bottom:4px">
              <div class="jb-row" style="font-size:11px;align-items:center">
                <span style="color:${on?'var(--jb-success)':'var(--jb-text-ter)'}">●</span>
                <button class="jb-btn jb-ow-grp" data-id="${id}" title="Group ${grp} — click to switch" style="padding:1px 6px;font-size:10px;background:var(--jb-accent)">G${grp}</button>
                <span style="flex:1">${esc(name)} <span class="jb-sub">(${on?'Online':'Offline'})</span></span>
                <button class="jb-btn jb-ow-test" data-id="${id}" title="Test: fire this entry's ticked actions now" style="padding:1px 5px;font-size:10px">▶ Test</button>
                <button class="jb-btn jb-btn-danger jb-ow-rm" data-id="${id}" style="padding:1px 5px;font-size:10px">✕</button>
              </div>
              <div class="jb-row" style="gap:3px;margin-top:3px;flex-wrap:wrap">${chips}</div>
            </div>`;
          }).join('');
          listEl.querySelectorAll('.jb-ow-rm').forEach(btn => btn.addEventListener('click', () => owRemove(btn.getAttribute('data-id'))));
          listEl.querySelectorAll('.jb-ow-test').forEach(btn => btn.addEventListener('click', () => owTestPlayer(btn.getAttribute('data-id'))));
          listEl.querySelectorAll('.jb-ow-act').forEach(btn => btn.addEventListener('click', () => toggleOwAction(btn.getAttribute('data-id'), btn.getAttribute('data-act'))));
          listEl.querySelectorAll('.jb-ow-grp').forEach(btn => btn.addEventListener('click', () => { const eid = btn.getAttribute('data-id'); setOwGroup(eid, getOwGroup(eid) === 1 ? 2 : 1); }));
        }
      }
      const statusEl = _shadow.querySelector('#jb-ow-status');
      if (statusEl) statusEl.textContent = ow.scanOk ? ow.scanMsg : (ow.scanMsg||'Not scanned');
    };
    renderOwUI();

    // Open watch modal from text link (single click)
    _shadow.querySelector('#jb-ow-link').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openModal2('#jb-ow-modal');
      renderOwUI();
    });

    // OC Leader modal
    _shadow.querySelector('#jb-oc-close').addEventListener('click', () => closeModal2('#jb-oc-modal'));
    _shadow.querySelector('#jb-oc-type').addEventListener('change', e => { st.ocType = e.target.value; saveSt(); });
    _shadow.querySelector('#jb-oc-trans').addEventListener('blur', e => { st.ocTrans = e.target.value.trim(); saveSt(); });
    _shadow.querySelector('#jb-oc-weapon').addEventListener('blur', e => { st.ocWeapon = e.target.value.trim(); saveSt(); });
    _shadow.querySelector('#jb-oc-explo').addEventListener('blur', e => { st.ocExplo = e.target.value.trim(); saveSt(); });
    _shadow.querySelector('#jb-oc-sched').addEventListener('change', e => { st.ocSched = e.target.value; saveSt(); });
    _shadow.querySelector('#jb-oc-repeat').addEventListener('change', e => {
      st.ocRepeat = e.target.value;
      if (e.target.value === 'repeat_1') st.ocLeft = 1;
      else if (e.target.value === 'repeat_2') st.ocLeft = 2;
      else if (e.target.value === 'repeat_3') st.ocLeft = 3;
      else st.ocLeft = 0;
      saveSt();
    });
    _shadow.querySelector('#jb-hot-refresh').addEventListener('click', () => { localStorage.removeItem(LS_HOT); localStorage.removeItem(LS_HOT_UNTIL); localStorage.removeItem('cbHotFetchAt'); fetchHot(); });
    _shadow.querySelector('#jb-oc-reset').addEventListener('click', () => { resetCreateOC(); const s = _shadow.querySelector('#jb-oc-state'); if(s) s.textContent = 'idle (step 0)'; });

    // Open OC modal from text link (single click)
    _shadow.querySelector('#jb-oc-link').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openModal2('#jb-oc-modal');
    });

    // DTM creation toggle + modal
    _shadow.querySelector('#jb-create-dtm').checked = st.createDTM;
    _shadow.querySelector('#jb-create-dtm').addEventListener('change', e => {
      st.createDTM = e.target.checked; saveSt();
      setStatus('🚚 Create DTM ' + (st.createDTM ? 'ON' : 'OFF'));
      if (st.createDTM && !getHot()) fetchHot();
    });
    _shadow.querySelector('#jb-dtm-link').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openModal2('#jb-dtm-modal');
    });
    _shadow.querySelector('#jb-dtm-close').addEventListener('click', () => closeModal2('#jb-dtm-modal'));
    _shadow.querySelector('#jb-dtm-partner').addEventListener('blur', e => { st.dtmPartner = e.target.value.trim(); saveSt(); });
    { const ap = _shadow.querySelector('#jb-dtm-autopartner');
      if (ap) ap.addEventListener('change', e => {
        cfg.dtmAutoPartner = e.target.checked;
        GM_setValue('cbDtmAutoPartner', cfg.dtmAutoPartner);
        const r = _shadow.querySelector('#jb-dtm-partner-role');
        if (r) r.textContent = cfg.dtmAutoPartner ? '(fallback if the list is empty — may be left blank)' : '(always invited)';
        setStatus(cfg.dtmAutoPartner ? '🎲 DTM partner from the list' : '🎲 DTM partner fixed');
      }); }
    _shadow.querySelector('#jb-dtm-sched').addEventListener('change', e => { st.dtmSched = e.target.value; saveSt(); });
    _shadow.querySelector('#jb-dtm-repeat').addEventListener('change', e => {
      st.dtmRepeat = e.target.value;
      if (e.target.value === 'repeat_1') st.dtmLeft = 1;
      else if (e.target.value === 'repeat_2') st.dtmLeft = 2;
      else st.dtmLeft = 0;
      saveSt();
    });
    _shadow.querySelector('#jb-dtm-reset').addEventListener('click', () => {
      resetCreateDTM();
      const s = _shadow.querySelector('#jb-dtm-state');
      if (s) s.textContent = 'idle (step 0)';
    });

    // Initialize jail counter display
    updateJailCountUI();
    try { updateDailyCountUI(); } catch(_){}
    try { updateDtmKickUI(); } catch(_){}
    try { updateHqUI(); } catch(_){}
    try { updateSmartPreview(); } catch(_){}

    // Drag — grab from anywhere on the panel except interactive controls
    let locked = GM_getValue('cbLocked', true);
    let posX = GM_getValue('cbPosX', null), posY = GM_getValue('cbPosY', null);
    if (posX !== null && posY !== null) { host.style.right = 'auto'; host.style.left = posX+'px'; host.style.top = posY+'px'; }
    const lockBtn = _shadow.querySelector('#jb-lock-btn');
    // Elements that must keep their own click/drag behaviour (never start a move).
    const DRAG_IGNORE = 'button, a, input, select, textarea, label, .jb-switch, .jb-hbtn, .jb-ow-act, .jb-modal, .jb-modal-bg, [contenteditable], [role="button"]';
    function updLock() { lockBtn.textContent = locked ? '🔒' : '🔓'; root.style.cursor = locked ? 'default' : 'move'; }
    updLock();
    lockBtn.addEventListener('click', e => { e.stopPropagation(); locked = !locked; GM_setValue('cbLocked', locked); updLock(); });
    let dragging = false, dx, dy, hx, hy;
    root.addEventListener('mousedown', e => {
      if (locked || e.button !== 0) return;
      if (e.target.closest(DRAG_IGNORE)) return;   // clicked a control — let it work
      dragging = true; root.style.cursor = 'grabbing';
      const rect = host.getBoundingClientRect(); hx = rect.left; hy = rect.top; dx = e.clientX; dy = e.clientY;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => { if (!dragging) return; host.style.right='auto'; host.style.left=(hx+e.clientX-dx)+'px'; host.style.top=(hy+e.clientY-dy)+'px'; });
    document.addEventListener('mouseup', () => { if (!dragging) return; dragging = false; root.style.cursor = locked?'default':'move'; const r = host.getBoundingClientRect(); GM_setValue('cbPosX',r.left); GM_setValue('cbPosY',r.top); });

    // Make each modal window draggable by its title bar. Modals are centred via
    // a CSS transform, so on first grab we switch to explicit left/top coords.
    function makeModalDraggable(modal, handle) {
      handle.style.cursor = 'move';
      let md = false, sx, sy, sl, stp;
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0 || e.target.closest('button, input, select, textarea, a')) return;
        const rect = modal.getBoundingClientRect();
        modal.style.transform = 'none';
        modal.style.left = rect.left + 'px';
        modal.style.top  = rect.top + 'px';
        md = true; sx = e.clientX; sy = e.clientY; sl = rect.left; stp = rect.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!md) return;
        modal.style.left = (sl + e.clientX - sx) + 'px';
        modal.style.top  = (stp + e.clientY - sy) + 'px';
      });
      document.addEventListener('mouseup', () => { md = false; });
    }
    _shadow.querySelectorAll('.jb-modal').forEach(m => {
      const head = m.querySelector('.jb-modal-head');
      if (head) makeModalDraggable(m, head);
    });
  }


  /* === AUTO TRAVEL TO HOT CITY & DTM LIST === */

  const OCADS_PATH = '/authenticated/ocads.aspx';
  const LS_DTM_LIST_DONE = 'cbDtmListDone';
  const LS_TRAVEL_PENDING = 'cbTravelPending';
  /* Last travel ATTEMPT, not last successful travel. Set synchronously before the
   * click and read as a cooling-off period, so a flight the game refuses can't be
   * retried on a loop — see doAutoTravel. */
  const LS_TRAVEL_ACTED = 'cbTravelJustActed';
  const TRAVEL_RETRY_MS = 30000;
  /* How long the status bar may still show the take-off city before we treat the
   * flight as not having happened. It is a postback plus a page load, so this is
   * generous on purpose — a false "travel went wrong" is worse than a late one. */
  const TRAVEL_SETTLE_MS = 90000;

  // Check if we're currently in the hot city
  function isInHot() {
    const hot = getHot();
    if (!hot) return false;
    const cur = getCurCity();
    if (!cur) return false;
    return cur.toLowerCase().includes(hot.toLowerCase()) || hot.toLowerCase().includes(cur.toLowerCase());
  }

  // Auto-travel to hot city via the travel page
  /* === SHARED DESTINATION RESOLUTION (2000.278) ===
   * Lifted out of doAutoTravel unchanged so the shot retreat can use the same
   * rules on a FETCHED page. The only edit is that the <label for> lookup takes
   * an explicit root instead of assuming `document`.
   *
   * It is shared rather than copied deliberately. A second copy of a city matcher
   * is exactly the drift that produced the duplicate isInHot() removed in 250 —
   * and this particular matcher has its own scar tissue (259 → 263 → 264 → 267),
   * none of which should have to be rediscovered on a second code path.
   */
  function travelLabelOf(r, root) {
    const R = root || document;
    // 1. <label for="id"> — what ASP.NET actually emits, and unambiguous.
    if (r.id) {
      try {
        const l = R.querySelector(`label[for="${CSS.escape(r.id)}"]`);
        if (l && (l.textContent || '').trim()) return l.textContent.trim();
      } catch(_) {}
    }
    // 2. A <label> wrapping this radio.
    const wrap = r.closest('label');
    if (wrap && (wrap.textContent || '').trim()) return wrap.textContent.trim();
    // 3. The text that follows it, stopping at the next control.
    let s = '';
    for (let n = r.nextSibling; n; n = n.nextSibling) {
      if (n.nodeType === 1 && /^(INPUT|BR|TABLE)$/.test(n.tagName)) break;
      s += n.textContent || '';
      if (s.trim()) break;
    }
    if (s.trim()) return s.trim();
    /* 4. CLIMB (2000.263). The radio commonly sits in its OWN cell with the city
     * name in a SIBLING cell, so the innermost container holds one radio and no
     * text — which is why 259 refused to fly at all. Walk up, stopping the moment
     * an ancestor would hold more than one radio: that ancestor names every city,
     * which is the original 259 bug this guard exists to prevent. */
    const GROUP = 'input[type=radio][name="ctl00$main$citieslist"]';
    for (let n = r.parentElement, up = 0; n && up < 6; n = n.parentElement, up++) {
      if (n.querySelectorAll(GROUP).length !== 1) break;   // shared — names several cities
      const t = (n.textContent || '').replace(/s+/g, ' ').trim();
      if (t) return t;
    }
    return '';
  }

  /* Exact first, then prefix, then substring. An exact match must win: with a
   * plain substring test a want of "York" would take "New York", first row at
   * that. Returns every candidate — the CALLER decides what to do when the count
   * isn't exactly one, because auto-travel and the shot retreat refuse
   * differently. */
  function travelMatch(cities, wantLower) {
    const norm = s => String(s || '').trim().toLowerCase();
    const exact = cities.filter(c => norm(c.label) === wantLower);
    if (exact.length) return exact;
    const pre = cities.filter(c => norm(c.label).startsWith(wantLower));
    if (pre.length) return pre;
    return cities.filter(c => c.label && norm(c.label).includes(wantLower));
  }
  async function doAutoTravel() {
    if (!st.autoTravel || st.inJail || st.acting || paused) return false;

    /* DID THE LAST FLIGHT LAND WHERE IT WAS AIMED? (2000.274)
     *
     * THE ORIGIN IS THE MISSING PIECE. This compared the status bar against the
     * intended city and called any difference a wrong landing — but the check
     * runs on the postback response, whose status bar is still the PRE-FLIGHT
     * render. So a perfectly good flight reported "aimed at New York, landed in
     * Paris", where Paris was simply where you took off FROM.
     *
     * Knowing the origin makes the three cases separable:
     *   · showing the destination  → arrived, done.
     *   · still showing the origin → the page has not caught up. Say nothing and
     *     look again next tick; only complain if it is STILL the origin after
     *     TRAVEL_SETTLE_MS, which would mean the flight really did not happen.
     *   · somewhere else entirely  → genuinely wrong, and worth an alert.
     *
     * 2000.273 switched auto-travel off after two "wrong" arrivals. That is
     * removed: the premise was false, travel was working, and it would have
     * disabled a working feature on the strength of this bug. */
    try {
      const want = localStorage.getItem('cbTravelWanted');
      if (want) {
        const cur = getCurCity();
        if (cur) {                                   // status bar has rendered
          const from = localStorage.getItem('cbTravelFrom') || '';
          const at   = parseInt(localStorage.getItem('cbTravelWantedAt') || '0', 10) || 0;
          /* Tolerant both ways, exactly like isInHot(). A false alarm on the
           * happy path is worse than no alarm — it trains you to ignore the one
           * message that would matter if it were ever real. */
          const same = (x, y) => {
            const p = String(x||'').trim().toLowerCase(), q = String(y||'').trim().toLowerCase();
            return !!p && !!q && (p === q || p.includes(q) || q.includes(p));
          };
          const clear = () => { ['cbTravelWanted','cbTravelFrom','cbTravelWantedAt']
                                  .forEach(k => localStorage.removeItem(k)); };

          if (same(cur, want)) {
            clear();
            dlog(APP_TAG, `[TRAVEL] Arrived in ${cur} as intended`);
          } else if (from && same(cur, from)) {
            // Still reading the take-off city: the page simply has not caught up.
            if (at && Date.now() - at > TRAVEL_SETTLE_MS) {
              clear();
              console.warn(APP_TAG, `[TRAVEL] Still in "${cur}" ${Math.round((Date.now()-at)/1000)}s after aiming at "${want}" — the flight does not appear to have happened`);
              tgOnce('travel_stuck', 1800, `✈️ <b>Travel didn't happen</b>\n${st.player||'?'} | still in <b>${esc(cur)}</b>, was aiming for <b>${esc(want)}</b>`);
            } else {
              dlog(APP_TAG, `[TRAVEL] Status bar still shows ${cur} (take-off city) — waiting for it to catch up`);
            }
          } else {
            clear();
            console.warn(APP_TAG, `[TRAVEL] Aimed at "${want}" from "${from||'?'}" but the status bar reads "${cur}"`);
            tgOnce('travel_wrong', 900, `⚠️ <b>Travel went wrong</b>\n${st.player||'?'} | aimed at <b>${esc(want)}</b>, ended up in <b>${esc(cur)}</b>`);
          }
        }
      }
    } catch(_){}

    // Need hot city known
    if (!getHot()) { fetchHot(); return false; }

    // Already in hot city
    if (isInHot()) {
      localStorage.removeItem(LS_TRAVEL_PENDING);
      return false;
    }

    // Check travel timer is ready
    const travel = getTravel();
    if (!travel || !travel.ready) return false;

    /* Cooling-off after an attempt (2000.257).
     *
     * The stored 20m cooldown below is written on the ASSUMPTION the flight was
     * accepted, and fetchTravel corrects it from the real page a few seconds
     * later. If the game actually refused, that correction hands back "ready" —
     * and without this guard we would immediately try again, and again, for as
     * long as the refusal persists. Rate-limit the retry rather than trusting the
     * outcome we can't see from here. */
    const actedAt = parseInt(localStorage.getItem(LS_TRAVEL_ACTED) || '0', 10);
    if (actedAt && Date.now() - actedAt < TRAVEL_RETRY_MS) {
      dlog(APP_TAG, `[TRAVEL] Tried ${Math.round((Date.now()-actedAt)/1000)}s ago — waiting before another attempt`);
      return false;
    }

    const pg = curPage();

    // If not on travel page, navigate there
    if (pg !== 'travel') {
      console.log('[JB][TRAVEL] Navigating to travel page for auto-travel to', getHot());
      localStorage.setItem(LS_TRAVEL_PENDING, '1');
      setStatus(`✈️ Traveling to ${getHot()}...`);
      safeNav('/authenticated/travel.aspx?' + Date.now());
      return true;
    }

    // On travel page — select hot city radio and click travel
    if (localStorage.getItem(LS_TRAVEL_PENDING) === '1') {
      const hotCity = getHot();
      const hotLower = hotCity.toLowerCase();
      console.log('[JB][TRAVEL] On travel page — looking for radio matching', hotCity);

      /* WHICH RADIO IS THIS CITY? (rewritten 2000.259)
       *
       * The old line read the label as:
       *
       *     r.parentElement?.textContent || r.closest('td,tr,label')?.textContent
       *
       * `parentElement.textContent` is the text of the WHOLE parent. Whenever the
       * radios share a container — a flow-layout span or div, or a <tr> when the
       * list renders horizontally — that string contains EVERY city name, so
       * `label.includes(hotCity)` was true for the FIRST radio and the loop broke
       * there. It would then travel to the first city on the page whatever the hot
       * city was, every time. (The `tr` in that fallback selector is the giveaway:
       * a <tr> in an ASP.NET RadioButtonList holds all of them.)
       *
       * This resolves the label PER RADIO instead, strongest link first, and never
       * reads a container holding more than one radio. */
      const radios = [...document.querySelectorAll('input[type=radio][name="ctl00$main$citieslist"]')];

      /* NO DESTINATION LIST AT ALL (2000.264).
       *
       * This is what produced "couldn't identify Toronto in the destination
       * list" on a build where travel otherwise worked. There was nothing to
       * choose FROM: the page served no radios, because the game was not
       * offering travel at that moment — our local countdown said Ready and the
       * server disagreed.
       *
       * That is a TIMER problem reported as a MATCHING problem, and it is what
       * sent 2000.259 and 2000.263 rummaging through the label resolver twice.
       * Zero radios must never reach the matcher: with cities empty, "none
       * matched" is trivially true and the old message blamed the city.
       *
       * Re-read the real cooldown so the local countdown resyncs, say plainly
       * what happened, and don't raise the wrong alarm. */
      if (!radios.length) {
        console.warn(APP_TAG, '[TRAVEL] No destinations offered on the travel page — the game is not letting us fly yet, so the stored cooldown was optimistic. Re-reading it.');
        setStatus('✈️ Not travelable yet — re-checking');
        localStorage.removeItem(LS_TRAVEL_PENDING);
        try { bgSetDue('travel', 0); } catch(_){}   // re-read on the next tick too
        try { fetchTravel(); } catch(_){}
        return false;
      }

      const labelOf = r => travelLabelOf(r, document);   // shared — see travelLabelOf

      const cities = radios.map(r => ({ r, label: labelOf(r) }));
      console.log('[JB][TRAVEL] Destinations on this page:',
                  cities.map(c => `${c.label || '(no label)'}=${c.r.value}`).join(', '));

      /* Exact first, then prefix, then substring. An exact match must win: with a
       * plain substring test a hot city of "York" would take "New York", and the
       * first row at that. */
      const near = travelMatch(cities, hotLower);   // shared — see travelMatch

      if (near.length !== 1) {
        /* Nothing matched, or several did. REFUSE — travelling to a guess is what
         * this whole rewrite exists to stop, and a wrong flight costs the 20m
         * cooldown as well as leaving you in the wrong city. */
        /* Say WHICH failure this is. "No city matched" and "no labels could be
         * read at all" look identical from outside but mean very different
         * things — the second is a markup problem in labelOf(), and not saying
         * so is why the 2000.259 refusal took days to pin down. */
        const unlabelled = cities.length ? cities.filter(c => !c.label).length : -1;
        console.warn(APP_TAG, near.length
          ? `[TRAVEL] "${hotCity}" matched ${near.length} destinations (${near.map(c=>c.label).join(' / ')}) — refusing to guess`
          : `[TRAVEL] No destination matches "${hotCity}"${unlabelled === cities.length ? ` — and NONE of the ${cities.length} destinations had a readable label, so this is a markup problem, not a missing city` : ``} — not travelling`);
        tgOnce('travel_nocity', 1800, `✈️ <b>Travel refused</b>\n${st.player||'?'} | couldn't identify <b>${esc(hotCity)}</b> in the destination list — ${esc(unlabelled === cities.length ? 'no labels readable (page markup changed)' : 'no match')}`);
        setStatus(`✈️ ${hotCity} not found in the list`);
        localStorage.removeItem(LS_TRAVEL_PENDING);
        return false;
      }

      const cityRadio = near[0].r;
      /* click() rather than .checked = true (2000.268): it is the native path,
       * so the browser clears the rest of the group and fires the events the
       * page's own handlers may be listening for. Assignment does neither. */
      try { cityRadio.click(); } catch(_){}
      if (!cityRadio.checked) {
        cityRadio.checked = true;
        try { cityRadio.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
      }
      // Log the RESOLVED LABEL, not just the id — without it a wrong pick is invisible.
      console.log(`[JB][TRAVEL] Selected "${near[0].label}" (${cityRadio.id}, value ${cityRadio.value}) for hot city ${hotCity}`);

      /* JET ONLY (2000.255).
       *
       * This used to choose between the private jet (20 min cooldown) and the
       * normal plane (45 min) depending on whether an OC or DTM was due within
       * 40 minutes. The normal plane is gone by request: the 45-minute cooldown
       * is most of the useful window, and a flight that lands you somewhere with
       * 45 minutes of grounding is rarely worth taking.
       *
       * Consequence, and it is deliberate: if the jet is unavailable — you can't
       * afford it, or the game isn't offering it — Jarvis does NOT quietly fall
       * back to the 45-minute plane. It says so and stays put. Falling back would
       * reintroduce exactly the option you asked to remove, at the moment you
       * were least watching. */
      setTimeout(() => {
        const travelBtn = document.getElementById('ctl00_main_btnTravelPrivate') ||
                          [...document.querySelectorAll('input[type="submit"]')].find(b => /private\s*jet/i.test(b.value||''));

        /* RE-CHECK THE SELECTION LIVE, IMMEDIATELY BEFORE FLYING (2000.268).
         *
         * Reported: aimed for Toronto, landed in Amsterdam. The destination is
         * chosen and then 0.5-1s passes before Travel is pressed, and nothing
         * confirmed the choice had stuck. If the page re-renders in that window,
         * or the form simply retains an earlier selection, THAT city wins and we
         * fly somewhere we never chose — Amsterdam being the previously cached
         * hot city fits exactly.
         *
         * Same rule the DTM kick already follows: re-read the live state right
         * before an irreversible act, never trust what was true a second ago.
         * A refused flight costs nothing; a wrong one costs the 20-minute
         * cooldown and leaves you in the wrong city. */
        const liveSel = document.querySelector('input[type=radio][name="ctl00$main$citieslist"]:checked');
        if (liveSel !== cityRadio) {
          console.warn(APP_TAG, `[TRAVEL] Destination slipped before takeoff — expected ${cityRadio.id} (${hotCity}), the page has ${liveSel ? liveSel.id + ' value ' + liveSel.value : 'nothing'} selected. Re-selecting.`);
          try { cityRadio.click(); } catch(_){}
          if (!cityRadio.checked) cityRadio.checked = true;
        }
        const finalSel = document.querySelector('input[type=radio][name="ctl00$main$citieslist"]:checked');
        if (finalSel !== cityRadio) {
          console.error(APP_TAG, `[TRAVEL] REFUSING to fly — could not keep ${hotCity} selected (page has ${finalSel ? finalSel.id : 'nothing'}). Not guessing a destination.`);
          tgOnce('travel_slip', 900, `✈️ <b>Travel aborted</b>
${st.player||'?'} | couldn't hold <b>${esc(hotCity)}</b> selected on the page — refused rather than fly somewhere else`);
          setStatus('✈️ Destination would not stay selected — aborted');
          localStorage.removeItem(LS_TRAVEL_PENDING);
          return;
        }

        if (travelBtn && !travelBtn.disabled) {
          /* Log the VALUE and the LABEL, not just the element id. When a flight
           * still lands in the wrong city, the only question that matters is
           * what was actually posted — an id alone cannot answer it. */
          console.log(`[JB][TRAVEL] Taking the private jet to ${hotCity} — posting ${cityRadio.id} value=${cityRadio.value} label="${near[0].label}" (20m cooldown)`);

          /* EVERY PIECE OF BOOKKEEPING HAPPENS BEFORE THE CLICK (2000.257).
           *
           * This is the fix for "it reloaded the travel page every second for
           * about 15 seconds". The click is an ASP.NET postback: it reloads this
           * page and DESTROYS every pending setTimeout with it. All of this used
           * to sit in a setTimeout after the click, so none of it ever ran —
           * cbTravelPending stayed '1' and the travel timer still read Ready, so
           * the freshly-loaded page walked into this same branch and clicked the
           * jet again. Each lap was a real travel POST to the game.
           *
           * It only ever stopped by luck: startTimers fires fetchTravel 4s after
           * each page load, and eventually one survived long enough to write the
           * real cooldown.
           *
           * Same failure and the same fix as handleDtmPage, which has carried the
           * synchronous-before-the-click guard since the DTM buy loop.
           *
           * The 20m cooldown is written before we know the flight was accepted.
           * That is the safe direction: fetchTravel re-reads the real page moments
           * later and corrects it, and since 2000.255 an unparsed cooldown can no
           * longer be mistaken for Ready. Claiming a cooldown we don't have costs
           * one delayed flight; not claiming it costs the loop above. */
          localStorage.removeItem(LS_TRAVEL_PENDING);
          localStorage.setItem(LS_TRAVEL_ACTED, String(Date.now()));
          // Where we MEANT to go — checked against where we land, at the top of
          // the next doAutoTravel. Written here so it survives the postback.
          /* The CITY, not the label (2000.267). This stored near[0].label —
           * "Toronto - Canada - $58,170 / $232,680" — while the arrival check
           * compares against getCurCity(), which is just "Toronto". They could
           * never match, so the "travel went wrong" warning fired after every
           * SUCCESSFUL flight. */
          localStorage.setItem('cbTravelWanted', hotCity);
          /* And where we are RIGHT NOW. Without it, the arrival check cannot tell
           * "the page has not refreshed yet" from "we landed somewhere wrong" —
           * which is exactly how a good flight got reported as a bad one. */
          localStorage.setItem('cbTravelFrom', getCurCity() || '');
          localStorage.setItem('cbTravelWantedAt', String(Date.now()));
          // Survives the postback, so checkStuck() doesn't call this a stall.
          localStorage.setItem('cbActionLockUntil', String(Date.now() + 8000));
          storeTravel({ cd: 20*60, canNormal: false, at: Date.now() });   // jet is always 20 min
          st.acting = true; st.action = 'travel';
          GM_setValue('cbActStart', Date.now());
          saveSt();
          tgMsg('travel', `🛩️ <b>Traveled</b>\n${st.player||'?'} → ${hotCity} | 20m cooldown`);
          setStatus(`🛩️ Jet → ${hotCity}`);

          /* Last thing, and nothing may follow it. There is no navigate-away step
           * any more: the postback IS the navigation, and the main loop picks the
           * next action from the reloaded page. */
          travelBtn.click();
        } else {
          /* No jet — say so rather than sitting silent, because from the outside
           * this looks identical to auto-travel simply not working. Throttled, as
           * it re-checks every cycle while the hot city is elsewhere. */
          console.warn(APP_TAG, '[TRAVEL] Private jet unavailable' + (travelBtn ? ' (button disabled)' : ' (button not found)') + ' — not travelling');
          setStatus('🛩️ Jet unavailable — not travelling');
          tgOnce('travel_nojet', 1800, `🛩️ <b>No jet</b>\n${st.player||'?'} | can't fly to ${esc(hotCity)} — the private jet isn't available and the 45m plane is disabled`);
          localStorage.removeItem(LS_TRAVEL_PENDING);
        }
      }, 500 + Math.floor(Math.random() * 500));
      return true;
    }

    return false;
  }

  // Auto-add to DTM list at ocads.aspx
  async function doAutoAddDtmList() {
    if (!st.autoDtmList || st.inJail || st.acting || paused) return false;

    // DTM timer must be ready
    const dtm = getDtm();
    if (!dtm || !dtm.ready) return false;

    // Must be in hot city
    if (!isInHot()) {
      // If auto-travel is on, it will handle getting us there
      return false;
    }

    // Check if we already added today (or recently) — don't spam
    const lastDone = parseInt(localStorage.getItem(LS_DTM_LIST_DONE) || '0', 10);
    if (lastDone > 0 && (Date.now() - lastDone) < 30 * 60 * 1000) {
      // Added within last 30 min — skip
      return false;
    }

    const pg = curPage();
    const onOcads = window.location.pathname.toLowerCase().includes('ocads.aspx');

    // Navigate to ocads page if not there
    if (!onOcads) {
      console.log('[JB][DTMLIST] Navigating to DTM list page');
      setStatus('📋 Adding to DTM list...');
      safeNav(OCADS_PATH + '?' + Date.now());
      return true;
    }

    // On ocads page — find and click "Add me!" button
    const addBtn = document.getElementById('ctl00_main_btnAddDTM') ||
                   document.querySelector('input[value="Add me!"]') ||
                   [...document.querySelectorAll('input[type="submit"]')].find(b => /add me/i.test(b.value||''));

    if (addBtn && !addBtn.disabled) {
      console.log('[JB][DTMLIST] Clicking Add me! button');
      st.acting = true; st.action = 'dtmlist';
      GM_setValue('cbActStart', Date.now());

      setTimeout(() => {
        addBtn.click();
        localStorage.setItem(LS_DTM_LIST_DONE, String(Date.now()));
        tgMsg('dtmList', `📋 <b>DTM List</b>\n${st.player||'?'} | Added to DTM list in ${getCurCity()}`);
        setStatus('📋 Added to DTM list');

        setTimeout(() => {
          st.acting = false; st.action = '';
          GM_setValue('cbActStart', 0);
          saveSt();
          // Go back to crimes
          window.location.href = '/authenticated/crimes.aspx?' + Date.now();
        }, 1500);
      }, 300 + Math.floor(Math.random() * 400));

      return true;
    } else {
      // Button not found or disabled — maybe already on list or not eligible
      const bodyTxt = (document.body.textContent || '').toLowerCase();
      if (bodyTxt.includes('already') || bodyTxt.includes('on the list')) {
        console.log('[JB][DTMLIST] Already on DTM list');
        localStorage.setItem(LS_DTM_LIST_DONE, String(Date.now()));
        setStatus('📋 Already on DTM list');
      } else if (bodyTxt.includes('cooldown') || bodyTxt.includes('wait')) {
        console.log('[JB][DTMLIST] DTM on cooldown');
      } else {
        console.log('[JB][DTMLIST] Add button not available');
      }
      // Navigate away
      setTimeout(() => {
        window.location.href = '/authenticated/crimes.aspx?' + Date.now();
      }, 1000);
      return true;
    }
  }

  // Clear DTM list done flag when DTM timer goes from ready to cooldown (means we did a DTM)
  function checkDtmListReset() {
    const dtm = getDtm();
    if (dtm && !dtm.ready && dtm.total > 60) {
      // DTM is on cooldown — clear the "added" flag so we re-add when it's ready again
      localStorage.removeItem(LS_DTM_LIST_DONE);
    }
  }

  /* === XP TRACKING + NO-XP STREAK LIMITER ===
   * Reads the player's Experience from the game's own status-refresh XHR
   * (hndlr.ashx?m=pst), attributes each gain to the action that fired just
   * before it, keeps a rolling history + per-action session totals for the
   * charts, and (optionally) disables an action that yields no XP N times in
   * a row — the game's daily cap, detected rather than hard-coded.
   */

  const XP_ACTIONS = ['crime','gta','booze','jail','garage','oc','dtm'];
  /* Recent-gains history. Raised from 40 to 250 in 2000.242 — the list is the
   * most useful thing on the charts for spotting what an action is actually
   * worth, and 40 entries is under an hour of play. Each entry is ~120 bytes, so
   * 250 costs about 30 KB of GM storage: cheap next to the sample array.
   * RAISING a cap is safe; LOWERING one silently destroys stored history, which
   * is why the configurable caps added in 232 were removed in 233. Don't
   * reintroduce them. */
  const XP_HISTORY_CAP = 250;
  const XP_SAMPLE_CAP  = 400;
  const xpState = {
    total:        GM_getValue('cbXpTotal', 0),
    /* Last EXACT value from the XHR feed, tracked separately from `total`.
     * `total` may have been nudged by the status-bar fallback, whose rounding can
     * overshoot the truth by up to half its step; gains are measured against this
     * instead so an overshoot can never swallow a real one. See onExperienceRead. */
    apiTotal:     GM_getValue('cbXpApiTotal', 0),
    lastApiAt:    GM_getValue('cbXpLastApiAt', 0),
    sessionGain:  GM_getValue('cbXpSessionGain', 0),
    sessionBase:  GM_getValue('cbXpSessionBase', 0),
    // How many readings covered exactly one action vs several — the honest
    // measure of how far to trust the per-action bars. See onExperienceRead.
    cleanReads:   GM_getValue('cbXpCleanReads', 0),
    bundledReads: GM_getValue('cbXpBundledReads', 0),
    // Recent per-bust XP samples, from readings that contained nothing but jail.
    // The MEDIAN of these is what gets subtracted when an OC/DTM payout shares a
    // reading with busts — see jailAvgXp().
    jailRates:    GM_getValue('cbXpJailRates', null) || [],
    jailSamples:  GM_getValue('cbXpJailSamples', 0),
    sessionStart: GM_getValue('cbXpSessionStart', Date.now()),
    perAction:    GM_getValue('cbXpPerAction', null) || {},
    history:      GM_getValue('cbXpHistory', null) || [],
    samples:      GM_getValue('cbXpSamples', null) || []
  };
  XP_ACTIONS.forEach(a => { if (typeof xpState.perAction[a] !== 'number') xpState.perAction[a] = 0; });

  const ACTION_ICON = { crime:'👜', gta:'🏎️', booze:'🍺', jail:'⛓️', garage:'🏪', oc:'🎯', dtm:'💊', other:'⚡' };

  /* === RANK TABLE (per-rank XP requirements) ===
   * perRankReq[i] = XP needed WITHIN rank-step i to advance to the next rank.
   * Supplied by a Legend-rank player. The game's status bar gives us the rank
   * NAME and a PERCENTAGE toward the next rank (lblrank / lblRankbarPerc, already
   * parsed by readBar). This table turns that bare % into absolute numbers
   * ("X XP into rank, Y to next") and powers the rank ladder on the stats page.
   * cumRankReq = running totals, used to locate the current rank from a cumulative
   * Experience value when one is available (self-validated against the status %).
   */
  const perRankReq = [5, 15, 60, 60, 80, 100, 130, 150, 200, 300, 400, 500, 1000, 2000, 3000, 3000];
  const cumRankReq = (() => { let s = 0; return perRankReq.map(v => (s += v)); })(); // [5,20,80,140,...]

  /* === RANK NAMES + ABSOLUTE THRESHOLDS ===
   * The 17 ranks in order with the cumulative XP needed to REACH each one. Taken
   * from the moderator reference script's own RANKS table, which cross-validates
   * perRankReq exactly: every gap here equals the matching perRankReq entry
   * (5,15,60,60,80,100,130,150,200,300,400,500,1000,2000,3000,3000). This closes
   * the long-standing gap where the ladder could only label steps "Step N" and
   * XP-to-next was approximate — we now have real names and exact thresholds.
   */
  const RANKS = [
    ['Scum', 0], ['Wannabe', 5], ['Goon', 20], ['Thug', 80], ['Criminal', 140],
    ['Wanted Criminal', 220], ['Gangster', 320], ['Hitman', 450], ['Hired Gunner', 600],
    ['Assassin', 800], ['Boss', 1100], ['Don', 1500], ['Enemy of the State', 2000],
    ['Global Threat', 3000], ['Global Dominator', 5000], ['Global Disaster', 8000],
    ['Legend', 11000]
  ];

  // Progress toward the next rank for a given cumulative XP value.
  // Returns { rank, next, pct, toNext }; next is null at max rank (Legend).
  function xpRankProgress(xp) {
    if (!Number.isFinite(xp) || xp < 0) return null;
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) { if (xp >= RANKS[i][1]) idx = i; else break; }
    const [rank, base] = RANKS[idx];
    if (idx >= RANKS.length - 1) return { rank, next: null, pct: 100, toNext: 0 };
    const [nextRank, nextBase] = RANKS[idx + 1];
    const span = nextBase - base;
    const pct = span > 0 ? Math.min(100, Math.max(0, ((xp - base) / span) * 100)) : 0;
    return { rank, next: nextRank, pct, toNext: parseFloat((nextBase - xp).toFixed(2)) };
  }

  /* === STATUS-BAR XP FALLBACK (2000.224) ===
   * hndlr.ashx?m=pst is unreliable in practice: with Jarvis running, three
   * consecutive hourly reports showed the total frozen at exactly 3944.20 — not
   * one usable value in 3+ hours. Meanwhile the game's own status bar reported
   * 54.4% toward Global Dominator while our stored total implied 47.2%, i.e. the
   * server knew about ~145 XP we never received.
   *
   * The status bar is server-rendered on EVERY authenticated page load and gives
   * us the rank NAME plus a percentage toward the next rank (both already parsed
   * by readBar). With the real RANKS thresholds we can invert that into an
   * absolute XP figure:  xp = base + (pct/100) * (nextBase - base)
   *
   * Verified against a live hndlr payload: bar 58.42% → 3000 + 0.5842*2000 =
   * 4168.40, actual Experience 4168.4668. Accurate to 0.07 XP. The same payload
   * carried RankId 14, confirming the RANKS order (Global Threat is index 13,
   * game ids are 1-based).
   *
   * Resolution is one step of the displayed precision. The bar shows two decimals
   * ("58,42%"), so that's 0.01% of the rank span — 0.2 XP at Global Threat, fine
   * enough to see individual actions. Where it only renders one decimal the value
   * simply moves in larger steps; the floor below is deliberately set at the finer
   * precision so real movement is never discarded.
   *
   * The XHR interceptor is left completely untouched and still wins whenever it
   * produces a fresher value — this only ever corrects upward.
   */
  let _lastBarXp = 0, _barXpLogged = false;

  function deriveXpFromBar() {
    const bar = readBar();
    if (!bar || !bar.rank || !(bar.rankPct > 0)) return null;
    const nm = String(bar.rank).trim().toLowerCase();
    const i = RANKS.findIndex(r => r[0].toLowerCase() === nm);
    if (i < 0 || i >= RANKS.length - 1) return null;   // unknown name, or Legend (no next rank)
    const base = RANKS[i][1], nextBase = RANKS[i + 1][1];
    const span = nextBase - base;
    if (!(span > 0)) return null;
    return {
      xp:   parseFloat((base + (bar.rankPct / 100) * span).toFixed(2)),
      step: span / 10000,                               // one 0.01% increment — the bar's finest step
      rank: RANKS[i][0]
    };
  }

  /* How long the bar stays quiet after an exact reading. The bar is a FALLBACK
   * for when hndlr.ashx stops delivering — that is its entire job. Letting it
   * compete tick-by-tick with a live feed is pure downside: it can only ever be
   * less precise, and its rounding actively corrupted the record (see
   * onExperienceRead). While exact values are arriving, it stands down. */
  const XP_BAR_STANDDOWN_MS = 10 * 60 * 1000;
  let _barStoodDownLogged = false;

  // Feeds the derived value into the EXISTING onExperienceRead() — no change to
  // the interceptor or to how gains are recorded, just a second source for it.
  function syncXpFromBar() {
    if (GM_getValue('cbXpBarOn', true) === false) return;

    const sinceApi = Date.now() - (xpState.lastApiAt || 0);
    if (xpState.lastApiAt && sinceApi < XP_BAR_STANDDOWN_MS) {
      if (!_barStoodDownLogged) {
        _barStoodDownLogged = true;
        dlog(APP_TAG, `[XP] Status-bar source standing down — exact feed is live (${Math.round(sinceApi/1000)}s ago)`);
      }
      return;
    }
    if (_barStoodDownLogged && xpState.lastApiAt) {
      _barStoodDownLogged = false;
      console.log(`${APP_TAG}[XP] No exact reading for ${Math.round(sinceApi/60000)}m — status-bar fallback taking over`);
    }

    const d = deriveXpFromBar();
    if (!d) return;
    if (!_barXpLogged) {
      _barXpLogged = true;
      console.log(`${APP_TAG}[XP] Status-bar source: ${d.rank} → ${d.xp} (±${d.step} resolution)`);
    }
    // Ignore movement smaller than the bar can actually resolve — otherwise
    // rounding noise would fire a "gain" every tick.
    if (_lastBarXp && Math.abs(d.xp - _lastBarXp) < d.step) return;
    _lastBarXp = d.xp;
    // Only ever correct upward: if the interceptor has a fresher (higher) figure,
    // leave it alone rather than dragging the total backwards.
    if (xpState.total > 0 && d.xp <= xpState.total) return;
    onExperienceRead(d.xp, 'bar');
  }

  // Current resolution of the status-bar source, for the charts to report.
  function barXpStep() { const d = deriveXpFromBar(); return d ? d.step : null; }

  /* === ON-DEMAND STAT REFRESH (re-added 2000.226) ===
   * Fires the game's own status poll instead of waiting for its 15s interval,
   * which under bot navigation frequently never elapses at all. Clicking
   * #ctl00_imgRefresh runs onclick="pstats(N)" → $.getJSON('hndlr.ashx?m=pst…'),
   * which installXpInterceptor() then observes. Ported from the reference
   * script's maybeForceStatRefresh, with its unenforced snapshot-age guard
   * actually implemented (see below).
   */
  /* HOW OFTEN TO READ XP (reworked 2000.245).
   *
   * This was 60–180s, and that was the wrong number in the wrong direction. The
   * game's OWN page fires pstats(N) on an inline setInterval every **15
   * seconds** while it sits open — and clicking #ctl00_imgRefresh calls that
   * exact same function, producing an identical hndlr.ashx?m=pst request. The
   * server cannot tell a click from the page's own timer.
   *
   * So polling at 60–180s was not "safer than a normal player" — it was SLOWER
   * than what a normal player's browser does unattended, while costing us every
   * action that fired inside the gap (they bundle into one reading and get
   * credited to whichever went last — see snapshotXP). We were paying accuracy
   * for camouflage we never actually gained.
   *
   * Default is now 20s with ±25% jitter: near the page's own cadence, never a
   * fixed metronome. cfg.xpPollSec exposes it because it is a genuine trade the
   * user should own.
   */
  function xpPollMs() {
    const base = Math.max(10, Math.min(300, Number(cfg.xpPollSec) || 20)) * 1000;
    return base * (0.75 + Math.random() * 0.5);   // ±25%
  }
  // A read fired too soon after an action returns the PRE-action value, which
  // lands as a false "+0" and (with the limiter on) feeds the no-XP streak. The
  // reference script documents this 4s floor but computes _snapAge and never uses
  // it, so the guard it describes doesn't actually run. Enforced properly here.
  const XP_SNAP_MIN_AGE_MS = 4000;

  function forceStatRefresh() {
    try {
      const img = document.getElementById('ctl00_imgRefresh');
      if (!img) return false;
      const link = img.closest('a');
      if (!link) return false;
      // Never click anything that would navigate — that was the 219 bug, where a
      // fallback selector hit the mailbox link and moved Jarvis off the page.
      const href = (link.getAttribute('href') || '').trim();
      if (href && !/^(#|javascript:)/i.test(href)) {
        dlog(APP_TAG, '[XP] Refresh anchor looks navigational — not clicking:', href);
        return false;
      }
      link.click();
      return true;
    } catch (e) { return false; }
  }

  function maybeForceStatRefresh() {
    /* This clicks the game's refresh control, which fires a real XHR to
     * hndlr.ashx — indistinguishable from an open, active browser. Precisely the
     * signal a halt exists to remove. */
    if (isHalted()) return false;
    if (paused || _navigating || st.acting || st.inJail) return false;
    // The refresh control only exists on ordinary game pages.
    const p = window.location.pathname.toLowerCase();
    if (p.includes('/statistics.aspx') || p.includes('/travel.aspx') || p.includes('/mailbox.aspx')) return false;

    const snap = GM_getValue('cbXpSnapshot', null);
    const snapT = (snap && snap.t) ? snap.t : 0;
    const age = snapT ? (Date.now() - snapT) : Infinity;
    const bypassedFor = GM_getValue('cbXpRefreshBypassedFor', 0);
    // An action just fired: bypass the throttle so its gain is read and attributed
    // before the next action overwrites the snapshot — but only ONCE per snapshot,
    // or a lingering one triggers a refresh every single tick.
    const snapFresh = snapT && age >= XP_SNAP_MIN_AGE_MS && age < 60000 && snapT !== bypassedFor;

    const last = GM_getValue('cbLastStatRefresh', 0);
    if (!snapFresh && Date.now() - last < xpPollMs()) return false;

    /* Only count an attempt that actually HAPPENED.
     *
     * These two stamps used to be written before forceStatRefresh() ran, and
     * regardless of what it returned. forceStatRefresh fails whenever
     * #ctl00_imgRefresh isn't on the page — which is common, because Jarvis is
     * navigating constantly and lands on plenty of pages mid-load. A failed
     * attempt therefore burned BOTH the post-action bypass (so that action's gain
     * was never read on its own, and bundled into the next reading) AND the
     * routine throttle (so nothing else was tried for another cycle). The one
     * moment we most need a reading — just after an action — was the one most
     * likely to be silently skipped. */
    const ok = forceStatRefresh();
    if (!ok) { dlog(APP_TAG, '[XP] Stat refresh unavailable on this page — will retry'); return false; }

    if (snapFresh) GM_setValue('cbXpRefreshBypassedFor', snapT);
    GM_setValue('cbLastStatRefresh', Date.now());
    if (snapFresh) console.log(`${APP_TAG}[XP] Stat refresh (${snap.action} +${Math.round(age/1000)}s)`);
    else dlog(APP_TAG, '[XP] Stat refresh (routine)');
    return ok;
  }

  // Rank state captured from the status bar each tick (name + % toward next rank).
  const rankState = {
    name:    GM_getValue('cbRankName', ''),
    pct:     GM_getValue('cbRankPct', 0),     // 0..100 toward next rank
    idx:     -1,                              // resolved rank-step index (best effort)
    confident: false,                         // true when idx is validated against XP
    lastName: GM_getValue('cbRankLastName', '')
  };

  // Resolve which perRankReq index the player is on, plus absolute XP into/to-next.
  // Strategy: if we have a cumulative Experience value, find the step whose cumulative
  // window contains it, then VALIDATE the implied within-rank % against the status-bar
  // %. If they agree (±6%), we're confident (cumulative-XP model). Otherwise we fall
  // back to deriving the step from the status %: the step whose size best matches
  // Experience / (pct/100) — but only mark confident when a cross-check passes.
  function resolveRank() {
    const pct = rankState.pct;
    const xp = xpState.total;
    let idx = -1, withinXp = null, toNext = null, confident = false;

    if (xp > 0) {
      // Cumulative model: locate the step window [cumBefore, cumBefore+req)
      let cumBefore = 0;
      for (let i = 0; i < perRankReq.length; i++) {
        if (xp < cumRankReq[i]) {
          idx = i;
          const into = xp - cumBefore;
          const impliedPct = perRankReq[i] > 0 ? (into / perRankReq[i]) * 100 : 0;
          // Validate against the status-bar percentage
          if (pct > 0 && Math.abs(impliedPct - pct) <= 6) {
            withinXp = parseFloat(into.toFixed(2));
            toNext = parseFloat((perRankReq[i] - into).toFixed(2));
            confident = true;
          }
          break;
        }
        cumBefore = cumRankReq[i];
      }
      if (idx === -1) idx = perRankReq.length - 1; // past the table — max rank
    }

    // If not confident from cumulative XP but we have a % and an idx guess, still
    // derive absolute numbers from the % (less authoritative, shown as approximate).
    if (!confident && idx >= 0 && pct > 0) {
      const req = perRankReq[idx];
      withinXp = parseFloat(((pct / 100) * req).toFixed(1));
      toNext  = parseFloat((req - withinXp).toFixed(1));
    }

    rankState.idx = idx;
    rankState.confident = confident;
    return { idx, withinXp, toNext, confident, pct, name: rankState.name };
  }

  // Fired when the status-bar rank NAME changes — an unambiguous rank-up signal,
  // independent of how Experience is counted. Logs it, alerts (gated), and drops a
  // marker into the XP history so it shows on the charts.
  function onRankUp(fromName, toName) {
    console.log(`${APP_TAG}[RANK] Ranked up: ${fromName} → ${toName}`);
    try {
      xpState.history.unshift({
        t: Date.now(), gained: 0, action: 'rankup', icon: '⭐',
        total: xpState.total, rankUp: true, label: `${fromName} → ${toName}`
      });
      if (xpState.history.length > 40) xpState.history.pop();
      saveXpState();
    } catch(_){}
    tgMsg('rankup', `⭐ <b>RANK UP</b>\n${st.player||'?'} | ${esc(fromName)} → <b>${esc(toName)}</b>`);
    try { discordRankUp(fromName, toName); } catch(e) { console.warn(APP_TAG, '[DC] rankup', e); }
    try { updateXpUI(); } catch(_){}
  }

  const xpNoGainStreak = {};
  XP_ACTIONS.forEach(a => { xpNoGainStreak[a] = GM_getValue('cbXpStreak_'+a, 0); });

  function saveXpState() {
    /* No trimming here. 2000.232 briefly added configurable caps that trimmed on
     * every save, but lowering one silently and permanently discarded stored
     * chart history — a destructive setting sitting next to harmless ones.
     * Removed in 233; the XP_HISTORY_CAP / XP_SAMPLE_CAP constants applied in
     * onExperienceRead are the only caps.
     * The background-poll interval gives the real memory win and costs nothing. */
    GM_setValue('cbXpTotal', xpState.total);
    GM_setValue('cbXpApiTotal', xpState.apiTotal);
    GM_setValue('cbXpLastApiAt', xpState.lastApiAt);
    GM_setValue('cbXpSessionGain', xpState.sessionGain);
    GM_setValue('cbXpSessionBase', xpState.sessionBase);
    GM_setValue('cbXpCleanReads', xpState.cleanReads || 0);
    GM_setValue('cbXpBundledReads', xpState.bundledReads || 0);
    GM_setValue('cbXpJailRates', xpState.jailRates || []);
    GM_setValue('cbXpJailSamples', xpState.jailSamples || 0);
    GM_setValue('cbXpSessionStart', xpState.sessionStart);
    GM_setValue('cbXpPerAction', xpState.perAction);
    GM_setValue('cbXpHistory', xpState.history);
    GM_setValue('cbXpSamples', xpState.samples);
  }

  function resetXpSession() {
    xpState.sessionGain = 0;
    // Re-baseline: session gain is now derived as total − base, so the base has
    // to move with the reset or the counter would resume from the old figure.
    xpState.sessionBase = xpState.total || 0;
    xpState.sessionStart = Date.now();
    XP_ACTIONS.forEach(a => { xpState.perAction[a] = 0; });
    xpState.history = [];
    xpState.samples = xpState.total > 0 ? [{ t: Date.now(), total: xpState.total }] : [];
    saveXpState();
    updateXpUI();
  }

  /* Record which action just fired so the next XP gain can be attributed to it.
   *
   * ALSO appends to a PENDING list, and that list is the honest part. One XP
   * reading covers everything that has happened since the previous one — the feed
   * is polled every 60–180s, while several actions can come due within a few
   * seconds of each other. When that happens the whole accumulated gain is
   * credited to whichever action fired LAST, so a "+0.483 crime" can in truth be
   * one crime plus five booze sales. The number is right; the label is a guess.
   * Recording what the reading actually covers lets the charts say so.
   */
  const LS_XP_PENDING = 'cbXpPending';
  const XP_PENDING_MAX_AGE = 30 * 60 * 1000;   // ignore anything older; it isn't ours

  function xpPendingList() {
    let p = [];
    try { p = JSON.parse(localStorage.getItem(LS_XP_PENDING) || '[]'); } catch(_) {}
    if (!Array.isArray(p)) return [];
    const cut = Date.now() - XP_PENDING_MAX_AGE;
    return p.filter(e => e && e.a && e.t > cut);
  }

  function _xpQueue(action) {
    const p = xpPendingList();
    p.push({ a: action, t: Date.now() });
    while (p.length > 40) p.shift();
    try { localStorage.setItem(LS_XP_PENDING, JSON.stringify(p)); } catch(_) {}
  }

  /* `note` is what shows in the "what this reading covered" mix; `action` is
   * still what the XP gets attributed to. They differ for booze, where a BUY and
   * a SELL both fire but only the sell earns — showing both as plain "booze×2"
   * made a reading look like two earning events when it was one. */
  function snapshotXP(action, note) {
    const snap = { action, t: Date.now() };
    GM_setValue('cbXpSnapshot', snap);
    GM_setValue('cbXpStreakSnap', snap);
    _xpQueue(note || action);
  }

  /* QUIET snapshot — records that the action happened, but does NOT claim the
   * next XP reading and does NOT trigger a forced refresh. For JAIL (2000.246).
   *
   * Jail's interval defaults to THREE SECONDS. Snapshotting it normally did two
   * bad things:
   *   1. It overwrote the snapshot of whatever real action was still waiting for
   *      its XP reading. Fire a crime, have a bust land 3s later, and the crime's
   *      gain was credited to jail. Attribution for crime/GTA/booze has been
   *      quietly leaking into jail for as long as both have been enabled.
   *   2. It asked for a forced XP read every few seconds. (In practice the reads
   *      mostly didn't happen — a new bust replaced the snapshot before it aged
   *      past the 4s floor — so jail was already going unattributed. The requests
   *      were pure cost with no benefit.)
   *
   * So jail no longer competes. Anything left over once the named actions have
   * taken their share is inferred to be jail, which is sound because jail is the
   * only remaining thing Jarvis does that earns XP: garage does not (see
   * doGarage), and crime/GTA/booze/OC/DTM all snapshot properly.
   */
  function snapshotXPQuiet(action) { _xpQueue(action); }

  /* === OC/DTM PAYOUT RECONCILIATION (2000.247) ===
   *
   * Driven by the game's own completion mail (OC_DONE_RE / DTM_DONE_RE). Two
   * directions, because the mail poll (~30s) and the XP poll (~20s) race:
   *
   *   BACKWARDS — the usual case. The payout was already read and filed as
   *     inferred-jail before the mail arrived. Find that entry and move it.
   *   FORWARDS — the mail got here first. Park a marker; the next unclaimed gain
   *     takes it.
   *
   * And the split you asked for: a reading that caught the payout probably caught
   * some jail busts too. jailAvgXp() is LEARNED from readings that contained
   * nothing but busts, so we can subtract `busts × average` and hand the rest to
   * the OC. No invented constants — if we've never seen a clean jail-only
   * reading, no split is attempted and the whole gain moves.
   */
  const PAYOUT_LOOKBACK_MS = 15 * 60 * 1000;   // how far back a notification may reach
  const PAYOUT_FORWARD_MS  = 5 * 60 * 1000;    // how long a mail-first marker waits
  const JAIL_RATE_KEEP     = 25;               // recent samples kept

  /* MEDIAN, not mean. A reading credited to jail can still be carrying an OC/DTM
   * payout — those queue nothing, which is the entire reason the notification
   * signal exists — so the sample set will occasionally contain a wild value.
   * A mean is dragged by one; a median shrugs it off and self-heals as clean
   * samples arrive. */
  function jailAvgXp() {
    const r = Array.isArray(xpState.jailRates) ? xpState.jailRates : [];
    if (!r.length) return 0;
    const s = [...r].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* Feed the per-bust rate, ONLY from a reading that covered jail alone.
   * Returns the value recorded (0 if none), so the caller can note it on the
   * entry — a later completion notification uses that to UNLEARN the sample if
   * the reading turns out to have been a payout after all. */
  function learnJailRate(gained, covered) {
    if (!covered.length || !covered.every(e => e.a === 'jail')) return 0;
    const per = gained / covered.length;
    if (!(per > 0)) return 0;
    if (!Array.isArray(xpState.jailRates)) xpState.jailRates = [];
    const med = jailAvgXp();
    if (med > 0 && xpState.jailRates.length >= 3 && per > med * 5) {
      dlog(APP_TAG, `[XP] Ignoring ${per.toFixed(4)}/bust — ${Math.round(per/med)}× the median, almost certainly a payout`);
      return 0;
    }
    xpState.jailRates.push(per);
    while (xpState.jailRates.length > JAIL_RATE_KEEP) xpState.jailRates.shift();
    xpState.jailSamples = xpState.jailRates.length;
    dlog(APP_TAG, `[XP] Jail rate: ${jailAvgXp().toFixed(4)}/bust over ${xpState.jailSamples} samples`);
    return per;
  }

  // Move a recorded gain to the OC/DTM that actually earned it. Returns true if
  // the entry was changed.
  function applyPayout(kind, entry) {
    if (!entry || entry.pay) return false;             // already reconciled
    const jn = entry.jn || 0, avg = jailAvgXp();
    const jailPart = (jn > 0 && avg > 0)
      ? Math.min(entry.gained, parseFloat((jn * avg).toFixed(4)))
      : 0;
    const payPart = parseFloat((entry.gained - jailPart).toFixed(4));
    if (!(payPart > 0)) return false;                  // all of it was jail — leave it

    const from = entry.action;
    if (from && typeof xpState.perAction[from] === 'number')
      xpState.perAction[from] = parseFloat(Math.max(0, xpState.perAction[from] - payPart).toFixed(4));
    xpState.perAction[kind] = parseFloat(((xpState.perAction[kind] || 0) + payPart).toFixed(4));

    entry.action = kind;
    entry.icon   = ACTION_ICON[kind] || '⚡';
    entry.gained = payPart;
    entry.pay    = true;                               // confirmed by the game itself
    delete entry.inf;                                  // no longer a guess
    if (jailPart > 0) entry.split = jailPart;

    /* UNLEARN. If this reading had already taught the per-bust rate, that lesson
     * was wrong — the XP was mostly a payout. Pull the sample back out rather
     * than leaving the median to outvote it. */
    if (entry.lr && Array.isArray(xpState.jailRates)) {
      const i = xpState.jailRates.findIndex(v => Math.abs(v - entry.lr) < 1e-9);
      if (i >= 0) {
        xpState.jailRates.splice(i, 1);
        xpState.jailSamples = xpState.jailRates.length;
        dlog(APP_TAG, `[XP] Unlearned ${entry.lr.toFixed(4)}/bust — that reading was a ${kind} payout`);
      }
      delete entry.lr;
    }

    console.log(`${APP_TAG}[XP] ${kind.toUpperCase()} payout confirmed by notification: +${payPart}` +
                (jailPart > 0 ? ` (${jailPart} split back to ${jn} jail bust${jn===1?'':'s'})` : '') +
                (from !== kind ? ` — was recorded as ${from}` : ''));
    return true;
  }

  /* Called when a completion mail is seen. Looks back for the reading that
   * carried the payout; if there isn't one yet, parks a forward marker. */
  function notePayout(kind) {
    const cut = Date.now() - PAYOUT_LOOKBACK_MS;
    /* Pick the BIGGEST qualifying reading in the window, not the newest.
     *
     * `find` took the newest, which is wrong whenever a jail-only reading has
     * landed since the payout — and with jail at a 3s interval that is the normal
     * case, not the edge case. A payout dwarfs a bust (that size gap is the whole
     * reason the split arithmetic exists), so the largest unclaimed gain is far
     * more likely to be the one carrying it. Ties keep the newer entry. */
    let hit = null;
    for (const h of xpState.history) {
      if (h.rankUp || h.pay || h.t < cut) continue;
      if (!(h.inf || h.action === 'other' || h.action === 'jail')) continue;
      if (!hit || h.gained > hit.gained) hit = h;   // history is newest-first, so > keeps the newer on a tie
    }
    if (hit && applyPayout(kind, hit)) {
      saveXpState();
      try { updateXpUI(); } catch(_){}
      return;
    }
    queuePayoutPending(kind);
    console.log(`${APP_TAG}[XP] ${kind.toUpperCase()} completion noted — waiting for the reading that carries it`);
  }

  /* Pending payout markers are a QUEUE, not one slot.
   *
   * A single `cbXpPayoutPending` meant an OC and a DTM finishing inside one mail
   * poll overwrote each other and only one was ever reconciled — and both of
   * those readings are exactly the ones that would otherwise be mislabelled jail.
   * Each marker is consumed by one reading and expires on age. */
  function payoutPendingList() {
    const q = GM_getValue('cbXpPayoutPending', null);
    if (!q) return [];
    // Migrate the old single-object form rather than dropping a live marker.
    const arr = Array.isArray(q) ? q : [q];
    const cut = Date.now() - PAYOUT_FORWARD_MS;
    return arr.filter(p => p && p.kind && p.t > cut);
  }

  /* `at` preserves the ORIGINAL time when a marker is put back after a failed
   * match. Stamping it afresh would make an unmatchable marker immortal —
   * re-queued, re-tried, re-stamped, for ever. It has to keep ageing out. */
  function queuePayoutPending(kind, at) {
    const q = payoutPendingList();
    q.push({ kind, t: at || Date.now() });
    while (q.length > 6) q.shift();
    GM_setValue('cbXpPayoutPending', q);
  }

  // Take the oldest still-valid marker, if any, and remove it from the queue.
  function takePayoutPending() {
    const q = payoutPendingList();
    if (!q.length) { GM_setValue('cbXpPayoutPending', []); return null; }
    const p = q.shift();
    GM_setValue('cbXpPayoutPending', q);
    return p;
  }

  // "crime, booze×5" — what a bundled reading actually covered.
  function xpMixSummary(list) {
    const counts = {};
    list.forEach(e => { counts[e.a] = (counts[e.a] || 0) + 1; });
    return Object.entries(counts)
      .sort((x, y) => y[1] - x[1])
      .map(([a, n]) => n > 1 ? `${a}×${n}` : a)
      .join(', ');
  }

  /* Called with a fresh Experience value. `src` is 'api' for an exact figure from
   * the game's own XHR, or 'bar' for one derived from the status-bar percentage.
   *
   * THE SOURCE MATTERS AND IS NOW RECORDED. The bar renders two decimals of a
   * percentage, so its resolution is one ten-thousandth of the rank span — 0.3 XP
   * at Global Dominator, 0.2 at Global Threat. A booze sell worth 0.08 XP is
   * therefore invisible to it until three or four of them have accumulated, at
   * which point the whole lot surfaces as one +0.3 attributed to whichever action
   * happened to fire last. That is exactly the "+0.3 booze" in a list of 0.06s:
   * not a booze gain at all, but several actions' worth of XP rounded into one
   * entry. Marking the source lets the charts say so instead of implying a
   * precision that isn't there. */
  function onExperienceRead(rawXp, src) {
    const xp = parseFloat(rawXp);
    if (!Number.isFinite(xp) || xp <= 0) return;
    const source = src === 'bar' ? 'bar' : 'api';

    /* Measure the gain against the last reading FROM THE SAME KIND OF SOURCE.
     *
     * This is the fix for "it misses every other booze". The bar's value is the
     * true XP rounded to its own step, so it can sit ABOVE the truth by up to
     * half a step. When that happened, `total` was left inflated, and the next
     * exact reading came in BELOW it — the old code saw xp < prev, quietly reset
     * the total and recorded no gain at all. A real 0.08 sale vanished, then the
     * one after it was measured correctly, giving exactly the every-other-one
     * pattern. Comparing an exact reading against the last exact reading makes a
     * bar overshoot unable to eat anything. */
    if (source === 'api') { xpState.lastApiAt = Date.now(); }
    const prev = source === 'api' ? (xpState.apiTotal || 0) : xpState.total;

    if (prev === 0) {                       // first reading of this kind — baseline only
      xpState.total = Math.max(xpState.total, xp);
      if (source === 'api') xpState.apiTotal = xp;
      if (!xpState.sessionBase) xpState.sessionBase = xp;
      /* A baseline attributes nothing, so anything queued before it belongs to a
       * gain we will never see. Leaving it would make the FIRST real reading look
       * bundled when it covered one action. */
      localStorage.removeItem(LS_XP_PENDING);
      xpState.samples.push({ t: Date.now(), total: xpState.total });
      if (xpState.samples.length > XP_SAMPLE_CAP) xpState.samples.shift();
      saveXpState();
      updateXpUI();
      return;
    }
    if (xp === prev) { maybeFeedNoXpLimiter(false); return; }
    if (xp < prev) {
      // A genuine decrease (rank reset, or our own overshoot being corrected).
      xpState.total = xp;
      if (source === 'api') xpState.apiTotal = xp;
      saveXpState();
      return;
    }

    const gained = parseFloat((xp - prev).toFixed(4));
    xpState.total = xp;
    if (source === 'api') xpState.apiTotal = xp;

    /* Session gain is DERIVED from the baseline, not accumulated. Accumulating
     * deltas meant every provisional bar reading was permanently banked, so a
     * later exact correction could not undo it and the session total drifted
     * upward all evening. Derived, it is self-correcting by construction. */
    if (!xpState.sessionBase) xpState.sessionBase = Math.max(0, xp - gained);
    xpState.sessionGain = parseFloat(Math.max(0, xpState.total - xpState.sessionBase).toFixed(4));

    /* What this reading actually covered. Everything queued since the last
     * attribution shares this one gain; the label is merely the last CLAIMING
     * action of them. The per-action total still goes to that one — with nothing
     * to split on, any division would be invented, and clean single-action
     * readings dominate the sample often enough for the bars to stay meaningful.
     * The counts below let the charts report how much of the record is a guess. */
    const covered = xpPendingList();
    localStorage.removeItem(LS_XP_PENDING);
    const bundled = covered.length > 1;

    const snap = GM_getValue('cbXpSnapshot', null);
    let action = 'other', inferred = false;
    if (snap && snap.action && (Date.now() - snap.t) < 90000) {
      action = snap.action;
      GM_setValue('cbXpSnapshot', null);
    } else if (covered.some(e => e.a === 'jail')) {
      /* Nothing claimed this reading, but a jail bust is in the window. Jail is
       * deliberately quiet (see snapshotXPQuiet) and is the only remaining
       * XP-earning thing Jarvis does that doesn't claim a reading, so unclaimed
       * XP alongside a bust is jail's. Flagged as inferred rather than measured.
       *
       * KNOWN LIMIT: an OC or DTM payout arrives when the crime EXECUTES, which
       * can be hours after its snapshot expired. If jail is running, such a
       * payout lands here and is labelled jail. Those gains are far larger than a
       * bust, so they stand out in the history — if that starts happening, the
       * fix is a size guard, and it needs a real observed OC payout to set it. */
      action = 'jail';
      inferred = true;
    }
    if (bundled) xpState.bundledReads = (xpState.bundledReads || 0) + 1;
    else         xpState.cleanReads   = (xpState.cleanReads   || 0) + 1;

    if (typeof xpState.perAction[action] !== 'number') xpState.perAction[action] = 0;
    xpState.perAction[action] = parseFloat((xpState.perAction[action] + gained).toFixed(4));

    const entry = { t: Date.now(), gained, action, icon: ACTION_ICON[action] || '⚡', total: xp, src: source };
    if (bundled) { entry.n = covered.length; entry.mix = xpMixSummary(covered); }
    if (inferred) entry.inf = true;
    // Busts caught in this reading, kept so a later OC/DTM notification can
    // subtract their share at the learned rate rather than guessing.
    const jn = covered.filter(e => e.a === 'jail').length;
    if (jn) entry.jn = jn;
    xpState.history.unshift(entry);
    if (xpState.history.length > XP_HISTORY_CAP) xpState.history.pop();

    /* Reconcile BEFORE learning. The completion mail can arrive first, and if it
     * has, this reading is a payout rather than a measurement of jail. Learning
     * from it first was self-defeating: the bogus rate then made the split
     * consume the entire gain, payPart came out at zero, and applyPayout refused
     * the reassignment it had itself just made impossible. */
    if (entry.inf || action === 'other' || action === 'jail') {
      const pend = takePayoutPending();
      // Put it back if this reading turned out not to be reassignable, so the
      // marker still gets its chance at the next unclaimed reading.
      if (pend && !applyPayout(pend.kind, entry)) queuePayoutPending(pend.kind, pend.t);
    }

    // A jail-only reading is the one thing that measures a bust cleanly — but
    // only if it wasn't just claimed as a payout above.
    if (entry.action === 'jail' && !entry.pay) {
      const lr = learnJailRate(entry.gained, covered);
      if (lr) entry.lr = lr;
    }

    xpState.samples.push({ t: Date.now(), total: xp });
    if (xpState.samples.length > XP_SAMPLE_CAP) xpState.samples.shift();

    saveXpState();
    maybeFeedNoXpLimiter(true);
    updateXpUI();

    const mins = (Date.now() - xpState.sessionStart) / 60000;
    const rate = mins >= 2 ? ((xpState.sessionGain / mins) * 60).toFixed(1) : '…';
    /* The RAW pair, at full precision. "+0.08 covering 7 actions" is impossible
     * to reason about without knowing what the two underlying readings were —
     * whether the feed moves in fixed steps, or genuinely only one of those
     * seven actions earned anything. Measure it, do not infer it. */
    console.log(`${APP_TAG}[XP] +${gained}${source==='bar'?'≈':''} [${ACTION_ICON[action]||''}${action}] | raw ${prev} → ${xp} | covered ${covered.length}${covered.length ? ' (' + xpMixSummary(covered) + ')' : ''} | session +${xpState.sessionGain} | ${rate}/hr`);
  }

  function maybeFeedNoXpLimiter(gained) {
    if (!cfg.noXpLimiterOn) return;
    const snap = GM_getValue('cbXpStreakSnap', null);
    const action = (snap && snap.action && (Date.now() - snap.t) < 90000) ? snap.action : null;
    if (!action || !XP_ACTIONS.includes(action)) return;

    if (gained) {
      xpNoGainStreak[action] = 0;
      GM_setValue('cbXpStreak_'+action, 0);
      GM_setValue('cbXpLastGain_'+action, Date.now());
      return;
    }
    xpNoGainStreak[action] = (xpNoGainStreak[action] || 0) + 1;
    GM_setValue('cbXpStreak_'+action, xpNoGainStreak[action]);
    console.log(`${APP_TAG}[XP] ${action} no-XP streak: ${xpNoGainStreak[action]}/${cfg.noXpStreakLimit}`);
    if (xpNoGainStreak[action] >= cfg.noXpStreakLimit) {
      disableActionForDay(action, `no XP ×${cfg.noXpStreakLimit}`);
      xpNoGainStreak[action] = 0;
      GM_setValue('cbXpStreak_'+action, 0);
      return;
    }

    /* Second trigger: XP flat for a stretch of wall-clock time despite the action
     * still firing. The streak count alone misses the slow case — in Away cadence
     * an action can fire only a handful of times an hour, so five attempts can
     * span most of an evening before the streak trips. Off by default (0) because
     * it needs a baseline gain first; without one there is nothing to measure from
     * and it would fire on a fresh install. */
    const staleMin = Math.max(0, Number(cfg.noXpStaleMin) || 0);
    if (staleMin > 0) {
      const lastGain = GM_getValue('cbXpLastGain_'+action, 0);
      if (lastGain > 0) {
        const mins = Math.floor((Date.now() - lastGain) / 60000);
        if (mins >= staleMin) {
          disableActionForDay(action, `no XP for ${mins}m`);
          xpNoGainStreak[action] = 0;
          GM_setValue('cbXpStreak_'+action, 0);
        }
      }
    }
  }

  function disableActionForDay(action, reason) {
    GM_setValue('cbXpCapDay_'+action, gameDayStr());
    GM_setValue('cbXpCapWasOn_'+action, !!st[action]);
    if (action in st) { st[action] = false; saveSt(); repaintRibbon(); }
    const why = reason || `no XP ×${cfg.noXpStreakLimit}`;
    console.log(`${APP_TAG}[XP] ${action} hit no-XP cap (${why}) — disabled until next game-day`);
    tgMsg('jail', `🛑 <b>${(ACTION_ICON[action]||'')+action.toUpperCase()} capped</b>\n${st.player||'?'} | ${why}, off till tomorrow`);
  }

  function checkXpCapResets() {
    if (!cfg.noXpLimiterOn) return;
    const today = gameDayStr();
    XP_ACTIONS.forEach(action => {
      const capDay = GM_getValue('cbXpCapDay_'+action, '');
      if (capDay && capDay !== today) {
        GM_setValue('cbXpCapDay_'+action, '');
        GM_setValue('cbXpLastGain_'+action, 0);   // re-baseline the stale-XP clock
        const wasOn = GM_getValue('cbXpCapWasOn_'+action, true);
        if (action in st && wasOn) { st[action] = true; saveSt(); repaintRibbon(); }
        console.log(`${APP_TAG}[XP] ${action} no-XP cap reset — re-enabled (new game-day)`);
      }
    });
  }

  /* === HOURLY XP REPORT → TELEGRAM (with rank-up ETA) ===
   * Ported from the moderator reference script's initHourlyXPReport. Sends a
   * digest every hour: XP gained in the last period + rate, session total + rate,
   * cumulative total with rank and % to next, and a projected time-to-next-rank
   * at the current pace.
   *
   * Deliberately persisted + polled from the main loop rather than run off a long
   * setTimeout: Jarvis navigates every few seconds, so any timer longer than a
   * page lifetime would never survive to fire. The due-time lives in GM storage
   * and each tick self-gates on it, which is what makes it reload-proof.
   * Master tab only, so multiple tabs don't each send their own copy.
   */
  const XP_REPORT_INTERVAL_MS = 60 * 60 * 1000;

  function xpFmtEta(h) {
    if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
    if (h < 48) return `${Math.round(h)}h`;
    return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
  }

  // Reset the report clock and re-baseline the period delta (used by the manual
  // "Send now" button so the next scheduled report measures from that point).
  function resetXpReportClock(fireInMs) {
    const now = Date.now();
    GM_setValue('cbXpReportNext', now + (fireInMs != null ? fireInMs : XP_REPORT_INTERVAL_MS));
    GM_setValue('cbXpReportLastTotal', xpState.total || 0);
    GM_setValue('cbXpReportLastAt', now);
  }

  function sendXpReport() {
    const now = Date.now();
    const curTotal = xpState.total || 0;
    const prevTotal = GM_getValue('cbXpReportLastTotal', 0) || 0;
    const prevAt = GM_getValue('cbXpReportLastAt', 0) || 0;

    // Period delta — only meaningful once a baseline exists and XP hasn't gone backwards.
    const periodGain = (prevTotal > 0 && curTotal >= prevTotal) ? parseFloat((curTotal - prevTotal).toFixed(2)) : null;
    const periodHrs = prevAt > 0 ? (now - prevAt) / 3600000 : 0;
    const periodRate = (periodGain != null && periodHrs > 0.1) ? (periodGain / periodHrs).toFixed(2) : '—';

    const sessionXP = xpState.sessionGain || 0;
    const sMins = xpState.sessionStart > 0 ? (now - xpState.sessionStart) / 60000 : 0;
    const sessionRate = sMins > 0.5 ? ((sessionXP / sMins) * 60).toFixed(2) : '—';

    // Rank + projected time to the next one, using the real threshold table.
    let rankStr = '', etaLine = '';
    try {
      const rp = xpRankProgress(curTotal);
      if (rp) {
        rankStr = rp.next ? ` (${rp.pct.toFixed(1)}% → ${esc(rp.next)})` : ` (${esc(rp.rank)} — max)`;
        if (rp.next && rp.toNext > 0) {
          // Prefer the last period's real rate; fall back to the session rate.
          let rate = parseFloat(periodRate);
          if (!Number.isFinite(rate) || rate <= 0) rate = parseFloat(sessionRate);
          if (Number.isFinite(rate) && rate > 0) {
            etaLine = `\n⏳ ${esc(rp.next)} in ~${xpFmtEta(rp.toNext / rate)} at current pace (${rp.toNext.toFixed(2)} XP to go)`;
          } else {
            etaLine = `\n⏳ ${rp.toNext.toFixed(2)} XP to ${esc(rp.next)} (no pace yet)`;
          }
        }
      }
    } catch(_){}

    const lastLine = periodGain != null ? `Last hour: +${periodGain} (${periodRate}/hr)` : 'Last hour: baseline set';
    tgMsg('xpReport',
      `📊 <b>Hourly XP — ${esc(st.player||'?')}</b>\n⭐ ${lastLine}\n` +
      `🕐 Session: +${sessionXP.toFixed(2)} (${sessionRate}/hr)\n` +
      `🏆 Total: ${curTotal.toFixed(2)}${rankStr}${etaLine}`);

    GM_setValue('cbXpReportLastTotal', curTotal);
    GM_setValue('cbXpReportLastAt', now);
    console.log(`${APP_TAG}[XP] Hourly report sent (${periodGain != null ? '+'+periodGain : 'baseline'})`);
  }

  // Called each main-loop tick; self-gates on the persisted due time.
  function maybeSendXpReport() {
    if (!tabs.isMaster || paused) return;
    if (GM_getValue('cbXpReportOn', true) === false) return;
    const due = GM_getValue('cbXpReportNext', 0);
    if (!due) {                                   // first run — set the baseline, don't send
      GM_setValue('cbXpReportNext', Date.now() + XP_REPORT_INTERVAL_MS);
      GM_setValue('cbXpReportLastTotal', xpState.total || 0);
      GM_setValue('cbXpReportLastAt', Date.now());
      return;
    }
    if (Date.now() < due) return;
    GM_setValue('cbXpReportNext', Date.now() + XP_REPORT_INTERVAL_MS);
    try { sendXpReport(); } catch(e) { console.warn(APP_TAG, 'XP report err', e); }
  }

  /* === XP API INTERCEPTOR ===
   * The game refreshes the status bar via XHR to hndlr.ashx?m=pst&t=…, whose JSON
   * carries the current Experience. We hook XMLHttpRequest to read it passively —
   * no extra requests, just observing the game's own traffic.
   */
  let _xpInterceptorInstalled = false;
  function installXpInterceptor() {
    if (_xpInterceptorInstalled) return;
    _xpInterceptorInstalled = true;
    const TARGET = 'hndlr.ashx?m=pst';
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._jbXp = (typeof url === 'string') && url.includes(TARGET);
      return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      if (this._jbXp) {
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 4 && this.status === 200) {
            try {
              const raw = (this.responseText || '').trim();
              if (!raw.startsWith('[') && !raw.startsWith('{')) return;
              const data = JSON.parse(raw);
              const d = Array.isArray(data) ? data[0] : data;
              if (!d) return;
              const xp = d.Experience ?? d.experience ?? d.XP ?? d.xp;
              if (xp !== undefined && xp !== null) onExperienceRead(xp, 'api');
            } catch (e) { /* non-JSON / partial — ignore */ }
          }
        });
      }
      return origSend.apply(this, args);
    };
    console.log(`${APP_TAG}[XP] API interceptor installed`);
  }

  /* === ANTI-THROTTLE KEEP-ALIVE ===
   * Browsers clamp background timers hard: after ~5 minutes hidden, Chrome
   * throttles setTimeout/setInterval to roughly once per minute. That starves
   * the main loop and (previously) tricked the watchdog into spurious reloads.
   * Four defences here:
   *   1. Single cancellable loop timer with a wall-clock deadline, so a
   *      throttled or suspended gap self-corrects instead of compounding.
   *   2. A silent WebAudio tone — marks the tab "audible", which exempts it
   *      from intensive throttling entirely. This is the big one.
   *   3. Screen Wake Lock — stops the display sleeping while visible.
   *   4. A Web Worker ticker — worker timers survive throttling far better,
   *      and it stamps the master-tab heartbeat so mastership isn't lost.
   * NOTE: none of this can survive the OS sleeping/hibernating the machine.
   */

  const ka = {
    audio:    GM_getValue('cbKaAudio', true),
    wakeLock: GM_getValue('cbKaWake', true),
    worker:   GM_getValue('cbKaWorker', true)
  };

  function saveKa() {
    GM_setValue('cbKaAudio', ka.audio);
    GM_setValue('cbKaWake', ka.wakeLock);
    GM_setValue('cbKaWorker', ka.worker);
  }

  /* --- loop scheduling (single timer + wall-clock deadline) --- */

  let _loopTimer = null, _loopDueAt = 0, _loopRunning = false;

  function schedLoop(ms) {
    if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
    const delay = Math.max(0, Number(ms) || 0);
    _loopDueAt = Date.now() + delay;
    _loopTimer = setTimeout(runLoop, delay);
  }

  function runLoop() {
    if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
    _loopDueAt = 0;
    if (_loopRunning) return;              // never overlap loop bodies
    _loopRunning = true;
    Promise.resolve()
      .then(() => mainLoop())
      .catch(e => { console.error('[JB][LOOP] error:', e); schedLoop(3000); })
      .finally(() => { _loopRunning = false; });
  }

  // Run the loop immediately if its wall-clock deadline has already passed
  // (i.e. the timer was throttled or the machine was suspended), or if no tick
  // is scheduled at all. Cheap and safe to call often.
  function kickLoop(reason) {
    if (_loopRunning) return;
    if (!_loopDueAt || Date.now() >= _loopDueAt) {
      if (reason) console.log('[JB][KEEPALIVE] catch-up tick:', reason);
      runLoop();
    }
  }

  /* --- silent audio (defeats intensive throttling) --- */

  let _kaCtx = null, _kaOsc = null;

  function startKaAudio() {
    if (!ka.audio || _kaCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;   // inaudible, but non-zero so the tab counts as playing
      osc.frequency.value = 20;   // sub-audible
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      _kaCtx = ctx; _kaOsc = osc;
      // Autoplay policy may suspend until a gesture — resume on first interaction.
      if (ctx.state === 'suspended') {
        const resume = () => { ctx.resume().catch(()=>{}); };
        document.addEventListener('click', resume, { once:true });
        document.addEventListener('keydown', resume, { once:true });
      }
      console.log('[JB][KEEPALIVE] Silent audio started');
    } catch (e) { console.warn('[JB][KEEPALIVE] Audio failed:', e.message); _kaCtx = null; }
  }

  function stopKaAudio() {
    try { if (_kaOsc) _kaOsc.stop(); } catch(_) {}
    try { if (_kaCtx) _kaCtx.close(); } catch(_) {}
    _kaOsc = null; _kaCtx = null;
  }

  /* --- screen wake lock --- */

  let _wakeLock = null;

  async function requestWakeLock() {
    if (!ka.wakeLock || _wakeLock) return;
    try {
      if (!('wakeLock' in navigator)) return;
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
      console.log('[JB][KEEPALIVE] Wake lock acquired');
    } catch (e) { _wakeLock = null; }
  }

  function releaseWakeLock() {
    try { if (_wakeLock) _wakeLock.release(); } catch(_) {}
    _wakeLock = null;
  }

  /* --- worker ticker --- */

  let _kaWorker = null;

  function startKaWorker() {
    if (!ka.worker || _kaWorker) return;
    try {
      const src = 'let n=0; setInterval(function(){ n++; postMessage(n); }, 1000);';
      const blob = new Blob([src], { type:'application/javascript' });
      const url = URL.createObjectURL(blob);
      _kaWorker = new Worker(url);
      URL.revokeObjectURL(url);
      _kaWorker.onmessage = () => {
        try { tabs.beat(); } catch(_) {}
        kickLoop(null);
      };
      console.log('[JB][KEEPALIVE] Worker ticker started');
    } catch (e) {
      // Blocked by CSP on some setups — the audio trick alone still helps.
      console.warn('[JB][KEEPALIVE] Worker failed:', e.message);
      _kaWorker = null;
    }
  }

  function stopKaWorker() {
    try { if (_kaWorker) _kaWorker.terminate(); } catch(_) {}
    _kaWorker = null;
  }

  /* --- visibility handling --- */

  function initKeepAliveExtras() {
    startKaAudio();
    startKaWorker();
    requestWakeLock();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      // Back in view: re-acquire what the browser took away, then catch up.
      requestWakeLock();
      if (_kaCtx && _kaCtx.state === 'suspended') _kaCtx.resume().catch(()=>{});
      try { tabs.beat(); } catch(_) {}
      kickLoop('tab visible');
    });

    // Some browsers fire these instead of / as well as visibilitychange.
    window.addEventListener('focus', () => kickLoop(null));
    window.addEventListener('online', () => kickLoop('network back'));
  }

  /* === WATCHDOG — self-healing main loop === */

  const WATCHDOG_TIMEOUT = 60000; // restart only if loop hasn't ticked in 60s (well beyond any normal interval)

  // When the tab is hidden the browser legitimately clamps timers to ~1/min, so
  // a 60s threshold would fire constantly and reload the page in a loop. Give
  // hidden tabs a far longer leash — the worker ticker keeps things moving.
  function watchdogTimeout() { return document.hidden ? 6 * 60 * 1000 : WATCHDOG_TIMEOUT; }
  let _lastLoopTick = Date.now();
  let _watchdogIv = null;
  let _watchdogRestarts = 0;

  function startWatchdog() {
    if (_watchdogIv) clearInterval(_watchdogIv);
    _watchdogIv = setInterval(() => {
      const elapsed = Date.now() - _lastLoopTick;
      // Don't fire during deliberate waits: breaks, sleep, pause, or an active post-action lock
      const lockUntil = parseInt(localStorage.getItem('cbActionLockUntil')||'0',10);
      const inLock = lockUntil > Date.now();
      const inBreak = breaks.isSleeping ||
        (breaks.coffeeEndAt > 0 && Date.now() < breaks.coffeeEndAt) ||
        (breaks.lunchEndAt > 0 && Date.now() < breaks.lunchEndAt);
      // A halt is a deliberate stop, not a stall — never "heal" it by restarting
      // the loop or, worse, reloading the page.
      if (isHalted() || paused || inLock || inBreak) { _watchdogRestarts = 0; return; }

      // Only restart if genuinely stalled well beyond any normal loop interval
      if (elapsed > watchdogTimeout()) {
        _watchdogRestarts++;
        console.warn(`[JB][WATCHDOG] Loop stalled ${Math.round(elapsed/1000)}s — restart #${_watchdogRestarts}`);
        if (_watchdogRestarts <= 3) {
          st.acting = false; st.action = ''; GM_setValue('cbActStart', 0); saveSt();
          _lastLoopTick = Date.now(); // mark so we don't immediately re-fire
          schedLoop(500);
        } else if (document.hidden) {
          // Never reload a hidden tab — a throttled tab isn't a broken one, and
          // reloading in the background is how overnight runs got lost.
          console.warn('[JB][WATCHDOG] Hidden tab — kicking loop instead of reloading');
          _watchdogRestarts = 0;
          _lastLoopTick = Date.now();
          schedLoop(1000);
        } else {
          console.error('[JB][WATCHDOG] Too many restarts, reloading');
          tgMsg('watchdog', `⚠️ <b>Watchdog</b>\n${st.player||'?'} | reloading`);
          _watchdogRestarts = 0;
          setTimeout(() => window.location.reload(), 2000);
        }
      } else {
        _watchdogRestarts = 0;
      }
    }, 15000); // check every 15s
  }

  /* === KEEP-ALIVE PING — prevent session timeout === */

  const KEEPALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutes
  let _keepAliveIv = null;

  function stopKeepAlive() {
    if (_keepAliveIv) { clearInterval(_keepAliveIv); _keepAliveIv = null; }
  }

  function startKeepAlive() {
    if (_keepAliveIv) clearInterval(_keepAliveIv);
    if (isHalted()) return;   // stopped means stopped: let the session lapse
    _keepAliveIv = setInterval(() => {
      if (isHalted()) return;
      if (paused || breaks.isSleeping) return;
      if (!tabs.isMaster) return;
      fetch(`${window.location.origin}/authenticated/players.aspx?_=${Date.now()}`, {
        method: 'HEAD',
        credentials: 'include',
        cache: 'no-store'
      }).then(r => {
        if (r.ok) {
          console.log('[JB][KEEPALIVE] Ping OK');
        } else if (r.status === 302 || r.redirected) {
          console.warn('[JB][KEEPALIVE] Session may have expired (redirect)');
        }
      }).catch(e => {
        console.warn('[JB][KEEPALIVE] Ping failed:', e.message);
      });
    }, KEEPALIVE_INTERVAL);
    console.log('[JB][KEEPALIVE] Started (every 5 min)');
  }

  /* === SERVER TIME OFFSET === */

  let _serverOffset = GM_getValue('cbServerOffset', 0); // ms difference: serverTime - localTime

  // Convert an Amsterdam wall-clock date/time into a real epoch ms timestamp,
  // correctly handling CET (+01:00) vs CEST (+02:00) across the DST boundary.
  // Tries +02:00 first and verifies the result reads back as the same Amsterdam
  // hour; if not (winter), uses +01:00. Mirrors the moderator script's approach.
  function amsterdamWallclockToTs(yyyy, mm, dd, HH, MM, SS) {
    const pad = n => String(n).padStart(2, '0');
    const iso = `${yyyy}-${pad(mm)}-${pad(dd)}T${pad(HH)}:${pad(MM)}:${pad(SS||0)}`;
    const tryCEST = new Date(iso + '+02:00');
    try {
      const amsHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false
      }).format(tryCEST), 10);
      // Intl may format midnight as 24 — normalise to 0 for comparison
      const normHour = amsHour === 24 ? 0 : amsHour;
      return (normHour === (HH % 24)) ? tryCEST.getTime() : new Date(iso + '+01:00').getTime();
    } catch (e) {
      // Intl/timezone unavailable — fall back to CET
      return new Date(iso + '+01:00').getTime();
    }
  }

  function getServerTime() {
    return new Date(Date.now() + _serverOffset);
  }

  function calibrateServerTime() {
    // Read the update time element from the status bar
    try {
      const el = document.getElementById('ctl00_userInfo_lblUpdateTime');
      if (!el) return;
      const txt = (el.textContent || '').trim();
      if (!txt) return;

      // TMN format: "DD-MM-YYYY HH:MM:SS" or "DD.MM.YYYY HH:MM:SS"
      // Also handles time-only "HH:MM:SS" when the element shows just the time
      let dd, mm, yyyy, HH, MM, SS;
      const m = txt.match(/(\d{1,2})[-.\/ ](\d{1,2})[-.\/ ](\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
      if (m) {
        [, dd, mm, yyyy, HH, MM, SS] = m;
      } else {
        const mTime = txt.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
        if (!mTime) { console.log('[JB][TIME] Could not parse server time from:', txt); return; }
        [, HH, MM, SS] = mTime;
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        dd   = parts.find(p => p.type === 'day').value;
        mm   = parts.find(p => p.type === 'month').value;
        yyyy = parts.find(p => p.type === 'year').value;
      }
      // TMN runs on Amsterdam time (Europe/Amsterdam = CET in winter / CEST in summer).
      // Build the timestamp as Amsterdam-local: try +02:00 (CEST), verify it round-trips
      // to the same Amsterdam wall-clock hour, else fall back to +01:00 (CET). This is the
      // robust DST-boundary handling borrowed from the moderator script's calculateHoursSince.
      const serverTs = amsterdamWallclockToTs(+yyyy, +mm, +dd, +HH, +MM, +(SS||0));
      const localTs = Date.now();
      const offset = serverTs - localTs;

      // Only update if offset changed significantly (> 5 seconds)
      if (Math.abs(offset - _serverOffset) > 5000) {
        _serverOffset = offset;
        GM_setValue('cbServerOffset', _serverOffset);
        const offsetSec = Math.round(_serverOffset / 1000);
        console.log(`[JB][TIME] Server offset calibrated: ${offsetSec > 0 ? '+' : ''}${offsetSec}s`);
      }
    } catch (e) {
      console.warn('[JB][TIME] Calibration error:', e);
    }
  }

  // Calibrate on page load and periodically
  function initServerTime() {
    // Calibrate immediately
    setTimeout(calibrateServerTime, 2000);
    // Re-calibrate every 10 minutes
    setInterval(calibrateServerTime, 10 * 60 * 1000);
  }

  /* === DTM TEAM CREATION (Leader Mode) === */

  const LS_CREATE_DTM_STATE = 'cbCreateDtmState';   // idle | setup | polling
  const LS_CREATE_DTM_STEP  = 'cbCreateDtmStep';    // 0-3
  const LS_CREATE_DTM_NEXT  = 'cbCreateDtmNextAt';
  const LS_CREATE_DTM_POLL  = 'cbCreateDtmPollSince';
  const DTM_PAGE = '/authenticated/organizedcrime.aspx?p=dtm';

  // State extension
  st.createDTM = GM_getValue('cbCreateDTM', false);
  st.dtmPartner = GM_getValue('cbDtmPartner', '');
  st.dtmSched = GM_getValue('cbDtmSched', '');
  st.dtmRepeat = GM_getValue('cbDtmRepeat', 'once');
  st.dtmLeft = GM_getValue('cbDtmLeft', 0);

  // Save additions
  const _origSaveSt = saveSt;
  saveSt = function() {
    _origSaveSt();
    GM_setValue('cbCreateDTM', st.createDTM);
    GM_setValue('cbDtmPartner', st.dtmPartner);
    GM_setValue('cbDtmSched', st.dtmSched);
    GM_setValue('cbDtmRepeat', st.dtmRepeat);
    GM_setValue('cbDtmLeft', st.dtmLeft);
  };

  function getCreateDtmState() { return localStorage.getItem(LS_CREATE_DTM_STATE) || 'idle'; }
  function getCreateDtmStep() { return parseInt(localStorage.getItem(LS_CREATE_DTM_STEP) || '0', 10); }
  function resetCreateDTM() {
    localStorage.setItem(LS_CREATE_DTM_STATE, 'idle');
    localStorage.setItem(LS_CREATE_DTM_STEP, '0');
    localStorage.removeItem(LS_CREATE_DTM_NEXT);
    localStorage.removeItem(LS_CREATE_DTM_POLL);
    localStorage.removeItem('cbCreateDtmStartedAt');
    localStorage.removeItem('cbDtmReinvites');
    localStorage.removeItem(LS_DTM_CHOSEN);
    dtmClearTried();
    // Kick/drop clocks belong to one invite cycle — never carry them into the next.
    try { dtmClearKickState(); } catch(_){}
  }

  /* === DTM PARTNER FROM THE ADS LIST ===
   * Create DTM has always invited the ONE partner named in its modal. That is
   * fine with a regular teammate and useless otherwise: if they aren't around,
   * the DTM sits there until the re-invite cap gives up.
   *
   * With cfg.dtmAutoPartner on, the partner is chosen from ocads.aspx — the same
   * page "DTM List" adds you to — preferring someone who is actually online.
   *
   * KEY DESIGN POINT: presence is NOT read from the ads page. We only take NAMES
   * from it, then intersect them with players.aspx via the online watch's own
   * fetchOwPage/parseOwPlayers, which are proven and already parse the page the
   * game uses to show who is on. So this works regardless of what markup ocads
   * uses for a presence indicator — the one part of that page I have never seen.
   * If no online list is available we still proceed, just without the filter.
   */
  const LS_DTM_CHOSEN = 'cbDtmChosenPartner';
  const LS_DTM_TRIED  = 'cbDtmTriedNames';

  function dtmTried() {
    try { const a = JSON.parse(localStorage.getItem(LS_DTM_TRIED) || '[]'); return Array.isArray(a) ? a : []; }
    catch(_) { return []; }
  }
  function dtmMarkTried(name) {
    const k = normName(name);
    if (!k) return;
    const a = dtmTried();
    if (!a.includes(k)) { a.push(k); try { localStorage.setItem(LS_DTM_TRIED, JSON.stringify(a)); } catch(_){} }
  }
  function dtmClearTried() { localStorage.removeItem(LS_DTM_TRIED); }

  // Candidate names off the ads page. Kept deliberately loose: any profile link
  // that isn't us, de-duplicated, with the row text carried along so the caller
  // can prefer a matching city.
  function parseDtmAds(doc) {
    const out = [], seen = new Set();
    const me = normName(st.player);
    // Narrow to a DTM grid when one is identifiable, otherwise sweep the page.
    const scope = doc.querySelector('#ctl00_main_gvDTM, #ctl00_main_gvDTMAds, #ctl00_main_gvAdsDTM, #ctl00_main_gvAds') || doc;
    for (const a of scope.querySelectorAll('a[href*="profile.aspx"]')) {
      const nm = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (!nm || nm.length > 40) continue;
      if (/^(profile|view|user|players|online|home|logout|add me)$/i.test(nm)) continue;
      const k = normName(nm);
      if (!k || k === me || seen.has(k)) continue;
      const row = a.closest('tr');
      const rowTxt = row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : '';
      // If the page also carries OC adverts, those name a role. A DTM has none,
      // so a role word means we're looking at the wrong list.
      if (/transporter|weapon\s*master|explosive\s*expert|security\s*expert/i.test(rowTxt)) continue;
      seen.add(k);
      out.push({ name: nm, key: k, row: rowTxt });
    }
    return out;
  }

  async function pickDtmPartnerFromAds() {
    let doc;
    try {
      const r = await fetch(OCADS_PATH + '?_=' + Date.now(), { credentials:'same-origin', cache:'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    } catch (e) {
      console.warn(APP_TAG, '[DTM] Ads page fetch failed:', e && e.message ? e.message : e);
      return null;
    }
    if (isLoginDoc(doc)) { console.warn(APP_TAG, '[DTM] Ads page returned the login form'); return null; }

    let cands = parseDtmAds(doc);
    if (!cands.length) { console.log(APP_TAG, '[DTM] Nobody advertising on the DTM list'); return null; }
    const total = cands.length;

    // Filters: blacklist always, whitelist when enforced, and anyone already tried
    // this cycle (so a re-invite reaches for a DIFFERENT person, which is the whole
    // point of picking from a pool).
    const bl = (st.blNames || []).map(normName).filter(Boolean);
    const wl = (st.wlNames || []).map(normName).filter(Boolean);
    const tried = dtmTried();
    cands = cands.filter(c => !bl.includes(c.key) && !tried.includes(c.key));
    if (st.whitelist && wl.length) cands = cands.filter(c => wl.includes(c.key));
    if (!cands.length) {
      console.log(APP_TAG, `[DTM] All ${total} advertiser(s) filtered out (blacklist/whitelist/already tried)`);
      return null;
    }

    // Online check — see the section note above for why this comes from players.aspx.
    let pool = cands;
    try {
      const f = await getPlayersDoc(true);   // names only — see getPlayersDoc
      const online = parseOwPlayers(f.doc);
      if (online && online.size) {
        const on = cands.filter(c => online.has(c.key));
        if (!on.length) {
          console.log(APP_TAG, `[DTM] None of the ${cands.length} advertiser(s) are online — waiting`);
          return null;
        }
        pool = on;
      }
    } catch (e) {
      console.warn(APP_TAG, '[DTM] Online list unavailable, picking without it:', e && e.message ? e.message : e);
    }

    // Same city if the row says so — a DTM partner in another city is no use.
    const city = getCurCity();
    if (city) {
      const same = pool.filter(c => c.row.toLowerCase().includes(city.toLowerCase()));
      if (same.length) pool = same;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    console.log(`${APP_TAG}[DTM] Partner from ads: ${pick.name} (${pool.length} of ${total} advertisers eligible)`);
    return pick.name;
  }

  // The partner for the CURRENT invite cycle: whatever was chosen and stored, else
  // the fixed one from the modal.
  function dtmCurrentPartner() {
    return (localStorage.getItem(LS_DTM_CHOSEN) || '').trim() || String(st.dtmPartner || '').trim();
  }

  function isDtmSchedReady() {
    const ms = parseSchedTime(st.dtmSched);
    return ms === 0 || Date.now() >= ms;
  }

  function triggerCreateDTM() {
    if (!st.createDTM) return;
    if (!isDtmSchedReady()) return;
    if (!getHot()) { fetchHot(); return; }
    if (!isInHot()) {
      tgOnce('dtm_skip_city', 3600, `⚠️ <b>DTM Skip</b>\n${st.player||'?'} | Not in hot city`);
      return;
    }
    // A fixed partner is only required when we aren't picking one off the list.
    if (!st.dtmPartner.trim() && !cfg.dtmAutoPartner) {
      tgOnce('dtm_no_partner', 3600, `⚠️ <b>DTM</b> — partner not set`);
      return;
    }
    // Clear throttle flags once we actually proceed
    localStorage.removeItem('cbTgOnce_dtm_skip_city');
    localStorage.removeItem('cbTgOnce_dtm_no_partner');

    // A new cycle picks fresh — never inherit the previous cycle's choice.
    localStorage.removeItem(LS_DTM_CHOSEN);
    dtmClearTried();

    const who = cfg.dtmAutoPartner
      ? (st.dtmPartner.trim() ? `from DTM list (fallback ${st.dtmPartner.trim()})` : 'from DTM list')
      : st.dtmPartner.trim();
    tgMsg('dtmCreate', `🚚 <b>DTM Setup</b>\n${st.player||'?'} | Partner: ${esc(who)}`);
    localStorage.setItem(LS_CREATE_DTM_STATE, 'setup');
    localStorage.setItem(LS_CREATE_DTM_STEP, '0');
    localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now()));

    const onDtm = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && /p=dtm/i.test(location.search);
    if (onDtm) setTimeout(() => handleCreateDTM(), 600);
    else window.location.href = DTM_PAGE + '&_=' + Date.now();
  }

  /* === DTM PARTNER KICK ===
   * Our DTM creation invites a partner and then simply waits, so a partner who
   * never accepts — or who accepts and then goes offline — parks the whole DTM
   * indefinitely and burns the 2h cooldown window for nothing.
   *
   * Two distinct situations, and they are NOT interchangeable:
   *
   *   Pending invite (nobody seated) — the invite was sent and never taken up.
   *     There is nothing to kick; we clear our own state and re-invite.
   *   Seated partner (Kick button present) — they took the seat but aren't
   *     progressing. This one can be kicked.
   *
   * Two hard safety rules, both learned from the reference implementation:
   *
   *   1. NEVER kick a partner showing Ready. They have bought their drugs; kicking
   *      destroys that purchase and restarts the DTM. Ready always wins.
   *   2. Re-check the seat LIVE immediately before kicking. The kick postback
   *      carries no participant id — it removes whoever is seated at that instant.
   *      A page that has been open a few minutes can easily be stale, and kicking
   *      on stale data can eject a perfectly good replacement partner.
   *
   * A grace period applies to a seated-but-offline partner so a momentary presence
   * lag right after accepting can't trigger an instant kick.
   */
  const LS_DTM_INV_AT   = 'cbDtmInviteSentAt';
  const LS_DTM_INV_NAME = 'cbDtmInvitedName';
  const LS_DTM_INV_TO   = 'cbDtmInviteTimeoutMs';
  const LS_DTM_SEAT_AT  = 'cbDtmSeatWaitSince';   // {name, at}

  function dtmClearKickState() {
    [LS_DTM_INV_AT, LS_DTM_INV_NAME, LS_DTM_INV_TO, LS_DTM_SEAT_AT]
      .forEach(k => localStorage.removeItem(k));
  }

  // Called right after an invite is sent. Timeout is randomised per invite so the
  // drop isn't a predictable round number.
  function dtmMarkInvited(name) {
    localStorage.setItem(LS_DTM_INV_AT, String(Date.now()));
    localStorage.setItem(LS_DTM_INV_NAME, String(name || ''));
    const base = Math.max(30, Number(cfg.dtmKickWaitSec) || 210) * 1000;
    localStorage.setItem(LS_DTM_INV_TO, String(base + Math.floor(Math.random() * 60000)));
    localStorage.removeItem(LS_DTM_SEAT_AT);
  }

  function dtmSeatEls() {
    return {
      nameEl:  document.querySelector('#ctl00_main_hldParticipantName'),
      statusEl:document.querySelector('#ctl00_main_lblParticipantStatus') ||
               document.querySelector('#ctl00_main_lbldParticipantStatus'),
      kickBtn: document.querySelector('#ctl00_main_btnKickParticipant')
    };
  }

  // Countdown for the panel: how long until we drop or kick, and which it'll be.
  function dtmKickCountdown() {
    if (!cfg.dtmKickOn) return null;
    const now = Date.now();
    let seat = null;
    try { seat = JSON.parse(localStorage.getItem(LS_DTM_SEAT_AT) || 'null'); } catch(_){}
    if (seat && seat.at) {
      // Mirror dtmMaybeKick's choice of clock so the countdown matches reality.
      const stt = (dtmSeatEls().statusEl?.textContent || '').trim();
      const secs = /invited/i.test(stt)
        ? Math.max(30, Number(cfg.dtmKickWaitSec)  || 210)
        : Math.max(30, Number(cfg.dtmKickGraceSec) || 180);
      return { ms: (seat.at + secs * 1000) - now, kind:'kick', name: seat.name || '' };
    }
    const sentAt = parseInt(localStorage.getItem(LS_DTM_INV_AT) || '0', 10);
    if (sentAt) {
      const to = parseInt(localStorage.getItem(LS_DTM_INV_TO) || '210000', 10);
      return { ms: (sentAt + to) - now, kind:'drop', name: localStorage.getItem(LS_DTM_INV_NAME) || '' };
    }
    return null;
  }

  function updateDtmKickUI() {
    if (!_shadow) return;
    const row = _shadow.querySelector('#jb-dtmkick-row');
    const el  = _shadow.querySelector('#jb-dtmkick');
    if (!row || !el) return;
    const c = dtmKickCountdown();
    if (!c) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    if (c.ms <= 0) {
      el.innerHTML = `<span style="color:var(--jb-danger)">${c.kind === 'kick' ? 'kick now' : 'dropping'}</span>`;
      return;
    }
    const m = Math.floor(c.ms / 60000), s = Math.floor((c.ms % 60000) / 1000);
    const clr = c.ms < 60000 ? 'var(--jb-warning)' : 'var(--jb-text-sec)';
    el.innerHTML = `<span style="color:${clr}">${c.kind === 'kick' ? 'kick' : 'drop'} ${m}:${String(s).padStart(2,'0')}</span>`;
  }

  // Synthesised __doPostBack — the Kick control is a LinkButton, so clicking it
  // directly doesn't reliably submit under a userscript.
  function dtmKickPostBack() {
    const f = document.getElementById('aspnetForm') || document.querySelector('form');
    if (!f) { console.warn(APP_TAG, '[DTM] kick: no form'); return false; }
    const ensure = id => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('input'); el.type='hidden'; el.id=id; el.name=id; f.appendChild(el); }
      return el;
    };
    ensure('__EVENTTARGET').value = 'ctl00$main$btnKickParticipant';
    ensure('__EVENTARGUMENT').value = '';
    f.submit();
    return true;
  }

  const _dtmNorm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

  // Live re-check, then kick. Returns true only if the kick was actually fired.
  async function dtmKickParticipant(reason, expectName) {
    const { nameEl } = dtmSeatEls();
    const target = expectName || (nameEl?.textContent || '').trim() || '(unknown)';
    let proceed = false, note = '';
    try {
      const r = await fetch(location.href, { credentials:'same-origin', cache:'no-store' });
      if (r.ok) {
        const dom = new DOMParser().parseFromString(await r.text(), 'text/html');
        const liveName   = (dom.querySelector('#ctl00_main_hldParticipantName')?.textContent || '').trim();
        const liveHref   = dom.querySelector('#ctl00_main_hldParticipantName')?.getAttribute('href') || '';
        const liveStatus = (dom.querySelector('#ctl00_main_lblParticipantStatus')?.textContent || '').trim();
        const liveKick   = !!dom.querySelector('#ctl00_main_btnKickParticipant');
        const seatOpen   = !liveName || /[?&]id=0\b/.test(liveHref) || /open/i.test(liveStatus) || !liveKick;
        if (seatOpen)                                            note = 'seat already empty';
        else if (/ready/i.test(liveStatus))                      note = `now READY (${liveName})`;
        else if (expectName && _dtmNorm(liveName) !== _dtmNorm(expectName)) note = `seat changed → "${liveName}"`;
        else proceed = true;
      } else { proceed = true; note = 'unverified (HTTP ' + r.status + ')'; }
    } catch (_) { proceed = true; note = 'unverified (fetch failed)'; }

    if (!proceed) {
      console.log(`${APP_TAG}[DTM] Kick ABORTED — ${note} (target "${target}", ${reason})`);
      dtmClearKickState();
      return false;
    }
    console.log(`${APP_TAG}[DTM] Kicking "${target}" — ${reason}${note ? ' ['+note+']' : ''}`);
    tgMsg('dtmCreate', `🥾 <b>DTM Kick</b>\n${st.player||'?'} | ${esc(target)} — ${esc(reason)}`);
    dtmClearKickState();
    return dtmKickPostBack();
  }

  /* Decide whether to drop or kick. Returns true if it acted (page will reload). */
  async function dtmMaybeKick() {
    if (!cfg.dtmKickOn) return false;
    const { nameEl, statusEl, kickBtn } = dtmSeatEls();
    const status = (statusEl?.textContent || '').trim();

    // Rule 1 — Ready always wins. Stop every clock and let the DTM finish.
    if (/ready/i.test(status)) {
      if (localStorage.getItem(LS_DTM_INV_AT) || localStorage.getItem(LS_DTM_SEAT_AT)) {
        dlog(APP_TAG, '[DTM] Partner Ready — kick timers cleared');
        dtmClearKickState();
      }
      return false;
    }

    const seatedName = (nameEl?.textContent || '').trim();
    const seated = !!kickBtn && !!seatedName;

    if (seated) {
      /* Which clock applies is decided by STATUS, not by whether a kick button
       * exists. Verified live: a partner who has been invited but has NOT accepted
       * already occupies the seat and already has a kick button, showing status
       * "Invited". So splitting on the button would put every case in the "seated"
       * bucket and the invite timeout would never apply to anything.
       *   "Invited"  → hasn't accepted yet   → cfg.dtmKickWaitSec
       *   otherwise  → accepted but stalled  → cfg.dtmKickGraceSec
       * ("Ready" never reaches here — it returns above.) */
      const pending = /invited/i.test(status);
      const limitSec = pending
        ? Math.max(30, Number(cfg.dtmKickWaitSec)  || 210)
        : Math.max(30, Number(cfg.dtmKickGraceSec) || 180);
      const limit = limitSec * 1000;

      // Per-name clock; a different partner in the seat restarts it rather than
      // inheriting the previous one's elapsed time.
      const key = _dtmNorm(seatedName);
      let seat = null;
      try { seat = JSON.parse(localStorage.getItem(LS_DTM_SEAT_AT) || 'null'); } catch(_){}
      if (!seat || seat.name !== key) {
        localStorage.setItem(LS_DTM_SEAT_AT, JSON.stringify({ name:key, at:Date.now() }));
        return false;
      }
      const waited = Date.now() - seat.at;
      if (waited < limit) {
        dlog(APP_TAG, `[DTM] ${seatedName} "${status||'?'}" — ${pending?'invite':'stall'} ${Math.round(waited/1000)}s/${limitSec}s`);
        return false;
      }
      const why = pending
        ? `never accepted (${Math.round(waited/60000)}m)`
        : `stalled ${Math.round(waited/60000)}m`;
      const kicked = await dtmKickParticipant(why, seatedName);
      if (kicked) {
        /* Whoever we just removed must not be picked again this cycle, and the
         * stored choice has to go or step 1 would re-invite the same person. */
        dtmMarkTried(seatedName);
        localStorage.removeItem(LS_DTM_CHOSEN);
        localStorage.setItem(LS_CREATE_DTM_STEP, '1');
        localStorage.setItem(LS_CREATE_DTM_STATE, 'setup');
        localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 5000));
      }
      return kicked;
    }

    // Nobody seated: the invite is still pending. Nothing to kick — after the
    // timeout we just clear our own state so step 1 re-invites.
    const sentAt = parseInt(localStorage.getItem(LS_DTM_INV_AT) || '0', 10);
    if (!sentAt) return false;
    const to = parseInt(localStorage.getItem(LS_DTM_INV_TO) || '210000', 10);
    if (Date.now() - sentAt <= to) return false;

    const who = localStorage.getItem(LS_DTM_INV_NAME) || st.dtmPartner || 'partner';

    /* Re-invite cap, and it depends on WHERE the partner came from.
     *
     * With a fixed partner, a retry means asking the same absent person again —
     * if they aren't there, they aren't there, so three goes and we stop rather
     * than spinning until the 10-minute abort happens to catch it.
     *
     * Picking from the ads list is the case the reference script has and we
     * didn't: each retry reaches for a DIFFERENT person (the one who just failed
     * is added to the tried list below), so retrying is genuinely productive and
     * gets a longer leash. */
    const fromList = cfg.dtmAutoPartner;
    const maxTries = fromList ? 6 : 3;
    const tries = parseInt(localStorage.getItem('cbDtmReinvites') || '0', 10) + 1;
    if (tries > maxTries) {
      console.warn(`${APP_TAG}[DTM] Gave up after ${maxTries} invites (last: ${who})`);
      tgMsg('dtmCreate', `🛑 <b>DTM abandoned</b>\n${st.player||'?'} | ${maxTries} invites, nobody accepted${fromList?' — list may be stale' : ` (${esc(who)}) — set a different partner`}`);
      localStorage.removeItem('cbDtmReinvites');
      resetCreateDTM();
      st.acting = false; st.action = ''; GM_setValue('cbActStart', 0);
      return false;   // hand control back to normal automation
    }
    localStorage.setItem('cbDtmReinvites', String(tries));

    console.log(`${APP_TAG}[DTM] ${who} didn't accept in ${Math.round(to/60000)}m — re-inviting (${tries}/${maxTries})`);
    tgMsg('dtmCreate', `⌛ <b>DTM invite expired</b>\n${st.player||'?'} | ${esc(who)} never accepted — ${fromList?'trying someone else':'re-inviting'} (${tries}/${maxTries})`);
    // Don't ask this one again this cycle, and drop the stored choice so step 1
    // picks afresh. With a fixed partner there is nothing else to pick, so the
    // fallback simply re-invites them — same behaviour as before.
    dtmMarkTried(who);
    localStorage.removeItem(LS_DTM_CHOSEN);
    dtmClearKickState();
    localStorage.setItem(LS_CREATE_DTM_STEP, '1');            // back to the invite step
    localStorage.setItem(LS_CREATE_DTM_STATE, 'setup');
    localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 3000));
    return true;
  }

  async function handleCreateDTM() {
    if (!st.createDTM) return false;
    const onDtm = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && /p=dtm/i.test(location.search);
    if (!onDtm) return false;

    const dtmSt = getCreateDtmState();
    if (dtmSt === 'idle') return false;

    // Hard abort: if DTM creation has been running >10 min without completing, give up
    // cleanly rather than looping forever between pages.
    const started = parseInt(localStorage.getItem('cbCreateDtmStartedAt')||'0',10);
    if (started === 0) { localStorage.setItem('cbCreateDtmStartedAt', String(Date.now())); }
    else if (Date.now() - started > 600000) {
      console.warn('[JB][CreateDTM] Aborting — stuck >10min');
      tgMsg('dtmCreate', `⚠️ <b>DTM Create Aborted</b>\n${st.player||'?'} | Stuck >10min, check manually`);
      resetCreateDTM();
      localStorage.removeItem('cbCreateDtmStartedAt');
      st.acting = false; st.action = ''; GM_setValue('cbActStart',0);
      return false; // resume normal automation
    }

    const next = parseInt(localStorage.getItem(LS_CREATE_DTM_NEXT) || '0', 10);
    // Still waiting for a scheduled retry — hold position on this page, don't fall through
    if (next > Date.now()) { st.acting = true; st.action = 'dtm-create'; return true; }

    const step = getCreateDtmStep();
    const partner = dtmCurrentPartner();   // chosen-from-list if there is one, else the fixed one

    // Keep other automation blocked while we work the DTM creation
    st.acting = true; st.action = 'dtm-create'; GM_setValue('cbActStart', Date.now());

    try {
      // POLLING: Check if "Complete DTM" or "Buy drugs" is ready
      if (dtmSt === 'polling') {
        /* Before anything else, deal with a partner who isn't progressing. This
         * runs first because both branches below assume a cooperating partner —
         * if we're waiting on someone who left, waiting harder won't help. It is
         * a no-op when the partner is Ready or still inside their grace window. */
        try { updateDtmKickUI(); if (await dtmMaybeKick()) return true; } catch(e) { console.warn(APP_TAG, '[DTM] kick check err', e); }

        // Check for complete button
        const compBtn = document.getElementById('ctl00_main_btnCompleteDTM') ||
          [...document.querySelectorAll('input[type="submit"]')].find(b => /complete/i.test(b.value||''));
        if (compBtn && !compBtn.disabled) {
          await wait(rndDelay(DLY.normal));
          snapshotXP('dtm');
          formSubmit(compBtn);
          tgMsg('dtmBuy', `✅ <b>DTM Committed</b>\n${st.player||'?'}`);
          resetCreateDTM();
          // Handle repeat logic
          const mode = st.dtmRepeat || 'once';
          let willRepeat = mode === 'continuous';
          if (mode.startsWith('repeat_')) {
            const left = (st.dtmLeft || 0) - 1;
            if (left > 0) { st.dtmLeft = left; willRepeat = true; }
          }
          if (!willRepeat) { st.createDTM = false; st.dtmSched = ''; st.dtmLeft = 0; }
          saveSt();
          return true;
        }

        // Check for buy drugs
        const pageTxt = document.body.textContent || '';
        let maxAmt = 0;
        const maxMatch = pageTxt.match(/maximum amount.*?(\d+)/i);
        if (maxMatch) maxAmt = parseInt(maxMatch[1], 10);

        const drugIn = document.getElementById('ctl00_main_tbDrugLAmount') ||
          document.getElementById('ctl00_main_tbDrugAmount') ||
          document.querySelector('input[id*="tbDrug"],input[id*="txtDrug"]');
        const buyBtn = document.getElementById('ctl00_main_btnBuyLDrugs') ||
          document.getElementById('ctl00_main_btnBuyDrugs') ||
          [...document.querySelectorAll('input[type="submit"]')].find(b => /buy/i.test(b.value||''));

        if (maxAmt > 0 && drugIn && buyBtn && !buyBtn.disabled) {
          drugIn.value = String(maxAmt);
          await wait(rndDelay(DLY.quick));
          snapshotXP('dtm');
          buyBtn.click();
          tgMsg('dtmBuy', `🚚 <b>DTM Bought ${maxAmt}</b>\n${st.player||'?'}`);
          storeDtm({ ready: false, total: 7200, h: 2, m: 0, s: 0, at: Date.now() });
          resetCreateDTM();
          if (st.dtmRepeat === 'once') { st.createDTM = false; st.dtmSched = ''; }
          saveSt();
          return true;
        }

        // Not ready — check back in 60s
        localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 60000));
        window.location.href = '/authenticated/crimes.aspx?' + Date.now();
        return true;
      }

      // STEP 0: Click "Start DTM"
      if (step === 0) {
        const startBtn = document.getElementById('ctl00_main_btnStartDTM') ||
          document.getElementById('ctl00_main_btnStartDTMRob') ||
          [...document.querySelectorAll('input[type="submit"],button')].find(b => /start.*dtm|begin.*dtm/i.test((b.value||b.textContent||'')));
        if (!startBtn || startBtn.disabled) {
          // Button not present yet — could still be loading, or DTM already started.
          // Check if we're actually already past the start (invite field present)
          const inviteField = document.getElementById('ctl00_main_tbParticipant');
          if (inviteField) {
            // Already started — jump to invite step
            console.log('[JB][CreateDTM] Start button gone but invite field present — advancing to step 1');
            localStorage.setItem(LS_CREATE_DTM_STEP, '1');
            localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now()));
            return true;
          }
          console.log('[JB][CreateDTM] Start DTM button not found yet — waiting');
          localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 5000));
          return true; // hold position, don't fall through to crime navigation
        }
        await wait(rndDelay(DLY.normal));
        console.log('[JB][CreateDTM] Clicking Start DTM:', startBtn.id||startBtn.value);
        tgMsg('dtmCreate', `🚚 <b>DTM 1/3</b>\n${st.player||'?'} | Started DTM`);
        localStorage.setItem(LS_CREATE_DTM_STATE, 'setup');
        localStorage.setItem(LS_CREATE_DTM_STEP, '1');
        localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 10000));
        formSubmit(startBtn);
        return true;
      }

      // STEP 1: Invite partner
      if (step === 1) {
        /* Resolve who to invite. With auto-partner on, the choice is made ONCE per
         * invite cycle and stored, so a retry on this step re-invites the same
         * person rather than churning through the list; only a timeout (which
         * clears the stored choice) moves us on to somebody else. */
        let who = partner;
        if (cfg.dtmAutoPartner && !localStorage.getItem(LS_DTM_CHOSEN)) {
          const picked = await pickDtmPartnerFromAds();
          if (picked) {
            localStorage.setItem(LS_DTM_CHOSEN, picked);
            who = picked;
          } else if (st.dtmPartner.trim()) {
            who = st.dtmPartner.trim();            // fall back to the configured partner
            console.log(APP_TAG, '[DTM] No one suitable on the list — using fixed partner', who);
          } else {
            // Nobody available and nothing configured: wait rather than fail the
            // cycle. Advertisers and their presence both turn over quickly.
            const waited = parseInt(localStorage.getItem('cbDtmAdsWaitSince') || '0', 10) || Date.now();
            localStorage.setItem('cbDtmAdsWaitSince', String(waited));
            if (Date.now() - waited > 15 * 60 * 1000) {
              console.warn(APP_TAG, '[DTM] No partner found on the list after 15m — giving up this cycle');
              tgMsg('dtmCreate', `🛑 <b>DTM abandoned</b>\n${st.player||'?'} | nobody online on the DTM list for 15m`);
              localStorage.removeItem('cbDtmAdsWaitSince');
              resetCreateDTM();
              st.acting = false; st.action = ''; GM_setValue('cbActStart', 0);
              return false;
            }
            setStatus('🚚 Waiting for someone on the DTM list…');
            localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 60000));
            return true;
          }
        }
        localStorage.removeItem('cbDtmAdsWaitSince');
        if (!who) { resetCreateDTM(); return false; }
        // Correct field ID is ctl00_main_tbParticipant (with fallbacks)
        const nameIn = document.getElementById('ctl00_main_tbParticipant') ||
                       document.getElementById('ctl00_main_txtinvitename') ||
                       document.querySelector('input[id*="Participant"],input[id*="participant"],input[id*="invitename"]');
        const invBtn = document.getElementById('ctl00_main_btnInviteDTMMember') ||
                       document.getElementById('ctl00_main_btnInvite') ||
                       document.getElementById('ctl00_main_btninvite') ||
                       document.getElementById('ctl00_main_btnAddParticipant') ||
                       [...document.querySelectorAll('input[type="submit"],button')].find(b => /invite\s*member|invite|add\s*participant|add\s*member/i.test((b.value||b.textContent||'').trim()));
        if (!nameIn || !invBtn) {
          console.log('[JB][CreateDTM] Invite form not ready — field:', !!nameIn, 'btn:', !!invBtn);
          localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 5000));
          return true;
        }
        nameIn.focus();
        nameIn.value = '';
        await wait(rndDelay(DLY.normal));
        nameIn.value = who;
        // Fire events so ASP.NET registers the typed value before postback
        try { nameIn.dispatchEvent(new Event('input', {bubbles:true})); nameIn.dispatchEvent(new Event('change', {bubbles:true})); nameIn.dispatchEvent(new Event('keyup', {bubbles:true})); } catch(_){}
        await wait(rndDelay(DLY.normal));
        console.log('[JB][CreateDTM] Entered partner:', who, 'in', nameIn.id, '— clicking', invBtn.id||invBtn.value);
        tgMsg('dtmCreate', `🚚 <b>DTM 2/3</b>\n${st.player||'?'} | Invited ${esc(who)}${cfg.dtmAutoPartner ? ' (from list)' : ''}`);
        dtmMarkInvited(who);   // starts the drop/kick clock
        localStorage.setItem(LS_CREATE_DTM_STEP, '2');
        localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 60000));
        invBtn.click();
        return true;
      }

      // STEP 2: Buy security device / wait for partner
      if (step === 2) {
        const secSel = document.getElementById('ctl00_main_securitydeviceslist');
        const buyBtn = document.getElementById('ctl00_main_btnBuySecurity');
        if (secSel && buyBtn) {
          secSel.value = '6'; // Laptop
          await wait(rndDelay(DLY.normal));
          tgMsg('dtmCreate', `🚚 <b>DTM 3/3</b>\n${st.player||'?'} | Laptop bought, waiting`);
          localStorage.setItem(LS_CREATE_DTM_STEP, '3');
          localStorage.setItem(LS_CREATE_DTM_STATE, 'polling');
          localStorage.setItem(LS_CREATE_DTM_POLL, String(Date.now()));
          localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 60000));
          buyBtn.click();
          return true;
        }
        // No buy form — maybe already bought, switch to polling
        localStorage.setItem(LS_CREATE_DTM_STATE, 'polling');
        localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 30000));
        return true;
      }

      // Check for cancelled/expired DTM
      const bt = (document.body.textContent || '').toLowerCase();
      if (/you cannot do a dtm|you have to wait/.test(bt)) {
        resetCreateDTM();
        localStorage.removeItem('cbCreateDtmStartedAt');
        st.acting = false; st.action = ''; GM_setValue('cbActStart',0);
        return false; // genuine cooldown — resume normal automation
      }
    } catch (e) {
      console.error('[JB][CreateDTM] Error:', e);
      resetCreateDTM();
      localStorage.removeItem('cbCreateDtmStartedAt');
      st.acting = false; st.action = ''; GM_setValue('cbActStart',0);
      return false;
    }
    // Default: stay on the DTM page and retry next tick rather than falling through
    // to crime navigation (which caused the crime<->DTM loop).
    localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now() + 8000));
    return true;
  }

  /* === MAIN LOOP === */

  async function mainLoop() {
    _lastLoopTick = Date.now(); // Watchdog heartbeat

    /* HALTED — hard stop, checked before anything else including the master-tab
     * election. Nothing below this line may run: every branch of the loop either
     * navigates or fetches, and both say "somebody is here".
     *
     * The two pumps are the exception and they matter: a queued script-check
     * alert has to keep being delivered while you're stopped, since being stopped
     * is usually the response to one. They talk to Telegram, never to the game.
     */
    if (isHalted()) {
      try { pumpCriticalAlerts(); } catch(_){}
      try { pumpTgQueue(); } catch(_){}
      setStatus('⛔ STOPPED — no activity');
      schedLoop(5000);
      return;
    }

    const wasMaster = tabs.isMaster;
    tabs.check();

    if (!tabs.isMaster) {
      if (wasMaster) console.log(APP_TAG, 'Lost master');
      setStatus('⏸ Secondary tab');
      schedLoop(3000); return;
    }

    /* Soft-ban hold is checked BEFORE the generic pause return, because it is the
     * one pause that lifts itself: the expiry is known, so we sit out the ban and
     * resume without needing you to unpause manually. Checked here rather than
     * further down for exactly that reason — below the `paused` return it could
     * never run once it had paused us. */
    {
      // Read the stored expiry BEFORE softBanHold(), which clears it once passed —
      // otherwise the "was there a ban?" test below always sees zero.
      const hadBan = parseInt(GM_getValue(LS_SOFTBAN_UNTIL, 0) || 0, 10) > 0;
      if (softBanHold()) { paused = true; schedLoop(30000); return; }
      if (hadBan) {
        // Window just closed — release the pause we imposed and carry on.
        paused = false;
        console.log(APP_TAG, '[ANTIBOT] Soft ban expired — resuming');
        tgMsg('startup', `✅ <b>Soft ban expired</b>\n${st.player||'?'} | automation resumed`);
      }
    }

    if (paused) { schedLoop(1800+Math.floor(Math.random()*1400)); return; }

    // HEALTH MONITORING — runs at all times, bypasses every break.
    // Always check low-HP alerting, and if HP is critically low let health auto-buy
    // run even during a coffee/lunch/sleep break (we don't want to die while resting).
    checkLowHp();
    const _breakActive = breaks.isSleeping ||
      (breaks.coffeeEndAt > 0 && Date.now() < breaks.coffeeEndAt) ||
      (breaks.lunchEndAt > 0 && Date.now() < breaks.lunchEndAt) ||
      isSleepWindow();
    if (_breakActive && st.health) {
      const _hp = getHp();
      if (_hp > 0 && _hp < cfg.minHealth) {
        // Critical: bypass the break to top up health, then resume the break next tick
        console.log(`[JB][HEALTH] HP ${_hp}% < ${cfg.minHealth}% during break — buying health (bypassing break)`);
        setStatus(`💊 Emergency health (${_hp}%) — break paused`);
        checkHealth();
        schedLoop(2500); return;
      }
    }

    /* === A PANIC OUTRANKS A BREAK (2000.277) ===
     *
     * Hold HQ sits further down this function, and EVERY break check above it
     * returns — so switching on the panic button while a coffee break was
     * running did nothing at all. You stayed on the street, being shot at,
     * because Jarvis was having a coffee. The comment on the Hold HQ block
     * already claimed it "outranks everything below it"; the ordering did not
     * agree, and a break silently won.
     *
     * The precedent is right above: a critically low HP bypasses a break to heal,
     * on the grounds that resting should not mean dying. Hiding is the same
     * argument, and more urgent — the whole point of the button is that
     * something is happening RIGHT NOW.
     *
     * Breaks are not cancelled, only deferred: an already-running one is left
     * pending and resumes once the panic ends (Hold HQ caps itself at
     * cfg.holdHqMax, ~1h). No NEW break is started while hiding.
     *
     * Deliberately still BELOW the anti-bot and staff-check handling further
     * down — not getting banned outranks not getting shot. */
    const hqPanic = cfg.holdHqOn && !st.inJail;

    if (hqPanic) {
      // Let a finished break clear itself, but start none and return for none.
      coffeeJustEnded(); lunchJustEnded();
      dlog(APP_TAG, '[HQ] Panic mode — break/sleep gating bypassed');
    } else {
      // Break system checks — highest priority (health already handled above)
      if (handleSleep()) {
        setStatus(getBreakStatus().msg);
        schedLoop(30000); return;
      }
      coffeeJustEnded(); lunchJustEnded(); // clear ended breaks
      /* Mod-online break. Sits with the other breaks rather than using `paused`,
       * so it expires by itself and the health bypass above still protects you —
       * being off the game for an hour shouldn't mean dying in it. */
      if (modBreakActive()) {
        setStatus(`🛑 Mod break — ${modBreakRemainingMin()}m left`);
        schedLoop(30000); return;
      }
      if (isCoffeeTime()) {
        const bs = getBreakStatus();
        setStatus(bs.msg);
        schedLoop(10000); return;
      }
      if (isLunchTime()) {
        const bs = getBreakStatus();
        setStatus(bs.msg);
        schedLoop(10000); return;
      }
    }

    checkCaptcha(); checkNewMsgs(); checkLogout();

    /* Anti-bot / soft ban BEFORE the staff check: both read the same "Important
     * message" panel, and whichever runs first claims it. An enforcement message
     * misread as a staff question would have Jarvis telling you to answer a
     * message containing no question, while the real information — the expiry —
     * went unparsed. detectAntiBotMsg only claims the page when the body actually
     * reads as enforcement, so genuine staff questions still fall through. */
    if (detectAntiBotMsg()) { schedLoop(30000); return; }
    // A soft ban already recorded keeps us parked until its stated expiry, even
    // on pages that don't show the message.
    if (softBanHold()) { paused = true; schedLoop(30000); return; }

    if (checkSqlCheck()) {
      paused = true; setStatus('⚠️ STAFF CHECK — paused');
      schedLoop(10000); return;
    }

    checkStuck();

    if (isOnCaptcha()) {
      if (resume.on) { setStatus('Script Check — monitoring...'); localStorage.setItem('cbScriptCheck','1'); startScMonitor(); }
      else setStatus('Script Check — paused');
      schedLoop(1800+Math.floor(Math.random()*1400)); return;
    } else {
      if (localStorage.getItem('cbScriptCheck') === '1') { localStorage.removeItem('cbScriptCheck'); _scActive = false; }
    }

    if (!st.player) { getPlayerName(); schedLoop(3000); return; }

    checkJailAny();

    // Just released — sit still until the randomised hold expires.
    if (jailHoldActive()) {
      setStatus(`⛓️ Just released — resuming in ${jailHoldRemainingSec()}s`);
      try { updateJailCountUI(); } catch(_){}
      schedLoop(1000); return;
    }

    /* Hold HQ outranks everything below it. It is a panic mode — you are hiding
     * because you're being shot at, and grinding crimes in the middle of that is
     * not hiding. Sits below the jail/staff-check handling above, because those
     * are about not getting banned, which outranks not getting shot. */
    if (hqPanic) {   // same condition as the break bypass above — one source of truth
      try { if (await doHoldHq()) { schedLoop(5000); return; } } catch(e) { console.warn(APP_TAG, '[HQ]', e); }
    }

    if (handleOcPage()) { schedLoop(3000); return; }
    if (handleDtmPage()) { schedLoop(3000); return; }

    // OC creation flow
    if (st.createOC && !st.inJail) {
      const ocSt = getCreateOCState();
      if (ocSt === 'idle') {
        try {
          const oc = getOc();
          if (oc && (oc.ready || (oc.total||0)<=0) && isSchedReady()) triggerCreateOC();
        } catch(_){}
      }
      if (ocSt !== 'idle') {
        const onOc = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && !/p=dtm/i.test(location.search);
        if (onOc) { try { if (await handleCreateOC()) { schedLoop(3000); return; } } catch(_){} }
        else {
          const next = parseInt(localStorage.getItem(LS_OC_NEXT)||'0',10);
          if (next > 0 && Date.now() >= next && !st.acting) { window.location.href = OC_PATH+'?'+Date.now(); schedLoop(5000); return; }
        }
      }
    }

    // DTM creation flow (leader mode)
    if (st.createDTM && !st.inJail) {
      const dtmSt = getCreateDtmState();
      if (dtmSt === 'idle') {
        try {
          const dtm = getDtm();
          if (dtm && (dtm.ready || (dtm.total||0)<=0) && isDtmSchedReady()) triggerCreateDTM();
        } catch(_){}
      }
      if (dtmSt !== 'idle') {
        const onDtm = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && /p=dtm/i.test(location.search);
        if (onDtm) { try { if (await handleCreateDTM()) { schedLoop(3000); return; } } catch(_){} }
        else {
          const next = parseInt(localStorage.getItem(LS_CREATE_DTM_NEXT)||'0',10);
          if (next > 0 && Date.now() >= next && !st.acting) { window.location.href = DTM_PAGE+'&_='+Date.now(); schedLoop(5000); return; }
        }
      }
    }

    // Auto-travel to hot city and DTM list (priority after OC/DTM creation, before invites)
    if (!st.inJail && !st.acting) {
      checkDtmListReset();

      // Auto-travel: if we need to be in hot city (for DTM list or OC creation)
      if (st.autoTravel) {
        const handled = await doAutoTravel();
        if (handled) { schedLoop(3000); return; }
      }

      // Auto-add to DTM list: in hot city + DTM ready
      if (st.autoDtmList) {
        const handled = await doAutoAddDtmList();
        if (handled) { schedLoop(3000); return; }
      }
    }

    // Pending invite URLs
    if (!st.inJail && !st.acting) {
      const pendDtm = localStorage.getItem(LS_PEND_DTM);
      if (pendDtm && st.autoDTM) {
        localStorage.removeItem(LS_PEND_DTM);
        localStorage.removeItem('cbDtmJustActed'); // fresh invite — clear any stale guard
        localStorage.setItem('cbPendDtmHandle','true');
        localStorage.setItem('cbPendDtmHandleTs', String(Date.now()));
        tgMsg('dtmAccept', `🚚 <b>DTM Accepted</b>\n${st.player||'?'}`);
        st.acting = true; st.action = 'dtm-invite'; GM_setValue('cbActStart', Date.now()); saveSt();
        try { const u = new URL(pendDtm); window.location.href = u.pathname+u.search; } catch(_) { window.location.href = pendDtm.replace(/^https?:\/\/[^/]+/,''); }
        return;
      }
      const pendOc = localStorage.getItem(LS_PEND_OC);
      if (pendOc && st.autoOC && !st.inJail) {
        localStorage.removeItem(LS_PEND_OC);
        localStorage.setItem('cbPendOcHandle','true');
        localStorage.setItem('cbPendOcHandleTs', String(Date.now()));
        tgMsg('ocAccept', `🕵️ <b>OC Accepted</b>\n${st.player||'?'}`);
        st.acting = true; st.action = 'oc-invite'; GM_setValue('cbActStart', Date.now()); saveSt();
        try { const u = new URL(pendOc); window.location.href = u.pathname+u.search; } catch(_) { window.location.href = pendOc.replace(/^https?:\/\/[^/]+/,''); }
        return;
      }
    }

    // Mail check
    if ((st.autoOC || st.autoDTM || (tg.enabled && (tg.messages||tg.scriptTest||tg.staffMail))) && tabs.isMaster) {
      const lastMail = parseInt(localStorage.getItem('cbLastMailTs')||'0',10);
      const onMail = curPage() === 'mailbox';
      if (onMail || (Date.now() - lastMail > mailIntervalMs())) {
        localStorage.setItem('cbLastMailTs', String(Date.now()));
        try { await checkMail(); } catch(_){}
        if (localStorage.getItem(LS_PEND_DTM) || localStorage.getItem(LS_PEND_OC)) { schedLoop(500); return; }
      }
    }

    try { checkReadyAlerts(); } catch(_){}
    try { maybeSendXpReport(); } catch(_){}
    /* The OC/DTM/travel/protection fetches. THIS is what actually keeps those
     * timers current — the intervals in restartTimerIntervals are only a
     * backstop, because a page rarely lives long enough for one to fire. See
     * maybeBgFetch. Fire-and-forget: it must never delay an action. */
    try { maybeBgFetch(); } catch(_){}
    try { doForumRefresh(); } catch(_){}   // fire-and-forget; never gates the loop
    try { maybeForceStatRefresh(); } catch(_){}

    /* Health. The background path needs no navigation, so it is safe to run even
     * mid-action — which is the whole point: health no longer has to wait for a
     * gap, and no longer strands an action to go and buy. The legacy path still
     * requires a clear slot because it navigates. */
    if (st.health) {
      if (cfg.bgHealOn) { checkHealth(); }
      else if (!st.acting) {
        checkHealth();
        if (st.buyHealth) { schedLoop(1800+Math.floor(Math.random()*1400)); return; }
      }
    }

    if (!st.acting) {
      const now = Date.now();
      const pg = curPage();

      if (!st.crime && !st.gta && !st.booze && !st.jail && !st.garage && !st.health && !st.autoOC && !st.autoDTM && !cfg.scrapOn) {
        if (now % 30000 < 2000) setStatus('Idle');
        schedLoop(5000); return;
      }

      if (st.inJail) {
        if (now - st.lastJailCk > cfg.jailCheckInt*1000) {
          st.lastJailCk = now; saveSt();
          safeNav('/authenticated/jail.aspx?'+Date.now());
        } else {
          const pend = localStorage.getItem(LS_PEND_DTM) ? ' (DTM pending)' : localStorage.getItem(LS_PEND_OC) ? ' (OC pending)' : '';
          setStatus(`IN JAIL${st.pending?` (resume ${st.pending})`:''} ${pend}`);
        }
      } else {
        if (st.pending) {
          if (st.pending === 'crime' && st.crime) { if(pg==='crimes') doCrime(); else safeNav('/authenticated/crimes.aspx?'+Date.now()); schedLoop(1800+Math.floor(Math.random()*1400)); return; }
          if (st.pending === 'gta' && st.gta) { if(pg==='gta') doGta(); else safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); schedLoop(1800+Math.floor(Math.random()*1400)); return; }
          if (st.pending === 'booze' && st.booze) { if(pg==='booze') doBooze(); else safeNav('/authenticated/crimes.aspx?p=b&'+Date.now()); schedLoop(1800+Math.floor(Math.random()*1400)); return; }
          st.pending = ''; saveSt();
        }

        const garageOd = st.garage && (now - st.lastGarage >= cfg.garageInt*1000);
        if (garageOd && pg === 'garage') doGarage();

        /* These test the SAME persisted delay the actions themselves test — see
         * cooldownDelayMs. Testing the raw interval here is what made jail look
         * permanently ready while doJailbreak quietly refused. */
        const crimeRdy = st.crime && cooldownElapsed('crime', st.lastCrime, cfg.crimeInt) && !dailyLimitReached('crime');
        const gtaRdy   = st.gta   && cooldownElapsed('gta',   st.lastGta,   cfg.gtaInt)   && !dailyLimitReached('gta');
        const boozeRdy = st.booze && cooldownElapsed('booze', st.lastBooze, cfg.boozeInt) && !dailyLimitReached('booze');
        const jailRdy  = st.jail  && cooldownElapsed('jail',  st.lastJail,  cfg.jailInt);
        const garageRdy= st.garage && (now - st.lastGarage >= cfg.garageInt*1000);

        /* Scrap sits at the BOTTOM of the priority list deliberately. It has no
         * cooldown of its own and would otherwise starve the timed actions, which
         * do — a missed crime window is gone, whereas scrap keeps indefinitely. */
        if (!crimeRdy && !gtaRdy && !boozeRdy && !jailRdy && !garageRdy && scrapDue()) {
          if (await doScrap()) { schedLoop(3000); return; }
        }

        if (crimeRdy && gtaRdy) {
          // Whichever came due FIRST goes first — real due times, not raw intervals.
          const ct = st.lastCrime + cooldownDelayMs('crime', cfg.crimeInt);
          const gt = st.lastGta   + cooldownDelayMs('gta',   cfg.gtaInt);
          if (ct <= gt) { if(pg==='crimes') doCrime(); else safeNav('/authenticated/crimes.aspx?'+Date.now()); }
          else { if(pg==='gta') doGta(); else safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); }
        } else if (crimeRdy) { if(pg==='crimes') doCrime(); else safeNav('/authenticated/crimes.aspx?'+Date.now()); }
        else if (gtaRdy) { if(pg==='gta') doGta(); else safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); }
        else if (boozeRdy) { if(pg==='booze') doBooze(); else safeNav('/authenticated/crimes.aspx?p=b&'+Date.now()); }
        else if (jailRdy && !jailShouldHoldOff() && !modJailBlocked()) { if(pg==='jail') doJailbreak(); else safeNav('/authenticated/jail.aspx?'+Date.now()); }
        else if (garageRdy) { if(pg==='garage') doGarage(); else safeNav('/authenticated/playerproperty.aspx?p=g&'+Date.now()); }
        else {
          // The REAL wait, from the persisted delay. This used to show the raw
          // interval, so the panel read J:0s while the true gap was minutes.
          const cr = Math.ceil(cooldownRemainingMs('crime', st.lastCrime, cfg.crimeInt)/1000);
          const gr = Math.ceil(cooldownRemainingMs('gta',   st.lastGta,   cfg.gtaInt)/1000);
          const br = Math.ceil(cooldownRemainingMs('booze', st.lastBooze, cfg.boozeInt)/1000);
          const jr = Math.ceil(cooldownRemainingMs('jail',  st.lastJail,  cfg.jailInt)/1000);
          const gar= Math.max(0, Math.ceil((cfg.garageInt*1000-(now-st.lastGarage))/60000));
          /* ⏸J = jail ready but yielding to an action due shortly.
           * ⏸M = jail ready but held because staff are online. Distinct marks,
           * because the two hold jail for unrelated reasons and one of them
           * lasts until a moderator logs off. */
          const yieldMark = (jailRdy && modJailBlocked()) ? ' ⏸M'
                          : (jailRdy && jailShouldHoldOff()) ? ' ⏸J' : '';
          setStatus(`C:${cr}s G:${gr}s B:${br}s J:${jr}s Gar:${gar}m${yieldMark}`);
        }
      }
    }

    schedLoop(1800+Math.floor(Math.random()*1400));
  }

  /* === INIT === */

  function init() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); return; }
    /* Scrub any excluded crime out of the stored selection. Nothing can tick one
     * now, but an install that predates the exclusion (or a hand-edited value)
     * could still carry it, and clearing it here means it doesn't linger in
     * storage looking like an active choice. */
    if (Array.isArray(st.crimes)) {
      const clean = st.crimes.filter(id => crimeAllowed(id));
      if (clean.length !== st.crimes.length) {
        console.warn(APP_TAG, '[CRIME] Removed excluded crime(s) from saved selection');
        st.crimes = clean; saveSt();
      }
    }
    tabs.check();
    buildUI();
    try { updateXpUI(); } catch(_){} // paint saved XP/rank straight away so it doesn't blank on load

    /* A halt has to SURVIVE A PAGE LOAD, and this is where that is decided.
     *
     * Everything below the halt branch either starts a polling timer or fetches
     * something. If init started them unconditionally the stop would last only
     * until the next navigation — and since the user may well still be clicking
     * around the game by hand while Jarvis is stopped, that is not a rare case.
     *
     * The XP interceptor is still installed: it is passive, it only observes
     * requests the page itself makes, and it never originates one. The Telegram
     * pumps still start, because a queued alert must keep going out.
     */
    installXpInterceptor();
    startTgPump();
    startCriticalPump();

    if (isHalted()) {
      try { initPlayerHover(); } catch(_){}   // local, hover-driven only
      setStatus('⛔ STOPPED — tick ALL to resume');
      console.log(`${APP_TAG}[HALT] Loaded halted — no timers, no polling, no navigation.`);
    } else {
      startAllServices();
      if (tabs.isMaster) setStatus(`${APP_NAME} ${APP_VERSION} — Master tab`);
      else setStatus('⏸ Secondary tab');
      checkJailAny();
    }

    /* Teardown on BOTH beforeunload and pagehide.
     *
     * Mobile browsers frequently skip beforeunload entirely — on Android it is
     * unreliable by design, and a tab the OS discards never fires it at all. Each
     * page load creates an AudioContext, a Worker and a wake lock; if teardown is
     * skipped they accumulate across navigations, which on a low-RAM device is
     * exactly the wrong thing. pagehide is the reliable mobile signal.
     *
     * Guarded so running twice is harmless — each stop function is idempotent.
     */
    let _tornDown = false;
    const teardown = () => {
      if (_tornDown) return;
      _tornDown = true;
      tabs.release(); owStop(); propWatchStop(); modWatchStop();
      stopKaWorker(); stopKaAudio(); releaseWakeLock();
      if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
      if (owFlashTimer) { clearInterval(owFlashTimer); owFlashTimer = null; }
      if (_timerDispIv)  { clearInterval(_timerDispIv);  _timerDispIv = null; }
      if (_timerFetchIv) { clearInterval(_timerFetchIv); _timerFetchIv = null; }
      if (_protIv)       { clearInterval(_protIv);       _protIv = null; }
    };
    window.addEventListener('beforeunload', teardown);
    window.addEventListener('pagehide', teardown);

    window.addEventListener('storage', e => {
      if (e.key === LS_MASTER) tabs.check();
    });

    // Halted: the teardown and storage listeners above are registered either way,
    // but the loop must not start. Resuming brings it up via resumeAll().
    if (!isHalted()) setTimeout(() => { st.lastJailCk = 0; runLoop(); }, 1500);
  }

  init();

})();
