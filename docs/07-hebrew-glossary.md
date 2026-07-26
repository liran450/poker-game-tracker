# 07 — Hebrew Glossary and Share Templates

One canonical Hebrew term per concept. Inconsistent terminology is the fastest way to make a small
app feel amateurish.

All strings are i18n resources, not literals in components
([02](02-architecture.md#internationalisation)) — Hebrew is the launch language, and English and
others follow. Every entry below is a resource key's Hebrew value, and every sentence with a number
in it is a template with named parameters, never concatenation.

Have a native speaker review this list once before implementation — some of these are colloquial
choices, not dictionary ones, and the colloquial choice is usually the right one for a poker table.

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
| Group / table | חבורה | |
| Host / manager | מנהל המשחק | Short form in badges: `מנהל` |
| Player | שחקן | |
| Guest | אורח | |
| Viewer | צופה | |
| Nickname | כינוי | Rendered as `כינוי (שם משתמש)` for registered players |
| Username | שם משתמש | |
| Settle a player | סגירת שחקן | The verb: `לסגור` |
| Reopen | פתיחה מחדש | |
| End game | סיום משחק | |
| Transfer | העברה | Plural: העברות |
| Balance | יתרה | |
| Discrepancy | פער | |
| Shared costs | הוצאות משותפות | Pizza, tips |
| Profit / loss | רווח / הפסד | |
| Net result | תוצאה | |
| Total | סה"כ | |
| Activity log | יומן פעילות | Short: `יומן` |
| Share | שיתוף | |
| Statistics | סטטיסטיקה | |
| Synced | מסונכרן | |

## Common UI strings

| Context | Hebrew |
|---|---|
| Confirm | אישור |
| Cancel | ביטול |
| Undo | בטל |
| Undo all | בטל הכל |
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
| Export | ייצוא |
| View only | צפייה בלבד |
| Offline | לא מחובר |
| Pending changes | שינויים ממתינים |
| Synced | סונכרן |
| Retry | נסה שוב |
| Hand over management | העבר ניהול |
| Take over management | קח ניהול |
| Revoke link | בטל קישור |
| New link | צור קישור חדש |
| Request to join | בקש להצטרף למשחק |
| Approve request | אשר בקשה |
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
| Buy-in snackbar | `מור · קנייה 3 · +100 ז'יטונים · +₪50` |
| Batch snackbar total | `סה"כ · +200 ז'יטונים · +₪100` |
| Duplicate name (#9) | `השם כבר קיים במשחק — נוסף בתור "מור (1)"` |
| Nickname helper | `הכינוי יוצג לצד שם המשתמש` |
| Slide to end | `החלק לסיום המשחק` |
| Players still open | `יש 2 שחקנים שעדיין לא נסגרו` |
| Settlement incomplete | `שויך ₪430 מתוך ₪480 · חסר ₪50` |
| Settlement complete | `הכל שויך ✓` |
| Reopen window | `אפשר לפתוח מחדש עוד 18 שעות` |
| Chips prompt | `כמה ז'יטונים נשארו למור?` |
| Long-press hint | `לחיצה ארוכה על שחקן פותחת פעולות` |
| Unaccounted bucket | `לא מזוהה / הבית` |
| Shared cost split | `₪20 לאחד` |
| Sync state | `סונכרן לאחרונה: לפני 4 דקות` |
| Takeover warning | `ודאו שהמכשיר של המנהל הנוכחי סונכרן. שינויים שעדיין לא נשלחו מהמכשיר שלו עלולים ללכת לאיבוד.` |
| Takeover, stale sync | `יש שינויים שלא סונכרנו — מומלץ לחכות אם אפשר` |
| Host was taken over | `אורי לקח את ניהול המשחק` |
| Share link, live game | `כל מי שיש לו את הקישור יוכל להצטרף לצפייה בזמן אמת — בלי לערוך` |
| Share link, finished game | `הקישור מציג את סיכום ההעברות בלבד` |
| Link no longer valid | `הקישור כבר לא פעיל` |
| Link expiry | `פג תוקף: 7 ימים לאורחים · 30 יום לחברי החבורה` |
| Members keep access | `חברי החבורה תמיד יכולים לפתוח את המשחק מהאפליקציה` |
| Join request sent | `הבקשה נשלחה למנהל המשחק` |
| Pending requests | `2 בקשות הצטרפות` |
| Request source, member | `חבר בחבורה` |
| Request source, link | `הצטרף בקישור` |
| Approve as | `אשר כשחקן` · `אשר כצופה` |
| Group live game card | `משחק פעיל בחבורה` |
| Approve / reject | `אשר` · `דחה` |
| Mixed currencies | `המשחקים כוללים יותר ממטבע אחד — הסכומים לא הומרו` |
| Delete game | `הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.` |
| Log purged | `יומן הפעילות של משחק זה כבר לא זמין` |
| Small sample | `נתונים חלקיים` |

## Bidi rules for text — read this before writing any string

Hebrew financial text is where bidirectional rendering goes wrong. Rules:

1. **Never interpolate a number straight into a string.** Always render through the `<Money>`
   component, which wraps the amount with `unicode-bidi: isolate`.
2. For **plain text** that leaves the app (WhatsApp, clipboard), there is no CSS. Wrap each amount
   in **U+2066 LRI … U+2069 PDI** (or the older U+200E LRM on both sides) so `₪50` never gets
   reordered by the recipient's client. Test the output by pasting into WhatsApp on both iOS and
   Android — clients differ.
3. Negative amounts use **U+2212 MINUS** with the sign leading: `−₪80`. A hyphen after the number
   (`₪80-`) is a classic Hebrew-UI bug and reads as nonsense.
4. **Don't use `➡️` in RTL text.** A right-pointing arrow contradicts the reading direction. In the
   UI use `←` (U+2190), which correctly points from payer to payee in RTL. In shared plain text
   prefer words — see below — because arrow rendering varies by client.
5. Composed names like `הכריש (mor_l)` mix scripts and need isolation as a unit, or the parentheses
   will jump to the wrong side.

## Share text templates

Plain text only. No markdown; WhatsApp mangles it. These are translatable resources, not literals.

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
With shared costs, one extra line before the transfers: `הוצאות משותפות: פיצה ₪120 (₪20 לאחד)`.

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

- Dates: `DD.MM.YY` (`26.07.25`). Long form `26 ביולי 2025` only in headers. Both from the
  locale-aware formatter, never hand-built.
- Times: 24-hour, `23:42`.
- Money: `₪50`, `₪0.5`, `−₪80`, `+₪120`. Two decimals only when nonzero.
- Thousands separator: `₪1,250`.
- Number formatting via `Intl.NumberFormat(locale, { style: 'currency', currency })` — the currency
  comes from the game or group, never a hardcoded `₪`, because other currencies are planned.
- **Never say "agorot" (or "cents") in the UI.** Amounts are stored in minor units internally and
  spoken about in the currency's own name everywhere else: shekels, dollars.
- Tabular figures on every number in a list ([04](04-ux-spec.md#rtl-and-hebrew)).
