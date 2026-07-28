# The chosen design — reference assets

The visual direction is settled: the **poker tracker design** from Claude Design is the one.
This folder holds it, and `docs/11-visual-design.md` (written once the assets land) reads it back
as a specification.

## What this folder is, and is not

[`docs/10-design-brief.md`](../10-design-brief.md) is the **brief** — the constraints handed *to* a
design pass. It deliberately stops short of deciding: the palette is "for the designer to refine",
the typeface is "Rubik or Heebo". This folder is the **answer** to that brief. Both stay: 10 says
why, this says what.

It is a **mockup**, so it is authoritative about *appearance* and silent about most *behaviour*.
That distinction is the whole reason this README exists — see the precedence rule below, which is
the one thing to read before building a screen from these files.

## Precedence — read this before copying anything

| Question | Decided by |
|---|---|
| Colour, type scale, spacing, radii, elevation, iconography, density, motion | **The design** |
| What a control *does*, where it lives, what it's called, which states exist | **`docs/01`–`docs/09`** |

Where they disagree, the spec wins on interaction and the design gets adapted to it. The
disagreements to expect, because the spec is unusually specific about them:

- **Bottom sheets, never dropdowns or popovers**, for every menu and picker
  ([`04`](../04-ux-spec.md)). A mockup that shows a dropdown gets rebuilt as a sheet in the
  design's own visual language.
- **A bottom action bar, never a floating action button**
  ([`04 — Action bar`](../04-ux-spec.md#action-bar)).
- **Everything interactive in the bottom third**, tap targets ≥ 48px, ≥ 8px apart.
- **Colour is never the only carrier of meaning** — if the design distinguishes win from loss by
  green and red alone, the `+`/`−` is added.
- **Hebrew wording comes from [`07`](../07-hebrew-glossary.md)**, which says plainly: do not invent
  new terms. Any label in the mockup that differs from the glossary is a mockup typo, not a
  rename.
- **Logical properties only.** However the design is exported, no `left`/`right` survives into the
  code.

A future session that finds a genuine conflict not listed here resolves it in the spec's favour,
records it in [`../build/NOTES.md`](../build/NOTES.md), and says so — rather than quietly building
the mockup.

## What to put here

- `screens/` — every screen as exported, named for the screen it shows (`home.png`,
  `game-live.png`, `settlement-edit.png`…).
- `tokens/` — the palette, type scale and spacing as values, if the design can export them.
  Values beat eyedropping a screenshot.
- `code/` — any React/CSS the design tool emits. Read as **reference for the visual result**, not
  as code to merge: it won't carry the i18n, the logical properties, the `<Money>` component or the
  event model, and retrofitting those is more work than building the component correctly once.
- `NOTES.md` — what the design covers, what it doesn't, and any deliberate departure from it.

## Known gaps to expect

A mockup covers the happy path. [`10 — States to design`](../10-design-brief.md#states-to-design-not-just-the-happy-path)
lists roughly forty states this app actually needs, and silence in the design is **not** a decision
that a state isn't needed. The ones most likely to be missing, and which step 3 must therefore
derive from the design's own language rather than copy:

loading · empty · error · offline-with-pending-changes · failed sync · read-only viewer ·
200% text scale · the red pot discrepancy · settlement where everyone broke even · a revoked,
expired or purged share link · the host-takeover modal at each staleness level · a purged game's
results card · and every screen under the pseudo-locale, which runs LTR and ~40% longer than
Hebrew.

## Getting the files in

`DesignSync` cannot authorise in this environment (it needs an interactive terminal, and this is a
web session), so the assets can't be pulled automatically from here. Either:

- use **"Send to Claude Code Web"** in Claude Design, which seeds the project into the workspace; or
- export the screens and drop them in this folder directly.

Either way, once they're here, the next session writes `docs/11-visual-design.md` from them and
step 3 has a concrete target instead of a suggestion.
