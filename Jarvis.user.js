// ==UserScript==
// @name         Jarvis Bot 2000.195
// @namespace    http://tampermonkey.net/
// @version      2000.195
// @description  Jarvis Bot 2000.195 — automated game assistant with Office-style UI, light/dark theme, Telegram alerts, OC/DTM auto-accept, online watch, garage management
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
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.telegram.org
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/scoobyghub/v100/refs/heads/main/Jarvis.meta.js
// @downloadURL  https://raw.githubusercontent.com/scoobyghub/v100/refs/heads/main/Jarvis.user.js
// ==/UserScript==

/*  Jarvis Bot 2000.195
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
    console.log('[JB] Logout URL intercepted — redirecting to home');
    window.location.replace('/authenticated/default.aspx');
  } catch (_) {}
})();

(function () {
  'use strict';

  /* === CONSTANTS & HELPERS === */

  const APP_NAME    = 'Jarvis Bot';
  const APP_VERSION = '2000.195';
  const APP_TAG     = '[JB]';

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

  const SKIP_PAGES = [
    '/authenticated/forum.aspx', '/authenticated/personal.aspx',
    '/authenticated/store.aspx?p=b', '/authenticated/statistics.aspx?p=C',
    '/authenticated/statistics.aspx?p=G', '/authenticated/statistics.aspx?p=p',
    '/authenticated/statistics.aspx?p=n'
  ];
  const _curPath = (window.location.pathname + window.location.search).toLowerCase();
  if (SKIP_PAGES.some(p => _curPath.includes(p.toLowerCase()))) {
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
    }
  };

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
    const TOK = 'textarea[name="g-recaptcha-response"], #g-recaptcha-response';
    const ERR = '.TMNErrorFont';
    const LS_ATT = 'cbLoginAttempts';
    const LS_PAU = 'cbLoginPaused';
    const LS_TOK = 'cbLastToken';

    let att = parseInt(localStorage.getItem(LS_ATT)||'0',10);
    let paused = localStorage.getItem(LS_PAU) === 'true';
    let lastTok = localStorage.getItem(LS_TOK)||'';
    let subTimer = null, cdTimer = null, overlay = null, locked = false, endTs = 0;

    function log(...a) { console.log('[JB Login]', ...a); }

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

    function getToken() {
      const el = document.querySelector(TOK);
      return el && typeof el.value === 'string' ? el.value.trim() : '';
    }

    function captchaDone() {
      const resp = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (resp && resp.value && resp.value.length > 0) return true;
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

    function initLogin() {
      resetLogin();

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
      if (canAuto()) {
        showOverlay('Solve captcha to continue...');
        const iv = setInterval(checkLogin, 1000);
        window.addEventListener('beforeunload', () => { clearInterval(iv); clearTimers(); });
      }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLogin);
    else setTimeout(initLogin, 500);
    return;
  }

  /* === AUTH PAGE SETUP === */

  if (_path.includes('/authenticated/')) {
    localStorage.removeItem(LS_LO_TS);
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
    // Cadence mode: true = Away (max camouflage, slow, right-skewed long tail);
    // false = At-PC (fast, fires shortly after cooldown for high throughput).
    awayMode:        GM_getValue('cbAwayMode', true)
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
    msgCheckInt: GM_getValue('cbMsgCheckInt', 60)
  };

  function saveTg() {
    GM_setValue('cbTgToken', tg.token); GM_setValue('cbTgChat', tg.chat);
    GM_setValue('cbTgEnabled', tg.enabled); GM_setValue('cbNotifyCaptcha', tg.captcha);
    GM_setValue('cbNotifyMessages', tg.messages); GM_setValue('cbNotifyScriptTest', tg.scriptTest);
    GM_setValue('cbNotifyStaffMail', tg.staffMail); GM_setValue('cbMsgCheckInt', tg.msgCheckInt);
    GM_setValue('cbNotifySqlCheck', tg.sqlCheck); GM_setValue('cbNotifyLogout', tg.logout);
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
    { key:'watchdog',    label:'Watchdog',              def:true  },
    { key:'rankup',      label:'Rank up',               def:true  }
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
  function _deferTgQ(id, at) { const q = _loadTgQ(); const it = q.find(i => i.id === id); if (it) { it.nextAt = at; _saveTgQ(q); } }
  function _backoffOrDropTgQ(id, attempts) {
    if (attempts >= 8) { _removeTgQ(id); console.error(APP_TAG, 'TG give up after', attempts, 'tries'); return; }
    _deferTgQ(id, Date.now() + Math.min(60000, 2000 * attempts));
  }

  function sendTg(msg) {
    if (!tg.enabled || !tg.token || !tg.chat) return;
    const q = _loadTgQ();
    q.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 7), msg, attempts: 0, nextAt: 0 });
    if (q.length > 50) q.splice(0, q.length - 50); // cap storage during a long outage
    _saveTgQ(q);
    pumpTgQueue();
  }

  function pumpTgQueue() {
    if (!tg.enabled || !tg.token || !tg.chat) return;
    const q = _loadTgQ();
    if (!q.length) return;
    const now = Date.now();
    for (const item of q) {
      if (_tgInFlight[item.id]) continue;
      if (now < (item.nextAt || 0)) continue;
      _tgInFlight[item.id] = true;
      item.attempts = (item.attempts || 0) + 1;
      _saveTgQ(q);
      GM_xmlhttpRequest({
        method:'POST', url:`https://api.telegram.org/bot${tg.token}/sendMessage`,
        timeout:15000, headers:{'Content-Type':'application/json'},
        data:JSON.stringify({chat_id:tg.chat, text:item.msg, parse_mode:'HTML'}),
        onload: r => {
          delete _tgInFlight[item.id];
          if (r.status === 200) {
            _removeTgQ(item.id);
            console.log(APP_TAG, 'TG sent');
          } else if (r.status === 429) {
            let wait = 5000;
            try { const j = JSON.parse(r.responseText); if (j.parameters && j.parameters.retry_after) wait = (j.parameters.retry_after + 1) * 1000; } catch(_){}
            console.error(APP_TAG, 'TG 429 — retry in', wait, 'ms');
            _deferTgQ(item.id, Date.now() + wait);
          } else {
            console.error(APP_TAG, 'TG fail', r.status);
            _backoffOrDropTgQ(item.id, item.attempts);
          }
        },
        onerror: () => { delete _tgInFlight[item.id]; console.error(APP_TAG, 'TG err'); _backoffOrDropTgQ(item.id, item.attempts); },
        ontimeout: () => { delete _tgInFlight[item.id]; console.error(APP_TAG, 'TG timeout'); _backoffOrDropTgQ(item.id, item.attempts); }
      });
    }
  }

  function startTgPump() {
    if (_tgPumpTimer) return;
    pumpTgQueue(); // resume anything left over from a previous page immediately
    _tgPumpTimer = setInterval(pumpTgQueue, 3000);
  }

  function sendTgRepeat(msg, count=5, gap=1500, label='alert') {
    const n = Math.max(1, Math.min(10, count));
    for (let i = 0; i < n; i++)
      setTimeout(() => { console.log(APP_TAG, `${label} ${i+1}/${n}`); sendTg(msg); }, i * gap);
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
        sendTg(a.msg);
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

  const OW_MAX = 10, OW_DEF_SEC = 60, OW_MIN_SEC = 20;
  const OW_COOLDOWN = 5*60*1000, OW_TIMEOUT = 15000;
  const OW_PAGES = ['/authenticated/players.aspx', '/Authenticated/players.aspx'];

  const ow = {
    on:       GM_getValue('cbOwOn', false),
    sec:      GM_getValue('cbOwSec', OW_DEF_SEC),
    notify:   GM_getValue('cbOwNotify', true),
    flash:    GM_getValue('cbOwFlash', true),
    sound:    GM_getValue('cbOwSound', true),
    telegram: GM_getValue('cbOwTg', true),
    notifyOff: GM_getValue('cbOwNotifyOff', false),
    list:     GM_getValue('cbOwList', []),
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
    GM_setValue('cbOwOn', ow.on); GM_setValue('cbOwSec', ow.sec);
    GM_setValue('cbOwNotify', ow.notify); GM_setValue('cbOwFlash', ow.flash);
    GM_setValue('cbOwSound', ow.sound); GM_setValue('cbOwTg', ow.telegram);
    GM_setValue('cbOwNotifyOff', ow.notifyOff);
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
    autoDtmList:GM_getValue('cbAutoDtmList', false)
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
      [st.crime,  st.lastCrime,  cfg.crimeInt],
      [st.gta,    st.lastGta,    cfg.gtaInt],
      [st.booze,  st.lastBooze,  cfg.boozeInt],
      [st.jail,   st.lastJail,   cfg.jailInt]
    ];
    for (const [on, last, intSec] of checks) {
      if (!on) continue;
      const remaining = (intSec * 1000) - (now - last);
      if (remaining <= withinMs) return true; // due now or within the window
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

  function handleSleep() {
    if (!breaks.sleepOn) { breaks.isSleeping = false; saveBreaks(); return false; }
    if (isSleepWindow()) {
      if (!breaks.isSleeping) {
        breaks.isSleeping = true;
        saveBreaks();
        tgMsg('sleep', `😴 <b>Sleep Mode</b>\n${st.player||'?'} | Until ${breaks.wakeTime}`);
        console.log(`[JB] Entering sleep mode until ${breaks.wakeTime}`);
        if (breaks.sleepLogout) {
          setTimeout(() => { window.location.href = '/authenticated/default.aspx'; }, 3000);
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

  function saveSt() {
    const m = {
      cbAutoCrime:st.crime, cbAutoGta:st.gta, cbAutoJail:st.jail, cbAutoBooze:st.booze,
      cbAutoHealth:st.health, cbAutoGarage:st.garage, cbAutoCrusher:st.crusher,
      cbCrusherOwned:st.crusherOwned,
      cbLastCrime:st.lastCrime, cbLastGta:st.lastGta, cbLastJail:st.lastJail,
      cbLastBooze:st.lastBooze, cbLastHealth:st.lastHealth, cbLastGarage:st.lastGarage,
      cbSelCrimes:st.crimes, cbSelGtas:st.gtas, cbPlayer:st.player, cbInJail:st.inJail,
      cbCollCrime:st.collapsed.crime, cbCollGta:st.collapsed.gta, cbCollBooze:st.collapsed.booze,
      cbMinimized:st.minimized, cbLastJailCk:st.lastJailCk, cbAction:st.action,
      cbRefresh:st.refresh, cbPending:st.pending, cbBuyHealth:st.buyHealth,
      cbAutoOC:st.autoOC, cbAutoDTM:st.autoDTM, cbNotifyReady:st.notifyReady,
      cbWhitelist:st.whitelist, cbWlNames:st.wlNames, cbCarCats:st.carCats,
      cbCreateOC:st.createOC, cbOcTrans:st.ocTrans, cbOcWeapon:st.ocWeapon,
      cbOcExplo:st.ocExplo, cbOcSched:st.ocSched, cbOcType:st.ocType,
      cbOcRepeat:st.ocRepeat, cbOcLeft:st.ocLeft,
      cbAutoTravel:st.autoTravel, cbAutoDtmList:st.autoDtmList
    };
    for (const [k,v] of Object.entries(m)) GM_setValue(k, v);
  }


  /* === TAB MANAGER === */

  const LS_MASTER = 'cbMaster', LS_HB = 'cbHeartbeat', LS_LOCK = 'cbLock';

  class TabCtrl {
    constructor() {
      this.id = `t_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
      this.hbIv = null;
      this.isMaster = false;
      this.HB_MS = 2000;
      this.TIMEOUT = 6000;
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
      if (!cur || (now - hb) > this.TIMEOUT) {
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
      return cur && cur !== this.id && (Date.now()-hb) <= this.TIMEOUT;
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
        sendTg(`⚠️ <b>SCRIPT CHECK</b>\n${st.player||'?'} | ${fmtDate()}\nAutomation paused`);
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

  function owFetch(url) {
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), OW_TIMEOUT);
    return fetch(url, { method:'GET', credentials:'include', cache:'no-store', signal:ac.signal, headers:{'X-CB-Watch':'1'} })
      .finally(() => clearTimeout(tm));
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

  function curOwPlayers() {
    try {
      if (!/players\.aspx/i.test(window.location.pathname)) return null;
      return parseOwPlayers(document);
    } catch(_) { return null; }
  }

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

  function owTriggerOnline(p) {
    const k = normName(p.name);
    ow.lastAlert[k] = Date.now();
    saveOw();
    owBrowserNotify(`${APP_NAME}: player online`, `${p.name} is online`, p.href);
    owSound();
    owFlashTitle(p.name);
    if (ow.telegram) tgMsg('online', `🟢 <b>ONLINE</b> — ${esc(p.name)}\n${st.player||'?'} | ${fmtDate()}`);
    setStatus(`🟢 ${p.name} online`);
    console.log('[JB][WATCH]', p.name, 'came ONLINE');
  }

  function owTriggerOffline(name) {
    if (!ow.notifyOff) return;
    owBrowserNotify(`${APP_NAME}: player offline`, `${name} went offline`);
    if (ow.telegram) tgMsg('offline', `🔴 <b>OFFLINE</b> — ${esc(name)}\n${st.player||'?'} | ${fmtDate()}`);
    setStatus(`🔴 ${name} offline`);
    console.log('[JB][WATCH]', name, 'went OFFLINE');
  }

  async function owScan(reason='timer') {
    if (!ow.on || !tabs.isMaster || owBusy) return;
    if (!ow.list.length) {
      ow.scanAt = Date.now(); ow.scanOk = true; ow.scanMsg = 'No names in list';
      saveOw(); renderOwUI(); return;
    }
    owBusy = true;
    try {
      let map = curOwPlayers(), src = 'current page';
      if (!map) { const f = await fetchOwPage(); map = parseOwPlayers(f.doc); src = f.url; }
      for (const raw of ow.list) {
        const k = normName(raw);
        const hit = map.get(k);
        const isOnline = !!hit;
        const wasOnline = !!ow.lastOn[k];

        // State change: offline → online
        if (isOnline && !wasOnline) {
          owTriggerOnline(hit);
        }
        // State change: online → offline
        if (!isOnline && wasOnline) {
          owTriggerOffline(raw);
        }

        ow.lastOn[k] = isOnline;
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
    if (!ow.on) { renderOwUI(); return; }
    const ms = Math.max(OW_MIN_SEC, Number(ow.sec||OW_DEF_SEC)) * 1000;
    owTimer = setInterval(() => owScan('timer'), ms);
    setTimeout(() => owScan('startup'), 2500);
    renderOwUI();
  }

  function owStop() { if (owTimer) clearInterval(owTimer); owTimer = null; }

  function owAdd(name) {
    const clean = String(name||'').trim().replace(/\s+/g,' ');
    if (!clean) return alert('Enter a name');
    if (ow.list.some(x => normName(x) === normName(clean))) return alert(`${clean} already in list`);
    if (ow.list.length >= OW_MAX) return alert(`Max ${OW_MAX} players`);
    ow.list.push(clean);
    ow.lastOn[normName(clean)] = false;
    saveOw(); renderOwUI();
  }

  function owRemove(name) {
    const k = normName(name);
    ow.list = ow.list.filter(x => normName(x) !== k);
    delete ow.lastOn[k]; delete ow.lastAlert[k];
    saveOw(); renderOwUI();
  }

  function renderOwUI() {
    // Will be implemented in UI section
  }

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

  async function fetchTravel() {
    try {
      const url = `${window.location.origin}${TRAVEL_PATH}?_=${Date.now()}`;
      console.log('[JB][TRAVEL] Fetching:', url);
      const r = await fetch(url, { method:'GET', headers:{'Cache-Control':'no-cache'}, credentials:'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // BEST: read ctl00_lblMsg span directly
      const msgEl = doc.querySelector('#ctl00_lblMsg');
      const msgTxt = msgEl ? (msgEl.textContent||'').trim() : '';
      const bodyTxt = doc.body.textContent||'';
      const lower = bodyTxt.toLowerCase();

      console.log('[JB][TRAVEL] lblMsg:', msgTxt || '(empty)');

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

      if (found) {
        const total = h*3600+m*60+s;
        if (total > 0) {
          storeTravel({ cd:total, canNormal:false, at:Date.now() });
          console.log(`[JB][TRAVEL] Cooldown: ${h}h ${m}m ${s}s (${total}s)`);
          updateTimers();
          return;
        }
      }

      const canNow = lower.includes('select a destination') ||
                     lower.includes('where would you like') ||
                     doc.querySelector('input[type=radio][name="ctl00$main$citieslist"]') !== null ||
                     doc.querySelector('#ctl00_main_btnTravelNormal') !== null;

      if (canNow) {
        storeTravel({ cd:0, canNormal:true, at:Date.now() });
        console.log('[JB][TRAVEL] Ready to travel');
      } else {
        console.log('[JB][TRAVEL] Could not parse — keeping existing timer');
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

  /* === OC/DTM READY ALERTS === */

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
  let _timerDispIv = null, _timerFetchIv = null;

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
          if (rankState.lastName && bar.rank !== rankState.lastName) {
            onRankUp(rankState.lastName, bar.rank);
          }
          rankState.name = bar.rank;
          rankState.lastName = bar.rank;
          GM_setValue('cbRankName', rankState.name);
          GM_setValue('cbRankLastName', rankState.lastName);
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
    try { updateXpUI(); } catch(_){}
    try { checkXpCapResets(); } catch(_){}
    try { pumpCriticalAlerts(); } catch(_){}
    try { pumpTgQueue(); } catch(_){}
  }

  async function collectTimers() {
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
    if (!_timerDispIv) _timerDispIv = setInterval(updateTimers, 5000);
    if (!_timerFetchIv) _timerFetchIv = setInterval(() => {
      if (!st.inJail && !paused && !st.acting) { collectTimers(); fetchTravel(); }
    }, 60000);
    setTimeout(collectTimers, 3000);
    setTimeout(fetchTravel, 4000);
    setTimeout(fetchProt, 5000);
    setInterval(fetchProt, 120000);
  }


  /* === MAIL SYSTEM (OC/DTM INVITE ACCEPT) === */

  const LS_LAST_OC_MAIL  = 'cbLastOcMail';
  const LS_LAST_DTM_MAIL = 'cbLastDtmMail';
  const LS_LAST_OC_ACC   = 'cbLastOcAcc';
  const LS_LAST_DTM_ACC  = 'cbLastDtmAcc';
  const LS_PEND_DTM      = 'cbPendDtmUrl';
  const LS_PEND_OC       = 'cbPendOcUrl';
  const MAIL_INT_MS      = 60000;
  const GM_TIMEOUT       = 20000;
  const INVITE_STALE     = 15*60*1000;
  const SCRIPT_TEST_STALE= 5*60*1000;

  function gmGet(url) {
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

  async function getAcceptUrl(mailHref, type='oc') {
    const url = toAuthUrl(mailHref);
    const r = await gmGet(url);
    if (!/\/authenticated\/mailbox\.aspx/i.test(r.finalUrl)) return null;
    const doc = new DOMParser().parseFromString(r.html, 'text/html');
    const link = [...doc.querySelectorAll('a[href*="organizedcrime.aspx"]')].find(a => {
      const txt = (a.textContent||'').trim().toLowerCase();
      if (txt && !txt.includes('accept') && !txt.includes('organizedcrime')) return false;
      const h = (a.getAttribute('href')||'').replace(/&amp;/g,'&');
      try {
        const u = new URL(h, location.origin);
        const act = (u.searchParams.get('act')||'').toLowerCase();
        const ocid = u.searchParams.get('ocid')||'';
        if (act === 'accept' && /^\d+$/.test(ocid)) return true;
        const p = (u.searchParams.get('p')||'').toLowerCase();
        const acc = u.searchParams.get('accept');
        const id = u.searchParams.get('id')||'';
        if (acc === '1' && /^\d+$/.test(id)) return true;
        return false;
      } catch(_) { return false; }
    });
    return link ? toAuthUrl(link.getAttribute('href')) : null;
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

        // DTM invite check
        const isDtm = /(dtm\s*invitation|dtm\s*invite|drug\s*trade)/i.test(rowTxt);
        if (isDtm && st.autoDTM) {
          const lastAcc = parseInt(localStorage.getItem(LS_LAST_DTM_ACC)||'0',10);
          if (lastAcc > 0 && (Date.now()-lastAcc) < 7200000) { localStorage.setItem(LS_LAST_DTM_MAIL, mailId); continue; }
          if (localStorage.getItem('cbPendDtmHandle') === 'true' || localStorage.getItem(LS_PEND_DTM)) { localStorage.setItem(LS_LAST_DTM_MAIL, mailId); continue; }
          if (localStorage.getItem(LS_LAST_DTM_MAIL) === mailId) continue;
          const ts = parseTmnDate(rowTxt);
          if (isOlderThan(ts, INVITE_STALE)) { localStorage.setItem(LS_LAST_DTM_MAIL, mailId); continue; }
          if (ts === 0 && localStorage.getItem(LS_LAST_DTM_MAIL) && parseInt(mailId) <= parseInt(localStorage.getItem(LS_LAST_DTM_MAIL))) continue;
          await handleDtmInvite(mailId, href);
          continue;
        } else if (isDtm) { localStorage.setItem(LS_LAST_DTM_MAIL, mailId); continue; }

        // OC invite check
        const isOc = /(organized\s*crime\s*invitation|oc\s*invitation)/i.test(rowTxt);
        if (isOc && st.autoOC) {
          const lastAcc = parseInt(localStorage.getItem(LS_LAST_OC_ACC)||'0',10);
          if (lastAcc > 0 && (Date.now()-lastAcc) < 7200000) { localStorage.setItem(LS_LAST_OC_MAIL, mailId); continue; }
          if (localStorage.getItem('cbPendOcHandle') === 'true' || localStorage.getItem(LS_PEND_OC)) { localStorage.setItem(LS_LAST_OC_MAIL, mailId); continue; }
          if (localStorage.getItem(LS_LAST_OC_MAIL) === mailId) continue;
          const ts = parseTmnDate(rowTxt);
          if (isOlderThan(ts, INVITE_STALE)) { localStorage.setItem(LS_LAST_OC_MAIL, mailId); continue; }
          if (ts === 0 && localStorage.getItem(LS_LAST_OC_MAIL) && parseInt(mailId) <= parseInt(localStorage.getItem(LS_LAST_OC_MAIL))) continue;
          await handleOcInvite(mailId, href);
          continue;
        } else if (isOc) { localStorage.setItem(LS_LAST_OC_MAIL, mailId); continue; }

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

  async function handleDtmInvite(mailId, href) {
    try {
      localStorage.setItem(LS_LAST_DTM_MAIL, mailId);
      if (!wasAlerted('DTM', mailId)) {
        markAlerted('DTM', mailId);
        tgMsg('dtmInvite', `📬 <b>DTM Invite</b>\n${st.player||'?'} | ${fmtDate()}\n${st.inJail ? '⛓ In jail' : '🚚 Accepting...'}`);
      }
      const url = await getAcceptUrl(href, 'dtm');
      if (st.whitelist && st.wlNames.length > 0) {
        const inv = await extractInviter(href);
        const ok = inv && st.wlNames.some(n => n && n.toLowerCase().trim() === inv.toLowerCase().trim());
        if (!ok) {
          tgMsg('blocked', `🚫 <b>DTM Blocked</b>\n${st.player||'?'} | ${inv||'Unknown'} not whitelisted`);
          return;
        }
      }
      if (!url) { tgMsg('dtmInvite', `⚠️ <b>DTM</b> — no accept link found`); return; }
      localStorage.setItem(LS_PEND_DTM, url);
    } catch(e) { console.warn(APP_TAG, 'DTM invite err:', e); }
  }

  async function handleOcInvite(mailId, href) {
    try {
      localStorage.setItem(LS_LAST_OC_MAIL, mailId);
      const url = await getAcceptUrl(href, 'oc');
      if (st.whitelist && st.wlNames.length > 0) {
        const inv = await extractInviter(href);
        const ok = inv && st.wlNames.some(n => n && n.toLowerCase().trim() === inv.toLowerCase().trim());
        if (!ok) {
          tgMsg('blocked', `🚫 <b>OC Blocked</b>\n${st.player||'?'} | ${inv||'Unknown'} not whitelisted`);
          return;
        }
      }
      if (!wasAlerted('OC', mailId)) {
        markAlerted('OC', mailId);
        let role = '';
        if (url) try { const u = new URL(url); const p = u.searchParams.get('pos'); if(p) role = ` (${p})`; } catch(_){}
        tgMsg('ocInvite', `📬 <b>OC Invite</b>${role}\n${st.player||'?'} | ${fmtDate()}\n${st.inJail ? '⛓ In jail' : '🕵️ Accepting...'}`);
      }
      if (!url) { tgMsg('ocInvite', `⚠️ <b>OC</b> — no accept link found`); return; }
      localStorage.setItem(LS_PEND_OC, url);
    } catch(e) { console.warn(APP_TAG, 'OC invite err:', e); }
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
        setTimeout(() => { btn.click(); localStorage.removeItem('cbPendOcHandle'); st.acting = false; setStatus('✅ OC role selected');
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

  // At-PC / high-throughput mode ("how it was", minus the bugs): fire shortly after
  // the cooldown with small jitter — never early, computed once (not per-tick).
  function fastCooldownMs(intervalSec) {
    const floor = Math.max(0, intervalSec * 1000);
    return floor + 500 + Math.random() * 4000; // 0.5–4.5s after ready
  }

  // Pick the delay for the current cadence mode (toggled by the Away switch).
  function nextCooldownMs(intervalSec) {
    return cfg.awayMode ? humanCooldownMs(intervalSec) : fastCooldownMs(intervalSec);
  }

  // True once the action's chosen (persisted) delay has elapsed since lastTs.
  // The delay is stable between fires — only markActed() re-rolls it.
  function cooldownElapsed(action, lastTs, intervalSec) {
    let dly = GM_getValue('cbDly_' + action, 0);
    if (!dly) { dly = nextCooldownMs(intervalSec); GM_setValue('cbDly_' + action, dly); }
    return (Date.now() - lastTs) >= dly;
  }

  // Roll and persist the delay until the NEXT action of this type. Call right after firing.
  function markActed(action, intervalSec) {
    GM_setValue('cbDly_' + action, nextCooldownMs(intervalSec));
  }

  // Re-roll all pending action delays under the current mode — used when the Away
  // switch flips, so toggling to At-PC takes effect immediately instead of waiting
  // out a long camouflage delay that was already rolled (and vice-versa).
  function rerollCadence() {
    [['crime',cfg.crimeInt],['gta',cfg.gtaInt],['booze',cfg.boozeInt],['jail',cfg.jailInt]]
      .forEach(([a, iv]) => GM_setValue('cbDly_' + a, nextCooldownMs(iv)));
  }

  function doCrime() {
    if (st.inJail || !st.crime || st.acting || paused) return;
    const now = Date.now();
    if (!cooldownElapsed('crime', st.lastCrime, cfg.crimeInt)) return;
    if (st.refresh || curPage() !== 'crimes') { st.refresh = false; saveSt(); safeNav('/authenticated/crimes.aspx?'+Date.now()); return; }
    st.acting = true; st.action = 'crime'; GM_setValue('cbActStart', now);
    let avail = [];
    if (st.crimes.length > 0) {
      avail = st.crimes.map(id => { const c = CRIMES.find(x=>x.id===id); if(c) { const b = document.getElementById(c.el); if(b && !b.disabled) return b; } return null; }).filter(Boolean);
    } else { for(let i=1;i<=5;i++) { const b = document.getElementById(`ctl00_main_btnCrime${i}`); if(b && !b.disabled) avail.push(b); } }
    if (!avail.length) {
      const rk = 'cbCrimeRetry';
      const rc = parseInt(localStorage.getItem(rk)||'0',10);
      if (rc < 3) { localStorage.setItem(rk, String(rc+1)); st.acting = false; st.action = ''; GM_setValue('cbActStart',0); setTimeout(() => { st.refresh = true; saveSt(); }, 2000); return; }
      localStorage.removeItem(rk); st.acting = false; st.action = ''; GM_setValue('cbActStart',0); return;
    }
    localStorage.removeItem('cbCrimeRetry');
    // Click immediately — humans click fast, the delay is in the cooldown
    snapshotXP('crime');
    avail[Math.floor(Math.random()*avail.length)].click();
    st.lastCrime = now; markActed('crime', cfg.crimeInt); st.refresh = true; donePending('crime'); saveSt();
    // Short reset — just enough for the page to process the click
    setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
  }

  function doGta() {
    if (st.inJail || !st.gta || st.acting || paused) return;
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
      btn.click(); st.lastGta = now; markActed('gta', cfg.gtaInt); st.refresh = true; donePending('gta'); saveSt();
      setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
    }, 200 + Math.floor(Math.random()*400));
  }

  function doBooze() {
    if (st.inJail || !st.booze || st.acting || paused) return;
    const now = Date.now();
    if (!cooldownElapsed('booze', st.lastBooze, cfg.boozeInt)) return;
    if (st.refresh || curPage() !== 'booze') { st.refresh = false; saveSt(); safeNav('/authenticated/crimes.aspx?p=b&'+Date.now()); return; }
    st.acting = true; st.action = 'booze'; GM_setValue('cbActStart', now);
    const invRows = [...document.querySelectorAll('table tr')].filter(row => { const c = row.querySelector('td:nth-child(3)'); if(!c) return false; const inv = c.textContent.trim(); return inv && inv !== '0' && !isNaN(inv); });
    if (invRows.length > 0) {
      const row = invRows[0]; const si = row.querySelector('input[id*="tbAmtSell"]'); const sb = row.querySelector('input[id*="btnSell"]');
      if (si && sb && !sb.disabled) {
        const cur = parseInt(row.querySelector('td:nth-child(3)').textContent.trim());
        si.value = Math.min(cfg.boozeSell, cur);
        snapshotXP('booze');
        sb.click(); st.lastBooze = now; markActed('booze', cfg.boozeInt); st.refresh = true; donePending('booze'); saveSt();
        setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); }, 400 + Math.floor(Math.random()*300));
        return;
      }
    }
    const buyOpts = [];
    for (let i=2; i<=6; i++) { const inp = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_tbAmtBuy`); const btn = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_btnBuy`); if (inp && btn && !btn.disabled) buyOpts.push({inp,btn}); }
    if (buyOpts.length > 0) {
      const c = buyOpts[Math.floor(Math.random()*buyOpts.length)];
      c.inp.value = cfg.boozeBuy; snapshotXP('booze'); c.btn.click(); st.lastBooze = now; markActed('booze', cfg.boozeInt); st.refresh = true; donePending('booze'); saveSt();
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
        saveSt();
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
      st.jail = false; saveSt();
      console.log(`[JB][JAIL] Daily limit ${cfg.jailDailyLimit} reached — jail disabled`);
      tgMsg('jail', `🛑 <b>Jail Limit</b>\n${st.player||'?'} | ${n}/${cfg.jailDailyLimit} reached, jail OFF`);
      updateJailCountUI();
    }
    return n;
  }

  function updateJailCountUI() {
    if (!_shadow) return;
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
        return `<div style="display:flex;justify-content:space-between;font-size:9px;padding:1px 4px;border-radius:2px;${isCur?'background:var(--jb-accent);color:#fff;font-weight:600':'color:var(--jb-text-ter)'}">
          <span>Step ${i+1}${isCur?' ◄':''}</span>
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

    // ── Recent gains list ───────────────────────────────────────────
    const histHost = _shadow.querySelector('#jb-xp-hist');
    if (histHost) {
      if (!xpState.history.length) {
        histHost.innerHTML = `<div class="jb-sub" style="text-align:center;color:var(--jb-text-ter)">No gains recorded yet.</div>`;
      } else {
        histHost.innerHTML = xpState.history.slice(0, 20).map(h => {
          const t = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          if (h.rankUp) {
            return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-top:1px solid var(--jb-border)">
              <span>⭐ <b style="color:var(--jb-accent)">RANK UP</b> <span style="color:var(--jb-text-sec)">${esc(h.label||'')}</span></span>
              <span style="color:var(--jb-text-ter)">${t}</span>
            </div>`;
          }
          return `<div style="display:flex;justify-content:space-between;padding:1px 0">
            <span>${h.icon} <span style="color:var(--jb-text-sec)">${h.action}</span></span>
            <span><b style="color:var(--jb-success)">+${h.gained}</b> <span style="color:var(--jb-text-ter)">${t}</span></span>
          </div>`;
        }).join('');
      }
    }
  }

  function doJailbreak() {
    if (!st.jail || st.acting || st.inJail || paused) return;
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
      snapshotXP('jail');
      links[Math.floor(Math.random()*links.length)].click();
      // This is a real attempt (success or fail) — count it
      incJailCount();
      updateJailCountUI();
      st.lastJail = now; markActed('jail', cfg.jailInt); saveSt();
      setTimeout(() => { st.acting = false; st.action = ''; GM_setValue('cbActStart',0); safeNav('/authenticated/jail.aspx?'+Date.now()); }, 500 + Math.floor(Math.random()*400));
    } else { st.lastJail = now; markActed('jail', cfg.jailInt); saveSt(); }
  }

  function checkHealth() {
    if (!st.health || st.acting || paused) return;
    const hp = getHp(); const cr = getCredits();
    if (hp >= 100) { st.buyHealth = false; saveSt(); return; }
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

  /* === HOT CITY === */

  const LS_HOT = 'cbHotCity', LS_HOT_UNTIL = 'cbHotUntil', LS_HOT_PEND = 'cbHotPend';

  function midnightCET() {
    try {
      const cet = new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Berlin'}));
      const ms = (24*3600*1000)-(cet.getHours()*3600+cet.getMinutes()*60+cet.getSeconds())*1000-cet.getMilliseconds();
      return Date.now()+ms;
    } catch(_) { return Date.now()+86400000; }
  }

  function saveHot(city) { localStorage.setItem(LS_HOT, city); localStorage.setItem(LS_HOT_UNTIL, String(midnightCET())); }

  function getHot() {
    const until = parseInt(localStorage.getItem(LS_HOT_UNTIL)||'0',10);
    if (until > 0 && Date.now() > until) { localStorage.removeItem(LS_HOT); localStorage.removeItem(LS_HOT_UNTIL); return null; }
    return localStorage.getItem(LS_HOT)||null;
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

  function isInHot() {
    const hot = getHot(); if (!hot) return false;
    try { const el = document.getElementById('ctl00_userInfo_lblcity'); const cur = (el?el.textContent:'').trim(); return cur.toLowerCase().includes(hot.toLowerCase()) || hot.toLowerCase().includes(cur.toLowerCase()); } catch(_) { return false; }
  }

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

  function fetchHot() {
    if (getHot()) return;
    // Throttle: only redirect to the stats page at most once every 5 minutes,
    // otherwise repeated calls cause a navigation storm (severe slowdown).
    const last = parseInt(localStorage.getItem('cbHotFetchAt')||'0',10);
    if (Date.now() - last < 300000) return;
    localStorage.setItem('cbHotFetchAt', String(Date.now()));
    localStorage.setItem(LS_HOT_PEND,'1');
    window.location.href='/authenticated/statistics.aspx?'+Date.now();
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
      .jb-sep { border: none; border-top: 1px solid var(--jb-border); margin: 8px 0; }
      .jb-sub { font-size: 10px; color: var(--jb-text-ter); }
      .jb-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
      .jb-flex { display: flex; gap: 6px; align-items: center; }
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
          <button class="jb-ribbon-btn ${st.autoOC?'':'off'}" id="jb-r-oc">OC</button>
          <button class="jb-ribbon-btn ${st.autoDTM?'':'off'}" id="jb-r-dtm">DTM</button>
        </div>

        <div class="jb-body">
          <div class="jb-sect">
            <div class="jb-sect-title">Status</div>
            <div class="jb-grid" style="grid-template-columns: 1fr 1fr;">
              <div class="jb-flex"><span class="jb-timer-label">Player:</span> <span id="jb-player-badge">${esc(st.player||'—')}</span></div>
              <div class="jb-flex">
                <label class="jb-switch"><input type="checkbox" id="jb-all-toggle"> <span style="font-weight:600" id="jb-all-label">ALL</span></label>
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
              <label class="jb-switch" title="ON = Away: max camouflage, slow human cadence. OFF = At PC: fast, high throughput."><input type="checkbox" id="jb-away-mode" ${cfg.awayMode?'checked':''}> 🕵️ <span id="jb-away-label">${cfg.awayMode?'Away (camo)':'At PC (fast)'}</span></label>
              <label class="jb-switch"><input type="checkbox" id="jb-crusher"> Crusher</label>
              <div class="jb-switch"><input type="checkbox" id="jb-wl-on"> <span id="jb-wl-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">Whitelist</span></div>
              <div class="jb-switch"><input type="checkbox" id="jb-create-oc"> <span id="jb-oc-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">Create OC</span></div>
              <div class="jb-switch"><input type="checkbox" id="jb-create-dtm"> <span id="jb-dtm-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">Create DTM</span></div>
              <div class="jb-switch"><input type="checkbox" id="jb-ow-on"> <span id="jb-ow-link" style="cursor:pointer;text-decoration:underline;color:var(--jb-accent)">🟢 Watch</span></div>
              <label class="jb-switch"><input type="checkbox" id="jb-notify-ready"> 🔔 Alerts</label>
              <label class="jb-switch"><input type="checkbox" id="jb-auto-travel" ${st.autoTravel?'checked':''}> ✈️ Auto Travel</label>
              <label class="jb-switch"><input type="checkbox" id="jb-auto-dtmlist" ${st.autoDtmList?'checked':''}> 📋 DTM List</label>
            </div>
          </div>
        </div>
      </div>

      <div class="jb-jail-counter" id="jb-jail-counter-row" style="display:flex;justify-content:space-between;align-items:center;padding:3px 10px;font-size:10px;border-top:1px solid var(--jb-border);color:var(--jb-text-ter)">
        <span>⛓️ Jail attempts today:</span>
        <span id="jb-jail-count" style="font-weight:600">0/2000</span>
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
            <div class="jb-sect-title">Login</div>
            <div class="jb-mb">
              <label class="jb-label">Username</label>
              <input class="jb-input" id="jb-login-user" value="${LOGIN.user}">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Password</label>
              <input class="jb-input" id="jb-login-pass" type="text" value="${LOGIN.pass}">
            </div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-auto-submit" ${LOGIN.autoSubmit?'checked':''}> Auto-submit</label>

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
            <div class="jb-sub jb-mb">Today: <span id="jb-jail-count-settings">${getJailCount()}/${cfg.jailDailyLimit}</span> · resets 00:00 game time
              <button class="jb-btn jb-btn-outline" id="jb-jail-reset" style="margin-left:6px;padding:1px 6px;font-size:9px">Reset now</button>
            </div>

            <hr class="jb-sep">
            <div class="jb-sect-title">Health</div>
            <div class="jb-row">
              <label class="jb-label">Min %:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-min-hp" value="${cfg.minHealth}" min="1" max="99">
              <label class="jb-label">Target %:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-target-hp" value="${cfg.targetHealth}" min="10" max="100">
            </div>

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
            <div class="jb-sect-title">Telegram</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-tg-on" ${tg.enabled?'checked':''}> Enable</label>
            <div class="jb-mb">
              <label class="jb-label">Bot Token</label>
              <input class="jb-input" id="jb-tg-token" value="${tg.token}" placeholder="From @BotFather">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Chat ID</label>
              <input class="jb-input" id="jb-tg-chat" value="${tg.chat}" placeholder="From @userinfobot">
            </div>
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
            <div class="jb-sect-title">Logout Alerts</div>
            <div class="jb-grid jb-mb">
              <label class="jb-switch"><input type="checkbox" id="jb-lo-flash" ${logoutAlert.tabFlash?'checked':''}> Tab Flash</label>
              <label class="jb-switch"><input type="checkbox" id="jb-lo-notify" ${logoutAlert.notify?'checked':''}> Browser Notify</label>
            </div>

            <hr class="jb-sep">
            <div class="jb-sect-title">Advanced</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-resume" ${resume.on?'checked':''}> Auto-Resume</label>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-stats-on" ${stats.on?'checked':''}> Stats Collection</label>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-noxp-on" ${cfg.noXpLimiterOn?'checked':''}> 📉 No-XP daily limiter</label>
            <div class="jb-row jb-mb">
              <label class="jb-label">No-XP streak limit:</label>
              <input class="jb-input jb-input-sm" type="number" id="jb-noxp-streak" value="${cfg.noXpStreakLimit}" min="2" max="20">
            </div>
            <div class="jb-sub jb-mb" style="color:var(--jb-text-ter);font-size:9px">If an action gains no XP this many times in a row, it's treated as the game's daily cap and disabled until the next game-day.</div>

            <hr class="jb-sep">
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
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-sleep-logout" ${breaks.sleepLogout?'checked':''}> Logout on sleep</label>
            <div class="jb-sub jb-mb" style="color:var(--jb-warning)">⚠️ Health is monitored during coffee/lunch breaks. With "Logout on sleep" ON, no health monitoring while logged out overnight.</div>
            <div class="jb-sub jb-mb" id="jb-break-status">Break status: ${getBreakStatus().msg||'None active'}</div>

            <hr class="jb-sep">
            <div class="jb-row">
              <button class="jb-btn jb-btn-danger" id="jb-reset-all">Reset All</button>
              <button class="jb-btn jb-btn-outline" id="jb-clear-player">Clear Player</button>
            </div>
          </div>
        </div>
      </div>

      <div class="jb-modal-bg" id="jb-wl-backdrop" style="display:none"></div>
      <div class="jb-modal" id="jb-wl-modal">
        <div class="jb-modal-content" style="width:280px">
          <div class="jb-modal-head"><span>OC/DTM Whitelist</span><button class="jb-hbtn" id="jb-wl-close">✕</button></div>
          <div class="jb-modal-body">
            <div class="jb-sub jb-mb">Only accept invites from these players. Empty = accept all.</div>
            <div id="jb-wl-entries"></div>
            <button class="jb-btn jb-btn-outline" id="jb-wl-add" style="width:100%;margin-top:6px">+ Add Player</button>
            <button class="jb-btn" id="jb-clear-cd" style="width:100%;margin-top:6px;background:var(--jb-warning)">Clear Cooldowns</button>
          </div>
        </div>
      </div>

      <div class="jb-modal" id="jb-ow-modal">
        <div class="jb-modal-content" style="width:320px">
          <div class="jb-modal-head"><span>🟢 Online Watch</span><button class="jb-hbtn" id="jb-ow-close">✕</button></div>
          <div class="jb-modal-body">
            <div class="jb-sub jb-mb">Watch up to 10 players. Alerts when they come online.</div>
            <label class="jb-switch jb-mb"><input type="checkbox" id="jb-ow-modal-on" ${ow.on?'checked':''}> Enabled</label>
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
            <div id="jb-ow-list"></div>
            <div class="jb-row" style="margin-top:6px">
              <input class="jb-input" id="jb-ow-name" maxlength="40" placeholder="Player name" style="flex:1">
              <button class="jb-btn" id="jb-ow-add">+ Add</button>
            </div>
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
              <input class="jb-input" id="jb-oc-trans" value="${st.ocTrans}" placeholder="Username">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Weapon Master</label>
              <input class="jb-input" id="jb-oc-weapon" value="${st.ocWeapon}" placeholder="Username">
            </div>
            <div class="jb-mb">
              <label class="jb-label">Explosive Expert</label>
              <input class="jb-input" id="jb-oc-explo" value="${st.ocExplo}" placeholder="Username">
            </div>
            <hr class="jb-sep">
            <label class="jb-label">Schedule</label>
            <input class="jb-input jb-mb" type="datetime-local" id="jb-oc-sched" value="${st.ocSched||''}" style="color-scheme:dark">
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
            <div class="jb-sub jb-mb">Set your DTM partner. You are the leader.</div>
            <div class="jb-mb">
              <label class="jb-label">Partner</label>
              <input class="jb-input" id="jb-dtm-partner" value="${st.dtmPartner}" placeholder="Username">
            </div>
            <hr class="jb-sep">
            <label class="jb-label">Schedule</label>
            <input class="jb-input jb-mb" type="datetime-local" id="jb-dtm-sched" value="${st.dtmSched||''}" style="color-scheme:dark">
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
            <div id="jb-xp-hist" style="background:var(--jb-surface-alt);border-radius:4px;padding:6px;max-height:140px;overflow-y:auto;font-size:10px"></div>

            <button class="jb-btn jb-btn-danger" id="jb-xp-reset" style="width:100%;margin-top:8px">Reset XP Session</button>
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
    crimeEl.innerHTML = CRIMES.map(c => `<label class="jb-switch"><input type="checkbox" class="jb-crime-cb" value="${c.id}" ${st.crimes.includes(c.id)?'checked':''}> ${c.name}</label>`).join('');

    const gtaEl = _shadow.querySelector('#jb-gta-opts');
    gtaEl.innerHTML = GTAS.map(g => `<label class="jb-switch"><input type="checkbox" class="jb-gta-cb" value="${g.id}" ${st.gtas.includes(g.id)?'checked':''}> ${g.name}</label>`).join('');

    // Ribbon toggles — use CSS vars for theme-aware colours
    const ribbonMap = { 'jb-r-crime':'crime','jb-r-gta':'gta','jb-r-booze':'booze','jb-r-jail':'jail','jb-r-health':'health','jb-r-garage':'garage','jb-r-oc':'autoOC','jb-r-dtm':'autoDTM' };
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
    function syncAll() {
      const allOn = st.crime && st.gta && st.booze && st.jail && st.health && st.garage;
      allCb.checked = allOn;
      allLabel.textContent = allOn ? 'ALL ON' : 'ALL OFF';
      allLabel.style.color = allOn ? 'var(--jb-success)' : 'var(--jb-danger)';
    }
    syncAll();
    allCb.addEventListener('change', () => {
      const v = allCb.checked;
      st.crime=v; st.gta=v; st.booze=v; st.jail=v; st.health=v; st.garage=v; st.autoOC=v; st.autoDTM=v;
      saveSt(); syncAll();
      for (const [id, key] of Object.entries(ribbonMap)) {
        const btn = _shadow.querySelector(`#${id}`);
        if (btn) {
          btn.style.background = st[key] ? 'var(--jb-ribbon-on)' : 'var(--jb-ribbon-off)';
          btn.style.color = st[key] ? 'var(--jb-ribbon-on-text)' : 'var(--jb-ribbon-off-text)';
        }
      }
    });

    // Cadence mode switch (Away = camouflage / At PC = fast). Re-rolls pending
    // delays on flip so the new mode takes effect immediately.
    const awayCb = _shadow.querySelector('#jb-away-mode');
    if (awayCb) awayCb.addEventListener('change', e => {
      cfg.awayMode = e.target.checked;
      GM_setValue('cbAwayMode', cfg.awayMode);
      rerollCadence();
      const lbl = _shadow.querySelector('#jb-away-label');
      if (lbl) lbl.textContent = cfg.awayMode ? 'Away (camo)' : 'At PC (fast)';
      setStatus(cfg.awayMode ? 'Away mode — max camouflage' : 'At-PC mode — fast');
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

    _shadow.querySelector('#jb-create-oc').checked = st.createOC;
    _shadow.querySelector('#jb-create-oc').addEventListener('change', e => { st.createOC = e.target.checked; saveSt(); if(st.createOC && !getHot()) fetchHot(); });

    _shadow.querySelector('#jb-ow-on').checked = ow.on;
    _shadow.querySelector('#jb-ow-on').addEventListener('change', e => { ow.on = e.target.checked; saveOw(); owStart(); });

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

    // Theme toggle — cycles: dark → light → classic → dark
    const THEME_ORDER = ['dark', 'light', 'classic'];
    const THEME_ICONS = { dark: '◑', light: '☀', classic: '🟢' };
    const themeBtn = _shadow.querySelector('#jb-theme-btn');
    themeBtn.textContent = THEME_ICONS[activeTheme] || '◑';
    themeBtn.addEventListener('click', () => {
      const idx = THEME_ORDER.indexOf(activeTheme);
      const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
      setTheme(next);
      themeBtn.textContent = THEME_ICONS[next] || '◑';
      // Re-apply ribbon button colours
      for (const [id, key] of Object.entries(ribbonMap)) {
        const btn = _shadow.querySelector(`#${id}`);
        if (btn) {
          const isOn = st[key];
          btn.style.background = isOn ? 'var(--jb-ribbon-on)' : 'var(--jb-ribbon-off)';
          btn.style.color = isOn ? 'var(--jb-ribbon-on-text)' : 'var(--jb-ribbon-off-text)';
        }
      }
    });

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
    function openModal() { paused = true; modal.classList.add('open'); backdrop.style.display = 'block'; }
    function closeModal() { modal.classList.remove('open'); backdrop.style.display = 'none'; paused = false; saveSt(); }
    _shadow.querySelector('#jb-settings-btn').addEventListener('click', openModal);
    _shadow.querySelector('#jb-modal-close').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    // Settings inputs
    _shadow.querySelector('#jb-login-user').addEventListener('input', e => { LOGIN.user = e.target.value.trim(); GM_setValue('cbLoginUser', LOGIN.user); });
    _shadow.querySelector('#jb-login-pass').addEventListener('input', e => { LOGIN.pass = e.target.value.trim(); GM_setValue('cbLoginPass', LOGIN.pass); });
    _shadow.querySelector('#jb-auto-submit').addEventListener('change', e => { LOGIN.autoSubmit = e.target.checked; GM_setValue('cbAutoSubmit', LOGIN.autoSubmit); });

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
    _shadow.querySelector('#jb-tg-test').addEventListener('click', testTg);

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
    const noXpCb = _shadow.querySelector('#jb-noxp-on');
    if (noXpCb) noXpCb.addEventListener('change', e => { cfg.noXpLimiterOn = e.target.checked; GM_setValue('cbNoXpLimiterOn', cfg.noXpLimiterOn); setStatus(cfg.noXpLimiterOn?'No-XP limiter on':'No-XP limiter off'); });
    const noXpStreak = _shadow.querySelector('#jb-noxp-streak');
    if (noXpStreak) noXpStreak.addEventListener('change', e => { cfg.noXpStreakLimit = Math.max(2,Math.min(20,parseInt(e.target.value)||5)); GM_setValue('cbNoXpStreakLimit', cfg.noXpStreakLimit); });

    // Reset/clear
    _shadow.querySelector('#jb-reset-all').addEventListener('click', () => {
      if (confirm('Reset ALL settings?')) {
        localStorage.removeItem('cbMaster'); localStorage.removeItem('cbHeartbeat');
        const keys = ['cbAutoCrime','cbAutoGta','cbAutoJail','cbAutoBooze','cbLastCrime','cbLastGta','cbLastJail','cbLastBooze','cbSelCrimes','cbSelGtas','cbPlayer','cbInJail','cbAction','cbPending','cbAutoOC','cbAutoDTM','cbAutoHealth','cbAutoGarage','cbAutoCrusher','cbCrusherOwned','cbLastGarage','cbLastHealth','cbLastJailCk','cbBuyHealth','cbMinimized','cbRefresh','cbTheme','cbNotifyReady','cbWhitelist','cbWlNames','cbCarCats','cbCreateOC','cbOcTrans','cbOcWeapon','cbOcExplo','cbOcSched','cbOcType','cbOcRepeat','cbOcLeft'];
        keys.forEach(k => GM_setValue(k, undefined));
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
    }, 5000);

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
    _shadow.querySelector('#jb-clear-cd').addEventListener('click', () => {
      localStorage.removeItem(LS_LAST_DTM_ACC); localStorage.removeItem(LS_LAST_OC_ACC);
      localStorage.removeItem(LS_LAST_DTM_MAIL); localStorage.removeItem(LS_LAST_OC_MAIL);
      localStorage.removeItem('cbPendDtmHandle'); localStorage.removeItem('cbPendOcHandle');
      localStorage.removeItem(LS_PEND_DTM); localStorage.removeItem(LS_PEND_OC);
      setStatus('Cooldowns cleared');
    });

    // Online Watch modal
    _shadow.querySelector('#jb-ow-on').addEventListener('change', e => { ow.on = e.target.checked; saveOw(); owStart(); });
    const owModalOn = _shadow.querySelector('#jb-ow-modal-on');
    if (owModalOn) owModalOn.addEventListener('change', e => {
      ow.on = e.target.checked; saveOw(); owStart();
      const main = _shadow.querySelector('#jb-ow-on'); if(main) main.checked = ow.on;
    });
    _shadow.querySelector('#jb-ow-close').addEventListener('click', () => closeModal2('#jb-ow-modal'));
    _shadow.querySelector('#jb-ow-sec').addEventListener('change', e => { ow.sec = Math.max(OW_MIN_SEC,Math.min(3600,parseInt(e.target.value)||OW_DEF_SEC)); saveOw(); owStart(); });
    _shadow.querySelector('#jb-ow-notify').addEventListener('change', e => { ow.notify = e.target.checked; saveOw(); if(ow.notify) askNotifyPerm(); });
    _shadow.querySelector('#jb-ow-flash').addEventListener('change', e => { ow.flash = e.target.checked; saveOw(); });
    _shadow.querySelector('#jb-ow-sound').addEventListener('change', e => { ow.sound = e.target.checked; saveOw(); });
    _shadow.querySelector('#jb-ow-tg').addEventListener('change', e => { ow.telegram = e.target.checked; saveOw(); });
    _shadow.querySelector('#jb-ow-offnotify').addEventListener('change', e => { ow.notifyOff = e.target.checked; saveOw(); });
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
      const mainCb = _shadow.querySelector('#jb-ow-on'); if(mainCb) mainCb.checked = ow.on;
      const modalCb = _shadow.querySelector('#jb-ow-modal-on'); if(modalCb) modalCb.checked = ow.on;
      const listEl = _shadow.querySelector('#jb-ow-list');
      if (listEl) {
        if (!ow.list.length) { listEl.innerHTML = '<div class="jb-sub">No watched players.</div>'; }
        else {
          listEl.innerHTML = ow.list.map(name => {
            const k = normName(name), on = !!ow.lastOn[k];
            return `<div class="jb-row" style="font-size:11px;padding:3px;background:var(--jb-surface-alt);border-radius:2px;margin-bottom:3px">
              <span style="color:${on?'var(--jb-success)':'var(--jb-text-ter)'}">●</span>
              <span style="flex:1">${esc(name)} <span class="jb-sub">(${on?'Online':'Offline'})</span></span>
              <button class="jb-btn jb-btn-danger jb-ow-rm" data-name="${esc(name)}" style="padding:1px 5px;font-size:10px">✕</button>
            </div>`;
          }).join('');
          listEl.querySelectorAll('.jb-ow-rm').forEach(btn => btn.addEventListener('click', () => owRemove(btn.getAttribute('data-name'))));
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

    // Drag
    let locked = GM_getValue('cbLocked', true);
    let posX = GM_getValue('cbPosX', null), posY = GM_getValue('cbPosY', null);
    if (posX !== null && posY !== null) { host.style.right = 'auto'; host.style.left = posX+'px'; host.style.top = posY+'px'; }
    const lockBtn = _shadow.querySelector('#jb-lock-btn');
    const dragH = _shadow.querySelector('#jb-drag');
    function updLock() { lockBtn.textContent = locked ? '🔒' : '🔓'; dragH.style.cursor = locked ? 'default' : 'grab'; }
    updLock();
    lockBtn.addEventListener('click', e => { e.stopPropagation(); locked = !locked; GM_setValue('cbLocked', locked); updLock(); });
    let dragging = false, dx, dy, hx, hy;
    dragH.addEventListener('mousedown', e => {
      if (locked || e.target.closest('.jb-hbtn')) return;
      dragging = true; dragH.style.cursor = 'grabbing';
      const rect = host.getBoundingClientRect(); hx = rect.left; hy = rect.top; dx = e.clientX; dy = e.clientY;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => { if (!dragging) return; host.style.right='auto'; host.style.left=(hx+e.clientX-dx)+'px'; host.style.top=(hy+e.clientY-dy)+'px'; });
    document.addEventListener('mouseup', () => { if (!dragging) return; dragging = false; dragH.style.cursor = locked?'default':'grab'; const r = host.getBoundingClientRect(); GM_setValue('cbPosX',r.left); GM_setValue('cbPosY',r.top); });
  }


  /* === AUTO TRAVEL TO HOT CITY & DTM LIST === */

  const OCADS_PATH = '/authenticated/ocads.aspx';
  const LS_DTM_LIST_DONE = 'cbDtmListDone';
  const LS_TRAVEL_PENDING = 'cbTravelPending';

  // Check if we're currently in the hot city
  function isInHot() {
    const hot = getHot();
    if (!hot) return false;
    const cur = getCurCity();
    if (!cur) return false;
    return cur.toLowerCase().includes(hot.toLowerCase()) || hot.toLowerCase().includes(cur.toLowerCase());
  }

  // Auto-travel to hot city via the travel page
  async function doAutoTravel() {
    if (!st.autoTravel || st.inJail || st.acting || paused) return false;

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

      // Find the radio button matching the hot city by label text
      const radios = [...document.querySelectorAll('input[type=radio][name="ctl00$main$citieslist"]')];
      let cityRadio = null;
      for (const r of radios) {
        const label = (r.parentElement?.textContent || r.closest('td,tr,label')?.textContent || '').toLowerCase();
        if (label.includes(hotLower)) { cityRadio = r; break; }
      }

      if (!cityRadio) {
        console.log('[JB][TRAVEL] Could not find radio for hot city:', hotCity);
        localStorage.removeItem(LS_TRAVEL_PENDING);
        return false;
      }

      cityRadio.checked = true;
      try { cityRadio.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
      console.log('[JB][TRAVEL] Selected city radio:', cityRadio.id, '(value:', cityRadio.value, ')');

      // Wait briefly, then click travel button — jet if DTM is close to ready, otherwise normal
      setTimeout(() => {
        // Decide jet vs normal: if DTM cooldown < 40 min, use jet (20 min cooldown vs 45 min)
        const dtm = getDtm();
        const dtmMinsLeft = dtm && !dtm.ready ? Math.ceil((dtm.total||0)/60) : 999;
        const useJet = dtmMinsLeft < 40;

        const btnId = useJet ? 'ctl00_main_btnTravelPrivate' : 'ctl00_main_btnTravelNormal';
        const travelBtn = document.getElementById(btnId) ||
                         (useJet
                           ? [...document.querySelectorAll('input[type="submit"]')].find(b => /private\s*jet/i.test(b.value||''))
                           : [...document.querySelectorAll('input[type="submit"]')].find(b => /^travel\s*\(normal\)/i.test(b.value||'')));

        if (travelBtn && !travelBtn.disabled) {
          console.log(`[JB][TRAVEL] DTM in ${dtmMinsLeft}m — using ${useJet?'JET (20m cd)':'NORMAL (45m cd)'}`);
          st.acting = true; st.action = 'travel';
          GM_setValue('cbActStart', Date.now());
          travelBtn.click();

          setTimeout(() => {
            localStorage.removeItem(LS_TRAVEL_PENDING);
            st.acting = false; st.action = '';
            GM_setValue('cbActStart', 0);
            // Set correct cooldown: jet=20min, normal=45min
            const cooldown = useJet ? 20*60 : 45*60;
            storeTravel({ cd: cooldown, canNormal: false, at: Date.now() });
            saveSt();
            const mode = useJet ? '🛩️ Jet' : '✈️ Plane';
            tgMsg('travel', `${mode} <b>Traveled</b>\n${st.player||'?'} → ${hotCity}${useJet?` | DTM in ${dtmMinsLeft}m`:''}`);
            setStatus(`${mode} → ${hotCity}`);
            // Navigate away after travel completes
            setTimeout(() => {
              window.location.href = '/authenticated/crimes.aspx?' + Date.now();
            }, 1500);
          }, 2000);
        } else {
          console.log('[JB][TRAVEL] Travel button not found or disabled:', btnId);
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
  const xpState = {
    total:        GM_getValue('cbXpTotal', 0),
    sessionGain:  GM_getValue('cbXpSessionGain', 0),
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
    try { updateXpUI(); } catch(_){}
  }

  const xpNoGainStreak = {};
  XP_ACTIONS.forEach(a => { xpNoGainStreak[a] = GM_getValue('cbXpStreak_'+a, 0); });

  function saveXpState() {
    GM_setValue('cbXpTotal', xpState.total);
    GM_setValue('cbXpSessionGain', xpState.sessionGain);
    GM_setValue('cbXpSessionStart', xpState.sessionStart);
    GM_setValue('cbXpPerAction', xpState.perAction);
    GM_setValue('cbXpHistory', xpState.history);
    GM_setValue('cbXpSamples', xpState.samples);
  }

  function resetXpSession() {
    xpState.sessionGain = 0;
    xpState.sessionStart = Date.now();
    XP_ACTIONS.forEach(a => { xpState.perAction[a] = 0; });
    xpState.history = [];
    xpState.samples = xpState.total > 0 ? [{ t: Date.now(), total: xpState.total }] : [];
    saveXpState();
    updateXpUI();
  }

  // Record which action just fired so the next XP gain can be attributed to it.
  function snapshotXP(action) {
    const snap = { action, t: Date.now() };
    GM_setValue('cbXpSnapshot', snap);
    GM_setValue('cbXpStreakSnap', snap);
  }

  // Called by the API interceptor whenever a fresh Experience value is seen.
  function onExperienceRead(rawXp) {
    const xp = parseFloat(rawXp);
    if (!Number.isFinite(xp) || xp <= 0) return;

    const prev = xpState.total;
    if (prev === 0) {
      xpState.total = xp;
      xpState.samples.push({ t: Date.now(), total: xp });
      if (xpState.samples.length > 400) xpState.samples.shift();
      saveXpState();
      updateXpUI();
      return;
    }
    if (xp === prev) { maybeFeedNoXpLimiter(false); return; }
    if (xp < prev)  { xpState.total = xp; saveXpState(); return; }

    const gained = parseFloat((xp - prev).toFixed(4));
    xpState.total = xp;
    xpState.sessionGain = parseFloat((xpState.sessionGain + gained).toFixed(4));

    const snap = GM_getValue('cbXpSnapshot', null);
    let action = 'other';
    if (snap && snap.action && (Date.now() - snap.t) < 90000) {
      action = snap.action;
      GM_setValue('cbXpSnapshot', null);
    }
    if (typeof xpState.perAction[action] !== 'number') xpState.perAction[action] = 0;
    xpState.perAction[action] = parseFloat((xpState.perAction[action] + gained).toFixed(4));

    xpState.history.unshift({ t: Date.now(), gained, action, icon: ACTION_ICON[action] || '⚡', total: xp });
    if (xpState.history.length > 40) xpState.history.pop();

    xpState.samples.push({ t: Date.now(), total: xp });
    if (xpState.samples.length > 400) xpState.samples.shift();

    saveXpState();
    maybeFeedNoXpLimiter(true);
    updateXpUI();

    const mins = (Date.now() - xpState.sessionStart) / 60000;
    const rate = mins >= 2 ? ((xpState.sessionGain / mins) * 60).toFixed(1) : '…';
    console.log(`${APP_TAG}[XP] +${gained} [${ACTION_ICON[action]||''}${action}] | session +${xpState.sessionGain} | total ${xp.toFixed(2)} | ${rate}/hr`);
  }

  function maybeFeedNoXpLimiter(gained) {
    if (!cfg.noXpLimiterOn) return;
    const snap = GM_getValue('cbXpStreakSnap', null);
    const action = (snap && snap.action && (Date.now() - snap.t) < 90000) ? snap.action : null;
    if (!action || !XP_ACTIONS.includes(action)) return;

    if (gained) {
      xpNoGainStreak[action] = 0;
      GM_setValue('cbXpStreak_'+action, 0);
      return;
    }
    xpNoGainStreak[action] = (xpNoGainStreak[action] || 0) + 1;
    GM_setValue('cbXpStreak_'+action, xpNoGainStreak[action]);
    console.log(`${APP_TAG}[XP] ${action} no-XP streak: ${xpNoGainStreak[action]}/${cfg.noXpStreakLimit}`);
    if (xpNoGainStreak[action] >= cfg.noXpStreakLimit) {
      disableActionForDay(action);
      xpNoGainStreak[action] = 0;
      GM_setValue('cbXpStreak_'+action, 0);
    }
  }

  function disableActionForDay(action) {
    GM_setValue('cbXpCapDay_'+action, gameDayStr());
    GM_setValue('cbXpCapWasOn_'+action, !!st[action]);
    if (action in st) { st[action] = false; saveSt(); }
    console.log(`${APP_TAG}[XP] ${action} hit no-XP cap — disabled until next game-day`);
    tgMsg('jail', `🛑 <b>${(ACTION_ICON[action]||'')+action.toUpperCase()} capped</b>\n${st.player||'?'} | no XP ×${cfg.noXpStreakLimit}, off till tomorrow`);
  }

  function checkXpCapResets() {
    if (!cfg.noXpLimiterOn) return;
    const today = gameDayStr();
    XP_ACTIONS.forEach(action => {
      const capDay = GM_getValue('cbXpCapDay_'+action, '');
      if (capDay && capDay !== today) {
        GM_setValue('cbXpCapDay_'+action, '');
        const wasOn = GM_getValue('cbXpCapWasOn_'+action, true);
        if (action in st && wasOn) { st[action] = true; saveSt(); }
        console.log(`${APP_TAG}[XP] ${action} no-XP cap reset — re-enabled (new game-day)`);
      }
    });
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
              if (xp !== undefined && xp !== null) onExperienceRead(xp);
            } catch (e) { /* non-JSON / partial — ignore */ }
          }
        });
      }
      return origSend.apply(this, args);
    };
    console.log(`${APP_TAG}[XP] API interceptor installed`);
  }

  /* === WATCHDOG — self-healing main loop === */

  const WATCHDOG_TIMEOUT = 60000; // restart only if loop hasn't ticked in 60s (well beyond any normal interval)
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
      if (paused || inLock || inBreak) { _watchdogRestarts = 0; return; }

      // Only restart if genuinely stalled well beyond any normal loop interval
      if (elapsed > WATCHDOG_TIMEOUT) {
        _watchdogRestarts++;
        console.warn(`[JB][WATCHDOG] Loop stalled ${Math.round(elapsed/1000)}s — restart #${_watchdogRestarts}`);
        if (_watchdogRestarts <= 3) {
          st.acting = false; st.action = ''; GM_setValue('cbActStart', 0); saveSt();
          _lastLoopTick = Date.now(); // mark so we don't immediately re-fire
          setTimeout(mainLoop, 500);
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

  function startKeepAlive() {
    if (_keepAliveIv) clearInterval(_keepAliveIv);
    _keepAliveIv = setInterval(() => {
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
    if (!st.dtmPartner.trim()) {
      tgOnce('dtm_no_partner', 3600, `⚠️ <b>DTM</b> — partner not set`);
      return;
    }
    // Clear throttle flags once we actually proceed
    localStorage.removeItem('cbTgOnce_dtm_skip_city');
    localStorage.removeItem('cbTgOnce_dtm_no_partner');

    tgMsg('dtmCreate', `🚚 <b>DTM Setup</b>\n${st.player||'?'} | Partner: ${st.dtmPartner}`);
    localStorage.setItem(LS_CREATE_DTM_STATE, 'setup');
    localStorage.setItem(LS_CREATE_DTM_STEP, '0');
    localStorage.setItem(LS_CREATE_DTM_NEXT, String(Date.now()));

    const onDtm = /\/authenticated\/organizedcrime\.aspx/i.test(location.pathname) && /p=dtm/i.test(location.search);
    if (onDtm) setTimeout(() => handleCreateDTM(), 600);
    else window.location.href = DTM_PAGE + '&_=' + Date.now();
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
    const partner = st.dtmPartner.trim();

    // Keep other automation blocked while we work the DTM creation
    st.acting = true; st.action = 'dtm-create'; GM_setValue('cbActStart', Date.now());

    try {
      // POLLING: Check if "Complete DTM" or "Buy drugs" is ready
      if (dtmSt === 'polling') {
        // Check for complete button
        const compBtn = document.getElementById('ctl00_main_btnCompleteDTM') ||
          [...document.querySelectorAll('input[type="submit"]')].find(b => /complete/i.test(b.value||''));
        if (compBtn && !compBtn.disabled) {
          await wait(rndDelay(DLY.normal));
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
        if (!partner) { resetCreateDTM(); return false; }
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
        nameIn.value = partner;
        // Fire events so ASP.NET registers the typed value before postback
        try { nameIn.dispatchEvent(new Event('input', {bubbles:true})); nameIn.dispatchEvent(new Event('change', {bubbles:true})); nameIn.dispatchEvent(new Event('keyup', {bubbles:true})); } catch(_){}
        await wait(rndDelay(DLY.normal));
        console.log('[JB][CreateDTM] Entered partner:', partner, 'in', nameIn.id, '— clicking', invBtn.id||invBtn.value);
        tgMsg('dtmCreate', `🚚 <b>DTM 2/3</b>\n${st.player||'?'} | Invited ${partner}`);
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
    const wasMaster = tabs.isMaster;
    tabs.check();

    if (!tabs.isMaster) {
      if (wasMaster) console.log(APP_TAG, 'Lost master');
      setStatus('⏸ Secondary tab');
      setTimeout(mainLoop, 3000); return;
    }

    if (paused) { setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400)); return; }

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
        setTimeout(mainLoop, 2500); return;
      }
    }

    // Break system checks — highest priority (health already handled above)
    if (handleSleep()) {
      setStatus(getBreakStatus().msg);
      setTimeout(mainLoop, 30000); return;
    }
    coffeeJustEnded(); lunchJustEnded(); // clear ended breaks
    if (isCoffeeTime()) {
      const bs = getBreakStatus();
      setStatus(bs.msg);
      setTimeout(mainLoop, 10000); return;
    }
    if (isLunchTime()) {
      const bs = getBreakStatus();
      setStatus(bs.msg);
      setTimeout(mainLoop, 10000); return;
    }

    checkCaptcha(); checkNewMsgs(); checkLogout();

    if (checkSqlCheck()) {
      paused = true; setStatus('⚠️ STAFF CHECK — paused');
      setTimeout(mainLoop, 10000); return;
    }

    checkStuck();

    if (isOnCaptcha()) {
      if (resume.on) { setStatus('Script Check — monitoring...'); localStorage.setItem('cbScriptCheck','1'); startScMonitor(); }
      else setStatus('Script Check — paused');
      setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400)); return;
    } else {
      if (localStorage.getItem('cbScriptCheck') === '1') { localStorage.removeItem('cbScriptCheck'); _scActive = false; }
    }

    if (!st.player) { getPlayerName(); setTimeout(mainLoop, 3000); return; }

    checkJailAny();

    if (handleOcPage()) { setTimeout(mainLoop, 3000); return; }
    if (handleDtmPage()) { setTimeout(mainLoop, 3000); return; }

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
        if (onOc) { try { if (await handleCreateOC()) { setTimeout(mainLoop, 3000); return; } } catch(_){} }
        else {
          const next = parseInt(localStorage.getItem(LS_OC_NEXT)||'0',10);
          if (next > 0 && Date.now() >= next && !st.acting) { window.location.href = OC_PATH+'?'+Date.now(); setTimeout(mainLoop, 5000); return; }
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
        if (onDtm) { try { if (await handleCreateDTM()) { setTimeout(mainLoop, 3000); return; } } catch(_){} }
        else {
          const next = parseInt(localStorage.getItem(LS_CREATE_DTM_NEXT)||'0',10);
          if (next > 0 && Date.now() >= next && !st.acting) { window.location.href = DTM_PAGE+'&_='+Date.now(); setTimeout(mainLoop, 5000); return; }
        }
      }
    }

    // Auto-travel to hot city and DTM list (priority after OC/DTM creation, before invites)
    if (!st.inJail && !st.acting) {
      checkDtmListReset();

      // Auto-travel: if we need to be in hot city (for DTM list or OC creation)
      if (st.autoTravel) {
        const handled = await doAutoTravel();
        if (handled) { setTimeout(mainLoop, 3000); return; }
      }

      // Auto-add to DTM list: in hot city + DTM ready
      if (st.autoDtmList) {
        const handled = await doAutoAddDtmList();
        if (handled) { setTimeout(mainLoop, 3000); return; }
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
      if (onMail || (Date.now() - lastMail > MAIL_INT_MS)) {
        localStorage.setItem('cbLastMailTs', String(Date.now()));
        try { await checkMail(); } catch(_){}
        if (localStorage.getItem(LS_PEND_DTM) || localStorage.getItem(LS_PEND_OC)) { setTimeout(mainLoop, 500); return; }
      }
    }

    try { checkReadyAlerts(); } catch(_){}

    if (st.health && !st.acting) {
      checkHealth();
      if (st.buyHealth) { setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400)); return; }
    }

    if (!st.acting) {
      const now = Date.now();
      const pg = curPage();

      if (!st.crime && !st.gta && !st.booze && !st.jail && !st.garage && !st.health && !st.autoOC && !st.autoDTM) {
        if (now % 30000 < 2000) setStatus('Idle');
        setTimeout(mainLoop, 5000); return;
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
          if (st.pending === 'crime' && st.crime) { if(pg==='crimes') doCrime(); else safeNav('/authenticated/crimes.aspx?'+Date.now()); setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400)); return; }
          if (st.pending === 'gta' && st.gta) { if(pg==='gta') doGta(); else safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400)); return; }
          if (st.pending === 'booze' && st.booze) { if(pg==='booze') doBooze(); else safeNav('/authenticated/crimes.aspx?p=b&'+Date.now()); setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400)); return; }
          st.pending = ''; saveSt();
        }

        const garageOd = st.garage && (now - st.lastGarage >= cfg.garageInt*1000);
        if (garageOd && pg === 'garage') doGarage();

        const crimeRdy = st.crime && (now - st.lastCrime >= cfg.crimeInt*1000);
        const gtaRdy   = st.gta   && (now - st.lastGta >= cfg.gtaInt*1000);
        const boozeRdy = st.booze && (now - st.lastBooze >= cfg.boozeInt*1000);
        const jailRdy  = st.jail  && (now - st.lastJail >= cfg.jailInt*1000);
        const garageRdy= st.garage && (now - st.lastGarage >= cfg.garageInt*1000);

        if (crimeRdy && gtaRdy) {
          const ct = st.lastCrime+cfg.crimeInt*1000, gt = st.lastGta+cfg.gtaInt*1000;
          if (ct <= gt) { if(pg==='crimes') doCrime(); else safeNav('/authenticated/crimes.aspx?'+Date.now()); }
          else { if(pg==='gta') doGta(); else safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); }
        } else if (crimeRdy) { if(pg==='crimes') doCrime(); else safeNav('/authenticated/crimes.aspx?'+Date.now()); }
        else if (gtaRdy) { if(pg==='gta') doGta(); else safeNav('/authenticated/crimes.aspx?p=g&'+Date.now()); }
        else if (boozeRdy) { if(pg==='booze') doBooze(); else safeNav('/authenticated/crimes.aspx?p=b&'+Date.now()); }
        else if (jailRdy) { if(pg==='jail') doJailbreak(); else safeNav('/authenticated/jail.aspx?'+Date.now()); }
        else if (garageRdy) { if(pg==='garage') doGarage(); else safeNav('/authenticated/playerproperty.aspx?p=g&'+Date.now()); }
        else {
          const cr = Math.max(0, Math.ceil((cfg.crimeInt*1000-(now-st.lastCrime))/1000));
          const gr = Math.max(0, Math.ceil((cfg.gtaInt*1000-(now-st.lastGta))/1000));
          const br = Math.max(0, Math.ceil((cfg.boozeInt*1000-(now-st.lastBooze))/1000));
          const jr = Math.max(0, Math.ceil((cfg.jailInt*1000-(now-st.lastJail))/1000));
          const gar= Math.max(0, Math.ceil((cfg.garageInt*1000-(now-st.lastGarage))/60000));
          setStatus(`C:${cr}s G:${gr}s B:${br}s J:${jr}s Gar:${gar}m`);
        }
      }
    }

    setTimeout(mainLoop, 1800+Math.floor(Math.random()*1400));
  }

  /* === INIT === */

  function init() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); return; }
    tabs.check();
    buildUI();
    try { updateXpUI(); } catch(_){} // paint saved XP/rank straight away so it doesn't blank on load
    installXpInterceptor();
    startTgPump();
    startCriticalPump();
    startTimers();
    owStart();
    startWatchdog();
    startKeepAlive();
    initServerTime();
    try { initHot(); } catch(_){}

    if (tabs.isMaster) setStatus(`${APP_NAME} ${APP_VERSION} — Master tab`);
    else setStatus('⏸ Secondary tab');

    checkJailAny();

    window.addEventListener('beforeunload', () => {
      tabs.release(); owStop();
      if (owFlashTimer) { clearInterval(owFlashTimer); owFlashTimer = null; }
    });

    window.addEventListener('storage', e => {
      if (e.key === LS_MASTER) tabs.check();
    });

    setTimeout(() => { st.lastJailCk = 0; mainLoop(); }, 1500);
  }

  init();

})();
