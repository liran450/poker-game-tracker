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
The most common data-entry error at a real table is tapping `+` on the wrong row. `בטל` in the
snackbar covers it if noticed immediately; `−` on the wrong player and `+` on the right one covers
it later. A dedicated "move this buy-in" action was considered and rejected — it's a third way to
change someone's money, reachable from a menu anyone holding the passed-around phone can open, to
save one tap.
→ [04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)

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
composed names like `הכריש (מור לוי)` enter the mix.
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
| **Group members can request to join from the app; outsiders only via a link. The host approves either way** | One `join_requests` table, two entry paths, one approval gate. A slim `get_group_live_games()` projection lets members see a game exists without reading it → [03](03-data-model.md#two-paths-in-one-gate), [04](04-ux-spec.md#the-viewers-experience) |
| **A link expiring on a live game needs no special handling** | The link dies; the host issues a new one in one tap → [03](03-data-model.md#link-lifetime) |
| **No "move a buy-in to another player"** | Removed from the row action sheet. Undo, or `−` then `+`. Undo now explicitly covers decrements too → [04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app) |
| **[my call] Undone actions stay in the log** | A log that can be silently rewritten by add-then-undo can't settle the argument it exists for. Rendered as one struck-through line with a `בוטל` chip, hidden behind a filter → [03](03-data-model.md#undo-and-whether-an-undone-action-stays-in-the-log) |
| **[my call] Copy buttons** | The share sheet is enough for the live game — but inside it `העתק` is a peer of `שתף`, not a fallback. The settlement screen gets its own `העתק העברות` button, because that text gets pasted repeatedly → [04](04-ux-spec.md#sharing-5-14) |
| **Claiming a guest row, narrowed** | Group members or anyone who arrived via the share link may claim one specific guest row; the host approves; open until 2 days after the game ends. Changes attribution, never amounts → [03](03-data-model.md#player_claims-21) |
| **Private games** | One rule: excluded from every group-scoped figure and list, always counted in personal statistics. Host-only link sharing; any current player may invite a group member → [01 §6.7](01-product-spec.md#67-private-games), [03](03-data-model.md#private-games) |
| **ⓘ on ambiguous controls** | A standard affordance for *second-order consequences* only, on ten named controls, starting with the private-game checkbox → [04](04-ux-spec.md#-explainers) |
| **Locations — planned** | Attachable at creation, during, and after a game; five most-played places as quick picks. Schema reserved → [01 §10](01-product-spec.md#10-planned-not-in-v1) |
| **Scheduled games — planned** | Date, time, location, invitees, RSVPs, per-person expected arrival times, and `התחל משחק` on the day. A planned game is the same row in an earlier status, so starting it is a transition rather than a copy → [01 §10](01-product-spec.md#10-planned-not-in-v1) |
| **Multi-select add-players sheet** | Tap to select, not to commit; a `נבחרו (N)` tray; labelled `◈ חברי החבורה` / `חברים נוספים` sections visible before any tap; capped-height scroll with fixed tray and footer; typed names join the same batch via `+ לרשימה` → [04](04-ux-spec.md#adding-players--the-multi-select-sheet) |
| **Adding to a game never adds to the group** | Stated in the sheet spec and in the roles section; they are separate acts with different consequences → [01 §4](01-product-spec.md#4-roles-and-permissions) |
| **A group admin tier** | `group_members.role` gains `admin`: manage roster and settings, promote members. Demotion and deletion stay owner-only → [03](03-data-model.md#group-roles) |
| **Account-level default nickname** | `profiles.default_nickname`, offered at signup. Pre-fill chain: last nickname in this group → account default → nothing → [03](03-data-model.md#naming-and-nicknames) |
| **Show the account name beside the nickname** | Composed as `nickname (account name)` — `הכריש (מור לוי)`. `username` moves to profile/admin screens and to tie-breaking identical display names → [03](03-data-model.md#naming-and-nicknames) |
| **Generic `שיתוף`, not `שתף בוואטסאפ`** | The button opens the OS share sheet; naming one app promises something it doesn't do. WhatsApp stays named only on the per-person `wa.me` payment shortcut → [07](07-hebrew-glossary.md#two-words-that-must-never-be-shortened) |

---

# Part C — Still open

One gap, newly surfaced by the add-players work.

## C1
**The group screen's "add member" flow is unspecified.**

The in-game add-players sheet is fully designed. Adding someone to the *group* is a different action
with heavier consequences — it grants access to group statistics and the standing ability to seize a
host role — so it should not simply reuse that sheet with a different verb.

Recommendation, for whoever picks it up: a group member is added by **invite**, not by being typed
into a list. Reuse the existing `groups.invite_token` link, plus a search by username for people who
already have accounts, and require the new member to accept. That keeps group membership something
people opt into rather than something done to them, which matters because membership is what the
host-takeover rule keys off.

Everything else raised across five review rounds has been answered.

---

## Decided and closed

The full record, so none of this gets reopened by accident.

**Permissions**
- Host-only editing — permanent, not deferred. Exactly one host at a time.
- Group roles are `owner` / `admin` / `member`; a group admin has no power inside any game.
- Adding someone to a game never adds them to the group.
- Host takeover is instant for any group member, announced to everyone with the game open, logged.
- Nobody joins a game without the host approving. Group members ask from the app; everyone else asks
  through the share link.
- On a private game, any current player can invite a group member, but only the host can share a
  link.
- A guest row can be claimed by a group member or a link visitor, host-approved, until 2 days after
  the game ends.

**Data**
- Retention: 30 days for the activity log, 90 for full detail, forever for results.
- Deleting a game keeps its statistics.
- Statistics never cross a group, and never include a private game in a group figure.
- A claim is the only field ever mutable after finalisation, and only `user_id`, only in the window.
- Shared costs appear as a single amount, never itemised.
- Currency is a display label, never converted.

**Sharing**
- 256-bit tokens, stored hashed, carried in the URL fragment.
- 7 days outside the group, 30 days inside. Revocable and rotatable.
- An expired link on a live game needs no special handling — issue a new one.
- Live link opens the game read-only; a finished game's link shows the settlement only.
- Copy is a peer of share in the share sheet, and its own button on the settlement screen.

**Interaction**
- Buy-ins: one tap, optimistic, with a coalescing undo that reports buy-ins, chips and money.
- Undo covers decrements as well as increments.
- No "move a buy-in to another player" — undo, or `−` then `+`.
- Undone actions stay in the log, struck through and hidden behind a filter.
- ⓘ explainers on ten controls, for second-order consequences only.
- Nicknames: per game, pre-filled from the group.

**Not in v1**
- Non-standard buy-in amounts — deferred, column reserved.
- Chip denomination entry — deferred.
- Multi-currency UI — deferred.
- Locations and scheduled games — planned, schema reserved
  ([01 §10](01-product-spec.md#10-planned-not-in-v1)).
- "Mark as paid" on transfers — dropped for good.
