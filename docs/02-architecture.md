# 02 — Architecture

## Constraints driving every decision

1. **Zero running cost.** No server bill, ever.
2. **Works on Android and iPhone**, without asking friends to install anything.
3. **Works with bad Wi-Fi**, because home poker games have bad Wi-Fi.
4. **Live** — viewers should see buy-ins appear without refreshing.
5. Maintained by one person in their spare time.

## Platform choice: PWA on GitHub Pages

| Option | Verdict |
|---|---|
| **PWA on GitHub Pages** | ✅ **Chosen.** Free, one codebase, installable to home screen on both platforms, instant updates, no store review, shareable by link — which is exactly requirement #5 |
| React Native / Flutter native apps | ❌ Two store accounts (₪99/yr Apple), review cycles, and friends must install. Fails "easily accessible" |
| Capacitor wrapper around the same PWA | 🕒 Possible later with zero rewrite if push notifications or a store listing are ever wanted |
| Telegram / WhatsApp bot | ❌ Poor fit for a live editable table |

### What PWA costs us on iOS

Be aware of these before promising anything:

- **Push notifications** work on iOS only for apps added to the Home Screen (iOS 16.4+). Don't
  design any flow that depends on push. Sharing is via WhatsApp text, which is what people
  actually use anyway.
- **Storage eviction**: Safari can clear IndexedDB after ~7 days of not opening the site if the
  app isn't installed to the Home Screen. Our offline queue must therefore be treated as a
  short-lived buffer, not durable storage — sync early, sync often, and warn if there is
  unsynced data.
- Prompt users to "Add to Home Screen" after their first completed game, not on first load.

### Hosting details

- GitHub Pages from the repo, built and deployed by GitHub Actions on push to the default branch.
- **Use a hash router** (`/#/game/123`) rather than history routing. GitHub Pages has no SPA
  fallback; the `404.html` trick works but breaks share links in some in-app browsers. Ugly URLs
  are a fair trade for links that always work when pasted into WhatsApp.
- Self-host the Hebrew font (Rubik or Heebo, subset) rather than using Google Fonts — faster,
  works offline, no third-party request.

## Database choice

Requirement #4: a free database suitable for the task. Two serious candidates.

| | **Supabase** (chosen) | **Firebase** |
|---|---|---|
| Free tier | 500MB Postgres, 50k MAU, 2M realtime messages/mo | 1GB Firestore, 50k reads/day, 20k writes/day |
| Statistics queries | ✅ Real SQL — every stat in [06](06-statistics.md) is one view | ❌ No aggregations; must maintain counters or read everything client-side |
| Permission model | ✅ Row Level Security expresses host/player/viewer/token exactly | ⚠️ Security Rules can do it, but complex share-token rules get gnarly |
| Realtime | ✅ Postgres changes over WebSocket | ✅ Excellent, best in class |
| Offline | ⚠️ Roll our own queue | ✅ Built-in offline persistence |
| Auth (Google + email) | ✅ | ✅ |
| **Gotcha** | 🔴 **Free projects pause after 7 days of inactivity** | 🟢 Never pauses |

**Decision: Supabase.** The statistics feature is a large chunk of this product (#10–#12, #24),
and doing it in SQL versus maintaining denormalised counters in Firestore is the difference
between a view definition and a class of bugs. RLS also maps one-to-one onto the roles in
[01 §4](01-product-spec.md#4-roles-and-permissions).

**Mitigating the pause:** a GitHub Actions cron (`0 6 */3 * *`) issues one authenticated
`SELECT 1` against the project. This costs nothing and keeps the project awake indefinitely.
Also: a paused project resumes on demand in ~1 minute, so the worst case is one slow load, not
data loss. This must be set up in milestone 0 — do not discover it the night of a game.

**Staying inside 500MB:** detailed game data is purged on a schedule and only small immutable
result snapshots are kept forever ([03](03-data-model.md#retention-and-archiving)). A finished
game's permanent footprint is a few hundred bytes per player, so a group playing weekly for a
decade uses a rounding error of the free tier. The bulk — the event log — never accumulates.

If the pause ever becomes a real problem, Firebase remains a viable migration; keep the data
access behind a thin repository layer so the swap is contained.

## Auth

Supabase Auth with two providers:

- **Google** — one tap, what most people will use.
- **Email magic link** — no password to invent or forget on a phone keyboard. Prefer this over
  email+password; add password only if you want offline-capable sign-in.

Guests (#21) are just rows with `user_id = null` and a name. They never touch auth.

**Claiming a guest profile**: host-confirmed. The guest's future account is linked to the
existing `game_players` rows by setting `user_id`, and a `claimed_by_user_id` audit field records
who approved it. Host confirmation matters — otherwise anyone signing up as "רני" could absorb
someone else's history.

## Security model

The Supabase **anon key is embedded in the public JS bundle** and that is by design — it carries
no privileges of its own. Everything therefore rests on RLS. Non-negotiable rules:

1. RLS enabled on **every** table, no exceptions, with a CI check that fails the build if a table
   has RLS off.
2. Anonymous share-link access goes through a `SECURITY DEFINER` RPC that takes the token and
   returns the game, rather than a policy that exposes the token column to `anon`.
3. Share tokens are 128-bit random, revocable, and never derived from the game id. The RPC returns
   a different projection depending on whether the game is live or finished
   ([03](03-data-model.md#share_links-5)).
4. Writes are restricted to the host (see [08 Q1](08-gaps-and-open-questions.md#q1) if you want
   players to add their own buy-ins). The one exception is the `take_over_host` RPC, which any
   group member may call — see [03](03-data-model.md#host-takeover).
5. Permanent result snapshots are writable by nobody: only the `finalize_game()` function, running
   as the table owner, may insert them.
6. No service-role key anywhere in the client or in the repo.

## Offline-first

**This is the biggest thing missing from the original brief.** A poker night with a dead Wi-Fi
router must not stop the app from working.

Design:

- All game state is read from a **local store** (IndexedDB via Dexie). The UI never waits on the
  network.
- Mutations are appended to a **local outbox** with a client-generated `client_event_id` (UUID),
  applied optimistically to local state, and pushed when connectivity allows.
- The server rejects duplicate `client_event_id`s, so retrying a push is always safe — this is
  what makes an offline double-tap of `+` harmless.
- Because mutations are **events, not state overwrites** ([03](03-data-model.md#event-sourcing)),
  two devices editing the same game concurrently merge cleanly instead of clobbering each other.
  `+1 buy-in` from two phones is unambiguous in a way that "set count = 3" is not.
- A **persistent sync indicator in the top corner** of every screen that touches game data —
  synced, syncing, offline with a pending count, or failed
  ([04](04-ux-spec.md#sync-indicator)). Never a blocking error dialog.
- **Warn before the host closes the tab with unsynced events**, and warn on the settlement screen
  if anything is still pending.
- Each successful push stamps `games.host_last_synced_at`. That timestamp is what the host-takeover
  warning shows to whoever is about to seize control
  ([04](04-ux-spec.md#host-takeover-warning)) — it is the only place in the app where another
  person's sync state is actionable information.

Ordering: events carry a client timestamp and a per-device sequence number; the server assigns
authoritative ordering on arrival. For this domain (counters and independent row edits), exact
global ordering doesn't affect the result. This is also why a host takeover is safe: events pushed
late by the *previous* host are still accepted and merged, because they're append-only and
idempotent rather than state overwrites.

## Realtime

Subscribe to `game_events` and `game_players` for the open game id. Viewers get live updates.
Fall back to polling every 15s if the WebSocket fails (some restrictive networks block it).

## Frontend stack

| Concern | Choice | Why |
|---|---|---|
| Framework | React + TypeScript + Vite | Ubiquitous, fast builds, good PWA plugins |
| Styling | Tailwind CSS with **logical properties** (`ms-`, `me-`, `ps-`, `pe-`) | RTL for free; never use `left`/`right` |
| State | Zustand for local game state + TanStack Query for server sync | Small, no boilerplate |
| Local DB | Dexie (IndexedDB) | Outbox + cached games |
| PWA | `vite-plugin-pwa` (Workbox) | Service worker, offline shell, install prompt |
| Backend SDK | `@supabase/supabase-js` | |
| Dates | `date-fns` with per-locale imports | Small; locale swapped with the app language |
| i18n | `i18next` + `react-i18next`, Hebrew only at launch | See below — more languages are planned, so the plumbing goes in from day one |
| Tests | Vitest (money math), Playwright (one full game flow) | |

Money is stored and computed as **integers in the currency's minor unit**, never floats, and
formatted for display only. Nothing user-facing ever names the minor unit — the UI says shekels.
See [03](03-data-model.md#money-representation) and
[05](05-settlement.md#rounding-and-precision).

## Internationalisation

Hebrew ships first, English and others follow. That changes very little about what gets built now,
but the few things it does change are expensive to retrofit:

- **A real i18n library from day one**, not a bare object of strings. `i18next` gives
  pluralisation (Hebrew has its own rules), interpolation, and lazy-loaded language bundles for
  free, and costs a few kilobytes.
- **Direction is derived from the locale.** `<html dir>` and `lang` are set at runtime; no
  component may assume RTL, and layout uses logical properties exclusively
  ([04](04-ux-spec.md#rtl-and-hebrew)).
- **No string concatenation.** Every user-visible sentence is a template with named parameters, so
  word order can differ per language.
- **Currency and number formatting via `Intl`**, keyed on the active locale and the game's currency
  code — never a hardcoded `₪`.
- **Dates and relative times** through the locale-aware formatter, including the audit log's
  timestamps.
- A lint rule banning literal user-facing strings in components. Cheap to add now, miserable to
  retrofit across a finished app.

The share-text templates ([07](07-hebrew-glossary.md#share-text-templates)) are translatable
resources too, not string literals in the share module.

## Repository layout

```
/                    # this planning repo becomes the app repo
  docs/              # these documents
  src/
    app/             # routing, providers, PWA shell
    features/
      auth/
      game/          # game page, player rows, buy counter, action sheet
      settle/        # end-game, transfers, edit mode
      stats/
      groups/
      share/
    core/
      money.ts       # minor-unit integer arithmetic + Intl formatting
      settlement.ts  # pure, dependency-free, heavily tested
      events.ts      # event types + reducers (state = fold(events))
      offline/       # Dexie outbox, sync engine
    data/            # Supabase repository layer (the swappable seam)
    i18n/
      index.ts       # i18next setup, locale → direction
      locales/he.json
  supabase/
    migrations/      # SQL, version controlled
    functions/       # finalize_game, purge_expired_game_data, take_over_host, share RPCs
    policies.sql
  .github/workflows/
    deploy.yml       # build + deploy to Pages
    maintenance.yml  # anti-pause ping + retention purge
```

`core/settlement.ts` and `core/events.ts` must be pure functions with no imports from React or
Supabase. They are the parts that must be provably correct.

## CI/CD

- `deploy.yml` — typecheck, lint, unit tests, build, deploy to Pages on default branch.
- `maintenance.yml` — every 3 days: ping Supabase to stop the free project pausing, then call
  `purge_expired_game_data()` to apply the retention policy
  ([03](03-data-model.md#retention-and-archiving)). One cron does both jobs; no server needed.
  It logs how many rows it deleted, so a runaway purge is visible in the Actions history.
- Supabase URL and anon key come from repo variables at build time (public by design).
- A migration check so the SQL in `supabase/migrations` is the single source of schema truth.
