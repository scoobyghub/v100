# CLAUDE.md — Jarvis Bot

Project context for Claude Code. This is a single-file Tampermonkey userscript, not a
typical repo. Read this fully before editing — several conventions here will bite you
if you don't know them (especially the meta-file mirroring and the version-bump dance).

---

## 1. What this is

**Jarvis Bot** is a large Tampermonkey userscript that automates play in the browser
game **TMN2010** (`tmn2010.net`) — a text/ASP.NET mafia-style game. Scripting is
community-accepted on this game; this is not a stealth/cheat tool against the operators'
wishes, but the game *does* run staff "script checks" that must be answered, and it can
issue soft bans, so human-like behaviour and reliable alerting matter (see §6).

- **Single file**, ~5,800 lines, one big IIFE after a couple of standalone IIFEs at top.
- **Runs on 3 PCs + 1 Samsung tablet**, all **Firefox Beta + Tampermonkey**, all loading
  the **same file** via Tampermonkey auto-update from GitHub. So any change ships to every
  device at once — there is no per-device variation.
- **Current version: `2000.180`.**
- Language/style: **British English throughout**, concise. Author tag is `Jarvis`.

### Deliverables (the two files that actually ship)
- `Jarvis.user.js` — the script.
- `Jarvis.meta.js` — **must be a byte-exact copy of the user.js metadata header block**
  (the `// ==UserScript== … // ==/UserScript==` block). Tampermonkey fetches the meta file
  to detect updates. If it drifts from the header, update detection breaks.

### Repo / hosting
- GitHub: `scoobyghub/v100` (branch `main`).
- `@updateURL`  → `https://raw.githubusercontent.com/scoobyghub/v100/refs/heads/main/Jarvis.meta.js`
- `@downloadURL`→ `https://raw.githubusercontent.com/scoobyghub/v100/refs/heads/main/Jarvis.user.js`
- **Historically there was no version control for the source** beyond what's pushed to that
  repo — treat the repo as the source of truth and commit deliberately.

---

## 2. Critical conventions (read before editing)

### Naming
- `APP_NAME = 'Jarvis Bot'`, `APP_VERSION = '2000.180'`, `APP_TAG = '[JB]'` (console prefix).
- CSS classes are prefixed **`jb-`**. DOM IDs for UI are `jb-…`.
- Persistent storage keys are mostly prefixed **`cb`** (legacy — e.g. `cbCrimeInt`,
  `cbXpTotal`, `cbDly_crime`), with a few **`jb`** keys for the break system
  (e.g. `jbCoffeeNext`). When adding storage, follow the `cb…` convention unless it's break-related.

### Storage layers (all persist across reloads)
- **`GM_getValue`/`GM_setValue`** — Tampermonkey storage. Primary durable store
  (config, XP state, rank state, action delays).
- **`localStorage`** — used for queues and cross-reload flags (Telegram send queue
  `cbTgSendQueue`, critical-alert queue `cbCritAlerts`, dedup buckets `cbSeen_…`,
  page-load watchdog counters).
- **In-memory `st` object** — runtime state, saved to GM via `saveSt()`.

### Version bump + meta rebuild (do this for EVERY release)
The version string appears in **both** `@version` and `const APP_VERSION` and (cosmetically)
in `@name`/`@description`. One sed hits them all because they share the `2000.NNN` token:

```bash
# 1. bump (replace OLD/NEW)
sed -i 's/2000\.179/2000.180/g' Jarvis.user.js

# 2. validate
node -c Jarvis.user.js          # must pass — this is the standard syntax gate

# 3. rebuild meta = exact header (currently 32 lines; re-check if you add @match/@grant/@connect)
head -32 Jarvis.user.js > Jarvis.meta.js

# 4. verify meta mirrors header exactly
diff <(head -32 Jarvis.user.js) Jarvis.meta.js   # must be empty
```

**The header is currently 32 lines and ends at `// ==/UserScript==`.** If you add or remove
any `@match` / `@grant` / `@connect` line, the line count changes — recount before the
`head -N`. Always `diff` to confirm.

### Validation
- `node -c Jarvis.user.js` after every edit. There is no test suite; syntax-clean + manual
  reasoning is the bar. The file is large, so make surgical edits and re-validate often.

### Match rules (don't "tidy" these)
The header has www + non-www + a catch-all `*://*.tmn2010.net/*`. The redundancy is
deliberate — it fixed the script failing to inject on the tablet. Leave it.

### Grants/connects currently present
`GM_setValue`, `GM_getValue`, `GM_addStyle`, `GM_xmlhttpRequest`;
`@connect api.telegram.org`, `@connect raw.githubusercontent.com`.

---

## 3. Architecture map (section markers in the file)

The file is organised by `/* === SECTION === */` banners. Top-level layout:

| Area | Sections |
|---|---|
| **Standalone (outside main IIFE)** | Page-load watchdog, auto-confirm override |
| **Boot/theme/login** | Constants & helpers, page exclusions, Office theme system, host CSS, login config, logout alerts, session refresh, login page handler, auth page setup, captcha handler |
| **Core state** | Config & state, delay system |
| **Telegram** | Telegram, **Telegram delivery queue**, **critical alert queue**, **persistent content-keyed dedup** |
| **Watch/breaks/tabs** | Online watch config + functions, state, break system, tab manager, auto-resume, stats collection |
| **Game model/UI plumbing** | Game definitions, status bar parser, UI helpers, Telegram checks, staff-mail alert helpers, script-check monitor |
| **Timers** | DTM/OC timer system, travel timer, protection timer, ready alerts, protection warnings, timer display |
| **Mail/actions** | Mail system (OC/DTM invite accept), OC/DTM page handlers, page helpers, jail detection, **game actions**, **human action cadence** |
| **Counters/XP** | Jail daily attempt counter, XP UI + charts, garage, hot city, OC team creation |
| **Big UI** | Office-style UI (the panel + modals), auto-travel + DTM list |
| **XP/rank engine** | XP tracking + no-XP limiter, **rank table**, XP API interceptor |
| **Lifecycle** | Watchdog (self-healing main loop), keep-alive ping, server time offset, DTM team creation, main loop, init |

Use `grep -n "/\* ===" Jarvis.user.js` to get current line numbers (they shift as you edit).

---

## 4. Key subsystems (the recently-built ones, with rationale)

These were built/changed across versions 2000.172 → 2000.179. The *why* matters — several
exist because of real incidents.

### Human action cadence (`humanCooldownMs` / `fastCooldownMs` / `cooldownElapsed` / `markActed`)
Controls the gap between repeating actions (crime/gta/booze/jail).
- **Two modes**, chosen by `cfg.awayMode` via `nextCooldownMs()`:
  - **Away (camouflage, default):** `humanCooldownMs` — right-skewed long tail. ~45% fire
    3–25s after the cooldown, ~35% 25s–2.5min, ~15% 2.5–8min, ~5% 8–20min. Floored at the
    game cooldown (never early). Looks human; lower throughput.
  - **At PC (fast):** `fastCooldownMs` — cooldown + 0.5–4.5s. High throughput; obviously
    automated timing, fine when the user is present to answer a script check instantly.
- **The delay is computed ONCE per cycle and persisted** in `cbDly_<action>`, re-rolled only
  by `markActed()` after an action fires. **Do not** roll the delay inside the per-tick
  cooldown check — the old `jitteredCooldown` did exactly that and the per-tick re-rolling
  collapsed the distribution to ~minimum (fired at `interval − a few s` every time, sometimes
  early). That bug is why this is structured the way it is.
- Front-panel ribbon switch `jb-away-mode` flips modes; `rerollCadence()` re-rolls all pending
  delays on flip so the change takes effect immediately. Persisted in `cbAwayMode`.
- `rndDelay` (the per-click micro-delay, bell-curve + jitter + occasional pause) is separate
  and already good — leave it.

### Telegram delivery queue (`sendTg` → `cbTgSendQueue`, `pumpTgQueue`, `startTgPump`)
Every Telegram send goes through a **persistent retry queue**, not a one-shot request.
- **Why:** a DTM alert once arrived ~26 min late. The old `sendTg` fired a single
  `GM_xmlhttpRequest` with no retry; if interrupted by page navigation, tab throttling, or a
  Telegram `429`, the message stalled or died.
- Retries until HTTP 200, honours `429 retry_after`, backs off, gives up after ~8 tries,
  queue capped at 50. Resumes on next page load (pump runs on init + 3s interval + main tick).
- **At-least-once delivery:** a rare duplicate is possible if the page navigates in the
  ~100ms before a 200 is recorded. Accepted trade-off vs lost/late alerts. A
  "recently-delivered" suppression guard could be added if dupes become annoying.

### Critical alert queue (`queueCriticalAlert` → `cbCritAlerts`, `pumpCriticalAlerts`, `startCriticalPump`)
Reload-proof repeated alerts for **ban-risk events**: inbox script check, on-page staff
check, staff mail.
- **Why:** a real **12h no-reply soft ban** — the user got only 2 of 5 script-check alerts.
  The old repeat used `setTimeout` spacing; the pending timers were destroyed when Jarvis
  navigated mid-burst. This queue persists the remaining sends and resumes across reloads.
- Pattern: 5× quick burst, then slower follow-up pings (script check ~every 3min ×10 ≈ 30min
  backstop; staff mail ×6). On-page staff check calls `clearCriticalAlert()` when the check
  clears so it stops nagging after it's answered.
- **The script never auto-answers a check** — that's the human-verification step; it only
  ensures the user sees it.

### XP tracking + charts (XP TRACKING / XP API INTERCEPTOR / XP UI + CHARTS)
- `installXpInterceptor()` hooks `XMLHttpRequest` and **passively** reads the player's
  `Experience` from the game's own status-refresh XHR (`hndlr.ashx?m=pst`). No extra requests.
- **Known behaviour:** XP only appears "after a while" — it reads only when the game fires its
  own status refresh, and the first read is a baseline (no gain shown until the 2nd). This is
  expected, **not a bug**. Optional improvement (not built): replay the status-refresh request
  once on load for an immediate baseline.
- `snapshotXP(action)` is called right before each action's click (crime/gta/booze/jail) so the
  next observed gain is attributed to it.
- Front-panel "Experience" section (Total/Session/Rate/Last + rank line) and a 📈 Charts modal
  (`jb-xp-modal`): SVG cumulative-XP line chart, per-action bars, rank ladder, recent-gains list.
- `updateXpUI()` is called immediately after `buildUI()` in `init()` so saved values paint on
  load instead of blanking to "—" until the first tick. Keep that call.

### Rank system (RANK TABLE)
- `perRankReq = [5,15,60,60,80,100,130,150,200,300,400,500,1000,2000,3000,3000]` — XP needed
  *within* each rank step to advance (supplied by a Legend-rank player). `cumRankReq` = running
  totals.
- Rank **name + percentage** come from the status bar (`ctl00_userInfo_lblrank` /
  `ctl00_userInfo_lblRankbarPerc`, parsed in the STATUS BAR PARSER section; the % uses a
  European decimal comma, e.g. `21,4%`). `resolveRank()` locates the rank step from cumulative
  XP and **cross-validates against the status-bar %** (±6%) — shows exact figures when they
  agree, otherwise an approximate value marked `~`.
- **Rank-up detection** is by the status-bar **name changing** (model-independent) →
  `onRankUp()` logs it, fires a Telegram alert (`rankup` toggle, default on), and marks the
  charts.
- **GAP:** the ordered list of the 16 rank *names* is unknown, so the ladder labels steps
  "Step N" and absolute "XP to next" is approximate until confirmed. If the user supplies the
  16 names in order, wire them in to label steps and pin the index exactly.

### No-XP streak limiter (`maybeFeedNoXpLimiter` / `disableActionForDay` / `checkXpCapResets`)
- **Off by default** (`cbNoXpLimiterOn`). If an action gains no XP `cfg.noXpStreakLimit`
  (default 5) times in a row, it's treated as the game's daily cap and disabled until the next
  game-day. Re-enabled on game-day rollover. Settings toggles exist in the Advanced section.

### Persistent dedup (`seenOnce(bucket, id, cap)` / `contentHash` — FNV-1a)
- Returns true only the first time an id is seen in a bucket, across reloads (`cbSeen_<bucket>`).
- Used in `checkSqlCheck` so a check cycling between two questions (A→B→A) doesn't re-alert on
  A's reappearance. Mail dedup elsewhere uses a separate monotonic highest-ID scheme — leave it.

### Amsterdam timezone (`amsterdamWallclockToTs`, `calibrateServerTime`, `gameDayStr`)
- TMN runs on **Europe/Amsterdam** (CET/CEST). `amsterdamWallclockToTs` builds timestamps with
  correct DST handling; `gameDayStr()` computes the calendar day in Amsterdam via `Intl` so the
  **jail daily counter resets at game midnight**, not UTC midnight.

### Page-load watchdog (standalone IIFE, top of file)
- Reloads the page if it hasn't reached `readyState === 'complete'` within 45s, capped at 4
  reloads (`cbLoadStuckReloads`), self-clearing. Targets the tablet's "runs for hours then
  half-loads" hang. Main-frame only.

### Other established machinery (pre-existing, stable)
- Self-healing main-loop watchdog (`WATCHDOG_TIMEOUT = 60000`), keep-alive HEAD ping,
  3 themes (Office light/dark + one more), break system (coffee/lunch/sleep), online watch,
  OC/DTM invite auto-accept + creation flows, garage crusher, hot-city auto-travel, DTM list,
  jail counter UI (`⛓️ X/limit`, `cbJailDailyLimit` default 2000).
- Per-message Telegram toggles: `TG_MSGS` array of ~28 categories, `tgMsg(key, message)`
  wrapper gates each send by a per-key toggle (`cbTgMsg_<key>`), configured via a grid in the
  Telegram settings. A few messages keep dedicated toggles. New alert types must add a `TG_MSGS`
  entry or they'll be suppressed by default (e.g. `rankup` was added this way).

---

## 5. Version history (this development arc)

- **2000.172** — baseline with per-message Telegram toggles.
- **2000.173** — ported 5 features from a moderator reference script + new XP charts subsystem:
  page-load watchdog, Amsterdam TZ fix, persistent dedup, no-XP streak limiter, bail-long-waits
  (`actionDueSoon` defers a coffee break if an action is due within 4s). (A 6th, a "safe-list"
  player-link colourer, was added then **removed** at the user's request — see §7.)
- **2000.174** — rank table + rank display + advanced-stats rank ladder + rank-up detection.
- **2000.175** — reload-proof critical alert queue (soft-ban fix).
- **2000.176** — paint saved XP/rank immediately on load (stop the blank-then-repopulate flicker).
- **2000.177** — persistent Telegram delivery queue with retry + 429 handling.
- **2000.178** — human action cadence rework (right-skewed, computed-once, no per-tick re-roll).
- **2000.179** — Away / At-PC cadence mode switch (front-ribbon toggle, default Away).

---

## 6. Behaviour guarantees worth preserving

- **Never auto-answer a staff/script check** — alert only.
- **Actions never fire before the game cooldown** (the cadence is floored at the interval).
- **Critical alerts and Telegram sends must survive page navigation** — don't refactor them
  back into one-shot `setTimeout` / fire-and-forget sends.
- **`Jarvis.meta.js` must always mirror the header exactly** after a release.

---

## 7. Constraints / off-limits / things to know

- **Moderator reference script** ("teddybear" / Ragefour TMN Bot v4.20.215): the source of the
  ported features. Its verbatim source is **not in this project** — only analysis. If you need
  to port more from it, ask the user to re-share it.
- **Worker coordination** (`tmn-tf-ocdtm.teddybear.workers.dev`): the user can *use* this but
  has **no consent to alter** it — don't touch/replicate it.
- **`starvinggeeks.net/helper/` (`safe.php`)**: the user has consent + IP allowlisting for this
  (returns a JSON name array). The safe-list *feature* was removed from the script (user won't
  use it); the endpoint remains fine for one-off use. Note `@connect starvinggeeks.net` was
  removed from the header when the feature was — re-add it if any script-side fetch returns.
- **Separate standalone scripts** the user also runs (Bullet Sniper, Property Drop Monitor,
  Bulk Kill Search, etc.) are **NOT part of Jarvis** — don't fold them in.

---

## 8. Open / optional items (offered, not built)

- **Anti-bot message detection:** recognise the game's soft-ban/warning strings and auto-pause.
  Needs the **exact warning phrases** from the user (or the mod script) to avoid false triggers.
- **Immediate XP baseline:** replay the status-refresh request once on load so Total shows in
  seconds instead of "after a while".
- **Rank-name ladder:** the 16 ordered rank names → label ladder steps with real names and pin
  the rank index exactly (removes the `~` approximate on XP-to-next).
- **Third cadence mode** ("Nearby") between Away and At PC, as a 3-way cycle.
- **Configurable critical-alert cadence** as a settings control.
- **Telegram duplicate-suppression guard** if at-least-once delivery produces noticeable dupes.

---

## 9. Quick dev cheat-sheet

```bash
# syntax gate (run after every edit)
node -c Jarvis.user.js

# find a subsystem
grep -n "/\* ===" Jarvis.user.js

# release: bump (edit OLD/NEW), validate, rebuild + verify meta
sed -i 's/2000\.179/2000.180/g' Jarvis.user.js
node -c Jarvis.user.js
head -32 Jarvis.user.js > Jarvis.meta.js          # recount 32 if header changed
diff <(head -32 Jarvis.user.js) Jarvis.meta.js    # must be empty
```

Edit surgically, validate often, keep British English, and always rebuild the meta file.
