---
target: home screen
total_score: 27
p0_count: 1
p1_count: 2
timestamp: 2026-06-07T02-19-18Z
slug: src-screens-homescreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Hero metric + budget bar deliver status clearly; bell dot implies notifications exist but has no handler |
| 2 | Match System / Real World | 4/4 | Plain language ("Available", "On Track"), iOS swipe norms, money formatting — all correct |
| 3 | User Control and Freedom | 3/4 | Month picker + swipe-to-close work; no undo for delete or mark-paid |
| 4 | Consistency and Standards | 3/4 | Needs/Savings use detail rows; Wants uses chips — different visual vocabulary within the same section |
| 5 | Error Prevention | 2/4 | No confirmation before delete or mark-bill-paid; swipe threshold is permissive (15px failOffset) |
| 6 | Recognition Rather Than Recall | 3/4 | Icons + labels on quick actions, category colors aid recognition; "More" label hides its single-item content |
| 7 | Flexibility and Efficiency | 2/4 | No month-swipe shortcut; income action equal-weighted with daily expense entry |
| 8 | Aesthetic and Minimalist Design | 4/4 | Quiet Glass is intentional and well-executed — no chrome bloat, scrim is tasteful, skeleton states are polished |
| 9 | Error Recovery | 2/4 | No undo stack; destructive actions (delete, mark-paid) are irreversible with no recovery path |
| 10 | Help and Documentation | 1/4 | Empty states give minimal guidance; no 50/30/20 framework explanation visible anywhere on home screen |
| **Total** | | **27/40** | **Functional but with meaningful UX gaps** |

---

## Anti-Patterns Verdict

**Does this look AI-generated?** No — and that's a genuine pass. The wallpaper/glass material treatment, token-driven color system, and collapsible group structure are the product of considered design decisions, not template application. A Figma-fluent practitioner would recognize this as intentional.

**LLM assessment:** The "Quiet Glass" creative brief is executed with discipline. No gradient text, no hero-metric SaaS cliché (the big number lives on a photographic surface, not a white card with a gradient accent), no decorative glassmorphism. Color encodes meaning throughout. Token discipline is strong in `HomeScreen.tsx`.

**Deterministic scan — 11 of 15 patterns flagged:**

Critical:
- **Bell notification stub** (HomeScreen.tsx:655–671): `TouchableOpacity` with `accessibilityHint="View recent alerts"` and a permanently lit `OVER_DOT` red badge — but zero `onPress` handler. The affordance exists; the feature doesn't.
- **MoreMenuButton has 1 item** (HomeScreen.tsx:1155–1157): Primary quick-action row slot occupied by a "More" menu containing a single entry: "Edit theme."

Code quality:
- **`#0E0C18` hardcoded in `quickActionColors`** (lines 59, 64): Should be `MEDIA.ink` or a named constant, not a raw hex literal — blocks theme extensibility.
- **`groupLabel` inline overrides** (HomeSpendGroups.tsx:304–306): `fontSize: 16`, `lineHeight: 18`, `letterSpacing: 0` declared inline, overriding `TYPE.labelLg` — violates the Token Rule. Add `TYPE.groupLabel` token instead.
- **ON_MEDIA palette hardcoded in component** (HomeSpendGroups.tsx:41–48): `'#FFFFFF'`, `'rgba(255,255,255,0.78)'`, etc. should live in `wallpaperPalette.ts`, not inside the component.
- **Magic spacing throughout HomeSpendGroups styles** (lines 276–278, 327–328, 284, 289, 294, 352, 357, 392, 398): Mix of 7, 8, 12, 16 px values where `SPACE.sm`, `SPACE.md`, `SPACE.lg` should be used.
- **Inline radius values** (HomeSpendGroups.tsx:272, 299, 343): `borderRadius: 10` (= RADIUS.chip), `borderRadius: 4` (= RADIUS.bar), `borderRadius: 8` (= RADIUS.field) — use tokens.

False positives: OVER_DOT used in progress bars is correct (it's the semantic over-budget state, not an "accent in charts" violation — the No-Chart-Accent rule targets the ink accent, not semantic colors).

---

## Overall Impression

The screen earns its aesthetic and delivers the core glance-and-go promise. Hero, quick actions, and collapsible spend groups work together well. The issues are concentrated in two areas: **unimplemented chrome** (the bell is the most egregious) and **destructive-action safety** (no undo anywhere). Neither is architectural — both are fixable in a focused pass.

The biggest single opportunity: the "More" button occupying a prime slot in the quick-action row. Reclaiming that space for something users actually need daily would make the action bar meaningfully more useful.

---

## What's Working

**1. Collapsible spend groups with progressive disclosure.** The three 50/30/20 panels collapsed-by-default is the right call. Color-dot + group total at a glance, then expand for sub-category detail. The animated chevron + tinted container are subtle affordance cues that work without explanation.

**2. Hero metric paired with budget bar.** "Available: $1,234.50" + a five-pixel bar encoding the same number visually is efficient. Over-budget flips both the label and the amount to ember-red simultaneously — a clean two-signal alert with no redundant text. Adjusts font size to fit without breaking layout.

**3. Skeleton loading states.** The skeleton loaders are detailed and structurally close to the real content layout. The 1.1-second wait is covered with dignity. The `onMedia` flag correctly adapts skeleton opacity to dark glass vs. light glass surfaces.

---

## Priority Issues

**[P0] Bell icon: permanent red badge, no handler**
- **What:** A notification bell sits in the header with a `OVER_DOT` red dot badge — always lit, never clears, no `onPress` attached. Every user who taps it discovers a dead button.
- **Why it matters:** Trust erosion. The app is handling financial data; an affordance that silently fails signals unreliability. The red dot also competes with OVER_DOT's semantic meaning (over-budget).
- **Fix:** Either implement a minimal notification drawer (even a stub toast "No new alerts") or remove the bell and its badge entirely until the feature exists. Don't ship false affordance on financial UI.
- **Suggested command:** `/impeccable harden the home screen`

**[P1] No confirmation or undo for destructive actions**
- **What:** Swipe-to-delete on a transaction and swipe-to-mark-paid on a bill both execute immediately with a single tap. No "Are you sure?" No undo toast. `markBillPaid` creates a transaction and advances the recurring rule in one call — irreversible from the UI.
- **Why it matters:** A user scrolling quickly can accidentally fire either action. Financial data deletion with no recovery path violates Nielsen #4 and #5 at a domain where the stakes are real.
- **Fix:** Add a 4-second dismissible "Deleted [merchant]" toast with a tap-to-undo action. For mark-paid, a light haptic + brief "Marked paid" toast with undo covers the accidental-fire case without adding confirmation friction to intentional use.
- **Suggested command:** `/impeccable harden the home screen`

**[P1] "More" quick action occupies prime real estate for a single menu item**
- **What:** The fourth slot in the primary quick-action row shows an ellipsis that opens a UIKit menu with exactly one entry: "Edit theme." Theme editing is also reachable from the drawer/settings.
- **Why it matters:** The quick-action row is the most prominent interactive surface on the screen. Using 25% of it to surface a setting that's available elsewhere wastes the slot and adds friction when users want to find it. The "More" label gives zero signal about what's inside.
- **Fix:** Replace "More" with a genuinely high-frequency action — "Goals", "Scan", or a context-aware shortcut (e.g., "Budget" when the user is over). Move theme editing to the drawer exclusively.
- **Suggested command:** `/impeccable shape a revised quick-action row`

**[P2] No-income empty state has no action path**
- **What:** When `hasIncome` is false, the hero shows "Set your income to get started" in the status label area (15px regular text). There's no link, button, or tap target attached to that message. Users need to independently discover the "Income" quick action.
- **Why it matters:** New users land here with zero data. The only guidance is a line of text that tells them what to do but provides no way to do it from that moment. Tap nothing → scroll → maybe find "Income" → maybe understand it logs income.
- **Fix:** Make the status label itself a `TouchableOpacity` that opens the income logging sheet directly. Or add a small CTA chip below the hero amount: `[+ Set income]` using the accent style.
- **Suggested command:** `/impeccable harden the home screen`

**[P2] Budget bar 75% warning reuses `GROUP_COLORS.wants.light`**
- **What:** `BudgetBar` at line 86: at 75–90% of budget, the bar fill uses `GROUP_COLORS.wants.light` (warm clay, `#D76F5F`). That same color means "wants spending" in the Spending section three cards below.
- **Why it matters:** The same hue encodes two different meanings on the same screen: "discretionary spending category" and "approaching budget limit." Users who have internalized one meaning will be confused by the other.
- **Fix:** Replace with `CAUTION_AMBER` (`#C5A946`) which already exists as the semantic cautionary state. The color vocabulary for state already has the right answer.
- **Suggested command:** `/impeccable harden the home screen`

---

## Persona Red Flags

**Daily Checker (core user — opens 3-5x/day for quick status):**
- Glances at hero → reads budget status → good, this works.
- Taps bell expecting recent alerts (they're a financial professional; they expect notifications) → nothing happens → taps again → dead button. Will check every visit for weeks before giving up.
- Swipes a bill row quickly to mark paid → one accidental touch → bill marked paid, transaction created, rule advanced. No undo. Has to manually delete the transaction and figure out the rule is now advanced by a month.

**New User (first week, setting up tracking):**
- Lands on home with empty data. Sees "$0.00" and "Set your income to get started." Reads it. Looks for a "Set income" button — doesn't find one. Taps "Income" quick action (maybe) → now understands. Took 2+ attempts.
- Taps "More" expecting more features — sees "Edit theme." Confused. Expected budget categories, goals, export. Learns that "More" means nothing useful.
- Sees "Spending" section with three groups — doesn't know what 50/30/20 means. No explanation. Looks for a "?" — doesn't find one.

---

## Minor Observations

- `groupLabel` at 16px in HomeSpendGroups is sized between `body` (14px) and `headline` (20px) with no type token. The Silent Scale Rule from DESIGN.md says two elements at the same size differ in weight/color/case. Adding a `TYPE.groupPanelLabel` token at `{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, lineHeight: 20 }` would resolve both the override and the naming gap.
- The proportional bar in WantsChips (chips showing spend ratios) uses no budget comparison — it's proportion-only. This is consistent within the wants-group treatment but creates asymmetry: Needs and Savings track against budget; Wants doesn't. Worth documenting as intentional if it is.
- Income action in the quick-action row: logging income is typically a once-per-month operation (paycheck), yet it occupies equal visual weight to Voice and Manual (potentially daily actions). Consider demoting it to the drawer or the "More" menu once that slot is freed up.
- `ledgerAction` ("See all") in Activity header: `TYPE.captionEm` at 12px with opacity 0.82 on `p.text`. On a light frosted card, this is probably 3:1 contrast against the card background — below AA threshold. Use `opacity: 1` and `p.textSec` or `accent.dot` to signal it's interactive.

---

## Questions to Consider

1. If you removed the bell and the "More" button, what belongs in those two header/action slots? This forces clarity about what actions belong in the primary focus tier.
2. The hero shows monthly available balance. Does the user need to know if this month is tracking better or worse than last month? If yes, where does that context live without cluttering the hero?
3. Should the three spending groups on the home screen be permanently collapsed by default, or should the app remember each user's expansion state per group?
