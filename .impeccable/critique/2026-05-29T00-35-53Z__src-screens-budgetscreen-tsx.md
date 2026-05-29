---
target: budget screen
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-05-29T00-35-53Z
slug: src-screens-budgetscreen-tsx
---
# Budget Screen Critique

Target: `src/screens/BudgetScreen.tsx`

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Allocation bar + over/under label + undo toast all clear; no single focal "left to allocate" metric |
| 2 | Match System / Real World | 3 | 50/30/20, Needs/Wants/Savings, cadence labels read naturally |
| 3 | User Control and Freedom | 3 | Undo toast, swipe-to-remove, template-apply-with-undo; but no month/period control |
| 4 | Consistency and Standards | 3 | TYPE tokens, GROUP_COLORS, shared SectionCard; one nested-panel deviation |
| 5 | Error Prevention | 3 | Amount validation, invalid state, duplicate-category guard |
| 6 | Recognition Rather Than Recall | 3 | Icons + labels + template subtitles |
| 7 | Flexibility and Efficiency | 2 | No multi-income, no rollover, no per-group target edit, no month switching, no copy-last-month |
| 8 | Aesthetic and Minimalist Design | 2 | Wall-to-wall identical cards, no focal hierarchy, card-in-card, tiny dense type, no signature viz |
| 9 | Error Recovery | 3 | Undo covers template + removals; income/budget commit failures no-op silently |
| 10 | Help and Documentation | 2 | "New to budgeting?" prompt is a good seed; no goal explanation, no allocate-to-zero guidance |
| **Total** | | **27/40** | **Solid foundation, weak on focal hierarchy + budget-model completeness** |

## Anti-Patterns Verdict

**Does it look AI-generated?** No. The deterministic detector flagged 0 of 27 patterns. No gradient text, no side-stripe borders, no hero-metric template, no decorative glass. The design-system discipline (TYPE tokens, group-color vocabulary, hairline borders, the violet economy) is real and consistent. This is not slop. The "boring" complaint is a hierarchy and rhythm problem, not an anti-pattern.

## Why Budget feels boring vs Home

Home earns energy through rhythm variation and one bold focal number: a ~42px hero amount sitting directly on the wallpaper with no card, floating 56px circular quick-actions also on the wallpaper, and only then frosted cards with 22px gaps and haptics.

Budget does the opposite:
- Wall-to-wall frosted cards from the first pixel; the wallpaper never breathes.
- Its most important number (income left to allocate / free) is `TYPE.headline` (20px) inline inside a sentence, echoed in a 12px caption strip. No display-scale focal figure; the 32px display token reserved for exactly this is never used.
- The balancePanel is a card-in-a-card (tinted panel inside the SectionCard).
- Type is uniformly small and same-weight, reading as monotony.

Against Revolut: Revolut anchors budget/analytics on one dominant data-viz element (a spent-vs-limit ring/donut) plus a single large "left to spend" figure, then vibrant per-category rows. Budget has only a thin 8-9px stacked bar and no commanding number.

## What's Working

1. Real interaction depth: sticky morphing allocation bar, swipe-to-delete, inline-editable amounts, 7s undo with full snapshot, template-with-undo.
2. Honest data model: Needs/Wants/Savings target vs actual, recurring bills folded into groups, regular vs one-time income, cadence conversion.
3. System discipline: group-color vocabulary, hairline borders, TYPE tokens, accent restraint, consistent with Home.

## Priority Issues

[P1] No focal point; the primary metric is buried. Promote "$X free / over budget" to a display-scale figure; strongest move is lifting it onto the wallpaper as an open hero mirroring Home.

[P1] Wall-to-wall identical cards + nested panel kill rhythm. Open the top metric onto the wallpaper, remove the balancePanel card-in-card, vary spacing.

[P1] The budget-setting model is incomplete. Missing: month/period control (hardcoded CURRENT_MONTH), savings goals/sinking funds, multiple income sources, rollover/carryover policy, allocate-to-zero guidance + explicit save, spent-vs-budget context while setting.

[P2] Every row carries a boxed amount field; low contrast, high chrome. Show amounts as plain right-aligned text at rest, reveal the bordered field on focus.

[P2] No signature data-viz. Add one dominant allocation visual (ring/donut, group-colored, not accent-colored). A Donut component already exists.

[P3] Recurring items can't be added where the budget is built. Add an "Add recurring" affordance inside the group/recurring divider.

## Persona Red Flags

Sam (busy professional, glance-and-go): the over/free answer is a 20px sentence buried in a card, not a number that hits in 0.5s. Fails clarity-at-a-glance.

Jordan (first-time budgeter): picks a template, then faces a wall of category rows with boxed inputs and no "you have $X left to assign" coaching. Sets a few numbers and bails without closure.

Priya (shares finances with a partner): has two incomes, but the income sheet edits a single primary source. The model doesn't represent her household.

## Minor Observations

- The pct row and the legend row below the allocation bar partly duplicate each other.
- Income commit silently no-ops on invalid/zero input with no feedback.
- Group target is template-driven only; no way to nudge a single group's % without changing the whole template.
