# 07 — Hebrew Glossary and Share Templates

One canonical Hebrew term per concept. Inconsistent terminology is the fastest way to make a
small app feel amateurish. All strings live in `src/i18n/he.ts`; nothing is hardcoded in
components, so English becomes a drop-in later if ever wanted.

Have a native speaker review this list once before implementation — some of these are colloquial
choices, not dictionary ones, and the colloquial choice is usually the right one for a poker
table.

## Core terms

| English | Hebrew | Notes |
|---|---|---|
| Buy-in | קנייה | Plural: קניות. `כניסה` is also heard; pick one and never mix |
| Buy amount | סכום קנייה | |
| Chips | ז'יטונים | `צ'יפים` is equally common; ז'יטונים reads better in a UI |
| Chips per buy | ז'יטונים לקנייה | |
| Chip value | שווי ז'יטון | Displayed as `ז'יטון = ₪0.5` |
| Cash | מזומן | |
| The pot (physical cash) | קופה | |
| Game | משחק | |
| Group / table | חבורה | `שולחן` if you prefer the poker metaphor |
| Host / manager | מנהל המשחק | Short form in badges: `מנהל` |
| Player | שחקן | |
| Guest | אורח | |
| Viewer | צופה | |
| Settle a player | סגירת שחקן | The verb: `לסגור` |
| Reopen | פתיחה מחדש | |
| End game | סיום משחק | |
| Transfer | העברה | Plural: העברות |
| Balance | יתרה | |
| Discrepancy | פער | |
| Profit / loss | רווח / הפסד | |
| Net result | תוצאה | |
| Total | סה"כ | |
| Activity log | יומן פעילות | Short: `יומן` |
| Share | שיתוף | |
| Statistics | סטטיסטיקה | |
| Paid | שולם | |

## Common UI strings

| Context | Hebrew |
|---|---|
| Confirm | אישור |
| Cancel | ביטול |
| Undo | בטל |
| Delete | מחיקה |
| Edit | עריכה |
| Save | שמירה |
| Add player | הוסף שחקן |
| Add guest | הוסף אורח |
| New game | משחק חדש |
| Start game | התחל משחק |
| Duplicate last game | שכפל משחק אחרון |
| Recalculate | חשב מחדש |
| Share as text | שתף כטקסט |
| Copy link | העתק קישור |
| Copy text | העתק טקסט |
| View only | צפייה בלבד |
| Offline | לא מחובר |
| Pending changes | שינויים ממתינים |
| Synced | סונכרן |
| Hand over management | העבר ניהול |
| Claim profile | חבר את הפרופיל שלי |
| Games (tab) | משחקים |
| Statistics (tab) | סטטיסטיקה |
| Profile (tab) | פרופיל |
| Mine / The group (stats tabs) | שלי / החבורה |

## Messages

| Situation | Hebrew |
|---|---|
| Pot balanced | `מאוזן · קניות ₪600 = ז'יטונים ₪600` |
| Pot mismatch | `פער של ₪20 · קניות ₪600 · ז'יטונים ₪580` |
| Mismatch prompt (#20) | `יש פער של ₪20. תקנו את ספירת הז'יטונים, או שייכו את ההפרש ל"לא מזוהה / הבית" לפני החישוב.` |
| Buy-in snackbar | `מור: קנייה 3` |
| Batch snackbar | `מור +2 · אורי +1 · רני −1 — סה"כ ₪100+` |
| Duplicate name (#9) | `השם כבר קיים במשחק — נוסף בתור "מור (1)"` |
| Same person? | `זה אותו בן אדם? אפשר לחבר את האורח לחשבון קיים` |
| Slide to end | `החלק לסיום המשחק` |
| Players still open | `יש 2 שחקנים שעדיין לא נסגרו` |
| Settlement incomplete | `שויך ₪430 מתוך ₪480 · חסר ₪50` |
| Settlement complete | `הכל שויך ✓` |
| Reopen window | `אפשר לפתוח מחדש עוד 18 שעות` |
| Chips prompt | `כמה ז'יטונים נשארו למור?` |
| Long-press hint | `לחיצה ארוכה על שחקן פותחת פעולות` |
| Unaccounted bucket | `לא מזוהה / הבית` |

## Bidi rules for text — read this before writing any string

Hebrew financial text is where bidirectional rendering goes wrong. Rules:

1. **Never interpolate a number straight into a Hebrew string.** Always render through the
   `<Money>` component, which wraps the amount with `unicode-bidi: isolate`.
2. For **plain text** that leaves the app (WhatsApp, clipboard), there is no CSS. Wrap each
   amount in **U+2066 LRI … U+2069 PDI** (or the older U+200E LRM on both sides) so
   `₪50` never gets reordered by the recipient's client. Test the output by pasting into
   WhatsApp on both iOS and Android — clients differ.
3. Negative amounts use **U+2212 MINUS** with the sign leading: `−₪80`. A hyphen after the number
   (`₪80-`) is a classic Hebrew-UI bug and reads as nonsense.
4. **Don't use `➡️` in RTL text.** A right-pointing arrow contradicts the reading direction.
   In the UI use `←` (U+2190), which correctly points from payer to payee in RTL. In shared plain
   text prefer words — see below — because arrow rendering varies by client.

## Share text templates

Plain text only. No markdown; WhatsApp mangles it.

### Live game status (#8)

```
🃏 פוקר — 26.07.25
קנייה ₪50 · ז'יטון ₪0.5

מור — 3 קניות (₪150)
אורי — 2 קניות (₪100)
רני — 1 קנייה (₪50) · שילם במזומן
דנה — 2 קניות (₪100) · נסגרה עם 240 ז'יטונים

סה"כ במשחק: ₪400
```

Keep it to what was asked: name, buy-ins, and the few extras that matter (cash paid, settled).
Nothing else.

### Final settlement (#16)

```
🃏 סיכום — פוקר 26.07.25
קנייה ₪50 · ז'יטון ₪0.5 · 4 שחקנים

תוצאות:
דנה +₪50
אורי +₪20
רני −₪30
מור −₪40

העברות:
מור משלם לדנה — ₪40
רני משלם לדנה — ₪10
רני משלם לאורי — ₪20
```

With a cash pot, pot lines read: `מהקופה לדנה — ₪120`.

The arrow variant, if you prefer it after testing on real devices:

```
מור ← דנה  ₪40
```

(In RTL this reads right-to-left: מור, then the arrow, then דנה — correct direction of flow.)

### Personal summary

```
🃏 הסיכום שלי — יולי
6 משחקים · 2 נצחונות · 4 הפסדים
סה"כ: −₪400
תשואה: −67%
```

## Formatting conventions

- Dates: `DD.MM.YY` (`26.07.25`). Long form `26 ביולי 2025` only in headers.
- Times: 24-hour, `23:42`.
- Money: `₪50`, `₪0.5`, `−₪80`, `+₪120`. Two decimals only when nonzero.
- Thousands separator: `₪1,250`.
- Number formatting via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`,
  then post-processed to strip the trailing space some environments add.
- Tabular figures on every number in a list ([04](04-ux-spec.md#rtl-and-hebrew)).
