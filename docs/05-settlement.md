# 05 — Money, the Pot, and Settlement

This is the part that has to be provably correct. `src/core/settlement.ts` must be a pure module
with no framework imports and exhaustive tests.

Amounts here are written in shekels for readability. Internally everything is an integer in the
currency's minor unit ([03](03-data-model.md#money-representation)) — never a float — and nothing
user-facing ever mentions minor units.

## The money model

Per game: `buy_amount` B, `chips_per_buy` C, so **chip value** = B / C.
Example: B = ₪50, C = 100 → each chip is ₪0.5 (#13).

Per player p:

```
owed(p)     = buys(p) × B                      // what they must put into the game
cashPaid(p) = cash physically handed to the pot at the table          (#18)
cashOut(p)  = chips(p) × B / C                 // what their chips are worth
shared(p)   = what they paid for shared costs − their share of shared costs
```

Three numbers come out of this, and conflating them is the bug that would break the app:

```
net(p)      = cashOut(p) − owed(p)                              ← STATISTICS. Did they win at poker?
balance(p)  = cashOut(p) − owed(p) + cashPaid(p) + shared(p)    ← SETTLEMENT. What still has to move?
```

Cash already handed over is an obligation already discharged, so it is added back when working out
who still has to pay whom. It must **not** be added back when asking whether the player had a good
night. Shared costs move money between people but have nothing to do with poker, so they belong in
`balance` and never in `net`.

### The pot as a settlement node

Let `P = Σ cashPaid(p)` — the physical cash sitting on the table.

Model the pot as an extra participant with:

```
balance(pot) = −P
```

The pot is a debtor: it owes P out to the room. The bookkeeping then closes exactly:

```
Σ balance(p) + balance(pot)
  = Σ cashOut − Σ owed + Σ cashPaid + Σ shared − P
  = Σ cashOut − Σ owed              (cash terms cancel; shared costs sum to zero by construction)
  = 0                               (when chips balance — see the safeguard below)
```

So the pot needs no special-casing anywhere: feed it into the same algorithm as a node named
**`קופה`**, and "Dana takes ₪120 out of the cash on the table" comes out as an ordinary transfer
`מהקופה לדנה — ₪120`. Requirement #18 satisfied with no extra code path.

**Worked example.** B = ₪50. Rani bought in twice and paid ₪100 cash. He cashes out ₪60.

```
owed = 100, cashPaid = 100, cashOut = 60
net     = 60 − 100        = −40   ← statistics: he lost ₪40 tonight
balance = 60 − 100 + 100  = +60   ← settlement: he is owed ₪60 back, from the pot
pot balance = −100
```

One transfer, `מהקופה לרני — ₪60`, and ₪40 of his cash stays in the pot to pay the winners.
Correct, and it fell straight out of the model.

**One heuristic on top:** drain the pot first. Physical cash on the table is the easiest money to
move — nobody has to open an app. So before the general algorithm runs, greedily match the pot
against the largest creditors. This never increases the transfer count (the pot is a single node
either way) and it reduces the number of *digital* transfers people actually have to make.

## Shared costs

₪120 of pizza, split six ways, paid by whoever ordered it. Common enough at a home game to be
worth handling properly, and completely separate from the poker money.

```
share(p, cost)  = cost.amount / n   (equal split)  or an entered amount (custom split)
shared(p)       = Σ costs they paid  −  Σ their shares
```

`Σ shared(p) = 0` by construction, so adding shared costs never breaks the settlement balance.

- Equal split defaults to **everyone in the game**, including players who have already settled and
  gone home — they ate the pizza. The host can deselect people.
- The payer can be the pot (`שולם מהקופה`), in which case the cost simply reduces what the pot
  pays out.
- Custom split is an amount per person, with a running remainder shown so it must add up.
- Shared costs appear as a separate line in the results (`פיצה — ₪20`) so nobody thinks they lost
  ₪100 at cards when ₪20 of it was dinner.
- Statistics track them separately, never inside poker net
  ([06](06-statistics.md#personal-statistics-12)).

## The safeguard (#20)

Everything above assumes `Σ cashOut = Σ owed`. In real life it never does on the first try.

```
totalBuyIns = Σ owed(p)
totalChips  = Σ cashOut(p)
discrepancy = totalBuyIns − totalChips
```

- `discrepancy = 0` → 🟢 `מאוזן · קניות ₪600 = ז'יטונים ₪600`
- `discrepancy ≠ 0` → 🔴 `פער של ₪20 · קניות ₪600 · ז'יטונים ₪580`

A positive discrepancy means chips went missing (dropped, miscounted, someone left with chips in
their pocket). Negative means someone was credited chips that weren't bought.

Resolution options offered in the banner:

1. **Fix the counts** — jump to the list of settled players with their chip counts, most recently
   entered first, for a quick re-check.
2. **Assign to the house** — `unaccounted_minor` absorbs the difference. It becomes a node in the
   settlement graph so the math closes, and it's tracked as a long-term statistic.
3. **Split evenly among players** — an alternative some tables prefer. Offer it, don't default
   to it.

Ending the game with a red banner is allowed but requires an explicit, separate confirmation — the
discrepancy must be a decision, never an accident.

## Rounding and precision

- All arithmetic on **integers in the currency's minor unit**. Never floats, never `parseFloat` on
  user input.
- `cashOut = chips × B / C` can land on a fraction of an agora (e.g. 7 chips at ₪0.333). Round
  half-to-even per player, then push the accumulated residue onto the largest `|balance|` so the
  totals still sum to zero. Test this explicitly.
- Optionally let the host set a **transfer rounding** of ₪1 or ₪5 ("nobody sends ₪37.50"). If
  enabled, round each transfer and assign the residue to the biggest winner, and say so:
  `עוגלו ₪2 לטובת מור`. Off by default.
- The rounding rules are per-currency, not hardcoded to two decimal places, since other currencies
  are coming.

## Minimum-transfer algorithm (#19)

Input: the list of nonzero balances (players + the pot node + the unaccounted node).
Output: the smallest set of transfers that settles everyone, exactly as in your example.

### Step 1 — cancel exact pairs

Any debtor whose `|balance|` exactly equals a creditor's balance is matched immediately: one
transfer, both settled. This is common in practice and removes them from the harder problem below.

### Step 2 — exact optimum for small tables

The true minimum is `n − k`, where `k` is the largest number of disjoint subsets of the balances
that each sum to zero. Finding `k` is NP-hard in general, but a home poker table has at most ~12
nodes, which is trivially small for a bitmask DP:

```
sum[mask] = Σ balance[i] for i in mask
dp[0] = 0
for mask in 1 .. 2^n − 1:
    if sum[mask] ≠ 0: dp[mask] = −∞; continue      // can't be partitioned into zero-sum groups
    dp[mask] = −∞
    low = lowest set bit of mask                    // fix an element to avoid counting permutations
    for each submask sub of mask containing low:
        if sum[sub] ≠ 0: continue
        if dp[mask ^ sub] ≥ 0:
            dp[mask] = max(dp[mask], dp[mask ^ sub] + 1)
minTransfers = n − dp[full]
```

`O(3ⁿ)`. At n = 12 that's ~531k iterations — under a millisecond. Then run the simple greedy
*within each zero-sum group*, which is guaranteed optimal there (`|group| − 1` transfers).

### Step 3 — greedy fallback

Above **n = 14**, skip the DP and use greedy alone: repeatedly match the largest debtor against
the largest creditor. This yields at most `n − 1` transfers — never worse than what people do by
hand, and the gap from optimal is rare and small. Your worked example produces exactly the three
transfers you described.

### Tie-breaking

When several assignments give the same transfer count, prefer, in order:

1. The pot as payer (physical cash beats a digital transfer).
2. Fewer transfers *per person* — nobody should have to send four separate payments.
3. Rounder numbers.
4. Stable ordering by seat, so re-running the calculation doesn't reshuffle the list under
   someone's finger.

### Invariants the tests must assert

Property-based, over randomly generated games:

- Every player's transfers sum exactly to their balance.
- Σ transfers out = Σ transfers in.
- No transfer has a negative or zero amount.
- No self-transfers.
- Transfer count ≤ n − 1, and equals the DP optimum for n ≤ 12.
- Adding a set of shared costs that sums to zero never changes the transfer count by more than the
  number of people involved in them.
- Result is deterministic for identical input.
- Recomputing after a manual edit is idempotent.

## Edit mode (#16, #17)

The host can override any transfer. This is a genuinely tricky screen; here is the whole
behaviour.

**Layout** — settlement screen, top to bottom:

1. **Sticky balance banner**
   `שויך ₪430 מתוך ₪480 · חסר ₪50` with a progress bar, or `הכל שויך ✓` in green.
2. **Results section** — every player with their poker result and their settlement balance, plus a
   shared-costs line where relevant. Collapsible.
3. **Transfer list** — the editable part.
4. **Bottom bar** — `שתף כטקסט` · `חשב מחדש` · `סיים`.

**A transfer row in edit mode:**

```
┌──────────────────────────────────────────────┐
│  מור  ←  אורי             [  ₪50  ]     🗑️  │
└──────────────────────────────────────────────┘
```

- Tapping a name opens a **chip picker bottom sheet listing only this game's players plus
  `קופה`** (#17). Not a native `<select>` — a grid of tappable name chips, big targets, current
  selection highlighted, already-settled people dimmed but still selectable.
- Tapping the amount opens a numeric keypad inline; the field is pre-selected so typing replaces.
- `+ הוסף העברה` at the bottom of the list.
- Deleting a transfer is a swipe or the trash icon, with undo in the snackbar.

**Per-player correctness colouring** (#16). Under the transfer list, a compact per-player strip:

| Column | Hebrew | Meaning |
|---|---|---|
| Name | שם | |
| Should move | אמור | Their `balance` |
| Actually assigned | בפועל | Σ of their transfers, signed |
| Difference | פער | `בפועל − אמור`, shown as `+₪20` / `−₪15` / `✓` |

- 🟢 green row: difference is exactly zero — this person's transfers match what they owe.
- 🔴 red row: they're over or under.

**Colour is never the only signal.** Every row also carries `✓` or a signed number, because
red/green is invisible to a meaningful share of people and unreadable in a dim living room.

Recomputing (`חשב מחדש`) discards manual edits, so it asks first once any `is_manual` transfer
exists.

## Payment links — reality check (#23)

You asked for Bit / PayBox deep links. Being straight with you about what's actually possible:

- **Bit has no public, documented deep-link scheme** for "request ₪50 from this phone number".
  Their URL scheme is not an open API, and anything found by reverse-engineering will break without
  warning and can't be relied on for an app your friends depend on.
- **PayBox** is likewise closed for arbitrary third-party payment intents.

What genuinely works, today, on both platforms, and covers most of the actual benefit:

1. **`wa.me` links.** If a player has a phone number on their profile, generate
   `https://wa.me/9725XXXXXXXX?text=...` with a pre-filled message:
   `מור, מהפוקר של אתמול: ₪50 🙏`. One tap from the settlement screen straight into that person's
   WhatsApp chat. This is what people do anyway.
2. **Copy-to-clipboard on everything.** Tap an amount → copied. Tap a phone number → copied.
   Removes the retyping errors that cause wrong transfers.
3. **`tel:` links** for the rare phone call.

Deliberately **not** included: a "mark as paid" checkbox. Whoever receives the money has no reason
to come back into the app and tick it, so the list would be permanently half-empty and would look
like unpaid debts that were actually settled hours ago.

Keep the payment-provider integration behind a small interface so that if Bit ever publishes a
scheme, it drops in without touching the settlement screen.

## Share text (#8, #16)

Templates in [07 — Hebrew glossary](07-hebrew-glossary.md#share-text-templates). Rules:

- Plain text, no markdown — WhatsApp mangles it.
- Every transfer on its own line.
- Emoji as visual anchors only; the text must be fully understandable without them.
- Two variants: **live status** (mid-game) and **final settlement**.
- Use the Web Share API where available, falling back to copy-to-clipboard with a toast.
- Generated from the same data as the finished-game share link, so the text and the link can never
  disagree.
