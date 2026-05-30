---
target: Budget screen, category edit sheet, and income sheet
total_score: 22
p0_count: 0
p1_count: 4
timestamp: 2026-05-30T02-16-45Z
slug: src-screens-budgetscreen-tsx
---
**Design Health Score**

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Budget status is clear, but regular income save has no completion feedback and invalid category actions can silently do nothing. |
| 2 | Match System / Real World | 3 | Most labels are plain, but "Free" is vague and recurring categories do not match the full bill-recurring model users expect. |
| 3 | User Control and Freedom | 2 | Category and bill removal have undo, but income delete is immediate and category sheet lacks an explicit close action. |
| 4 | Consistency and Standards | 3 | Sheets mostly match TxSheet field cards and primary buttons, with some divergence in headers and sheet closure patterns. |
| 5 | Error Prevention | 2 | Income has disabled save states, but category add/edit validation is uneven and destructive income actions lack guardrails. |
| 6 | Recognition Rather Than Recall | 2 | Primary actions are visible, but swipe delete, selected-income-to-form relationship, and icon editing are easy to miss. |
| 7 | Flexibility and Efficiency | 2 | Multiple regular incomes are supported, but one-time income management, month range, and recurring setup are thin. |
| 8 | Aesthetic and Minimalist Design | 3 | Main screen is restrained and data-forward; savings category and income sheets are dense. |
| 9 | Error Recovery | 2 | Undo exists for category and bill removal, but income deletion and silent form failures are weak recovery paths. |
| 10 | Help and Documentation | 1 | Advanced concepts like one-time income, recurring categories, and goal fields have no contextual guidance. |
| **Total** | | **22/40** | **Acceptable: solid visual base, but several product trust gaps.** |

**Anti-Patterns Verdict**

This does not read as obvious AI-generated UI. The Budget screen has a recognizable product shape, uses the app's group color system intentionally, and avoids the worst generic patterns like gradient text, neon finance drama, or decorative side stripes.

The deterministic scan reported no findings for `src/screens/BudgetScreen.tsx`. Browser overlays were skipped because this is a React Native bottom-sheet target rather than a stable browser page in the current environment.

**Overall Impression**

The main Budget screen is close: the hierarchy of left-to-assign, income, assigned, and group allocations is understandable. The sheets are where trust weakens. Users can save, delete, or fail validation without enough visible confirmation, and some expected money-management concepts are represented only partially.

**What's Working**

- The allocation story is strong. The hero plus allocation card gives users a quick read before they inspect categories.
- Category grouping is visually disciplined. Needs, Wants, and Savings use semantic group colors instead of the accent color.
- The category sheet is visually aligned with TxSheet: native bottom sheet, field-card rows, and `SheetPrimaryButton`.
- Multiple regular income sources are now represented in the UI, which is the right foundation.

**Priority Issues**

**[P1] Income saving and deletion need stronger feedback**
Why it matters: A user pressing "Save income" should know whether the source was saved, especially because regular income does not close the sheet after saving.
Fix: After regular save, show a lightweight saved state or close when editing an existing source. Add undo or confirmation for deleting an income source. Add accessibility labels to the trash action.
Suggested command: `impeccable harden`

**[P1] One-time income is incomplete as a user model**
Why it matters: A user can log a one-time income, but cannot choose its received month/date, see it in a list, edit it, or delete it later.
Fix: Give One-time its own compact list/history in the income sheet, with received date, amount, source, edit, and delete. Default to the selected budget month, not always today.
Suggested command: `impeccable craft`

**[P1] Selected month income can be wrong**
Why it matters: The Budget screen has a month picker, but one-time income is calculated against `CURRENT_MONTH`, not `selectedMonth`. This can make past or future month budgets show misleading income.
Fix: Calculate one-time income from `selectedMonth`; show the selected month's income assumptions in the income sheet.
Suggested command: `impeccable harden`

**[P1] Category add/edit validation is too quiet**
Why it matters: Empty names and some duplicate add cases fail silently. In a finance app, silent failure feels like data loss.
Fix: Disable save until the category name is valid, show inline duplicate errors in add mode too, and validate goal saved <= target.
Suggested command: `impeccable harden`

**[P2] Savings category sheet is doing too much at once**
Why it matters: Savings adds target, saved so far, and target date on top of name, budget, group, recurring, notes, save, and delete. With `scrollEnabled={false}`, smaller devices and keyboard states are fragile.
Fix: Keep the full-screen sheet, but split secondary fields into compact sections: Basics, Savings goal, Recurring, Notes. Preserve the no-scrolling goal by collapsing inactive advanced sections.
Suggested command: `impeccable layout`

**[P2] Recurring category is not a full recurring expense flow**
Why it matters: The category sheet has a Recurring switch and next payment date, but it does not expose cadence or map clearly to the richer recurring-rule model already used elsewhere.
Fix: Either rename it to "Show in recurring section" if it is only organizational, or connect it to full recurring setup with cadence, due date, and amount.
Suggested command: `impeccable clarify`

**Persona Red Flags**

**Alex, power user**
Primary action: update monthly budget categories quickly.
Red flags: no bulk editing for category amounts, no fast month navigation beyond the small month menu, regular income save gives no completion feedback, and recurring setup lacks cadence.

**Casey, distracted mobile user**
Primary action: add a second job income while on the go.
Red flags: regular income requires typing name and amount, deleting an income is a tiny icon with no undo, and one-time income cannot be backdated to the month they are budgeting.

**Sam, accessibility-dependent user**
Primary action: edit a category with VoiceOver.
Red flags: several Pressables lack roles or labels, delete and icon-picker affordances are visual-first, and state changes like save success are not announced.

**Cognitive Load**

Failure count: 3 of 8, moderate.

The main screen is low load. The sheets are moderate load because the category sheet asks for too many decisions at once, the income sheet combines a selected source list with an edit form, and some advanced fields lack microcopy.

**Missing Features Users Would Expect**

- Income: one-time income history, edit/delete one-time income, received date/month, start/end dates for regular income, save confirmation, delete undo.
- Category edit: disabled invalid save, add-mode duplicate validation, goal validation, recurring cadence, explicit close button, optional archive instead of only delete.
- Budget screen: month-specific income, category spent vs budget remaining, clearer "Unassigned" label instead of "Free", broader month navigation, and group collapse for long budgets.

**Questions To Consider**

- Should One-time income be treated as a transaction-like history item, or only as a temporary adjustment to the current budget month?
- Is Recurring in the category sheet meant to create a real recurring bill, or just organize categories under a recurring heading?
- Should the Budget screen help users allocate money, track spending against category budgets, or both?
