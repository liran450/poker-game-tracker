# Build Plan

The specification lives in `docs/01`–`docs/10`. This file turns it into an ordered list of
**build steps**. It is the *what* and the *in what order*. It does not record progress —
[`PROGRESS.md`](PROGRESS.md) is the only place status lives, so the two can never disagree.

## How a step works

A step is a unit of work sized so that one focused session can finish it **completely and
correctly**, including its tests, rather than leaving a half-wired seam for the next session to
trip over. That is the whole sizing principle: a step ends with something that is provably
finished, not something that is "mostly there".

Every step has:

- **Goal** — one sentence, the reason the step exists.
- **Depends on** — steps that must be `done` first. Do not start a step whose dependencies aren't.
- **Build** — the concrete deliverables.
- **Exit criteria** — checkable statements. Every one must be true before the step is `done`.
  If a criterion can't be met, the step stays `in progress` and the blocker goes in `PROGRESS.md`.
- **Out of scope** — the things that look like they belong here but don't. This is a guard against
  the single biggest failure mode: a step that quietly grows until it's too big to verify.

**Rules that apply to every step, without exception:**

1. The step is not done until `npm run verify` (typecheck + lint + unit tests + build) is green.
2. Each step ends with a commit and a push to the working branch.
3. Anything learned that would change how a *later* step is built goes into
   [`NOTES.md`](NOTES.md) before the step is closed. This is not optional bookkeeping — it is the
   mechanism that stops the same mistake happening twice.
4. No step invents product behaviour. If the specification is silent or ambiguous, the question
   goes in `NOTES.md` under *Open questions raised during build* and the user is asked. Guessing
   and moving on is how a spec quietly becomes fiction.

---

## The steps at a glance

| # | Step | Ships |
|---|---|---|
| 0 | Plan and memory scaffolding | Nothing user-visible |
| 1 | Toolchain and app skeleton | An empty, deployable, installable PWA |
| 2 | Money core | Correct arithmetic and a `<Money>` that never renders backwards |
| 3 | Design system primitives | The component inventory, in isolation |
| 4 | Event model and fold | The pure heart of the data model |
| 5 | Local persistence and the outbox | Offline durability, sync indicator wired to a stub |
| 6 | Game setup, player list, add-players sheet | You can start a game and seat people |
| 7 | The buy-in counter and the game page | 🎯 **The napkin replacement** |
| 8 | Settlement core | Pure money math, over-tested |
| 9 | End game, edit mode, share text | ✅ **Complete offline app for one host** |
| 10 | Database foundation and RLS | Schema and permissions, not yet wired |
| 11 | Snapshots, statistics source, retention | Permanent tables and the server functions |
| 12 | Auth and cloud sync | Games leave the phone |
| 13 | Sharing, viewers, join requests, takeover | Other people get in |
| 14 | Groups, roles, private games | חבורה |
| 15 | Statistics | Personal, group, and the seven fun stats |
| 16 | Retention live, deletion, export | The irreversible one |
| 17 | Polish and v1 sign-off | Definition of done |

Steps 1–9 need no Supabase account and no network. Step 9 is a legitimate stopping point: at the
end of it the app is complete for a single host with no account, which is what
[`09-roadmap.md`](../09-roadmap.md#milestones) calls the end of M2.

---

## Step 0 — Plan and memory scaffolding

**Goal.** Give every future session a plan to follow and a memory to read, so no session starts by
re-deriving what the last one decided.

**Depends on** — nothing.

**Build.**
- `docs/build/PLAN.md` (this file), `PROGRESS.md`, `NOTES.md`.
- `CLAUDE.md` at the repo root: what the project is, the non-negotiable rules, the memory protocol,
  the commands. Lean at first; each step appends what has become true.

**Exit criteria.**
- [ ] A session that reads only `CLAUDE.md` knows which step is next and where the rules are.
- [ ] `PROGRESS.md` lists all 18 steps with a status.

**Out of scope.** Any code.

---

## Step 1 — Toolchain and app skeleton

**Goal.** Every foundational decision that is cheap now and miserable to retrofit
([`09` M0](../09-roadmap.md#m0--foundations)) lands before a single feature does.

**Depends on** — 0.

**Build.**
- Vite + React + TypeScript, `strict` on, path aliases, the folder layout from
  [`02 — Repository layout`](../02-architecture.md#repository-layout) created empty.
- **SCSS modules** wired in Vite with `camelCase` class-name conversion; a reset file; the design
  tokens from [`11`](../11-visual-design.md) as SCSS variables in one place. A **stylelint** rule
  that fails the build on physical properties (`left`, `right`, `margin-left`, `padding-right`,
  `border-top-left-radius`…) in favour of their logical equivalents, and an ESLint rule banning
  the `style` prop.
- `i18next` + `react-i18next`, a single `he.json`, `<html lang dir>` set at runtime **from the
  locale**, never hardcoded. An ESLint rule banning literal user-facing strings in components.
- A **pseudo-locale** (`en-XA`: LTR, ~40% longer) selectable in dev. This exists from day one so
  that every screen built afterwards is checked against it as it is built, not audited at the end.
- Self-hosted Rubik or Heebo, subset to Hebrew + Latin + digits, with `font-variant-numeric:
  tabular-nums` as the default for numerals.
- Vitest + Testing Library; Playwright installed and configured against the pre-installed Chromium
  (`PLAYWRIGHT_BROWSERS_PATH`), with one smoke test.
- `vite-plugin-pwa`: manifest, service worker, offline fallback page, icons. **No install prompt
  yet** — [`02`](../02-architecture.md#what-pwa-costs-us-on-ios) says prompt after the first
  completed game, which does not exist until step 9.
- **Hash router** (`/#/game/123`). Not history routing — GitHub Pages has no SPA fallback and the
  `404.html` trick breaks share links in in-app browsers.
- `npm run verify` = typecheck + lint + test + build.
- `.github/workflows/deploy.yml`: verify, then deploy to Pages on the default branch.
- Dark theme as the default target, light theme structurally present, from
  [`10`](../10-design-brief.md#visual-direction).

**Exit criteria.**
- [ ] `npm run verify` green from a clean clone.
- [ ] The deployed Pages URL loads, installs to a home screen, and shows the offline page with the
      network off.
- [ ] The document direction flips to LTR when the pseudo-locale is selected, with no code change.
- [ ] The lint rules actually fail: a deliberate `margin-left`, a deliberate `style={{…}}` prop and
      a deliberate literal string each break the build. Verify by writing them, watching it fail,
      and removing them.
- [ ] No component contains a raw hex, a magic pixel value, or an inline style. Every value comes
      from the token variables.

**Out of scope.** Any game concept. Any Supabase. Any real screen.

---

## Step 2 — Money core

**Goal.** Make it impossible to get money wrong, and impossible to render an amount backwards.

**Depends on** — 1.

**Build.**
- `core/money.ts`: integers in the currency's **minor unit**, never floats
  ([`03`](../03-data-model.md#money-representation)). Add, subtract, sum, negate, split-with-residue,
  compare. A branded `Minor` type so a raw `number` cannot be passed by accident.
- Chip arithmetic: buy amount, chips per buy, derived chip value, chips ⇄ money in both directions,
  with the rounding rules from [`05`](../05-settlement.md#rounding-and-precision).
- Formatting through `Intl.NumberFormat`, keyed on the active locale **and the game's currency
  code**. Never a hardcoded `₪`. Currency is a label that is never converted.
- `<Money>` — [`10`](../10-design-brief.md#component-inventory) calls it the most important
  component in the app. Signed, LTR-isolated with LRI/PDI, tabular figures, size variants,
  positive/negative treatment that is **never colour alone** — an explicit `+`/`−` always.
- A parallel plain-text formatter for share text, with the same bidi isolation, since WhatsApp gets
  a string and not a DOM.

**Exit criteria.**
- [ ] Unit tests cover: minor-unit arithmetic, chips ⇄ money both ways, the residue rule, and
      per-currency formatting for at least ₪ and $.
- [ ] A property test asserts that splitting any amount N ways sums back to exactly the original.
- [ ] Rendering a negative amount inside a Hebrew sentence puts the minus sign on the correct side.
      Assert it on the actual DOM text, not by eye.
- [ ] Nothing in the codebase says "agorot", "cents" or "minor units" in a user-facing string.

**Out of scope.** Settlement. Shared costs. Anything that needs more than one player.

---

## Step 3 — Design system primitives

**Goal.** Build the component inventory once, in isolation, so the feature steps assemble screens
instead of inventing a new button each time.

**Depends on** — 1, 2, and the design assets in [`docs/design/`](../design/README.md).

**Input.** [`docs/11-visual-design.md`](../11-visual-design.md) — the extracted tokens, the nine
screens covered, the four known collisions with the spec, and the states the prototype leaves
open. The prototype itself is in [`docs/design/prototype/`](../design/prototype/); open it in a
browser rather than working from the screenshots.

**Build.** The non-game-specific half of
[`10 — Component inventory`](../10-design-brief.md#component-inventory):
bottom sheet (the base for every menu and picker — no popovers, no dropdowns), button variants,
selection chip, banner, snackbar with countdown ring, slide-to-confirm, ⓘ explainer glyph and its
popover, destructive confirm, empty state, the sync indicator's four visual states, announcement
banner, stat hero number, sparkline, leaderboard row, results card shell.

Plus the layout shell: sticky header for persistent context, scrolling content, **bottom action
bar — not a floating action button** ([`04`](../04-ux-spec.md#action-bar)), everything interactive
in the bottom third, tap targets ≥ 48px with ≥ 8px between adjacent targets.

- The **shared primitives folder** these are built from — buttons, cards, icons, inputs, tags —
  each in its own folder with its own SCSS module. Anything a feature step would otherwise write
  twice belongs here.
- A dev-only gallery route rendering every component in every state, including the states from
  [`10`](../10-design-brief.md#states-to-design-not-just-the-happy-path) — loading, empty, error,
  offline, long strings.
- Motion per [`10`](../10-design-brief.md#motion), respecting `prefers-reduced-motion`.

**Exit criteria.**
- [ ] The gallery renders every component in Hebrew RTL and in the pseudo-locale, with nothing
      clipped or mirrored wrongly in either.
- [ ] No component reads `dir` to decide its layout; direction comes only from logical properties.
- [ ] Contrast checked in dark and light for every text/background pair used.
- [ ] Every meaning carried by colour is also carried by a glyph or a sign.
- [ ] Side-by-side against the design's screens: the tokens match, and every departure from the
      mockup is a spec'd interaction rule, recorded in `NOTES.md` with the rule it serves.
- [ ] States the mockup doesn't cover are derived in its visual language, not invented in another.

**Out of scope.** Components that need game data to be meaningful (player row, buy counter, pot
banner, transfer row) — those are built with their screens in steps 6–9.

---

## Step 4 — Event model and fold

**Goal.** The append-only event model from
[`03 — Event sourcing`](../03-data-model.md#event-sourcing), as pure functions with no React and no
Supabase.

**Depends on** — 2.

**Build.**
- `core/events.ts`: the **exact** event type union from
  [`03`](../03-data-model.md#game_events) — all 30 types, spelled identically, because step 10
  creates a Postgres enum that must match character for character.
- A zod schema per payload, and a discriminated union over `type`.
- The fold: `state = events.reduce(apply, empty)`. Deterministic, total, no throwing on unknown
  input.
- Undo as an **inverse event plus `undone_by` on the original**; nothing is ever deleted. Undone
  pairs collapse to one struck-through line at render time
  ([`03`](../03-data-model.md#undo-and-whether-an-undone-action-stays-in-the-log)).
- `client_event_id` generation, and idempotent application: applying the same event twice is a
  no-op.
- The derived-state shape the UI will read, matching the cached columns on `game_players` so step
  10's trigger and this fold can be tested against each other.

**Exit criteria.**
- [ ] Property test: for any permutation of an event list, the fold converges to the same state.
      This is what makes offline merge and host takeover safe, so it is asserted, not assumed.
- [ ] Property test: applying any event twice equals applying it once.
- [ ] Undo of any single event restores the exact prior state; undo of an undo does not resurrect
      anything.
- [ ] The event-type union is written down in one place and nowhere else in the codebase.

**Out of scope.** Persistence. Networking. UI.

---

## Step 5 — Local persistence and the outbox

**Goal.** The UI never waits on the network, and a dead router never stops a game.

**Depends on** — 4.

**Build.**
- Dexie schema: cached games, the event log, and the **outbox** keyed by `client_event_id`.
- The write path: append to the log → apply optimistically → enqueue in the outbox. Reads come from
  the local store only.
- A `SyncTransport` interface with an in-memory stub implementation, so step 12 swaps in Supabase
  behind an already-tested seam. The stub can simulate latency, failure and duplicate rejection.
- Sync indicator wired for real to the outbox: synced / syncing / pending count / failed, plus its
  expanded panel ([`04`](../04-ux-spec.md#sync-indicator)). Never a blocking dialog.
- `beforeunload` guard when the outbox is non-empty.
- Screen wake lock while a game is open.
- Treat IndexedDB as a **short-lived buffer, not durable storage** — iOS Safari can evict it after
  ~7 days ([`02`](../02-architecture.md#what-pwa-costs-us-on-ios)).

**Exit criteria.**
- [ ] Tests: a duplicate `client_event_id` is a no-op; out-of-order arrival converges; a failed push
      is retried and does not duplicate.
- [ ] Killing the tab mid-game and reopening restores the exact state, including a pending outbox.
- [ ] The indicator shows the true pending count at all times, verified against the outbox in a
      test rather than by inspection.

**Out of scope.** Real network code. Auth. Conflict resolution against a server that doesn't exist
yet.

---

## Step 6 — Game setup, player list, add-players sheet

**Goal.** You can create a game and seat people at the table.

**Depends on** — 3, 5.

**Build.**
- New-game setup ([`04`](../04-ux-spec.md#new-game--setup)): buy amount, chips per buy, derived chip
  value shown live, currency, game name.
- Home screen, games list, empty state.
- Player row anatomy ([`04`](../04-ux-spec.md#player-row-anatomy)) — active, settled, late-joiner
  and pending-sync states.
- Add, remove and rename players, guest naming, `(1)` deduping, composed names
  (`nickname (account name)`) that stay legible when long.
- **The multi-select add-players sheet** ([`04`](../04-ux-spec.md#adding-players--the-multi-select-sheet)):
  capped-height roster, selection tray `נבחרו (N)`, the new-name field, a footer that counts, one
  batch commit. Group sections are built but fed by local history until step 14 supplies groups.

**Exit criteria.**
- [ ] A game can be created and four players seated, entirely offline, from a phone-sized viewport.
- [ ] Every mutation on this screen goes through the step-4 event path — no direct state writes.
- [ ] Duplicate names produce `(1)` correctly, including after a rename and after a removal.
- [ ] The sheet is usable one-handed with a roster of 40 names.

**Out of scope.** Buy-ins. Money movement of any kind. Groups.

---

## Step 7 — The buy-in counter and the game page 🎯

**Goal.** The interaction the whole product rests on. [`09`](../09-roadmap.md#risks) names "the host
has to be on their phone all night" as the real product risk, and one-tap buy-in as the entire
answer.

**Depends on** — 6.

**Build.**
- The buy-in counter ([`04`](../04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)):
  `− n +`, **one tap, no confirmation**, asymmetric target sizes, count-up animation, disabled at 0.
- The coalescing undo snackbar stating the change in **buy-ins, chips and money together**, with a
  countdown ring; upgrading into the batch bar with a per-row breakdown and a total when several
  rows change inside the window.
- Cash paid, edited directly on the row, via the cash sheet.
- Settle a player ([`04`](../04-ux-spec.md#settling-a-player-15)): the settle sheet with its big
  numeric input, live conversion caption and quick-value chips; the row grays to ~40% opacity and
  stays legible; reopen.
- The row action sheet, with the destructive group separated at the end.
- Shared costs entry and the compact summary line ([`04`](../04-ux-spec.md#shared-costs)).
- The pot verification banner ([`05`](../05-settlement.md#the-safeguard-20)): compact green when
  balanced, expanded red with actions when not.
- The sticky header: chip value, buy amount, elapsed time.
- The audit log drawer ([`04`](../04-ux-spec.md#audit-log-drawer-22)): live entries, filter chips,
  undone actions collapsed to one struck-through `בוטל` line hidden behind `הצג בוטלים`.

**Exit criteria.**
- [ ] A buy-in is one tap and is reversible, and the undo says how many buy-ins, how many chips and
      how much money changed.
- [ ] Rapid taps across several rows coalesce into one batch bar that lists every affected row and
      a correct total.
- [ ] The pot banner arithmetic is unit-tested against hand-computed fixtures, including the
      shared-costs and cash-paid interactions.
- [ ] The whole screen works in airplane mode, and the audit drawer shows every action taken.
- [ ] Tested at a real game before step 8 begins. [`09`](../09-roadmap.md#m1--the-napkin-replacement)
      is explicit that everything after this point is guesswork until it has survived one Thursday
      night.

**Out of scope.** Ending the game. Transfers. Anything on
[`05`](../05-settlement.md#minimum-transfer-algorithm-19).

---

## Step 8 — Settlement core

**Goal.** The one module where a bug costs real money and real friendships. Pure,
dependency-free, over-tested.

**Depends on** — 2, 7.

**Build.** All of `core/settlement.ts`, with no imports from React or Supabase:
- Net calculation per player ([`05`](../05-settlement.md#the-money-model)).
- **The pot as a settlement node** — a participant with a negative balance, so "pay Dana out of the
  cash on the table" falls out with no special case ([`05`](../05-settlement.md#the-pot-as-a-settlement-node)).
- Shared costs: payer, equal split, custom split, and the residue rule.
- The minimum-transfer algorithm in three stages: exact-pair cancellation → bitmask DP for small
  tables → greedy fallback ([`05`](../05-settlement.md#minimum-transfer-algorithm-19)), with the
  documented tie-breaking so output is deterministic.
- The **snapshot builder** as a pure function producing the permanent result object
  ([`03`](../03-data-model.md#permanent-tables)), built here even though nothing persists it until
  step 11 — so that no finished game can ever exist without one.

**Exit criteria.**
- [ ] Every invariant in [`05`](../05-settlement.md#invariants-the-tests-must-assert) is asserted
      as a property test over randomly generated games via `fast-check`.
- [ ] The worked four-player example from `05` passes as a fixture, transfer for transfer.
- [ ] Adding shared costs never breaks the balance invariant — property-tested, not spot-checked.
- [ ] The DP and the greedy path agree on transfer *count* wherever the DP is applicable.
- [ ] Zero imports from React, Supabase, Dexie or the DOM. Enforced by a lint rule, not by good
      intentions.

**Out of scope.** UI. Persistence.

---

## Step 9 — End game, edit mode, share text ✅

**Goal.** Close out a night correctly, and hand the table a message they can paste into WhatsApp.
At the end of this step the app is a complete product for a single host with no account.

**Depends on** — 8.

**Build.**
- Slide-to-confirm end game, the missing-players check, and discrepancy resolution
  ([`04`](../04-ux-spec.md#ending-the-game)).
- **Edit mode** ([`05`](../05-settlement.md#edit-mode-1617)): chip picker, the per-player
  reconciliation strip (אמור / בפועל / פער) with colour **and** sign, the sticky balance banner with
  its progress bar and complete state.
- The summary screen, and the transfer row in read and edit mode — **no paid checkbox**, dropped for
  good ([`09`](../09-roadmap.md#explicitly-deferred)).
- Share as text, both templates from [`07`](../07-hebrew-glossary.md#share-text-templates), as
  translatable resources rather than string literals, with LRI/PDI around every amount.
- Reopen within 24h.
- The snapshot from step 8 is produced and stored locally on finalisation.
- The "Add to Home Screen" prompt, now that a completed game exists to trigger it.

**Exit criteria.**
- [ ] A full game runs start to finish, offline, on a phone, in Hebrew.
- [ ] Settlement produces the minimum number of transfers and can be corrected by hand, with the
      banner refusing to reach "complete" while the books don't balance.
- [ ] The share text pastes cleanly into WhatsApp on **both** iOS and Android with no amount
      rendering backwards. Test on real WhatsApp, not in a unit test.
- [ ] A Playwright test covers create → 4 players → buy-ins → shared cost → settle → end →
      transfers → share text.
- [ ] Every finished game has a snapshot. Asserted in code, not by convention.

**Out of scope.** Accounts. Cloud. Sharing by link — this step shares *text*, not access.

---

## Step 10 — Database foundation and RLS

**Goal.** The whole live schema and the whole permission model, designed in one pass so it doesn't
churn, and tested before anything depends on it.

**Depends on** — 4 (the event enum must match the fold's type union).

**Build.**
- Supabase project; local dev via the Supabase CLI so tests run offline and in CI.
- Migrations for every live table in [`03`](../03-data-model.md#live-tables): `profiles`, `groups`,
  `group_members`, `group_invites`, `games`, `game_players`, `game_events`, `shared_costs`,
  `shared_cost_shares`, `transfers`, `game_viewers`, `share_links`, `join_requests`,
  `player_claims`. Plus the columns reserved for locations and scheduled games
  ([`03`](../03-data-model.md#reserved-for-planned-features)) so neither needs a migration later.
- The `game_events` trigger maintaining the `game_players` caches.
- **RLS enabled on every table**, with the helper functions and policies from
  [`03`](../03-data-model.md#row-level-security). Writes are host-only, permanently.
- The two audited RPCs: `take_over_host` and the join-request path.
- A CI check that **fails the build if any table has RLS off**.
- A CI check that `supabase/migrations` is the single source of schema truth.
- `maintenance.yml`: the keep-alive cron (`0 6 */3 * *`) against the free project. Set this up here,
  not the night of a game.

**Exit criteria.**
- [ ] A SQL test suite covers each role against each table, per
      [`09 — Testing`](../09-roadmap.md#testing): a non-host cannot write; someone not in the game
      cannot take over host; every rejection returns the same generic shape.
- [ ] The RLS-off check fails when a table is deliberately left unprotected. Prove it.
- [ ] The Postgres event enum matches `core/events.ts` exactly — asserted by a test that reads both.
- [ ] No service-role key anywhere in the client or the repo.

**Out of scope.** Wiring the app to any of it. Auth UI. Snapshots.

---

## Step 11 — Snapshots, statistics source, retention functions

**Goal.** The permanent tables and the server functions that write and prune around them. Built
before anything can create data that would need migrating.

**Depends on** — 8, 10.

**Build.**
- `game_summaries`, `player_results`, `transfer_summaries`
  ([`03`](../03-data-model.md#permanent-tables)). Writable by **nobody** — only `finalize_game()`,
  running as the table owner, may insert.
- `finalize_game()`, producing exactly what step 8's pure snapshot builder produces.
- The statistics source views over the two permanent tables. Plain views first; materialise only if
  a measurement says to.
- `purge_expired_game_data()`: tier 2 at 90 days, tier 3 at 30 days, retention windows as
  **constants in one place**. It **refuses to run without a snapshot**.
- The `is_private` exclusion baked into every group-scoped view from the start, so step 14 has
  nothing to retrofit.

**Exit criteria.**
- [ ] `finalize_game` is idempotent across reopen and re-end.
- [ ] Statistics are **byte-identical** before and after a purge and after an explicit deletion.
      This is the assertion the whole retention design exists to make true.
- [ ] The purge refuses to run against a game with no snapshot. Tested by trying it.
- [ ] The SQL snapshot and the TypeScript snapshot agree on a shared fixture.
- [ ] Every group-scoped view excludes `is_private`, and still does after the live rows are purged.

**Out of scope.** Enabling the purge cron — that is step 16, when there is data old enough to purge
and a tested export path.

---

## Step 12 — Auth and cloud sync

**Goal.** Games leave the phone, safely, without breaking the offline promise.

**Depends on** — 5, 11.

**Build.**
- Supabase Auth: Google, and email magic link.
- The repository layer in `src/data/` — the swappable seam
  ([`02`](../02-architecture.md#database-choice)). Nothing above it imports `supabase-js`.
- The real `SyncTransport` behind step 5's interface: push the outbox, pull and merge, conflict-free
  because events are increments and not overwrites.
- `games.host_last_synced_at` stamped on every successful push.
- `finalize_game()` called on end-of-game; **local-only games from steps 6–9 upload their snapshots
  on first sign-in**.
- Realtime subscription to `game_events` and `game_players`, with a 15s polling fallback for
  networks that block WebSockets.
- Account-level default nickname, offered optionally at signup.

**Exit criteria.**
- [ ] Two devices editing the same game concurrently converge, including `+1 buy-in` from both.
- [ ] **Events pushed by a deposed host are still accepted and merged.** Explicitly tested — it is
      what makes takeover safe in step 13.
- [ ] Airplane mode for the length of a game, then reconnect, produces the identical final state.
- [ ] A pre-existing local game survives first sign-in with its snapshot intact.
- [ ] Nothing outside `src/data/` imports `supabase-js`. Lint-enforced.

**Out of scope.** Share links. Viewers. Groups.

---

## Step 13 — Sharing, viewers, join requests, takeover

**Goal.** Other people get in — and only through a door the host opens.

**Depends on** — 12.

**Build.**
- Share links ([`03`](../03-data-model.md#link-security)): 256-bit random tokens, **stored only as a
  SHA-256 hash**, carried in the **URL fragment** so they never reach a server log, never derived
  from the game id, revocable and rotatable. 7 days outside the group, 30 for members.
- The `SECURITY DEFINER` RPC that takes a token and returns a projection — a different one for a
  live game than for a finished one. The token column is never exposed to `anon`.
- The viewer experience ([`04`](../04-ux-spec.md#the-viewers-experience)) and the in-app viewer list.
- Join requests, host-approved on **both** paths: group members ask in-app via a slim lobby
  projection, everyone else through the share link
  ([`03`](../03-data-model.md#two-paths-in-one-gate)).
- Host handover, and **immediate takeover** by any signed-in person in that game, with the
  staleness-escalating warning modal built on `host_last_synced_at`
  ([`04`](../04-ux-spec.md#host-takeover-warning)), a prominent log entry, and an announcement
  banner to everyone with the game open.
- Guest-row claims: host-approved, open until 2 days after the game ends, setting `user_id` on the
  live row and the permanent result — the only field ever mutable after finalisation.
- Nicknames for registered players.

**Exit criteria.**
- [ ] SQL tests: a revoked or expired token returns nothing; the 7-day window applies to non-members
      and the 30-day one to members; every rejection returns the same generic shape.
- [ ] A claim outside the window is rejected, only the host may decide, an approved claim changes
      `user_id` and **nothing else** on `player_results`, and two people cannot both own one row.
- [ ] A dead host phone never blocks the game — verified by taking over from a second device
      mid-game and confirming the old host's late events still merge.
- [ ] A share link pasted into WhatsApp opens correctly in the in-app browsers on both platforms.

**Out of scope.** Groups. Statistics.

---

## Step 14 — Groups, roles, private games

**Goal.** חבורה — the scope that every statistic is computed within.

**Depends on** — 13.

**Build.**
- Groups, membership, and quick-add sorted by frequency; the add-players sheet's group sections,
  with the `◈` marker, light up here.
- Roles `owner` / `admin` / `member`. `הפוך למנהל חבורה`, owner-only demotion, and an owner who is
  **permanent** — no takeover, no demotion, transfer only. Group ownership and game hosting are
  unrelated powers.
- **Membership by invite only** ([`03`](../03-data-model.md#joining-a-group)): exact-username
  lookup, the username result card, the invitee must accept, pending invites revocable, leave at
  will. There is no invite link and no other path.
- Adding someone to a game never adds them to the group.
- **Private games**: the create-page checkbox, the `פרטי` badge, host-only link sharing,
  player-initiated invites, and the `is_private` filter honoured in every group-scoped view and list.

**Exit criteria.**
- [ ] SQL tests: **no membership row can be created without an accepted invite**; only the invitee
      may accept; **no path demotes or removes the owner**; `find_user_by_username` returns nothing
      on a partial match.
- [ ] `create_share_link` rejects a non-host on a private game.
- [ ] A private game is absent from every group-scoped figure and list, and still present in each
      player's personal statistics.

**Out of scope.** The statistics screens themselves.

---

## Step 15 — Statistics

**Goal.** The payoff for having chosen a real SQL database.

**Depends on** — 14.

**Build.**
- Personal statistics and the cumulative-net sparkline
  ([`06`](../06-statistics.md#personal-statistics-12)).
- Group statistics and leaderboards, with sample-size suppression and the privacy flag
  ([`06`](../06-statistics.md#group-level-statistics-11)).
- The seven fun statistics ([`06`](../06-statistics.md#fun-statistics)) — these get screenshotted
  into the group chat, so each card must look good alone.
- The presentation rules from [`06`](../06-statistics.md#presentation-rules), including the
  one-line note when a group's history spans more than one currency label.

**Exit criteria.**
- [ ] Every formula matches [`06`](../06-statistics.md) against hand-computed fixtures, especially
      the win-rate zero-exclusion and profit-per-hour with late joiners.
- [ ] Statistics read **only** from the permanent tables. Verified by dropping the live rows in a
      test and confirming every number is unchanged.
- [ ] Suppression hides small samples rather than showing a misleading average.

**Out of scope.** The purge cron.

---

## Step 16 — Retention live, deletion, export

**Goal.** Turn on the one function whose bugs are irreversible.

**Depends on** — 15.

**Build.**
- Export, built and shipped **before** the first purge can run
  ([`03`](../03-data-model.md#retention-and-archiving)): any game, any time, by the host.
- `purge_expired_game_data()` invoked by `maintenance.yml`, logging deleted row counts so a runaway
  purge is visible in the Actions history.
- Results cards for purged games — they must read as **complete, not broken**.
- Delete-a-game, with the confirmation that says plainly
  `הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.` Deleting an unfinished game deletes everything.

**Exit criteria.**
- [ ] Export produces a complete, re-readable file for a game, verified by reconstructing the
      summary from it.
- [ ] A purge run against a seeded database with clock-shifted games deletes exactly tiers 2 and 3
      and leaves every statistic identical.
- [ ] The cron's log line states the deleted row count per table.
- [ ] A purged game's results card shows date, players, results and transfers with no broken UI.

**Out of scope.** Nothing else. Keep this step small; it is the dangerous one.

---

## Step 17 — Polish and v1 sign-off

**Goal.** Clear the deferred small things, then verify the definition of done as written.

**Depends on** — 16.

**Build.**
- `wa.me` shortcuts and copy-to-clipboard everywhere.
- Duplicate-last-game.
- Nickname pre-fill from the player's most recent nickname in the group.
- The ⓘ explainers on the ten controls in [`04`](../04-ux-spec.md#-explainers) — and no more than
  ten, so the glyph doesn't become noise.
- The full pseudo-locale sweep across every screen.
- The manual device matrix: iOS Safari and Android Chrome, installed and in-browser, in airplane
  mode.

**Exit criteria.** Every line of
[`09 — Definition of done for v1`](../09-roadmap.md#definition-of-done-for-v1), checked off one at a
time in `PROGRESS.md`:
- [ ] A full game start to finish, offline, on a phone, in Hebrew.
- [ ] Buy-ins are one tap and reversible, and the undo says how many chips and how much money changed.
- [ ] The pot banner catches a miscount before the end of the game.
- [ ] Settlement produces the minimum number of transfers and can be corrected by hand.
- [ ] A dead host phone never blocks the game.
- [ ] The summary pastes cleanly into WhatsApp on both iOS and Android.
- [ ] Deleting a game keeps every statistic intact.
- [ ] No amount anywhere renders backwards.

---

## Optional, once step 3 exists: sync the components back

`/design-sync` pushes a **built component library** up to Claude Design so its design agent builds
new screens out of the real components instead of generic ones. It runs in the opposite direction
to what step 3 consumes, and it needs compiled components to exist — so it is meaningless before
step 3 and useful after it, when designing a screen the spec doesn't already cover in detail.

It also needs `DesignSync` to authorise, which requires an interactive terminal rather than a web
session. Not a step, not a dependency; noted so nobody goes looking for it early.

## Deliberately not in this plan

**Deferred** ([`09`](../09-roadmap.md#explicitly-deferred)): non-standard and half buy-ins ·
multi-currency UI · push notifications · native wrapper · tournament mode · blind timer · chip
denomination entry · languages beyond the plumbing.

**Planned after v1**, with schema reserved in step 10 so neither needs a migration: **locations**
and **scheduled games** ([`01 §10`](../01-product-spec.md#10-planned-not-in-v1)).

**Dropped for good, not deferred**: "mark as paid" on transfers, moving a buy-in between players,
and non-host editing. If a future session is tempted by any of these, the answer is already no.
