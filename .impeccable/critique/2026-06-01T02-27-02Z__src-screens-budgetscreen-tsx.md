---
target: Budget screen income container
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-01T02-27-02Z
slug: src-screens-budgetscreen-tsx
---
**Design Health Score**

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The hero communicates left-to-assign/over-budget clearly, and delete has undo. Income edit affordance is too implicit. |
| 2 | Match System / Real World | 3 | 50/30/20 language is natural, but "Assigned" and the separate income chip require budget-app literacy. |
| 3 | User Control and Freedom | 3 | Undo and collapsible groups are solid. Income editing escapes into a separate flow, which is okay but visually undersignaled. |
| 4 | Consistency and Standards | 2 | Income uses the same SectionCard as major content, but visually behaves like a small control. That mismatch is the main problem. |
| 5 | Error Prevention | 3 | Category/income validation exists. The budget overview itself does not risk many destructive errors. |
| 6 | Recognition Rather Than Recall | 2 | Users must infer that the income container is tappable and that income drives the allocation math. |
| 7 | Flexibility and Efficiency | 2 | Editing is available, but the screen exposes no fast way to rebalance or auto-allocate from the summary. |
| 8 | Aesthetic and Minimalist Design | 2 | The budget top stack has too many separate frosted surfaces competing before the group cards begin. |
| 9 | Error Recovery | 3 | Plain validation and undo support are present. |
| 10 | Help and Documentation | 1 | No contextual hint explains the budgeting model or the income control. |
| **Total** | | **24/40** | **Acceptable: useful foundation, but top-of-screen hierarchy needs a sharper model.** |

**Anti-Patterns Verdict**

This does not look like generic AI UI. The deterministic scan returned no findings for `src/screens/BudgetScreen.tsx`, and the screen avoids the big banned tells: no gradient text, no side stripes, no decorative card grid, no hero-metric SaaS cliche.

The issue is subtler: the screen has "card soup" at the top. The hero, allocation card, income button card, then group cards all use similar frosted material language. That makes the income container feel like another content section, even though it is actually an edit affordance and a mathematical input.

Browser visualization was skipped because Expo web cannot start in this repo without installing `react-dom` and `react-native-web`. I did not add dependencies for a critique-only pass.

**Overall Impression**

The budget screen has the right product idea: lead with "left to assign," show the 50/30/20 allocation, then let people tune group/category budgets. The biggest opportunity is to make income feel like the source of the budget system rather than a small detached container below the allocation chart.

**What's Working**

- The hero framing is strong. "Left to assign" or "Over budget" is the right first question for a monthly budget screen.
- The allocation bar plus group colors map cleanly to Needs/Wants/Savings and respects the data-forward product direction.
- Group cards have useful hierarchy: group name, target, total, then editable categories.

**Priority Issues**

**[P1] Income is visually misclassified**

The income control is wrapped in the same `SectionCard` shell as the allocation summary and the group cards, then contains a smaller tinted pill inside it (`BudgetScreen.tsx:1016-1035`, `2038-2044`, `2055-2060`). This creates a card-inside-control feeling without actually nesting cards. It reads like a tiny widget rather than the source value that powers the entire budget.

**Why it matters:** Users checking budgets quickly need to understand the equation: income minus assigned equals left to assign. Right now the equation is split across three separate zones.

**Fix:** Merge income into the allocation summary as a compact equation row: `Income $X  -  Assigned $Y  =  Left $Z`, with income as the only editable chip. Keep the allocation bar below it. The income value can have a small edit icon or chevron to signal tapability. Suggested command: `impeccable layout BudgetScreen income summary`.

**[P1] The top stack has too many equal surfaces**

The screen renders the open hero, allocation card, income card, then spending group cards with a uniform `sectionStack` gap of 16 (`BudgetScreen.tsx:1133-1186`, `2045-2049`). The user's eye has to decide whether the income card belongs to the overview, the group list, or a separate setting.

**Why it matters:** This is a quick-glance mobile tool. Every extra surface before the actual categories delays comprehension.

**Fix:** Treat the hero + allocation + income as one "budget equation" module. Either make one larger frosted card after the open hero, or let the hero contain the equation directly on wallpaper and reserve cards for the group list. Suggested command: `impeccable distill BudgetScreen top summary`.

**[P2] The income control affordance is too quiet**

The `TouchableOpacity` has accessibility role and label, but visually it has no chevron, edit pencil, source label, or action text (`BudgetScreen.tsx:1018-1024`). The centered two-column layout makes the dot divider feel decorative, not actionable.

**Why it matters:** A first-time user may not know they can change income from this screen, especially because the Income flow is elsewhere.

**Fix:** Add a small trailing edit/chevron icon, or recast the row as `Monthly income` on the left and `$X` plus chevron on the right. Do not make it louder; make it more standard. Suggested command: `impeccable clarify BudgetScreen income control`.

**[P2] "Assigned" is useful but incomplete without the equation**

The current income label pair is `$income / INCOME` and `$totalBudgeted / ASSIGNED` (`BudgetScreen.tsx:1025-1033`). It omits the result even though the result is the screen's hero metric.

**Why it matters:** Users must mentally connect those numbers to "Left to assign" above. That is small, but it is exactly the kind of working-memory tax that makes budgeting feel harder than it is.

**Fix:** Show the result in the same row or make the hero and row visually continuous. A compact math row would remove the mental bridge. Suggested command: `impeccable layout BudgetScreen budget equation`.

**Cognitive Load**

Failure count: 3 of 8, moderate.

Failed checks: single focus, visual hierarchy, working memory. The screen chunks group data well, but the top summary asks the user to stitch together hero result, allocation bar, income, and assigned total across separate surfaces.

Visible options are mostly acceptable. The month picker has 25 menu actions, but it is hidden behind a standard menu. The group rows reveal complexity progressively through collapsible sections.

**Persona Red Flags**

**Casey, distracted mobile user:** Casey can see the left-to-assign number quickly, but the small income card is easy to skip. If income is wrong, the path to correction depends on noticing a quiet centered chip.

**Jordan, first-timer:** Jordan understands "Income" but may not understand "Assigned." The screen does not present the budget equation in one place, so Jordan has to infer how the numbers relate.

**Sam, accessibility-dependent user:** The income button has a good accessibility label, but the visual relationship is color/material based. Meaning is not fully encoded structurally for sighted low-vision users either.

**Minor Observations**

- The allocation card being sticky is a good interaction, but the income card staying behind may make income feel less important after scroll.
- `SectionCard` padding is optimized for content cards; it makes the income button look padded twice because the actual touchable has its own tinted background.
- The month button competes a little with the hero result on smaller widths because both sit in the same row.

**Questions To Consider**

- Should income be a setting-like input, or part of the main budget equation?
- Does the Budget screen need both a hero result and a separate income/assigned mini-card, or should those collapse into one composable summary?
- When the user scrolls, should the sticky allocation bar include income context, or is the allocation mix enough?
