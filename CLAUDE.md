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
- ⚠️ **Each device is a DIFFERENT PLAYER — four accounts, not one account on four devices.**
  Same script, separate logins, separate GM storage. Anything reasoning about "the same
  event seen by several devices" is wrong on that premise: two devices seeing a rank-up
  means two players ranked up. Nothing needs deduping across machines, and per-device
  storage is per-player storage. This was assumed the other way round in 2000.253 and
  corrected on 2026-08-16.
- **Current version: `2000.280`.**
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
- `APP_NAME = 'Jarvis Bot'`, `APP_VERSION = '2000.253'`, `APP_TAG = '[JB]'` (console prefix).
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
The version lives in exactly **three** places: `@version` (line 4), the banner comment
(line 36) and `const APP_VERSION` (line 123).

⚠️ **Those last two line numbers move whenever the header changes.** Adding
`@connect discord.com` in 2000.252 shifted them from 35/122 to 36/123 and the header from 33
lines to 34. **Always `grep -n` for the current version first** — the command below does, and
the numbers in it are illustrative, not gospel.

**Do NOT use a blanket `sed 's/2000.OLD/2000.NEW/g'`.** That was the documented method
and it is actively harmful: comments throughout the file cite the version that introduced
a piece of code ("STATUS-BAR XP FALLBACK (2000.224)"), and a global replace rewrites those
to the current version on every release. By 2000.233 three such comments had been silently
falsified — the XP fallback, the stat refresh, and the XP-cap removal note all claimed to
be from the release being cut. They were repaired in 2000.234. **Bump by line number:**

```bash
# 1. bump — the three real occurrences only (confirm the line numbers first)
grep -n "2000\.233" Jarvis.user.js       # expect lines 4, 35, 122 and nothing else
sed -i '4s/2000\.233/2000.234/; 35s/2000\.233/2000.234/; 122s/2000\.233/2000.234/' Jarvis.user.js

# if that grep returns other lines, they are historical citations — LEAVE THEM ALONE

# 2. validate
node -c Jarvis.user.js          # must pass — this is the standard syntax gate

# 3. rebuild meta = exact header (locate the terminator rather than hardcoding a count)
HDR=$(grep -n "^// ==/UserScript==" Jarvis.user.js | head -1 | cut -d: -f1)
head -$HDR Jarvis.user.js > Jarvis.meta.js

# 4. verify meta mirrors header exactly
diff <(head -$HDR Jarvis.user.js) Jarvis.meta.js   # must be empty
```

**The header is currently 34 lines and ends at `// ==/UserScript==`.** If you add or remove
any `@match` / `@grant` / `@connect` line, the line count changes — recount before the
`head -N`. The snippet above locates the terminator rather than hardcoding it, which is why
it survives that. Always `diff` to confirm.

### Validation
- `node -c Jarvis.user.js` after every edit. There is no test suite; syntax-clean + manual
  reasoning is the bar. The file is large, so make surgical edits and re-validate often.

### Match rules (don't "tidy" these)
The header has www + non-www + a catch-all `*://*.tmn2010.net/*`. The redundancy is
deliberate — it fixed the script failing to inject on the tablet. Leave it.

### Grants/connects currently present
`GM_setValue`, `GM_getValue`, `GM_addStyle`, `GM_xmlhttpRequest`;
`@connect api.telegram.org`, `@connect discord.com`, `@connect raw.githubusercontent.com`,
`@connect starvinggeeks.net`.

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

### XP attribution — what "other" meant, and why a +0.3 booze isn't real (2000.242)
Two separate defects behind "XP by action isn't recording correctly":
- **`snapshotXP('oc')` was never called anywhere.** `oc` was in `XP_ACTIONS` with an
  icon and a chart slot, but nothing ever tagged it — so **every OC payout landed in
  `other`**. Added at OC commit and at OC role-select. DTM was tagged on only one of
  its four paths (complete-in-`handleDtmPage`); the buy path and both `handleCreateDTM`
  paths now snapshot too.
  - Caveat that remains: OC XP arrives when the crime *executes*, which can be well
    past the 90s attribution window, so some will still read `other`. That is a
    limitation of snapshot-based attribution, not a bug to chase.
- **The status-bar fallback quantises, and it wasn't saying so.** The bar renders two
  decimals of a percentage → resolution is `span/10000`: **0.3 XP at Global Dominator**,
  0.2 at Global Threat. A booze sale worth 0.08 is invisible until three or four have
  accumulated, then the lot surfaces as one `+0.3` attributed to whichever action fired
  last. That is precisely the reported "+0.3 booze among +0.06 booze".
  - `onExperienceRead(xp, src)` now records `'api'` (exact, from the XHR) or `'bar'`
    (rounded). The charts mark bar entries `≈` in warning colour with the current step
    size.

### The bar was EATING gains, not just blurring them (2000.243) — read this before touching XP
242 explained the `+0.3` as harmless coarseness. It wasn't. The user supplied two
consecutive exact readings — `5444.4582499999487` → `5444.5382499999487`, one booze
sale, **0.08** — proving the feed was alive and precise while the panel showed `+0.3`
and dropped roughly every other sale. Root cause:
- The bar's value is the truth **rounded**, so it can sit ABOVE the truth by up to half
  a step. That left `xpState.total` inflated.
- The next exact reading then came in *below* the inflated total, hit the
  `if (xp < prev)` branch, silently reset the total and **recorded no gain**. One real
  0.08 vanished; the next was measured fine. Hence "every other one".

Three changes, all load-bearing — do not undo them:
1. **`xpState.apiTotal` tracks the last exact value separately**, and an exact reading
   measures its gain against *that*, never against a bar-nudged `total`. An overshoot
   can no longer swallow anything.
2. **The bar stands down for `XP_BAR_STANDDOWN_MS` (10 min) after any exact reading.**
   It is a fallback for a dead feed — that is its whole job. Competing with a live feed
   is pure downside: it can only be less precise.
3. **`sessionGain` is DERIVED (`total − sessionBase`), not accumulated.** Accumulating
   deltas permanently banked every provisional bar reading, so a later correction
   couldn't undo it and the session drifted up all evening. `resetXpSession()` must
   re-baseline `sessionBase` or the counter resumes from the old figure.

Verified in `scratchpad/test-xp-attrib.js` against the user's real numbers — 14 assertions
including the exact overshoot-then-correct sequence that used to lose the sale.

### One reading can cover several actions — and now says so (2000.244)
Prompted by a `+0.483 crime` the user queried. The amount was real; **the label was a
guess**. One XP reading covers everything since the previous one, the feed is polled every
60–180s, and several actions can come due within seconds — so the whole accumulated gain
gets credited to whichever action fired LAST. `+0.483 crime` may be one crime plus five
booze sales.
- `snapshotXP()` now also appends to `cbXpPending` (`{a, t}`, 30-min age filter). On a gain,
  `onExperienceRead` takes the list, clears it, and if `length > 1` stamps `n` and `mix`
  ("booze×5, crime") onto the history entry. The charts show `⊕n` and the real mix.
- **The per-action total still goes to the last action.** With nothing to split on, any
  division would be invented; clean readings dominate often enough for the bars to stay
  useful. `cleanReads` / `bundledReads` are counted and the charts report the percentage,
  so you can see how far to trust them.
- **A baseline read must clear the pending list** (`prev === 0` branch). Found by
  `scratchpad/test-xp-bundle.js` — without it the first real reading looked bundled when it
  covered one action. A no-gain read must NOT clear it: those actions are still pending.

### How often XP is read — the actual cause of bundling (2000.245)
The user asked why the reference script reads XP so much more often. Two findings:
1. **We were polling SLOWER than the game's own page.** `STAT_REFRESH_MIN/MAX_MS` was
   60–180s. The game fires `pstats(N)` on an inline `setInterval` **every 15 seconds**
   while a page sits open, and `#ctl00_imgRefresh` calls that same function producing an
   identical `hndlr.ashx?m=pst` request — **the server cannot distinguish a click from the
   page's own timer.** So 60–180s bought no camouflage over an ordinary open browser; it
   only widened the window in which several actions bundle into one reading. Now
   `cfg.xpPollSec`, default **20s**, ±25% jitter via `xpPollMs()`, exposed in
   Settings → System → Advanced. Do not raise it back "for safety" — 15–20s *is* the
   baseline a normal browser produces.
2. **A failed refresh burned both the throttle and the post-action bypass.** The stamps
   were written *before* `forceStatRefresh()` and regardless of its result. That call fails
   whenever `#ctl00_imgRefresh` isn't on the page, which is common under constant
   navigation — so the one moment a reading matters most (just after an action) was the one
   most likely to be skipped, and its gain bundled into the next. Both stamps now happen
   **only on success**; a failure returns false and lets the next tick retry.
- 19 assertions in `scratchpad/test-xp-poll.js`, including that the same snapshot still
  can't re-fire every tick, the 4s pre-action floor holds, and the acting/jail/page guards
  are intact.
- The reference script's verbatim source is still **not in this project** (§7) — this was
  reasoned from our own code and the game's 15s interval, not copied.

### Which actions claim an XP reading (2000.246) — jail is deliberately quiet
Only **crime, GTA, booze, OC and DTM** call `snapshotXP()`. Two others changed:
- **Garage removed.** Selling cars earns no XP (user-confirmed). Claiming a reading for it
  credited garage with whatever the *next* crime or bust earned — and with the no-XP
  limiter on, garage would eventually have disabled itself for "gaining no XP", a fault it
  never had.
- **Jail uses `snapshotXPQuiet()`** — queued for the record, but it does not claim the next
  reading and does not trigger a forced refresh. **`cfg.jailInt` defaults to 3 SECONDS**, so
  the old `snapshotXP('jail')` overwrote the pending snapshot of any real action before its
  reading arrived: fire a crime, have a bust land 3s later, and the crime's XP was recorded
  as jail. **Crime/GTA/booze attribution had been leaking into jail for as long as both were
  enabled.** It also requested a read every few seconds — which mostly didn't happen anyway,
  because the next bust replaced the snapshot before it passed the 4s floor, so jail went
  unattributed regardless. Pure cost, no benefit.
- **The residual is inferred to be jail** (`entry.inf`, shown as `?` in the charts) when a
  bust is in the covered window and nothing claimed the reading. Sound because jail is the
  only remaining XP-earning thing Jarvis does that doesn't claim.
- That known limit — a payout landing in the jail bucket — is **solved in 247** by the
  game's own completion mail, not by a guessed size threshold.

### OC/DTM payout reconciliation from the completion mail (2000.247)
The user spotted the signal: the game mails **"Organized Crime Notification"** and
**"DTM notification"** when one finishes (ids change; match the wording). That is the
timing information the snapshot never had, because a payout arrives when the crime
*executes* — potentially hours later.
- `OC_DONE_RE` / `DTM_DONE_RE` in `checkMail`, guarded by a highest-id watermark
  (`cbLastPayoutMailId`) rather than a timestamp — `parseTmnDate` reads the game's
  Amsterdam clock as UTC and is 1–2h out, and on a first poll a mailbox full of old
  notifications must not retro-label today. Detection **falls through** so the mail still
  reaches the normal new-mail alert.
- Two directions, because the mail poll (~30s) races the XP poll (~20s): `notePayout()`
  searches back up to 15 min for an inferred/other/jail entry and relabels it; failing
  that it parks `cbXpPayoutPending`, which the next unclaimed reading consumes (5 min).
- **The split:** a payout reading usually caught some busts too. `jailAvgXp()` is
  **learned** from readings containing nothing but jail, so `busts × rate` is subtracted
  and the rest goes to the OC. No invented constants — with no samples yet, no split is
  attempted and the whole gain moves.

**Three bugs the tests caught here, all worth keeping in mind:**
1. **Order matters: reconcile BEFORE learning.** Learning first was self-defeating — the
   payout taught a bogus rate, the split then consumed the entire gain, `payPart` came out
   zero and `applyPayout` refused the reassignment it had just made impossible.
2. **The rate is a MEDIAN over recent samples, not a running mean.** A reading credited to
   jail can still carry a payout (those queue nothing), so the sample set will occasionally
   contain a wild value. A mean is dragged by one; a median shrugs it off and self-heals.
   Plus an outlier reject at >5× median once there are ≥3 samples.
3. **Unlearn on relabel.** If a reading had already taught the rate and a notification later
   proves it was a payout, `entry.lr` lets that exact sample be pulled back out.

23 assertions in `scratchpad/test-xp-payout.js`, including both race directions, the split
arithmetic, and that a properly claimed action is never stolen by a notification.
- Recent-gains history raised 40 → 250 stored (`XP_HISTORY_CAP`), 120 shown. **Raising
  a cap is safe; lowering one silently destroys stored history** — that was the 232
  mistake reverted in 233. Don't reintroduce configurable caps.

### Ready reminders · witness mail · mod presence (2000.248)
Three items ported from the reference-script survey in §8. Only the reminders and the mod
work are built from our own code; the witness pattern is a **stated guess** (below).

**Ready reminders (`readyReminder`)** — `checkReadyAlerts` fired once on the cooldown→ready
transition, so a missed alert meant a finished 2h cooldown could sit unused all evening with
nothing to say so. Re-pings while **still** ready, on three rules:
- **Capped** at `cfg.readyRepeatMax` (default 4) — an OC you are deliberately holding must
  not buzz all night.
- **Auto-disarming** — the count clears the moment the timer goes back on cooldown, so using
  the OC ends the reminders with no explicit "acknowledge" step.
- **Reload-proof** — next-due lives in `cbRdyNext_<kind>` and is read on the timer tick,
  never a `setTimeout`. Same reasoning as the critical-alert queue: Jarvis navigates every
  few seconds, so a pending timer would rarely survive to fire.
- Silent while jailed / paused / on a break — you couldn't act anyway — but the count is
  **kept**, so the reminder is still owed when you are free. Verified in the tests.

**Witness mail (`WITNESS_RE` / `WITNESS_BODY_RE`)** — **YOU witnessed someone else's murder**,
not someone witnessing you. The body names both parties.
- Subject `/witness…murder/i` (either order), body `You've witnessed (KILLER) kill (VICTIM)!`.
  Both taken from the reference script's `handleWitnessMessage`, **verified against its
  source**. Straight and curly apostrophes both accepted, because the body is matched after
  HTML→text conversion.
- ⚠️ **The first draft of this guessed and got the direction backwards** ("a witness saw
  you"), which would have alerted on the wrong mail and described it wrongly. It was written
  that way because §7 claimed the reference wasn't available. It is — see §7. The test file
  now asserts the guessed wording does *not* match, so the mistake can't come back.
- Alert only. This is intelligence about two other players, and what you do with it is a
  judgement call — same line `EXCLUDED_CRIME_IDS` draws: no automated action aimed at a real
  person. A body that doesn't parse still alerts (a murder in front of you matters even
  without names) and logs the body so the pattern can be corrected.
- Highest-id watermark (`cbLastWitnessMailId`), same as the completion notifications and for
  the same reason: a first poll over an old mailbox must not fire a burst of stale alerts.
  Falls through, so the mail still reaches the normal new-mail alert.

**Mod presence (`modScan` / `modsOnline` / `modJailBlocked`)** — two behaviours off one
detection, both default off, both gated behind `cfg.modWatchOn`:
- **No jail on Mod** suppresses **only jail**. `cfg.jailInt` defaults to 3 seconds, so jail
  is a page load every few seconds all day — by far the loudest thing Jarvis does, and the
  activity a moderator watching the jail list would notice first. Nothing else comes close,
  so nothing else is suppressed.
- **Mod-online break** rolls 1–2h and optionally logs out, reusing the watch-logout
  suppression (`cbOwLogoutUntil`) so auto-login can't sign straight back in. Reported through
  `getBreakStatus()` so the panel, the ready reminders and the watchdog's deliberate-wait
  check all treat it as a break rather than a stall.
- **Detection is the game's own marker, not a name list.** `players.aspx` renders a staff
  member's profile link with inline `color: #FF9900`, so the site tells us who is staff —
  `MOD_HILITE_RE` / `parseModsFromDoc`. That catches **every** moderator, including ones we
  could never have named. An earlier draft matched the four `STAFF_IDS` accounts and would
  have sat blind to anyone else; the reference script has always used the highlight.
  Fetching reuses `fetchOwPage`, but the parse is separate because `parseOwPlayers`
  deliberately discards styling — don't merge them.
- **Marc is excluded** (`MOD_IGNORE`). The owner's account shows highlighted essentially
  always, so counting it would leave the feature permanently triggered — jail off forever, or
  a break that re-arms the moment it ends. The reference skips marc in the same place.
- Note `#AA0000` is *your own* name on that page (see `getPlayerName`), not staff.
- **FAILING OPEN IS DELIBERATE — do not "fix" it.** A failed fetch keeps the last reading and
  lets it go stale; a reading older than `MOD_STALE_MS` (5 min) suppresses nothing. Failing
  closed would turn one network blip into a silent all-day halt you'd notice hours later,
  which is far worse than one unsuppressed bust. The settings readout distinguishes "no staff
  online" from "stale — suppressing nothing" for the same reason.
- Alerts fire on the **transition** only, so a mod online all evening doesn't re-trigger every
  poll. Status line shows `⏸M` while jail is held (distinct from `⏸J`, the action yield).

### Discord webhook for rank-ups and witness statements (2000.252)
A second alert channel alongside Telegram. **This reverses the "Telegram-only" line in §8** —
a deliberate choice by the user, not drift.

**THE WEBHOOK URL IS NOT HARDCODED, and must never be.** The reference script bakes its own
in (line 152), and copying that here would have been the obvious way to satisfy "the same
webhook". It is not safe: **`scoobyghub/v100` is a public repo** (verified — an unauthenticated
`api.github.com` request returns 200) and `Jarvis.user.js` is served raw from
githubusercontent. A Discord webhook URL is a credential — anyone holding it can post to that
channel. So the field starts blank and lives in GM storage, per device. A test asserts no
webhook URL appears anywhere in the source.

- **Shares the Telegram send queue** rather than duplicating it — items carry `dest:'dc'`, and
  anything without a `dest` is Telegram, so items queued before 252 still deliver.
- **Gating moved per-item.** The old `pumpTgQueue` returned early unless Telegram was
  configured, which would have stranded every Discord item for anyone using Discord alone.
- **Two 429 shapes:** Telegram nests `retry_after` under `parameters`; Discord puts it at the
  top level as float seconds. Both handled.
- **Discord answers 204, not 200** — treating only 200 as success would retry a delivered
  message for ever.
- **Not gated by the halt**, same as Telegram: it never touches the game, and the whole point
  of alerts is that they survive a stop.
- Embeds are reworked from the reference's, which repeat your name in the title, the
  description *and* a field. Shape here: author = who it's about, title = what happened,
  fields = specifics, footer = provenance. Rank-up carries live XP and XP-to-next, which the
  reference can't — ours detects the rank change from the status bar as a from→to transition,
  theirs parses a mail blob.

**POST ONCE — never flood (`dcSendOnce`, 2000.253).** Four ways one event could post more
than once, all real, three fixable in-script:
1. **Multiple tabs on a device.** `updateTimers` runs per tab, not master-only, so two tabs
   both see the rank change. → **master tab only**.
2. **The same event re-detected.** A rank-up is spotted by comparing the status bar to a
   stored name; anything resetting that name re-fires it. → **`seenOnce()`**, keyed by the
   EVENT (rank-up = `from>to`, witness = mail id), localStorage-backed so it is shared by
   every tab and survives reloads.
3. **The queue's at-least-once delivery** — documented and accepted for Telegram since 177:
   navigate in the ~100ms before a 200 is recorded and the item retries. → a 60s
   **content-hash guard** (`cbDcRecent`). This is the "duplicate-suppression guard" §8 has
   listed as optional ever since.
4. **Multiple devices** — ~~3 PCs and a tablet on one account~~. **This premise was WRONG
   and the advice that followed from it was actively harmful.** Each device is a different
   PLAYER (§1), so four rank-ups are four separate events by four accounts, each embed
   carrying its own `st.player`. There is nothing to dedup across machines, and the original
   guidance — "leave `dc.thisDevice` on for one device, off for the rest" — would have
   silenced three players entirely. **Leave it ON everywhere.** The switch stays because
   "don't post from this account" is still a reasonable thing to want; it is not a
   duplicate-suppression mechanism. Guards 1–3 above are all per-device and remain correct
   exactly as they are.

**The test message must remain unmistakable.** It says `THIS IS A TEST` in the title, the
description and the footer, states that nothing actually happened, uses a neutral grey rather
than the gold/red of real alerts, and **deliberately bypasses `dcSendOnce`** so it can be
pressed twice. A test post that reads like a real rank-up is worse than no test, especially in
a channel other people can see. Asserted in the tests.

### HARD HALT — the ALL switch is a power switch (2000.251)
**"Off" means off at the network, not "the actions are unticked".** This is the most
important behavioural rule in the file; read it before touching anything that polls.

**Why.** The scenario is a script check: a moderator sends one, then watches whether the
account still behaves like somebody is at it. With the actions merely unticked, Jarvis still
polled the inbox every 30s, fetched OC/DTM/travel timers every 60s, re-fetched protection,
scanned the players page, pinged keep-alive every 5 minutes and fired the XP status refresh —
a steady drumbeat on your session cookie saying "still here" while you demonstrably aren't
answering. That is worse than useless; **it is evidence against you.** Before 251, ALL-off
stopped none of it.

**`st.halted` / `isHalted()` / `haltAll()` / `resumeAll()`.** Three layers, because timers are
not the only entry point:
1. `mainLoop` returns immediately — **before `tabs.check()`**, since every branch below either
   navigates or fetches.
2. The fetching timers are cleared, so there are no wakeups to leak through.
3. **Each fetch entry point checks `isHalted()` itself** — `owFetch`, `gmGet`,
   `collectTimers`, `fetchTravel`, `fetchProt`, `checkMail`, `bgHeal`, `doForumRefresh`,
   `fetchHot`, `maybeForceStatRefresh` — so a stray call from a handler, retry or
   `setTimeout` still can't reach the network. `safeNav()` refuses as the navigation choke
   point.

**What deliberately keeps running**, all local or outbound-to-Telegram:
- **The Telegram and critical-alert queues.** A queued script-check alert MUST still be
  delivered — being stopped is usually the *response* to one. **Never gate these.**
- The panel (you need it to un-halt), and reading the page already in front of you.
- The XP interceptor: passive, observes only requests the page itself makes.

**Consequences that are correct, not bugs:**
- **Keep-alive stops, so the session lapses.** Being logged out is what stopped looks like.
- **Auto-login is suppressed** (`initLogin` reads `cbHalted` straight from GM storage, before
  `st` exists). Otherwise the halt would quietly log you back in and restart the drumbeat.
- **The watchdog treats a halt as deliberate** — it must never "heal" it by restarting the
  loop or reloading.
- **The halt survives page loads.** `init()` branches on it; without that the stop would last
  only until the next navigation, and you may well still be clicking around by hand.

**The ALL checkbox reflects `st.halted` ONLY**, not the other toggles — it reads
RUNNING/STOPPED. Deriving it from the flags meant unticking one action displayed "ALL OFF"
while the script was still fully running. Individual toggles no longer touch it.

`startAllServices()` is the single idempotent start-up path, called by both `init()` and
`resumeAll()` — a page that loads halted never runs the start-up path, so resuming has to
bring everything up from cold. `_oneShotsDone` guards the inits that aren't safe twice
(`initServerTime` sets an unheld interval; `initKeepAliveExtras` adds listeners).

The tests **read the source** and assert each of those functions is gated, so a new poller
added later fails the test rather than silently defeating the halt.

### Hold HQ · forum refresh · allied invite gate · six bug fixes (2000.250)

**Six bugs from the 249 review, all fixed:**
1. **`ALL` off left five things running** — `createOC`, `createDTM`, `autoTravel`,
   `autoDtmList`, `scrapOn`. Four of them navigate, and in `mainLoop` they sit ABOVE the idle
   gate, so ALL-off could not reach them: hitting it mid-cycle left Jarvis driving to
   `organizedcrime.aspx`, which reads exactly as "it carried on where I left it". ALL now
   reads and writes **one shared list** (`ALL_ST_KEYS` / `ALL_CFG_KEYS`) so the two can't
   drift again, and switching off also **abandons in-flight creation state** — the state
   machines live in localStorage and would otherwise resume on the next switch-on.
2. `syncAll` read 6 of the 8 flags it wrote — same shared list now.
3. **Duplicate `isInHot()` removed.** Hoisting made the first copy dead, and it lacked the
   empty-city guard: `hot.includes('')` is true, so it reported "in the hot city" whenever the
   status bar hadn't rendered. Harmless while the later one won; a trap the moment anyone
   moved it. **Only the auto-travel copy exists now.**
4. **`cbXpPayoutPending` is a queue.** A single slot meant an OC and DTM finishing inside one
   mail poll overwrote each other. Re-queuing after a failed match **preserves the original
   timestamp** — re-stamping would make an unmatchable marker immortal.
5. **`notePayout` takes the BIGGEST qualifying reading, not the newest.** `find` took the
   newest, which is wrong whenever a jail-only reading landed since the payout — with jail at
   3s that's the normal case. A payout dwarfs a bust, which is the same size gap the split
   arithmetic relies on.
6. User-supplied values in the settings template are `esc()`d (password, token, chat, OC
   roles, DTM partner). A `"` in any of them broke the panel markup.

**Hold HQ (`doHoldHq`)** — panic-hide inside your network HQ at `network.aspx?p=p`. Three
rules, all load-bearing:
- **NEVER enters a damaged HQ.** `#ctl00_main_lbldamage > 0` → refuse and alert, permanently.
  If the building is destroyed while you're inside it, **you die**. A panic button that kills
  you is worse than no button. Checked before the enter button, not after.
- **Switches itself off at `cfg.holdHqMax`** (default 6 × 10 min ≈ 1h). It's a panic mode, not
  a way to play; left on and forgotten it idles away a day. The cap is what makes it safe to
  reach for. Toggling it on **resets the count** — a previous session's budget must not trip
  the cap the one time you need it.
- **Does not auto-travel.** Wrong city → say so and wait. Travel has its own long cooldown and
  stranding you somewhere under fire is your call.
- Outranks everything except jail/staff-check handling: hiding and committing crimes at the
  same time is not hiding.

**Hourly forum refresh (`doForumRefresh`)** — camouflage, default off.
- **It FETCHES, it does not navigate.** This was forced on us until 2000.254: the forum was
  in `SKIP_PAGES`, so navigating there made Jarvis return early, stop dead and sit on the
  forum. `SKIP_PAGES` is empty now, so that trap is gone — but fetching stays, as a choice
  rather than a workaround. A same-origin GET is the identical request server-side, which is
  all the camouflage depends on, and it costs no page load and doesn't yank you off what you
  were doing once an hour. **Don't "fix" this to a navigation.**
- ±25% jitter, because on the hour every hour is its own tell.

**Allied/safe invite gate (`inviteListGate`)** — accept OC/DTM invites only from your
Starvinggeeks allied and/or safe lists. Stacks with whitelist/blacklist; every gate must pass.
- **Enabling either switches the SG lists on and forces a fetch.** The lists are the whole
  dependency — without that you'd gate against an empty list and silently refuse everything.
- **An empty list refuses everything.** Correct allow-list behaviour, but indistinguishable
  from a fault, so the settings show live list counts in red when empty and every refusal
  logs its reason.
- An unreadable inviter refuses, same as a stranger — same safe direction as the whitelist.

107 assertions in `scratchpad/test-ready-witness-mod.js`. The load-bearing ones are the
**cross-contamination matrix** — every mail pattern must claim only its own mail, which is
the failure class that cost the OC invites in 241 — and the fail-open staleness checks.

### Booze: carry limit is a formula, and sell ONE at a time (2000.242)
- `boozeCarryLimit()` = **`10 + rankLevel²`**, rankLevel 1-based off the `RANKS` index
  (Criminal = 5 → 35). Supplied by the user; it reproduces the hardcoded
  `RANK_BOOZE_LIMITS` table it replaced at **all 17 ranks** (verified in
  `scratchpad/test-booze.js`), which is why it's trustworthy — the table was
  observations, this is the rule. Deriving it from `RANKS` also removes the second
  ordered rank list that could drift.
- **Smart mode now sells exactly 1**, not a random 1–3. The XP is per *sale*, not per
  unit, so a full carry-load sold singly earns it once per unit; selling in threes threw
  two thirds away. The old 1–3 was for camouflage — that belongs to the cadence system,
  not the quantity field.

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

### Anti-bot / soft-ban detection (`detectAntiBotMsg` / `softBanHold`) — 2000.234
- **This was §8's "needs the exact warning phrases" item. It didn't.** Detection keys off
  STRUCTURE — `#ctl00_main_pnlMessage` containing a `.NewGridTitle` reading "Important
  message" — and wording is used only to tell an *enforcement* message from a *staff
  question*, via the broad `ANTIBOT_RE`. Getting that discriminator wrong costs a pause
  and an alert, never an auto-answer, so a loose pattern is the safe choice.
- **Runs BEFORE `checkSqlCheck`, which reads the same panel.** Whichever runs first claims
  the page. Previously a soft ban was misread as a script check, so Jarvis nagged you to
  "answer in-game" a message with no question in it, and never parsed the expiry.
- Parses `expires at: DD-MM-YYYY HH:MM:SS` into `cbSoftBanUntil` via `amsterdamWallclockToTs`
  (DST-correct; verified across the CET/CEST boundary and winter midnight). The pause then
  **lifts itself** at expiry — `softBanHold()` is checked ABOVE the `if (paused) return` in
  `mainLoop` precisely so it can still run once it has paused us.
- No expiry parsed → still pauses, indefinitely. Escape hatch is the existing one: opening
  and closing Settings clears `paused`.

### Background heal (`bgHeal`) — 2000.234, default ON
- Replaces the navigate-to-credits loop. GETs `credits.aspx`, lifts `__VIEWSTATE` /
  `__EVENTVALIDATION` / `__VIEWSTATEGENERATOR`, POSTs them back with `btnBuyHealth`, repeats
  until health reads 100%. No navigation, so it runs from any page and never strands an
  action mid-flight (the old one did, costing the crime as well as the time).
- Reads health back **from each response** rather than assuming +10 per buy, so a changed
  heal amount can't loop it. Stops on "don't have enough credits".
- **Rate-limited by `cfg.healthInt`.** `getHp()` reads the current page's status bar, which
  is server-rendered and frozen until the next page load — without the gate the loop re-fires
  a heal every tick on stale data. `cbBgHealOn` off restores the legacy navigation path.

### Scrap → FMJ (`doScrap`) — 2000.234, default off
- `store.aspx?p=s`, 5 scrap = 1000 FMJ, bought through a `__doPostBack` LinkButton, so it
  needs `scrapPostBack()` rather than a click. Buys Armoured Vehicle protection first when
  the link is present (it only exists while unowned).
- **One purchase per page load, then reload.** The page rate-limits at ~2s and its limiter
  message is indistinguishable from a real failure, so avoiding it entirely beats detecting it.
- Sits at the **bottom** of the mainLoop priority chain: it has no cooldown of its own and
  would starve the timed actions, which do. Below `cfg.scrapFloor` it backs off 6 hours.

### Smart vs random action picking (`pickCrime` / `boozeBuyQty`) — 2000.234/235, default random
- `cfg.smartPick` off = existing behaviour (uniform over your ticked crimes, fixed booze
  amounts). On = **most valuable crime still at or above `cfg.smartMinPct`** (default 85),
  and booze bought to the rank carry limit (`RANK_BOOZE_LIMITS`) with 1–3 sold at a time.
- **This deliberately does NOT copy the reference, which picks the highest success %.**
  That is the wrong optimisation at high rank. Sampled live at Global Dominator the five
  crimes read **97 / 95 / 94 / 94 / 90 %**, so "highest %" selects crime 1, Credit card
  fraud — the cheapest on the page. The reference's rule suits low rank, where the spread
  is wide and failure means jail; at 3%-vs-10% the reward gap dominates.
- **The game RE-ROLLS the percentages on every page visit** (confirmed by the user, 235).
  That sample is one roll, not a table — do not assume the ordering holds, and do not cache
  it. What is fixed is *value*: crime id ascends with reward. Hence "highest id clearing the
  threshold", read fresh from the page about to be clicked.
- The re-rolling makes this adapt rather than break: when the top crime rolls under the
  threshold it steps down to the best one that is safe enough this visit, and back up next
  time. Nothing qualifying → falls back to highest %, ties broken randomly.
- An earlier draft of this section asserted "id descends with success rate, confirmed by the
  live figures" — a correlation inferred from a single sample of a varying quantity. Corrected
  in 235. Exactly the failure mode [[jarvis-xp-hndlr-findings]] warns about.
- Missing percentage labels → random. **Labels `ctl00_main_lblCr1..5` verified live
  (5/5 parsed) in 2000.235**, as were the scrap selectors (balance regex handles decimals,
  e.g. "2.27 scrap").
- Smart mode is inherently repetitive whichever way it optimises — camouflage comes from the
  cadence system, not from crime choice. Random mode remains for genuine spread.

**NEVER automate crime 6** (`ctl00_main_btnCrime6`, "Pick a player's pockets"). It targets
another PLAYER rather than an NPC — it steals from a real person and invites retaliation, so
it is off-limits whatever its odds. It is an `<input type="image">`, unlike the others, so it
does not stand out in a selector sweep. Enforced by `EXCLUDED_CRIME_IDS` / `crimeAllowed()`
at four points: settings list, candidate filter, smart preview, and a final refusal on the
click itself. Before 238 its exclusion was merely implicit — `CRIMES` stopped at 5 and the
fallback loop ran `1..5`, so changing either bound would have silently enabled it.
- Smart mode also tracks a `cbBoozeBroke` flag: a failed buy drops the next one to 1 unit to
  restart the cash cycle instead of retrying the full allowance and failing again.

### Per-action daily counts + limits (`incDailyCount` / `dailyLimitReached`) — 234, reworked 240
- Generalises the jail counter to crime/GTA/booze. **Jail deliberately keeps its own** —
  it predates this, has its own limit field and auto-off flags, and rerouting it would risk
  a well-tested path for no gain.
- **Counting is unconditional (240).** It used to require `cfg.dailyLimitOn` *and* a non-zero
  limit, which disabled the feature for the one job it is most needed for: finding out what
  the game's cap actually is. You cannot choose a limit without first watching an uncapped
  day, and **the cap moves with rank**, so it must be re-learned after each rank-up. The
  switch now governs only whether hitting a limit turns the action off.
- Each finished game-day is archived to `cbDayHist_<action>` (capped 60) as
  `{day, n, rank}`. Rank is stamped at every increment, so a day spanning a rank-up records
  the rank it **ended** at. Zero-attempt days and the fresh-install empty day are not
  archived — they are not evidence of a cap.
- `dailyPeak(action, rank)` → best day overall and best at that rank. **Today is excluded**
  (unfinished ≠ evidence). Settings → Actions renders both plus a 14-day by-day table, and
  "Use observed peaks" fills the limit fields from `atRank || all` with no headroom — the
  peak *is* the cap you hit.
- Panel strip shows `👜 128 · 🏎️ 41` with limits off, `👜 128/500` with them on; hidden only
  when nothing has happened today.
- Hard cap, unlike the no-XP limiter which *infers* the game's cap. They stack.

### DTM partner from the ads list (`pickDtmPartnerFromAds`) — 2000.240, default off
`cfg.dtmAutoPartner`. Create DTM has always invited the one partner named in its modal;
fine with a regular teammate, useless when they're absent.
- **Presence is NOT read from `ocads.aspx`.** Only NAMES come from the ads page; who is
  online is decided by intersecting them with `players.aspx` via the online watch's own
  `fetchOwPage`/`parseOwPlayers` — proven code parsing the page the game actually uses for
  presence. So this is independent of whatever markup ocads uses for an online indicator,
  **which has never been captured live**. If the online list is unavailable it proceeds
  without the filter rather than stalling.
- Filters: blacklist always; whitelist when `st.whitelist`; anyone already tried this cycle
  (`cbDtmTriedNames`) so each retry reaches for **somebody new**. Same-city preferred when
  the row text mentions it, never required.
- The choice is stored in `cbDtmChosenPartner` for the cycle, so a retry of step 1 re-invites
  the same person; only a timeout or a kick clears it. Both paths call `dtmMarkTried()` first.
- **Re-invite cap depends on the source**: 3 with a fixed partner (retrying = asking the same
  absent person), 6 from the list (retrying = a different person, so it's productive).
- No fixed partner configured and nobody suitable → waits, re-checking each minute, and
  abandons the cycle after 15 minutes rather than hanging on the 10-minute generic abort.
- `parseDtmAds` skips rows naming an OC role (Transporter / Weapon Master / …) in case the
  page mixes both ad types.

### OC/DTM invite auto-accept — why OC silently didn't fire (2000.241)
Reported as "OC auto-accept isn't working" with DTM working. Three defects, all on
the OC side, all silent:
1. **The subject rules were asymmetric.** DTM matched `invitation|invite`; OC demanded
   the literal word `invitation` **and** the American spelling `organized`. So "OC invite"
   or "Organised crime invitation" matched nothing. Both now use one shared builder
   (`OC_INVITE_RE` / `DTM_INVITE_RE`) accepting either spelling, either noun, either word
   order, and the body phrasing ("X has invited you to an organised crime"). 18 regex tests
   in `scratchpad/test-invite-re.js` — **six of the eight OC cases failed under 240.**
   A loose pattern is the safe direction: a false match costs one wasted mail fetch, a
   missed one costs a whole OC.
2. **`markHandledInvite()` ran BEFORE the accept was attempted**, so one transient failure
   burned that invite for 14 days with nothing to retry it. Now the handlers return
   true (accepted, or deliberately list-blocked) vs false (retryable), and the caller only
   marks it handled on true or after `INVITE_MAX_TRIES` (3) failures.
3. **`getAcceptUrl` accepted only two exact query shapes.** Now tiered — exact params,
   then a link whose visible text is "accept", then any accept-ish parameter — logging
   which tier matched, and dumping every candidate link when none do.
- **Every gate now logs its reason** under `[JB][INVITE]`. This path was completely silent,
  which is why diagnosis needed guesswork. When it misbehaves again, read the console first.
- Gates that legitimately skip, in order: auto-toggle off · already handled · 2h post-accept
  cooldown (`cbLastOcAcc`) · another accept mid-flight · same id as last seen · older than
  15 min · no timestamp and id not newer. **Settings → Whitelist → "Clear Cooldowns" wipes
  all the persistent ones** — the first thing to try.
- Whitelist gotcha: `extractInviter()` returning null blocks the invite exactly as a
  stranger would. Safe direction, but it now logs the unparsed value.

### The three DTM controls are three different features (say so in the UI)
The user reported confusing them, so each now carries a `title`:
- **Ribbon `DTM`** (`st.autoDTM`) — auto-**accept** invites other people send you.
- **Panel `📋 DTM List`** (`st.autoDtmList`) — **advertise yourself** on `ocads.aspx`.
- **Panel `Create DTM`** (`st.createDTM`) — **start one yourself** and invite a partner.
- The no-XP limiter also gained a second trigger: `cfg.noXpStaleMin` caps an action that has
  gained no XP for N minutes despite firing. Off by default (needs a baseline gain first).

### DTM partner kick (`dtmMaybeKick` / `dtmKickParticipant`) — 2000.234, default off
Two situations, **not interchangeable**:
- **Pending invite** (nobody seated) — nothing to kick; clear state and re-invite.
- **Seated partner** (Kick button present) — can be kicked after a grace period.

**Observed page states (all verified live, 236/237):**

| State | name el | status | kick btn | invite field |
|---|---|---|---|---|
| Before DTM started | absent | absent | absent | absent |
| Started, nobody invited | present, **empty** | present, **empty** | absent | present |
| Invited, not accepted | `"notsosweet"` | `"Invited"` | **present** | absent |

Three consequences, all already handled — **do not "simplify" them away**:
1. **Test text content, never element presence.** The name and status elements exist while
   the seat is empty, so a presence check would conclude a partner is seated and try to kick
   an empty seat.
2. **The href id is inert — never use it.** It read `profile.aspx?id=817` on the EMPTY seat
   and the identical `id=817` once "notsosweet" was invited. It identifies neither the seat
   state nor the partner. The reference's `seatOpen` heuristic
   (`!liveName || /[?&]id=0\b/ || /open/i || !liveKick`) therefore relies entirely on its
   leading `!liveName` clause here — keep that first.
3. **An un-accepted invitee already occupies the seat and already has a kick button**,
   showing status `"Invited"`. So the pending-vs-seated decision must be made on **status**,
   not on kick-button presence. An earlier draft (236) split on the button, which would have
   funnelled every case into the "seated" bucket and left the Invite-timeout setting dead.
   Fixed in 237: `/invited/i` → `cfg.dtmKickWaitSec`, otherwise `cfg.dtmKickGraceSec`.
   The panel countdown mirrors the same choice.

Two safety rules, both load-bearing:
1. **Never kick a partner showing Ready.** They have bought drugs; kicking destroys the
   purchase and restarts the DTM.
2. **Re-check the seat live immediately before kicking.** The kick postback carries no
   participant id — it removes whoever is seated *at that instant*. A page open a few
   minutes is easily stale, and kicking on stale data ejects a good replacement partner.

- Re-invites are **capped at 3** (`cbDtmReinvites`). The reference can retry freely because
  it pulls a fresh partner off the classifieds board; we invite the ONE partner from the DTM
  modal, so retrying means asking the same absent person again.
- `repaintRibbon()` (2000.234) is published from `buildUI` so code that flips an action
  programmatically — daily limits, no-XP limiter, jail cap — repaints the ribbon. Before it,
  those buttons kept the old colour until the next page load and the panel disagreed with
  what Jarvis was actually doing.

### UI layout rule — where a setting belongs (2000.239)
**UI 1 is the front panel, used every day. UI 2 is Settings, for tweaking.** That split is
the user's stated intent, and it decides where anything new goes:
- **Front panel (UI 1):** the ribbon toggles, Status / Timers / Experience, the quick-toggle
  grid (Away, Crusher, Whitelist, Create OC, Create DTM, Watch, Props, Hover, SG lists,
  Alerts, Auto Travel, DTM List), and the counter strips. Things you flip or read daily.
- **Settings (UI 2):** intervals, thresholds, credentials, tuning. Things you set and forget.

**Keep a feature's settings in ONE place.** 2000.234 put the DTM kick timings in Settings
while partner / schedule / repeat lived in the front-panel Create DTM modal — the same
feature configured from two windows, which the user reported as confusing. The kick options
moved into the DTM modal in 239. Before adding a control, find where that feature already
lives and put it there.

**Settings is tabbed** (`.jb-tabs` / `.jb-pane`, `showTab()`), five panes:
`actions` (action selection, daily limits, crimes, GTA, booze, jail) · `assets`
(health, garage, scrap) · `alerts` (Telegram, logout) · `human` (breaks) · `system`
(appearance, login, keep-alive, performance, advanced, reset). It had grown to 18 stacked
sections in one scroll. The last tab is remembered in `cbSettingsTab`.
- The scrolling element is **`.jb-modal-content`**, not `.jb-modal-body` — setting
  scrollTop on the body does nothing.
- Panes were produced by reordering existing blocks, so **every control id is unchanged**
  and all ~100 handlers still bind. Keep it that way when moving things again.

### Themes + text size (2000.239)
- **Seven schemes**, listed in `THEME_LIST` (dark, light, classic, contrast, midnight,
  amber, ocean). The title-bar button cycles them; Settings → System → Appearance jumps
  straight to one. Both route through `applyTheme()` so the icon, the dropdown and the
  ribbon can't disagree — **ribbon colours are inline styles**, so they need `repaintRibbon()`
  after any theme change.
- **Text size** (`cfg.uiSize`: n/l/x) is a class on `.jb-root`, not a font-size change.
  Much of the panel carries inline `font-size:9px`/`10px`/`11px` written into the markup,
  so a plain root font-size moves almost nothing — the `.jb-lg` / `.jb-xl` rules use
  `!important` attribute-substring selectors to beat those inline styles, and widen the
  panel so nothing wraps. Ugly, and deliberate.

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

Later arc (abbreviated — see git log for 180–233):
- **2000.222–226** — XP tracking fixed. Two causes: `@name` carried the version so every
  release minted a fresh Tampermonkey entry with empty storage (222); and the interceptor was
  never fed, because under bot navigation a page rarely survives the game's own 15s status
  poll (226, on-demand `maybeForceStatRefresh`). **Removing that refresh in 221 was a mistake
  and cost the whole 222–225 arc — do not remove it again.**
- **2000.224** — status-bar XP fallback, verified accurate to 0.07 XP against a live payload.
- **2000.227–231** — post-jail pause, jail yield slider, Starvinggeeks read-only colouring,
  Watch as a true master switch, mail poll driven by its setting instead of a hardcoded 60s.
- **2000.232–233** — performance controls for the low-RAM tablet; teardown on `pagehide` as
  well as `beforeunload` (Android skips the latter, leaking an AudioContext + Worker + wake
  lock per page load). 232's XP sample/history caps were **removed** in 233 — lowering one
  silently destroyed stored chart history.
- **2000.234** — six features ported from the reference: anti-bot/soft-ban detection,
  scrap→FMJ, background heal, DTM partner kick, smart/random action picking, per-action daily
  limits. Also repaired three historical comments that earlier blanket `sed` bumps had
  rewritten to the current version, and fixed the release procedure that caused it (§2).
- **2000.242–247** — the XP attribution arc. See §4: `oc` was never tagged so every OC payout
  read as `other` (242); the status-bar fallback was *eating* gains, not just blurring them
  (243); bundled readings now say what they covered (244); XP polled at 20s to match the
  game's own 15s page timer (245); only real earners claim a reading (246); OC/DTM payouts
  reconciled against the game's own completion mail (247).
- **2000.248-249** — three items closed out of the §8 survey: ready reminders, witness mail,
  mod presence (no jail on Mod + mod-online break). Also **corrected §7**: the reference
  script *is* on disk in a sibling directory, and taking the old "not in this project" note
  at face value had produced a guessed witness pattern that was backwards.
- **2000.250** — the six bugs from the 249 review, plus Hold HQ (panic), hourly forum refresh
  and allied/safe invite gating. §8 re-surveyed against the reference's own settings menu
  rather than the second-hand 234 list. 107 assertions in
  `scratchpad/test-ready-witness-mod.js`.
- **2000.251** — HARD HALT: the ALL switch became a real power switch. See §4 — "off" now
  means no requests to the game at all, because a script that keeps polling while you are
  not answering a script check is evidence against you. 127 assertions.
- **2000.252** — Discord webhook for rank-ups and witness statements. Reverses the
  Telegram-only line by request. The URL is NOT hardcoded: the repo is public, and a webhook
  URL is a credential. 148 assertions.
- **2000.253** — Discord posts each event ONCE: master-tab only, seenOnce keyed by the event,
  a 60s content-hash guard, and a per-device switch for the one flood source a userscript
  cannot see. Test message clearly marked THIS IS A TEST. 169 assertions.
- **2000.278** — **Shot → heal and retreat to the HQ.** The automatic counterpart to the Hold HQ
  panic button, and the last real safety gap in §8. Detects the game's own "you got shot" mail,
  alerts with the shooter / ammunition / health lost, and — if you have opted in — heals to 100%
  and hides inside your network HQ.
  **It heals FIRST, unconditionally.** Every later step can legitimately refuse (no HQ city
  recorded, wrong city, travel switched off, damaged HQ), so the one thing that always helps must
  not sit behind any of them. The reference gets the same effect by calling its heal on five
  separate bail-out paths; doing it once up front cannot be missed when someone adds a sixth.
  **THE DAMAGE CHECK IS LOAD-BEARING**, exactly as in `doHoldHq`: if the building is destroyed
  while you are inside it, **you die**, so a damaged HQ refuses to be entered — and because we
  healed first, refusing still leaves you better off than when we started. Checked before the
  enter POST, not after; a test asserts that ordering.
  **Three separate switches, and the split is deliberate.** The ALERT is safe and defaults on;
  the RETREAT spends credits healing, so it is opt-in; TRAVELLING additionally buys a jail reset
  and a travel reset, so it is opt-in *again*. Hold HQ has always refused to travel on the same
  grounds ("stranding you somewhere under fire is your call") and this keeps that line.
  **Background fetch/POST throughout — it never navigates**, same reasoning as `bgHeal` (234): a
  page lives ~2.5s under automation, so a five-step navigating sequence would be torn up halfway.
  Jet only, never the 45-minute commercial plane that 255 removed on purpose.
  **A shot that cost no health gets no response**, and an unparsable body still ALERTS but never
  retreats — the whole decision rests on a health figure we would not have, and acting on an
  unknown would spend credits on a guess. Watermarked by mail id like the witness and payout
  notifications, so a first poll over an old mailbox cannot retreat over last week's shot.
  **`travelLabelOf()` / `travelMatch()` were lifted out of `doAutoTravel`** so the retreat resolves
  destinations with the *same* code rather than a copy — a second city matcher is exactly the drift
  that produced the duplicate `isInHot()` removed in 250, and this one carries the 259→263→264→267
  scar tissue that should not have to be rediscovered on a second path. Auto-travel calls
  `travelLabelOf(r, document)`; the only edit was making the `<label for>` lookup take a root.
  46 new assertions, 416 total.
  ⚠️ **Bullets and the same-IP DTM block were considered and dropped** — the user does not want
  bullet fetching, and **all four machines are on different IPs**, so there is no same-IP case
  between the accounts to block.
- **2000.277** — **Hold HQ did nothing while a break was running.** Every break gate in `mainLoop`
  returns, and the Hold HQ block sits **below** all of them — so pressing the panic button during
  a coffee break left you on the street being shot at because Jarvis was having a coffee. The
  Hold HQ comment already claimed it "outranks everything below it"; the ordering never agreed.
  A panic now bypasses the sleep, mod-break, coffee and lunch gates, exactly as a critically low
  HP already bypasses a break to heal — resting should not mean dying, and the whole point of the
  button is that something is happening *right now*.
  **Breaks are deferred, not cancelled**: a running one stays pending and resumes when the panic
  ends (Hold HQ caps itself at `cfg.holdHqMax`, ~1h), and no NEW break is started while hiding.
  **Deliberately still below the anti-bot and staff-check handling** — not getting banned
  outranks not getting shot (§4). One `hqPanic` const feeds both the bypass and the Hold HQ block
  so the two conditions cannot drift apart. 371 assertions.
- **2000.276** — **Cloudflare challenge solved, but Login never clicked.** The site now serves a
  Cloudflare challenge on some login visits. `checkLogin` will only submit when it has a token,
  and `getToken()` looked *only* at reCAPTCHA's `g-recaptcha-response` **textarea** — Turnstile
  writes to a differently-named hidden **input**, so the token read as empty and the submit
  condition could never open. The challenge was being completed and the button simply never
  pressed.
  `TOK` now matches **by shape as well as by name** — reCAPTCHA, Turnstile and hCaptcha
  explicitly, plus `[name*="turnstile"]` / `[name*="captcha-response"]` / `[name*="cf-chl"]` — so
  a provider swap or a renamed field cannot silently break it again. `getToken()` returns the
  first **filled** field, and `captchaDone()` accepts any provider's token instead of hardcoding
  one. The `tok !== lastTok` stale-token guard is untouched, so a single solve still cannot
  submit twice.
  **It logs the field names once per page** — `captcha response field(s): cf-turnstile-response
  [input] = FILLED`, or "no captcha response field found" — which is the diagnostic that was
  missing while this was being worked out. 360 assertions.
- **2000.275** — **the same Telegram message arriving twice.** The send queue has been
  at-least-once since 177, with a duplicate-suppression guard listed as optional ever since.
  Travel is its worst case: 257 deliberately moved the send to *just before* the flight
  navigates, so the page routinely dies in the ~100ms before the `200` is recorded and the item
  is retried on the next page.
  Now **at-most-once for ordinary messages**. An item is stamped `sentAt` when its request
  starts; any definite outcome (200 / 429 / error / timeout) either removes it or clears the
  stamp. A stamp still present on a **fresh page** therefore means the previous page began the
  send and died — Telegram almost certainly got it — so it is dropped rather than repeated.
  `_tgInFlight` is per-page and empty on load, which is what makes "started on a previous page"
  detectable at all.
  **CRITICAL messages are deliberately excluded** and keep at-least-once: a duplicated
  script-check alert is a nuisance, a missed one cost a 12-hour soft ban (§4). `sendTg(msg,
  critical)` — opted in by the critical-alert pump, `sendTgRepeat`, and the on-screen script
  check. **Any new must-not-be-lost alert has to pass `true`**; tests assert the existing three
  do. 349 assertions.
- **2000.274** — **"aimed at New York, landed in Paris" was MY CHECK, not the travel.** Travel was
  working the whole time. The arrival check reads the status bar on the **postback response**,
  which is still the pre-flight render — so it reported the **take-off** city as the landing.
  Paris was where TheBandit *left from*.
  **The origin was the missing piece.** With `cbTravelFrom` recorded at click time the three
  cases separate cleanly: showing the destination → arrived (silent); still showing the origin →
  the page has not caught up, say nothing and look again next tick, only complaining after
  `TRAVEL_SETTLE_MS` (90s) which would mean the flight genuinely did not happen; anywhere else →
  actually wrong, alert. A failed flight and a misrouted one are now different messages.
  **2000.273 is REMOVED.** It switched auto-travel off after two "wrong" arrivals — built on the
  false premise that travel was broken, it would have disabled a working feature on the strength
  of this very bug. 338 assertions.
  ⚠️ **The pattern to learn from: 259, 267 and 273 were all consequences of one wrong assumption**
  — that a difference between intent and the status bar means a bad flight. Two of the three
  "fixes" in this arc were repairs to damage caused by the check itself. **Before adding a
  verification step, be certain the thing you are reading is settled** — on this site a postback
  response carries the OLD status bar, and nothing about it looks stale.
- **2000.273** — *(superseded by 274 — the auto-off was removed; see above.)* Originally: two wrong arrivals in a row switched auto-travel OFF. A wrong flight used to
- **2000.272** — diagnostics only. The takeoff confirmation now logs the **value and resolved
  label** being posted, not just the element id: when a flight still lands in the wrong city the
  only question that matters is *what was actually submitted*, and an id alone cannot answer it.
  ⚠️ **THE FOUR DEVICES RUN DIFFERENT VERSIONS.** Tampermonkey checks for updates on its own
  schedule (roughly daily), so with releases going out several times a day the four players can
  easily be several versions apart. **Always establish which version a report came from before
  diagnosing it** — a "wrong city" report from a device on 267 is the bug 268 already fixed, and
  chasing it in current code finds nothing. Ask for the version in the panel title bar first.
- **2000.271** — **buying the Armoured Vehicle never fired.** Checked against the reference's
  `handleScrapPage` (§7): the link id, the postback target and the ordering are identical — but
  **two gates of our own sat in front of it**, and neither exists in the reference.
  1. **`scrapDue()` required `cfg.scrapOn`.** The protection is bought ON the scrap page, so with
     "Convert scrap to FMJ" off nothing ever navigated to the store — ticking "Buy Armoured
     Vehicle protection first" on its own did *literally nothing*, despite the UI presenting them
     as independent switches. Either may now trigger the visit.
  2. **The reserve floor bailed out first.** `cfg.scrapFloor` (settable to 10000) returns
     "nothing to convert" and leaves, and it sat ABOVE the protection block — so any reserve
     above your scrap balance made the vehicle permanently unreachable. The floor exists to stop
     repeated FMJ conversion draining scrap; **a one-off 5-scrap purchase is not that**. The
     reference has no floor here at all and checks only that you can afford the 5.
  Ownership is now recorded (`cbArmVehDone`) — set on purchase, and inferred when the protection
  link is absent while the FMJ link is present (the page rendered, so it is already owned) — so
  "protection only" stops bringing us back. If only the protection was wanted, it stops before
  converting any scrap. 333 assertions.
- **2000.270** — **"if 1 GTA is 0.08, how is 2 crime + 2 GTA also 0.08?"** Because the figure is
  the **delta between two readings**, and the list beside it is every action **attempted** in
  that window — not what each one earned. A failed crime earns nothing; a booze **BUY** earns
  nothing (only the sale does) yet still queued an entry, so `booze×2` read like two earning
  events when it was one buy and one sale. `snapshotXP(action, note)` now takes a separate
  coverage label: the mix shows `booze-buy` / `booze-sell` while **attribution is unchanged**
  (both still credit `booze`, so the per-action bars do not split).
  **The console now logs the raw pair** — `raw 711.9214 → 712.0014 | covered 7 (crime×3,
  booze-buy, booze-sell, gta×2)`. A constant `+0.08` across wildly different action counts is
  either "only one of them actually earned" or "the feed moves in fixed steps", and those are
  **not distinguishable from the rounded panel figures**. Measure it before changing anything.
  322 assertions.
  ⚠️ Deliberately NO change to attribution here. The obvious move — splitting the gain across
  the covered actions — would invent numbers, and §4 already records why that was rejected
  in 244. Instrument first.
- **2000.269** — **SG colours only appeared after toggling the switch off and on, and vanished
  on the next page.** `fetchSgLists` stamped its 5-minute throttle **before** the awaits.
  Jarvis navigates every couple of seconds, so the page died mid-fetch, the lists were never
  stored — and the stamp then blocked every retry for five minutes. Every later page load
  skipped the fetch with nothing to colour. Toggling calls `fetchSgLists(true)`, which bypasses
  the throttle, which is exactly why off-and-on "worked".
  Now **two clocks**: `cbSgLastOk` gates the 5-minute freshness and only advances when a list
  actually arrived; `cbSgLastTry` merely stops a dead endpoint being hammered (30s). **With no
  list data at all the freshness gate does not apply** — having nothing to colour with is not a
  state worth preserving. Modelled over a 5-minute run at one page load per 2.5s: the old path
  gets exactly **one** fetch per window, so an interrupted one leaves colours absent for the
  whole of it.
  Also: colours are set **`!important`** (the game sets its own inline colours on these links —
  your name `#AA0000`, staff `#FF9900` — so a plain assignment loses when a row re-renders), and
  it repaints on `window.load` and once more at +1.2s, because one paint at DOMContentLoaded can
  land before the last rows exist and the MutationObserver only sees childList changes.
  314 assertions.
  ⚠️ **Fourth instance of the same root shape this session**: work scheduled or stamped BEFORE
  the thing it guards, on a page that lives ~2.5 seconds (257 postback, 258 timers, 260 polling,
  269 throttle). When touching anything with a timestamp or a timer here, ask first: *does this
  survive a navigation?*
- **2000.268** — **aimed for Toronto, landed in Amsterdam — a REAL wrong-city flight.** The
  destination radio was set with `.checked = true`, then **0.5–1s passed** before Travel was
  pressed, and **nothing confirmed the selection had stuck**. If the page re-renders in that
  window — or the form simply retains an earlier selection — that city flies instead.
  **Amsterdam was the previously cached hot city**, which fits exactly.
  Two changes: the radio is now selected with **`click()`** (native, so the browser clears the
  rest of the group and fires the events the page may be listening for — assignment does
  neither), and the live `:checked` radio is **re-read immediately before takeoff**. If it is
  not ours it re-asserts once; if it still will not hold it **refuses to fly**. Same rule the
  DTM kick has always followed: re-read live state right before an irreversible act, never
  trust what was true a second ago. A refused flight costs nothing; a wrong one costs the
  20-minute cooldown and the city. 302 assertions.
  Travel alerts also carry **city names only** — no prices — since 267 stores `hotCity` rather
  than `near[0].label`; a test now asserts no travel alert interpolates the label.
- **2000.267** — **the arrival check cried wolf after every SUCCESSFUL flight.** 259 stored
  `near[0].label` as the intended destination — the whole row, `"Toronto - Canada - $58,170 /
  $232,680"` — then compared it for **strict equality** against `getCurCity()`, which returns
  just `"Toronto"`. Those can never be equal, so "⚠️ Travel went wrong" fired *because* travel
  had worked. Now stores the plain city and compares tolerantly both ways, exactly like
  `isInHot()`. 287 assertions.
  ⚠️ **A false alarm on the happy path is worse than no alarm at all** — it trains you to ignore
  the one message that would matter if it were ever real. Third self-inflicted fault from the
  259 hardening (after breaking travel outright in 259 and misreading the empty list in 264):
  that change added four behaviours at once and each was verified by reading, not by running.
- **2000.266** — **"the webhook worked when we added it but not this morning" — four ways a
  Discord post went missing, three of them silent.**
  1. **The setting we told you to set wrong.** 252/253 said "leave this ON for one device and
     OFF for the rest"; each device is a different PLAYER, so that mutes an account outright.
     265 fixed the wording — **wording does not un-flip a switch.** A one-time repair
     (`cbDcDeviceAdviceFixed`) turns it back ON once, loudly, and never touches it again.
  2. **`dc.thisDevice` and `tabs.isMaster` refusals were `dlog()`** — invisible unless verbose
     debug was on. A post silently not happening is precisely what you need to see; both are
     plain `console.warn` now, naming the bucket.
  3. **A non-master tab consumed the rank transition.** `updateTimers` runs in EVERY tab and
     wrote `cbRankLastName` from any of them, so a non-master tab could see the change, store
     the new name, then be refused by `dcSendOnce` for not being master — and the master tab,
     re-reading the already-updated name, saw no transition at all. **The rank-up vanished with
     no post anywhere.** Only the tab allowed to announce a change may now record it.
  4. **The 50-item queue is SHARED with Telegram**, which is far higher volume (~28 categories).
     The blind oldest-first eviction could throw away an unsent Discord post during a Telegram
     burst. `_capTgQ()` now evicts Telegram items first and only drops Discord ones if the
     queue is entirely Discord.
  279 assertions. ⚠️ Note 3 is the interesting one: it needs **two tabs** to reproduce, which is
  why it looked intermittent rather than broken.
- **2000.265** — **the four-devices wording finally corrected IN THE SCRIPT.** §1 and §4 were
  fixed on 2026-08-16 when the user pointed out the four installs are four different PLAYERS,
  but the in-script text still told you to "leave this ON for one device and OFF for the rest"
  — advice that, followed, **silences three players outright**. Corrected in all five places:
  the `dc.thisDevice` comment, item 4 of the POST ONCE list, the checkbox tooltip, the Discord
  help paragraph, and a stale test label. The switch stays (a per-account "don't post from
  here" is a reasonable want) but is now explicitly **not** a duplicate guard — the real ones
  (master tab, `seenOnce` by event, 60s content hash) are all per-device and unaffected.
  Tests now assert the harmful strings cannot come back. 268 assertions.
- **2000.264** — **"couldn't identify Toronto" was a COOLDOWN, not a missing city.** Travel
  worked on 261 and still produced that error, which rules out the label-resolver theories of
  259 and 263. The real path: the local countdown said Ready, Jarvis navigated to travel.aspx,
  and the game served a page with **no destination list at all**. With `radios` empty, `cities`
  is empty, "nothing matched" is trivially true, and the message blamed the city — so a TIMER
  problem was reported as a MATCHING problem. That single misleading string is what sent two
  releases rummaging through `labelOf()`.
  Zero radios now never reach the matcher: the guard clears the pending flag, **re-reads the
  real cooldown** (`fetchTravel` + `bgSetDue('travel', 0)`) so the local countdown resyncs,
  says plainly that the game is not offering travel, and does **not** fire the city-not-found
  alert. The `unlabelled` readout can no longer claim "labels unreadable" when there were no
  destinations to label. 260 assertions.
  ⚠️ **THE LESSON OF THIS WHOLE ARC — read this before diagnosing anything.** Three releases
  (259, 263, 264) chased one error message. 259 and 263 both hardened the destination matcher;
  neither was the bug. The message named the wrong subsystem, and each fix was reasoned from
  the code rather than from evidence — the console line that would have settled it in seconds
  was never asked for. **An error message that names the wrong cause is worse than no message.**
  Make failures say which branch produced them, and get the observation before writing the fix.
- **2000.263** — **the 259 city matcher refused to fly at all: "couldn't identify Toronto in
  the destination list".** 259 step 4 resolved a label with `closest('td,li,span,div')`, which
  finds the **innermost** container. The radio commonly sits in its OWN cell with the city name
  in a **sibling** cell, so that container held one radio and no text — every destination came
  back unlabelled, nothing matched, and it refused. **The refusal was right; the resolver was
  wrong.** It now CLIMBS from the radio, stopping the moment an ancestor would hold more than
  one radio — which is the original 259 bug this guard exists to prevent, so climbing keeps the
  guard and closes the blind spot. Bounded to 6 levels. Verified against all three layouts:
  radio-alone-in-its-cell, radio-beside-the-text, and the shared container that must never let
  one radio claim every city.
  The refusal message now distinguishes **"no destination matched"** from **"NO labels could be
  read at all"** — they look identical from outside but the second is a markup problem in
  `labelOf()`, and not saying which is why this took days to pin down. 252 assertions.
  ⚠️ **Second time in this arc that hardening broke the thing it was hardening.** 259 was
  written for a bug the user never had (the real one was the stale hot city, 261), and its
  stricter matcher then stopped travel outright. Prefer a diagnostic that names the failure
  over a guard that silently refuses.
- **2000.262** — **script/staff checks now go to Discord as well as Telegram.** The ban-risk
  events — inbox script check, on-page staff check, staff mail, anti-bot/soft ban — get a red
  embed with sirens and a marquee row. **Hooked into `queueCriticalAlert`, not into each
  caller**, because that is the one funnel every ban-risk event already passes through, so a
  new kind of check is covered by construction. Posted **once** per check (the queue's key
  dedup plus `dcSendOnce`); only Telegram repeats, since a channel other people read should
  not be hammered. Sits BELOW the already-pending return so a re-queue can't re-post, and
  `queueCriticalAlert` remains **un-gated by the halt** — a queued check must still go out
  while stopped (§6).
  **The "flashing lights" is the MENTION, and that is not decoration.** An embed on its own is
  silent; a mention is the only part that pushes a phone notification. `dc.mention` is blank
  by default — `@everyone` in a shared channel is other people's problem too — and takes
  `<@userid>`, `<@&roleid>`, `@here` or `@everyone`. `allowed_mentions` is declared explicitly
  rather than left to the webhook default, so a ping happens on purpose or not at all. The
  **test post deliberately includes the ping**: a mention is the one thing that can be
  misconfigured silently, and a real script check is the worst possible moment to discover it.
  `dcFromTgText()` converts the existing Telegram markup (`<b>`, `<pre>`, entities) to Discord
  formatting, so both channels carry the same words without a second message body to maintain.
  244 assertions.
- **2000.261** — **THE STALE HOT CITY — this was the real "auto-travelled to a non-hot city".**
  Caught live: the panel read `Hot: Amsterdam (in Sydney)` while Sydney was actually hot, and
  auto-travel was about to fly to Amsterdam. **The destination pick was never the problem**
  (see 259, which hardened it against a bug that may not have been the trigger) — the STORED
  CITY was wrong, and *nothing could ever correct it*. Three compounding faults:
  1. **`getHot()` failed toward stale.** It expired only on `until > 0 && now > until`, so a
     missing, zero or `NaN` expiry made that false and it returned the cached city **for
     ever**. One bad write and the only way back was the manual Refresh button.
  2. **`fetchHot()` returned early whenever a city was cached**, so it never re-checked.
  3. **`midnightCET()` formatted a date to a string and parsed it back** — implementation-
     defined, and an Invalid Date gives `Date.now()+NaN`, stored as the literal `"NaN"`,
     which is exactly fault 1. Now reads the clock fields via `formatToParts` (as
     `gameDayStr()` already did) and **cannot return NaN on any branch**.
  `getHot()` now treats anything that isn't a usable future timestamp as expired and enforces
  `HOT_MAX_AGE_MS` regardless of what the expiry claims — **fail toward re-reading**, because
  a wrong hot city costs a 20-minute cooldown and leaves you in the wrong place while a
  re-read costs one GET. And the city is now **re-read in the background every
  `HOT_REFRESH_MS` (15 min)** via `fetchHotBg()` — `scrapeHot()` already took a document, so
  it works on a fetched one — instead of once a day by NAVIGATING to the statistics page.
  `fetchHot()` no longer navigates at all. A change is announced rather than swapped silently.
  227 assertions.
  ⚠️ **Note the diagnostic lesson**: 259 fixed a real defect in the destination matching that
  was almost certainly *not* what the user hit. The symptom said "flew to the wrong city" and
  the search went to the code that picks the city, not to the code that decides which city is
  hot. Check what the input actually was before hardening the consumer of it.
- **2000.260** — **the travel timer read the COMMERCIAL cooldown while we fly jet-only.** The
  user's own diagnosis — "it was working well until we removed the 40m travel time" — and
  they were right. `travel.aspx` states **two** cooldowns: *"It is 0 hours 45 minutes and 0
  seconds before you can travel commercially. Private Jet: 0 hours 15 minutes and 0 seconds
  remaining."* All five of `fetchTravel`'s duration patterns match the **commercial**
  sentence (it is the one saying "before you can travel"). That was correct while we flew the
  commercial plane; **2000.255 made us jet-only and left the parse alone**, so ever since,
  Jarvis sat out the 45-minute commercial timer while the jet had been ready for ~25 minutes
  — and the panel jumped, because we store 20m after our own flight and the next fetch
  overwrote it with the commercial 45m. Now parses the jet line (`available in` / `remaining`
  / *"is now available"*), keeps the commercial figure as `comm` for reference only, and
  treats an **enabled `btnTravelPrivate` as authoritative** over both numbers — the game
  enables it exactly when you may fly, so it can't be out of step with the wording. An
  unreadable jet line falls back to the commercial number *with a warning* rather than
  claiming Ready. Wording taken from the reference script's `parseTravelCooldownFromPage`,
  which has had this right all along — **read it before guessing** (§7).
  **Also: polling is now expiry-aware.** These are countdowns we already hold —
  `getTravel`/`getOc`/`getDtm` derive the remaining time locally — so re-fetching during a 2h
  OC re-learns what we could compute for free. `bgGapFor()` schedules the next check for just
  after the timer is due (the reference's `scheduleNext('hotcity', remaining + 10)` pattern),
  jittered, **never shorter than `bgPollSec`** so it can only reduce traffic, and capped at
  `BG_QUIET_CAP` (10 min) so a change we didn't cause still gets re-synced. This is the
  answer to the original "travel checks the page too often", which **2000.258 had made worse**
  by taking it from "rarely, sometimes never" to a reliable 60s. 213 assertions.
- **2000.259** — **auto-travel flew to the wrong city.** The label for each destination radio
  was read as `r.parentElement?.textContent` — the text of the WHOLE parent. Whenever the
  radios share a container (flow layout, or a `<tr>` in a horizontal `RadioButtonList`) that
  string holds **every** city name, so `label.includes(hotCity)` was true for the FIRST radio
  and the loop broke there: it flew to the first city on the page whatever was hot,
  consistently. The `tr` in the old `closest('td,tr,label')` fallback is the giveaway — a
  `<tr>` in that control holds all of them. `labelOf()` now resolves per radio, strongest
  link first (`label[for=id]`, then a wrapping `<label>`, then the following text node), and
  **refuses any container holding more than one radio** — the guard the old code lacked.
  Matching is exact → prefix → substring, and **refuses unless exactly one destination
  matches**, because a plain substring test would let a hot city of "York" take "New York",
  first row at that. A wrong flight costs the 20-minute cooldown as well as the city, so
  guessing is never the right move. Two diagnostics that were missing: every destination and
  its resolved label is logged, and the **intended city is stored before the click and
  compared against where you actually land** (`cbTravelWanted`), alerting on a mismatch —
  before this, a wrong flight looked exactly like a right one unless you happened to be
  watching. 200 assertions.
- **2000.258** — **the OC/DTM/travel/protection timers took minutes to appear, with no upper
  bound.** Every background fetch was scheduled by a timer created fresh in `startTimers()`
  on each page load and cleared by `teardown` on the next navigation: `setTimeout` at 3s
  (OC+DTM), 4s (travel) and 5s (protection), plus a 60s `setInterval`. **A page lives about
  2.5–3 seconds while Jarvis is working** — `init` schedules the first loop tick at 1.5s, the
  loop acts, it navigates — so the 4s and 5s timeouts usually died with the page, the 3s one
  was marginal, and **the 60s interval could never fire at all**: nothing survives sixty
  seconds under constant navigation. Travel and protection were only ever fetched on the odd
  occasion Jarvis sat still for five seconds, which is why the panel could show `—` for
  minutes on end. Replaced with the pattern the rest of the file already uses for anything
  that must outlive a page (ready reminders, forum refresh, XP report, scrap backoff): a
  **stored due time tested on a tick** (`cbDueOcDtm` / `cbDueTravel` / `cbDueProt`,
  `maybeBgFetch`), called from `mainLoop` so it runs ~1.5s into every page load. **One fetch
  per tick** in priority order, which staggers them naturally at the loop's ~2–3s cadence —
  what the old 3/4/5s offsets were reaching for without depending on the page living that
  long. The due time is stamped **before** the fetch so a failure or a mid-flight navigation
  costs one cycle rather than retrying every tick. The intervals remain only as a backstop
  for a genuinely still page, shortened to ≤15s and routed through the same gate — a fetch
  must never again sit behind a timer longer than a page lives. 189 assertions.
- **2000.257** — **auto-travel looped on the postback: the travel page reloading ~once a
  second for about 15 seconds, every lap a real travel POST.** Every piece of bookkeeping in
  `doAutoTravel` sat in a `setTimeout` AFTER `travelBtn.click()`. That click is an ASP.NET
  postback — it reloads the page and destroys those timers, so `cbTravelPending` was never
  cleared and the 20-minute cooldown was never stored. The reloaded page therefore found
  pending still `'1'` and the timer still reading Ready, and clicked the jet again. **It only
  ever stopped by luck**: `startTimers` fires `fetchTravel` 4s after each page load, and
  eventually one survived long enough to write the real cooldown. This is the identical
  failure `handleDtmPage` has guarded against for years ("set the guard SYNCHRONOUSLY before
  the click triggers postback") — travel did the opposite. Everything now happens **before**
  the click, which is the last statement in the branch, and `LS_TRAVEL_ACTED` /
  `TRAVEL_RETRY_MS` (30s) stop a refused flight being retried on a loop once `fetchTravel`
  hands "ready" back. Storing the cooldown before knowing the flight was accepted is the safe
  direction: `fetchTravel` corrects it moments later, and since 255 an unparsed cooldown can
  no longer be misread as Ready. 178 assertions — the new ones read the source and assert the
  ORDER, since that is exactly what a refactor would quietly lose.
- **2000.256** — **ALL back ON switched things on that you had deliberately left off.** The
  handler ran `ALL_ST_KEYS.forEach(k => st[k] = v)` in BOTH directions: off was right, on set
  every flag TRUE, so Create OC, Create DTM, auto-travel, DTM list and the crusher all came
  on regardless of their previous state — and four of those navigate, so the next tick would
  start driving somewhere. Off now **snapshots** the selection to `cbAllWasOn` first (skipped
  if already halted, so a good snapshot can't be overwritten with the all-false state), and on
  **restores exactly that**. With no snapshot — an install halted before 256 — it leaves every
  flag alone rather than defaulting them on, because guessing "all on" is the bug being fixed.
- **2000.255** — **the travel timer read Ready while a cooldown was running.** When none
  of `fetchTravel`'s five duration patterns matched, it fell through to a "can I travel?"
  test satisfied by the destination radios or the Travel button merely EXISTING — and the
  game renders that form on the cooldown page too, button disabled, wait message above it.
  Any unparsed wording therefore became Ready, and auto-travel would set off for a flight
  the game would refuse. Two fixes: `TRAVEL_WAIT_RE` lets a wait message **veto** ready even
  when the duration can't be read (and logs the raw text so the patterns can be widened),
  and the ready test now requires a button that is **enabled**, not merely present. Also
  **jet only** — the 45-minute normal plane is removed by request, and when the jet is
  unavailable Jarvis says so and stays put rather than falling back to it.
- **2000.254** — `SKIP_PAGES` emptied so Jarvis runs on every authenticated page, to stop
  losing XP readings while parked on one. The array and its matcher are left in place, with
  the old entries listed in the comment, so any page can be re-added. **Note the history:
  2000.225 already tried this for the same reason and it did not fix XP capture** — timing
  did (226, 245). The real change here is behavioural: the forum, personal and the four
  statistics pages were the ones you could browse by hand without being navigated away, and
  now you will be. Also corrected the four-installs-one-account premise in §1/§4.

---

## 6. Behaviour guarantees worth preserving

- **Never auto-answer a staff/script check** — alert only.
- **Actions never fire before the game cooldown** (the cadence is floored at the interval).
- **Critical alerts and Telegram sends must survive page navigation** — don't refactor them
  back into one-shot `setTimeout` / fire-and-forget sends.
- **"ALL off" must mean NO requests to the game.** Not merely "the actions are unticked" —
  see the HARD HALT section in §4. Anything new that polls or navigates has to be gated on
  `isHalted()`, and the tests in `scratchpad/test-ready-witness-mod.js` enforce it.
- **Never gate the Telegram or critical-alert queues on the halt.** A queued script-check
  alert has to keep going out while you are stopped.
- **`Jarvis.meta.js` must always mirror the header exactly** after a release.

---

## 7. Constraints / off-limits / things to know

- **Moderator reference script** ("teddybear" / Ragefour TMN Bot): the source of the ported
  features. **The full source IS on disk — read it before guessing.** Two copies, both
  siblings of this repo, neither inside it:
  - `../superscript from owner/TMN Bot — v4.20 dtm-oc-mail-4.20.252.user.js` — newest, use this
  - `../Rage/TMN Bot — v4.20 dtm-oc-mail-4.20.224.user.js` — older
  This file said "not in this project — ask the user to re-share it" until 2000.248, and that
  was taken at face value: the witness pattern was *guessed*, and guessed the direction
  backwards (see §4). **`ls ..` before you conclude something isn't available.** Reading it is
  fine; what stays off-limits is the outbound telemetry below.
- **Worker coordination** (`tmn-tf-ocdtm.teddybear.workers.dev`): the user can *use* this but
  has **no consent to alter** it — don't touch/replicate it.
- **`starvinggeeks.net/helper/`**: the user has consent + IP allowlisting. Three list endpoints
  return JSON name arrays: `safe.php`, `allied.php`, `watched.php`. Re-added in **2000.228** as
  read-only list colouring (`@connect starvinggeeks.net` is back in the header — that's why it's
  33 lines now). **Strictly one-way: down.** Never port `add-player-profile.php` (profile push)
  or the reference script's 12s Cloudflare-worker check-in telemetry — the user has been explicit
  about this.
- **Separate standalone scripts** the user also runs (Bullet Sniper, Property Drop Monitor,
  Bulk Kill Search, etc.) are **NOT part of Jarvis** — don't fold them in.

---

## 8. Open / optional items (offered, not built)

- **Immediate XP baseline:** replay the status-refresh request once on load so Total shows in
  seconds instead of "after a while".
- **Third cadence mode** ("Nearby") between Away and At PC, as a 3-way cycle.
- **Configurable critical-alert cadence** as a settings control.

### Still in the reference script, not ported (re-surveyed 2000.250)
Taken from the reference's own settings menu — dump it with
`grep -oE '\{ *key: *"tmn[A-Za-z0-9_]+", *label: *"[^"]+"' <reference> | sort -u`, which is
the definitive inventory. The pre-250 version of this list was written second-hand against
4.20.215 and had drifted: several entries below were listed as pending but don't exist in
4.20.252 under any name (random noise visits, idle→mailbox check, hard daily start/end
schedule, secondary-tab overlay, credits restyling, self-update check). Run-hours/break-hours
*does* exist (`BREAK_MIN_HOURS`).
- **🔫 Bullets** — factory buy + travel-to-bullet-city. The biggest untouched block.
- **💥 Shot notification** — mail alert when you're shot. Subjects are already known:
  `/you.*got shot/i`, `/shot you/i`.
- **Shot → retreat to HQ** (`handleShotHQ`: buys jail + travel reset, travels to a saved HQ
  city, heals). `bgHeal` is its dependency and now exists. **Hold HQ itself shipped in 250** —
  `handleShotHQ` is the automatic counterpart to that manual panic button.
- **💰 OC payout** — auto-pays the team after a completed OC
- **OC start/creation — deliberately NOT a candidate.** Jarvis has its own OC setup flow
  (`triggerCreateOC` / `handleCreateOC`, unchanged since 210), and the reference's equivalent
  is labelled `🎯 OC Start-WIP` in its own settings menu, i.e. unfinished by its author.
  Ours is the better implementation; don't propose porting theirs. Note `?p=oc` is a valid
  query form — OC/DTM are discriminated by `/p=dtm/` on the search string at six call sites,
  so `?p=oc` resolves to OC correctly (verified live, 237).
- **NTFY** as an alternative alert channel. (Discord shipped in 2000.252 for rank-ups and
  witness statements — see §4. Extending it to other events is straightforward: add an embed
  builder and a toggle.)
- **Camouflage:** breaks modelled as run-hours/break-hours; logo replacement

**Shipped in 2000.248–250** (were on this list): witness alerts, ready reminders, no jail on
Mod, mod-online break, Hold HQ (panic), hourly forum refresh, allied/safe invite gating.
See §4. The witness patterns, the `#FF9900` staff detection and the Hold HQ safety rules all
came from the reference source, which **is on disk** — see the corrected §7. Read it rather
than reasoning about it second-hand; that is exactly what produced the drift in this list and
the backwards witness pattern in 248.

**Deliberately never porting** (see §7): player DB push, dead-players push, fleet check-in.
All outbound.

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
head -33 Jarvis.user.js > Jarvis.meta.js          # recount 33 if header changed
diff <(head -33 Jarvis.user.js) Jarvis.meta.js    # must be empty
```

Edit surgically, validate often, keep British English, and always rebuild the meta file.
