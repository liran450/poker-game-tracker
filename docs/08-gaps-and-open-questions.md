# 08 — Gaps, Additions, and Open Questions

You asked me to think of what you might have missed. Part A is things I've already folded into
the plan. Part B is decisions only you can make.

---

# Part A — Added to the plan

Ordered roughly by how much trouble each would have caused if it were discovered during
implementation instead of now.

### A1. Offline-first operation 🔴 critical
Home poker games have bad Wi-Fi, and phones drop to no signal in a basement. Nothing in the brief
addresses it, but an app that stalls when the router hiccups is worse than the napkin it replaces.
The whole architecture bends around this: local-first state, an outbox, idempotent event pushes.
→ [02](02-architecture.md#offline-first)

### A2. Concurrent edits 🔴 critical
The host's phone gets passed around, or the host hands over management mid-game while someone
else has the game open. "Set buy count = 3" from two devices silently loses data; "+1 buy-in"
from two devices does not. Hence the append-only event log, which also gives you the audit trail
you asked for in #22 for free. → [03](03-data-model.md#event-sourcing)

### A3. Supabase free projects pause after 7 days idle 🔴 critical
Discovered the night of a game, this looks exactly like "the app is broken". A three-line GitHub
Actions cron prevents it entirely. Must be set up in milestone 0.
→ [02](02-architecture.md#database-choice)

### A4. Rounding and non-integer chip values
₪50 / 100 chips is clean. ₪50 / 150 chips is ₪0.333 per chip, and then the transfers don't sum to
zero unless rounding is handled deliberately. All money in integer agorot, residue assigned to
the largest balance, optional whole-shekel rounding for transfers.
→ [05](05-settlement.md#rounding-and-precision)

### A5. The host disappears
Requirement #6 lets the host hand over management, but not what happens when the host goes home
with an open game, or their battery dies. Added: any registered player in the game can claim host
after 24h of host inactivity. → [01 §4](01-product-spec.md#4-roles-and-permissions)

### A6. Misattributed buy-ins
The single most common data-entry error at a real table is tapping `+` on the wrong row. Undo
covers it if noticed immediately; `העברת קנייה לשחקן אחר` in the row action sheet covers it if
noticed an hour later. → [01 §6.2](01-product-spec.md#62-the-player-list-2-9-14-15)

### A7. Non-standard buy-ins
Someone buys in for ₪25, or tops up ₪30 mid-hand. A pure counter can't express it. Added
`קנייה בסכום אחר` as an escape hatch, stored separately so it doesn't corrupt the "buys count"
statistics. → [03](03-data-model.md#game_players)

### A8. Late joiners and per-hour statistics
"Profit per hour" (#24) is meaningless if someone who played the last 40 minutes is measured
against the full 5-hour session. `joined_at` per player row, `left_at` on settle.
→ [06](06-statistics.md#personal-statistics-12)

### A9. Screen wake lock
The host's phone locking every 30 seconds while they're tracking buy-ins is genuinely
infuriating. One Screen Wake Lock API call while a game is active.
→ [04](04-ux-spec.md#cross-cutting-interaction-rules)

### A10. Share-link security and revocation
"Share by link" (#5) needs the link to be unguessable, revocable, optionally expiring, and to
grant read-only access without exposing the underlying tables. Handled with a random token and a
`SECURITY DEFINER` RPC rather than a permissive RLS policy.
→ [03](03-data-model.md#row-level-security)

### A11. Statistics privacy
See [Q2](#q2) below — flagged rather than silently decided, but the plan defaults to group-scoped.

### A12. Bit / PayBox deep links don't exist as a public API
Requirement #23 can't be built as described. What can be built — `wa.me` pre-filled messages,
copy-to-clipboard everywhere, and a "paid" checkbox — delivers most of the value.
→ [05](05-settlement.md#payment-links--reality-check-23)

### A13. Red/green as the only signal
Requirement #16's red/green row colouring is invisible to roughly 8% of men (and this app's
users are mostly men, at night, on dimmed screens). Every colour signal is paired with a sign,
icon or number. → [04](04-ux-spec.md#accessibility)

### A14. Number bidi bugs
`₪80-` renders wrong in Hebrew. One `<Money>` component, LTR isolation everywhere, LRI/PDI marks
in exported text. This is the most likely bug to ship unnoticed and look sloppy.
→ [07](07-hebrew-glossary.md#bidi-rules-for-text--read-this-before-writing-any-string)

### A15. Long-press is undiscoverable
Requirement #15's long-press menu is the right interaction, but nobody will find it. Every row
also gets a visible `⋯`, plus a one-time coach mark.
→ [04](04-ux-spec.md#row-action-sheet)

### A16. Sanity checks on chip entry
Warn when a settle entry exceeds the chips actually in play, or when settled chips already exceed
total buy-ins. Catches the fat-finger `1200` instead of `120` before it becomes a 🔴 banner nobody
can explain. → [01 §6.3](01-product-spec.md#63-settling-a-player-15)

### A17. iOS PWA storage eviction
Safari can clear IndexedDB after ~7 days if the site isn't installed to the Home Screen. Sync
eagerly and warn about unsynced data rather than treating local storage as durable.
→ [02](02-architecture.md#what-pwa-costs-us-on-ios)

### A18. "Duplicate last game"
After the third session, the fastest path is "same people, same stakes, go". One button on the
home screen; it will become the most-used entry point.
→ [04](04-ux-spec.md#new-game--setup)

### A19. Data export
It's other people's money. A CSV/JSON export of a game and of all history costs an afternoon and
buys trust, plus an escape route if you ever migrate off Supabase.

### A20. Soft delete and log immutability
Removing a player must not erase history — `is_removed`, excluded from math, retained in the log.
`game_events` is insert-only for everyone including the host; undo appends an inverse event.
→ [03](03-data-model.md#game_events)

### A21. Shared costs (pizza, tips)
Extremely common in home games and completely absent from the brief: ₪120 of pizza split six
ways, settled alongside the poker money. Schema has `shared_costs_agorot`; whether to build the
UI is [Q5](#q5).

### A22. Empty, loading and error states for every screen
The brief describes the happy path. A game with zero players, a shared link that's been revoked,
a stats page with one game, a settlement where everyone broke even — each needs a designed state.
Listed for the design pass in [10](10-design-brief.md).

---

# Part B — Decisions needed from you

## Q1
**Can non-host players write, or is the host the only editor?**

Requirement #5 says other players "can view but not edit", which I've implemented literally: the
host is the sole writer. But there's an obvious middle ground — letting each player tap `+` on
*their own* row when they buy in, which removes the bottleneck of everyone shouting at the host.

- **Host-only** (current plan): simplest RLS, one source of truth, matches your wording.
- **Self-service buy-ins**: much better at a busy table, but needs a policy allowing a write
  scoped to your own row, plus a host review affordance for disputes.

This meaningfully changes the permission model, so it's worth deciding before implementation.
My recommendation: build host-only first, add self-service in v2 as a per-game toggle
(`שחקנים יכולים להוסיף קניות בעצמם`).

## Q2
**Are statistics group-scoped or truly global?**

The plan defaults to group-scoped for the privacy reasons in
[06](06-statistics.md#scoping-and-privacy). If you genuinely want a global cross-app leaderboard,
say so — it's easy to build, but it means strangers can see your friends' gambling records, and
it's the kind of thing that's hard to walk back once people have signed up under one expectation.

## Q3
**Half buy-ins / non-standard amounts — first-class or escape hatch?**

The plan makes it an escape hatch in the action sheet ([A7](#a7-non-standard-buy-ins)). If your
table does this often, it should instead be a proper mode where the counter is replaced by an
amount field. How often does it actually happen at your table?

## Q4
**Who verifies a guest claim?**

The plan requires host approval so nobody can absorb someone else's history by signing up with
the same name. Alternative: any registered player in that game can approve, which is more
convenient and slightly less safe. Or the guest is claimed by matching a phone number the host
entered.

## Q5
**Shared costs (pizza / tips) — build it?**

Schema is ready, UI is maybe half a day. Include in v1?

## Q6
**Should the app track chip denominations?**

Some tables count chips by colour (5 black × 25 + 3 red × 10 …). A small denomination calculator
inside the settle sheet would be faster and less error-prone than mental arithmetic at 2am, but
it's a real chunk of UI. Does your table use multiple colours?

## Q7
**Multiple currencies?**

The schema carries a `currency` field, but the UI assumes ₪ throughout. Confirm ₪-only is fine
for v1.

## Q8
**Group ("חבורה") as a first-class concept — yes?**

It isn't in your brief, but it's implied by "most added players list" (#13), the friend list (#5),
and "per table" statistics (#11). It also solves the statistics privacy question. It adds one
screen and two tables. I've assumed yes throughout; say if you'd rather keep everything flat and
just derive a friend list from past games.

## Q9
**How long should a share link live by default?**

Options: forever until revoked (simplest), 24h after the game ends, or 7 days. The plan defaults
to forever-until-revoked with an optional expiry, since people look back at old games.
