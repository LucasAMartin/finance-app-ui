---
target: 4 main screens (home, insights, budget, transactions)
total_score: 32
p0_count: 0
p1_count: 2
timestamp: 2026-06-05T13-28-12Z
slug: ns-budgetscreen-tsx-src-screens-activityscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Budget bar and over-ember signals are clear; no loading state on section headers |
| 2 | Match System / Real World | 4/4 | Native finance vocabulary, iOS conventions throughout |
| 3 | User Control and Freedom | 3/4 | Swipe-to-delete undo present; non-obvious on first encounter |
| 4 | Consistency and Standards | 3/4 | sectionGap/rowPadY/screenGutter are consistent; token erosion (raw literals) undermines this |
| 5 | Error Prevention | 3/4 | Budget validation guards goals; no delete confirmation before swipe |
| 6 | Recognition Rather Than Recall | 4/4 | All actions visible, active states clear, filter pills show state |
| 7 | Flexibility and Efficiency | 3/4 | Multi-filter power on Activity; no bulk ops or custom date range shortcuts |
| 8 | Aesthetic and Minimalist Design | 4/4 | Premium glass-over-wallpaper, monochrome accent, data-forward layout |
| 9 | Error Recovery | 3/4 | Undo on delete works; timed 7s window with no countdown indicator |
| 10 | Help and Documentation | 2/4 | One-time swipe hint only; no onboarding, no contextual budget goal help |
| **Total** | | **32/40** | **Strong — minor gaps in help and token discipline** |

## Anti-Patterns Verdict

**Does this look AI-generated?** No. The "Quiet Glass" aesthetic is specific and internally consistent: wallpaper parallax, frosted SectionCards, group-colored icon circles, and the monochrome ink accent read as authored decisions, not template reflexes. The spending-group palette (blue/clay/teal) breaks the finance-domain navy-and-gold reflex explicitly. No gradient text, no hero-metric cards, no side-stripe borders.

**Deterministic scan:** `npx impeccable detect` returned zero findings. However, a targeted grep sweep found the real issues the detector missed:
- 3 `fontSize` literals bypassing TYPE tokens (InsightsScreen:1966, ActivityScreen:1127, ActivityScreen:1135)
- 8 hardcoded hex values (`#FBF8FF`, `#fff`) for icon-on-surface white across all four screens
- 80+ raw spacing/radius literals in StyleSheet blocks and inline styles across all screens

These are token discipline issues rather than aesthetic anti-patterns — the visual result looks correct, but the underlying numbers are not sourced from SPACE/RADIUS/TYPE, so design-system changes won't propagate.

## Overall Impression

The four screens are **visually cohesive at a glance** — spacing rhythm, type hierarchy, and color semantics hold together well. The big structural tokens (sectionGap: 24, screenGutter: 16, rowPadY: 12) are honored everywhere. But the implementation has quietly slipped into direct literals for most other spacing and radius values. The token infrastructure exists (SPACE, RADIUS, TYPE) but 80+ bypasses mean the system provides false confidence: a RADIUS.card change won't touch the 16s and 19s and 100s scattered through the stylesheets. The biggest single opportunity is a SPACE/RADIUS sweep to eliminate the raw literals and surface the three rogue fontSize declarations.

## What's Working

1. **Structural token discipline is solid.** `sectionGap: 24`, `screenGutter: 16`, `rowPadY: 12`, `cardPadX/Top/Bottom: 20/20/12` are consistent across all four screens. The SectionCard abstraction holds card padding without repetition. The most-used spatial decisions are correct.

2. **Typography hierarchy reads clearly cross-screen.** TYPE tokens are used for all text roles — pageTitle, sectionTitle, body, caption — and no screen sets a typographic role inline. The visual weight hierarchy (screen title → section head → row label → metadata) is identifiable and consistent.

3. **Color semantics are coherent.** Group colors (needs-blue, wants-clay, savings-teal), over-ember, and hero-avail are applied correctly and consistently. The monochrome ink accent appears only on actions and selected states; charts never use it. No spurious colors appear on any screen.

## Priority Issues

**[P1] Token erosion: 80+ raw spacing and radius literals**
- **What:** StyleSheet blocks and inline styles across all four screens use raw numbers (12, 16, 20, 24, 3, 5, 14, 16, 100) instead of SPACE/RADIUS token references. Examples: `borderRadius: 16` (InsightsScreen:2013, :2048, :2105), `borderRadius: 3` (InsightsScreen:2033, ActivityScreen:2705), `paddingHorizontal: 20` (many), `gap: 12` (many).
- **Why it matters:** The token system exists precisely so that a design decision (e.g. bumping RADIUS.card from 24 to 28) propagates everywhere automatically. With raw literals, that's a manual grep exercise. The consistency users can see today is maintained by convention, not by the system — it will drift as the codebase grows.
- **Fix:** Systematically replace raw spacing with SPACE/LAYOUT constants and raw radius with RADIUS constants. The 4pt grid values map cleanly: 4→SPACE.xs, 8→SPACE.sm, 12→SPACE.md, 16→SPACE.lg, 20→SPACE.xl, 24→SPACE.xxl, 32→SPACE.xxxl. Radius: 3→RADIUS.bar (or a new sub-bar value), 10→RADIUS.chip, 14→RADIUS.field, 16→RADIUS.button, 100→RADIUS.full.
- **Suggested command:** `/impeccable layout` for the spacing sweep

**[P1] Three `fontSize` literals bypass the TYPE scale**
- **What:** InsightsScreen:1966 `fontSize: 17`, ActivityScreen:1127 `fontSize: 15`, ActivityScreen:1135 `fontSize: 11` are set as raw overrides outside the TYPE token system.
- **Why it matters:** The TYPE scale is the hierarchy contract. Inline fontSize values are invisible to the type system, can silently conflict with other TYPE tokens at the same size, and won't update if a token value changes.
- **Fix:** InsightsScreen:1966 → `TYPE.pageTitle` (17/600 matches); ActivityScreen:1127 → check whether `TYPE.onMediaStatus` (15/600) or `TYPE.bodySm` (13/400) is the intended role; ActivityScreen:1135 → likely `TYPE.labelLg` (11/500) or `TYPE.label` (10/500).
- **Suggested command:** `/impeccable typeset` to audit and fix

**[P2] Icon-white is hardcoded (#FBF8FF / #fff) across all four screens**
- **What:** 8 hits across HomeScreen, ActivityScreen, BudgetScreen use `color="#FBF8FF"` or `color="#fff"` for icons on colored/dark surfaces (trash, check, toggle thumb). There is no `theme.onAccent` or equivalent token.
- **Why it matters:** If the accent or group-color backgrounds ever shift (e.g. to lighter variants), the white icon may no longer clear AA contrast. More importantly, it breaks the rule that no component hardcodes a hex for a themed role.
- **Fix:** Add `onGroupIcon: '#FFFFFF'` (or `theme.accent.ink`) as a semantic token in the theme, then replace all icon-white literals with it.
- **Suggested command:** `/impeccable colorize` to audit and add the missing token

**[P2] Budget progress bar uses R=3 instead of RADIUS.bar (4)**
- **What:** HomeScreen:80 declares `const R = 3` for the budget bar corner radius. RADIUS.bar is 4.
- **Why it matters:** Minor visual inconsistency (the bar is 1px softer than spec), and the constant is invisible to the RADIUS system.
- **Fix:** Replace `const R = 3` with `import { RADIUS } from '../radius'; const R = RADIUS.bar;` (or inline `RADIUS.bar` at the use site).
- **Suggested command:** Can be fixed inline in < 2 min.

**[P3] No help context for first-time users**
- **What:** Only one one-time swipe hint exists (Activity). Budget's 50/30/20 split, goal mechanic, and recurring/bill categories have no explanation.
- **Why it matters:** Power users won't notice, but the product targets "busy professionals" — not necessarily finance-framework-savvy users. The Budget screen in particular requires understanding allocation logic to use correctly.
- **Fix:** Add a dismissible callout card on first launch of BudgetScreen explaining the 50/30/20 framework. Consider a "What's this?" tap target on the allocation bar.
- **Suggested command:** `/impeccable onboard`

## Persona Red Flags

**Alex (Power User — uses the app multiple times daily, checks during transitions)**
- Filter state on ActivityScreen isn't persisted between sessions — every re-open resets to "All." Power users who habitually filter by a category will re-apply it every session.
- No keyboard shortcut or tap-to-jump from a spending category in Insights directly to its filtered Activity view. The mental model assumes the user manually replicates the filter.

**Jordan (First-Timer — just downloaded, unfamiliar with 50/30/20)**
- Budget screen opens with allocation bars at specific percentages but no label explaining what those percentages mean or where they came from. The "Needs / Wants / Savings" group labels help, but the 50/30/20 framework is not explained.
- The swipe-to-delete gesture on transactions has a one-time hint that disappears. A first-timer who doesn't see the hint and doesn't discover the gesture will think transactions are permanent records.

## Minor Observations

- InsightsScreen `bentoRow` uses `gap: 12` (SPACE.md) and `bento` uses `gap: 12` — these are correct values but raw literals. Low urgency given they're correct.
- `borderRadius: 100` (pill capsule) appears 3 times in ActivityScreen instead of `RADIUS.full` — correct value, wrong reference.
- `borderRadius: 19` in InsightsScreen:2124 is off-grid entirely — should be either 18 (RADIUS.modal - 0? no) or 20 or a RADIUS token. Audit needed.
- BudgetScreen:1722 `borderRadius: 14` matches RADIUS.field correctly in value but should use the token.
- The timed undo (7s) on deletes has no visual countdown. Users who are mid-scroll when the undo bar appears may miss the window entirely.

## Questions to Consider

1. Should `SPACE` and `RADIUS` tokens be barrel-imported at the top of every screen file (like `TYPE` is) to reduce the friction of reaching for a raw literal?
2. Is the off-grid `borderRadius: 19` in InsightsScreen:2124 an intentional visual adjustment or a typo? (RADIUS.modal is 18, RADIUS.card is 24.)
3. Should there be a `theme.onGroupIcon` token (the always-white icon on colored group-circle backgrounds) so the pattern is named and discoverable?
4. Given that Activity's filters reset on every open, should the last-used filter combination persist in AsyncStorage or SQLite?
