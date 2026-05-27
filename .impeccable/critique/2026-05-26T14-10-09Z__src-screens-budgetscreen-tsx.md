---
target: budget screen
total_score: 24
p0_count: 0
p1_count: 2
p2_count: 3
timestamp: 2026-05-26T14-10-09Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live bar on every keystroke is excellent; undo toast on template apply is clear. No confirmation that edits persist (state is in-memory only). |
| 2 | Match System / Real World | 3 | Natural language throughout. "Split templates" label is opaque. |
| 3 | User Control and Freedom | 2 | Template undo is good. No undo for × removes (subcategories, bills). |
| 4 | Consistency and Standards | 3 | AmountField chip consistent throughout. Income editing uses different pattern (underline TextInput). |
| 5 | Error Prevention | 2 | Template confirmation dialog correct. Bug: duplicate subcategory names cause silent bKey collision. |
| 6 | Recognition Rather Than Recall | 3 | All categories visible with icon+label. Pencil icon at 10px too quiet; chip tappability not obvious. |
| 7 | Flexibility and Efficiency | 2 | Templates allow one-tap reconfiguration. No group-level target with auto-distribution. 8 individual edits = 8 separate keyboard sessions. |
| 8 | Aesthetic and Minimalist Design | 3 | Wallpaper+glass is premium. Group colors purposeful. Summary card at bottom repeats hero + bar data verbatim. |
| 9 | Error Recovery | 2 | Template undo works. AmountField reverts silently. No recovery for removed categories/bills. |
| 10 | Help and Documentation | 1 | No contextual help. "Split templates" undiscoverable. 50/30/20 unexplained for new users. |
| **Total** | | **24/40** | **Acceptable** |

## Anti-Patterns Verdict

Does not look AI-generated. Wallpaper+frosted card aesthetic is deliberate and consistent. Group color system (blue/clay/teal) breaks finance-domain reflex. No gradient text, no side-stripe borders, no identical card grids. Glassmorphism is structural, matching HomeScreen.

Deterministic scan: zero findings.

## Priority Issues

**[P1] No undo for × removes** — removing subcategories and recurring bills is permanent with no recovery. The undo infrastructure (prevBudgets ref, showUndo/handleUndo) already exists for templates — extend it to per-item removes.

**[P1] Summary card duplicates hero and bar data** — "Budgeted" = hero amount, "Left over" = allocation bar Free item, "Savings" = allocation bar Savings item. Pure redundancy. Remove the card, or replace with a unique insight (effective savings rate, comparison to prior period).

**[P2] Duplicate subcategory name creates silent bKey collision** — addSub() has no duplicate check. Entering an existing label creates two visible rows but only one key in the budgets object, silently undercounting the group total. Guard in addSub: check existing original subs and customSubs before inserting.

**[P2] Allocation bar track color wrong in light mode for in-scroll card** — AllocationBar uses pWallpaper.trackBg (rgba(235,225,255,0.20)) for both sticky and in-scroll cards. Against light frosted glass, the transparent lavender track is nearly invisible. The in-scroll card should use p.trackBg (rgba(14,12,24,0.10) in light mode).

**[P2] AmountField chip lacks tap affordance** — pencil icon at 10px/textTer is too quiet for first-time discovery. Add faint underline to amount text, or increase pencil to 12px at textSec color.

## Persona Red Flags

**Casey (Mobile, one-handed):** Income edit and cadence selector are near top — not thumb-accessible. Each budget amount requires a separate keyboard raise cycle. "Add category" is very low prominence (12px caption). Seven stacked cards require significant scrolling with no quick-jump.

**Riley (Stress Tester):** Duplicate subcategory name bug corrupts group totals silently. Removing all subs from a group creates a near-empty card state with no guidance. TextInput in AddSubRow has no maxLength — very long names push AmountField off-screen.

## Minor Observations

- TRANSITION_PX = 56 on line 28 is defined but never used — remove.
- Easing import on line 15 is unused — remove.
- Template confirmation uses style: 'destructive' for Apply button — colors it red on iOS, but applying a template is not destructive (it's undoable). Use default style.
- Math.round on legend items independently of hero total can create rounding discrepancies where hero shows $3,450 but legend items sum to a slightly different value.
