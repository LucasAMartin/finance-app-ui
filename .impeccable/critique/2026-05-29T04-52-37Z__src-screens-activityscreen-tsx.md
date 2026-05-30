---
target: history screen
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-05-29T04-52-37Z
slug: src-screens-activityscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeleton matches layout; 1100ms stub timer will become a liability when CloudKit lands |
| 2 | Match System / Real World | 4 | Language is natural throughout; "Newest first", "No activity this day", +/- prefixes correct |
| 3 | User Control and Freedom | 3 | Undo toast + per-pill dismiss + "Clear all" present; escaping a day-selection requires returning to calendar |
| 4 | Consistency and Standards | 3 | Icon circle convention consistent; dayLabel uses textTer while summaryLabel uses textSec — subtle path divergence |
| 5 | Error Prevention | 2 | Delete is immediate with post-facto undo only; no confirmation; no load-failure state |
| 6 | Recognition Rather Than Recall | 3 | Filter pills persist while scrolling; 6px day-selection dot is invisible at a glance |
| 7 | Flexibility and Efficiency | 3 | initialFilter drilldown from SpendingScreen is excellent; no "jump to today" shortcut |
| 8 | Aesthetic and Minimalist Design | 3 | Clean layout; day headers carry no spend-level visual signal despite being the primary scan target |
| 9 | Error Recovery | 2 | Undo works; no error state for failed loads; undo window has no visible countdown |
| 10 | Help and Documentation | 2 | Empty state copy is good; swipe-to-delete and recurring icon have zero discoverability |
| **Total** | | **28/40** | **Good — address weak dimensions** |

## Anti-Patterns Verdict

**Not AI-generated.** Both assessments agree: the screen shows genuine authorial decisions, not template-generation tells.

**LLM assessment:** The violet token system (needs-blue, wants-clay, savings-teal) is used semantically, not decoratively. Filter pill design uses accent fill/ink pairs rather than the navy+gold finance reflex. The calendar toggle handle is a bespoke micro-interaction. Swipe-to-delete coordination (single-open-row + undo toast) is thoughtful UX that would not appear in generated code. The one watch item: both the date label and spend total in DayGroup headers are subdued — neither has visual dominance — which reads as generated diffidence but is more likely a deliberate restraint choice.

**Deterministic scan:** Zero flags across all 27 pattern checks. No side-stripe borders, no gradient text, no glassmorphism tells, no hero-metric templates, no identical card grids detected.

## Overall Impression

The screen is well-built and coherent — the best-executed screen in the app from a technical craft perspective. Its weakness is not aesthetic but behavioral: the primary destructive action (delete) is invisible and unguarded, the day headers don't earn their position as the primary scan target, and the filtered total creates a silent discrepancy between count and amount when income rows are present. The interaction model for deletion needs a deliberate stance.

## What's Working

**1. Progressive disclosure is executed with precision.** Calendar defaults collapsed so the transaction list sits above the fold — right call for a History screen. The AnimatedCollapse measured-height guard prevents the stuck-at-5% bug. The MiniCalendar collapses inside the FilterSheet until "Custom range" is selected. This is one of the screen's clearest design strengths and worth replicating.

**2. Filter state architecture is coherent and transparent.** Pills appear adjacent to the search bar, each with its own dismiss. The filter button inverts (filled, high-contrast) when active. The badge count gives an accurate count of active filter dimensions. The external initialFilter + filterToken handshake from SpendingScreen means drilldowns feel seamless — no re-configuration required.

**3. Accessibility is first-class.** accessibilityRole, accessibilityLabel, hitSlop, and accessibilityLiveRegion coverage is thorough and rare at this stage of development. TxRows now declare a custom "delete" accessibility action. This is the right time to establish this habit.

## Priority Issues

**[P1] Swipe-to-delete is completely undiscoverable**
What: No visual hint, onboarding tooltip, or interaction affordance signals that rows are swipeable. The delete action only exists if the user accidentally finds it by swiping.
Why it matters: Finance apps require trust. A destructive data mutation that users stumble into creates both accidental data-loss risk and confusion. For a busy professional checking the app in 30 seconds, this is a real failure mode, not a theoretical one.
Fix: Add a one-time gesture hint (brief row peek animation on first visit), or expose delete in the TxSheet detail view where confirmation is more natural. At minimum, extend the undo window to 8-10 seconds and show a visible countdown progress bar on the toast.
Suggested command: /impeccable harden

**[P1] No error state for load failures**
What: The loading path is a 1100ms setTimeout stub. When CloudKit integration lands, real fetch failures will produce either an infinite skeleton or the empty state with "No transactions yet" — users will assume their data is gone.
Why it matters: Silent failure in a financial context destroys trust. There is no retry affordance and no differentiation between "empty" and "failed to load."
Fix: Design a tri-state (loading / error / success) that covers network failure: error message ("Couldn't load transactions"), retry button, and a clear visual distinction from the empty state. The stub should be replaced at the same time CloudKit is wired.
Suggested command: /impeccable harden

**[P2] filteredSpendTotal silently excludes income but count includes it**
What: The summary row reads "8 transactions, $142.00" — count includes income rows, amount does not. A user who sees 8 rows but the total doesn't add up will lose confidence in the numbers.
Why it matters: Financial data requires exact transparency. Any unexplained discrepancy erodes trust, especially for a product whose premise is accurate spending visibility.
Fix: Either exclude income rows from the count as well (cleanest: "8 expenses, $142.00"), or label the total explicitly as "spent" and surface income separately. The count-amount mismatch is the problem; pick one definition and apply it to both.
Suggested command: /impeccable clarify

**[P2] Day headers carry no spend-level signal**
What: DayGroup headers show date + spend total in subdued secondary colors, identical regardless of whether the user spent $5 or $800 that day. No visual differentiation by spend weight.
Why it matters: "Spot spending patterns at a glance" is the product's stated goal. Day headers are the primary scan target when scrolling through history. Currently users must read every number to identify outlier days — the opposite of at-a-glance.
Fix: Apply the existing over-ember treatment (OVER_DOT / overText) to day totals that exceed a threshold (e.g., monthly budget / 30). Even without a threshold, promoting the spend total to a slightly higher-weight style (bodySmEm → subsectionTitle) would create faster visual scanning. The BudgetScreen already establishes this color convention; History should use the same signal.
Suggested command: /impeccable colorize

**[P3] Calendar handle day-selection indicator is too weak**
What: When a day is selected and the calendar is collapsed, the only visible signal on the handle strip is a 6px dot — invisible at casual scanning speed. A user scrolling past a narrow result set won't understand why they're only seeing three transactions.
Why it matters: The filter pill (in the card below) is the correct primary indicator, but both surfaces should echo the state. The current handle says "Show calendar" when a day is active, missing an opportunity to surface the selection context.
Fix: When a day is selected and the calendar is collapsed, change the handle label to show the selected date: "May 28 selected · Hide?" or simply the date. Make the dot 8px with a subtle background halo so it reads as a live status, not decoration.
Suggested command: /impeccable polish

## Persona Red Flags

**Casey (Distracted Mobile User)** — primary persona match for this app
Casey opens the app at a crosswalk, wants to check if yesterday's lunch put her over budget, and glances at the History screen for 15 seconds.

Red flags:
- Swipe-to-delete (P1 above) is a real risk: a fast thumb scroll on the last transaction in a day group will accidentally trigger the swipe reveal, and Casey will delete the row before she reads the toast. There is no visual warning that this zone is live.
- The calendar card is at the top of the scroll — but the add button is at the bottom (tab bar). The calendar defaults collapsed, which is correct. But the first thing Casey sees when the screen opens is a frosted card with a toggle handle, not a transaction. The visual hierarchy says "calendar tool" before "transaction list." The greeting moment could be improved.
- The undo window has no countdown. Casey will dismiss the toast without tapping Undo, not knowing the deletion is permanent after it disappears.

**Alex (Power User)** — filter/sort system tester
Alex wants to review all dining expenses in the past two weeks sorted by amount to see where the big outliers are.

Red flags:
- Sort and filter are in the same sheet. Changing the sort order counts as "1 active filter" on the badge, meaning Alex sees the filter button filled/highlighted just because she changed to "Highest first" — no real filter applied. Sort state should not appear in the filter badge count.
- No bulk-select or batch operations. Alex wants to see if three similar charges at "Chipotle" are all correctly categorized — she must open each TxSheet individually. An edit mode with multi-select would be a meaningful power-user addition.
- No "jump to today" from a past calendar month. Alex navigated to April to check a receipt, now she's stuck pressing the next-month chevron one tap at a time to return to May.

**Riley (Stress Tester)** — data consistency edge cases
Riley applies a category filter, then selects a day on the calendar, then applies a date preset from the filter sheet.

Red flags:
- Applying a date preset in the filter sheet clears the `selectedDay` (via `handleSetDateFilter`), but does not visually update the calendar to deselect the day. The calendar will still show the day highlighted, but the list will be filtered by the preset. The state is internally consistent but visually contradicts itself.
- The calendar view month (calViewMonth/calViewYear) and the active date filter are two separate state dimensions that can point to different months. Riley can navigate the calendar to June while a "This month" filter (May) is active — the calendar shows June with no marks, the list shows May transactions, and nothing on screen explains the discrepancy.
- filteredSpendTotal (already noted) — Riley will count the rows and notice the mismatch.

## Minor Observations

The FilterSheet "Clear all" link appears when `activeCount > 0`, but `activeCount` includes sort deviation from default. Changing sort order to "Highest first" triggers the filled filter button and "Clear all" link — users don't typically think of sort as a filter to "clear."

BillRow in day-detail view is non-interactive (no onPress). If the user taps an upcoming bill row expecting to navigate to a bill detail or mark it paid, nothing happens. At minimum the row should communicate it is not tappable (remove the row affordances that suggest it is).

The `cachedCalOpen` module-level variable is creative but would be unreliable if ActivityScreen were instantiated in a modal or secondary context. Low risk today, but worth noting.

MiniCalendar hardcodes Monday as week start. TransactionCalendar may have its own start-of-week logic. If they ever diverge, the two calendars in the same filter flow would show different layouts.

## Questions to Consider

1. What does "delete a transaction" mean semantically? If it means "this purchase didn't happen," it should be rare and require confirmation. If it means "I logged this wrong," it should be followed by an edit flow, not a void. The current model (immediate swipe delete, undo-only recovery) optimizes for neither use case. What is the intended stance?

2. The screen is called "History" but its richest interactive feature is a calendar-based filter tool. What if those were two separate modes — "History" (a plain chronological list) and "Calendar" (the month view with marks) — toggled by a segmented control in the header? This would surface the calendar as a first-class navigation tool rather than a collapsible secondary widget.

3. Sort and filter are combined in one sheet, but they serve different cognitive purposes: scope (filter) vs. presentation (sort). Does the filter badge count correctly reflect both? Should a sort preference even be "clearable" as a filter?
