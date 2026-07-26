# 01 — Product Spec

## 1. Problem

A friendly home poker game. 4–10 people. Someone buys in for ₪50, then again, then again.
Someone pays cash on the table, someone else "will settle later". At 1am everyone is tired,
the chip counts don't add up, and there's an argument about whether Mor took three buy-ins or
four. Then eight separate Bit transfers get sent, half of them wrong.

The app replaces the napkin.

## 2. Non-goals (explicitly out of scope)

- No real money moves through the app. It computes who owes whom; humans send the money.
- Not a poker engine. No cards, no hands, no blinds, no odds.
- Not a tournament manager (no blind timer, no payout structures) in v1.
- No public/social network. The audience is a closed circle of friends.

Worth stating in the repo: this is a bookkeeping tool for a private friendly game, not a
gambling product. Relevant if the app is ever wrapped for an app store.

## 3. Platform

Hebrew-first RTL **Progressive Web App**, one build, works on Android and iPhone via the
browser, installable to the home screen. Hosted free on GitHub Pages. Rationale and the
alternatives considered: [02 — Architecture](02-architecture.md).

## 4. Roles and permissions

| Role | Hebrew | Who | Can |
|---|---|---|---|
| Host / manager | מנהל המשחק | Creator by default; transferable | Everything: add/remove players, buy-ins, settle, end game, share, hand over management |
| Player (registered) | שחקן | Signed-in user listed in the game | View live. Counts toward their statistics. *Write access: open question, see [08](08-gaps-and-open-questions.md#q1)* |
| Guest player | אורח | A name with no account | Appears in the game, no login. Can later claim the profile |
| Viewer | צופה | Added in-app or holds the share link | Read-only, live |

Rules:

- Creating a game makes you the host (#7).
- The host can hand management to any **registered** player or viewer in the game (#6). Handing
  over is immediate, confirmed with a modal, written to the audit log, and the old host keeps
  read access. A guest cannot be host — they have no account to own it.
- **Abandoned-game escape hatch** (not in the brief, needed): if the host has been inactive for
  24h and the game is still open, any registered player in that game may claim host. Otherwise a
  host who goes home / loses their phone freezes the game permanently.
- Only one host at a time. (A co-host role is a plausible v2 addition; see
  [08](08-gaps-and-open-questions.md).)

## 5. Core objects

- **Group / חבורה** — the recurring circle of friends. Owns a friend list and scopes statistics.
  Optional: a game can exist without a group.
- **Game / משחק** — one night. Has a buy amount, chips per buy, players, events, and a status.
- **Player row / שחקן במשחק** — one person in one game. Either a registered user or a guest name.
- **Event / אירוע** — an append-only record of every change. Source of truth.
- **Transfer / העברה** — one payment from A to B produced by the settlement.

### Game lifecycle

```
setup ──▶ active ──▶ settling ──▶ finished ──▶ (locked after 24h)
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
| Currency | מטבע | ₪ ILS | Rarely changed; keep it, don't hardcode |
| Players | שחקנים | — | Quick-add list sorted by **most frequently played with**, plus free-text for guests |
| Viewers | צופים | — | People who can watch but not edit (#5, #14) |
| Group | חבורה | last used | Scopes the quick-add list and statistics |

Chip value is displayed prominently on the game page as a chip: **`ז'יטון = ₪0.5`** (#13).

Setup must be skippable — a "התחל מהר" path that takes the defaults and drops you straight into
an empty game, because sometimes the game is already starting.

### 6.2 The player list (#2, #9, #14, #15)

Each row shows: name · buy count with `−`/`+` · money owed · chips/settled state · cash-paid
indicator. Full row anatomy, interaction and states: [04 — UX spec](04-ux-spec.md).

- Tap the name → inline edit, focused with text selected (#2).
- `+` / `−` on the buy counter → one tap, optimistic, with undo (#2 — the recommended
  interaction, justified in [04](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)).
- **Duplicate names** (#9): adding a second "מור" produces `מור (1)`, third `מור (2)`.
  Uniqueness is per game. The suffix is applied to the *new* entry, not the existing one, and
  the host can rename either afterwards. If the duplicate is a *registered* user vs. a guest of
  the same name, offer "זה אותו בן אדם?" and link them instead of suffixing.
- Add / remove players and viewers mid-game (#14). Removing a player who already has buy-ins
  requires confirmation and is soft-deleted (kept in the audit log, excluded from math).
- **Late joiners**: a player added mid-game gets the same chip value; their `joined_at`
  timestamp is recorded for per-hour statistics.
- **Long-press a row** (#15) → bottom sheet with actions. Because long-press is undiscoverable,
  every row also has a visible `⋯` affordance that opens the same sheet.

Row action sheet (#15, plus additions):

| Action | Hebrew | When |
|---|---|---|
| Settle / record chips | סגירת שחקן | Row is active |
| Reopen | פתיחה מחדש | Row is settled |
| Edit chips | עריכת ז'יטונים | Row is settled |
| Mark cash paid | סימון תשלום במזומן | Always (#18) |
| Rename | שינוי שם | Always |
| Custom buy-in amount | קנייה בסכום אחר | Always — the half-buy / odd-amount escape hatch |
| Move a buy-in to another player | העברת קנייה לשחקן אחר | Fixes the most common data-entry error |
| Player history in this game | היסטוריית השחקן | Always |
| Remove from game | הסרה מהמשחק | Always, with confirmation |

### 6.3 Settling a player (#15)

A player physically leaves the table → the host records how many chips they had and closes the
row. The row grays out, its buy counter is disabled, and its result (`+₪120` / `−₪80`) is shown.
Reopening restores it. Every settle/reopen is logged (#22).

Sanity checks on chip entry: warn if the number entered exceeds the total chips in play, or if
the total entered across settled players already exceeds total buy-ins.

### 6.4 Cash paid at the table (#18)

Some people hand over cash when they buy in. The app records **how much cash a player has
physically put into the pot**. The pot total is the sum. At settlement the pot becomes a payer,
so winners can be paid from the cash on the table before anyone opens Bit. Math:
[05 — Settlement](05-settlement.md).

### 6.5 Pot verification (#20)

A persistent banner above the list:

- 🟢 `מאוזן · קניות ₪600 = ז'יטונים ₪600`
- 🔴 `פער של ₪20 · קניות ₪600 · ז'יטונים ₪580`

Red state offers two resolutions: fix the chip counts, or assign the difference to
`לא מזוהה / הבית` — which is then tracked as a long-term statistic ("₪15 a night disappears
under the sofa").

The banner blocks nothing by itself, but ending the game while red requires explicitly accepting
the discrepancy.

### 6.6 Ending the game (#16, #19, #22)

1. **Slide to confirm** — not a tap — so it can't happen mid-hand (#22).
2. Any un-settled players must have chips entered first; the app lists who's missing.
3. Settlement screen: net result per player, then the transfer list computed with the minimum
   number of transfers (#19), with the pot drained first.
4. Edit mode: change any transfer amount, or pick a different payer/payee from a chip picker
   limited to players in this game plus the pot (#17). Live balance indicator, per-row green/red
   correctness colouring, and an over/under column (#16).
5. Share as text (#8, #16).
6. **Reopen within 24h** (#22) — host only, logged.

### 6.7 Sharing (#5, #8, #14, #23)

- **Live share link** — unguessable token, read-only, revocable, optional expiry. Anyone with the
  link sees the game update live without signing in.
- **In-app viewer list** — add friends from the group to watch (#14).
- **Text share** — plain, WhatsApp-shaped. Templates in [07](07-hebrew-glossary.md#share-text-templates).
- **Payment links** (#23) — honest constraints in [05](05-settlement.md#payment-links--reality-check-23).

### 6.8 Accounts (#3, #21)

- Google sign-in and email (magic link preferred over passwords on mobile).
- Guests need no account (#21).
- **Claim profile**: when a guest later signs up, the host (or the guest, via a claim link) can
  link `אורח: רני` to the new account, and every past guest game merges into that person's
  statistics retroactively. Claiming is one-way and confirmed by the host to prevent someone
  claiming someone else's history.

### 6.9 Statistics (#10, #11, #12, #24)

A signed-in user is included in statistics for any game where they are a player row (#10).
Definitions, formulas and additional suggested stats: [06 — Statistics](06-statistics.md).

### 6.10 Audit log (#22)

A collapsible drawer at the bottom of the game page, live, newest first:

```
23:42 · מור — קנייה #3
00:15 · רני — נסגר עם 120 ז'יטונים (₪60)
00:31 · אורי → מנהל המשחק
```

Because every mutation is an event ([03](03-data-model.md#event-sourcing)), this is free.

## 7. Requirement traceability

Your numbered list, mapped to where each item is specified.

| # | Requirement | Where |
|---|---|---|
| 1 | Hebrew | [04 RTL](04-ux-spec.md#rtl-and-hebrew), [07 glossary](07-hebrew-glossary.md) |
| 2 | Editable players, buy counter, confirm UX | [04 buy counter](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app) |
| 3 | Google / email accounts | §6.8, [02 auth](02-architecture.md#auth) |
| 4 | Free DB | [02 database choice](02-architecture.md#database-choice) |
| 5 | Share game, view-only | §6.7, [03 RLS](03-data-model.md#row-level-security) |
| 6 | Pass management | §4 |
| 7 | Creator is host | §4 |
| 8 | Share as text | [07 templates](07-hebrew-glossary.md#share-text-templates) |
| 9 | Duplicate names → `(1)` | §6.2 |
| 10 | Signed-in participants get statistics | [06](06-statistics.md) |
| 11 | Global statistics | [06](06-statistics.md#group-level-statistics-11) |
| 12 | Personal statistics | [06](06-statistics.md#personal-statistics-12) |
| 13 | Buy amount, chips, chip value, quick-add | §6.1 |
| 14 | Add/remove viewers | §6.7 |
| 15 | Settle a player, long-press menu | §6.2, §6.3, [04 action sheet](04-ux-spec.md#row-action-sheet) |
| 16 | End game, editable transfers, balance indicator | [05](05-settlement.md#edit-mode-16-17) |
| 17 | Pick payer/payee from this game's players | [05](05-settlement.md#edit-mode-16-17) |
| 18 | Cash paid at table, pay from pot | [05](05-settlement.md#the-pot-as-a-settlement-node) |
| 19 | Minimum-transfer settlement | [05](05-settlement.md#minimum-transfer-algorithm-19) |
| 20 | Pot verification banner | §6.5 |
| 21 | Guests + claim profile | §6.8 |
| 22 | Confirm end, reopen 24h, audit log | §6.6, §6.10 |
| 23 | Bit / PayBox links | [05](05-settlement.md#payment-links--reality-check-23) |
| 24 | Extra statistics | [06](06-statistics.md#fun-statistics-24-and-additions) |
