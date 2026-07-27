# 01 — Product Spec

## 1. Problem

A friendly home poker game. 4–10 people. Someone buys in for ₪50, then again, then again. Someone
pays cash on the table, someone else "will settle later". At 1am everyone is tired, the chip counts
don't add up, and there's an argument about whether Mor took three buy-ins or four. Then eight
separate transfers get sent, half of them wrong.

The app replaces the napkin.

## 2. Non-goals (explicitly out of scope)

- No real money moves through the app. It computes who owes whom; humans send the money.
- Not a poker engine. No cards, no hands, no blinds, no odds.
- Not a tournament manager (no blind timer, no payout structures) in v1.
- No public/social network. The audience is a closed circle of friends.
- Not a long-term archive of every hand of every night — detailed data is deliberately discarded
  over time; see [§8 Data retention](#8-data-retention).

Worth stating in the repo: this is a bookkeeping tool for a private friendly game, not a gambling
product. Relevant if the app is ever wrapped for an app store.

## 3. Platform and languages

Hebrew-first RTL **Progressive Web App**, one build, works on Android and iPhone via the browser,
installable to the home screen. Hosted free on GitHub Pages.

**Hebrew ships first; English and other languages come later.** That is a v1 constraint on how the
code is written rather than a v1 feature: all strings live in one place, direction is derived from
the locale rather than hardcoded, and no layout assumes RTL
([02](02-architecture.md#internationalisation), [04](04-ux-spec.md#rtl-and-hebrew)).

Similarly, ₪ is the only currency in v1, but every amount is stored with its currency code and no
symbol is hardcoded, because other currencies are expected
([03](03-data-model.md#money-representation)).

## 4. Roles and permissions

| Role | Hebrew | Who | Can |
|---|---|---|---|
| Host / manager | מנהל המשחק | Creator by default; transferable | Everything: add/remove players, buy-ins, settle, end game, share, hand over management |
| Player (registered) | שחקן | Signed-in user listed in the game | View live. Counts toward their statistics. May seize the host role in an emergency (below) |
| Group admin | מנהל חבורה | Promoted by the owner or another admin | Invite and remove members, promote members, edit group settings. **No special power inside any game** — unrelated to being a host |
| Group owner | בעל החבורה | The creator | Everything an admin can, plus demoting admins and deleting the group. **Cannot be displaced by anyone** |
| Guest player | אורח | A name with no account | Appears in the game, no login. Can ask to join via a share link; nothing else |
| Viewer | צופה | Added in-app or arrived via the share link | Read-only, live |

Rules:

- Creating a game makes you the host (#7). Being a **group admin** confers nothing here: the two
  roles are independent, and the UI must never label either one bare `מנהל`
  ([03](03-data-model.md#group-roles)).
- **Adding someone to a game never adds them to the group**, and vice versa. Two separate acts with
  different consequences ([04](04-ux-spec.md#adding-players--the-multi-select-sheet)).
- **Getting into a group:** an owner or admin invites you by username, and you accept. There is no
  invite link and no other path — nobody is enrolled by someone else's action alone
  ([03](03-data-model.md#joining-a-group)).
- **Getting into a game:** the host's share link, or — if you're already in the group — you ask and
  the host approves. Exactly two paths, both host-approved
  ([03](03-data-model.md#two-paths-in-one-gate)).
- **The two "admin" powers are unrelated and asymmetric.** A game host can be seized in one tap by
  anyone signed in *and in that game*, because money is being counted live. A **group owner can
  never be displaced** — no takeover, no vote, no demotion. Ownership moves only if the owner
  transfers it ([03](03-data-model.md#group-roles)).
- **Exactly one host at a time.** No co-hosts, no shared write access. One source of truth for
  who's holding the pen.
- The host can hand management to any **registered** player or viewer in the game (#6). The change
  is immediate, confirmed with a modal, written to the audit log; the old host keeps read access. A
  guest cannot be host — there's no account to own it.
- **Emergency takeover, with no waiting period.** Any signed-in person **in that game** — player or
  viewer — can seize the host role at any moment. Phones die, freeze and get left in cars, and a
  game frozen behind a dead phone is the worst possible failure, so this is deliberately immediate
  rather than time-gated. It is scoped to people actually at the table: a group member who isn't in
  the game has no business seizing it.
- Taking over shows a warning about the outgoing host's sync state first, because unsynced changes
  on a phone that never reconnects are the one thing that can actually be lost. Full modal and
  copy: [04](04-ux-spec.md#host-takeover-warning). The mechanism:
  [03](03-data-model.md#host-takeover).

## 5. Core objects

- **Group / חבורה** — the recurring circle of friends. Owns the friend list, scopes all statistics,
  and authorises emergency host takeover.
- **Game / משחק** — one night. Has a buy amount, chips per buy, players, events, and a status.
- **Player row / שחקן במשחק** — one person in one game. Either a registered user or a guest name.
- **Event / אירוע** — an append-only record of every change. Source of truth while the game is
  live.
- **Transfer / העברה** — one payment from A to B produced by the settlement.
- **Result snapshot** — the permanent, immutable record of what each player did in a finished game.
  Survives everything.

### Game lifecycle

```
setup ──▶ active ──▶ settling ──▶ finished ──▶ (locked after 24h) ──▶ (details purged)
             ▲           │            │
             └───────────┘            │  host may reopen within 24h (#22)
             └────────────────────────┘
```

### Player-row lifecycle

```
active ──▶ settled (grayed out, chips recorded) ──▶ reopened ──▶ settled …
```

## 6. Feature list

### 6.1 Game setup (#13)

Creating a game asks for:

| Field | Hebrew | Default | Notes |
|---|---|---|---|
| Game name | שם המשחק | `פוקר — 26.07.26` | Auto-filled from date, editable |
| Buy amount | סכום קנייה | ₪50 | The unit all money math derives from |
| Chips per buy | ז'יטונים לקנייה | 100 | Gives chip value = buy ÷ chips = ₪0.5 |
| Currency | מטבע | ₪ ILS | Inherited from the group; not user-visible in v1 |
| Players | שחקנים | — | Quick-add list sorted by **most frequently played with**, plus free text for guests |
| Viewers | צופים | — | People who can watch but not edit (#5, #14) |
| Group | חבורה | last used | Scopes the quick-add list and statistics |
| Private game | משחק פרטי | off | Keeps the game out of every group-scoped figure and list. Carries an ⓘ explaining exactly that — see [§6.7](#67-private-games) |

Chip value is displayed prominently on the game page as a chip: **`ז'יטון = ₪0.5`** (#13).

Setup must be skippable — a fast path that takes the defaults and drops you straight into an empty
game, because sometimes the game is already starting. `שכפל משחק אחרון` repeats the last game's
players and stakes in one tap.

### 6.2 The player list (#2, #9, #14, #15)

Each row shows: name · buy count with `−`/`+` · money owed · chips/settled state · cash paid. Full
row anatomy, interaction and states: [04 — UX spec](04-ux-spec.md#player-row-anatomy).

- `+` / `−` on the buy counter → one tap, optimistic, with an undo snackbar that states the change
  in buy-ins, **chips and money** together (#2 — the recommended interaction, justified in
  [04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)).
- **Renaming depends on who the row is:**
  - **Guest** → free rename. It's just a label.
  - **Registered user** → sets a per-game **nickname**, rendered as `nickname (account name)` —
    e.g. `הכריש (מור לוי)`. Their account identity is never overwritten, because a row that owes
    money has to be unambiguous. The nickname is pre-filled from their last nickname in this group,
    or from the optional default they set when creating their account. Statistics always follow the
    account, never the nickname.
- **Duplicate names** (#9): a second `מור` becomes `מור (1)`, a third `מור (2)`. Uniqueness is per
  game, applied to the rendered name, and the suffix goes on the *new* entry. A guest whose name
  matches a registered player is suffixed like anyone else — the app never guesses that two rows
  are the same person.
- **Cash paid at the table is edited directly on the row** (#18) — tap the `💵` figure, no menu
  needed. Details in [§6.4](#64-cash-paid-at-the-table-18).
- Add / remove players and viewers mid-game (#14). Removing a player who already has buy-ins
  requires confirmation and is soft-deleted (kept in the audit log, excluded from math).
- **Late joiners**: a player added mid-game gets the same chip value; their join time is recorded
  for per-hour statistics.
- **Long-press a row** (#15) → bottom sheet with actions. Because long-press is undiscoverable,
  every row also has a visible `⋯` that opens the same sheet. Contents:
  [04](04-ux-spec.md#row-action-sheet).

### 6.3 Settling a player (#15)

A player physically leaves the table → the host records how many chips they had and closes the row.
The row grays out, its buy counter is disabled, and its result (`+₪120` / `−₪80`) is shown.
Reopening restores it. Every settle/reopen is logged (#22).

Sanity checks on chip entry: warn if the number entered exceeds the total chips in play, or if the
total entered across settled players already exceeds total buy-ins.

### 6.4 Cash paid at the table (#18)

Some people hand over cash when they buy in. The app records **how much cash a player has
physically put into the pot**, edited straight from their row. The pot total is the sum. At
settlement the pot becomes a payer, so winners can be paid from the cash on the table before anyone
opens a payment app. Math: [05 — Settlement](05-settlement.md#the-pot-as-a-settlement-node).

### 6.5 Pot verification (#20)

A persistent banner above the list:

- 🟢 `מאוזן · קניות ₪600 = ז'יטונים ₪600`
- 🔴 `פער של ₪20 · קניות ₪600 · ז'יטונים ₪580`

Red state offers three resolutions: fix the chip counts, assign the difference to
`לא מזוהה / הבית` (tracked as a long-term statistic), or split it evenly. The banner blocks nothing
by itself, but ending the game while red requires explicitly accepting the discrepancy.

### 6.6 Shared costs

Pizza, tips, the beer run. A game-level list of costs, each with a payer and a split across
players. They move money between people at settlement but are **kept entirely out of the poker
statistics** — a player who lost ₪80 at cards and paid ₪20 toward dinner lost ₪80 at poker.
UI: [04](04-ux-spec.md#shared-costs). Math: [05](05-settlement.md#shared-costs).

### 6.7 Private games

A checkbox at creation: `משחק פרטי`. One rule governs all of it:

> A private game is excluded from every group-scoped figure and every group-visible list.
> It never affects personal figures.

| | Private game |
|---|---|
| Group statistics, leaderboards, fun stats | Never appears |
| The group's past-games list | Never appears |
| The participants' own personal statistics | **Always counts** |
| Sharing a join link | **Host only** |
| Inviting a group member | Host **or any current player** |

The asymmetry in the last two rows is deliberate: any player can pull in someone the group already
knows, but only the host can mint a URL that works for a stranger. Either way the host still
approves the join.

This is privacy about *statistics and discoverability*, not secrecy — everyone in the game sees
everything in it, exactly as in a normal game. That distinction is not obvious from a checkbox
label, which is why it gets an ⓘ ([§6.13](#613-explainers-on-ambiguous-controls)).

Mechanism: [03 — Private games](03-data-model.md#private-games).

### 6.8 Ending the game (#16, #19, #22)

1. **Slide to confirm** — not a tap — so it can't happen mid-hand (#22).
2. Any un-settled players must have chips entered first; the app lists who's missing.
3. Settlement screen: net result per player, then the transfer list computed with the minimum
   number of transfers (#19), with the pot drained first.
4. Edit mode: change any transfer amount, or pick a different payer/payee from a chip picker
   limited to players in this game plus the pot (#17). Live balance indicator, per-row green/red
   correctness colouring, and an over/under column (#16).
5. Share as text (#8, #16).
6. **Reopen within 24h** (#22) — host only, logged.

### 6.9 Sharing (#5, #8, #14)

The share link's behaviour depends on the game's state:

| Game state | What the link does |
|---|---|
| Live | **Opens the game read-only**, live, with no edit path. Signed-in visitors are recorded in the viewer list so the host sees who's watching. Anyone holding the link can **request to join**; only the host approves. This is the only way in for someone outside the group |
| Finished | **Settlement view only** — results and the transfer list. No live controls, no audit log, no player management |
| Purged or revoked | A plain "no longer available" page |

Plus:

- **In-app viewer list** — add friends from the group to watch (#14).
- **Text share** — plain, WhatsApp-shaped, generated from the same data as the link so the two can
  never disagree. Templates: [07](07-hebrew-glossary.md#share-text-templates).
- **Payment shortcuts** (#23) — `wa.me` links and copy-to-clipboard. Honest constraints in
  [05](05-settlement.md#payment-links--reality-check-23).

Links carry a 256-bit token in the URL fragment, are stored only as a hash, are revocable, and
expire on their own: **7 days for anyone outside the group, 30 days for group members**. Group
members never lose access to their own history — after 30 days they open the game from the app,
which needs no link. Full design: [03](03-data-model.md#link-security).

### 6.10 Accounts (#3, #21)

- Google sign-in and email (magic link preferred over passwords on mobile).
- Guests need no account (#21).
- **Joining a game always needs the host's approval**, whichever way the request arrives:
  - **Group members** see their group's live games in the app — a thin card with the name, host and
    player count, nothing inside — and can tap `בקש להצטרף` without needing a link.
  - **Everyone else** can only ask by opening the share link.

  Both land in the same pending-requests list, and the host approves each one as a player or a
  viewer. Approval is what creates the row; nobody appears in a game uninvited.
- **Claiming a guest row** (#21): a signed-in person can say "that guest row is me" and, once the
  host approves, it starts counting toward their statistics.

  | | Rule |
  |---|---|
  | Who may claim | A member of the game's group, **or** anyone who reached the game through its share link |
  | What | One specific guest row — never a whole history |
  | Approval | Host only |
  | Window | While the game is live, and up to **2 days after it ends** |

  A claim changes attribution, never amounts. After the window closes the row stays a guest row
  permanently, which is what keeps the permanent results genuinely immutable. Mechanism:
  [03](03-data-model.md#player_claims-21).

### 6.11 Statistics (#10, #11, #12, #24)

A signed-in user is included in statistics for any game where they are a player row (#10). All
statistics are scoped to a group — you never see players from another group. Definitions, formulas
and the final set of fun stats: [06 — Statistics](06-statistics.md).

### 6.12 Audit log (#22)

A collapsible drawer at the bottom of the game page, live, newest first:

```
23:42 · מור — קנייה #3
00:15 · רני — נסגר עם 120 ז'יטונים (₪60)
00:31 · אורי → מנהל המשחק
```

Because every mutation is an event ([03](03-data-model.md#event-sourcing)), this is free. It is
also the first thing discarded by the retention policy, since it stops being useful once the
argument is over.

### 6.13 Explainers on ambiguous controls

Some controls in this app have a consequence you cannot infer from the label. Ticking `משחק פרטי`
changes which statistics a night counts toward; setting `ז'יטונים לקנייה` silently sets the value of
every chip on the table. Those get a small **ⓘ** beside them, opening one to three sentences.

The rule is narrow on purpose: ⓘ is for a *second-order consequence*, never a substitute for a
label that should have been clearer. Full list and interaction rules:
[04](04-ux-spec.md#-explainers).

### 6.14 Sync state

A persistent sync indicator sits in the top corner of every screen that touches game data: synced,
syncing, offline with a pending count, or failed. It matters for two moments in particular —
closing the app with unsynced changes, and a host takeover
([04](04-ux-spec.md#sync-indicator)).

## 7. What's deliberately not in v1

- **Non-standard buy-in amounts** (half buys, odd top-ups). They happen, but rarely enough that
  building a second input mode for them isn't worth it yet. The schema keeps a column reserved so
  adding it later doesn't need a migration of existing data.
- **A "mark as paid" checkbox on transfers.** Whoever receives money won't come back into the app
  to tick a box, so the list would be permanently half-empty and would misrepresent who has
  actually settled.
- **Multi-currency UI.** Stored properly, not exposed yet. When it arrives, currency is a *label*
  only: changing it re-labels amounts and never converts them.
- **Chip denomination entry** (counting by colour: 5 black × 25 + 3 red × 10). Planned for later,
  not now.
- **Moving a buy-in from one player to another.** A buy-in tapped onto the wrong row is corrected by
  undo, or by `−` on the wrong player and `+` on the right one. A dedicated "reassign" action adds a
  second way to change someone's money that a bystander could trigger by accident, to save one tap
  on a mistake that is usually caught within seconds.
- **Locations and scheduled games** — both planned, see §10.
- **Push notifications**, native app wrappers, tournament mode.

## 8. Data retention

Detailed game data is deleted over time to keep the free-tier database small; **aggregated results
are kept forever and keep feeding statistics, even for games that are explicitly deleted.**

| Data | Kept |
|---|---|
| Result snapshots (per game and per player) and the transfer list | Forever |
| Full game detail — players, buy-ins, settings | 90 days after the game ends |
| Activity log | 30 days after the game ends |

A purged game still appears in history as a results card. Deleting a game removes the details
immediately and keeps the statistics, and the confirmation says so in plain words. Export is
available at any time. Full policy: [03](03-data-model.md#retention-and-archiving).

## 9. Requirement traceability

Your original numbered list, mapped to where each item is specified.

| # | Requirement | Where |
|---|---|---|
| 1 | Hebrew | [04 RTL](04-ux-spec.md#rtl-and-hebrew), [07 glossary](07-hebrew-glossary.md) |
| 2 | Editable players, buy counter, confirm UX | [04 buy counter](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app) |
| 3 | Google / email accounts | §6.10, [02 auth](02-architecture.md#auth) |
| 4 | Free DB | [02 database choice](02-architecture.md#database-choice) |
| 5 | Share game, view-only | §6.9, [03 RLS](03-data-model.md#row-level-security) |
| 6 | Pass management | §4 |
| 7 | Creator is host | §4 |
| 8 | Share as text | [07 templates](07-hebrew-glossary.md#share-text-templates) |
| 9 | Duplicate names → `(1)` | §6.2 |
| 10 | Signed-in participants get statistics | [06](06-statistics.md) |
| 11 | Group statistics | [06](06-statistics.md#group-level-statistics-11) |
| 12 | Personal statistics | [06](06-statistics.md#personal-statistics-12) |
| 13 | Buy amount, chips, chip value, quick-add | §6.1 |
| 14 | Add/remove viewers | §6.9 |
| 15 | Settle a player, long-press menu | §6.2, §6.3, [04 action sheet](04-ux-spec.md#row-action-sheet) |
| 16 | End game, editable transfers, balance indicator | [05](05-settlement.md#edit-mode-16-17) |
| 17 | Pick payer/payee from this game's players | [05](05-settlement.md#edit-mode-16-17) |
| 18 | Cash paid at table, pay from pot | §6.4, [05](05-settlement.md#the-pot-as-a-settlement-node) |
| 19 | Minimum-transfer settlement | [05](05-settlement.md#minimum-transfer-algorithm-19) |
| 20 | Pot verification banner | §6.5 |
| 21 | Guests, join requests, claiming a guest row | §6.10 |
| 22 | Confirm end, reopen 24h, audit log | §6.8, §6.12 |
| 23 | Payment links | [05](05-settlement.md#payment-links--reality-check-23) |
| 24 | Extra statistics | [06](06-statistics.md#fun-statistics) |

## 10. Planned, not in v1

Known future features. They are written down now because today's schema reserves room for them
([03](03-data-model.md#reserved-for-planned-features)) — building them later should not require
migrating existing games.

### Locations

A game can carry a location: where it was played. Addable **at creation, during the game, and after
it has finished** — including on an old game somebody wants to tidy up.

- `+ הוסף מיקום` with a quick-pick list of the group's **five most-played places**, plus free text
  for a new one.
- The name is denormalised onto the permanent summary, so a purged game still knows where it
  happened and can feed a "where does this group play most?" statistic.

### Scheduled games

Create a game in advance and invite people to it.

- The game carries a **date, time and location**, and a list of invited players.
- Invitees **RSVP**, and the plan shows who has accepted.
- An invitee can also set an **expected arrival time** — the game starts at 20:00, they'll be there
  at 21:00. Late arrivals render differently from everyone else in the plan, so the host can see at
  a glance who to expect and when.
- On the day, `התחל משחק` turns the plan into a live game, and the host picks **which of the invited
  players are actually starting**. The rest can still be added later as they arrive.
- The preset stays editable up to that point, and the plan view remains reachable afterwards to
  check who was supposed to come and when.

A planned game is the same row as a live one in an earlier status, so starting it is a status
transition rather than a copy — the game keeps its identity, its invites and its history.
