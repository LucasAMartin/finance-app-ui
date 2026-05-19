---
target: budget screen
total_score: 26
p0_count: 0
p1_count: 1
p2_count: 3
timestamp: 2026-05-19T18-37-09Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score — BudgetScreen

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Committed flash (400ms) too brief; no persistence signal after income edits |
| 2 | Match System / Real World | 3 | "Paycheck" chip label reads as "view paycheck" not "set pay schedule" |
| 3 | User Control and Freedom | 2 | No undo after applying template or committing income change |
| 4 | Consistency and Standards | 3 | Income input uses bottom-border underline; category inputs use chip style |
| 5 | Error Prevention | 3 | Template confirmation alert is good; income rejects silently if invalid |
| 6 | Recognition Rather Than Recall | 2 | Income amount has no edit affordance — looks like static text |
| 7 | Flexibility and Efficiency | 2 | No way to proportionally scale budgets when income changes |
| 8 | Aesthetic and Minimalist Design | 2 | "Budget template" button is visually overloaded; template mini-bars are 5px wide |
| 9 | Error Recovery | 2 | Applying wrong template requires manual correction of every category |
| 10 | Help and Documentation | 2 | No contextual explanation of 50/30/20 for new users |
| **Total** | | **26/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

Automated scan: clean (0 findings). LLM: two AI slop tells.

"Budget template" button: sparkle icon + heading + subtitle + chevron = canonical AI feature-card pattern. Template mini-bars at 5px wide are decorative complexity, not data visualization.

## Priority Issues

**[P1] "Budget template" button looks AI-generated**: Kill the sparkle, rewrite label as action ("Apply a split template"), drop the subtitle.

**[P2] Income amount has no edit affordance**: Add pencil icon or faint underline to signal tappability.

**[P2] "Paycheck" chip label is cryptic**: Rename to "Pay period" or display active cadence in chip ("Monthly v").

**[P2] No recovery path after template apply**: Store previous budget state, offer 6s undo toast.

**[P3] Template mini-bars decorative not informative**: Show percentages as text or use full-width horizontal bars.
