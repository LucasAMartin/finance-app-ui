---
target: src/screens/BudgetScreen.tsx hero
total_score: 27
p0_count: 0
p1_count: 1
timestamp: 2026-05-27T04-23-55Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The over/left state is visible, but it competes with income and expenses tiles. |
| 2 | Match System / Real World | 3 | Planned income and expenses are clear terms; the bar's meaning needs slightly more framing. |
| 3 | User Control and Freedom | 3 | Inline income edit and template undo are good; template still feels too close to primary summary. |
| 4 | Consistency and Standards | 3 | Uses app card language; the top card creates tile/card layering that feels heavier than the rest. |
| 5 | Error Prevention | 3 | Amount validation is improved; income still uses a lighter validation pattern. |
| 6 | Recognition Rather Than Recall | 3 | Most values are labeled; the colored allocation bar lacks inline group labels in the hero. |
| 7 | Flexibility and Efficiency | 3 | Income cadence and template are efficient, but exposed in the same summary surface. |
| 8 | Aesthetic and Minimalist Design | 2 | The hero is organized, but equal-weight tiles, panel, and template row make it feel busier than intended. |
| 9 | Error Recovery | 3 | Undo exists for template changes and deletes. |
| 10 | Help and Documentation | 1 | No contextual explanation for template or allocation bar. |
| **Total** | | **27/40** | **Acceptable, close to good; hierarchy is the main blocker.** |

## Anti-Patterns Verdict

Not AI slop. The layout follows a real product pattern and the detector returned no findings. The problem is hierarchy, not taste. Too many elements inside the first container are asking to be read as equally important.

## Overall Impression

The current hero is directionally right: one container, clear title, income/expense comparison, and allocation bar. But it needs one dominant sentence. Right now the eye reads left tile, right tile, balance panel, template row, then bar. Clean, yes, but not powerful yet.

## What's Working

- One `Budget Breakdown` container is a better mental model than a separate wallpaper hero plus summary card.
- Planned Income and Planned Expenses are the correct comparison pair for budgeting.
- The balance panel is the right place for over/left status and the allocation bar.

## Priority Issues

### [P1] The primary budget judgment is not dominant enough

Why it matters: Users should know in one glance whether they are over or have money left to assign. The two tiles currently appear before that judgment, so the page starts as accounting instead of status.

Fix: Keep the two tiles, but make the full-width balance panel the visual anchor. Put it directly under the title, or give it more typographic weight than the tiles. The best hierarchy is: title, left/over amount, bar, then income/expense tiles.

Suggested command: `impeccable shape budget hero hierarchy`

### [P2] The two tiles feel like nested mini-cards

Why it matters: Cards inside cards add visual furniture. The app's design system is strongest when data surfaces are flat and quiet.

Fix: Make the tiles feel like two columns in a single strip, separated by a hairline divider, not two separate rounded boxes. This will feel more premium and less busy.

Suggested command: `impeccable distill budget tiles`

### [P2] Template is still visible too early

Why it matters: Template is a setup tool, not a status metric. In the hero container it reads like part of the budget answer.

Fix: Move Template below the Budget Breakdown container, possibly as a small row before the group cards, or tuck it into a subtle menu/action in the title row.

Suggested command: `impeccable polish budget template control`

### [P3] The allocation bar needs a label only if it stays in the hero

Why it matters: The bar is meaningful if users already know the colors, but in the hero it should not require memory.

Fix: Either add a tiny `Needs / Wants / Savings` legend below it, or let the group cards carry that detail and keep the hero bar as an abstract progress cue.

Suggested command: `impeccable clarify budget allocation bar`

## Persona Red Flags

Alex, power user: The information is all present, but template being visible in the summary slows scanning. Alex wants the result first, tools second.

Sam, accessibility-dependent user: The colored bar needs semantic labeling outside color. The visible labels elsewhere help, but the hero bar itself is not self-describing.

Casey, distracted mobile user: The top container is readable, but the first glance has too many comparable blocks. Casey benefits from one large status line and smaller supporting numbers.

## Questions to Consider

- Should the hero answer "Am I over?" before it answers "What are my income and expenses?"
- Should Budget Breakdown be a status card or an editing card? Mixing both is what creates the current tension.
- Would the screen feel stronger if the two tiles became a quiet comparison strip instead of rounded blocks?
