# 08 — Gaps, Decisions, and Open Questions

Part A: things missing from the original brief that are now in the plan.
Part B: decisions you've since made, and where each one landed.
Part C: what's still open.

---

# Part A — Added to the plan

Ordered roughly by how much trouble each would have caused if discovered during implementation
instead of now.

### A1. Offline-first operation 🔴 critical
Home poker games have bad Wi-Fi, and phones drop to no signal in a basement. Nothing in the brief
addressed it, but an app that stalls when the router hiccups is worse than the napkin it replaces.
The whole architecture bends around this: local-first state, an outbox, idempotent event pushes.
→ [02](02-architecture.md#offline-first)

### A2. Concurrent edits 🔴 critical
The host's phone gets passed around, or control moves mid-game while someone else has the game
open. "Set buy count = 3" from two devices silently loses data; "+1 buy-in" from two devices does
not. Hence the append-only event log, which also gives you the audit trail (#22) for free — and is
what makes an immediate host takeover safe. → [03](03-data-model.md#event-sourcing)

### A3. Supabase free projects pause after 7 days idle 🔴 critical
Discovered the night of a game, this looks exactly like "the app is broken". A GitHub Actions cron
prevents it entirely, and the same cron now also runs the retention purge. Must exist in milestone
0. → [02](02-architecture.md#database-choice)

### A4. Rounding and non-integer chip values
₪50 / 100 chips is clean. ₪50 / 150 chips is ₪0.333 per chip, and the transfers won't sum to zero
unless rounding is handled deliberately. Integer minor units throughout, residue assigned to the
largest balance, optional whole-shekel rounding for transfers.
→ [05](05-settlement.md#rounding-and-precision)

### A5. Misattributed buy-ins
The most common data-entry error at a real table is tapping `+` on the wrong row. Undo covers it if
noticed immediately; `העברת קנייה לשחקן אחר` in the row action sheet covers it if noticed an hour
later. → [04](04-ux-spec.md#row-action-sheet)

### A6. Late joiners and per-hour statistics
"Profit per hour" (#24) is meaningless if someone who played the last 40 minutes is measured
against a 5-hour session. Per-player join and leave times, carried into the permanent snapshot.
→ [06](06-statistics.md#personal-statistics-12)

### A7. Screen wake lock
The host's phone locking every 30 seconds while they're tracking buy-ins is genuinely infuriating.
One Screen Wake Lock API call while a game is active.
→ [04](04-ux-spec.md#cross-cutting-interaction-rules)

### A8. Share-link security and revocation
The link must be unguessable, revocable, expiring, and grant read-only access without exposing the
underlying tables. A 256-bit token stored only as a hash, carried in the URL fragment, plus a
`SECURITY DEFINER` RPC — not a permissive policy.
→ [03](03-data-model.md#link-security)

### A9. Bit / PayBox deep links don't exist as a public API
Requirement #23 can't be built as described. What can be built — `wa.me` pre-filled messages and
copy-to-clipboard everywhere — delivers most of the value.
→ [05](05-settlement.md#payment-links--reality-check-23)

### A10. Red/green as the only signal
Requirement #16's red/green row colouring is invisible to roughly 8% of men, and unreadable on a
dimmed screen in a dark room. Every colour signal is paired with a sign, icon or number.
→ [04](04-ux-spec.md#accessibility)

### A11. Number bidi bugs
`₪80-` renders wrong in Hebrew. One `<Money>` component, LTR isolation everywhere, LRI/PDI marks in
exported text. The most likely bug to ship unnoticed and look sloppy — and it gets worse once
composed names like `הכריש (mor_l)` enter the mix.
→ [07](07-hebrew-glossary.md#bidi-rules-for-text--read-this-before-writing-any-string)

### A12. Long-press is undiscoverable
Requirement #15's long-press menu is the right interaction, but nobody will find it. Every row also
gets a visible `⋯`, plus a one-time coach mark. → [04](04-ux-spec.md#row-action-sheet)

### A13. Sanity checks on chip entry
Warn when a settle entry exceeds the chips actually in play, or when settled chips already exceed
total buy-ins. Catches the fat-finger `1200` instead of `120` before it becomes a 🔴 banner nobody
can explain. → [01 §6.3](01-product-spec.md#63-settling-a-player-15)

### A14. iOS PWA storage eviction
Safari can clear IndexedDB after ~7 days if the site isn't installed to the Home Screen. Sync
eagerly, warn about unsynced data, and prompt for Home Screen install after the first completed
game. → [02](02-architecture.md#what-pwa-costs-us-on-ios)

### A15. "Duplicate last game"
After the third session the fastest path is "same people, same stakes, go". One button on the home
screen; it will become the most-used entry point. → [04](04-ux-spec.md#new-game--setup)

### A16. Data export
It's other people's money. CSV/JSON export of a game and of all history costs an afternoon, buys
trust, and matters more now that data is purged on a schedule — export is offered in the delete
confirmation and before the first automatic purge.
→ [03](03-data-model.md#retention-and-archiving)

### A17. Soft delete and log immutability
Removing a player must not erase history — soft-deleted, excluded from math, retained in the log.
`game_events` is insert-only for everyone including the host; undo appends an inverse event. Only
the purge function may delete. → [03](03-data-model.md#game_events)

### A18. Empty, loading and error states for every screen
The brief describes the happy path. A game with zero players, a revoked share link, a purged game,
a stats page with one game, a settlement where everyone broke even — each needs a designed state.
Listed for the design pass in [10](10-design-brief.md#states-to-design-not-just-the-happy-path).

---

# Part B — Your decisions, and where they landed

| Your call | Where it's specified |
|---|---|
| **Detailed game data expires; aggregates kept forever, even for deleted games** | Three-tier retention: snapshots forever, full detail **90 days**, activity log **30 days**. Statistics read only from the permanent snapshots, so purging and deletion can never change a number. Purge runs on the existing cron → [03](03-data-model.md#retention-and-archiving), [01 §8](01-product-spec.md#8-data-retention) |
| **Exactly one host** | Stated as a hard rule; the co-host idea is dropped → [01 §4](01-product-spec.md#4-roles-and-permissions) |
| **Host can be seized immediately by a signed-in group member — no 24h wait** | `take_over_host` RPC authorised by group membership, no time gate → [03](03-data-model.md#host-takeover) |
| **Warn about sync state on takeover** | A modal showing the outgoing host's last sync time, with the copy hardening as the data gets staler → [04](04-ux-spec.md#host-takeover-warning) |
| **Persistent sync indicator in the top corner** | Four states, expandable, on every screen that touches game data → [04](04-ux-spec.md#sync-indicator) |
| **English and other languages later** | Real i18n library from day one, direction derived from locale, no string concatenation, `Intl` for money and dates → [02](02-architecture.md#internationalisation) |
| **Renaming: nickname `(username)` for accounts, free rename for guests** | Composed display name; the account identity is never overwritten → [03](03-data-model.md#naming-and-nicknames), [04](04-ux-spec.md#renaming-a-player) |
| **Drop "mark as paid" and the reliability stat** | Removed from the schema, the settlement screen and the statistics list, with the reasoning recorded so it doesn't get re-proposed → [05](05-settlement.md#payment-links--reality-check-23), [06](06-statistics.md#fun-statistics) |
| **Undo snackbar shows chips and money, and lists every changed row** | Single-row and multi-row forms, both showing buy-ins, chips and money → [04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app) |
| **Speak in the currency, not in agorot** | All columns renamed to a neutral `_minor` suffix, and a rule that no user-facing text ever names the minor unit → [03](03-data-model.md#money-representation), [07](07-hebrew-glossary.md#formatting-conventions) |
| **Fun stats: היריב/הספונסר, התורם, הברזל, רצף חם/קר, מגנט ז'יטונים, המכונה, הקאמבק** | Exactly those seven; the rest cut → [06](06-statistics.md#fun-statistics) |
| **Groups are right, and stats never cross groups** | Group scoping is now a hard rule rather than a recommendation → [06](06-statistics.md#scoping) |
| **Add shared costs** | Full spec: costs, payers, equal or custom splits, kept out of poker statistics → [05](05-settlement.md#shared-costs), [04](04-ux-spec.md#shared-costs) |
| **Other currencies later** | Currency stored per game and group, `Intl` formatting, per-currency stats that are never summed together → [03](03-data-model.md#money-representation), [06](06-statistics.md#scoping) |
| **Share link joins a live game; shows settlement only when finished** | Two RPCs, two viewer experiences, and link copy that changes with the game's state → [03](03-data-model.md#share_links-5), [04](04-ux-spec.md#the-viewers-experience) |
| **Half buys / odd rates: valid but deferred** | Column reserved in the schema, out of v1, listed under deferred work → [01 §7](01-product-spec.md#7-whats-deliberately-not-in-v1) |
| **Cash paid editable directly on the row** | Tappable `💵` figure on the row with a quick-amount sheet, no menu → [04](04-ux-spec.md#player-row-anatomy) |
| **Only the manager can edit** | Host-only writes are now permanent, not a v1 simplification. Two narrow audited exceptions: the takeover RPC and a join request, which creates nothing until approved → [03](03-data-model.md#row-level-security) |
| **Nobody opens a game from last year — the results card is enough** | Retention windows cut: full detail 90 days, activity log 30 days. Share links expire well before the data does → [03](03-data-model.md#retention-and-archiving) |
| **Nickname pre-fill logic accepted** | Stored per game, pre-filled from that person's most recent nickname in the same group → [03](03-data-model.md#naming-and-nicknames) |
| **A guest can only ask to join; the host approves** | The "claim profile" feature is removed. `join_requests` replaces `guest_claims`, and guest results never merge into a later account → [03](03-data-model.md#join_requests-21) |
| **Announce and log a host takeover** | A banner to every device with the game open, alongside the log entry → [04](04-ux-spec.md#host-takeover-warning) |
| **Shared costs as a plain amount in personal stats** | One figure, not itemised — "you've put ₪340 into shared costs", never what it was spent on → [06](06-statistics.md#personal-statistics-12) |
| **Currency is semantics only; no conversion** | Changing a currency re-labels amounts and never converts them. Statistics sum raw numbers and note when a group's history spans more than one label → [03](03-data-model.md#money-representation) |
| **Chip denominations later, not now** | Moved to deferred → [09](09-roadmap.md#explicitly-deferred) |
| **Link security and expiry** | 256-bit token, stored only as a SHA-256 hash, carried in the URL fragment so it never reaches a server log. 7 days for anyone outside the group, 30 days for group members, one link for both → [03](03-data-model.md#link-security) |

---

# Part C — Still open

Everything raised in earlier rounds has now been decided. Two things remain, both of them
consequences of the newest decisions rather than leftovers.

## Q1
**Should a guest's join request be possible on a game with no share link out?**

A join request currently arrives through the share link, which is the only way someone outside the
game reaches it. That means a host who never shares a link can only add players manually — which is
probably correct, and certainly simpler. The alternative is letting group members request to join
any of the group's live games from their own app. Recommendation: leave it link-only for v1; add
the in-app path if people ask.

## Q2
**Does anything need to happen when a share link expires while a game is still live?**

A 7-day window is far longer than a poker night, so in practice a link expires long after the game
ends. The only odd case is a game left open for over a week. Recommendation: nothing special — the
link dies, the host can issue a new one in one tap.

---

## Decided and closed

For the record, so these don't get reopened by accident:

- Host-only editing — permanent, not deferred.
- Retention: 30 days for the activity log, 90 for full detail, forever for results.
- Nicknames: per game, pre-filled from the group.
- Guests: request to join, host approves, no retroactive profile claiming.
- Host takeover: instant, announced to everyone, logged.
- Shared costs: a single amount in statistics, never itemised.
- Currency: a label, never converted.
- Chip denominations: later.
- Share links: hashed 256-bit tokens in the URL fragment, 7 days outside the group, 30 inside.
- No "mark as paid" on transfers.
- Statistics never cross a group.
- Non-standard buy-in amounts: deferred, column reserved.
