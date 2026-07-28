# 09 — Roadmap, Testing, Risks

## Sequencing principle

Build the thing that replaces the napkin first. A host who can track buy-ins and settle the night
correctly, offline, alone, already has a useful app — everything else (accounts, sharing,
statistics) is amplification. So the first milestone deliberately ships without sign-in.

## Milestones

### M0 — Foundations
*Nothing user-visible. Do not skip; every item here is expensive to retrofit.*

- Vite + React + TS + SCSS modules with logical properties only, direction derived from the locale
- **i18n from day one** — `i18next`, Hebrew bundle, a lint rule banning literal user-facing strings
  ([02](02-architecture.md#internationalisation))
- `<Money>` component and the minor-unit integer arithmetic module, with tests
- Supabase project, first migration, **RLS on by default**, CI check failing the build if any table
  has RLS off
- GitHub Actions: build → Pages deploy, plus `maintenance.yml` (keep-alive ping + retention purge)
- PWA shell: service worker, manifest, install prompt, offline page
- Sync indicator component, wired to a stub sync engine so every later screen has somewhere to
  report state

### M1 — The napkin replacement 🎯
*The first genuinely usable build. Local-only, no account required.*

- Create a game: buy amount, chips per buy, derived chip value
- Player list: add, remove, guest rename, `(1)` deduping
- **The multi-select add-players sheet** — selection tray, capped-height roster, batch commit
  ([04](04-ux-spec.md#adding-players--the-multi-select-sheet)). Group sections light up in M4 once
  groups exist; until then it shows one unlabelled roster from local history
- **Buy-in counter with coalescing undo**, snackbar showing buy-ins, chips and money together
  ([04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app))
- Cash paid, edited directly on the row
- Settle a player, gray out, reopen
- Pot verification banner
- Full offline operation, IndexedDB persistence, wake lock
- Event log powering the audit drawer, with undone actions collapsed and hidden behind a filter

**Test it at a real game before building anything else.** Everything after this point is guesswork
until M1 has survived one Thursday night.

### M2 — Settlement
- Net calculation, pot as a settlement node
- Shared costs: add, payer, equal and custom splits
- Minimum-transfer algorithm: exact-pair cancellation → bitmask DP → greedy fallback
- Slide-to-confirm end game, missing-players check, discrepancy resolution
- Edit mode: chip picker, per-player over/under column, balance banner, colour + sign
- Share as text, both templates
- Reopen within 24h
- **The snapshot builder as a pure function** in `core/` — it produces the permanent result object
  even though nothing persists it yet. Writing it here means no finished game ever exists without
  one.

At the end of M2 the app is complete for a single host with no account. This is a legitimate
stopping point if energy runs out.

### M3 — Accounts, sync, sharing
- Google + magic-link auth
- Cloud sync, conflict-free merge, real sync indicator, `host_last_synced_at`
- `finalize_game()` persisting snapshots; local-only games from M1/M2 upload their snapshots on
  first sign-in
- Share links: 256-bit hashed tokens in the URL fragment, 7/30-day windows, live mode (join as
  viewer) and finished mode (settlement view), revocation and rotation
- Realtime for viewers; in-app viewer list
- Hand over management, and **immediate host takeover with the sync warning**
- Join requests, host-approved either way: group members ask from the app via a slim lobby
  projection, everyone else via the share link
- Account-level default nickname, offered optionally at signup
- Claiming a guest row: host-approved, open until 2 days after the game ends
- Nicknames for registered players

### M4 — Groups, statistics, retention
- Groups (חבורה), membership, quick-add sorted by frequency
- **Group roles**: `owner` / `admin` / `member`, with `הפוך למנהל חבורה` and owner-only demotion.
  The owner is permanent — no takeover, no demotion, transfer only
- **Group membership by invite**: exact-username lookup, invitee must accept, revocable pending
  invites, leave-at-will ([03](03-data-model.md#joining-a-group))
- **Private games** — the create-page checkbox, the `is_private` filter in every group-scoped view
  and list, host-only link sharing, player-initiated invites
- Personal statistics + cumulative-net sparkline
- Group statistics and leaderboards, sample-size suppression, privacy flag
- The seven fun stats
- **`purge_expired_game_data()` live**, purged-game results cards, delete-with-stats-retained flow,
  export

Retention lands here rather than earlier because there is nothing old enough to purge until the app
has been in use for months — but the snapshot tables it depends on exist from M3, so no data is
ever lost in the meantime.

### M5 — Polish
- `wa.me` shortcuts, copy-to-clipboard everywhere
- Data export refinements
- Duplicate-last-game
- Nickname pre-fill from the player's most recent nickname in the group
- ⓘ explainers across the ten controls listed in [04](04-ux-spec.md#-explainers)

### Planned, after v1

Both are specified in [01 §10](01-product-spec.md#10-planned-not-in-v1) and have schema reserved for
them in [03](03-data-model.md#reserved-for-planned-features), so neither needs a migration of
existing games.

- **Locations** — attachable at creation, during a game, and after it's finished, with the group's
  five most-played places as quick picks.
- **Scheduled games** — a future game with date, time, location and invited players; RSVPs;
  per-invitee expected arrival times, with late arrivals shown differently in the plan; and
  `התחל משחק` on the day, picking who's actually starting. A planned game is the same row in an
  earlier status, so starting it is a status transition — it reuses the existing game path rather
  than forking it, and `expected_arrival_at` feeds the `joined_at` that profit-per-hour already
  uses.

### Explicitly deferred
Non-standard / half buy-ins · multi-currency UI · push notifications · native wrapper · tournament
mode · blind timer · chip denomination entry · additional languages beyond the plumbing

Dropped for good, not deferred: **"mark as paid"** on transfers, and **moving a buy-in from one
player to another** — undo and `−`/`+` cover it without adding a second way to change someone's
money. Non-host editing is not deferred either: writes are host-only by design.

## Testing

| Layer | Tool | What |
|---|---|---|
| Money math | Vitest | Minor-unit arithmetic, chip conversion, rounding residue, per-currency formatting |
| Settlement | Vitest + fast-check | The property invariants in [05](05-settlement.md#invariants-the-tests-must-assert), property-based over random games; plus your worked 4-player example as a fixture |
| Shared costs | Vitest | Splits sum to the cost; adding costs never breaks the settlement balance |
| Event fold | Vitest | State from events matches the cached columns; undo restores exactly |
| Offline sync | Vitest | Duplicate `client_event_id` is a no-op; out-of-order arrival converges; **events pushed by a deposed host are still accepted** |
| Snapshots & retention | SQL + Vitest | `finalize_game` is idempotent across reopen/re-end; **statistics are byte-identical before and after `purge_expired_game_data()` and after an explicit game deletion**; purge refuses to run without a snapshot |
| Private games | SQL | **Every group-scoped view and list excludes `is_private`**, still excludes it after the live rows are purged, and personal statistics still include it; `create_share_link` rejects a non-host on a private game |
| Claims | SQL | A claim outside the window is rejected; only the host may decide; an approved claim changes `user_id` and nothing else on `player_results`; two people cannot both own one row |
| Statistics | Vitest | Hand-computed fixtures, especially the win-rate zero-exclusion and profit-per-hour with late joiners |
| RLS | SQL test suite | Each role against each table, including both anonymous share paths — **a non-host cannot write, a revoked or expired token returns nothing, the 7-day window applies to non-members and the 30-day one to members, someone not in the game cannot take over host, nobody can insert into the snapshot tables, and every rejection returns the same generic shape** |
| Group membership | SQL | **No membership row can be created without an accepted invite**; only the invitee may accept; **no path demotes or removes the owner**; `find_user_by_username` returns nothing on a partial match |
| Flow | Playwright | One full game: create → 4 players → buy-ins → shared cost → settle → end → transfers → share text |
| i18n | Lint + snapshot | No literal user-facing strings; every screen renders with a pseudo-locale that is LTR and 40% longer, to catch RTL and truncation assumptions early |
| Devices | Manual | iOS Safari and Android Chrome, installed and in-browser, in airplane mode |

The settlement module is the one place where a bug costs real money and real friendships. It should
be pure, dependency-free, and over-tested. The purge function is the one place where a bug is
irreversible — it deletes rows nobody can get back — so it gets the same treatment.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase project pauses | App appears broken on game night | Keep-alive cron in M0; a paused project also resumes in ~1 min |
| **Purge deletes something statistics needed** | Silent, permanent data loss | Purge refuses to run without a snapshot; a test asserts statistics are unchanged across a purge; the cron logs deleted row counts so anomalies are visible |
| Supabase changes its free tier | Migration needed | Repository layer isolates data access; Firebase is the documented fallback |
| iOS clears IndexedDB | Unsynced local game lost | Sync eagerly, warn on unsynced data, prompt Home Screen install |
| Settlement bug | Someone pays the wrong amount | Property-based tests; the balance banner and per-player over/under column make errors visible before anyone sends money |
| **Host takeover used carelessly** | Confusion over who's in control mid-game | The sync warning, a prominent log entry, and an announcement banner to everyone with the game open; late events from the old host are still merged, so nothing is lost |
| Bidi rendering bugs in shared text | Looks unprofessional, amounts misread | Single `<Money>` component, LRI/PDI in exported text, test on real WhatsApp |
| Scope creep from the statistics page | v1 never ships | Statistics are M4; M2 is a complete product without them |
| Nobody uses it because the host has to be on their phone all night | The real product risk | M1's one-tap buy-in is the entire answer; validate it at a real game before M2 |

## Definition of done for v1

- A full game can be run start to finish, offline, on a phone, in Hebrew
- Buy-ins take one tap and are reversible, and the undo says how many chips and how much money
  changed
- The pot banner catches a miscount before the end of the game
- Settlement produces the minimum number of transfers and can be corrected by hand
- A dead host phone never blocks the game
- The summary pastes cleanly into WhatsApp on both iOS and Android
- Deleting a game keeps every statistic intact
- No amount anywhere renders backwards
