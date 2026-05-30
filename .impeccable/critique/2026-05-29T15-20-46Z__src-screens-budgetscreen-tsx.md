---
target: budget screen
total_score: 27
p0_count: 0
p1_count: 3
p2_count: 2
timestamp: 2026-05-29T15-20-46Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Hero eyebrow + pulse animation are excellent; income-edit save is silent |
| 2 | Match System / Real World | 3 | "Left to assign" is YNAB-familiar; "Fully assigned" vs "Budget balanced" is slightly jargon-forward |
| 3 | User Control and Freedom | 3 | Undo toast is robust; Delete category in sheet fires with no confirmation and competes with undo |
| 4 | Consistency and Standards | 3 | Native Picker for income cadence; flat tap-grid for icons — same pattern, two paradigms |
| 5 | Error Prevention | 2 | Silent no-op on duplicate category name; no template preview before apply; income commit silent on empty |
| 6 | Recognition Rather Than Recall | 2 | 28 unlabeled icons in flat grid; income/assigned buried in caption-sized touch row |
| 7 | Flexibility and Efficiency | 3 | Inline amount editing, copy-from-month, budget templates solid; no keyboard-next between fields |
| 8 | Aesthetic and Minimalist Design | 3 | Screen is restrained and premium; 20pt paddingBottom hero dead zone plus caption-weight income undercuts this |
| 9 | Error Recovery | 2 | Undo solid for deletions; zero recovery path for silent duplicate / income commit failures |
| 10 | Help and Documentation | 3 | Template prompt card and Goals empty state are excellent; icon grid and "Saved" goal field offer no guidance |
| **Total** | | **27/40** | **Good foundation, three P1 structural holes** |

---

## Anti-Patterns Verdict

**Does this look AI-generated?** No. The scroll-driven sticky morph (allocation bar transitioning into a pinned header as you scroll), the AmountField materializing a colored pill on focus while rendering as plain text at rest, and the `fullyAssignedPulseAnim` color-shifting the hero eyebrow to teal on zero balance — these reveal deliberate, authored craft. The two assessments agree: the screen has personality everywhere except the `CategoryEditSheet` icon grid, which reads as the default unthought-through solution against an otherwise considered backdrop.

**Automated scan findings:** 8 patterns flagged, 0 P0, 3 P1, 4 P2, 1 P3. No false positives that require dropping from the report. The legend percentage captions and heroFigure marginBottom were reviewed and cleared as intentional.

---

## Overall Impression

The budget screen's bones are excellent. The hero/card composition, the sticky allocation summary, and the tactile inline editing model all hold up under scrutiny. What's failing is information architecture, not aesthetics: the income figure (the denominator for every calculation on screen) is buried as fine print; the category editor sheet can't answer the question "how much should I spend on this?" because the budget amount isn't in it; and the icon picker is an uncanny-valley break where the premium register drops the moment it opens.

The single biggest opportunity is resolving the split interaction model: a user opening the category sheet should be able to define the category, choose an icon, set the budget, flag it as recurring, and set a goal deadline without ever touching the main list. Right now they can only do the first three (halfway), and one of those three (icon) is done poorly.

---

## What's Working

1. **The scroll-driven sticky morph.** The allocation bar transitioning from an inline card element into a pinned header as the user scrolls is technically sophisticated and functionally invaluable — it keeps budget summary visible while editing line items, solving a real navigational problem without a separate fixed header.

2. **AmountField at-rest / on-focus state.** Rendering as invisible plain text at rest, materializing a colored border-and-tint pill only on focus, is a masterclass in density management for a list with dozens of rows. No affordance is hidden — tap targets exist — but the visual noise of showing 20 edit boxes simultaneously is completely eliminated.

3. **The undo toast architecture.** The deferred-delete / snapshot-restore pattern with a 7-second window handles accidental swipes on history-laden categories gracefully. This is the right primitive for a screen where a deleted category could represent months of data.

---

## Priority Issues

### [P1] Hero dead space + income/assigned burial — two symptoms, one root cause

**What:** The hero has `paddingBottom: 20` and `marginBottom: 14` on the figure, producing ~34pt of empty air below the display amount. The income figure — the denominator for every allocation percentage on screen — appears only once, as `TYPE.caption` (12px/500) in a small touch row at the bottom of the next card, styled identically to secondary metadata. The two assessments agree: these share a root cause — the hero was designed as a single focal metric but the budget screen actually has two primary numbers (unassigned and income).

**Why it matters:** The hero reads as incomplete. A busy professional glancing at "$847 left to assign" has no immediate context for whether that's impressive or alarming without mentally finding and reading the fine-print income row. This violates the core design principle: "Clarity at a glance."

**Fix:** Remove the hero bottom padding entirely. Add two sub-metric labels directly beneath the large figure — `$X,XXX income · $X,XXX assigned` — at `TYPE.labelLg` or `TYPE.bodySmEm` with `hero-sec` color. The income/assigned row in the allocation card can then become a pure "Edit income" button (not data-bearing), shrinking to a minimal 36pt touch target.

**Suggested command:** `/impeccable layout BudgetScreen hero — collapse dead space, surface income figure as sub-metric beneath the hero amount`

---

### [P1] Category sheet split interaction model — budget amount not in editor

**What:** To define a category you open the `CategoryEditSheet`. To budget for it you must dismiss the sheet and tap a small inline `AmountField` on the main list row (92×32pt, borderless, `textAlign: right`). A new user adding a category will expect to set the budget in the same flow and will not discover the inline field. Additionally, the sheet has no field for:
- Monthly budget amount (the most critical omission)
- Recurring expense toggle ("appears in every month's budget")
- Goal deadline / target date (currently users can set target and saved amounts but not a target date)
- Bill reminder

The automated scan flagged this as the most impactful IA hole.

**Why it matters:** The category sheet is the mental model anchor for "what is this category?" A form that cannot answer "how much do I plan to spend?" or "is this recurring?" is incomplete. Users will re-open the sheet looking for fields that don't exist.

**Fix:** Add to `CategoryEditSheet` in this order: (1) a "Monthly budget" amount field, reading/writing to `budgets[bKey(...)]`, pre-populated from the current value; (2) a "Recurring" toggle row using a native SwiftUI Toggle or a styled `Switch`, which sets `meta.recurring = true` and causes the category to auto-appear in every month's budget template; (3) for savings goals, a "Target date" field using a native date Picker. These three fields collapse the need for a split workflow.

**Suggested command:** `/impeccable craft CategoryEditSheet — add monthly budget field, recurring toggle, and goal deadline picker to complete the category record`

---

### [P1] CategoryEditSheet icon picker — 28 icons, flat grid, no native Picker

**What:** The icon selection UI dumps all 28 icons in `CATEGORY_ICON_OPTIONS` into a flat `flexWrap` grid with no labels, no grouping, and no search. This stands in direct contrast to every other picker in the screen (cadence: SwiftUI Picker; month: MenuView; budget template: SwiftUI Picker). The automated scan also flagged that several icons in the current set are UI controls (`search`, `settings`, `filter`, `keypad`, `split`, `ellipsis`) — unlikely choices for spending categories — inflating the grid with irrelevant options.

**Why it matters:** The icon grid is the moment the premium register drops. Scanning 28 unlabeled 42×42 glyphs is the highest cognitive-load moment in the entire screen. H4 (consistency) and H6 (recognition) both fail here.

**Fix (as the user specified):** Show the current icon as a tappable row — icon preview + name label + "Change" link. Tapping opens a `MenuView` (same as the month picker) with icon options listed by semantic name. First 8–10 most-used options appear directly; remainder in a "More..." submenu. This eliminates the grid entirely, is consistent with existing patterns, and cuts the CATEGORY_ICON_OPTIONS set to category-relevant entries only (remove: `search`, `settings`, `filter`, `keypad`, `split`, `ellipsis`, `mic`, `chevD`, `chevR`, `chevL`, `close`, `trash`, `plus`, `menu`, `repeat`, `ellipsis`).

**Suggested command:** `/impeccable craft CategoryEditSheet icon picker — replace flat grid with MenuView, trim icon set to category-relevant entries`

---

### [P2] Silent failure on duplicate category name

**What:** `saveCategoryEdit` (line 754) silently returns without error when a duplicate label is detected. The user taps "Save category" and nothing happens — no error message, no field highlight, no toast. H5 (error prevention) and H9 (error recovery) both fail.

**Why it matters:** The user has no way to diagnose why the button did nothing. They will tap again, assume the app is broken, or close the sheet thinking the save succeeded when it didn't.

**Fix:** Add a `[duplicateError, setDuplicateError]` state boolean. Set it on duplicate detection, render an inline error beneath the name TextInput: `"A category with this name already exists"`. Clear on next `onChangeText`. Three-line addition.

**Suggested command:** `/impeccable harden CategoryEditSheet — add duplicate name error state and inline error message`

---

### [P2] Category vs bill row tap affordance inconsistency

**What:** Category rows are wrapped in `TouchableOpacity` (opens the category editor). Bill rows are wrapped in `View` (no tap action). Both rows are visually identical: same `styles.editRow`, same 32px icon circle, same trailing `AmountField`. Both support swipe-to-delete. A user who discovers category row tap will attempt the same on bill rows and get silence.

**Why it matters:** Inconsistent affordances train distrust. Users begin to doubt what is and isn't interactive.

**Fix:** Either (a) make bill rows tappable (opens a bill/recurring rule editor sheet), which is the correct long-term fix given the IA goal of completeness; or (b) add a subtle `chevR` at 11px trailing indicator only on category rows to distinguish them visually before the tap is attempted. Option (a) aligns with the P1 fix for the category sheet.

**Suggested command:** `/impeccable craft bill row editor — add tap-to-edit sheet for bill/recurring rows, matching category editor pattern`

---

## Persona Red Flags

**Maya (Busy Professional, primary user):** Opens the app during a 10-minute window to set up her June budget. She taps "Add category" for a new line item under Savings. The sheet opens, she types "Travel Fund," sees the icon auto-selected, sets the group to Savings, enters a goal target. She cannot find where to enter the monthly savings amount — it's not in the sheet. She taps Save, goes back to the list, eventually discovers the small inline amount field on the right edge. She then tries to find the same category next month and wonders why it doesn't carry over — she doesn't know a "Recurring" flag exists (because it doesn't). She closes the app having spent 5 minutes on a 30-second task.

**Lucas (Power User who built this):** Fully comfortable with the interaction model because he designed it and knows where the inline amount fields are. He won't notice the icon grid overload because he knows the icon set by memory. His blind spot is the new-user discovery failure: every feature is discoverable to him but invisible to someone approaching cold. The CategoryEditSheet needs to be self-complete for someone who has never used this screen before.

---

## Minor Observations

- `fmtMoney` rounds income to the nearest dollar — a user entering $5,200.50 sees $5,201 in the allocation card, creating a subtle confidence-eroding discrepancy.
- The `repeat` icon is used for both "Copy from previous month" (hero CTA) and the "Recurring" section divider inside group cards — same glyph, different semantics.
- The `CATEGORY_DETENT` at `{ fraction: 0.74 }` causes the Save button to fall below the fold when savings group is selected and goal fields are visible — first-time savings category creation requires scrolling to find the primary action.
- Goals empty state uses `\n` line break in a centered caption; a distinct "Add goal" button row would be more actionable.

---

## Questions to Consider

- If the allocation bar is already the screen's visual hero, does the large "Left to assign" figure add decision-making value — or is the bar itself (tappable, with expand-to-group) sufficient to carry the screen's cognitive load?
- The category sheet currently mixes three user jobs (describe, categorize, plan). Should these become a sequential 3-step flow within the sheet — naming first, then grouping, then budgeting — to focus attention on one decision at a time?
- Could the inline AmountField be removed entirely in favor of a sheet-first editing model, simplifying the interaction surface to a single consistent touch target per row?
