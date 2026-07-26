# 10 — Design Brief

Handoff package for the design pass. Read [04 — UX spec](04-ux-spec.md) first for structure and
behaviour; this document covers visual direction, the component inventory, and the full list of
states that need designing.

## Product in one line

A Hebrew, RTL, dark-first mobile web app for tracking money in a friendly home poker game —
buy-ins, chips, cash, and who owes whom at the end of the night.

## Who it's for, and where

Six friends around a kitchen table on a Thursday night. One of them — the host — is holding the
phone in one hand while dealing with the other, in a dimly lit room, slightly drunk, being
interrupted every twenty seconds. Everyone else glances at their own phone occasionally to check
they've been credited correctly.

**The design succeeds if the host never has to look at the screen for more than two seconds at a
time.**

## Tone

Warm and casual, not corporate fintech. This is friends' money, not a banking app — but the
numbers must feel trustworthy and precise. Poker-adjacent, not poker-themed: a felt-green
gradient and playing-card motifs everywhere would be tacky and would hurt legibility. One or two
restrained nods (a card-suit glyph in the logo, chip-shaped counters) are enough.

Avoid anything that gamifies losing money. The player who dropped ₪200 should not get a sad
animation.

## Visual direction

**Dark theme is the default and the primary design target.** A light theme should exist and be
correct, but the dark one is what will actually be used. Design dark first — contrast problems
in dark themes are usually discovered last.

Suggested palette direction (for the designer to refine, with contrast verified in both themes):

| Role | Direction |
|---|---|
| Surface | Deep neutral, slightly warm — not pure black; OLED black makes the count-up animations flicker |
| Primary | A single confident accent for primary actions. Green reads as "money/win", so consider reserving green for results and using something else (deep amber, teal) for actions |
| Positive | Green — wins, balanced pot, correct rows |
| Negative | Red — losses, discrepancy, incorrect rows |
| Muted | Settled rows at ~40% opacity, still legible |

**Colour must never be the only carrier of meaning.** Every positive/negative value also has an
explicit `+` / `−`, and every correct/incorrect row also has `✓` or a signed difference.
→ [04](04-ux-spec.md#accessibility)

Typography: Rubik or Heebo, self-hosted, subset to Hebrew + Latin + digits. Tabular figures on
all numbers. Hebrew has no casing, so hierarchy comes entirely from size, weight and colour —
expect to need more weight contrast than a Latin design would.

Density: generous. Tap targets ≥ 48px, spacing ≥ 8px between adjacent targets. Fewer things on
screen, bigger.

## Layout rules

- **RTL at launch, but not forever.** Hebrew ships first; English and other languages are planned.
  Mirror everything, and never let a layout depend on RTL being true. See
  [04 — RTL and Hebrew](04-ux-spec.md#rtl-and-hebrew) for the specific traps, especially the
  number/currency bidi isolation rule and composed names like `הכריש (mor_l)`.
- **Design for longer strings than the Hebrew ones.** Hebrew runs ~15% shorter than English; if the
  layout only just fits in Hebrew, it will break the day a second language lands.
- **Everything interactive lives in the bottom third.** Content scrolls above; actions stay in
  thumb reach.
- **A bottom action bar, not a floating action button.** Reasoning in
  [04](04-ux-spec.md#action-bar).
- Sticky header carries persistent context (chip value, buy amount, elapsed time) that gets
  referenced constantly.
- Bottom sheets, not popovers or dropdowns, for every menu and picker.

## Component inventory

| Component | Notes |
|---|---|
| `<Money>` | The most important component in the app. Signed, LTR-isolated, tabular, sized variants, positive/negative treatment. Currency comes from the game, never a hardcoded `₪` |
| Player name | Composed: a guest name, a display name, or `nickname (username)` — needs to stay legible when the parenthetical is long |
| Player row | Active / settled / late-joiner / pending-sync states, with a tappable cash-paid figure |
| Buy counter | `−  n  +`, asymmetric target sizes, count-up animation, disabled at 0 |
| Undo snackbar | Single-row form showing buy-ins + chips + money, and the multi-row batch form with per-row lines and a total, both with a countdown ring |
| Sync indicator | Top-corner, four states (synced / syncing / pending count / failed), plus its expanded panel |
| Pot banner | Balanced (compact green) and mismatch (expanded red, with actions) |
| Shared-costs line | Compact summary under the pot banner, plus the add/split sheet with a live per-person figure |
| Bottom sheet | Base container for action sheet, settle sheet, chip picker, cash sheet, share sheet |
| Row action sheet | Grouped items, destructive group separated at the end |
| Settle sheet | Big numeric input, live conversion caption, quick-value chips |
| Name chip picker | Wrapped grid of tappable names, selected state, dimmed-but-selectable |
| Transfer row | Read mode and edit mode (two name buttons + amount field + delete). **No paid checkbox** |
| Balance banner | Sticky, with progress bar and complete state |
| Per-player reconciliation strip | אמור / בפועל / פער with colour + sign |
| Slide-to-confirm | End-game only |
| Takeover modal | Shows the outgoing host's sync state; the tone escalates green → amber → red with staleness |
| Destructive confirm | Used for delete-game, which must explain that statistics survive |
| Audit log drawer | Grab handle, expandable, filter chips, live entries |
| Stat hero number | Large signed value with a label and sample size |
| Sparkline | Cumulative net over time |
| Leaderboard row | Rank, name, metric, sample size |
| Fun-stat card | Seven of them; these get screenshotted into the group chat, so they should look good alone |
| Results card | A finished game whose details were purged — must read as complete, not broken |
| Empty states | Per screen — see below |

## States to design (not just the happy path)

For each screen: **loading · empty · error · offline · read-only (viewer) · at 200% text scale.**

Specific ones that matter:

- Home with no games ever played
- Home with a live game in progress (the pinned card)
- Game with zero players added yet
- Game where every player is settled (end-game becomes prominent)
- Game with a red pot discrepancy
- Game with shared costs added
- Settlement where everyone broke even (no transfers needed — a real and delightful case)
- Settlement mid-edit, partially assigned
- Shared link that has been revoked, expired, or points at a purged game
- **Viewer, live game** — read-only, signed in vs. anonymous
- **Viewer, finished game** — the settlement-only view, which is what most link recipients actually
  open, since links get read after everyone's gone home
- Statistics with fewer than 5 games (`נתונים חלקיים`)
- Offline with pending changes, and the failed-sync state
- Host takeover modal at each sync-staleness level
- A finished game past its 24h reopen window
- **An archived game whose details were purged** — results card only, no audit log

## Motion

Restrained and functional. Numbers count up (~200ms) so the eye catches what changed. Sheets
spring up from the bottom edge. The undo countdown is a visible ring, not a hidden timer. Row
settle is a fade-to-dim, not a slide-away — the row must stay in place.

Respect `prefers-reduced-motion`: replace all of the above with instant state changes.

## What not to design

- Onboarding carousels. The first screen should be `התחל משחק ראשון`.
- Avatars beyond what Google auth provides for free.
- Anything that requires an illustration set to be commissioned.
- A tablet or desktop layout in v1. Make it not-broken at wide widths (a centred max-width
  column) and stop there.

## Reference reading

- [04 — UX spec](04-ux-spec.md) — structure, interaction, every screen
- [07 — Hebrew glossary](07-hebrew-glossary.md) — exact wording; do not invent new terms
- [05 — Settlement](05-settlement.md#edit-mode-16-17) — the most complex screen in the app
- [08 — Gaps](08-gaps-and-open-questions.md) — open decisions that may still move the design
