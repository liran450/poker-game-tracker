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
The link must be unguessable, revocable, optionally expiring, and grant read-only access without
exposing the underlying tables. A random token plus a `SECURITY DEFINER` RPC, not a permissive
policy. → [03](03-data-model.md#anonymous-share-access)

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
| **Detailed game data expires; aggregates kept forever, even for deleted games** | Three-tier retention: snapshots forever, full detail 12 months, activity log 90 days. Statistics read only from the permanent snapshots, so purging and deletion can never change a number. Purge runs on the existing cron → [03](03-data-model.md#retention-and-archiving), [01 §8](01-product-spec.md#8-data-retention) |
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

---

# Part C — Still open

## Q1
**Can non-host players write, or is the host the only editor?** *(carried over — still unanswered)*

Requirement #5 says other players "can view but not edit", which the plan implements literally. The
obvious middle ground is letting each player tap `+` on *their own* row, removing the bottleneck of
everyone shouting at the host.

My recommendation stands: build host-only first, add self-service in v2 as a per-game toggle
(`שחקנים יכולים להוסיף קניות בעצמם`). Deciding now matters because it shapes the write policies.

## Q2
**Are the retention windows right?**

The plan uses 90 days for the activity log and 12 months for full game detail, both arbitrary but
defensible. Worth sanity-checking against how you actually use old games: do you ever open a game
from last year, or is the results card enough after a month? Shorter windows are strictly better
for the free tier.

Related: should the app **email or notify before the first purge**, or is the export button enough?
The plan assumes the latter, since a notification about data deletion is alarming out of proportion
to what's being deleted.

## Q3
**Is a nickname per game, or per group?**

Currently per game — you nickname `מור` as `הכריש` in tonight's game and it doesn't stick. Per group
would mean setting it once, which is probably what people want, at the cost of one more table.
Recommendation: keep per-game storage, but pre-fill from the person's most recent nickname in that
group. Cheap, and behaves like a persistent nickname without being one.

## Q4
**Who approves a guest claim if the host is gone or the game is purged?**

Approval is host-confirmed today. For a game whose host has left the group, or whose details have
been purged, there's no obvious approver. Options: any group owner can approve; or claims older
than N days can be approved by any two group members. Needs a rule before the claim flow ships.

## Q5
**Should a takeover be announced to everyone, or only to the outgoing host?**

The plan tells the outgoing host and writes it to the log. Announcing it to all viewers is more
transparent and makes abuse socially expensive — relevant because a takeover is now instant and
ungated, so the only real guardrail is visibility. Recommendation: announce it in the game, not
just the log.

## Q6
**Do shared costs belong in personal statistics at all?**

They're tracked separately and never inside poker net, which is certainly right. But should
`הוצאות משותפות` appear as its own personal stat ("you've spent ₪340 on pizza this year"), or stay
purely a settlement mechanic? The plan includes the stat; it's easy to drop.

## Q7
**What happens if a group changes currency?**

Historical results keep their original currency, and statistics report per currency without
summing. That's correct but could look odd. Alternative: lock a group's currency permanently once
it has a finished game. Recommendation: lock it, and let people make a new group if they really
need to switch.

## Q8
**Chip denominations?**

Some tables count chips by colour (5 black × 25 + 3 red × 10 …). A small denomination calculator in
the settle sheet would be faster and less error-prone at 2am, but it's a real chunk of UI. Does your
table use multiple colours? Still unanswered from last round.

## Q9
**How long should a share link live by default?**

Forever until revoked (current default), 24h after the game ends, or 7 days. Now that a finished
game's link becomes a settlement view, "forever" is more defensible — people do look back at who
paid whom.
