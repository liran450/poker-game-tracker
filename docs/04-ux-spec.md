# 04 — UX Spec

Written for the design pass. Describes structure, interaction and state — not visual style.
Visual direction is in [10 — Design brief](10-design-brief.md).

## Context of use — design for this, not for a desk

- **One hand, one thumb.** The other hand is holding cards or chips.
- **A dim room, late at night.** Dark theme is the default, not an option.
- **Interruptions constantly.** Every screen must survive being closed and reopened mid-action.
- **The phone is passed around.** Anyone might tap anything. Destructive actions need friction;
  routine actions need none.
- **Speed matters.** The host is being asked "did you write down my buy-in?" while dealing.
  Adding a buy-in must take under one second and zero cognitive load.

Consequences: everything interactive lives in the **bottom third** of the screen. Minimum tap
target 48×48 CSS px, with 8px between adjacent targets. Never put a destructive action adjacent
to a frequent one.

## RTL and Hebrew

- `<html dir="rtl" lang="he">`. Layout mirrors: lists start right, chevrons point left, back
  arrows point right, progress fills right-to-left.
- **Use CSS logical properties everywhere** (`margin-inline-start`, `padding-inline-end`,
  `inset-inline-start`). A single hardcoded `left:` is a bug that will only show up in review.
- **Numbers and currency are LTR islands inside RTL text.** Wrap every amount in an element with
  `unicode-bidi: isolate` (or `dir="ltr"`), or `₪50-` will render in a way that reads as
  something else entirely. This is the single most common bug in Hebrew financial UIs — build one
  `<Money>` component and forbid raw number interpolation into strings.
- Signed amounts always carry an explicit sign and never rely on colour: `+₪120`, `−₪80`.
  Use U+2212 minus, not a hyphen.
- Font: Rubik or Heebo, self-hosted. Tabular figures (`font-variant-numeric: tabular-nums`) on
  every number so columns don't jitter as counters change.
- Hebrew has no casing; hierarchy comes from weight and size only.
- Mixed content (a Latin name in a Hebrew sentence) needs isolation too.

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

- **Active game card, pinned at the top**, large, showing the game name, elapsed time, player
  count and total pot. Tapping it resumes. If there's a live game, this is 90% of why the app was
  opened, so it takes the top third of the screen.
- Below: recent finished games, newest first, each showing the date, players and your own result
  (`+₪120` / `−₪80`).
- **Unsettled reminder**: games where transfers exist but aren't all marked paid get a small
  `לא סגור` badge.
- Primary action: **`+ משחק חדש`** in the bottom bar.
- Empty state: a single big `התחל משחק ראשון` and one line explaining what the app does.

## New game — setup

One screen, no wizard. Fields in the order of [01 §6.1](01-product-spec.md#61-game-setup-13),
with sensible defaults already filled so the whole thing can be dismissed with one tap.

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

Structure, top to bottom:

```
┌─────────────────────────────────────────────┐
│ ← פוקר — 26.07             02:14        ⋯   │  sticky header
│    ז'יטון ₪0.5 · קנייה ₪50 · 6 שחקנים        │
├─────────────────────────────────────────────┤
│ 🟢 מאוזן · קניות ₪600 = ז'יטונים ₪600        │  pot banner
├─────────────────────────────────────────────┤
│                                             │
│   player rows (the scrolling body)          │
│                                             │
├─────────────────────────────────────────────┤
│  [ מור: קנייה 3 ]              [ בטל ]  ◷   │  undo snackbar (transient)
├─────────────────────────────────────────────┤
│  + שחקן        שיתוף    יומן    סיום משחק   │  action bar
└─────────────────────────────────────────────┘
      ▲ swipe up from here for the audit log
```

**Header** — game name and a running clock (needed for profit-per-hour, #24, and genuinely
useful at 2am). The chip value and buy amount are always visible: they're referenced constantly
and nobody should have to remember them. `⋯` opens game settings: rename, edit viewers, share,
hand over management, reopen/close, delete.

**Pot banner** ([01 §6.5](01-product-spec.md#65-pot-verification-20)) — compact and green when
balanced, expanded and red when not. Tapping the red state opens the resolution sheet. It sits
directly under the header so it's visible without scrolling, because a discrepancy discovered at
1am is much cheaper than one discovered at 2am.

### Player row anatomy

```
┌───────────────────────────────────────────────────┐
│  מור                                    ₪150   ⋯  │
│  💵 שילם ₪100         [ − ]   3   [ + ]           │
└───────────────────────────────────────────────────┘
```

- **Name** — right-aligned (RTL start). Tap to edit inline.
- **Amount owed** — `₪150`, the far end of the row. Large, tabular.
- **Buy counter** — `−  3  +`, bottom of the row, thumb height. The `+` is the largest target on
  the screen; the `−` is deliberately smaller and slightly separated, since decrement is rarer
  and more dangerous.
- **Cash indicator** (#18) — `💵 שילם ₪100` only when nonzero.
- **`⋯`** — opens the row action sheet, same as long-press.

Settled rows (#15): background dimmed to ~40% opacity, counter disabled, and the result replaces
the owed amount — `+₪120` / `−₪80` with a `🔒` glyph. They stay **in place** in the list rather
than jumping to the bottom, because people find each other by position; offer a
`הצג סגורים בסוף` toggle in settings for those who prefer otherwise.

Late joiners and removed players are visually distinct: a small `הצטרף 23:40` caption, and
removed rows are gone from the list but present in the log.

### The buy-in counter — the most important interaction in the app

You offered two options and asked me to choose. **I recommend a third that subsumes both**, and
here's the reasoning.

Per-row approve/cancel doubles the taps for the single most frequent action in the app, and puts
a confirmation on something that is trivially reversible. A batch bottom bar is better for
entering several rows at once, but it leaves the app in a "dirty" state — if the host gets
distracted mid-hand and never taps אישור, the data is wrong and nobody knows.

**Recommended: optimistic increment with a coalescing undo.**

1. Tap `+`. The number increments **immediately** with a short count-up animation, and the row's
   amount updates. Haptic tick.
2. A snackbar rises above the action bar: `מור: קנייה 3` with a **`בטל`** button and a 5-second
   countdown ring.
3. Rapid taps coalesce — three taps on Mor's `+` produce one snackbar reading `מור: +3 קניות`,
   with a single undo that reverts all three.
4. **If two or more different rows are touched inside the window, the snackbar automatically
   upgrades into your batch bar** — a compact list of per-row deltas with a total, and one
   `בטל הכל` plus an `אישור` that dismisses it immediately:
   ```
   מור +2   אורי +1   רני −1        סה"כ ₪+100      [ בטל הכל ]  [ אישור ]
   ```
5. The write is committed locally at once and pushed at the end of the window. Undo before the
   window closes appends the inverse event; after it closes, undo is still available from the
   audit log.

This gives one tap for the common case, an explicit confirmation surface exactly when several
things changed at once, no dirty state (the window always closes itself), and full reversibility.
Both of your original options remain reachable: if you'd rather have the strict batch behaviour
always, it's a settings flag on the same component.

**Guard rails:** the `−` button never goes below 0 and is disabled at 0. Decrementing a player to
0 buy-ins asks whether to remove them from the game.

### Inline name editing (#2)

Tap the name → it becomes a text input in place, focused, **text pre-selected**, keyboard open,
with the return key labelled `סיום`. Blur commits (tapping elsewhere on a phone means "done", not
"cancel"). Escape / the back gesture reverts. Duplicate names get the `(1)` suffix on commit,
with a brief toast explaining it (#9).

### Row action sheet

Long-press (500ms, with haptic) **or** tap `⋯`. Bottom sheet, because a floating context menu
near a fingertip is hard to reach one-handed and gets clipped at screen edges. Contents per
[01 §6.2](01-product-spec.md#62-the-player-list-2-9-14-15). Destructive items are last, separated,
and coloured; `הסרה מהמשחק` additionally requires confirmation when the player has buy-ins.

Long-press alone is not discoverable — hence the always-visible `⋯`. Additionally, show a one-time
coach mark on the first game: `לחיצה ארוכה על שחקן פותחת פעולות`.

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

### Action bar

Four items, full width, bottom of the screen:

| Item | Weight |
|---|---|
| `+ שחקן` | Primary, filled |
| `שיתוף` | Icon + label |
| `יומן` | Icon + label, opens the log drawer |
| `סיום משחק` | Muted until every player is settled, then becomes prominent |

I recommend a **bar rather than a floating action button**. In RTL a FAB mirrors to the
bottom-left, which is the *worst* corner for a right-handed thumb, and we need four actions
anyway. A bar sidesteps the mirroring question entirely and gives every action a text label —
which matters more in Hebrew, where icon conventions are less standardised.

`סיום משחק` stays visible but visually inert while players are open; tapping it early shows who's
still missing rather than an error.

### Audit log drawer (#22)

A grab handle at the very bottom edge. Swipe up or tap `יומן` to expand to ~60% height; swipe
down to dismiss. Newest first, live. Each entry: time · actor · what changed. Long-press an entry
to undo it (where reversible). Filter chips: `הכל` `קניות` `סגירות` `ניהול`.

### Connection state

A thin strip under the header when offline: `לא מחובר · 3 שינויים ממתינים`, amber, non-blocking.
It turns into a brief `סונכרן ✓` when it clears. Never a dialog — the app must keep working.

---

## Ending the game

**Slide to confirm** (#22), not a tap:

```
   ┌─────────────────────────────────────┐
   │  ⟵  החלק לסיום המשחק                │
   └─────────────────────────────────────┘
```

Preceded by a summary of what's about to be locked: player count, total pot, and — if the banner
is red — the discrepancy in bold with the resolution options, requiring a separate acknowledgement.

Then the settlement screen, fully specified in [05 — Settlement](05-settlement.md#edit-mode-16-17).

### Summary screen (after settlement)

- Per-player result cards, sorted by net descending. The winner gets a subtle celebratory
  treatment; do not make the biggest loser's card feel like a punishment.
- Transfer list with a `שולם` checkbox each, and a `wa.me` shortcut per person where a phone
  number exists.
- Bottom bar: **`שתף בוואטסאפ`** primary, `העתק טקסט` secondary.
- `פתח מחדש` available to the host for 24h, in the `⋯` menu, not on the main surface — with a
  countdown so it's clear the option expires (#22).

---

## Sharing (#5, #14)

`שיתוף` opens a sheet with three sections:

1. **Live link** — `העתק קישור` / `שתף`, plus the state: `הקישור פעיל · צפו 3 אנשים`, and
   `בטל קישור`. Explicit: `לצפייה בלבד — אי אפשר לערוך`.
2. **Viewers** — the in-app list, add from group members, remove with a swipe.
3. **Text** — `שתף כטקסט` with a live preview of exactly what will be sent (#8), because people
   want to know what they're pasting into a group chat.

### The viewer's experience

The same game page, live, with every control removed rather than disabled — no ghost `+` buttons.
A banner at the top: `צפייה בלבד`. If the viewer is signed in and is a player in this game, show
*their* row highlighted and their running result, since that's the only number they care about.

---

## Statistics

Two tabs: **`שלי`** and **`החבורה`** ([06](06-statistics.md)).

- Lead with two or three big numbers, not a table. On `שלי`: total net (the number everyone
  actually wants), games played, win rate.
- A sparkline of cumulative net over time. This is the single most compelling thing you can show
  a poker player.
- Then the detail table, horizontally scrollable inside its own container so the page never
  scrolls sideways.
- Every rate shows its sample size: `62% (13 משחקים)`. Suppress rates under 5 games and show
  `נתונים חלקיים` instead — a 100% win rate from one game is a lie.
- Leaderboards let you switch the sort metric via chips, rather than tiny column headers.

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
- Red/green is always paired with a sign, icon or text ([05](05-settlement.md#edit-mode-16-17)).
- Full keyboard operability for desktop use (the host might use a laptop).
- Screen-reader labels in Hebrew on every icon-only control; `aria-live` on the running totals
  and the pot banner.
- Support text scaling to 200% without clipping — use `rem`, avoid fixed-height rows.
