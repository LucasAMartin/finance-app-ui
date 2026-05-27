---
target: budget screen
total_score: 23
p0_count: 1
p1_count: 2
timestamp: 2026-05-26T18-34-44Z
slug: src-screens-budgetscreen-tsx
---
# BudgetScreen Critique — `src/screens/BudgetScreen.tsx`

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Hero shows budgeted vs income and flips red when over, but there's no persistent text signal — only color. The undo toast closes after 7s even if the user has scrolled away. |
| 2 | Match System / Real World | 3 | 50/30/20 labels are correct finance vocabulary. "Split" as the template picker label doesn't match what users expect to see — it sounds like splitting a bill, not applying a framework. |
| 3 | User Control and Freedom | 3 | Undo system covers removes and template applications. But income edits and individual amount changes have no undo path. A user who fat-fingers the income field has no recovery. |
| 4 | Consistency and Standards | 2 | RemoveBtn uses a 10×1.5px horizontal bar — not a standard iOS affordance. iOS uses red minus-in-circle or swipe-to-delete for remove. The underline-only edit affordance for amounts is also non-standard and invisible until you know to tap. |
| 5 | Error Prevention | 2 | A group's last category can be removed, leaving an empty card with no items. Setting a budget amount to $0 silently succeeds. No income floor prevents a $0 or $1 income that would break all percentages. |
| 6 | Recognition Rather Than Recall | 1 | The RemoveBtn has zero visible affordance — users must discover that tapping the area left of each row icon does anything. AmountField's editable state is hidden behind an underline that appears only on focus. "Split" reveals nothing about available templates before interaction. |
| 7 | Flexibility and Efficiency | 2 | Template application is one tap (excellent). But there's no bulk-scale: if you raise income by 20%, every individual line still needs manual adjustment. No way to reset a single group without clearing and re-entering all rows. |
| 8 | Aesthetic and Minimalist Design | 3 | The wallpaper + frosted glass is intentional and consistent with the HomeScreen aesthetic — not decorative glassmorphism. Three group cards with identical structure risk becoming an identical-card-grid, but the distinct group colors and varying content save them. `allocatedPct` is computed and never rendered — a removed element that left no visual gap but did leave dead code. |
| 9 | Error Recovery | 3 | Undo covers the most destructive actions (remove, template). AmountField and income restore on bad input. The 7s undo window is short for a screen that requires scrolling — a user who removes a category from the bottom card and scrolls back up will miss the toast. |
| 10 | Help and Documentation | 1 | No onboarding. No empty state if all categories are removed from a group. "Split" gives no tooltip or hint. New users are expected to know what 50/30/20 means. The "Recurring" section header + icon is the only in-context explanation anywhere. |
| **Total** | | **23/40** | **Needs Work** |

## Anti-Patterns Verdict

**Does it look AI-generated?** Partially — not flagrantly, but there's DNA.

**LLM assessment**: The wallpaper + frosted card aesthetic is deliberate and matches HomeScreen — this is a consistent design language, not decorative glassmorphism. No gradient text. No side-stripe borders. No hero-metric template (the hero is admirably restrained). The group card pattern (dot + label, total right-aligned, rows below) repeats identically across all three groups. It's not yet the banned "identical card grid" because the content and color differ per group — but the structure is so uniform it reads as a repeated stamp rather than a composed layout. The missing information signal (percent allocated removed, no replacement) makes the hero feel sparse compared to what it could communicate.

**Deterministic scan**: 0 findings. The detector found nothing. The issues are interaction-layer, not markup-layer.

## Overall Impression

The screen is technically solid and visually cohesive. The wallpaper aesthetic is well-executed. The undo system is genuinely excellent — better than most native apps. But the screen has a critical discoverability problem: almost nothing interactive looks interactive. The remove affordance is invisible. The amount field doesn't signal editability. The template picker is labeled with a word that doesn't communicate its purpose. A first-time user would look at this screen and not know where to begin. That's the single biggest opportunity.

## What's Working

**Undo system.** Covering remove and template operations with a 7-second toast + full state snapshot is production-quality. Most budget apps don't offer this at all.

**Sticky allocation bar.** The scroll-driven morph from inline card to full-width sticky bar is clever and genuinely useful — the allocation bar stays visible as you edit rows deep in the list. The implementation (scroll listener + `stickyAnim`) is clean and costs nothing on the native driver.

**Native Pickers.** Using `@expo/ui/swift-ui` `Picker` with `pickerStyle('menu')` for both template and cadence gives users the native iOS dropdown — checkmarks, inertia, and all. This is the right call over a custom overlay.

## Priority Issues

**[P0] RemoveBtn is invisible.** A 10×1.5px horizontal bar with no label, no icon, no color, and a `color: p.textTer` styling is not a button — it's a spec artifact. Users will never tap it. This is the most critical UX failure on the screen; if users can't remove categories, half the screen's functionality is inaccessible. Fix: use iOS standard — a red minus-in-circle (`−` in a `#D4522A` circle, 20px) left of each row. This is universally understood. Alternatively, swipe-to-delete via `react-native-gesture-handler` `Swipeable`. Do not use the current bar.
_Suggested command: `/impeccable polish BudgetScreen category rows`_

**[P1] "Split" template picker label communicates nothing.** The hero's template Picker reads "Split" at rest, which sounds like bill-splitting. After a template is applied, the Picker shows the template name (e.g., "50 / 30 / 20") — but before that, users have no idea what it does. Fix: label it "Template" or use the active template name as the default label. The `activeTemplateName` variable already exists in the code; use it as the Picker's displayed value when a template is active, with "Template" as the fallback.
_Suggested command: `/impeccable clarify BudgetScreen hero`_

**[P1] Amount fields don't signal editability.** The underline affordance only appears after tap. Nothing in the resting state communicates that `$200` is editable. A new user sees a list of fixed numbers. Fix: add a small pencil icon or a faint underline in the resting state. Alternatively, show all amounts in a slightly lighter color than the category labels to signal they're secondary/editable data.
_Suggested command: `/impeccable polish BudgetScreen amount fields`_

**[P2] No empty state for a group card.** If a user removes all categories from Needs (possible today — each sub has a RemoveBtn), the card renders a header, no rows, and an "Add category" button. There's no visual feedback that the group is empty or that this might affect budget health. Fix: show a short placeholder row ("No categories yet — add one below") in muted text when the visible sub count is zero.
_Suggested command: `/impeccable harden BudgetScreen`_

**[P2] `allocatedPct` is computed but never shown.** Line 329 computes the percentage of income allocated, but it was removed from the hero during recent refactoring without a replacement. This is one of the most important signals in a budget screen — "you've allocated 94% of your income." Fix: surface it somewhere. The allocation bar + legend communicate amounts, not ratios. A single line below the bar like "94% of monthly income allocated" would close the gap without cluttering the hero.
_Suggested command: `/impeccable layout BudgetScreen allocation card`_

## Persona Red Flags

**Casey (Distracted Mobile User).** Casey picks up the app during a commute with 90 seconds to adjust a budget. She taps the Needs card, sees a list of categories, and wants to remove Dining (wrong group anyway, but let's say Entertainment). She sees no minus button, no swipe affordance, nothing. She taps around the row — nothing responds except the amount field, which opens a keyboard she didn't want. She gives up and exits. The RemoveBtn has failed its only job.

**Alex (Power User).** Alex wants to apply the 50/30/20 template as a starting point, then scale it for a raise. She taps "Split" — okay, the template applied. Now she increases her income. The individual budget amounts don't update — she has to edit each sub-category manually. She wants to see what percentage of income is now allocated. There's no percentage shown. She scrolls to check all three group totals, manually does the math, realizes she's at 87%, and starts editing individual rows. This took 4 minutes for a task that should take 30 seconds. The missing `allocatedPct` display and lack of proportional-scale on income change are both blockers for this persona.

**Morgan (Anxious Money Watcher).** Morgan is nervous about finances and uses this screen weekly. She removes a category ("Coffee") and immediately regrets it. The undo toast appears — but she's already scrolled down past it. After 7 seconds it's gone. She can't find the category again and doesn't know which group it belongs to. The undo window is too short for a screen that requires vertical scrolling, and there's no persistent "undo last action" in the header.

## Minor Observations

- `cadenceDisplay` function (line 82) is defined and never called. Dead code.
- `activeCadenceLabel` (line 257) is computed and never rendered in JSX.
- The `displayIncome` variable is used in the income edit pre-fill and the income row number — but the hero always shows `income` (monthly). The variable name implies it's the display value, which is slightly misleading since the hero bypasses it.
- `billsDivider` style references `cadenceBtn` and `templateHeroBtn` in StyleSheet but neither is referenced in the current JSX — dead style rules.
- The `addCatBtn` border logic (`borderTopWidth: (visibleOrigSubs.length + customs.length + groupBills.length) > 0 ? 1 : 0`) correctly hides the divider on empty groups, but this compounds the "empty group" edge case rather than addressing it.
- The allocation bar uses `barMax = Math.max(totalBudgeted, income)` which means when over budget, the bar clips rather than overflows — intentional? A brief visual overflow (red segment past the track) would communicate "over" more viscerally than a color-only signal.

## Questions to Consider

- "What if the remove affordance used the standard iOS minus-in-circle? Would users trust the screen enough to actually manage their budget, or would the destructive affordance create anxiety?"
- "The template picker is the most powerful feature on this screen — applying 50/30/20 in one tap — but it's buried in the hero with an ambiguous label. What if it had a more prominent position the first time?"
- "The allocation bar shows needs/wants/savings proportions, but there's no target line showing what the *ideal* proportion would be per the active template. Would showing the target alongside the actual make the budget feel more goal-directed?"
