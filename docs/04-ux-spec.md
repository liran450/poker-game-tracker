# 04 — UX Spec

Written for the design pass. Describes structure, interaction and state — not visual style.
Visual direction is in [10 — Design brief](10-design-brief.md).

## Context of use — design for this, not for a desk

- **One hand, one thumb.** The other hand is holding cards or chips.
- **A dim room, late at night.** Dark theme is the default, not an option.
- **Interruptions constantly.** Every screen must survive being closed and reopened mid-action.
- **The phone is passed around.** Anyone might tap anything. Destructive actions need friction;
  routine actions need none.
- **Speed matters.** The host is being asked "did you write down my buy-in?" while dealing. Adding
  a buy-in must take under one second and zero cognitive load.

Consequences: everything interactive lives in the **bottom third** of the screen. Minimum tap
target 48×48 CSS px, with 8px between adjacent targets. Never put a destructive action adjacent to
a frequent one.

## RTL and Hebrew

Hebrew is the launch language; English and others come later, so **direction is a property of the
locale, never a hardcoded constant**.

- `<html dir>` and `lang` are set from the active locale at runtime. No component may assume RTL.
- Layout mirrors: lists start at the inline start, chevrons point toward the inline end, back
  arrows toward the inline start, progress fills from the inline start.
- **Use CSS logical properties everywhere** (`margin-inline-start`, `padding-inline-end`,
  `inset-inline-start`). A single hardcoded `left:` is a bug that only shows up in review — or, once
  English lands, in production.
- **Numbers and currency are LTR islands inside RTL text.** Wrap every amount in an element with
  `unicode-bidi: isolate` (or `dir="ltr"`), or `₪50-` will render in a way that reads as something
  else entirely. This is the most common bug in Hebrew financial UIs — build one `<Money>`
  component and forbid raw number interpolation into strings.
- Signed amounts always carry an explicit sign and never rely on colour: `+₪120`, `−₪80`. Use
  U+2212 minus, not a hyphen.
- Currency symbol and its position come from the locale + the group's currency, not from a literal
  `₪` in a template.
- Font: Rubik or Heebo, self-hosted, covering Hebrew and Latin. Tabular figures
  (`font-variant-numeric: tabular-nums`) on every number so columns don't jitter as counters change.
- Hebrew has no casing; hierarchy comes from weight and size only. Expect Hebrew strings to be
  ~15% shorter than their English equivalents — design so both fit.
- Mixed content (a Latin name in a Hebrew sentence) needs isolation too. Player names composed as
  `nickname (username)` are exactly this case.

---

## Screen map

```
Sign in  ─┬─▶  Home (games list)  ─┬─▶  New game (setup)  ──▶  Game page  ──▶  Settlement  ──▶  Summary
          │                        ├─▶  Game page (existing / shared link)
          ├─▶  Statistics          ├─▶  Group / friends
          └─▶  Profile             └─▶  Game history
```

Bottom tab bar (3 tabs, persistent everywhere except inside a live game):
**משחקים** · **סטטיסטיקה** · **פרופיל**

Inside a live game the tab bar is replaced by the game action bar — the game is a focused mode.

---

## Home — משחקים

- **Active game card, pinned at the top**, large, showing the game name, elapsed time, player count
  and total pot. Tapping it resumes. If there's a live game, this is 90% of why the app was opened,
  so it takes the top third of the screen.
- Below: recent finished games, newest first, each showing the date, players and your own result
  (`+₪120` / `−₪80`).
- Older games whose details have been purged ([03](03-data-model.md#retention-and-archiving))
  appear as **results cards** — same summary, no drill-in to the audit log. They must not look
  broken; they look complete, just quieter.
- Primary action: **`+ משחק חדש`** in the bottom bar.
- Empty state: a single big `התחל משחק ראשון` and one line explaining what the app does.

## New game — setup

One screen, no wizard. Fields in the order of [01 §6.1](01-product-spec.md#61-game-setup-13), with
sensible defaults already filled so the whole thing can be dismissed with one tap.

- **Buy amount** and **chips per buy** side by side, with the derived chip value shown live
  underneath as you type: `ז'יטון = ₪0.5`. Instant feedback that the numbers are right.
- Amount presets as chips: `₪20` `₪50` `₪100` `אחר` — faster than the keypad for the common cases.
- **Player quick-add**: a wrapped grid of name chips from the group, **sorted by how often you've
  played with them** (#13), tap to toggle in. Selected chips move to the top so the list doesn't
  reflow under your finger. Below it, a text field: `הוסף אורח…` for names not in the list.
- **Viewers** in a collapsed section — most games won't set it up here (#14 allows adding later).
- Bottom bar: **`התחל משחק`** primary, full width.
- Secondary at the top: `שכפל משחק אחרון` — same players, same stakes, one tap. This will be the
  most-used path after the first few games.

---

## Game page — the main screen

```
┌─────────────────────────────────────────────┐
│ ← פוקר — 26.07        02:14      ✓ ⋯        │  sticky header + sync indicator
│    ז'יטון ₪0.5 · קנייה ₪50 · 6 שחקנים        │
├─────────────────────────────────────────────┤
│ 🟢 מאוזן · קניות ₪600 = ז'יטונים ₪600        │  pot banner
├─────────────────────────────────────────────┤
│                                             │
│   player rows (the scrolling body)          │
│                                             │
├─────────────────────────────────────────────┤
│  מור · קנייה 3 · +100 ז'יטונים · +₪50  בטל ◷│  undo snackbar (transient)
├─────────────────────────────────────────────┤
│  + שחקן      שיתוף    יומן    סיום משחק     │  action bar
└─────────────────────────────────────────────┘
      ▲ swipe up from here for the audit log
```

**Header** — game name and a running clock (needed for profit-per-hour, #24, and genuinely useful
at 2am). The chip value and buy amount are always visible: they're referenced constantly and nobody
should have to remember them. `⋯` opens game settings: rename, edit viewers, shared costs, share,
hand over management, reopen/close, delete.

### Sync indicator

A small persistent indicator in the **top corner of the header**, present on every screen that
touches game data:

| State | Shown as |
|---|---|
| Synced | `✓` quiet, low-contrast |
| Syncing | animated dot |
| Offline with pending changes | amber `3` badge |
| Failed / stalled | red, and tapping offers `נסה שוב` |

Tapping it expands a small panel: last sync time, number of pending changes, and a manual retry.
It is never a blocking dialog — the app keeps working offline. It exists because two things depend
on the host knowing their sync state: closing the tab with unsynced events, and
[handing over or losing the host role](#host-takeover-warning).

**Pot banner** ([01 §6.5](01-product-spec.md#65-pot-verification-20)) — compact and green when
balanced, expanded and red when not. Tapping the red state opens the resolution sheet. It sits
directly under the header so it's visible without scrolling, because a discrepancy discovered at
1am is much cheaper than one discovered at 2am.

### Player row anatomy

```
┌───────────────────────────────────────────────────┐
│  הכריש (mor_l)                          ₪150   ⋯  │
│  💵 ₪100              [ − ]   3   [ + ]           │
└───────────────────────────────────────────────────┘
```

- **Name** — at the inline start. See [naming](#renaming-a-player) for what's editable.
- **Amount owed** — `₪150`, the far end of the row. Large, tabular.
- **Buy counter** — `−  3  +`, bottom of the row, thumb height. The `+` is the largest target on
  the screen; the `−` is deliberately smaller and slightly separated, since decrement is rarer and
  more dangerous.
- **Cash paid** (#18) — `💵 ₪100`, **tappable directly on the row** to edit. It opens a small
  numeric sheet with the amount pre-selected and quick chips for one, two and three buy-ins'
  worth (`₪50` `₪100` `₪150`). When zero, it shows as a faint `💵 +` so it's still one tap away
  rather than buried in a menu.
- **`⋯`** — opens the row action sheet, same as long-press.

Settled rows (#15): background dimmed to ~40% opacity, counter disabled, and the result replaces
the owed amount — `+₪120` / `−₪80` with a `🔒` glyph. They stay **in place** in the list rather than
jumping to the bottom, because people find each other by position; offer a `הצג סגורים בסוף` toggle
in settings for those who prefer otherwise.

Late joiners and removed players are visually distinct: a small `הצטרף 23:40` caption, and removed
rows are gone from the list but present in the log.

### The buy-in counter — the most important interaction in the app

You offered two options and asked me to choose. **I recommend a third that subsumes both**, and
here's the reasoning.

Per-row approve/cancel doubles the taps for the single most frequent action in the app, and puts a
confirmation on something that is trivially reversible. A batch bottom bar is better for entering
several rows at once, but it leaves the app in a "dirty" state — if the host gets distracted
mid-hand and never taps אישור, the data is wrong and nobody knows.

**Recommended: optimistic increment with a coalescing undo.**

1. Tap `+`. The number increments **immediately** with a short count-up animation, and the row's
   amount updates. Haptic tick.
2. A snackbar rises above the action bar, stating the change in all three units that matter — buy
   count, chips, and money:
   ```
   מור · קנייה 3 · +100 ז'יטונים · +₪50            [ בטל ]  ◷
   ```
   The chip figure matters because the host is reconciling against physical stacks on the table,
   and the money figure because that's what will be settled.
3. Rapid taps coalesce — three taps on Mor's `+` produce one snackbar reading
   `מור · +3 קניות · +300 ז'יטונים · +₪150`, with a single undo that reverts all three.
4. **If two or more different rows are touched inside the window, the snackbar upgrades into your
   batch bar** — one line per row with its own chips and money, and a total:
   ```
   מור    +2 קניות   +200 ז'יטונים   +₪100
   אורי   +1 קנייה   +100 ז'יטונים   +₪50
   רני    −1 קנייה   −100 ז'יטונים   −₪50
   ─────────────────────────────────────────
   סה"כ   +200 ז'יטונים   +₪100     [ בטל הכל ]  [ אישור ]
   ```
   The list scrolls if it exceeds four rows, and never covers more than half the screen.
5. The write is committed locally at once and pushed at the end of the window. Undo before the
   window closes appends the inverse event; after it closes, undo is still available from the audit
   log.

This gives one tap for the common case, an explicit confirmation surface exactly when several
things changed at once, no dirty state (the window always closes itself), and full reversibility.

**Guard rails:** the `−` button never goes below 0 and is disabled at 0. Decrementing a player to 0
buy-ins asks whether to remove them from the game.

### Renaming a player

Behaviour depends on who the row is:

| Row is | Tapping the name does |
|---|---|
| **Guest** | Inline edit, focused, text pre-selected. It's just a label — free to change |
| **Registered user** | Opens a **nickname** field, not a rename. The result renders as `nickname (username)`, e.g. `הכריש (mor_l)`. The helper text says so: `הכינוי יוצג לצד שם המשתמש` |

A registered player's real identity is never overwritten — this is a game about money, and the
person behind a row has to stay unambiguous. Clearing the nickname reverts to their display name.
Statistics always use the account, never the nickname.

The nickname field is **pre-filled from that person's most recent nickname in the same group**, so
`הכריש` set once reappears every Thursday without being a separate thing to manage. Changing it
affects tonight only.

Commit on blur (on a phone, tapping elsewhere means "done", not "cancel"); Escape or the back
gesture reverts. Duplicate rendered names get the `(1)` suffix on commit, with a brief toast
explaining it (#9).

### Row action sheet

Long-press (500ms, with haptic) **or** tap `⋯`. Bottom sheet, because a floating context menu near
a fingertip is hard to reach one-handed and gets clipped at screen edges.

| Action | Hebrew | When |
|---|---|---|
| Settle | סגירת שחקן | Row is active |
| Reopen | פתיחה מחדש | Row is settled |
| Edit chips | עריכת ז'יטונים | Row is settled |
| Cash paid | מזומן ששולם | Always — also reachable straight from the row |
| Nickname / rename | כינוי · שינוי שם | Per the table above |
| Move a buy-in to another player | העברת קנייה לשחקן אחר | Fixes the most common data-entry error |
| Player history in this game | היסטוריית השחקן | Always |
| Remove from game | הסרה מהמשחק | Always, with confirmation |

Destructive items are last, separated, and coloured; `הסרה מהמשחק` additionally requires
confirmation when the player has buy-ins.

Long-press alone is not discoverable — hence the always-visible `⋯`, plus a one-time coach mark on
the first game: `לחיצה ארוכה על שחקן פותחת פעולות`.

### Settling a player (#15)

From the action sheet → `סגירת שחקן` opens a focused sheet:

```
        כמה ז'יטונים נשארו למור?

              [   120   ]
              = ₪60 · תוצאה +₪10

   [ 0 ]  [ 50 ]  [ 100 ]  [ 150 ]      quick chips

              [   סגור שחקן   ]
```

- Big numeric input, auto-focused, numeric keypad.
- **Live conversion under the field**: chips → money → their net result. The host sees the
  consequence before committing, which catches typos.
- Warn inline if the entry exceeds chips remaining in play.
- After closing, the pot banner updates and, if this was the last open player, the action bar's
  `סיום משחק` becomes prominent.

### Shared costs

Reached from the header `⋯` → `הוצאות משותפות`. A small list: label, amount, who paid, how it's
split.

- Adding one: `פיצה` · `₪120` · payer chip picker (players + `הקופה`) · split mode.
- Equal split defaults to everyone in the game, shown as selectable name chips with a live
  per-person figure underneath: `₪20 לאחד`.
- Custom split shows an amount field per person and a running remainder that must reach zero
  before saving.
- Once any shared cost exists, a compact line appears under the pot banner:
  `הוצאות משותפות ₪120` — visible but never competing with the poker numbers.
- In the settlement results, each player's share is its own line so nobody confuses dinner with a
  bad night at cards.

### Action bar

Four items, full width, bottom of the screen:

| Item | Weight |
|---|---|
| `+ שחקן` | Primary, filled |
| `שיתוף` | Icon + label |
| `יומן` | Icon + label, opens the log drawer |
| `סיום משחק` | Muted until every player is settled, then becomes prominent |

I recommend a **bar rather than a floating action button**. A FAB mirrors with direction, landing
in the worst corner for a right-handed thumb in RTL, and we need four actions anyway. A bar
sidesteps the mirroring question entirely and gives every action a text label — which matters more
in Hebrew, where icon conventions are less standardised.

`סיום משחק` stays visible but visually inert while players are open; tapping it early shows who's
still missing rather than an error.

### Audit log drawer (#22)

A grab handle at the very bottom edge. Swipe up or tap `יומן` to expand to ~60% height; swipe down
to dismiss. Newest first, live. Each entry: time · actor · what changed. Long-press an entry to
undo it (where reversible). Filter chips: `הכל` `קניות` `סגירות` `ניהול`.

The drawer disappears for games whose events have been purged, replaced by one line:
`יומן הפעילות של משחק זה כבר לא זמין`.

---

## Host handover and takeover

### Handing over (#6)

Header `⋯` → `העבר ניהול`. A sheet listing registered players and viewers in the game (guests can't
be host — they have no account). Confirmation modal, then the change is immediate and logged. The
old host keeps read access.

### Host takeover warning

Any signed-in member of the group can seize the host role immediately when the current host's phone
has died or frozen — no waiting period. Because that is a disruptive action, the button lives one
level down (`⋯` → `קח ניהול`) and shows a warning modal first:

```
   לקחת את ניהול המשחק?

   המנהל הנוכחי: מור
   סונכרן לאחרונה: לפני 4 דקות ✓

   ודאו שהמכשיר של המנהל הנוכחי סונכרן.
   שינויים שעדיין לא נשלחו מהמכשיר שלו
   עלולים ללכת לאיבוד.

        [ ביטול ]   [ קח ניהול ]
```

The last-sync line is the whole point of the modal, and it changes tone with the data:

- Synced in the last 2 minutes → green `✓`, low risk.
- Stale → amber, and the copy hardens: `יש שינויים שלא סונכרנו — מומלץ לחכות אם אפשר`.
- Unknown → red, and the confirm button requires a second tap.

A takeover is **announced to everyone**, not just written to the log: every device with the game
open — players, viewers, and the outgoing host when it reconnects — shows a non-blocking banner
`אורי לקח את ניהול המשחק`, alongside the log entry. Since the action is instant and ungated,
visibility is the guardrail.

The outgoing host's unsynced changes are still accepted on arrival — the event log is append-only
and idempotent — so the warning is about the case where their phone never comes back, not about
routine handover.

---

## Ending the game

**Slide to confirm** (#22), not a tap:

```
   ┌─────────────────────────────────────┐
   │  ⟵  החלק לסיום המשחק                │
   └─────────────────────────────────────┘
```

Preceded by a summary of what's about to be locked: player count, total pot, shared costs, and — if
the banner is red — the discrepancy in bold with the resolution options, requiring a separate
acknowledgement. If anything is still unsynced, say so here too; this is the last good moment to
notice.

Then the settlement screen, fully specified in [05 — Settlement](05-settlement.md#edit-mode-16-17).

### Summary screen (after settlement)

- Per-player result cards, sorted by net descending, with shared-cost shares on their own line. The
  winner gets a subtle celebratory treatment; do not make the biggest loser's card feel like a
  punishment.
- Transfer list, each with a `wa.me` shortcut where a phone number exists, and tap-to-copy on every
  amount and name. **No "mark as paid" checkbox** — nobody comes back to tick it, so it would
  permanently misrepresent who has settled
  ([05](05-settlement.md#payment-links--reality-check-23)).
- Bottom bar: **`שתף בוואטסאפ`** primary, `העתק טקסט` secondary.
- `פתח מחדש` available to the host for 24h, in the `⋯` menu, not on the main surface — with a
  countdown so it's clear the option expires (#22).

---

## Sharing (#5, #14)

`שיתוף` opens a sheet with three sections:

1. **Live link** — `העתק קישור` / `שתף`, plus the state: `הקישור פעיל · 3 צופים`,
   `בטל קישור` and `צור קישור חדש`. Explicit about what the link grants, and the wording changes
   with the game's status:
   - Live game: `כל מי שיש לו את הקישור יוכל להצטרף לצפייה בזמן אמת — בלי לערוך`
   - Finished game: `הקישור מציג את סיכום ההעברות בלבד`

   Under it, the expiry, stated plainly because two windows need explaining once:
   `פג תוקף: 7 ימים לאורחים · 30 יום לחברי החבורה`. Members are reassured they aren't locked out:
   `חברי החבורה תמיד יכולים לפתוח את המשחק מהאפליקציה`.
2. **Viewers** — the in-app list, add from group members, remove with a swipe. Anyone who opened
   the link while signed in appears here automatically with a `הצטרף בקישור` caption, so the host
   always knows who's watching.
3. **Text** — `שתף כטקסט` with a live preview of exactly what will be sent (#8), because people
   want to know what they're pasting into a group chat.

### The viewer's experience

**Live game.** The same game page, live, with every control removed rather than disabled — no ghost
`+` buttons, no `⋯` on rows. A banner at the top: `צפייה בלבד`. If the viewer is signed in and is a
player in this game, their row is highlighted and their running result is pinned, since that's the
only number they care about.

Anyone holding the link — signed in or not — gets one action and one only: **`בקש להצטרף למשחק`**,
a single button in the bottom bar. It asks for the name they want at the table and then goes quiet
(`הבקשה נשלחה למנהל המשחק`). Nothing appears in the game until the host approves. On the host's
side, a badge on the action bar shows pending requests; tapping it opens a sheet with
`אשר` / `דחה` per request. Approving creates the player row; rejecting is silent to everyone else.
This is the entire extent of what a guest can do.

**Finished game.** A different, simpler screen: results and the transfer list only. No player
management, no audit log, no live controls — just `מי מעביר למי`, with tap-to-copy amounts and a
share button. This is what most link recipients will actually open, since links get read after
everyone's gone home.

**Revoked, expired, or purged.** A plain, friendly dead end. Never a stack trace, never a login
wall for something that no longer exists.

---

## Statistics

Two tabs: **`שלי`** and **`החבורה`** ([06](06-statistics.md)), with a group switcher when the user
belongs to more than one.

- Lead with two or three big numbers, not a table. On `שלי`: total net (the number everyone
  actually wants), games played, win rate.
- A sparkline of cumulative net over time. This is the single most compelling thing you can show a
  poker player.
- Then the detail table, horizontally scrollable inside its own container so the page never scrolls
  sideways.
- Every rate shows its sample size: `62% (13 משחקים)`. Suppress rates under 5 games and show
  `נתונים חלקיים` instead — a 100% win rate from one game is a lie.
- Leaderboards let you switch the sort metric via chips, rather than tiny column headers.
- If a group's history spans more than one currency label, one quiet line says so rather than
  hiding the totals: `המשחקים כוללים יותר ממטבע אחד — הסכומים לא הומרו`. The app never converts.
- Fun stats ([06](06-statistics.md#fun-statistics)) as a row of cards — these are the ones people
  screenshot into the group chat, so they should look good on their own.

---

## Deleting a game

Host only, from `⋯`. The confirmation has to be precise about what survives, because the honest
answer is unusual:

```
   למחוק את המשחק?

   הנתונים המפורטים יימחקו: שחקנים, קניות,
   יומן הפעילות וההעברות.

   הסטטיסטיקה תישמר — התוצאות של המשחק
   ימשיכו להיספר לכל השחקנים.

        [ ביטול ]   [ מחק משחק ]
```

Offer `ייצוא לפני מחיקה` in the same sheet. The same wording, softened, appears once when the first
game in a group approaches automatic purging.

---

## Cross-cutting interaction rules

| Rule | Why |
|---|---|
| Every destructive action is undoable, or confirmed — never both, never neither | Confirmation fatigue makes people tap through dialogs |
| Optimistic UI everywhere; the spinner is a last resort | The app must feel instant on bad Wi-Fi |
| Errors are inline and specific, near the thing that failed | Toasts get missed in a noisy room |
| Haptic feedback on increment, settle, and confirm | Confirms the tap registered without looking |
| **Screen wake lock while a game is active** | The host's phone going to sleep every 30 seconds is genuinely infuriating |
| Numbers animate on change (count-up, ~200ms) | Draws the eye to what changed |
| No modal can trap the user; the back gesture always closes the topmost layer | |
| The app restores exactly where it was after being killed | Phones get closed mid-hand |
| Respect `prefers-reduced-motion` | |

## Accessibility

- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI elements, verified in dark mode where it's usually
  missed.
- Red/green is always paired with a sign, icon or text
  ([05](05-settlement.md#edit-mode-16-17)).
- Full keyboard operability for desktop use (the host might use a laptop).
- Screen-reader labels in the active language on every icon-only control; `aria-live` on the running
  totals, the sync indicator and the pot banner.
- Support text scaling to 200% without clipping — use `rem`, avoid fixed-height rows, and remember
  that translated strings will be longer than the Hebrew ones.
