# 11 — Visual Design

The resolved answer to the brief in [`10`](10-design-brief.md). `10` set the constraints and left
the palette and typeface open; this document closes them with the values actually used in the
chosen design.

**Source.** The interactive prototype in [`design/prototype/`](design/prototype/), built in Claude
Design from `docs/01`–`docs/10` ([provenance](design/handoff.md)). Every value below is extracted
from it, not eyedropped from a screenshot. Open
[`poker-tracker.dc.html`](design/prototype/poker-tracker.dc.html) in a browser to use it.

**Authority.** This document decides *appearance*. `docs/01`–`docs/09` decide *behaviour*. Where
they collide, the spec wins — see [Collisions](#collisions-with-the-spec), which is the section to
read before building any screen from the prototype.

---

## Colour

Dark is the primary target, as `10` requires. The surfaces are a warm near-black rather than pure
black, which is what `10` asked for so the count-up animations don't flicker on OLED.

### Surfaces

| Token | Value | Used for |
|---|---|---|
| `surface-base` | `#0E0C09` | The page behind everything |
| `surface-app` | `#14110D` | App background inside the frame |
| `surface-card` | `#1E1913` | Cards, rows, sheets — the workhorse, 32 uses |
| `surface-raised` | `#272119` | Secondary buttons, chips, raised controls |
| `surface-amber-dim` | `#2B2419` | Toast and amber-tinted containers |

### Accent, and why it isn't green

| Token | Value | Used for |
|---|---|---|
| `accent` | `#E9A23C` | Primary actions — the `+`, primary buttons, active nav, links |
| `accent-hover` | `#F4B95A` | Link hover |
| `on-accent` | `#1A1508` | Text and glyphs **on** amber. Never white on amber |

This follows `10`'s reasoning exactly: green reads as "money/win", so it is reserved for results and
a warm amber carries the actions instead.

### Result colours

| Token | Value | Used for |
|---|---|---|
| `positive` | `#4FC98A` | Wins, balanced pot, correct rows |
| `positive-bright` | `#7FE0AC` | Emphasis on a positive figure |
| `negative` | `#EF6B63` | Losses, discrepancy, incorrect rows |
| `negative-soft` | `#F0A5A0` | Softer negative text |
| `tint-positive` | `#0C2417`, `#1C2A1E` | Green banner fills |
| `tint-negative` | `#241B1A` | Red banner fills |

**These are never the only signal.** The prototype pairs them with `+`/`−` and `✓`, as
[`04 — Accessibility`](04-ux-spec.md#accessibility) requires. Keep that pairing when adding any
state the prototype doesn't cover.

### Text and lines

Foreground is one warm off-white, `#F4EFE7`, varied by alpha rather than by hue:

| Role | Value |
|---|---|
| Primary text | `#F4EFE7` |
| Secondary | `rgba(244,239,231,.6)` – `.7` |
| Tertiary / captions | `rgba(244,239,231,.4)` – `.55` |
| Disabled | `rgba(244,239,231,.2)` – `.32` |
| Hairline border | `rgba(244,239,231,.07)` – `.16` |

Settled rows dim to roughly `10`'s ~40% and stay legible.

---

## Typography

**Rubik**, weights 400–800. The prototype pulls it from Google Fonts; we **self-host a Hebrew +
Latin + digits subset** instead ([`02`](02-architecture.md#hosting-details)) — same typeface, no
third-party request, works offline.

Hebrew has no casing, so hierarchy comes from size and weight alone. The design leans on weight
harder than a Latin design would: **600 and 700 are the workhorses** (61 and 59 uses), 800 for hero
numbers, 400 barely appears.

| Step | Size | Typical use |
|---|---|---|
| caption | 10–11px | Labels, metadata, sample sizes |
| body-sm | 12–13px | Row secondary text, captions — the most common sizes in the app |
| body | 14–15px | Body text, buttons |
| title | 16–17px | Row names, sheet titles |
| heading | 18–20px | Screen titles |
| hero | 22–30px | Buy counts, money figures, stat heroes |

Every numeral is `font-variant-numeric: tabular-nums`, and money carries
`direction:ltr; unicode-bidi:isolate` — the prototype already does this on the cash-paid figure,
which is the rule [`04`](04-ux-spec.md#rtl-and-hebrew) demands and the reason `<Money>` exists.

---

## Shape, spacing, motion

**Radii.** `14px` is the default (38 uses), `12px` for tighter elements, `999px` for pills,
`15–16px` for large touch targets. Not a scale to reinvent — match it.

**Spacing.** Multiples that recur: `9px` (the dominant gap), `12px`, `10px`, `7px`, `16px`.
Padding clusters at `12–14px`.

**Motion**, straight from `10`, already implemented in the prototype:

| Animation | Behaviour |
|---|---|
| `pt-ring` | The undo countdown ring — a visible stroke, not a hidden timer |
| `pt-up` | Content rising 14px with a fade |
| `pt-sheet` | Sheets springing from the bottom edge |
| `pt-fade` | Toasts |

`@media (prefers-reduced-motion:reduce)` kills all animation and transition. Keep that.

---

## Surface treatment

Missed in the first extraction pass (step 3) and re-extracted 2026-07-29 — the flat surface colours
above are not the whole story. The prototype's depth comes from three recurring, systematic
treatments, now real tokens in `tokens.css` rather than one-off values:

**Tinted card gradients.** An elevated or emphasised card gets a subtle `150deg` two-stop gradient
tinted toward its semantic colour, not a flat `surface-raised` fill:

| Token | Value | Used for |
|---|---|---|
| `--gradient-card-accent` | `linear-gradient(150deg,#241d12,#1b1610)` | The active-game card on Home |
| `--gradient-card-positive` | `linear-gradient(150deg,#1c2a1e,#1a1610)` | A leading/winning row (e.g. leaderboard #1) |
| `--gradient-card-negative` | `linear-gradient(150deg,#241b1a,#1a1610)` | A negative-themed card |
| `--gradient-card-neutral` | `linear-gradient(150deg,#3a2f1f,#241d12)` | Avatar-circle placeholders |

**Status glow.** A live/positive status dot carries a matching-colour glow, not just a filled
circle: `--shadow-glow-positive` (`0 0 8px` in `--color-positive`). Used on the "live game" marker
and the read-only viewer's "live" indicator.

**Overlay elevation.** Toasts (and, by the same logic, anything else floating above the page) carry
`--shadow-elevation` (`0 8px 24px rgba(0,0,0,.5)`), not just a border.

Tailwind v4 turns `--shadow-*` entries into real `shadow-*` utilities automatically
(`shadow-elevation`, `shadow-glow-positive`); the `--gradient-*` entries are custom properties only
— use them via `bg-[image:var(--gradient-card-accent)]` or, in an SCSS module, `background:
var(--gradient-card-accent)`.

**Not retrofitted.** Home, NewGame, GamePage and their sheets (built in steps 6–7) were not redone
to pick these up — see `docs/build/NOTES.md`. New and touched screens from here on should reach for
them wherever the prototype uses one instead of a flat surface colour.

---

## Screens covered

Nine, reachable from the prototype's own nav: **home · new · game · settle · summary · stats ·
profile · group · viewer**.

The live game screen is the one to study hardest — it is the app. It shows the sticky header
(game name, elapsed time, buy amount, chip value, player count), the green `מאוזן` pot banner, and
player rows carrying the composed name (`הכריש (מור לוי)` with `@mor_l`), the running total, the
buy counter and the cash-paid figure.

### The buy counter, as built

The most important interaction in the app ([`04`](04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)),
and the prototype gets its structure right:

| Element | Spec |
|---|---|
| `+` | 56×50px, radius 15, `accent` fill, `on-accent` glyph, 28px/700, `scale(.94)` on press |
| count | 22px/700, tabular, `direction:ltr`, min-width 34px so it doesn't jump |
| `−` | 44×44px, radius 13, transparent, hairline border, dims to `.2` at zero |

Asymmetric target sizes, exactly as `04` calls for — the `+` is the one you hit all night. See the
collision note about the `−` size below.

---

## Collisions with the spec

Real conflicts found in the prototype. **In every case the spec wins and the design is adapted.**

1. **The `−` is 44×44px; the rule is ≥ 48px.** `10` and `CLAUDE.md` both set 48px as the floor.
   Grow it to 48 and keep the asymmetry by growing `+` alongside it — the intent of asymmetry is
   relative weight, not an undersized decrement.
2. **Rubik is loaded from Google Fonts.** [`02`](02-architecture.md#hosting-details) requires
   self-hosting a subset: faster, offline-capable, no third-party request. Same typeface, different
   delivery.
3. **The prototype is a single-file mock with inline styles and hardcoded Hebrew.** It is a visual
   reference, not code to merge. The real build routes every string through `i18next`, every amount
   through `<Money>`, and every mutation through the event model. Lifting the markup wholesale
   would strip all three.
4. **Physical CSS throughout.** Inline `left`/`right`/`padding:a b c d` are fine in a mock that is
   always RTL; the app must use logical properties only, because the pseudo-locale runs LTR and
   English is planned.

None of these change how anything *looks*. If a future session finds a collision that would, it
resolves in the spec's favour, records it in [`build/NOTES.md`](build/NOTES.md), and says so.

---

## What the design does not cover

Nine screens in their happy path. [`10`](10-design-brief.md#states-to-design-not-just-the-happy-path)
requires roughly forty states, and **silence here is a gap to fill in this design's own language,
never a decision that a state isn't needed**. Missing and needed:

loading · empty · error · offline-with-pending-changes · failed sync · 200% text scale ·
the red pot discrepancy · settlement where everyone broke even · a revoked, expired or purged share
link · the host-takeover modal at each staleness level · the announcement banner · join-request and
claim rows · the group invite flow and its no-such-username state · the `פרטי` badge and private-game
consequence line · the audit log with `בוטלים` on · a finished game past its 24h reopen window ·
a purged game's results card · and every screen under the pseudo-locale.

There is also **no light theme** in the prototype. `10` says light must exist and be correct but is
secondary; deriving it is step 3's job, and the alpha-based text ramp above makes that tractable.
