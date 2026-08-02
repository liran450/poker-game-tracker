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
| 7 | The buy-in counter and the game page | in progress — code complete, blocked on a real game only the owner can play | | |
| 8 | Settlement core | done | 2026-07-29 | _(this commit)_ |
| 9 | End game, edit mode, share text | in progress — code complete, blocked on a real WhatsApp paste test | | |
| 10 | Database foundation and RLS | done | 2026-07-30 | _(this commit)_ |
| 11 | Snapshots, statistics source, retention | done | 2026-07-31 | _(this commit)_ |
| 12 | Auth and cloud sync | done | 2026-07-31 | _(this commit)_ |
| 13 | Sharing, viewers, join requests, takeover | in progress — migration applied to the real Supabase project; not yet tested on a real device | | |
| 14 | Groups, roles, private games | in progress — code complete, migration applied to the real Supabase project; not yet tested on a real device | | |
| 15 | Statistics | in progress — code complete, migration applied to the real Supabase project; not yet tested on a real signed-in device | | |
| 16 | Retention live, deletion, export | in progress — code complete, no migration needed this step; the new maintenance.yml purge step not yet confirmed against the real Supabase project | | |
| 17 | Polish and v1 sign-off | in progress — 8 of the 10 ⓘ explainers built, plus `שכפל משחק אחרון` | | |

**Next up:** steps 7 and 9 are code-complete and each blocked on a real-world action only the
repository owner can take — step 7 on a real game played on the build, step 9 on pasting its share
text into real WhatsApp on iOS and Android. Step 10 is now genuinely `done`: the owner created a
real Supabase project and, in this session, all 14 `supabase/migrations/` files were applied to it
directly (via the Supabase MCP connection, not the CLI — no `supabase link`/`db push` needed from
here), plus two follow-up migrations fixing gaps the project's own security advisor surfaced (see
this step's entry below and `NOTES.md`). One piece of the old checkpoint is still outstanding and
still needs the owner: the `SUPABASE_URL`/`SUPABASE_ANON_KEY` GitHub repo secrets are now **set**
(verified 2026-07-31 by dispatching `maintenance.yml` manually) but the ping still fails with a
`401` — the secret values are wrong, not missing; see the checkpoint table and `NOTES.md` for the
diagnosis and the correct value to paste in. No tool here can read or write repo secrets, so this
still needs the owner. That does not block step 10 itself (none of its four `PLAN.md` exit criteria
mention repo secrets), but it does block the keep-alive cron actually pinging anything, and step 12
will want it too. **Step 11 is now genuinely `done`**: `finalize_game`, `chips_to_money_minor`,
`group_player_results`, `purge_expired_game_data` — all four `PLAN.md` exit criteria covered by
`supabase/tests/`, `npm run test:db` and `npm run verify` both green — applied to the real
Supabase project this session (with the owner's go-ahead, after the session first paused to
confirm before writing to the live database). `get_advisors(type: 'security')` afterward
surfaced one real, newly-introduced gap — `group_player_results` had no equivalent to
`profiles_public`'s own narrowing, so any authenticated caller could have read every group's
statistics — fixed by a fourth migration (`security_invoker = true` plus the missing view grant)
and proven with a dedicated cross-group test, not just re-running the advisor. See this step's
entry below and `NOTES.md`.

**Step 12 (auth and cloud sync) is now genuinely `done`**, across two sessions — it turned out to
be the largest step in the plan so far. Session 1 built and fully tested the hardest, most novel
part — `SupabaseSyncTransport` (push, pull, the undo-marker RPC split, the shared-cost/transfer
translation, `host_last_synced_at` stamping) and the lint rule enforcing "nothing outside
`src/data/` imports `supabase-js`". Session 2 closed out the remaining three exit criteria: the
Google/magic-link sign-in UI and `SessionProvider`/`useSession` context, profile creation
(username/display name/optional nickname, unique-violation caught and surfaced inline), the
realtime subscription with its 15s polling fallback (`useLiveGameSync`, wired into the live game
screen), and local-only game migration on first sign-in (`src/data/localGameMigration.ts` —
rewrites the device's pre-sign-in `actorId` to the real profile id exactly once, then creates each
local game's server-side `games` row and pushes its whole outbox, calling `finalize_game` for any
game that already finished locally). `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are now wired
into `deploy.yml`'s build step, from the same repo secrets `maintenance.yml` already reads. All
five `PLAN.md` exit criteria are covered by tests (including a new one added this session for
"airplane mode for the length of a game, then reconnect", `outbox.test.ts`), `npm run verify` is
green, and the full Playwright e2e suite (including a fresh check of the new `/account` route
against a real production build) passes with zero console errors. See this step's entry below for
what's tested against fakes rather than the real project, and why.

**Step 13 (sharing, viewers, join requests, takeover) is code-complete in one session** and is the
largest step so far by migration surface — one new migration covering share links (token
generation/hashing, the two anonymous read RPCs, revoke/rotate), both halves of "two paths in, one
gate" (join requests and guest-row claims, each with a group-member direct-insert path and a
share-link RPC path), host handover and the pre-existing `take_over_host` finally getting client UI,
and a real pre-existing gap fixed along the way (`games.status` was never written server-side before
this session — see the step's own entry). `npm run verify` (508 tests) and `npm run test:db` (63
tests, up from 36) are both green.

**The step-13 migration was applied to the real Supabase project in a follow-up, same session.**
This sandbox's own outbound network still cannot reach `*.supabase.co` at all — confirmed freshly
this session (`curl` to the project's REST endpoint fails with a `403` from the pre-configured
egress proxy's own `CONNECT` tunnel, before ever reaching Supabase) — but the Supabase MCP
connection is a *separate* integration with its own credentials and its own connectivity, entirely
unrelated to this sandbox's network and to the `SUPABASE_ANON_KEY` GitHub secret (see this step's
Watch out for the full explanation; the two "can't reach Supabase" facts sound contradictory but
describe different paths). Applying it surfaced a real, pre-existing bug: every earlier migration
(steps 10/11, applied the same way) was recorded in the remote `supabase_migrations.schema_migrations`
table under the timestamp it was *applied* at, not the timestamp in its filename — invisible until
something actually diffed remote-vs-local migration versions, which the Supabase GitHub
integration's deploy check finally did on this PR's merge to `main`. Fixed by repairing all 21
version numbers to match their filenames (a metadata-only correction, no schema change) and, while
in there, fixing two functions (`find_valid_share_link`, `log_claim_requested`) that were still
anon/authenticated-executable despite an intended revoke — the identical "revoked from the wrong
grantee" trap already documented in `NOTES.md` from step 10. See this step's own entry.

**One functional gap is left open on purpose, not silently:** a signed-in viewer who reaches a live
game through the app (not a share link) still sees the full host-editing screen, since only the
token-based `/#/s/:token` route got the read-only treatment this session. See the step's own entry
for the full account.

**Step 14 (groups, roles, private games) is code-complete in one session.** All four `PLAN.md` exit
criteria are covered by SQL tests (`supabase/tests/groups.test.ts`, 28 new tests — `npm run test:db`
is 91/91, up from 63), plus a full client stack: `src/data/groups.ts`, two new hooks
(`useAccountNames`, `useGroupMemberOptions`), the groups list/detail screens, an invite sheet, a
home-screen pending-invite card, a new-game group picker, and the add-players sheet's real `◈`
section. **A real, pre-existing bug was found and fixed along the way, not introduced by this
step:** every screen that renders a registered player's name (`LiveGameView`, `SettlementRoute`,
`SummaryRoute`) called `renderPlayerName(p)` with no resolver argument, so any player seated by
account — via a claim, an approved join request, or (as of this step) a group-member pick — would
have rendered with a blank name. Fixed by resolving every player's/viewer's account name through
`profiles_public` uniformly (`useAccountNames`), not just viewers' names as before. `npm run verify`
(now 550 tests, up from 508) and the full Playwright e2e suite are both green. See the step's own
entry below for what's deliberately scoped down and why.

**Step 15 (statistics) is code-complete in one session.** All three `PLAN.md` exit criteria are
covered by tests: `core/statistics.ts` (28 fixture/property-style tests, including the spec's own
worked example verbatim — lost ₪100 five times, won once → −₪400 total, 17% win rate, −67% ROI —
and a dedicated profit-per-hour-with-a-late-joiner fixture) is pure, dependency-free, and never
touches a live table, so "statistics read only from the permanent tables" is true by construction,
not just by convention; `src/data/statistics.ts` fetches from `player_results`/`game_summaries`
(personal) and `group_player_results`/`game_summaries`/`transfer_summaries` (group, already
`is_private`-excluded) and is tested against `fakePostgrestClient.ts` (15 tests); a new SQL test
(`supabase/tests/statisticsViews.test.ts`) proves the group net total a statistics screen would
read is byte-identical before and after `purge_expired_game_data()` runs, and before and after the
game is explicitly deleted — the exit criterion asked for exactly this, not just the general
snapshot-survives-purge property step 11 already covers. Sample-size suppression
(`MIN_SAMPLE_SIZE_FOR_RATE = 5`, below which a rate reports `suppressed: true` rather than a
misleading number) is
asserted directly. The full client stack: `StatisticsPage` (`/statistics`, a nav icon added to
`HomePage` alongside `👥`/`👤`) with a group-switcher chip row ("הכל" plus each of the caller's
groups) feeding both `שלי`/`החבורה` tabs, `PersonalStatsView` (hero net, games-played/win-rate
tiles, cumulative-net sparkline, the full personal detail list), `GroupLeaderboard` (sortable via
chips — net/games/win-rate/ROI/attendance — hiding any player whose `stats_visibility` is
`private`), `GroupTableStats` (the table-level figures), and `FunStatsRow` (all seven fun stats as
a horizontal card row, `nemesisPatron` only populated for a signed-in viewer). `npm run verify`
(now 612 tests, up from 550) and `npm run test:db` (97, up from 91) are both green. See the step's
own entry below for what's deliberately scoped down (the "detail table" is a label/value list, not
a literal spreadsheet-style grid) and why.

**Step 16 (retention live, deletion, export) is code-complete in one session, and needed no schema
change at all** — the only step so far with no new migration. `purge_expired_game_data()` (step 11)
already returned exactly the `{table_name, deleted_count}` shape its own exit criterion wants, and a
pre-existing SQL test (`supabase/tests/purgeExpiredGameData.test.ts`) already asserted that shape;
the real remaining gap was that nothing ever called it. **A real, pre-existing bug was found and
fixed along the way, not introduced by this step:** `SupabaseSyncTransport`'s `game_ended` case
(step 12/13) only ever updated `games.status`/`ended_at` — it never called the `finalize_game()` RPC,
so a normal signed-in host ending a game never got a permanent snapshot server-side at all; only
`localGameMigration.ts`'s one-time backlog push ever invoked it. Fixed by calling
`finalize_game` right after the `games` update in the same case, which is safe and idempotent (a
retried push re-derives the identical snapshot). Built on top of that fix: `core/gameExport.ts`
(pure — money in major units, since this file is read by a human, not the app) plus
`src/data/gameHistory.ts` (`fetchPastGameResult`/`fetchAllHistoryForUser`, reading the three
permanent tables directly — RLS alone decides visibility) give a per-game and an all-history JSON
export, triggered via `src/features/game/download.ts`'s `downloadJson`. `core/offline/
gameActions.ts#deleteGameLocally` plus `src/data/gameDeletion.ts#deleteGame` wipe a game's local
Dexie copy and, if cloud-configured, the remote `games` row too (RLS-gated, a harmless no-op for
anyone but the real host or a game that was never pushed) — no new RPC needed, since
`games_delete`'s existing RLS policy plus the tier-2/3 cascade already do exactly what the
confirmation copy promises, proven directly by a pre-existing step-11 test that already exercised a
plain `delete from games`. `DeleteGameConfirmSheet` carries the spec's exact wording for a finished
game (`הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.`) and a different one for an unfinished game, and
is wired into both `LiveGameView`'s and `SummaryScreen`'s `⋯` menus alongside a new `ייצוא` action.
**A second, long-standing gap was found and closed, not newly introduced:** `HomePage` has listed
only active/settling games since step 6, with no way to reach a finished game at all once its
in-progress banner disappeared — `docs/build/PROGRESS.md`'s own step 6/9 entries flagged this as
deliberately deferred, and step 16 is where it stops being deferrable, since exporting/deleting a
finished game needs a way to *get to* one. A "משחקים אחרונים" section now lists them as
`ResultsCard`s. **`PastGameResultsView`** is the new fallback `GamePage` renders once `useGame`
resolves with no local record at all — a purged game, or one this device never had — reading the
permanent tables directly instead of a local fold, with a friendly dead end
(`pastGame.notFoundTitle`) when RLS or an actual purge means there is nothing left to show; a new
`e2e/delete-and-export.spec.ts` drives a real browser through export (a real download, parsed back
and checked) → delete → landing on an empty home screen, and separately confirms an unknown game id
never renders a blank screen. `npm run verify` (now 640 tests, up from 612), `npm run test:db`
(unchanged at 97 — no migration touched), and all 7 Playwright e2e tests are green. See the step's
own entry below for what's deliberately scoped down (JSON only, not CSV; no dedicated unit test for
the all-history export button, the same standing "can't sign in from this sandbox" limitation every
cloud-gated route has had since step 12) and why.

**Step 17 (polish and v1 sign-off) is partially built, one session, not yet `done`.** Of the
"Build" list, this session covers two items in full and leaves the rest — see this step's own
entry below for the complete accounting against every exit criterion and every `Build` bullet, and
why the remaining ones (`wa.me`, the full pseudo-locale sweep, the manual device matrix) are left
for a later session or the owner.

### Checkpoints that are not steps

Things that gate progress but aren't build work, recorded here so they can't be quietly skipped:

| Checkpoint | Gates | Status |
|---|---|---|
| **Design assets committed to `docs/design/`, `docs/11` written from them** | Step 3 | ✅ done 2026-07-28 |
| **Play a real game on the step-7 build** | Step 7 `done` | in progress 2026-07-31 — owner started real play, reported two bugs, both fixed this session (see step 7 entry below and `NOTES.md`); not yet a full clean night |
| **Paste the share text into real WhatsApp on iOS and Android** | Step 9 `done` | not reached — needs the repository owner |
| **Create the real Supabase project and apply `supabase/migrations/*.sql` to it** | Step 10 `done` | ✅ done 2026-07-30 — project created by the owner, migrations applied via the Supabase MCP connection this session |
| **Set the `SUPABASE_URL`/`SUPABASE_ANON_KEY` GitHub repo secrets `maintenance.yml` needs** | The keep-alive cron actually pinging; the deployed build's real cloud sync (step 12) | ⚠️ set but wrong 2026-07-31 — both secrets exist (the workflow no longer early-exits) but every real ping since has returned `401` from Supabase's REST gateway, confirmed against both the GitHub Actions run logs and the project's own API logs (see `NOTES.md`). Needs the repository owner to re-check the `SUPABASE_ANON_KEY` secret's value — no tool available here can read or set repo secrets. `deploy.yml` now maps these same two secrets to `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at build time (2026-07-31), so once the value is fixed the very next deploy picks up real cloud sync with no further build changes — until then the deployed app builds fine but auth/sync silently behave as "not configured", same as this sandbox always does. |
| **Apply the step-11 migrations to the real Supabase project** | Step 11 `done` | ✅ done 2026-07-31 — applied via the Supabase MCP connection after the owner's go-ahead; a security-advisor follow-up migration was needed and applied too (see `NOTES.md`) |
| **Sign in on a real device against the real Supabase project** | Step 12's auth/sync behaviour confirmed end-to-end | not reached — needs the repository owner and the `SUPABASE_ANON_KEY` fix above; this sandbox cannot reach `*.supabase.co` at all (see `NOTES.md`), so every step-12 module is tested against an in-memory fake, never the live project. A real bug surfaced by the owner's first real-device attempt (2026-08-02) is now fixed: `signInWithMagicLink`/`signInWithGoogle` redirected to `window.location.href`, which collided with the hash router and silently broke `detectSessionInUrl` — see `NOTES.md`. Still not confirmed end-to-end against the live project from here. |
| **Apply the step-13 migration to the real Supabase project** | Step 13 `done` | ✅ done 2026-07-31 — applied via the Supabase MCP connection after the owner confirmed; surfaced and fixed a real migration-history drift bug across all 21 migrations plus two under-revoked functions (see the step's own entry and `NOTES.md`). `supabase/tests/` (63/63) and `npm test` (508/508) are green against local Postgres and fakes respectively; still not tested against a real signed-in device — that part still needs the owner |
| **Apply the step-14 migration to the real Supabase project** | Step 14 `done` | ✅ done 2026-08-01 — applied via the Supabase MCP connection after the owner explicitly said to; `get_advisors(type: 'security')` afterward showed only the expected `anon`/`authenticated`-executable pattern every prior caller-invoked RPC already carries (confirmed directly by counting the same advisor against `take_over_host`/`decide_join_request`/`hand_over_host`/`decide_claim`, all of which show the identical two hits) — no new gap, unlike step 11's real one |
| **Apply the step-15 migration to the real Supabase project** | Step 15 `done` | ✅ done 2026-08-02 — applied via the Supabase MCP connection (widens `profiles_public` to include `stats_visibility`); version-repaired (`20260801133718` → `20260802090000`) per the now-standard rule; `get_advisors(type: 'security')` afterward shows the same pre-existing `profiles_public` `security_definer_view` flag the step-10 RLS migration's own comment already accepts as intentional (it needs owner privileges to see co-member rows `profiles_select_self`'s RLS would otherwise hide, compensating with its own WHERE clause — the same pattern `group_player_results` was deliberately *not* left in, back in step 11, because that view's read path didn't need the bypass) — no new gap |
| **Confirm `maintenance.yml`'s new purge step against the real Supabase project** | Step 16 `done` | not reached — needs the repository owner (or a future session with the same Supabase MCP access) to dispatch `maintenance.yml` manually and confirm the purge step's log lines actually appear; no schema changed this step, so this is a workflow-only checkpoint, not a migration one |

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

---

### Step 7 — The buy-in counter and the game page
**Status:** in progress — code complete, blocked on a real game only the owner can play
**Sessions:** 1  **Commits:** 1

**Built.** The whole main screen, on top of steps 4–6's foundation:

- `core/pot.ts` — the safeguard's arithmetic (`computePotStatus`), pure. A still-active (unsettled)
  player is treated as neutral — their chips are assumed to exactly match what they bought, since
  the app never observes a live chip count mid-game — so only settled players can push the banner
  red. `unaccountedMinor` subtracts out of the discrepancy, so "assign to the house" closes the gap.
  10 hand-computed fixture tests, including two that assert cash-paid and shared costs never enter
  the calculation at all.
- `core/auditLog.ts` — `buildAuditLog()`, pure: turns the raw event log (every event, not fold's
  active subset) into typed entries with a category (`buy_ins`/`settlements`/`management`), a
  running per-player buy-in count for `buy_in_added`/`buy_in_removed` lines, and undo-pair
  collapsing that matches `fold()`'s own exclusion rule exactly.
- `core/events.ts` additions: `GENERICALLY_REVERSIBLE_TYPES` / `isGenericallyReversible` — the
  audit log's "long-press to undo" is gated on this, not on `INVERSE_TYPES` directly (see Deviated).
  `createUndoEvent` now accepts an optional explicit `clientCreatedAt`.
- `core/offline/clock.ts` — `nextTimestamp()`, a strictly-increasing per-device clock (see Deviated
  — this fixes a real ordering bug found while building this step).
- `core/offline/gameActions.ts` — every mutation this screen needs: `addBuyIn`/`removeBuyIn`
  (return the appended event, for the batch state below), `setCashPaid`, `settlePlayer`/
  `reopenPlayer`/`editSettledChips`, `addSharedCost`/`updateSharedCost`/`removeSharedCost`,
  `setUnaccounted`, and the generic `undoEvent`.
- `core/offline/outbox.ts` — `appendUndoEvent`: appends the inverse and stamps the original's
  `undoneBy` in one transaction, re-queueing both so the pairing survives a sync push even if the
  original already left the outbox.
- `core/offline/useGame.ts` — now also returns the raw `events` array (needed by the audit drawer
  and by undo, which needs the exact original `GameEvent` to invert).
- `features/game/buyInBatch.ts` — the coalescing-undo window as a small Zustand store
  (`createBuyInBatchStore` factory + a default instance): every tap resets a 3s inactivity timer;
  the window holds one entry per touched player (net delta + every underlying event); Zustand
  because this is exactly the per-tap, frequently-updating state `CLAUDE.md` says doesn't belong in
  Context — and the first real use of Zustand in the app (`02-architecture.md#frontend-stack`).
- `features/game/buyInText.ts` / `auditLogText.ts` — compose the exact spec-worded sentences
  ("מור · קנייה 3 · +100 ז'יטונים · +₪50", "+3 קניות" once taps coalesce, audit lines like
  "00:14 · מור — קנייה 3") from i18next templates with every signed figure LRI/PDI-isolated.
- New components: `BuyInCounter` (both buttons 48px — see Deviated), `CashPaidSheet`, `SettleSheet`
  (one component, two modes: settle vs. edit-chips), `BuyInBatchBar`, `PotBanner` +
  `PotResolutionSheet`, `SharedCostsSheet` (list + add/edit form, equal and custom split),
  `AuditLogDrawer` (filter chips, undo-behind-a-confirm-tap).
- `PlayerRow` rewritten to the full two-line anatomy (name/owed/⋯, then cash-paid/counter), settled
  state (40% opacity, locked signed net result, disabled counter), and a real late-joiner caption
  with the join time.
- `PlayerActionsSheet` extended: settle/reopen/edit-chips (row-state-dependent), cash paid, rename,
  remove — ordered non-destructive-first per the spec's table.
- `GamePage` rewritten: sticky header with the private badge, an `H:MM` elapsed clock
  (`hooks/useElapsedTime.ts`), the real `SyncIndicator` (steps 1/5's indicator and outbox, wired to
  a real screen for the first time), the pot banner, the shared-costs summary line, every sheet
  above, the coalescing snackbar/batch bar, and `useWakeLock`/`useBeforeUnloadGuard` finally called
  with a real `gameId` (step 5 built them with nothing to call them yet).

**59 new tests** across 15 files (`pot`, `auditLog`, `clock`, `gameActions` additions, `buyInBatch`,
`buyInText`, `auditLogText`, `BuyInCounter`, `SettleSheet`, `PlayerRow`, `PlayerActionsSheet`,
`BuyInBatchBar`, `PotBanner`, `PotResolutionSheet`, `SharedCostsSheet`, `AuditLogDrawer`,
`useElapsedTime`). Total test count: 346, `npm run verify` green.

The whole flow was also driven in real headless Chromium against the dev server, twice: once with
real Hebrew content (create game → rapid multi-row buy-ins → batch bar with correct per-row and
total figures → decrement-to-zero removal prompt → cash paid → settle → red pot banner with the
correct discrepancy → resolution sheet → shared cost → audit log with working category filters) and
once with the network fully disabled after first load (`context.setOffline(true)`) repeating buy-ins,
cash paid and the audit log. Zero console errors in either run. The pseudo-locale was checked at the
document level (`dir` flips to `ltr`, the pre-existing new-game screen holds up) rather than
screenshotted per new sheet — see Left undone.

**Deviated.**
- **A real ordering bug, found and fixed.** `fold()`'s tie-break on identical `clientCreatedAt`
  timestamps falls back to `clientEventId` — a random UUID compare, unrelated to causal order. Two
  appends in the same millisecond (e.g. `settlePlayer` immediately followed by `editSettledChips`,
  which this step's settle-sheet reuse makes a real, easy-to-hit sequence) could silently apply in
  the wrong order. Fixed at the call site, not in `fold()`: `core/offline/clock.ts`'s
  `nextTimestamp()` stamps every event this device creates with a strictly-increasing timestamp,
  and `createUndoEvent` now takes an optional explicit timestamp so `undoEvent` can supply one too.
  `fold()`'s comparator itself is untouched — still exactly as simple as `core/events.ts`'s purity
  contract wants.
- **A second, latent bug found and *not* generically fixed: undoing `shared_cost_removed`.**
  `createUndoEvent`'s generic payload-copying only works when the inverse type's payload is a
  subset of the original's. That holds for every pair already in `INVERSE_TYPES` except one:
  `shared_cost_removed`'s real payload is `{ costId }`, nowhere near enough to reconstruct the
  `shared_cost_added` it would invert to (label, amount, payer, split, shares) — undoing a removal
  would append a malformed event and crash the fold. Rather than special-case the generic mechanism,
  `core/events.ts` now exports `GENERICALLY_REVERSIBLE_TYPES` / `isGenericallyReversible`, a
  narrower allow-list than `INVERSE_TYPES`, and the audit log's undo affordance is gated on that.
  Removing a shared cost is simply not undoable through this path yet — a real fix (an explicit
  inverse-payload override on `createUndoEvent`) is left for whenever shared-cost editing needs it.
- **The pot banner's "still-playing" semantics are a build-time reading, not a spec quote.**
  05-settlement.md defines `discrepancy = totalBuyIns − totalChips` but doesn't say what an
  unsettled player contributes, because the doc's own worked examples are all settlement-time.
  Documented and tested in `core/pot.ts` (see Built) rather than left as a silent assumption.
- **"Split evenly among players"**, the safeguard's third resolution, is not built. It needs a
  settlement transfer graph to distribute the discrepancy into — step 8 — which doesn't exist yet.
  "Fix the counts" and "assign to the house" (both fully realizable now) are built; the third button
  is simply absent rather than present-and-broken.
- **The header `⋯` opens a one-item menu** (shared costs only) rather than the spec's full game
  settings (rename, viewers, share, hand over, reopen/close, delete) — every other item belongs to
  steps 12/13/16, matching the precedent step 6 set for the row action sheet.
- **The action bar has two items, not four.** `שיתוף` (step 9's share-as-text / step 13's share
  link) and `סיום משחק` (step 9) don't exist yet; a button that can't do its one job is worse than
  no button, per `CLAUDE.md`. `+ שחקן` and `יומן` are both fully real.
- **"Player history in this game"** and **"Edit chips" as a literal spec line item** — the former is
  deferred to statistics (step 15); the latter *is* built, reusing `SettleSheet` in `edit` mode
  (`chips_set` instead of `player_settled`) rather than being a separate component.
- **The audit log's "long-press to undo"** is a tap that reveals a `בטל`/`ביטול` confirm pair, not
  literal 500ms long-press timing — easier to discover, easier to test, same outcome, matching the
  spirit (not the letter) of the row-action-sheet's own long-press-plus-`⋯` precedent from step 6.
- **The buy-in counter's `−` button is 48px, same as `+`** — collision #1 from `docs/11` /
  `docs/build/NOTES.md`, resolved by weight (filled accent circle vs. an outlined one) rather than
  by an undersized hit target.
- **Late-joiner caption now shows the real join time** (`הצטרף 23:40`) instead of step 6's
  placeholder static text — a small correctness fix made in passing since `PlayerRow` was being
  rewritten anyway.

**Left undone.**
- *Tested at a real game* — the plan's own exit criterion for this step, and it cannot be satisfied
  from here. Everything else is checked: `npm run verify` is green, the flow was driven end-to-end
  in a real browser twice (see Built), and offline behaviour was verified with the network actually
  disabled, not just assumed from the architecture. The step stays `in progress` until a real
  Thursday night confirms it, per `09-roadmap.md#m1--the-napkin-replacement`.
- The pseudo-locale was checked at the document level (RTL→LTR flip, no hardcoded direction) but not
  screenshotted per new sheet the way step 3 did for its component gallery — worth a pass before
  step 8 if time allows, though every class used is logical-properties-only and the lint rules that
  catch physical utilities are green.
- "Split evenly" (see Deviated) and the fuller game-settings menu (see Deviated) — explicitly
  deferred, not attempted.

**Watch out.**
- **`fold()`'s tie-break needs help from its callers.** See Deviated — any *new* call site that
  appends an event should go through `nextTimestamp()` (or plumb an explicit `clientCreatedAt`),
  not bare `new Date().toISOString()`, or two same-millisecond events can silently reorder.
- **Undoing a `shared_cost_removed` event is not offered, on purpose.** See Deviated. Don't route it
  through the generic `undoEvent`/`isGenericallyReversible` path without first giving
  `createUndoEvent` a way to carry an explicit inverse payload.
- **The pot banner's chip-safeguard math never reads `cashPaidMinor` or shared costs, by design** —
  `core/pot.test.ts` asserts this directly. If a future change threads either one through, re-read
  05-settlement.md's money model first: they're both settlement-time concerns, not the buy-in ⇄
  chip-count safeguard.
- **Hebrew currency formatting puts the symbol *after* the number** (`Intl.NumberFormat('he', …)`
  produces `‏50 ‏₪`, not `₪50`), with RLM marks around it. Assertions like `.toContain('−₪50')`
  will fail against the real formatter — check for the digits and the sign as separate substrings
  instead (`money.test.ts` and this step's component tests both do this correctly; a couple of
  first-draft tests here didn't, and the real i18next-backed `buyInText.test.ts` caught it).
- **Component tests can't see interpolated i18next content.** `react-i18next` outside an initialised
  `i18next` instance falls back to returning the raw key, params dropped — confirmed against this
  codebase directly, not assumed. Every component test here (like the rest of the suite) asserts on
  keys and behaviour; the handful of modules whose actual *wording* matters
  (`buyInText.ts`, `auditLogText.ts`) import the real singleton from `@i18n/index` instead and
  assert on real Hebrew sentences.

**Session 2 (2026-07-31) — two real bugs from the owner's first real play, both fixed.**

1. **The pot banner's "chips" figure was the chips' *money value*, not their count.** Pre-settlement
   it therefore always mirrored the buy-in total exactly (e.g. buy ₪50 for 100 chips read
   "קניות ₪50 = ₪50", not "= 100 ז'יטונים") — matched `05-settlement.md`'s literal worked example
   character for character, but that example happens to use a 1:1-looking chip ratio, so the doc
   never actually disambiguates money-value from chip-count. Confirmed as a real, reproducible
   problem (not a misunderstanding) by driving the app directly in a real browser, then fixed with
   the owner's confirmation: `core/pot.ts#PotStatus` gained `totalChipsCount` (real chip units,
   settled players' counted chips + unsettled players' assumed bought chips), and `PotBanner`/
   `money.balanced`/`money.discrepancy` now show it via the existing `pot.chipsCount` phrase instead
   of a second money figure. `totalChipsMinor` (money) is untouched and still drives the actual
   safeguard math — this was a display-only fix. See `NOTES.md`.
2. **The "joined HH:MM" late-joiner caption fired for every player seated via `+ שחקן` right after
   starting** — a totally ordinary way to seat a table — because it compared a player's `joinedAt`
   against `game_started`'s timestamp, and `nextTimestamp()`'s strict monotonicity means literally
   any event appended after `game_started` reads as "later." Fixed by keying "late" off real game
   activity instead of wall-clock proximity to `game_started`: `core/players.ts#firstBuyInTimestamp`
   finds the game's first real `buy_in_added`, and a player only reads as late if they joined after
   that. Verified directly: players seated before any buy-in show no badge; a player added after
   another player already bought in still shows one correctly. Scheduled/planned games (invite ahead
   of time, mark yourself as arriving later) came up in the same conversation but is out of scope —
   already deferred post-v1 per `01-product-spec.md#10-planned-not-in-v1`/`PLAN.md`, not something
   this session touched.

Both fixes verified with `npm run verify` green (405/405 tests) and by driving the exact reported
scenario in a real headless-Chromium browser against the dev server — screenshots before/after
confirm the banner now reads real chip counts and the false-positive late badge is gone, plus a
third scenario confirms a genuine latecomer (joining after another player already bought in) is
still correctly flagged.

---

### Step 8 — Settlement core
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** `src/core/settlement.ts`, zero imports beyond `./money`, covering all three exit-facing
pieces of `05-settlement.md`:

- **The money model.** `computeBalances()` — per player: `owedMinor`, `cashOutMinor`, `netMinor`
  (statistics), `sharedMinor` (paid − their share of shared costs), `balanceMinor` (settlement).
  Reuses `owed`/`chipsToMoney`/`net` from `core/money.ts` rather than recomputing them. The pot's
  balance is `−Σ cashPaid(p)` plus any shared cost the pot itself paid for (reduces what it owes
  out). The house/unaccounted node's balance is `unaccountedMinor` verbatim — derived, not
  spec-quoted, and proven to close the whole graph exactly when the host has assigned the full raw
  discrepancy to it (matches `core/pot.ts`'s banner turning green). See `NOTES.md`.
- **The minimum-transfer algorithm**, all three stages: exact-pair cancellation
  (`cancelExactPairs`), a bitmask DP for `n ≤ 14` that finds the optimal partition into disjoint
  zero-sum groups and reconstructs it via parent pointers (`partitionIntoZeroSumGroups`), then
  greedy *within* each group (`settleGroupGreedy`, always exactly `|group| − 1` transfers for a
  DP-irreducible group, regardless of match order — proven, not assumed). Above 14 nodes, greedy
  runs once over everything as a single group, per spec. `POT_ID`/`HOUSE_ID` are exported sentinel
  ids, structurally distinct from a real player id.
- **Tie-breaking.** "Prefer the pot as payer" is applied *inside* each group's greedy step (pot is
  always the active debtor while it's alive), not as a separate pre-pass — see Deviated. Ties
  otherwise broken by seat order, for a deterministic, finger-safe re-render. "Rounder numbers"
  (the third tie-break) is not implemented — see Left undone.
- **The snapshot builder**, `buildGameSnapshot()`, producing `GameSummarySnapshot` /
  `PlayerResultSnapshot[]` / `TransferSummarySnapshot[]` shaped after `03-data-model.md`'s three
  permanent tables. Pure: `finishedAt`/`durationMinutes` are inputs, not wall-clock reads, and the
  player-result id generator is injectable (defaults to `crypto.randomUUID()`) for deterministic
  tests. Nothing persists it yet — step 11's job — but no finished game can now exist without one
  being buildable from its final state.

**20 new tests** in `settlement.test.ts`: the two spec-worked fixtures (Rani's pot example,
07's four-player final settlement — transfer for transfer), shared-cost-paid-by-player and
paid-by-pot balance checks, the house-node-closes-the-graph check, a hand-built counterexample
regression (see Deviated), and five `fast-check` property suites: the settlement invariants
(sums to each player's balance, no negative/zero/self transfers, ≤ n−1 transfers, deterministic,
idempotent), "adding shared costs never breaks the balance invariant," and — cross-checked against
an independent brute-force reference implemented only in the test file — "transfer count equals
the true optimum (`n − k`) for randomly generated small balance sets." Total test count: 366,
`npm run verify` green (typecheck, lint, lint:css, test, audit:prod, build all pass; the existing
purity lint rule already covers `core/settlement.ts` since it's a direct child of `core/`).

**Deviated.**
- **The pot is not drained in a separate pass before the general algorithm runs**, even though
  05-settlement.md's prose describes it that way and claims doing so "never increases the transfer
  count." Implemented literally, it does: a concrete 5-node counterexample (kept as a permanent
  regression test) shows global pot-draining costing a 4th transfer where the DP optimum is 3.
  "Prefer the pot as payer" is instead scoped to *inside* each DP-selected zero-sum group, which is
  provably count-safe. Full reasoning in `NOTES.md`.
- **"Rounder numbers"** (05's third tie-break priority) is not implemented. The spec gives no
  rigorous definition of what counts as "rounder," and building a real secondary optimisation for
  an informally-specified, non-testable preference risked exactly the kind of premature abstraction
  `CLAUDE.md` warns against. The two implemented tie-breaks (pot-as-payer, seat-order determinism)
  are the ones with clear, testable meaning.
- **`TransferSummarySnapshot` exposes `fromId`/`toId` (real player id or a `POT_ID`/`HOUSE_ID`
  sentinel)**, not the `from_name`/`to_name` text `03-data-model.md`'s `transfer_summaries` table
  actually stores. Resolving an id to display text needs player names and i18next, both off-limits
  under the Purity rule — deferred to step 11, which writes the real DB rows. See `NOTES.md`.
- **`sharedCostsShareMinor` on `PlayerResultSnapshot`** is populated with `sharedMinor` (paid minus
  their share of shared costs) — `03`'s column comment just says "a single amount," so this is a
  reasoned reading rather than a spec quote, consistent with how the money model already defines
  `shared(p)`.

**Left undone.** Nothing against `PLAN.md`'s exit criteria — all five are met. The "rounder
numbers" tie-break (see Deviated) is the one piece of `05`'s prose not implemented; it's a
preference, not a correctness invariant, and nothing in `PLAN.md`'s exit criteria names it.

**Watch out.**
- **Don't reintroduce global pot-draining.** See Deviated/`NOTES.md` — it looks like a reasonable
  reading of the spec's prose and is provably wrong. The counterexample in `settlement.test.ts`
  (`computeTransfers — fixed regressions`) will fail if this regresses.
- **`computeTransfers` throws if its input doesn't sum to zero.** This is intentional — it's the
  precondition 05-settlement.md's whole model assumes, and the safeguard (`core/pot.ts`) is what's
  supposed to make it true before settlement runs. Step 9's ending flow must ensure the safeguard
  is resolved (or explicitly overridden via `unaccountedMinor`) before calling into this module;
  don't add a silent fallback here if that call site is ever wired up incorrectly — surfacing the
  bug immediately is the correct behaviour for this module.
- **`buildGameSnapshot` needs already-settled players.** `SnapshotPlayerInput.chipsFinal` is a
  plain `number`, not nullable — the caller (step 9's ending flow) is responsible for the
  missing-players check before assembling this input; this module doesn't re-derive it.

---

### Step 9 — End game, edit mode, share text
**Status:** in progress — code complete, blocked on a real WhatsApp paste test
**Sessions:** 1  **Commits:** 1

**Built.** The whole rest of a single game's lifecycle, on top of step 8's settlement core:

- **`core/settlement.ts` additions:** `computeReconciliation` (אמור/בפועל/פער per node) and
  `computeSettlementProgress` (the sticky banner's assigned/total/complete). `buildGameSnapshot`
  gained an optional `transfersOverride` parameter — when given, it writes that list verbatim and
  skips `computeTransfers` (and its sum-to-zero assertion) entirely, since a host's hand-edited
  transfers are allowed to not balance perfectly pending an explicit override.
- **`core/events.ts` change:** `transfer_edited`'s `fromPlayerId`/`toPlayerId` (and `TransferState`'s)
  went from `string | null` (null = pot) to plain `string`, using `POT_ID`/`HOUSE_ID` from
  `core/settlement.ts` as sentinels instead of null. Needed because the settlement graph has *two*
  non-player parties now (pot and house), not just one — see `NOTES.md`.
- **`core/offline/db.ts`:** a `snapshots` table (`gameId → GameSnapshot`), written once on
  finalisation, deleted on reopen.
- **`core/offline/gameActions.ts` additions:** `beginSettlement` (`game_settling`, then seeds the
  computed-optimum transfer list as real `transfer_edited` events — from that point on
  `state.transfers` is the single source of truth, no separate "computed default" merging logic
  anywhere), `editTransfer`/`addManualTransfer`/`deleteTransfer` (delete zeroes the row rather than
  removing it — nothing is ever deleted from the log — and the UI filters zero-amount rows),
  `recomputeTransfers` (zeroes every current row, reseeds fresh), `finalizeGame` (builds and stores
  the snapshot from the host's final transfer list, *then* appends `game_ended`, so a `finished`
  game can never be found without one), `reopenGame` (`game_reopened` + deletes the now-stale
  snapshot).
- **New components** (`features/game/`): `EndGameConfirmSheet` (summary, the missing-players check,
  the discrepancy acknowledgement gating the slide, `SlideToConfirm`), `TransferPartyPicker` (the
  "chip picker" — a grid of name chips including `קופה`), `TransferRow` (one component, read mode
  for the summary screen and edit mode for the settlement screen — inline amount editing via a
  focus-and-replace field, not a separate sheet, per the spec's "numeric keypad inline"), `SettlementBanner`
  (the sticky progress banner, its fill width driven by a CSS custom property set via a ref effect —
  never the `style` prop, which the lint rule bans), `ReconciliationStrip`, `SettlementScreen` and
  `SummaryScreen` (the two big composed screens), wired to live state by `SettlementRoute` and
  `SummaryRoute`.
- **`features/game/shareText.ts`:** `formatLiveStatusText` and `formatFinalSettlementText`, both
  templates from `07-hebrew-glossary.md`, composed the same way as `buyInText.ts`/`auditLogText.ts`
  — real i18next keys, every amount through `formatMoneyPlainText` (LRI/PDI-isolated). Verified
  against the glossary's own worked examples in `shareText.test.ts`.
- **`GamePage.tsx` restructured into a thin dispatcher.** It now only fetches the game and branches
  on `state.status`: `settling` → `SettlementRoute`, `finished` → `SummaryRoute`, otherwise the
  existing live game, extracted verbatim into `features/game/LiveGameView.tsx` (was outgrowing a
  single file even before this step — see `CLAUDE.md`'s "components stay small"). The whole game
  lifecycle stays at one URL, `/#/game/:id`, so a bookmark or share link works regardless of which
  phase the game has reached.
- **`useReopenWindow`/`useInstallPrompt`** (`src/hooks/`): the 24h reopen countdown, and the
  `beforeinstallprompt` wrapper behind the summary screen's install nudge (Chromium/Android only —
  see Deviated).

**39 new/changed unit and component tests** across `settlement.test.ts`, `gameActions.test.ts`,
`shareText.test.ts`, `EndGameConfirmSheet.test.tsx`, `TransferRow.test.tsx`, `useReopenWindow.test.ts`,
`useInstallPrompt.test.ts`. **A real Playwright e2e test** (`e2e/full-game.spec.ts`, the exit
criterion): create → 4 players → buy-ins → a shared cost → settle everyone → end (a real drag
gesture on `SlideToConfirm`) → the settlement screen shows `הכל שויך ✓` → finish → the summary
screen → copy transfers → the clipboard actually contains the real share text. Run **twice** — once
online, once with the network disabled after the first load — matching step 7's own precedent that
offline is verified with the network actually off. Total unit/component test count: 401, `npm run
verify` green.

**A real bug found and fixed while wiring `SettlementRoute`.** Passed `TransferState[]`
(`{fromPlayerId, toPlayerId, ...}`) directly to `computeReconciliation`/`computeSettlementProgress`,
which expect `Transfer[]` (`{fromId, toId, ...}`) — every row's "actually assigned" silently read as
0, so the banner could never reach `הכל שויך ✓` even though the underlying transfers were correct.
**Caught by the e2e test, not by `npm run tsc --noEmit -p .`, which I had been running ad hoc all
session and which does *not* catch this** — see the environment entry in `NOTES.md`, this is
important for the next session.

**Deviated.**
- **`formatLiveStatusText` is built and tested but not wired to any button.** `PLAN.md` names "both
  templates" as a build item; both exist. But wiring the live-game share button properly needs the
  full 3-section share sheet (live link, viewers, text) from step 13 — building a text-only version
  now would just mean rebuilding it there. `formatFinalSettlementText` *is* wired (summary screen's
  `שיתוף`/`העתק העברות`, and the settlement screen's `שתף כטקסט`, using the current in-progress
  transfer list). Matches step 7's own precedent for the same button.
- **The end-game discrepancy acknowledgement checkbox's label
  (`להמשיך למרות הפער`) is invented, not a glossary quote** — `07-hebrew-glossary.md` has the
  mismatch *prompt* verbatim but no wording for this specific checkbox. Worth a native-speaker pass
  alongside the rest of `07`'s "have a native speaker review this list once" note.
- **The install prompt is Chromium/Android only.** iOS Safari has no `beforeinstallprompt`
  equivalent and needs manual "Add to Home Screen" instructions — out of scope here, not attempted.
- **Shared costs and `unaccountedMinor` are not editable from the settlement screen.** Once
  `beginSettlement` fires there's no path back to `active` (no inverse event for `game_settling`,
  by design — the pre-confirm sheet is the actual point of no return). Reasonable: those decisions
  belong to the live phase, before ending.
- **`SummaryRoute` reads live state, not the stored snapshot.** See its own doc comment:
  `PlayerResultSnapshot` deliberately carries no live player id to join transfers against (matches
  `03-data-model.md`'s real schema, which must survive the live rows being purged), so joining the
  snapshot back to display names would mean inventing a schema field the permanent table doesn't
  have. Reading live state — still fully populated immediately after finalising — is correct for
  the window this screen actually serves; making the summary screen (and a purged game's results
  card) work from the snapshot alone is step 16's job.

**Left undone.** Nothing against `PLAN.md`'s exit criteria except the one thing that structurally
can't be done here: pasting the share text into real WhatsApp on iOS and Android. Everything else —
full offline flow, the banner refusing "complete" until the books actually balance, hand-correction,
the Playwright test — is built and verified.

**Watch out.**
- **Use `npm run typecheck` (`tsc -b`), never an ad hoc `tsc --noEmit -p .`.** They are not
  equivalent in this project — see `NOTES.md`. The real bug above went undetected through several
  rounds of the wrong command actually reporting clean.
- **A `BottomSheet`'s entrance animation is 260ms** (`--animate-sheet-in`). Any Playwright test that
  measures element geometry (a drag, a precise click) right after opening one needs to wait for it
  to settle first, or the coordinates are stale by the time the input lands — see `NOTES.md`.
- **`transfer_edited`'s parties are never `null` anymore.** `POT_ID`/`HOUSE_ID` (from
  `core/settlement.ts`) are the sentinels now, for both the pot and the house/unaccounted node. Any
  future code touching a `TransferState` should not reintroduce a null-for-pot special case.
- **Deleting a transfer zeroes it; it does not remove the row.** Every list derived from
  `state.transfers` must filter `amountMinor > 0` before rendering or summing — `SettlementRoute`
  and `SummaryRoute` both do this at the point they read `state.transfers`, not downstream.

---

### Step 10 — Database foundation and RLS
**Status:** done  **Sessions:** 2  **Commits:** 2

**Built.** The whole schema and permission model, in `supabase/migrations/` (14 files, Supabase's
own timestamp-prefixed naming so `supabase link && supabase db push` will accept them unmodified
whenever a real project exists):

- **All 17 tables from `03-data-model.md`** — not just the 14 "live" ones `PLAN.md` names for this
  step, but also `game_summaries`/`player_results`/`transfer_summaries` (see Deviated) — every
  enum (`game_status`, `stats_visibility`, `group_role`, `invite_status`, `split_mode`,
  `approval_status`, `join_request_role`, `join_request_source`, `settlement_party`, and
  `game_event_type` with all 31 values matching `core/events.ts`'s `EVENT_TYPES` verbatim), the
  reserved columns for locations/scheduled games (no table, per `PLAN.md`), and one real
  correctness trigger: `buy_amount_minor`/`chips_per_buy` become immutable on `games` the moment a
  `buy_in_added` event exists for it, exactly as `03-data-model.md#games` requires.
- **RLS helper functions** (`is_host`, `is_game_player`, `is_game_viewer`, `is_group_member`,
  `is_group_admin_or_owner`, `is_group_owner`, `is_in_game`, `can_read_game`, plus
  `game_group_id`/`group_created_by`, added to fix a real cross-table visibility bug — see
  Deviated), all `SECURITY DEFINER STABLE` so a policy can call one without recursing into its own
  restricted view of the table it's protecting.
- **RLS enabled on every table, with real policies matching `03-data-model.md`'s table** — writes
  host-only throughout, `game_events` insert-only with no update/delete grant for any role, the
  permanent tables writable by nobody, and a `profiles_public` security-definer view doing the
  column-level narrowing (username/display_name/avatar_url to co-members; everything else
  self-only) that a row-level policy alone can't express.
- **The `game_events` → `game_players` cache trigger** (`apply_game_event_to_player_cache`,
  `AFTER INSERT`), scoped deliberately narrow — see Deviated.
- **The two audited RPCs `PLAN.md` names**, plus what they actually needed: `take_over_host`
  (matches `03-data-model.md#host-takeover` exactly — updates `host_id`, then appends
  `host_taken_over`), `decide_join_request` (host-only; approval atomically seats a player via a
  `player_added` event or inserts a `game_viewers` row, and appends `join_approved`/
  `join_rejected`), a small trigger (`log_join_requested`) so the plain-RLS "ask to join" insert
  still produces an audit-log entry, and `mark_event_undone` — the one narrow, forward-only
  exception to "insert-only, no update, ever" that the undo model actually needs (see Deviated).
- **The test harness**, `supabase/tests/` — a separate Vitest config (`npm run test:db`, never part
  of `verify`) whose `globalSetup` rebuilds a real local Postgres database from
  `supabase/tests/support/auth-shim.sql` (a local/CI-only stand-in for the `auth` schema a real
  Supabase project already provides) plus every migration, in order, before any test runs.
  18 tests across three files:
  - `eventEnumParity.test.ts` — reads `pg_enum` for `game_event_type` and asserts it equals
    `core/events.ts`'s `EVENT_TYPES` exactly (the step's third exit criterion, mechanically).
  - `rlsEnabled.test.ts` — asserts all 17 tables have RLS on, **and** a dedicated test that
    disables RLS on a real table inside a rolled-back transaction and confirms the same query
    flags it — the "prove it" exit criterion, not just a check that currently happens to pass.
  - `rlsPolicies.test.ts` — a non-host can't write a `game_event` (and the row is simply invisible
    to them, not just unwritable); anon can't read or write at all; `game_events` truly can't be
    updated or deleted by any role; nobody, including the host, can insert into the permanent
    snapshot tables; someone not in the game can't `take_over_host`, a bogus game id and "not in
    the game" produce the byte-identical error message (the generic-rejection-shape criterion), a
    player *or* a viewer can take over; the join-request path end to end (ask → logged as an event
    → only the host decides → approval seats the player), including that a group member can't
    submit a request impersonating someone else.
- **CI**: a new `db-tests` job in `deploy.yml` (a plain `postgres:16` service container — GitHub
  Actions runs Docker natively even though this sandbox can't, see `NOTES.md`), gating `deploy`
  alongside `verify`. A new `maintenance.yml` with the `0 6 */3 * *` keep-alive cron, which warns
  (not fails) and no-ops until `SUPABASE_URL`/`SUPABASE_ANON_KEY` repo secrets exist.
- **No service-role key anywhere** — trivially true, never introduced one; the fourth exit
  criterion.

**Deviated.**
- **All 17 tables were built here, not the 14 `PLAN.md` names for this step.** `03-data-model.md`'s
  own RLS table covers all 17 together, and CLAUDE.md's "RLS on every table, no exceptions" reads
  better as "no exceptions, ever" than "no exceptions once step 11 gets around to it." `PLAN.md`'s
  step 11 section is edited to match — see `NOTES.md`.
- **`transfers` gained a `from_party`/`to_party settlement_party` column pair**, not the single
  nullable `from_player_id`/`to_player_id uuid` ("NULL = pot") `03-data-model.md` actually
  documents — that shape predates step 8's house/unaccounted settlement node. Full reasoning in
  `NOTES.md`; step 12's repository layer will need to map `POT_ID`/`HOUSE_ID` ⇄ `party`.
- **A real, reproduced Postgres RLS+`RETURNING` bug, found and fixed**: a table's own policies
  must never call a helper that re-queries that same table (`games_select` no longer uses
  `is_host(id)`/`can_read_game(id)`, using `host_id = auth.uid()` directly instead) — see
  `NOTES.md` for the full mechanism and the two other places the identical bug pattern showed up
  (`join_requests_insert`, `player_claims_insert`, `group_members_insert_owner`).
- **`group_members` has no general INSERT policy at all** — only a narrow exception for a group's
  creator to insert themselves as the one `owner` row. Every other membership row is meant to come
  from step 14's accept-invite RPC. See `NOTES.md`.
- **The join-request "ask" path is a plain RLS insert, not an RPC**; `decide_join_request` is the
  one that's genuinely an RPC (multi-table, host-only, atomic). `PLAN.md` names "the join-request
  path" as one of two RPCs — this is the reasoned split, in `NOTES.md`.
- **`mark_event_undone` wasn't named in `PLAN.md`**, but "insert-only, no update, ever" and "undo
  sets `undone_by` on the original" both appear in `03-data-model.md` and can't both be true
  without some sanctioned exception. Added one, narrow and forward-only. See `NOTES.md`.

**Session 2 (2026-07-30) — the real project.** The owner created the actual Supabase project
(`liran450's Project`, region `ap-northeast-2`, Postgres 17.6) and connected it via the Supabase
MCP server. All 14 migrations from session 1 were applied to it directly — `apply_migration`
against the live project, not `supabase link && supabase db push` (no CLI/Docker available here
either, same constraint as session 1's local-only testing) — verified after the fact with
`list_tables` (all 17 tables present, RLS on for every one) and `list_migrations` (all 14 recorded).

Running `get_advisors(type: 'security')` against the live project — a Supabase platform feature
with no local-Postgres equivalent, so this is genuinely new information session 1 had no way to
produce — surfaced three real, fixable gaps that `supabase/tests/`'s local suite doesn't check for:

1. `prevent_buy_terms_change_after_buy_ins` (the one function in the whole schema) was missing
   `set search_path = public` — every sibling helper/RPC function has it, this one was a plain
   miss.
2. `apply_game_event_to_player_cache` and `log_join_requested` — both AFTER INSERT trigger
   functions only, never meant to be called directly — were callable as public RPCs via
   `/rest/v1/rpc/<name>`, because every Postgres function gets an implicit `EXECUTE` grant to
   `PUBLIC` at creation unless revoked, and neither revoked it.
3. A first attempt at fixing (2) — `revoke execute ... from anon, authenticated` — turned out to
   be a no-op for these two specific functions: their `pg_proc.proacl` showed they'd never had an
   explicit per-role grant at all, only the default `PUBLIC` one, so revoking from the named roles
   left `PUBLIC` (which both roles fall back to) untouched. Caught by re-running `get_advisors`
   after the first fix and seeing both still flagged; fixed for real by revoking from `PUBLIC`
   directly. See `NOTES.md` for the full mechanism — worth knowing before revoking EXECUTE on
   anything else in this schema.

Two new migrations record both fixes (`20260730150000_security_advisor_fixes.sql`,
`20260730150100_revoke_public_execute_on_triggers.sql`), applied to the live project and committed
to `supabase/migrations/` so the directory stays the single source of truth. Deliberately **not**
touched, even though the advisor flags them too: the `profiles_public` security-definer view (by
design — see this step's own "profiles_public" NOTES.md entry) and every RLS helper/RPC function
that genuinely needs to stay callable by `anon`/`authenticated` (`is_host`, `can_read_game`,
`take_over_host`, `decide_join_request`, `mark_event_undone`, etc. — RLS policies for those roles
call them directly, so revoking would break the policies, not just the advisory noise). Also seen
and left alone: `rls_auto_enable()`, owned by `postgres` — a Supabase platform function, not one of
ours. `npm run test:db` (18/18) and `npm run verify` were re-run after adding the two new migration
files and both stay green.

**Left undone.** All four of `PLAN.md`'s exit criteria are met, `npm run test:db`/`npm run verify`
are green, and the real project now has the full schema applied. The one thing still outstanding —
tracked in the checkpoint table, not one of `PLAN.md`'s four exit criteria — is the
`SUPABASE_URL`/`SUPABASE_ANON_KEY` GitHub repo secrets `maintenance.yml` needs: no tool available
in this session can set repo secrets, so the keep-alive cron stays a no-op (it warns and exits 0)
until the owner adds them by hand. The real anon key and project URL were surfaced to the owner in
chat, not committed anywhere — matching `.env.local`'s own "never commit a filled-in `.env`" rule.

**Watch out.**
- **Never give a table's own RLS policy a helper function that re-queries that same table.** See
  `NOTES.md`'s RETURNING entry — it's silent (no error) until something does `INSERT ...
  RETURNING`, which the real Supabase JS client's `.insert().select()` idiom does routinely, so
  this would otherwise resurface the moment step 12 wires up real writes.
- **`game_events`' cache trigger only touches `game_players`.** Don't extend it to also derive
  `shared_costs`/`transfers`/`join_requests`/`player_claims`/`game_viewers`/`games.status`/
  `host_id` from the log — those are meant to be direct writes in the same transaction as the
  matching event append, per `NOTES.md`'s reasoning. If step 12's repository layer ever finds
  itself wanting to derive one of those from replay instead, that's a real design change, not an
  oversight to quietly fix here.
- **`supabase/tests/support/auth-shim.sql` is local/CI-only.** Never apply it to a real Supabase
  project — it would collide with the platform's own `auth` schema.
- **RLS is enabled on every table, but nobody has granted `anon`/`authenticated` access to the
  `profiles_public`, `groups`, etc. *view* objects beyond what's already there** — if a future step
  adds a new view, remember views need their own `grant select` even when the underlying tables
  already have RLS-gated access; view privileges and table privileges are separate.
- **`revoke execute on function f() from anon, authenticated` is a no-op if `f` only ever had the
  default `PUBLIC` grant** — check `pg_proc.proacl` (or just re-run `get_advisors`) after revoking;
  revoke from `PUBLIC` explicitly when that's what's actually granted. Hit this for real fixing
  `apply_game_event_to_player_cache`/`log_join_requested` in session 2 — see this step's own entry
  above and `NOTES.md`.
- **Revoking `EXECUTE` on a trigger function does not break the trigger.** Postgres's trigger
  manager invokes the function directly by OID when the trigger fires, which isn't gated by the
  invoking role's `EXECUTE` privilege — that check only applies to an explicit SQL/RPC call to the
  same function. Safe to revoke on any function that's trigger-only and never meant to be called
  directly; not safe on anything an RLS policy calls inside `USING`/`WITH CHECK`; not verified with
  a live insert against the real project (would have meant writing fabricated game data into a
  brand-new production database, not local Postgres) — worth a real check the first time step 12
  actually exercises `player_added`/`join_requested` against this project.
- **The Supabase MCP connection in this environment is flaky** — it dropped and reconnected several
  times mid-session (visible as "MCP server disconnected"/"reconnected" system reminders). Every
  drop happened between tool calls, never mid-call, and no migration was double-applied or
  partially applied — confirmed by re-running `list_migrations` after a reconnect before continuing.
  If a future session hits the same flapping, re-check state before resuming rather than assuming
  the last call landed.

---

### Step 11 — Snapshots, statistics source, retention functions
**Status:** done  **Sessions:** 1  **Commits:** 2

**Built.** Four migrations (three plus one security-advisor follow-up — see Deviated), all tested
against local Postgres (`supabase/tests/`, 36 tests across 6 files, up from 18) and applied to the
real Supabase project:

- **`chips_to_money_minor(chips, buy_amount_minor, chips_per_buy)`** — a SQL re-derivation of
  `core/money.ts`'s `chipsToMoney()`/`bankersRound()` (round-half-to-even), done with exact integer
  arithmetic instead of the TS original's float-plus-epsilon approach. Both agree on every input —
  proven by `finalizeGame.test.ts`'s `chips_to_money_minor` suite, including two genuine
  exact-half ties (one rounding down to an even floor, one rounding up to one).
- **`finalize_game(game_id)`** — reads only the live tables (`games`, `game_players`,
  `shared_costs`/`shared_cost_shares`, `transfers`) and writes `game_summaries`, `player_results`,
  `transfer_summaries`. Reproduces `core/players.ts`'s display-name composition and per-game dedup
  (`nickname (account name)` for registered players, guest name for guests, `"(1)"`/`"(2)"` suffixes
  for repeats, ranked by `seat_order` then `joined_at`) and `gameActions.ts#finalizeGame`'s
  `settled_position` ranking (across *every* player in the game, not just active ones, matching a
  subtlety in the TS original). Idempotent by delete-then-insert rather than piecemeal upsert, so a
  reopen-then-re-end can never leave a stale duplicate row. Verified byte-for-byte against
  `core/settlement.ts#buildGameSnapshot()` on a shared fixture (two guests deliberately both named
  "Dana", to exercise the dedup path; a shared cost; a hand-edited transfer list touching every
  `settlement_party` — player, pot, house — as both sender and receiver, plus one zeroed-out
  "deleted" transfer that must not survive into `transfer_summaries`).
- **`group_player_results`** — the one statistics-source view this step builds, over
  `player_results`/`game_summaries`, `where not gs.is_private`. Personal statistics (which must
  still count private games) read the base tables directly instead; only the group-scoped path
  goes through this view. Baking the exclusion in now means step 14 has nothing to retrofit here.
- **`purge_expired_game_data()`** — tier 3 (`game_events`) at 30 days past `ended_at`, tier 2
  (`games` and everything that cascades from it — `game_players`, `shared_costs`/
  `shared_cost_shares`, `transfers`, `game_viewers`, `share_links`, `join_requests`,
  `player_claims`) at 90 days, both joined against `game_summaries` so a finished game with no
  snapshot yet is silently skipped rather than purged or erroring. Returns `(table_name,
  deleted_count)` rows, ready for step 16's cron log line. Not wired into `maintenance.yml` — that
  stays step 16's job, per `PLAN.md`'s explicit "out of scope."

**Deviated.**
- **`finalize_game(game_id)` is a from-scratch SQL re-derivation of the settlement maths, not a
  thin writer of a client-supplied snapshot.** The alternative — taking a pre-built `GameSnapshot`
  payload as a parameter — doesn't fit `03-data-model.md`'s own signature (`finalize_game(game_id)`,
  one argument), and would leave the function unable to run standalone against server state once
  step 12 makes a signed-in host's live game state actually live in these tables. This is the same
  trade `20260729121200_game_events_trigger.sql` already made for the `game_players` cache — SQL
  can't import `core/settlement.ts`, so the two are kept in sync by hand and cross-checked by test,
  not by sharing code.
- **The "reopening within 24h deletes the snapshot" behaviour from `03-data-model.md` isn't built
  as an automatic trigger here.** `finalize_game()`'s own delete-then-insert makes a *second* call
  correct, but nothing yet proactively deletes a snapshot the moment a game reopens without being
  re-ended — there's no server-side "reopen" write path yet for it to hook into (that's still the
  local-only `reopenGame()` in `gameActions.ts`, step 9). Revisit once step 12 gives games a real
  server-side reopen path.
- **The "byte-identical after an explicit deletion" exit criterion is tested against a raw `delete
  from games`, not a `delete_game()` RPC** — that RPC doesn't exist until step 16 ("Delete-a-game").
  Every FK from `games` down is already `on delete cascade`, so the raw delete already exercises the
  real mechanism the eventual RPC will wrap; `purgeExpiredGameData.test.ts` covers it under that
  name.
- **A fourth migration** (`20260731140000_step11_security_advisor_fixes.sql`) **was needed after
  applying to the real project**, matching step 10's own precedent of fixing advisor-surfaced gaps
  as a follow-up rather than editing already-applied files. `get_advisors(type: 'security')` found
  a real one this time, not just a warning: `group_player_results` had shipped without
  `profiles_public`'s equivalent narrowing, so — because a plain view defaults to running with its
  *owner's* privileges (`security_invoker = false`), bypassing the querying user's RLS on
  `player_results`/`game_summaries` entirely — any authenticated caller could have read every
  group's statistics, not just their own. Fixed with `alter view ... set (security_invoker =
  true)` plus the view's own `grant select` (views need one even when the underlying tables
  already grant `anon`/`authenticated` by default), and proven with a new test that queries the
  view as a member of a *different* group and asserts zero rows come back — the first two tests in
  `groupPlayerResultsView.test.ts` only ever queried as admin, which bypasses RLS regardless of
  the view's security mode, so they would have passed either way and didn't actually catch this.
  Also folded in the same fix `chips_to_money_minor` needed (a missing `set search_path = public`
  — the exact class of gap `20260730150000_security_advisor_fixes.sql` fixed once already for
  step 10).

**Left undone.** Nothing from this step's `PLAN.md` build list. `purge_expired_game_data()` is
built and tested but not cron-wired (step 16, explicitly out of scope here).

**Watch out.**
- **`game_summaries` must be inserted before `player_results`/`transfer_summaries`, not after.**
  Both of the latter reference `game_summaries(game_id)`, *not* `games(id)` — easy to get backwards
  (this session did, once) since it reads naturally the other way round. The FK exists so a
  permanent snapshot survives its `games` row being purged.
- **The temp table `finalize_game()` builds (`tmp_finalize_players`) is dropped explicitly at the
  top of the function, not left to `on commit drop` alone** — a caller invoking `finalize_game()`
  twice inside one still-open transaction (which `supabase/tests/` does constantly, since every
  test wraps itself in a transaction it rolls back rather than commits) would otherwise collide
  with the first call's temp table.
- **A plain `create view` bypasses the querying user's RLS by default — this bit `group_player_
  results` for real, see Deviated above.** Any new statistics view step 15 adds needs either
  `security_invoker = true` (preferred, when the underlying tables' own RLS already expresses the
  right scoping — the case here) or `profiles_public`'s pattern of an explicit narrowing `WHERE`
  clause (when it doesn't). Forgetting either one is silent until `get_advisors` or a test that
  actually queries as a non-privileged role catches it — querying as admin, like this step's first
  two view tests did, proves nothing about RLS scoping.
- **This session verified the GitHub-secrets checkpoint from step 10 and found it further along,
  but not fixed**: `SUPABASE_URL`/`SUPABASE_ANON_KEY` are now set as repo secrets, but the value is
  wrong — every real `maintenance.yml` ping since the owner set them has returned `401`. See the
  checkpoint table above and `NOTES.md`'s dedicated entry for the diagnosis and the exact correct
  value to paste in. This is still unresolved and still needs the owner — nothing in this step
  touches it.

---

### Step 12 — Auth and cloud sync
**Status:** done  **Sessions:** 2  **Commits:** 2

**Built.**
- **`core/offline/syncTransport.ts`'s `SyncTransport` interface gained `pull(gameId, cursor?)`**,
  returning `{events, cursor}`. `cursor` is opaque and server-assigned (the real implementation
  uses `game_events.id`, never a client timestamp — two events can share a `clientCreatedAt` to
  the millisecond, see `NOTES.md`'s clock entry, but the server's identity column can't collide).
- **`src/data/supabaseClient.ts`** — the `@supabase/supabase-js` client, session persisted via an
  IndexedDB adapter (`db.meta`, the same table `localActorId` already used) rather than
  `localStorage`, per `CLAUDE.md`'s security section. `null` when `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` aren't set — every environment except a real build with the repo
  secrets wired in, and this sandbox always, since it can't reach the real project either way (see
  `NOTES.md`'s step-10 entry on that). Consumers treat `null` as "cloud unavailable", never throw:
  offline-first has no step-12 exception.
- **`src/data/supabaseSyncTransport.ts`** — `SupabaseSyncTransport implements SyncTransport`.
  `push()` splits the batch into plain inserts (upserted into `game_events` in one call,
  `on conflict (client_event_id) do nothing`) and undo markers (`event.undoneBy !== null`), which
  call the `mark_event_undone` RPC instead — a plain insert can't set `undone_by` at all, since the
  column is the *server's* bigint id, not a client-known uuid. For the two event types the
  server's own trigger deliberately does **not** derive from `game_events`
  (`20260729121200_game_events_trigger.sql`'s scope note) — `shared_cost_added`/`_updated`/
  `_removed` and `transfer_edited` — `push()` also performs the matching direct write to
  `shared_costs`/`shared_cost_shares`/`transfers`. `transfer_edited`'s `POT_ID`/`HOUSE_ID`
  sentinels resolve to the `settlement_party` enum; a transfer id not seen before gets the next
  `order_index`, an existing one keeps its own. `pull()` selects `game_events` since a cursor,
  resolves `undone_by` from the server's bigint back to the inverse event's `clientEventId`, and
  validates every row through `core/events.ts`'s existing `gameEventSchema` before it can reach
  `fold()`. Every successful `push()` stamps `games.host_last_synced_at` for each distinct game in
  the batch.
- **`core/offline/outbox.ts` gained `pullGameEvents(transport, gameId)`**, the pull-side twin of
  `flushOutbox` — merges into `db.events` via `bulkPut` (idempotent on `clientEventId`) and
  persists the new cursor in `db.meta`. `appendEvent`/`flushOutbox`/`pullGameEvents` all gained an
  optional trailing `database: AppDatabase` parameter (defaulting to the module singleton) so
  tests can run two independent local Dexie databases against one shared fake server — needed to
  actually simulate two devices rather than one process sharing state with itself.
- **`core/offline/stubTransport.ts`'s `StubSyncTransport` gained a `FakeSyncServer`** it can
  optionally share with another `StubSyncTransport` instance, plus a `pull()` implementation —
  what makes the two-device tests possible without a real network.
- **The lint rule**: `no-restricted-imports` bans `@supabase/supabase-js` in every `src/**` file
  except `src/data/**` (and, separately, `src/core/*.ts`'s own stricter pre-existing ban already
  covers it there). Proven firing against a real probe in both a banned location and inside
  `src/data/`, in `src/test/lint-rules.test.ts` — not just config-shape inspection.
- **Testing infrastructure**: no live PostgREST endpoint is reachable from this environment (this
  sandbox's outbound proxy blocks `*.supabase.co` directly — see `NOTES.md`'s secrets-verification
  entry), so `SupabaseSyncTransport` is unit-tested against `src/data/testSupport/
  fakePostgrestClient.ts`, a small in-memory stand-in implementing exactly the query-builder
  surface the transport uses (`select`/`insert`/`upsert`/`update`/`delete`, `.eq`/`.gt`/`.order`/
  `.maybeSingle`, the `{count, head}` form, `.rpc`) — tested as real behaviour against a real table
  store, not "was this method called with these args".
- 18 new tests: 13 for `SupabaseSyncTransport` (push mapping, all three shared-cost event shapes,
  both transfer paths, the undo-RPC split, error propagation, pull mapping, undo resolution,
  cursor incrementality, schema validation), 5 for the outbox/engine layer (`pullGameEvents`
  incrementality, and the two hardest exit criteria: two-device convergence and a deposed host's
  late events still merging).

**Deviated.**
- **`SupabaseSyncTransport` also performs direct-table writes for `shared_cost_*`/
  `transfer_edited`, which `PLAN.md`'s one-line "the real `SyncTransport` behind step 5's
  interface" doesn't call out.** This isn't scope creep: `beginSettlement` (step 9) seeds the
  computed transfer list as real `transfer_edited` events for *every* game that reaches
  settlement, so skipping this would mean no synced game's transfers ever appear server-side. The
  server's own trigger was deliberately scoped to skip these tables in step 10
  (`20260729121200_game_events_trigger.sql`'s comment); this is that other half, just living on
  the client transport instead of a server trigger, since a client push is the only place that
  needs it.
- **Two devices "converging" is tested with two independent `AppDatabase` instances sharing one
  `FakeSyncServer`, not two real browser tabs.** `outbox.ts`'s functions previously only operated
  on the module-level `db` singleton; adding an optional trailing `database` parameter (default
  unchanged) was the smallest change that made a genuine two-local-store test possible at all.

**Session 2 (2026-07-31) — the remaining three exit criteria, closing out the step.**

- **`core/offline/localIdentity.ts` gained `getCurrentProfileId`/`setCurrentProfileId`/`getActorId`.**
  `getActorId()` is the real profile id once one is set, falling back to the pre-existing device-local
  `getLocalActorId()` otherwise — `core/offline/gameActions.ts` now calls `getActorId()` exclusively
  (every `getLocalActorId()` call site swapped), so every event appended *after* sign-in is stamped
  with the real `profiles.id` from the start, not just events migrated retroactively. `getLocalActorId`
  itself is untouched and still used directly by the one-time migration below, which needs the *old*
  device id specifically to know what to rewrite away from.
- **`src/data/auth.ts`** — the two providers `02-architecture.md#auth` names: `signInWithGoogle`
  (`signInWithOAuth`, redirecting back to wherever the user currently is — the hash route survives the
  round trip), `signInWithMagicLink` (`signInWithOtp`), `signOut`, plus `getCurrentUser`/
  `onAuthUserChange` for session state. A domain-local `AppUser` (`{id, email}`) is exported rather than
  re-exporting supabase-js's own `User`/`Session` types, so nothing outside `src/data/` needs to import
  from `@supabase/supabase-js` to use this, even for types.
- **`src/data/profiles.ts`** — `getProfile`/`createProfile`. `profiles` has no server-side
  "create on sign-up" trigger (`profiles_insert_self` is a plain RLS-gated insert), so the client
  creates the row once, right after first sign-in. Username uniqueness is enforced by the table's own
  `unique` constraint, not a new RPC (per session 1's own note) — `createProfile` catches the `23505`
  and throws a typed `UsernameTakenError` the UI shows inline, rather than a raw Postgres error.
- **`src/data/realtime.ts`** — `subscribeToGameEvents(gameId, onChange)`: a Realtime Postgres-changes
  subscription on `game_events` INSERTs filtered to one game. Deliberately **not** also subscribed to
  `game_players`, even though `PLAN.md` names both — every write this app makes to `game_players` is
  itself derived, in the same transaction, from a `game_events` insert (the cache trigger) or from an
  RPC that also appends a matching event (`take_over_host`, `decide_join_request`); there is no write
  path that touches `game_players` without a `game_events` row landing in the same instant, so a second
  subscription would only ever fire alongside the first. The callback is a plain "something changed, go
  pull" signal, not the changed row — `pull()`'s own cursor stays the single source of truth for what's
  actually new.
- **`core/offline/syncEngine.ts` gained `syncPull`/`startPolling`.** `syncPull` wraps `pullGameEvents`
  the same way the pre-existing `syncOutbox` wraps `flushOutbox` (same "syncing" indicator, both
  directions). `startPolling(transport, gameId, intervalMs = 15_000)` is the 15s fallback for networks
  that block WebSockets — realtime is the fast path, polling is what keeps a game current if that
  channel never connects at all, not just a backstop for a dropped one.
- **`src/hooks/useLiveGameSync.ts`** — combines the above into what an open game actually needs: an
  initial pull, the realtime subscription, and the polling fallback, torn down together on unmount. A
  no-op wherever cloud sync isn't configured. Wired into `LiveGameView` alongside `useWakeLock`/
  `useBeforeUnloadGuard` — the first real screen this hook runs against.
- **`src/hooks/useSession.tsx`** — `SessionProvider`/`useSession()`, the actual `SessionContext` +
  `useSession()` `PLAN.md` names. Tracks `user`/`profile`/`loading`/`needsProfile`, drives
  `setCurrentProfileId` and the local-game migration sweep (below) off real auth state changes, and
  exposes `signInWithGoogle`/`signInWithMagicLink`/`signOut`/`createProfile` to the UI.
- **`src/app/routes/AccountPage.tsx`** (`/account`) — one route, three states, since there's no
  navigation between them, only a state transition on the same screen: signed out (Google button +
  email magic-link form), signed in without a profile yet (username/display-name/nickname form,
  username-taken shown inline), and fully signed in (name, `@username`, sign out). No mockup exists for
  this screen — the screen map's "Sign in" node has nothing behind it, and `docs/11`'s "what the design
  does not cover" list doesn't name it either — built in the established visual language per
  `CLAUDE.md`'s "extend it yourself, review afterward" working style. `HomePage`'s header gained a `👤`
  button to it, shown only when `cloudConfigured`.
- **`src/data/localGameMigration.ts`** — the local-only-game migration `PLAN.md` needs, built exactly as
  session 1's note anticipated: `rewriteLocalActorId(newUserId)` rewrites every locally-authored event's
  `actorId` (and `host_changed`'s embedded `newHostId` payload field, the one other place the same id
  shows up) from the device's pre-sign-in `localActorId` to the real profile id, once, guarded by a
  recorded marker so a second sign-in on the same device is a no-op rather than a rescan.
  `ensureGameRowExists` creates the server-side `games` row from the local `CachedGameRecord` and folded
  state, a no-op once the row exists. `uploadLocalGame` is the full first-push path for one game:
  ensure the row, push the whole outbox via `syncOutbox`, and call the `finalize_game` RPC if the game
  already finished locally — so a pre-existing local game's snapshot exists server-side too, not just on
  the device. `migrateAllLocalGames` runs the whole sweep across every cached game, one game failing
  (logged, not thrown) never stopping the rest, since every step it calls is independently retriable.
  `SessionProvider` calls it once whenever a profile is adopted (freshly created or found on sign-in).
- **`.github/workflows/deploy.yml`** — a dedicated `Production build with real Supabase config`
  step (`npm run build`, gated `if: github.ref == 'refs/heads/main'`, run right before
  `upload-pages-artifact`) sets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from the same
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` repo secrets `maintenance.yml` already reads — closing
  session 1's "Left undone #5". **Not** set on the `npm run verify` step itself — see the CI-caught
  bug below and `NOTES.md`'s dedicated entry: `vitest run` is part of that same chain and reads
  `import.meta.env` from `process.env` exactly like a real build, so a secret scoped there isn't
  scoped to "the build" at all, and two tests that specifically exercise the *unconfigured* path
  ended up constructing a real `SupabaseClient` and calling out to the live project. `vite.config.ts`'s
  CSP plugin and `src/data/supabaseClient.ts` were both already gated on these vars from session 1.
  Empty on a fork PR (no secrets, and the step is `main`-only regardless) — `supabaseClient.ts`
  already treats that as "cloud unavailable" either way.
- **A real CI failure, found and fixed after this PR opened.** The first push of this step's `deploy.yml`
  change put the two secrets directly on `npm run verify`'s step, which broke CI exactly as described
  above — reproduced locally with the same env vars set, fixed by moving the secrets to the separate
  main-only rebuild step instead of touching the two correct test assertions. See `NOTES.md`'s
  dedicated entry for the full mechanism; this is the one thing in this step that shipped broken and
  needed a second look before merge.
- **A new test closing the "airplane mode, then reconnect" exit criterion** (`outbox.test.ts`): events
  appended while every push fails (a `StubSyncTransport` with `failureRate: 1`, simulating airplane
  mode) stay queued, not lost or duplicated; a fresh transport pointed at the same `FakeSyncServer`
  ("reconnecting") then drains the outbox completely, and the server's own folded copy of the log is
  asserted byte-identical to the local one.
- **~90 new tests** across 9 new files (`localIdentity`, `auth`, `profiles`, `realtime`,
  `localGameMigration`, `syncEngine`, `useSession`, `useLiveGameSync`, plus the new case in
  `outbox.test.ts`) and 2 new fakes (`testSupport/fakeAuthClient.ts`, `testSupport/fakeRealtimeClient.ts`
  — same rationale as session 1's `fakePostgrestClient.ts`: no live Supabase endpoint is reachable from
  this sandbox, so these drive the real modules through real control flow instead of asserting "was this
  called with these args"). `fakePostgrestClient.ts` itself gained unique-column-violation simulation
  (`23505`) and `.insert().select().maybeSingle()` support, needed for `createProfile`'s tests. Total
  test count: 484, `npm run verify` green, and the full Playwright e2e suite (including a dedicated
  check of `/account` against a real production build) passes with zero console errors.

**Deviated (session 2).**
- **Realtime subscribes to `game_events` only, not `game_players` too** — see Built above. A reasoned
  narrowing, not an oversight; documented in the module itself.
- **Auth UI and profile setup share one route (`/account`) with three states**, rather than separate
  `/signin` and `/profile/setup` pages `PLAN.md`'s prose might suggest — there's no navigation between
  the three states, only a transition driven by session state, so one route stays simpler without losing
  anything a user could do with more pages.
- **`getActorId()` supersedes `getLocalActorId()` as what `gameActions.ts` stamps events with**, not
  named as its own build item in `PLAN.md` but required for "new events after sign-in use the real id" —
  the alternative (only rewriting already-existing events at migration time) would mean every event
  created after sign-in still carried the stale device id and hit the exact same FK violation the
  migration was built to fix, forever, not just once.

**Left undone.** Nothing against `PLAN.md`'s exit criteria — all five are now met and tested.
**Not tested against the real Supabase project** — this sandbox cannot reach `*.supabase.co` at all
(session 1's finding, still true), so every new module here is proven against an in-memory fake
(`fakeAuthClient.ts`, `fakePostgrestClient.ts`, `fakeRealtimeClient.ts`), the same standard session 1
set for `SupabaseSyncTransport`. A real sign-in, a real profile row, and a real local-game upload have
never run against the live project — that needs the repository owner, and needs the
`SUPABASE_ANON_KEY` secret checkpoint fixed first (see the checkpoint table).

**Watch out.**
- **`gameActions.ts` stamps every new event via `getActorId()`, not `getLocalActorId()` directly
  anymore.** If a future change adds a new mutation function to that file, call `getActorId()` — calling
  `getLocalActorId()` directly there would silently revert to the pre-sign-in device id for a signed-in
  user's new events.
- **The local-game migration is idempotent by a recorded marker (`actorIdMigratedTo` in `db.meta`), not
  by re-scanning being cheap.** A second sign-in on the same device with the same profile id is a
  no-op; don't remove the marker check as an optimisation "since it's safe to redo" — it's safe, but the
  point is to avoid redoing it, not just to tolerate redoing it.
- **`ensureGameRowExists`/`uploadLocalGame` assume the local `CachedGameRecord` is complete** (`name`,
  `buyAmountMinor`, `chipsPerBuy` all set) — true for every game `createGame` has ever produced, so this
  throws rather than silently guessing defaults if it's ever not, which would otherwise insert a
  `games` row that fails `buy_amount_minor > 0`'s check constraint anyway.
- **`push()` assumes the game's parent `games` row already exists.** It doesn't create one — that
  is deliberately a separate concern, `ensureGameRowExists` (session 2, see Built above). A push
  against a game with no server-side `games` row fails on the `game_events` foreign key, which
  surfaces as an ordinary failed/retried outbox entry, not a crash — safe, but silent, so don't
  spend time debugging "why isn't this pushing" without checking that first.
- **`no-restricted-imports` rules don't merge across config blocks that match the same file** —
  ESLint flat config replaces the whole rule setting per file, it doesn't union `patterns` arrays
  from multiple matching blocks. The new supabase-js-import rule explicitly excludes `src/core/
  *.ts` via `ignores` rather than relying on specificity, precisely so it can't silently clobber
  that file's own, stricter, pre-existing ban. Keep this in mind before adding a third
  `no-restricted-imports` block anywhere its `files` might overlap one of these two.
- **Two events can share a `clientCreatedAt` to the millisecond** (`nextTimestamp()`'s own
  entry in this file) **but never a server-assigned `game_events.id`** — that's why the pull
  cursor is the latter, never the former, and why `SyncPullResult.cursor` is typed as opaque
  rather than a timestamp.
- **This sandbox cannot reach `*.supabase.co` at all** (confirmed while verifying the step-10/11
  secrets — see `NOTES.md`), so `SupabaseSyncTransport` has never run against the real project,
  only against `fakePostgrestClient.ts`. The fake is a faithful reimplementation of the exact
  query-builder calls used, not a generic Postgrest mock — if a future change to the transport
  uses a builder method the fake doesn't implement (a `.range()`, a `.in()`, ...), add it there
  rather than reaching for a broader mocking library.

---

### Step 13 — Sharing, viewers, join requests, takeover
**Status:** in progress — code complete, migration applied to the real Supabase project, not yet
tested on a real device  **Sessions:** 1  **Commits:** 2

**Built.**
- **A real, pre-existing gap found and fixed first.** `games.status`/`started_at`/`ended_at` were
  never written server-side by anything — the game_events trigger's scope is deliberately narrow
  (game_players only, step 10) and step 12's `SupabaseSyncTransport.applyDirectTableWrite` only
  ever handled `shared_cost_*`/`transfer_edited`. Harmless for step 12 (nothing server-side read
  `games.status` yet), but this step's claim window and `get_shared_game`'s live/finished routing
  both need it to be real. Fixed the same way the existing direct-write cases already work:
  `game_started`/`game_settling`/`game_ended`/`game_reopened` now also update `games` directly,
  stamped with the event's own `clientCreatedAt` (not wall-clock "now" — a push can land long
  after the action happened offline), including `claim_deadline = ended_at + 48h` and
  `reopen_deadline = ended_at + 24h`.
- **`supabase/migrations/20260731150000_step13_sharing_and_takeover.sql`** — one migration
  covering all of this step's schema/RPCs:
  - `pgcrypto` (needed for `digest()`, the first thing in this codebase to hash anything server-side).
  - `player_results.game_player_id` (bare `uuid`, deliberately **not** a foreign key — see
    Deviated) plus `finalize_game()` re-published to populate it, so a claim approved after a game
    is finalised can find the permanent row it also needs to update.
  - `find_valid_share_link(token, stamp_view)` — the one hash-lookup-plus-window-check every
    share-link RPC below funnels through (internal-only, `revoke execute` from anon/authenticated,
    same pattern as the step-10 trigger functions).
  - `get_shared_game(token)` / `get_shared_settlement(token)` — the two anonymous-callable
    projections from `03-data-model.md#anonymous-share-access`. A signed-in caller resolving a
    live game is inserted into `game_viewers` inside the same call (self-insert via `SECURITY
    DEFINER`, not an RLS policy change — see Deviated). A currently-finished game returns
    `{kind: 'finished'}` rather than an error, since the token itself is still valid.
  - `submit_join_request_via_link` / `submit_claim_via_link` — the share-link halves of the two
    "two paths in, one gate" flows, both signed-in-only (see Deviated).
  - `can_submit_claim()` — the claim window + "still an unclaimed guest row" check, shared by both
    the link RPC and the group-member direct-insert path (`player_claims_insert`'s `with check`
    now calls it too — that policy enforced neither before this step).
  - `log_claim_requested` trigger — `player_claims` never logged a `claim_requested` event before
    (deliberately deferred at step 10); one trigger now covers both ways a claim can be created.
  - `decide_claim(claim_id, approve)` — host-only; sets `game_players.user_id` via the
    `claim_approved` event (the trigger case for it existed since step 10, unused until now) and,
    when the game is already finalised, `player_results.user_id` directly — the one field ever
    mutable on a permanent row. Auto-rejects every other pending claim on the same row
    ("the host picks one and the rest are rejected").
  - `hand_over_host(game_id, new_host_id)` — voluntary handover, host-only, target must already be
    a signed-in player or viewer (guests have no account to hand over to).
  - `get_group_live_games(group_id)` — the thin lobby projection the in-app "ask to join" path
    needs; built here per `PLAN.md`'s own step-13 build list even though nothing calls it yet (see
    Left undone).
  - `decide_join_request()` re-published: a registered requester's `profiles.default_nickname` now
    seeds the new player's nickname instead of always `null` ("Nicknames for registered players").
- **11 new SQL test files**, 63 tests total (up from 36): `shareLinks.test.ts` (revoked/unknown/
  expired all reject with the same generic shape, 7-day vs 30-day window, `{kind: 'finished'}`
  routing, `last_viewed_at`/`view_count` stamped only on success, `get_shared_settlement` surviving
  a live-row purge), `joinRequestsViaLink.test.ts`, `claims.test.ts` (window enforcement on *both*
  paths, unclaimed-guest-row requirement, two-people-can't-own-one-row via the auto-reject, claim
  approval after finalisation updating `player_results` and nothing else), `hostHandover.test.ts`,
  `groupLiveGames.test.ts`. All of `docs/09-roadmap.md#testing`'s "every rejection returns the
  same generic shape" is asserted directly, not by convention.
- **`src/data/shareLinks.ts`** — client-side token generation (`crypto.getRandomValues`, 256 bits,
  base64url for the URL fragment) and SHA-256 hashing (`crypto.subtle.digest`) to a hex `bytea`
  literal; `createShareLink`/`listShareLinks`/`revokeShareLink`/`rotateShareLink` are plain
  `share_links`-table calls (`is_host` RLS already covers them, no RPC needed);
  `resolveSharedGame`/`resolveSharedSettlement` wrap the two read RPCs.
- **`src/data/joinRequests.ts`, `src/data/claims.ts`, `src/data/hostControl.ts`** — thin repository
  wrappers over the rest of this step's RPCs and the plain-insert in-app paths, matching step 12's
  established shape (`requireClient()`, row↔domain mappers, `client` as a trailing default param
  for testability). `hostControl.ts` also gained `getHostLastSyncedAt` — `games.host_last_synced_at`
  is server-only and was never part of the local fold (nothing in the event log derives it), so the
  takeover warning modal fetches it fresh at the moment it's shown.
- **~35 new data-layer tests** across `shareLinks.test.ts`, `joinRequests.test.ts`, `claims.test.ts`,
  `hostControl.test.ts`, `profiles.test.ts` (new `getProfilesPublic`), against
  `fakePostgrestClient.ts` — extended this session with `.in()`, an `.rpc()` result that supports
  `.single()`/`.returns()` chaining (it previously only returned a bare `{error}`), matching the
  same "faithful to real control flow, not a generic mock" standard as the rest of the fake.
- **UI**, all wired into `LiveGameView` (`src/features/game`):
  - `ShareSheet` — the three sections from `04-ux-spec.md#sharing-5-14`: live link (create/copy/
    share/revoke/rotate, expiry caption), viewers (read-only list, resolved via
    `profiles_public`), text preview (`formatLiveStatusText`, already built in step 9, reused
    as-is) with its own share/copy pair. Host-only — see Deviated on why non-hosts never see it,
    private or not.
  - `PendingRequestsSheet` — join requests and claims together, one approve/reject pair each,
    arrival caption (group member vs. link). A badge on the header's `⋯` button shows the pending
    count, polled every 20s while the host has the game open and refreshed on sheet close.
  - `HostControlSheets.tsx` — `HandOverHostSheet` (⋯ → העבר ניהול, lists signed-in current
    players/viewers) and `TakeOverHostConfirm` (⋯ → קח ניהול, sync-freshness-coloured, a second
    tap required when `host_last_synced_at` was never stamped at all — "unknown" is treated as the
    worst case, not the best). A non-blocking `AnnouncementBanner` shows on every device with the
    game open when a **fresh** `host_taken_over` event arrives (a ref tracks already-seen takeover
    ids so mounting the view never announces history).
  - `SharedGamePage` (`/#/s/:token`) — the anonymous/link viewer's whole experience: live (players,
    pot-relevant figures, `בקש להצטרף` gated behind sign-in), finished (results + `TransferRow`s,
    reused read-mode as-is), and the generic "not available" dead end for a revoked/expired/purged
    token, all from one route since the same link's meaning changes with the game's status.
    "זה אני" claims a guest row inline per player. Verified in a real headless-Chromium browser
    against a production build (`vite preview`) with cloud unconfigured (this sandbox's only
    option): the dead-end state renders correctly with zero console errors.
  - `PlayerActionsSheet` gained nickname editing for registered players (`isRegistered` prop swaps
    the rename field for a nickname field, pre-filled) — the other half of "Nicknames for
    registered players", `core/offline/gameActions.ts#setPlayerNickname` appends `nickname_set`.

**Deviated.**
- **Failed-lookup throttling (`03-data-model.md#link-security`) is not built as persisted state.**
  The first attempt — a table logging failed lookups, checked before each hash lookup — silently
  logged nothing, ever: `find_valid_share_link` rejects by `raise exception`, and Postgres rolls
  back the *entire* enclosing transaction when an uncaught exception propagates out of it, which
  undoes the failure-row insert too, no matter how early in the function it ran. Proven by writing
  exactly that and watching the row count stay zero after ten failed lookups, not assumed.
  Persisting a counter across a rollback needs a genuinely separate transaction (`dblink` or the
  `pg_background` extension), which this project has no other reason to add — 03-data-model.md
  itself calls this mechanism a courtesy, not a real defence ("brute-forcing 256 bits is not a
  real threat; this just keeps enumeration noise out of the logs"). Real protection is the token's
  own 256-bit search space and Supabase's platform-level API rate limiting, both outside this
  migration's reach. See `NOTES.md`.
- **Asking to join via a share link requires being signed in — an anonymous (signed-out) tap does
  not submit a request.** `game_events.actor_id` is `NOT NULL` (every event has a real actor, a
  locked invariant since step 4) and `join_requests.user_id`, while nullable in the schema, has no
  code path that leaves it null once `log_join_requested` (step 10) uses it as the event's
  `actor_id` directly. `04-ux-spec.md`'s "anyone holding the link — signed in or not — gets one
  action" describes who can *see* the button; the tap itself is a write, and every write in this
  app is attributed to a signed-in actor already (`03-data-model.md#anonymous-share-access`:
  "anonymous clients never get direct table access"). `SharedGamePage` routes an anonymous tap to
  `/account` first, the same sign-in flow every other write already requires. Widening
  `game_events.actor_id` to nullable to support a truly anonymous write was considered and
  rejected — it would touch a heavily-tested core invariant for a case the rest of the data model
  doesn't actually support anywhere else (claims and `game_viewers` both already require sign-in
  too, for the identical reason).
- **`share_links` is `is_host`-only for every game, private or not — the ShareSheet's `שיתוף`
  button is host-only unconditionally, not host-only-for-private-games-only.**
  `03-data-model.md#row-level-security`'s own RLS table says `share_links | is_host | is_host`
  with no privacy qualifier, and that's exactly what step 10 already implemented. Read in
  isolation, `04-ux-spec.md`'s private-games section ("`שתף קישור` is host-only [for a private
  game]; for anyone else the section is replaced by one line") could suggest non-hosts can share a
  link on a *non-private* game — but non-hosts can't even `select` from `share_links` either way,
  so that reading isn't reachable regardless of the UI. Followed the unambiguous, already-built
  RLS table rather than over-reading the UX copy.
- **`player_results.game_player_id` is a bare `uuid`, not a foreign key.** The first draft added
  `references game_players(id) on delete set null` — and immediately broke
  `purgeExpiredGameData.test.ts`'s "byte-identical before/after a purge" assertion, since purging
  `game_players` (tier 2) would silently null the column out, which *is* a change. Every other
  column `player_results`/`game_summaries`/`transfer_summaries` carry that references the live
  schema is already a bare, unenforced value for exactly this reason; this one now matches that
  pattern instead of being the first exception.
- **`get_group_live_games` excludes every private game unconditionally**, not the nuanced
  "still visible to people already invited or in the game" rule `03-data-model.md#private-games`
  describes. Private games are entirely step 14's build item (`PLAN.md`'s "Out of scope: Groups"
  for step 13 sits oddly next to the same step's own build list naming this exact function — see
  Left undone); excluding all of them is the conservative default, and step 14's own `is_private`
  work is expected to revisit this function directly.

**Left undone.**
- **Applied to the real Supabase project (in a same-session follow-up, after the PR merged), but
  not yet tested on a real signed-in device.** The Supabase MCP connection is a separate
  integration from this sandbox's own network — see Watch out — so applying the migration itself
  needed no owner action, but a real sign-in/end-to-end confirmation still does, same as step 12's
  outstanding checkpoint. Every new RPC is tested against local Postgres (`supabase/tests/`,
  63/63 green) and every new data-layer module against `fakePostgrestClient.ts` (`npm test`,
  508/508 green).
- **A signed-in viewer who opens `/#/game/:id` directly (added via an approved join request,
  never touching a share link) still sees the full host-editing screen.** `LiveGameView` has no
  read-only branch of its own — only the token-based `/#/s/:token` route (`SharedGamePage`) gets
  the stripped-controls treatment `04-ux-spec.md#the-viewers-experience` describes. RLS still
  blocks any actual write from reaching the server, so this isn't a security gap, but it's a real
  UX gap: such a viewer sees buttons that will silently fail. Revisit before relying on the in-app
  (non-link) viewer path for real use.
- **The in-app "ask to join" path (`get_group_live_games`, path 2 of "two paths in one gate") has
  no UI.** There is no groups screen to show a live-game lobby card on until step 14 builds one —
  the RPC and its SQL tests exist now so step 14 doesn't need a migration for it, matching the
  precedent step 10 set for `share_links`/`join_requests` being pre-built ahead of this very step.
- **"Add viewer from group members" in the share sheet isn't built** — same reason, no group
  member list exists yet to pick from. The viewer list is read-only (who's already watching).
- **The share sheet's live text preview only covers the live-game status template** — no separate
  preview for a finished game's summary; `SummaryRoute`'s existing share button (step 9) already
  covers that case with `formatFinalSettlementText`, so `ShareSheet` only renders while the game is
  live (`isFinished` is threaded through but always `false` from `LiveGameView`'s call site today).

**Watch out.**
- **`games.status`/`started_at`/`ended_at`/`claim_deadline`/`reopen_deadline` are now direct
  writes from `SupabaseSyncTransport.applyDirectTableWrite`, keyed on `game_started`/
  `game_settling`/`game_ended`/`game_reopened`.** If a future event type ever needs to change
  `games`' own columns, it goes here too — the game_events trigger's scope is `game_players` only,
  on purpose (docs/build/NOTES.md, step 10).
- **Any exception raised inside a `SECURITY DEFINER` function rolls back everything the whole
  transaction did, including work that function itself already performed before raising.** This
  is why failed-lookup throttling isn't built as DB state (see Deviated) — don't repeat the
  insert-then-raise pattern expecting the insert to survive; it won't, and there's no local-Postgres
  test harness quirk involved — this is real Postgres/PostgREST transaction semantics, verified by
  writing the broken version first.
- **`can_submit_claim()` is the one place the claim window is enforced — both `player_claims_insert`
  (RLS) and `submit_claim_via_link` (RPC) call it.** A future claim-writing path that doesn't call
  it will silently skip the window/unclaimed-row check.
- **`.rpc(...).returns<T>()` needs `.single()` first, or `tsc -b` fails** with a real supabase-js
  type error ("Cannot cast array result to a single object... use `.single()`") — `tsc --noEmit`
  run standalone against a looser config didn't catch this; only the project-references build
  (`tsc -b`, what `npm run verify` actually runs) did. Every RPC wrapper in `shareLinks.ts`/
  `claims.ts`/`joinRequests.ts` chains `.single().returns<T>()`; `FakePostgrestClient`'s `.rpc()`
  result gained a matching no-op `.single()` to keep the fakes chainable the same way.
- **`react-hooks/set-state-in-effect` (a newer eslint-plugin-react-hooks rule) flags calling any
  function that itself calls `setState` directly from an effect body — even an `async` one, even
  through a `.then()` on a call to a *named, outer-scope* helper — but not an inline
  `void (async () => { ... })()` IIFE, and not a `.then()` chained directly off the async call at
  the effect's own top level.** Hit this in both `LiveGameView` and `PendingRequestsSheet`; the
  fix in both cases was the same shape `useSession.tsx` already established for its own
  effect-plus-async-work — wrap in an inline IIFE (with a `cancelled` flag for the ones that can
  outlive an unmount), don't call a pre-defined async function reference straight from the effect
  body.
- **The Supabase MCP connection and this sandbox's own outbound network are two entirely separate
  paths — "this sandbox can't reach Supabase" and "the MCP tool just applied a migration to the
  real project" are both true at once, not a contradiction.** Confirmed directly this session:
  `curl` from this sandbox to the real project's REST endpoint fails with a `403` from the
  pre-configured egress proxy's own `CONNECT` tunnel — the proxy denies the host before the
  request ever reaches Supabase. The MCP tools (`mcp__Supabase__*`) don't go through that proxy at
  all; they're a separate, pre-authorised integration with its own credentials and connectivity,
  which is how steps 10, 11 and now 13 all applied real migrations despite the app's own runtime
  code (`SupabaseSyncTransport`, tested only against fakes) never having reached the project
  directly. Neither of these is related to the third, separate `SUPABASE_ANON_KEY` GitHub-secret
  problem (still unresolved) — that's the deployed app and `maintenance.yml` failing
  authentication *after* successfully reaching Supabase over the public internet from a GitHub
  Actions runner, a fourth path with its own credentials again.
- **Applying a migration via the MCP `apply_migration` tool stamps `supabase_migrations.
  schema_migrations.version` with the timestamp it was applied at, not the version encoded in the
  migration's own filename.** This was already true for every migration steps 10/11 applied
  (invisible until something actually diffed remote-vs-local migration versions — the Supabase
  GitHub integration's deploy check finally did, on this PR's merge to `main`, and reported
  "remote migration versions not found in local migrations directory"). Fixed by rewriting
  `version` on all 21 rows to match the `left(name, 14)` prefix already sitting in each row's own
  `name` column (that column *did* get the real filename correctly). **If a future session applies
  a migration via this tool, immediately follow up with `update supabase_migrations.
  schema_migrations set version = '<the filename's own version>' where name = '<filename stem>'`**
  — otherwise the drift silently reappears the next time anything diffs the two.
- **`revoke execute on function f() from anon, authenticated` can still be a no-op even when the
  function ends up anon/authenticated-executable anyway — check `pg_proc.proacl`, don't trust the
  revoke statement's success.** Recurrence of the exact trap `NOTES.md` already documents from step
  10, hit twice in the same live-deployment follow-up: `find_valid_share_link` only ever had the
  Postgres-default `EXECUTE FROM PUBLIC` grant, so revoking from the two named roles did nothing —
  `revoke ... from public` was the fix. `log_claim_requested` had gone further: it carried an
  *explicit* `anon=X`/`authenticated=X` grant in its `proacl` in addition to the PUBLIC default
  (apparently added automatically by the platform on function creation), so it needed *both*
  `revoke ... from public` *and* `revoke ... from anon, authenticated` before `get_advisors`
  actually stopped flagging it. The advisor is the only reliable way to confirm a revoke actually
  landed — a revoke statement returning success proves nothing about whether the target role can
  still call the function some other way.

---

### Step 14 — Groups, roles, private games
**Status:** in progress — code complete, migration not yet applied to the real Supabase project
**Sessions:** 1  **Commits:** 1

**Built.**
- **`supabase/migrations/20260801120000_step14_groups.sql`** — the schema and RLS for
  `groups`/`group_members`/`group_invites` already existed since step 10 (built in one pass with
  every other table); what step 10's own comments named as still missing is what this migration
  adds:
  - `find_user_by_username(p_username)` — exact match only, three display columns only
    (03-data-model.md#joining-a-group).
  - `respond_to_group_invite(invite_id, accept)` — invitee-only, pending-only; on accept, the one
    place a non-owner `group_members` row is ever written (the table has no general INSERT policy
    on purpose).
  - `revoke_group_invite(invite_id)` — owner/admin-only, pending-only.
  - `promote_group_member`/`demote_group_admin` — member→admin is owner-or-admin, admin→member is
    owner-only ("an admin ... cannot demote another admin"). Neither ever touches an `owner` row —
    `group_members_update`'s RLS already refuses that unconditionally, so these two inherit "no
    path demotes or removes the owner" from the table itself.
  - `transfer_group_ownership(group_id, new_owner_id)` — owner-only, target must already be a
    member; the outgoing owner becomes an admin (demoted before the new owner is promoted, keeping
    `one_owner_per_group`'s partial unique index satisfied at every statement boundary).
  - `invite_player_to_game(game_id, user_id)` — the private-game half of
    03-data-model.md#private-games ("Host or any current player"): `game_events` is
    host-only-insert, so a non-host seated player needs this narrow RPC to append a `player_invited`
    log event for a fellow group member. Target must already share the game's group.
  - Leaving a group and being removed from one are **not** new RPCs — both are the same plain
    `group_members` delete, already RLS-gated (`role <> 'owner'` and self-or-admin/owner) since
    step 10; this step's SQL tests exercise that path directly rather than wrapping it.
- **28 new SQL tests** (`supabase/tests/groups.test.ts`, `npm run test:db` now 91/91, up from 63):
  `find_user_by_username`'s exact-match-only behaviour, the full invite lifecycle (send/accept/
  decline/revoke, only-the-invitee-accepts, one-open-invite-per-person), promotion/demotion/
  transfer with every actor/role combination the roles table names, "no path demotes or removes
  the owner" asserted against a raw delete/update as well as the RPCs, leaving (member vs.
  owner-must-transfer-first), "adding someone to a game never adds them to the group" (a join
  request approval leaves `group_members` untouched), `share_links` insert rejecting a non-host on
  a private game (this step's other explicit `PLAN.md` exit criterion), and `invite_player_to_game`
  end to end.
- **`src/data/groups.ts`** — the first client caller of any of this: `createGroup` (two plain
  inserts — group row, then the owner's `group_members` row — deliberately not `insert ...
  returning`, since `groups_select` is `is_group_member(id)` and that's false for the just-created
  row until the owner insert lands; the id is generated client-side instead, avoiding the exact
  RLS+RETURNING gap `docs/build/NOTES.md` already documents for `games`), `listMyGroups`/`getGroup`/
  `updateGroup`/`deleteGroup`, `listGroupMembers`, `findUserByUsername`, the invite lifecycle
  (`inviteToGroup`/`listPendingInvitesForGroup`/`listMyPendingInvites`/`respondToGroupInvite`/
  `revokeGroupInvite`), `promoteGroupMember`/`demoteGroupAdmin`/`transferGroupOwnership`/
  `removeGroupMember`, `getGroupLiveGames`, `invitePlayerToGame`. 15 new tests against
  `fakePostgrestClient.ts`, same standard as every other `src/data/` module.
- **A real, pre-existing bug found and fixed, not introduced by this step.** `core/players.ts#
  renderPlayerName`'s account-name path has needed a real lookup since step 12 (`getAccountDisplayName`),
  but nothing outside the viewer list ever supplied one — `LiveGameView`, `SettlementRoute` and
  `SummaryRoute` all called `renderPlayerName(p)` bare. Harmless while every registered player
  arrived only through step 13's claim/join-approval paths (never manually tested against a real
  signed-in device — see that step's own "left undone"), but this step's whole point is *adding*
  registered players deliberately (group-member picks), which would have shipped broken names
  immediately. Fixed uniformly: **`src/hooks/useAccountNames.ts`**, a small shared hook wrapping
  `getProfilesPublic`, now resolves every player-with-a-`userId` the same way viewers already were,
  in all three screens — `LiveGameView`'s pre-existing per-screen effect was replaced with a call
  to the shared hook rather than kept as a second implementation. No test previously caught this
  because component tests never run with `session.cloudConfigured: true` (this sandbox can't reach
  a real Supabase project — see `NOTES.md`); a dedicated `useAccountNames.test.ts` mocks
  `@data/profiles` directly instead.
- **`src/hooks/useGroupMemberOptions.ts`** — resolves a game's group's members to display names
  (`listGroupMembers` + `getProfilesPublic`) for the add-players sheet's `◈` section; shared by
  `NewGamePage` and `LiveGameView` rather than duplicated.
- **`src/core/offline/lastUsedGroup.ts`** — "Group | חבורה | last used"
  (01-product-spec.md#61-game-setup-13): a `db.meta`-backed local preference, same shape as
  `localIdentity.ts`'s other entries.
- **`AddPlayersSheet` gained a real `◈ חברי החבורה` section and account-linked picks.** The
  selection model now tracks guest-name picks and account picks together in one tray (spec: "one
  footer button commits the whole batch"); `onCommit` now takes `(names, accountPlayers)` instead
  of just `names`. `core/offline/gameActions.ts#createGame`/`addPlayersToGame` gained
  `accountPlayers`/`AccountPlayerPick`, appending `player_added` with `userId` set (`guestName:
  null`) instead of the guest shape — the payload already supported this since step 4, nothing
  server-side needed to change.
- **`NewGamePage` gained the "Group" field** (01-product-spec.md#61's own field list, present in
  the doc but not built until now): a chip row (`ללא חבורה` + each of the caller's groups),
  defaulting to the last one used (`lastUsedGroup.ts`), threaded through to `createGame`'s new
  `groupId` and stamped onto the new game's `CachedGameRecord`/server-side `games.group_id` row
  (`ensureGameRowExists`, which previously always wrote `group_id: null`).
- **UI**, all in the established visual language (no mockup covers a groups screen —
  `docs/11`'s "what the design does not cover" list doesn't name one either, same situation
  `AccountPage` was in for step 12):
  - `GroupsListPage` (`/groups`) — my groups, pending invites (accept/decline inline), create.
  - `GroupPage` (`/groups/:groupId`) — member list with role badges, per-member `⋯` action sheet
    (`GroupMemberActionsSheet`, gating promote/demote/remove/transfer exactly per the roles table),
    the invite sheet, a header menu (invite/leave/delete), and a live-games lobby
    (`getGroupLiveGames` finally gets a caller — `בקש להצטרף` calls the same `requestToJoinInApp`
    step 13 already built for the share-link path's in-app twin).
  - `InviteMemberSheet` — the exact mockup from 04-ux-spec.md#adding-a-group-member--invite-and-accept:
    username search, a result card, pending invites listed below with revoke.
  - `PendingGroupInviteCard` — the invitee-side "דנה הזמינה אותך לחבורה" card, shared by `HomePage`
    and `GroupsListPage` rather than duplicated.
  - `HomePage` gained a `👥` header button (next to the pre-existing `👤`) and the pending-invite
    card at the top of the list.
- **~65 new tests total** across the SQL suite, `src/data/groups.test.ts`, the two new hooks, the
  new UI components, and updates to `AddPlayersSheet`/`gameActions`/`localGameMigration`'s existing
  tests for the new `onCommit`/`groupId` shapes. `npm run verify` is green (550 tests, up from
  508), `npm run test:db` is green (91 tests, up from 63), and the full Playwright e2e suite
  (offline create → buy-ins → shared cost → settle → end → transfers → share text, twice — online
  and with the network cut) passes with zero console errors, confirming none of this broke the
  no-account offline path step 9 already proved.

**Deviated.**
- **The invited-caller nuance on `get_group_live_games` (03-data-model.md#private-games: "Appear
  in `get_group_live_games()` | Only for people already invited or in the game") was deliberately
  not built.** `PLAN.md`'s own step-14 exit criterion — "a private game is absent from every
  group-scoped figure and list" — is stricter than the data-model prose and is fully satisfied by
  the existing step-13 behaviour (excludes every private game, unconditionally) without loosening
  anything. Loosening it specifically for an invited caller would be real, security-sensitive
  surface (a function the client already calls with no confirmation of who's "already invited"
  beyond a raw `player_invited` event scan) and isn't covered by any exit criterion here — left as
  a scoped, named follow-up rather than folded in unreviewed. Concretely: `invite_player_to_game`
  is built, tested, and reachable from `03-data-model.md`'s spec, but nothing in the UI calls it
  yet (see Left undone) — a real gap, recorded rather than hidden by shipping a half-loop.
- **`transfer_group_ownership` demotes the outgoing owner to `admin`, not `member`.** Not specified
  either way by `03-data-model.md#group-roles` ("Ownership moves only if the owner themselves
  transfers it" says nothing about the outgoing owner's new role). Chose `admin` — the outgoing
  owner presumably still wants full management rights over a group they just built, and it costs
  nothing extra to grant (`group_members_update`'s RLS already lets an owner promote anyone to
  admin regardless). Revisit if a real user's expectation differs.
- **`AddPlayersSheet`'s footer count and tray treat guest picks and account picks identically** —
  one combined count, one combined tray, matching the spec's "one footer button commits the whole
  batch" literally rather than distinguishing the two visually beyond the `◈` glyph on the roster
  chip itself (which the tray doesn't repeat, matching the existing recent-names tray's own
  plainness).
- **A registered player's nickname isn't pre-filled when added via a group-member pick** — nickname
  stays `null`, same as every other `player_added` path; "Nickname pre-fill from the player's most
  recent nickname in the group" is explicitly `PLAN.md` step 17's own item, not this step's.

**Applied to the real Supabase project in a same-session follow-up, after the owner explicitly said
to.** Same MCP-`apply_migration` path steps 10/11/13 used; immediately followed by the
now-standard version-repair step (`docs/build/NOTES.md`'s own documented rule: the tool stamps
`supabase_migrations.schema_migrations.version` with the apply timestamp, not the filename's own
version) — `version`/`name` rewritten to `20260801120000`/`20260801120000_step14_groups` to match
`supabase/migrations/20260801120000_step14_groups.sql` exactly, so no repeat of step 13's
migration-history-drift bug. `get_advisors(type: 'security')` afterward flagged every new RPC as
`anon`/`authenticated`-executable — checked directly against the same advisor for
`take_over_host`/`decide_join_request`/`hand_over_host`/`decide_claim` (each shows the identical
two hits already), confirming this is the established "caller-invoked RPCs rely on an internal
`auth.uid()` check, not a execute-grant restriction" pattern, not a new gap the way step 11's
`group_player_results` narrowing miss genuinely was.

**Left undone.**
- **`invite_player_to_game` has no UI trigger.** The RPC and its tests exist (see Deviated); no
  screen offers "invite a group member into this private game" yet, since doing so usefully needs
  the `get_group_live_games` nuance above to actually close the loop for the invited person. Both
  are left together as one follow-up rather than shipping a button that calls a working RPC into a
  dead end.
- **Not tested against a real signed-in device**, even though the migration is now live — same
  standing gap as steps 12/13 (this sandbox cannot reach `*.supabase.co` at all, see `NOTES.md`).
  `npm test`'s coverage of the `session.cloudConfigured: true` branch is limited to what mocking
  `@data/*` modules directly can prove (see the `useAccountNames`/`useGroupMemberOptions` entries
  above) — no component test actually renders `GroupPage`/`GroupsListPage` end-to-end with a live
  session, matching the same gap this step's own bugfix exists because of.
- **No group-settings edit UI** (rename, change default buy amount/chips-per-buy) — `updateGroup`
  exists in the data layer and is tested, but `GroupPage` has no form calling it. `PLAN.md`'s
  step-14 exit criteria don't name this; left for whenever it's actually needed.
- **Quick-add ordering within the `◈` section isn't "how often you've played together" (#13)** —
  `listGroupMembers` returns members in whatever order the query does, not frequency-sorted, since
  local `recentPlayers` tracks guest names by string, not account ids, and building a real
  per-account play-frequency signal is out of scope for wiring up the section's basic existence.
  The `חברים נוספים`/recent-names section (unaffected) still sorts by frequency as before.

**Watch out.**
- **`renderPlayerName`'s resolver argument is not optional to skip in practice, even though the
  type allows it.** Any future screen that renders a player row with a real account behind it must
  pass a resolver — `(userId) => accountNames.get(userId)` via `useAccountNames` — or a registered
  player's name silently renders blank. This is exactly the bug this step found and fixed; there is
  no lint rule catching it, only convention.
- **`createGroup` never uses `insert ... returning` on `groups`.** `groups_select` is
  `is_group_member(id)`, false for a brand-new group until its owner `group_members` row exists —
  the identical RLS+RETURNING trap `docs/build/NOTES.md` already documents for `games`. Any future
  write to `groups` that wants the row back should generate the id client-side first, the same way
  `createGroup`/`ensureGameRowExists` both already do, rather than relying on `RETURNING`.
- **The `react-hooks/set-state-in-effect` rule** (already documented in step 13's entry) came up
  repeatedly again this step — `GroupPage`, `GroupsListPage`, `HomePage`, `InviteMemberSheet` and
  `useGroupMemberOptions` all needed the same `void (async () => { ... })()` IIFE wrapper around an
  effect body that calls a named async helper or sets state synchronously before any `await`.
  Wrapping the *entire* effect body — sync resets included — in one IIFE, rather than only the
  async tail, is what actually satisfies the rule; a partial wrap (sync statements left bare above
  an inner `void (async () => {...})()`) still gets flagged.
- **`group_members_delete`'s RLS silently deletes zero rows rather than raising** when the target
  row's `role = 'owner'` (its own `using` clause excludes it outright) — a test expecting a
  rejection there will fail with "the query unexpectedly succeeded"; assert `rowCount === 0` and
  the row's untouched state instead, not `expectRejection`. Hit twice writing
  `supabase/tests/groups.test.ts`'s "no path demotes or removes the owner" and "the owner cannot
  leave" tests.
- **`.rpc(...)` for a genuinely multi-row Postgres function (`find_user_by_username`,
  `get_group_live_games`) can't chain `.returns<T[]>()` the way every existing single-object RPC
  wrapper in `src/data/` chains `.single().returns<T>()`** — without a `Database` generic in scope
  (this codebase has none, by design), supabase-js's typed builder rejects the array cast with a
  real compile error, and destructuring `{ data, error }` straight off the un-narrowed `await`
  result trips `@typescript-eslint/no-unsafe-assignment`. The fix used here: cast the *whole*
  awaited response to a known `{ data: T[] | null; error: Error | null }` shape in one expression,
  rather than destructuring first. If a future RPC wrapper needs a multi-row result, follow
  `findUserByUsername`'s shape, not the single-row `.single().returns<T>()` one.

---

### Step 15 — Statistics
**Status:** in progress — code complete, migration applied to the real Supabase project, not yet
tested on a real signed-in device  **Sessions:** 1  **Commits:** 1

**Built.**
- **`supabase/migrations/20260802090000_step15_statistics.sql`** — the only schema change this
  step needed: `profiles_public` (03-data-model.md, `20260729121100_rls_policies.sql`) widened to
  include `stats_visibility`, which its own original comment had deliberately left self-only since
  nothing needed a co-member to read it before now. `06-statistics.md#scoping`'s "a
  `stats_visibility = private` flag keeps someone off the group leaderboard while still counting
  them, anonymously, in table-level aggregates" requires exactly that read. `security_invoker`
  stays `false`, unchanged — this view still needs owner privileges to see co-member rows
  `profiles_select_self`'s own restrictive RLS would otherwise hide, compensating with its own
  WHERE clause, same as it always has. Two new SQL tests in `supabase/tests/statisticsViews.test.ts`
  cover the widened view (self, co-member, stranger, and the `private` value actually round-tripping).
- **`core/statistics.ts`** — pure, dependency-free (no React/Supabase/Dexie, matching
  `core/settlement.ts`'s own contract even though `CLAUDE.md`'s Purity rule doesn't name this file
  specifically): row shapes mirroring `player_results`/`game_summaries`/`transfer_summaries`
  camelCased; `Rate`/`MIN_SAMPLE_SIZE_FOR_RATE` (06-statistics.md#presentation-rules: below 5 games
  a rate reports `suppressed: true`, never a misleading number); `summarizeCurrency` (the app never
  converts between currencies — amounts are summed as raw numbers regardless of label, and this
  only decides which label to print and whether to flag the mix, per the spec's own literal
  wording); `computeWinLossSummary` (breakeven games excluded from the rate's denominator, not just
  from the numerator); `computeStreaks`/`cumulativeNetSeries` (a breakeven breaks both a win and a
  lose streak); `computePersonalStatistics` (all thirteen `06-statistics.md#personal-statistics-12`
  formulas, profit-per-hour on each player's own `minutesPlayed`, never the game's duration);
  `computeGroupPlayerStatistics`/`computeGroupTableStatistics` (`06-statistics.md#group-level-
  statistics-11`, guest rows — `userId === null` — never aggregate into a persistent "player",
  matching the inclusion rule); the seven fun stats (`computeDonator`, `computeIronMan`,
  `computeChipMagnet`, `computeTheMachine`, `computeComeback`, `computeGroupHotColdStreaks`,
  `computeNemesisPatron`) plus `computeFunStatistics` bundling all seven, `nemesisPatron` only
  populated for a signed-in viewer.
- **28 tests in `core/statistics.test.ts`**, including the spec's own worked example verbatim
  (lost ₪100 five times, won once → Σnet = −₪400, win rate 1/6 ≈ 17%, ROI −400/600 = −67%, all
  three assertions matching `06-statistics.md#personal-statistics-12`'s own numbers exactly), a
  dedicated profit-per-hour-with-a-late-joiner fixture (a player who joined for the last hour of a
  4-hour game is measured against 1 hour, not 4), the win-rate zero-exclusion rule, sample-size
  suppression at exactly the 4-vs-5-games boundary, streak/iron-man/hot-cold fixtures with a
  breakeven deliberately breaking a run, and a hand-computed `computeGroupTableStatistics` fixture
  (weekday, biggest night, avg pot, etc.) verified against real `Date.UTC` weekday output, not
  assumed.
- **`src/data/statistics.ts`** — `getPersonalStatisticsSource(userId, groupId?)` (plain
  `player_results` filtered by `user_id`, optionally `group_id` — "שלי, within a group" and "הכל,
  across every group" are the same query with or without that filter, per `06-statistics.md
  #scoping`'s own framing) and `getGroupStatisticsSource(groupId)` (`group_player_results` — already
  `is_private`-filtered since step 11 — plus `game_summaries`/`transfer_summaries` filtered the same
  way, plus `profiles_public` for display names and `stats_visibility`). Never reads `games`/
  `game_players`/`transfers` — this module's own hardcoded `.from(...)` calls are what makes
  "statistics read only from the permanent tables" true of the whole app, not just of
  `core/statistics.ts` in isolation. `src/data/profiles.ts#getProfilesPublic` gained
  `statsVisibility` on its return shape, defaulting to `'group'` for any fixture seeded before this
  column existed.
- **~15 new tests in `src/data/statistics.test.ts`** against `fakePostgrestClient.ts`, matching the
  established standard: the join between `player_results` and `game_summaries`, group-scoping,
  dropping a result whose game is missing rather than throwing, no transfer/profile queries when a
  group has no games or only guest rows.
- **A new SQL test, `supabase/tests/statisticsViews.test.ts`** (10 tests, `npm run test:db` now
  97/97, up from 91): the `profiles_public` widening (self/co-member/stranger), and — the step's
  own "statistics unchanged" exit criterion, taken literally rather than assumed to follow from
  step 11's general snapshot-survives-purge property — a group net total read through
  `group_player_results` proven byte-identical before and after `purge_expired_game_data()` runs
  (with the live `games` row actually confirmed gone, not a no-op purge) and before and after the
  game is explicitly deleted.
- **UI**, in the established visual language (no mockup covers a statistics screen — same situation
  `AccountPage`/`GroupsListPage` were in for steps 12/14):
  - `StatisticsPage` (`/statistics`) — one group-switcher chip row ("הכל" plus each of the caller's
    groups) feeding both tabs; `החבורה` only appears once a real group is selected, since a group
    leaderboard can't aggregate across group boundaries (`04-ux-spec.md#statistics`'s "two tabs...
    with a group switcher" read as one control driving both, not two independent ones). A nav icon
    (`📊`) added to `HomePage`'s header alongside the pre-existing `👥`/`👤`.
  - `PersonalStatsView` — hero net (`StatHero`), games-played/win-rate tiles, the cumulative-net
    sparkline (`Sparkline`, step 3's component, its first real caller), the full detail list via a
    new small `StatRow` primitive local to the feature (label/value, not a shared component — see
    Deviated).
  - `GroupLeaderboard` — sortable via `SelectionChip` row (net/games/win-rate/ROI/attendance,
    `04-ux-spec.md#statistics`'s "switch the sort metric via chips, rather than tiny column
    headers"), hiding any player whose `stats_visible` is false while their numbers still feed
    `GroupTableStats`'s aggregates untouched.
  - `GroupTableStats` — the table-level figures via the same `StatRow` list.
  - `FunStatsRow` — all seven fun stats as a horizontal, screenshot-friendly card row
    (`04-ux-spec.md#statistics`: "these are the ones people screenshot into the group chat").
  - `PercentValue`/`RateDisplay` — the percent twin of `<Money>` (LTR isolation, U+2212 minus,
    explicit `+`/`−` when signed) and the `62% (13 משחקים)` / `נתונים חלקיים` presentation rule.
- **~25 new component tests** across `PersonalStatsView`, `GroupLeaderboard`, `GroupTableStats`,
  `FunStatsRow`, `RateDisplay`, `format.ts`, and a minimal `StatisticsPage` test (the not-configured
  banner — the only state this sandbox's session can reach, same limitation every cloud-gated route
  has had since step 12). `npm run verify` is green at 612 tests (up from 550). Driven in a real
  headless-Chromium browser against both a production preview build (the not-configured banner,
  RTL, zero console errors) and the dev server with `?lang=en-XA` (LTR flip, no clipping in the one
  reachable state) — see Left undone for what a real Supabase connection would additionally cover.

**Deviated.**
- **The "detail table" (`04-ux-spec.md#statistics`: "horizontally scrollable inside its own
  container") is a vertical label/value list (`StatRow`), not a literal scrollable grid.** Read
  literally against a phone-sized viewport, a wide multi-column table of twelve personal stats
  would need horizontal scrolling to be readable at all; a vertical list needs none and reads
  better one-handed. `GroupLeaderboard`'s per-player rows (name + one sorted metric) *are* the
  horizontally-compact form the spec describes — the "scrollable table" concern is really about the
  leaderboard, which is exactly where `04-ux-spec.md` raises "switch the sort metric via chips" in
  the same breath.
- **Sample-size suppression's denominator is total games played, not the rate's own decisive
  denominator.** `06-statistics.md#presentation-rules` gives one example (`62% (13 משחקים)`) without
  disambiguating whether "13" is total games or wins+losses after zero-exclusion. Chose total games
  played uniformly for every rate (win rate, ROI implicitly, attendance) — it is the more intuitive
  "how much data backs this" signal, and it is what `04-ux-spec.md`'s own "every rate shows its
  sample size" reads as applying to the screen's rates generically, not to win rate's specific
  zero-exclusion mechanics.
- **`GroupTableStats`' "biggest night" is keyed on `total_cash_pot_minor`, i.e. physical cash handed
  to the pot (05-settlement.md#the-pot-as-a-settlement-node), not `total_buy_ins_minor`.** The
  field is literally named `pot` in the schema, and 06's own "Average pot per game, biggest night"
  groups the two together under one clearly pot-labelled figure.
- **The percent-metric leaderboard rows (win rate/ROI/attendance) don't reuse the shared
  `<LeaderboardRow>` primitive**, which only ever renders a `<Money>` value. A local row markup
  (identical classes, different value slot) lives in `GroupLeaderboard.tsx` instead of widening a
  step-3 shared primitive for a genuinely different value type.

**Applied to the real Supabase project in a same-session follow-up.** Same MCP-`apply_migration`
path steps 10/11/13/14 used; immediately followed by the now-standard version-repair step
(`docs/build/NOTES.md`'s documented rule — the tool stamps `schema_migrations.version` with the
apply timestamp, not the filename's own version) — `20260801133718` → `20260802090000`, confirmed
via `list_migrations`. `get_advisors(type: 'security')` afterward shows only the pre-existing
`profiles_public` `security_definer_view` flag the step-10 RLS migration's own comment already
accepts as intentional (see the checkpoint table) — no new gap.

**Left undone.**
- **Not tested against a real signed-in device**, same standing gap as steps 12–14 (this sandbox
  cannot reach `*.supabase.co` at all — see `NOTES.md`). Every formula is proven against hand-
  computed fixtures, every query against `fakePostgrestClient.ts`, and every component against real
  rendered DOM output — but nobody has yet opened `/statistics` signed in against the live project
  and looked at real numbers for a real group.
- **No date-range filter and no "only games I played in" filter** — `04-ux-spec.md#statistics`
  names both under "Filters"; the group switcher and the שלי/החבורה split cover the scoping this
  step's own `PLAN.md` exit criteria actually test, and both filters are straightforward additions
  later (`core/statistics.ts`'s functions already take a plain row array, so a filter is just a
  narrower array before it's handed in) rather than architecturally blocked.
- **`invite_player_to_game`'s missing UI trigger (step 14's own "left undone")** is untouched —
  not this step's concern, noted only so it isn't mistaken for newly introduced.

**Watch out.**
- **`profiles_public` is now read by two independent features for two different reasons** — step 13
  (viewer/player name resolution) and step 15 (leaderboard suppression). Any future column added to
  this view should ask "self or co-member" the same way `stats_visibility` did here: is this a
  display preference safe to share at the same trust level as a username, or real account data that
  belongs on `profiles` alone.
- **`core/statistics.ts`'s group-level functions trust their caller for `is_private` exclusion —
  they have no way to enforce it themselves.** `src/data/statistics.ts#getGroupStatisticsSource` is
  the one place that actually filters (`group_player_results` server-side, `game_summaries` via an
  explicit `.eq('is_private', false)`); a future caller that feeds `computeGroupPlayerStatistics`/
  `computeGroupTableStatistics` rows from anywhere else must apply the same filter itself first.
- **A rate's `sampleSize` is always "how many games underlie this population," not the rate's own
  post-exclusion denominator** — `attendanceRate`'s sample size is the group's total game count, not
  the player's own games-played; `winLoss.rate`'s sample size is every game played, including
  breakeven ones excluded from the rate's own numerator/denominator. Keep this consistent if a new
  rate is added — it is what makes the suppression threshold mean the same thing everywhere it
  appears.

---

### Step 16 — Retention live, deletion, export
**Status:** in progress — code complete, no migration needed; the maintenance.yml purge step not
yet confirmed against the real Supabase project  **Sessions:** 1  **Commits:** 1

**Built.**
- **A real, pre-existing gap, found and fixed first, since everything else in this step depends on
  it being true:** `src/data/supabaseSyncTransport.ts`'s `game_ended` case only ever updated
  `games.status`/`ended_at`/`claim_deadline`/`reopen_deadline` — it never called `finalize_game()`.
  `finalize_game` was only ever invoked from `localGameMigration.ts`'s one-time local-game-upload
  path. That meant a normal signed-in host ending a game today would never get a permanent snapshot
  server-side at all — `game_summaries`/`player_results`/`transfer_summaries` would simply never
  gain a row for that game, silently, with no error anywhere. Fixed by calling
  `client.rpc('finalize_game', { p_game_id })` right after the `games` update, in the same case —
  safe because the server-side trigger has already applied every preceding event in the same push
  by the time this line runs (an `AFTER INSERT` trigger on the same statement's own batch), and
  idempotent because `finalize_game` deletes-then-rewrites its own three tables on every call.
  `localGameMigration.ts`'s own explicit fallback call is *not* now redundant and was kept
  unchanged: a second migration run (a re-sign-in) finds an already-empty outbox, so the
  `game_ended` case never fires again, and that explicit call is the only thing that still
  finalizes an already-finished game in that scenario (`localGameMigration.test.ts` now expects
  `finalize_game` to be called twice for that path, not once — documented at the assertion, not
  just fixed silently).
- **`core/gameExport.ts`** — pure, dependency-free: `buildGameExportPayload` turns a small
  name-resolved input (every amount already in `Minor`, every name already a string — no ids, so
  this file never needs a resolver or an i18n import) into a JSON-serializable payload with every
  money field converted to major units via `toMajor` — this file is read by a human in a
  downloaded file, not rendered by this app, so it follows the same "never say
  agorot/cents/minor units" spirit `CLAUDE.md` holds every user-facing surface to, just applied to
  an export instead of a screen. `gameExportFileName`/`allHistoryExportFileName` for stable,
  filesystem-safe names.
- **`src/data/gameHistory.ts`** — the shared read side for both "a purged game's results card" and
  export: `fetchPastGameResult(gameId)` reads `game_summaries`/`player_results`/
  `transfer_summaries` for one game directly (RLS alone decides visibility — a game this caller
  can't see comes back `null`, identical to "purged everywhere" from this module's point of view);
  `fetchAllHistoryForUser(userId)` bundles every game the caller has a `player_results` row in,
  across every group, mirroring `src/data/statistics.ts#getPersonalStatisticsSource`'s own "הכל"
  scoping; `pastGameResultToExportInput` adapts the fetched rows straight into
  `core/gameExport.ts`'s input shape.
- **`src/features/game/download.ts#downloadJson`** — the one DOM touch the export feature needs
  (`Blob` + a temporary anchor's `.click()`), deliberately not in `src/data/` (the Supabase seam,
  not a DOM one) or `core/` (which may not touch the DOM at all).
- **`core/offline/gameActions.ts#deleteGameLocally`** — wipes this device's own cached record,
  event log, queued outbox entries and snapshot for one game, in one Dexie transaction.
  **`src/data/gameDeletion.ts#deleteGame`** wraps it with the remote half: if cloud-configured,
  also deletes the `games` row — no new RPC needed, since `games_delete`'s existing RLS
  (`host_id = auth.uid()`) already scopes it correctly (a no-op for anyone but the real host, or
  for a game that was never pushed at all) and every tier-2/3 table already cascades from `games`
  (`on delete cascade`, since 20260729120500_game_events.sql); the permanent tier-1 snapshot
  survives untouched because `game_summaries` carries no foreign key back to `games` at all. A
  pre-existing step-11 SQL test already exercised exactly this "plain delete from games" mechanism
  and proved tier 1 survives it byte-identical — this step's own delete path is that same proven
  mechanism, not a new one.
- **`DeleteGameConfirmSheet`** — the spec's exact copy for a finished game
  (`הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.`) and a different, "deletes everything" message for
  an unfinished game, with an export-first shortcut above the destructive action. Wired into both
  `LiveGameView`'s `⋯` menu (host-only for delete; export is available to anyone, since it's a
  harmless read of already-visible data) and `SummaryScreen`'s `⋯` menu (a finished game, so
  always the "tier 1 kept" wording).
- **`PastGameResultsView`** — the new fallback `GamePage` renders once `useGame`'s Dexie query
  resolves with no local record at all (distinguished from "still loading", which stays blank as
  before): a purged game, or one this device never had (a share link opened elsewhere, or an iOS
  IndexedDB eviction, `docs/build/NOTES.md`). Fetches via `fetchPastGameResult`, renders a
  `ResultsCard`-style summary (net per player, transfers in read mode via the existing
  `TransferRow`) with an explicit "יומן הפעילות של משחק זה כבר לא זמין" note — there is no audit
  log here, deliberately, since a purged game's `game_events` really are gone and a foreign game's
  were never on this device to fold in the first place — an export button, and a friendly dead end
  (`pastGame.notFoundTitle`/`notFoundDescription`) when RLS or an actual purge means there's
  nothing to show, matching `04-ux-spec.md#revoked-expired-or-purged`'s existing convention for
  every other "link doesn't work" state.
- **`HomePage`'s "משחקים אחרונים" section** — a real, pre-existing gap closed, not introduced by
  this step: `HomePage` has only ever listed active/settling games since step 6, with finished
  games simply filtered out and no route back to one once its in-progress card disappeared. Both
  step 6 and step 9's own `PROGRESS.md` entries flagged this as deliberately deferred ("recent
  finished games... isn't built — no game can reach finished status until step 9's ending flow
  exists"), but step 9 landed and nothing ever picked it back up. Step 16 is where it stops being
  deferrable: exporting or deleting a finished game needs a way to *reach* one in the first place.
  Lists up to the ten most recently touched finished games as `ResultsCard`s, linking to the same
  `/game/:id` URL every other game uses (`GamePage` still dispatches correctly since these games
  have local records).
- **`account.exportAllHistory`** on `AccountPage`'s signed-in panel — every game the caller has
  ever played in, across every group, as one JSON file (`fetchAllHistoryForUser` +
  `buildGameExportPayload` per game, wrapped in `{formatVersion, exportedAt, games: [...]}`).
- **`maintenance.yml`** — a second step, `Purge expired game data`, calling
  `purge_expired_game_data()` over the REST RPC endpoint with the same anon-key pattern the
  existing keep-alive ping already uses (safe to call with no privileges at all: the function only
  ever deletes rows already past a fixed age threshold, with no caller-supplied input, so calling
  it early or often is harmless, merely redundant), echoing each returned `{table_name,
  deleted_count}` row as its own log line so a runaway purge is visible directly in the Actions
  history.
- **A new e2e test, `e2e/delete-and-export.spec.ts`**, driven in real headless Chromium against a
  production build: create → buy-in → settle → end → export (a real browser download, whose file
  is read back off disk and JSON-parsed to confirm it round-trips) → delete → lands on an empty
  home screen with the exact confirmation copy shown along the way; a second test confirms an
  unknown game id renders the friendly dead end, not a blank screen, with zero console errors on a
  reload.

**43 new tests** across `core/gameExport.test.ts` (5), `src/data/gameHistory.test.ts` (5),
`src/data/gameDeletion.test.ts` (3), `src/features/game/download.test.ts` (1),
`src/features/game/DeleteGameConfirmSheet.test.tsx` (3), `src/features/game/
PastGameResultsView.test.tsx` (3), `src/features/game/SummaryScreen.test.tsx` (2, the first test
this component has ever had), plus additions to `gameActions.test.ts`, `HomePage.test.tsx` and
`GamePage.test.tsx`. `npm run verify` is green at 640 tests (up from 612); `npm run test:db` is
unchanged at 97/97 (no migration touched this step); all 7 Playwright e2e tests pass, including the
two new ones.

**Deviated.**
- **No SQL migration at all** — the only step so far with none. `purge_expired_game_data()` (step
  11) already returned exactly the shape and already had a test proving it; the actual gap was
  operational (nothing invoked it) and application-layer (the `finalize_game` call and everything
  built on it), not schema.
- **Export is JSON only, not CSV.** `08-gaps-and-open-questions.md#a16-data-export` says
  "CSV/JSON export... costs an afternoon" — either satisfies the doc's own wording. JSON was
  chosen because the natural shape (a game summary plus two differently-shaped row lists) needs
  either multiple CSV files or an awkward flattening, while JSON nests it directly and is exactly
  as re-readable; the exit criterion ("reconstructing the summary from it") is proven with a
  literal JSON round-trip test. Nothing about this blocks adding a CSV export later — the same
  `PastGameResult`/`GameExportInput` shapes would feed it too.
- **Delete is available from a still-active game's menu, not only a finished one.** `PLAN.md`'s own
  exit criterion example ("deleting an unfinished game deletes everything") only makes sense if
  deleting an unfinished game is actually reachable, so this was built into `LiveGameView` too, not
  just `SummaryScreen` — export from an in-progress game carries `netMinor: null`/no transfers
  (nothing has been settled yet), which `core/gameExport.ts`'s input shape already accounts for.
- **The reopen-then-never-re-end edge case for the *remote* snapshot is a known, accepted gap, not
  fixed here.** Reopening a game locally deletes its local `db.snapshots` row (step 9/13); nothing
  analogous exists for the server-side permanent tables, since no role has a delete policy on them
  at all (only `finalize_game`, running as owner, may write them) and building a dedicated
  `unfinalize_game()` RPC for this one edge case was judged out of scope for this step. Concretely:
  a signed-in host who reopens an already-finalized game and then never re-ends it leaves a stale
  permanent snapshot from the *previous* end alongside a `games.status` that says `active` again.
  `finalize_game`'s own delete-then-rewrite already makes the common case (reopen, then re-end)
  perfectly correct; only the "reopen and abandon" tail case is affected, and it was never possible
  to hit before this session's `finalize_game` fix (since without that fix, no remote snapshot
  existed to go stale in the first place). See `NOTES.md`.

**Left undone.**
- **The new `maintenance.yml` purge step is not yet confirmed against the real Supabase project** —
  see the checkpoint table. No schema changed, so this doesn't block calling step 16's build items
  done, but the workflow itself hasn't actually been dispatched and watched succeed.
- **`account.exportAllHistory` has no dedicated component test** — the same standing "can't sign in
  from this sandbox" limitation every cloud-gated route has had since step 12 (`AccountPage.test.tsx`
  doesn't exist yet, at any signed-in state, for any feature on that page — not just this one).
  Every piece underneath it (`fetchAllHistoryForUser`, `buildGameExportPayload`, `downloadJson`) is
  unit-tested on its own; `npm run typecheck`/`lint` are clean.
- **No date-range filter on "export all history"** — not asked for by `PLAN.md`, noted only so a
  future "just this year" request isn't mistaken for a regression.

**Watch out.**
- **Any future call site that pushes a `game_ended` event must not assume `finalize_game` needs a
  second explicit call** — the push itself now handles it. Only `localGameMigration.ts`'s
  already-flushed-outbox scenario still needs its own explicit fallback call; don't copy that
  pattern into a new call site without the same reasoning.
- **`deleteGame`'s remote half is a plain RLS-gated delete, not an RPC** — resist the urge to wrap
  it in one "for consistency" with the other host actions; the plain delete is simpler and already
  proven correct by a pre-existing test, and an RPC would add a security-definer surface for no
  actual gain.
- **`PastGameResultsView` and `SummaryRoute` deliberately use two different data sources for the
  same-looking screen** — `SummaryRoute` reads live local fold state (still fully populated right
  after finalising, and needed for undo/reopen affordances `PastGameResultsView` doesn't have);
  `PastGameResultsView` reads the permanent tables directly and has no access to a player's
  original game-player id at all (the permanent tables were built exactly to survive a purge, so
  they denormalise straight to names — see `docs/03-data-model.md#permanent-tables`'s own comment
  on why `transfer_summaries` stores `from_name`/`to_name`, not ids). Don't try to make
  `PastGameResultsView` share `SummaryRoute`'s rendering path — the underlying data really is
  shaped differently, on purpose.

---

### Step 17 — Polish and v1 sign-off
**Status:** in progress — 2 of 6 `Build` bullets done, 0 of 8 exit criteria checked
**Sessions:** 1  **Commits:** 1

**Built.**
- **8 of the 10 ⓘ explainers from [`04`](../04-ux-spec.md#-explainers)'s table**, each wired to a
  real control, not a placeholder: `ז'יטונים לקנייה` (`NewGamePage`), `💵` cash paid
  (`CashPaidSheet`), `לא מזוהה / הבית` (`PotResolutionSheet`'s "assign to house" button), share
  link expiry (`ShareSheet`), `כינוי` (`PlayerActionsSheet`'s nickname trigger, registered players
  only), `פתח מחדש` (`SummaryScreen`'s reopen row), claiming a guest row (`SharedGamePage`'s "זה
  אני" button), and shared costs (`SharedCostsSheet`'s add button) — on top of `משחק פרטי`, already
  built in step 6. `InfoExplainer` itself had no dedicated component test before this session
  (`src/components/InfoExplainer/InfoExplainer.test.tsx` is new: open-on-tap, close-on-second-tap,
  close-on-Escape); one assertion was added per wiring site to an existing test file where one
  already existed (`PotResolutionSheet`, `SharedCostsSheet`, `PlayerActionsSheet`,
  `SummaryScreen`), confirming the explainer renders with the right content — `CashPaidSheet`,
  `ShareSheet` and `SharedGamePage` have no test file at all yet (see Watch out), so their wiring
  is proven only by typecheck/lint and the existing e2e suite, which already exercises
  `SharedCostsSheet` (equivalently: the shared-cost step of `e2e/full-game.spec.ts`) end to end
  with the new button layout in place.
- **`שכפל משחק אחרון`** (`04-ux-spec.md#new-game--setup`): `core/offline/gameActions.ts
  #getMostRecentGameSetup()` finds the device's most recently *created* local game — not most
  recently *touched*, which is all `db.games`'s one index (`updatedAt`) actually tracks, since
  `appendEvent` bumps it on every event, not just creation (see this step's Watch out and
  `NOTES.md`) — and returns its stakes, privacy flag, group, and active roster split into guest
  names and account-player ids. `NewGamePage` wires it to a new header button (hidden when there
  is no local game to copy from, via a live `db.games.count()` query) that pre-fills the form's
  fields — buy amount, chips per buy, `משחק פרטי`, group (if the caller is still a member), guest
  names, and account players (display names resolved through the existing `getProfilesPublic`,
  same call `useAccountNames` already makes elsewhere) — rather than creating and starting a new
  game outright; see Deviated for why. 12 new tests: 4 for `getMostRecentGameSetup` (no local
  games → `null`; copies stakes/privacy/group/guest-roster and excludes a removed player; picks by
  `createdAt` even when an older game was touched more recently, proven by deliberately bumping the
  older game's `updatedAt` past the newer game's; splits guest names from account-player ids) and
  2 for `NewGamePage` (button absent with zero local games; button present and pre-fills every
  field from a seeded game), plus the `InfoExplainer` and per-site tests above.

`npm run verify` (now 649 tests, up from 640) and all 7 Playwright e2e tests are green. The
pseudo-locale was spot-checked against a real dev server on `NewGamePage` specifically (the screen
with the most new UI this session) — the new label+ⓘ rows hold up at ~40% longer text width, and
the popover itself doesn't overflow the viewport at a 390px phone width — not swept across every
other touched screen; see Left undone.

**Deviated.**
- **`קח ניהול` does not get a dedicated ⓘ**, despite being one of the table's ten rows.
  `HostControlSheets.tsx#TakeOverHostConfirm` (built in step 13) already shows the exact
  consequence the table's row describes — "the current host loses control immediately, and their
  unsynced changes can be lost if their phone never reconnects" — as **always-visible** text in the
  confirm sheet, not gated behind a tap at all. `04-ux-spec.md#the-invitees-side`'s own pending-invite
  card sets the precedent for this: "the consequence line is not optional and not hidden behind the
  ⓘ — the popover expands on it, but the card itself says the thing that matters." Adding a
  redundant ⓘ next to the `⋯` menu's take-over button, on top of a sheet that already says the same
  thing unconditionally one tap later, would be exactly what `04`'s own rules warn against ("never
  a patch for a label that should have been clearer", "muted, not decorative"). Treated as already
  satisfied, by a stronger mechanism than the one asked for — not skipped.
- **`שכפל משחק אחרון` pre-fills the form; it does not create-and-start the game in one action.**
  The spec's wording ("same players, same stakes, one tap") is genuinely ambiguous between the two
  readings. `04-ux-spec.md#new-game--setup`'s very first sentence about this same screen — "sensible
  defaults already filled so the whole thing can be dismissed with one tap" — describes the
  *existing* create flow in identical language for identical behaviour (fill fields, then one more
  tap to start), so duplicate-last-game filling the fields and leaving `התחל משחק` as the actual
  one-tap dismissal is consistent with the screen's own established idiom, and it lets the user
  glance at what got copied (and edit it, e.g. drop a no-show) before committing — a page best
  suited for reversibility for a very deliberate reason.

**Left undone.**
- **`wa.me` shortcuts are not built at all** — this is the largest deferred piece, and deliberately
  not started rather than half-built. `05-settlement.md#payment-links--reality-check-23` calls for
  a `wa.me` link built from *the other player's* phone number, but `profiles.phone`
  (`supabase/migrations/20260729120100_profiles.sql`) is self-only under the current RLS — nobody
  can read anyone else's phone number, and there is no UI anywhere in the app to even enter one
  (checked: no `phone` field exists outside that one column and its RLS comment). Building this for
  real needs three things together: a profile-settings field to capture it, a new migration
  widening `profiles_public` (or a narrower view) to expose phone to co-members the same way step
  15 widened it for `stats_visibility` — and that is a real privacy decision (any group member
  could then see any other member's phone number), not a mechanical one, so it wasn't made
  unilaterally this session. **Copy-to-clipboard, by contrast, was already built** — `TransferRow`
  (step 9) already copies a name or an amount to the clipboard on tap in read mode — so that half
  of the `Build` bullet is done; only the `wa.me`/phone half is outstanding.
- **Nickname pre-fill from the player's most recent nickname in the group** — not built. This needs
  a new read across the caller's past games in a group for a given account id's most recently used
  `nickname_set` value, which is a real, separate data-layer query (nothing existing shape already
  answers "what was this person called last time"), not a small addition to fit alongside the rest
  of this session's scope. `PlayerActionsSheet.currentNickname` still only ever reflects the
  *current* game.
- **The pseudo-locale sweep is spot-checked, not swept.** Only `NewGamePage` was actually driven in
  a real browser at `?lang=en-XA` this session (see Built). Every other screen touched this session
  (`CashPaidSheet`, `PotResolutionSheet`, `ShareSheet`, `PlayerActionsSheet`, `SummaryScreen`,
  `SharedGamePage`, `SharedCostsSheet`) is structurally correct — every new string goes through
  i18next, every new layout uses flex/gap rather than fixed widths — but not individually
  screenshotted at the ~40%-longer pseudo-locale width the way `CLAUDE.md` asks for "as you build
  it". Worth doing before this step is called `done`, not deferred to a final audit.
- **The manual device matrix (iOS Safari, Android Chrome, installed and in-browser, airplane mode)
  needs the repository owner** — no tool here can drive a real phone. Same standing kind of gap as
  steps 7's and 9's real-device checkpoints.
- **None of the eight `09 — Definition of done for v1` checklist lines are checked off yet** — every
  one either depends on a `Build` item still outstanding above, or on the device matrix.

**Watch out.**
- **`db.games` has no `createdAt` index — only `updatedAt`** (`core/offline/db.ts`, unchanged this
  session). `getMostRecentGameSetup` therefore reads the whole table and sorts in memory rather
  than using `orderBy`; this is fine at the scale of one user's own local games, but don't reach
  for `db.games.orderBy('createdAt')` anywhere — it isn't indexed and would silently do the wrong
  thing (Dexie's `orderBy` needs a real index to be meaningful).
- **`CashPaidSheet`, `ShareSheet` and `SharedGamePage` still have zero dedicated test files** — a
  pre-existing gap (the same "can't sign in from this sandbox" family of limitations for
  `ShareSheet`/`SharedGamePage`, and simply never written for `CashPaidSheet`), not one this session
  introduced, but also not one it closed. Their new ⓘ wiring rides on typecheck/lint plus the
  existing e2e suite rather than a unit assertion of its own.
- **Don't add a `קח ניהול` ⓘ without re-reading the Deviated entry above first** — the omission is a
  considered call, not a gap that was simply missed.
