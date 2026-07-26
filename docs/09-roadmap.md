# 09 — Roadmap, Testing, Risks

## Sequencing principle

Build the thing that replaces the napkin first. A host who can track buy-ins and settle the night
correctly, offline, alone, already has a useful app — everything else (accounts, sharing,
statistics) is amplification. So the first milestone deliberately ships without sign-in.

## Milestones

### M0 — Foundations
*Nothing user-visible. Do not skip; every item here is expensive to retrofit.*

- Vite + React + TS + Tailwind with RTL logical properties, `dir="rtl"`, self-hosted Hebrew font
- `<Money>` component and the agorot arithmetic module, with tests
- Supabase project, first migration, **RLS on by default**, CI check that fails if any table has
  RLS off
- GitHub Actions: build → Pages deploy, plus the **keep-alive cron**
  ([02](02-architecture.md#database-choice))
- PWA shell: service worker, manifest, install prompt, offline page
- `he.ts` string file wired up; no hardcoded strings allowed from day one

### M1 — The napkin replacement 🎯
*The first genuinely usable build. Local-only, no account required.*

- Create a game: buy amount, chips per buy, derived chip value
- Player list: add, rename, inline edit, `(1)` deduping
- **Buy-in counter with coalescing undo** ([04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app))
- Settle a player, gray out, reopen
- Cash paid at the table
- Pot verification banner
- Full offline operation, IndexedDB persistence, wake lock
- Event log powering the audit drawer

**Test it at a real game before building anything else.** Everything after this point is guesswork
until M1 has survived one Thursday night.

### M2 — Settlement
- Net calculation, pot as a settlement node
- Minimum-transfer algorithm: exact-pair cancellation → bitmask DP → greedy fallback
- Slide-to-confirm end game, missing-players check, discrepancy resolution
- Edit mode: chip picker, per-player over/under column, balance banner, colour + sign
- Share as text, both templates
- Reopen within 24h

At the end of M2 the app is complete for a single host with no account. This is a legitimate
stopping point if energy runs out.

### M3 — Accounts and sharing
- Google + magic-link auth
- Cloud sync, conflict-free merge, sync indicator
- Share links (token, revoke, read-only RPC), realtime for viewers
- In-app viewer list
- Hand over management, abandoned-game takeover
- Guests + claim flow

### M4 — Groups and statistics
- Groups (חבורה), membership, quick-add sorted by frequency
- Personal statistics + cumulative-net sparkline
- Group statistics and leaderboards
- Sample-size suppression, privacy flag

### M5 — Polish
- `wa.me` payment shortcuts, copy-to-clipboard, "paid" checkboxes
- Fun statistics (pick ~6)
- Data export
- Duplicate-last-game
- Denomination calculator, shared costs — if [Q5](08-gaps-and-open-questions.md#q5) /
  [Q6](08-gaps-and-open-questions.md#q6) come back yes

### Explicitly deferred
Push notifications · native wrapper · multi-currency · tournament mode · blind timer ·
self-service buy-ins ([Q1](08-gaps-and-open-questions.md#q1)) · English localisation

## Testing

| Layer | Tool | What |
|---|---|---|
| Money math | Vitest | Agorot arithmetic, chip conversion, rounding residue |
| Settlement | Vitest + fast-check | The property invariants in [05](05-settlement.md#invariants-the-tests-must-assert), property-based over random games; plus your worked 4-player example as a fixture |
| Event fold | Vitest | State from events matches the cached columns; undo restores exactly |
| Offline sync | Vitest | Duplicate `client_event_id` is a no-op; out-of-order arrival converges |
| Statistics | Vitest | Hand-computed fixtures, especially the win-rate zero-exclusion and per-hour with late joiners |
| RLS | SQL test suite | Each role against each table, including the anonymous share path — **test that a non-host cannot write and that a revoked token returns nothing** |
| Flow | Playwright | One full game: create → 4 players → buy-ins → settle → end → transfers → share text |
| RTL | Manual + snapshot | Every screen at 200% text scale; verify no raw `left`/`right` in the CSS output |
| Devices | Manual | iOS Safari and Android Chrome, installed and in-browser, in airplane mode |

The settlement module is the one place where a bug costs real money and real friendships. It
should be pure, dependency-free, and over-tested.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase project pauses | App appears broken on game night | Keep-alive cron in M0; a paused project also resumes in ~1 min |
| Supabase changes its free tier | Migration needed | Repository layer isolates data access; Firebase is the documented fallback |
| iOS clears IndexedDB | Unsynced local game lost | Sync eagerly, warn on unsynced data, prompt Home Screen install |
| Settlement bug | Someone pays the wrong amount | Property-based tests; the balance banner and per-player over/under column make errors visible before anyone sends money |
| Bidi rendering bugs in shared text | Looks unprofessional, amounts misread | Single `<Money>` component, LRI/PDI in exported text, test on real WhatsApp |
| Scope creep from the statistics page | v1 never ships | Statistics are M4; M2 is a complete product without them |
| Nobody uses it because the host has to be on their phone all night | The real product risk | M1's one-tap buy-in is the entire answer; validate it at a real game before M2 |

## Definition of done for v1

- A full game can be run start to finish, offline, on a phone, in Hebrew
- Buy-ins take one tap and are reversible
- The pot banner catches a miscount before the end of the game
- Settlement produces the minimum number of transfers and can be corrected by hand
- The summary pastes cleanly into WhatsApp on both iOS and Android
- No amount anywhere renders backwards
