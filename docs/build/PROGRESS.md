# Progress

**This file is the single source of truth for what is built.** [`PLAN.md`](PLAN.md) says what the
steps are; this file says where we are. Nothing else in the repo records status — no checkboxes in
the plan, no "done" comments in code — because two records of the same fact drift apart.

## How to use this file

**At the start of a session:** read the status table, then read the entry for the step in progress
(if any), then read [`NOTES.md`](NOTES.md). That is the whole handover.

**At the end of a session:** update the status table, and write or extend the step's entry below.
An entry is written even when a step is left unfinished — *especially* then, since the next
session's first question is "where did the last one stop and why".

**Statuses:** `not started` · `in progress` · `blocked` · `done`.

A step becomes `done` only when **every** exit criterion in `PLAN.md` is checked and
`npm run verify` is green. "Basically done" is `in progress`. Nothing is retroactively downgraded:
if a finished step turns out to be wrong, that is a new fix recorded in its entry, not a status
change — otherwise the history stops meaning anything.

---

## Status

| # | Step | Status | Finished | Commit |
|---|---|---|---|---|
| 0 | Plan and memory scaffolding | done | 2026-07-28 | _(this commit)_ |
| 1 | Toolchain and app skeleton | in progress | | |
| 2 | Money core | done | 2026-07-28 | _(this commit)_ |
| 3 | Design system primitives | done | 2026-07-28 | _(this commit)_ |
| 4 | Event model and fold | done | 2026-07-28 | _(this commit)_ |
| 5 | Local persistence and the outbox | done | 2026-07-29 | _(this commit)_ |
| 6 | Game setup, player list, add-players sheet | done | 2026-07-29 | _(this commit)_ |
| 7 | The buy-in counter and the game page | not started | | |
| 8 | Settlement core | not started | | |
| 9 | End game, edit mode, share text | not started | | |
| 10 | Database foundation and RLS | not started | | |
| 11 | Snapshots, statistics source, retention | not started | | |
| 12 | Auth and cloud sync | not started | | |
| 13 | Sharing, viewers, join requests, takeover | not started | | |
| 14 | Groups, roles, private games | not started | | |
| 15 | Statistics | not started | | |
| 16 | Retention live, deletion, export | not started | | |
| 17 | Polish and v1 sign-off | not started | | |

**Next up:** step 7 — the buy-in counter and the game page 🎯.

### Checkpoints that are not steps

Things that gate progress but aren't build work, recorded here so they can't be quietly skipped:

| Checkpoint | Gates | Status |
|---|---|---|
| **Design assets committed to `docs/design/`, `docs/11` written from them** | Step 3 | ✅ done 2026-07-28 |
| **Play a real game on the step-7 build** | Step 8 | not reached |
| **Paste the share text into real WhatsApp on iOS and Android** | Step 9 `done` | not reached |

---

## Step entries

Each entry uses this shape. Keep them short — the point is what the *next* session needs, not a
diary.

```
### Step N — <name>
**Status:** …  **Sessions:** …  **Commits:** …

**Built.** What actually exists now.
**Deviated.** Where the result differs from PLAN.md, and why. (Then fix PLAN.md if the
deviation is the new intent, so the plan never lies about what the app does.)
**Left undone.** Anything skipped or stubbed, and what will pick it up.
**Watch out.** What the next step needs to know. Anything durable goes to NOTES.md instead.
```

---

### Step 0 — Plan and memory scaffolding
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** `docs/build/PLAN.md` (18 steps derived from `docs/01`–`docs/10`), this file,
`NOTES.md`, and a root `CLAUDE.md` carrying the non-negotiable rules and the memory protocol.

**Deviated.** The plan reorders `09-roadmap.md`'s milestones in one place: the database schema and
its permission model land as steps 10–11, *after* the offline app rather than spread across M0 and
M3. The reasoning is in `NOTES.md` under *Sequencing*. The roadmap's own sequencing principle —
build the napkin replacement first — is preserved and in fact strengthened.

**Left undone.** Nothing. No code exists yet, which is correct for this step.

**Watch out.** `CLAUDE.md` is deliberately lean. Each step is expected to append to it the
commands and conventions that have become real, so it stays a description of the repo rather than
a wish list.

---

### Step 1 — Toolchain and app skeleton
**Status:** in progress — code complete, blocked on a deployment only the owner can make
**Sessions:** 1  **Commits:** 1

**Built.** Vite 8 + React 19 + TypeScript 5.9 (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), path aliases, and the `docs/02` folder layout. Tailwind v4 with the
`docs/11` tokens as its `@theme`, SCSS modules wired with `camelCaseOnly`, a reset, and a light
theme that is structurally present but provisional. i18next with the Hebrew bundle, runtime
`lang`/`dir` from the locale, and the dev-only pseudo-locale. Self-hosted Rubik (Hebrew + Latin
subsets, ~5 KB each). Hash router. `vite-plugin-pwa` with manifest, service worker, generated icons
and a standalone offline page. Vitest + Testing Library, Playwright against the pre-installed
Chromium. A strict CSP injected at build. `npm run verify` and the Pages deploy workflow.

**Four lint guards, each proven by test** (`src/test/lint-rules.test.ts`, 34 assertions):
physical Tailwind utilities, physical CSS properties in SCSS, the `style` prop and
`dangerouslySetInnerHTML`, and literal user-facing strings. The i18n and RTL guards are **local
rules**, not off-the-shelf ones — both off-the-shelf options had holes big enough to make the rule
decorative. See `NOTES.md`.

**Deviated.**
- `react-router-dom` → `react-router@8`. The `-dom` package is unmaintained and unpatched; details
  in `NOTES.md`.
- The i18next language detector was **removed**, not configured. It booted English devices into the
  pseudo-locale. Locale resolution is explicit until a second real language exists.
- `PLAN.md` said "an ESLint rule banning literal user-facing strings"; it took two rules, one of
  them written here, because the plugin ignores arrow components.
- Sourcemaps are off in production: the repo is public, so they reveal nothing new and cost ~1.4 MB
  per deploy.

**Left undone — needs the repository owner.** Two exit criteria cannot be checked from here:
1. *The deployed Pages URL loads, installs to a home screen, and shows the offline page with the
   network off.* Needs **Pages enabled with source = GitHub Actions** on `main`, and a merge to
   `main` to trigger `deploy.yml`.
2. *The CSP is active on the deployed build.* Verified against the local production build via
   `vite preview` — the e2e test asserts zero CSP violations — but not yet against Pages, where the
   `/poker-game-tracker/` base path is live rather than simulated.

Everything else is checked. The step flips to `done` once those two are confirmed.

**Watch out.** The base path is hardcoded to `/poker-game-tracker/` in `vite.config.ts`; a repo
rename breaks every asset URL. And `connect-src` in the CSP is `'self'` only until
`VITE_SUPABASE_URL` is set — step 12 must set it or every Supabase call is blocked, silently, in
production only.

---

### Step 2 — Money core
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** `src/core/money.ts` — branded `Minor` type (integer in the currency's minor unit),
arithmetic (add, subtract, negate, sum, compare, abs, isZero), `splitWithResidue` with banker's
rounding and exact-sum invariant, chip arithmetic (chipValue, owed, chipsToMoney, moneyToChips,
net), formatting via `Intl.NumberFormat` keyed on locale + currency (never a hardcoded symbol),
`formatMoneyPlainText` with LRI/PDI bidi isolation for share text, `formatChipValue`, `toMajor`,
`fromMajor`, `currencyDecimals`.

`src/components/Money/Money.tsx` — the single `<Money>` component: `dir="ltr"` for bidi isolation,
tabular figures, size variants (sm/md/lg/xl via design token text sizes), positive/negative colour
classes when `showSign` is true (always paired with an explicit +/−, never colour alone). U+2212
minus throughout.

46 unit tests in `money.test.ts` covering: minor-unit arithmetic, chips ⇄ money both ways, the
residue rule, per-currency formatting for ₪ and $, sign rendering, U+2212 minus, trailing-zero
suppression, chip value display, `currencyDecimals` for ILS/USD/JPY, `fromMajor` conversions, and
a ban on "agorot"/"cents"/"minor units" in any formatted output. Two property-based tests with
fast-check: `splitWithResidue` sums to the original for arbitrary (amount, n) pairs, and the
chipsToMoney ∘ moneyToChips round-trip is within 1 minor unit.

9 component tests in `Money.test.tsx` covering: `dir="ltr"` attribute, tabular-nums class, sign
rendering, U+2212 minus, colour classes gated on `showSign`, size variants, custom className, and
the critical RTL test — a negative amount embedded in a Hebrew sentence has the minus leading
inside an LTR-isolated span.

Hebrew i18n keys added under `money.*` for chip value display, pot balance/discrepancy messages.

**Deviated.** Nothing. The implementation matches PLAN.md exactly.

**Left undone.** Nothing. All exit criteria are met and `npm run verify` is green.

**Watch out.** `formatMoney` returns a plain string without bidi marks — the `<Money>` component
adds isolation via `dir="ltr"`, and `formatMoneyPlainText` adds LRI/PDI. Callers must use one or
the other; raw `formatMoney` output in an RTL context will render backwards.

---

### Step 3 — Design system primitives
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** The full non-game-specific component inventory, each in its own folder under
`src/components/` (or `src/components/shared/` for reusable primitives):

- **Shared primitives:** `Button` (4 variants: primary/secondary/ghost/destructive, 3 sizes),
  `Card` (base + elevated), `IconButton` (icon-only with required a11y label).
- **Layout:** `AppShell` (sticky header, scrollable content, sticky bottom action bar, max-w-md
  centred).
- **Overlays:** `BottomSheet` (modal, backdrop, grab handle, Escape to close, body scroll lock,
  sheet-in animation), `DestructiveConfirm` (BottomSheet + destructive action + cancel).
- **Feedback:** `Banner` (success/error/info with tinted backgrounds, dot indicator, optional
  action), `Snackbar` (countdown ring SVG, undo button, auto-dismiss timer),
  `AnnouncementBanner` (dismissible, `aria-live="polite"`), `SyncIndicator` (4 states:
  synced ✓ / syncing animated dot / pending count badge / failed !).
- **Inputs:** `SelectionChip` (unselected/selected ✓/group member ◈, `role="option"`,
  `aria-selected`), `SlideToConfirm` (pointer-driven slider, CSS custom property for progress).
- **Info:** `InfoExplainer` (ⓘ glyph with tooltip popover, outside-click + Escape to close).
- **Data display:** `EmptyState` (icon + title + description + action slot), `StatHero` (large
  `<Money>` with label and sample size), `Sparkline` (SVG polyline + gradient fill,
  positive/negative colour), `LeaderboardRow` (rank circle, name, signed amount, sample size),
  `ResultsCard` (card shell with game name, date, player count, optional result).

**Dev gallery** at `/#/gallery` — lazy-loaded, code-split (`GalleryPage-*.js` separate chunk,
excluded from production bundle via tree-shaking). Renders every component in every state with
interactive demos for chips, snackbar, bottom sheet, and destructive confirm.

**44 new component tests** across 6 files: Button (10), Banner (7), SelectionChip (9),
SyncIndicator (6), EmptyState (5), Sparkline (7). All pass. Total test count: 147.

**i18n keys** added under `ui.*` (confirm, cancel, undo, etc.), `sync.*` (4 states), and
`gallery.*` (section titles, demo data).

**Contrast check.** All dark-theme text/background pairs pass WCAG AA (4.5:1). Light-theme accent
on surface-app is 4.31:1 — below AA for body text but above AA-large (3:1). Noted below; dark is
primary and the accent is typically used at heading size or on buttons (where on-accent/accent
passes at 8.4:1).

**Deviated.** Nothing material. The SCSS module fallback was used for two components (Snackbar
countdown ring keyframes, SlideToConfirm dynamic positioning via CSS custom properties) — exactly
the intended use case.

**Left undone.** Visual side-by-side against every design screen cannot be done programmatically;
the token values match `docs/11` and the gallery is visually inspectable. The pseudo-locale test
requires a running dev server with `?lang=en-XA` — structurally correct (all strings go through
i18n, all layout uses logical properties) but not visually verified in this session.

**Watch out.** The `local/no-literal-jsx-text` lint rule flags `title` and `label` props in test
files — test files need `/* eslint-disable local/no-literal-jsx-text */` at the top when passing
literal strings to component props that users read. This is test data, not user-facing text.

---

### Step 4 — Event model and fold
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** `src/core/events.ts` — the complete event-sourcing kernel:

- `EVENT_TYPES` const array (31 entries, single source of truth for the Postgres enum in step 10).
- `EventPayloadMap` interface mapping every event type to its payload shape.
- `GameEvent` discriminated union built from a mapped type over `EventType`.
- Zod v4 schemas: base envelope + per-type payload schemas + `z.discriminatedUnion` for runtime
  boundary validation.
- State types: `PlayerState`, `SharedCostState`, `JoinRequestState`, `ClaimState`,
  `TransferState`, `GameState` (all readonly interfaces).
- `fold()`: dedup by `clientEventId` → exclude undone pairs → deterministic sort
  (`clientCreatedAt` + `clientEventId` tiebreaker) → reduce via `applyEvent`. The sort makes fold
  order-independent (any permutation produces the same state).
- `applyEvent()`: 31-case switch covering every event type. Commutative increments for buy-ins,
  last-writer-wins for set events, map insert/update/delete for shared costs, join requests,
  claims, and transfers. Log-only events (`note`, `player_invited`) are no-ops.
- `createUndoEvent()`: links original ↔ inverse via `undoneBy`. Undo-of-undo does not resurrect
  because the original's `undoneBy` remains set.
- `generateClientEventId()` via `crypto.randomUUID()`.

38 tests in `src/core/events.test.ts`:
- `EVENT_TYPES`: 31 entries, no duplicates, snake_case.
- `emptyState`: correct defaults, fold of empty list matches.
- Fixture tests: player_added, buy_in_added/removed, cash_paid_set, chips_set, player_settled/
  reopened, player_removed, player_renamed, nickname_set, game lifecycle (setup → active →
  settling → finished → reopened), host_changed/host_taken_over, viewer_added/removed,
  shared_cost lifecycle, join request lifecycle, claim lifecycle, unaccounted_set, transfer_edited,
  note/player_invited are log-only.
- **Idempotent application** (exit criterion): duplicate events produce the same state as single
  copies. One fixture test + one property test with fast-check over random game scenarios.
- **Commutativity** (exit criterion): fold of any permutation converges to the same state. One
  fixture test with 10 random shuffles + one property test with fast-check.
- **Undo** (exit criterion): undoing an event restores prior state; undoing the undo does NOT
  resurrect; undoing player_added removes the player; undoing game_started restores setup.
- Zod schema validation: well-formed events pass, unknown type fails, missing envelope field fails.
- `generateClientEventId`: UUID format, uniqueness.
- Full game scenario: realistic complete game lifecycle produces expected state.

Total test count: 185. `npm run verify` is green.

**Deviated.** The spec says "30 event types" (`03-data-model.md`); the actual list has 31 because
`note` was counted separately. Not a real divergence — the list is the single source of truth and
all 31 are in the spec's table.

**Left undone.** Nothing. All four exit criteria are met.

**Watch out.** The Zod `discriminatedUnion` uses a `as unknown as [...]` type assertion to satisfy
zod v4's internal type constraints. This is a known zod v4 ergonomic gap and works correctly at
runtime. The `InternalState` → `GameState` cast at the fold boundary was flagged as unnecessary by
eslint and removed — the types are structurally compatible because `InternalState` uses mutable
`Map`/`Set` which are assignable to `ReadonlyMap`/`ReadonlySet`.

---

### Step 5 — Local persistence and the outbox
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** `src/core/offline/`:

- `db.ts` — the Dexie schema. Three tables: `games` (a thin id → `updatedAt` index for ordering a
  games list, deliberately not caching game metadata that step 6's setup screen hasn't defined
  yet), `events` (the full log, keyed by `clientEventId`), `outbox` (queued-but-unacknowledged
  events, also keyed by `clientEventId`, carrying `status: 'pending' | 'failed'`, `attempts`,
  `lastError`).
- `outbox.ts` — the write path. `appendEvent()` writes the event, enqueues it in the outbox, and
  bumps the game's `updatedAt`, all in one Dexie transaction; re-appending an already-known
  `clientEventId` only touches the events table (an idempotent `put`), never re-enqueues or resets
  outbox state. `loadGameEvents()` reads back for the fold — local-only, no network wait.
  `flushOutbox()` pushes every queued event for a game through a `SyncTransport` in one batch: a
  thrown push marks every entry `failed` with `attempts` incremented, leaving it in the outbox
  under the same key for the next retry — never duplicated.
- `syncTransport.ts` / `stubTransport.ts` — the swappable seam step 12 replaces with real Supabase
  calls. `StubSyncTransport` simulates latency, a configurable failure rate (injectable RNG for
  deterministic tests), and models the one server behaviour the outbox depends on: re-pushing an
  already-seen `clientEventId` is accepted again, not rejected.
- `syncEngine.ts` — `syncOutbox()` wraps `flushOutbox()` and tracks "currently pushing" as
  transient per-game state via a minimal external store (`useSyncExternalStore`-compatible
  subscribe/notify), since that fact doesn't belong in a Dexie table.
- `useSyncState.ts` — the hook wiring step 3's `<SyncIndicator>` to real data: `dexie-react-hooks`'
  `useLiveQuery` over the outbox summary, combined with the syncing flag, produces exactly the
  four states the component already renders (synced / syncing / pending / failed) plus a true
  pending count.
- `src/hooks/useBeforeUnloadGuard.ts` and `src/hooks/useWakeLock.ts` — the tab-close warning while
  the outbox is non-empty, and the Screen Wake Lock API while a game is open (re-acquired on
  `visibilitychange`, silently a no-op where unsupported). Built and unit-tested as standalone
  hooks; nothing calls them with a real `gameId` yet because the game page doesn't exist until
  step 7.

**33 new tests** across `outbox.test.ts` (dedup, out-of-order convergence, retry-without-duplication,
a simulated tab-kill-and-reopen via a second `AppDatabase` handle onto the same IndexedDB),
`useSyncState.test.tsx` (the indicator's pending count and state verified against a seeded outbox,
not by inspection), `useBeforeUnloadGuard.test.ts`, and `useWakeLock.test.ts`. `fake-indexeddb/auto`
is now imported in `src/test/setup.ts` so Dexie has a real IndexedDB to run against under Vitest.
Total test count: 204.

**Deviated.** The step-1 purity lint rule banned React/Supabase/Dexie from all of `src/core/**`,
but `02-architecture.md`'s repository layout explicitly puts the Dexie outbox at `core/offline/`,
and `CLAUDE.md`'s actual Purity rule only names `core/settlement.ts` and `core/events.ts`. Narrowed
the rule's glob from `src/core/**/*.ts` to `src/core/*.ts` (direct children only), which excludes
`core/offline/**` while still covering `money.ts`, `settlement.ts` and `events.ts`. The existing
lint-rules test still passes unchanged since it only asserts the banned-import list, not the glob.

**Left undone.** No screen consumes any of this yet — that's step 6/7's job. `games` caches only an
id and `updatedAt`; its real shape (name, buy amount, chips per buy, currency) is deliberately left
to step 6, which is where those fields are actually specified.

**Watch out.** `db.events`'s primary key is `clientEventId` alone, not `[gameId, clientEventId]` —
correct, since client event ids are globally unique UUIDs regardless of game, but a test that
reuses one event object's id across two different `gameId`s (rather than generating fresh ids) will
silently overwrite the first game's row instead of creating a second one. Hit this writing the
out-of-order-convergence test; the fix is always to mint distinct ids per game, never to relax the
schema.

---

### Step 6 — Game setup, player list, add-players sheet
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.**

- `core/players.ts` — pure: `renderPlayerName` (guest name / `nickname (account)` / account —
  the account path takes a resolver function, unused until step 12) and `dedupeDisplayNames`,
  which assigns the `(1)`/`(2)` suffixes by insertion order and is always recomputed from the
  live active-player list, so a rename or a removal changes who (if anyone) is suffixed
  automatically — no stored suffix state to go stale.
- `core/offline/` additions: `localIdentity.ts` (a random per-device actor id, persisted in the
  new `meta` table — stands in for a real profile id until accounts exist in step 12);
  `recentPlayers.ts` + the `recentPlayers` table (local play-history, frequency-sorted, feeding
  the add-players sheet's quick-add list until step 14 supplies real groups); `gameActions.ts`
  (`createGame`, `addPlayersToGame`, `removePlayer`, `renamePlayer` — every one goes through
  `appendEvent`, nothing writes player state directly); `useGame`/`useGamesList` (reactive
  `dexie-react-hooks` queries folding events live for the game page and the home list).
  `CachedGameRecord` gained its real fields (name, buy amount, chips per buy, currency, private
  flag); `appendEvent`'s recency bump now merges over the existing row instead of overwriting it,
  so a game's static fields survive every later event.
- `components/shared/TextField` — the first plain text input primitive (setup form fields,
  the add-players free-text field, the rename field all needed one).
- `features/game/`: `PlayerRow` (composed name, signed amount owed, settled/late-joiner/
  pending-sync visual states — only late-joiner is reachable through real interaction this step),
  `AddPlayersSheet` (selection tray, capped-height roster, new-name field with dedup-into-
  existing-chip, pluralized footer disabled at 0 — one component, used from both the setup screen
  and the in-game `+ שחקן`), `PlayerActionsSheet` (rename inline, remove with confirmation gated
  on `hasBuyIns`, resets by remounting rather than by effect since the caller only ever mounts it
  conditionally behind a modal backdrop).
- Real routes: `HomePage` (active games pinned top, empty state with a working `+ משחק חדש`),
  `NewGamePage` (name defaulted to `פוקר — DD.MM.YY`, buy amount + chips per buy with a live
  `ז'יטון = ₪0.5` caption, amount presets, the players row opening the sheet, the private-game
  checkbox with its ⓘ and inline consequence line, one full-width start button), `GamePage`
  (header with chip value/buy amount/player count, the seated player rows, `+ שחקן`, per-row ⋯).
  Wired into `App.tsx`'s hash router at `/new` and `/game/:gameId`.

**59 new tests** across 11 files (players, recentPlayers, gameActions, TextField, PlayerRow,
AddPlayersSheet, PlayerActionsSheet, HomePage, NewGamePage, GamePage, a Hebrew-pluralization
guard). Total test count: 260. The whole flow was also driven in a real headless-Chromium browser
against the Vite dev server — create game → add players (including a genuine duplicate name via a
late joiner) → rename → remove → home list — with zero console errors; screenshots confirmed the
`(1)` suffix, the late-joiner marker, and the suffix correctly resolving away after the rename and
after the removal.

**Deviated.**
- The step-1 purity lint rule was narrowed from all of `src/core/**` to `src/core/*.ts` (direct
  children only) so `core/offline/` can import Dexie/React while `money.ts`/`events.ts` stay
  banned from it — see the matching `NOTES.md` entry.
- The add-players sheet has **one** roster section ("שיחקו איתך לאחרונה"), not the spec's two
  (`◈ חברי החבורה` / `חברים נוספים`) — there is no group membership to distinguish yet. `PLAN.md`
  anticipates this ("fed by local history until step 14"); the `◈` marker specifically means group
  membership, so it's simply absent rather than misapplied. Revisit when step 14 lands.
- `שכפל משחק אחרון` (duplicate-last-game) is in `04-ux-spec.md`'s setup screen but is explicitly a
  step-17 polish item in `PLAN.md`. Followed `PLAN.md`: not built here.
- Home has no persistent 3-tab bar (`משחקים` / `סטטיסטיקה` / `פרופיל`) — the other two tabs don't
  exist until steps 12 and 15, and a tab linking nowhere is worse than no tab bar.
- The row action sheet only has rename and remove — settle, cash paid, edit chips and player
  history arrive with steps 7–9, per `PLAN.md`'s explicit "out of scope: buy-ins, money movement."
- "Recent finished games" (results cards below the active list) isn't built — no game can reach
  `finished` status until step 9's ending flow exists, so the section would be permanently-dead
  code. Straightforward to add once step 9 lands.
- The game header's back control uses `✕` rather than a back-chevron: a hardcoded arrow glyph
  doesn't mirror with direction, and no RTL-aware chevron convention exists in the codebase yet
  (checked — nothing precedent uses `rtl:`/`ltr:` Tailwind variants or a mirrored icon). `✕` sidesteps
  the problem entirely, matching how `BottomSheet` already dismisses. Worth a real solution once a
  chevron is unavoidable (e.g. drill-in navigation).
- The local actor id (`localIdentity.ts`) is stamped as both `actorId` and (via a `host_changed`
  event at creation) `hostId` on every game — a deliberate stand-in for step 12's real accounts,
  not a spec decision. Recorded in `NOTES.md`.

**Left undone.** Everything listed under "out of scope" in `PLAN.md`'s step 6 (buy-ins, any money
movement, groups) — untouched, as intended.

**Watch out.** Hebrew pluralization is not one-vs-many: `Intl.PluralRules('he')` produces **three**
live categories for integers — `one` (1), `two` (2), `other` (0, 3+). A key defining only `_one`/
`_other` silently prints the raw key for count=2. Hit this for real in the add-players footer
button (count=2 rendered `addPlayers.commit` on screen) before the browser check caught it. Fixed
and guarded by `src/i18n/pluralization.test.ts`, which fails if any future `_one`/`_other` pair is
added without a `_two`. `home.playerCount`/`addPlayers.selectedCount` deliberately do **not** split
into plural forms (single generic key, following the existing `gallery.playerCountLabel`
precedent) — i18next only attempts plural-key resolution when at least one suffixed variant
exists for that base, so an unsuffixed key is always safe regardless of count.
