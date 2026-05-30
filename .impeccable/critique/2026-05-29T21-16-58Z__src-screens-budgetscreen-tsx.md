---
target: budget screen
total_score: 25
p0_count: 1
p1_count: 2
timestamp: 2026-05-29T21-16-58Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Left to assign" is clear; AmountField transparent-at-rest hides editability |
| 2 | Match System / Real World | 2 | "Goal" group option secretly maps to "Savings" group; goals appear in two cards as the same entity |
| 3 | User Control and Freedom | 3 | Template undo + delete undo are good; no undo for inline amount commits |
| 4 | Consistency and Standards | 3 | Field card/typography matches TxSheet; header pattern does not |
| 5 | Error Prevention | 2 | Template overwrites manual edits without warning; AmountField keyboard-dismiss edge case |
| 6 | Recognition Rather Than Recall | 2 | Two edit paths for the same budget value; same goal category renders in two places |
| 7 | Flexibility and Efficiency | 3 | Inline AmountField editing is genuinely efficient for power users |
| 8 | Aesthetic and Minimalist Design | 2 | Goals section is pure redundancy; "Goal" vs "Savings" is a phantom distinction |
| 9 | Error Recovery | 3 | Undo for templates and deletions works well |
| 10 | Help and Documentation | 2 | No guidance on savings vs. goals; recurring toggle's effect is invisible |
| **Total** | | **25/40** | **Needs Work** |

## Priority Issues

[P0] Savings and Goals should be one section — same categories rendered twice with different views. Fix: remove Goals card, show goal progress inline within Savings rows.

[P1] Category sheet field order is backwards — Group before Name inverts creation flow. Fix: Name first, always.

[P1] Monthly Budget field in the popup is redundant with inline AmountField. Fix: remove it from the popup; popup is metadata-only.

[P2] Category sheet header breaks TxSheet hero pattern — shows text label, not icon+name hero.

[P2] Recurring toggle has no visible effect in the budget view — custom recurring categories don't move to the Recurring divider section.

## Anti-Patterns Verdict

Automated detector: clean. No gradient text, no glassmorphism, no hero-metric template. LLM review: passes the AI slop test — committed color vocabulary and composition choices distinguish this from generic output.

## Persona Red Flags

Set-it-and-forget user: goal categories appear in two places, assumes they're different things, confused about what to edit.

Control-freak user: edits amount inline, then in popup — gets contradictory state with no feedback on which won. Trust in data erodes.
