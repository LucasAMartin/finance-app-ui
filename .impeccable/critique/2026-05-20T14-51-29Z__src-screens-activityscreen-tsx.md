---
target: history screen calendar and filter popup
total_score: 25
p0_count: 0
p1_count: 2
p2_count: 3
timestamp: 2026-05-20T14-51-29Z
slug: src-screens-activityscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Calendar state well-communicated; custom range mid-selection shows weak "?" signal |
| 2 | Match System / Real World | 3 | Natural language presets are good; Monday-first week conflicts with iOS system default |
| 3 | User Control and Freedom | 2 | Two disconnected date systems (selectedDay vs dateFilter) create irreconcilable state with no single escape |
| 4 | Consistency and Standards | 3 | Internal chip vocabulary is consistent; TransactionCalendar weekdays (3-letter) vs MiniCalendar (2-letter) differs |
| 5 | Error Prevention | 2 | No guard against over-filtering to zero results; no constraint on impossible date ranges |
| 6 | Recognition Rather Than Recall | 3 | All filter options visible; active date range NOT surfaced in main view after sheet closes |
| 7 | Flexibility and Efficiency | 2 | 5-6 taps for the most common operation (category filter); no fast-path for power users |
| 8 | Aesthetic and Minimalist Design | 3 | Clean overall; dotRow reserves 12px even on empty days; MiniCalendar summary adds density |
| 9 | Error Recovery | 1 | Empty state is a dead end — "Try adjusting your filters" with no inline clear action |
| 10 | Help and Documentation | 3 | Accessibility labels thorough post-fix; swipe-to-dismiss calendar has zero affordance hint |
| **Total** | | **25/40** | **Acceptable — significant improvements needed** |

---

## Anti-Patterns Verdict

**LLM assessment: Passes.** No gradient text, no glassmorphism, no side-stripe borders, no hero metrics. The design system is tight: one accent in three constrained roles, group colors doing functional-only work, flat-first elevation throughout. The calendar trigger chip + panel share the same accent.fill surface in a way that creates genuine spatial continuity — that is a designed decision, not a default. The filter chips use the 50/30/20 group palette purposefully. Nothing about this reads as AI-generated "finance app template."

**Deterministic scan: No findings.** The automated detector returned an empty array on both `ActivityScreen.tsx` and `TransactionCalendar.tsx`. No slop tells flagged.

---

## Overall Impression

The visual execution is well above average for a mobile finance app — the spring animation on the calendar expand, the corner-radius morph at the chip-to-panel junction, and the accent color continuity from trigger to panel are all precisely crafted. The problem is architectural, not aesthetic: the screen has two independent date mechanisms that never talk to each other, and the filter sheet buries the highest-value control (category) beneath the lowest-value one (sort order). The visual quality creates an expectation of polish that the interaction logic doesn't yet meet. One structural fix to the date system and one reorder of the filter sheet would bring this to "Good" territory.

---

## What's Working

**1. The calendar trigger-to-panel animation.** The spring expand, corner-radius morph from 14→0 at the chip-panel junction, and chevron rotation at 180° are all executed with precision. The shared accent.fill background creates physical continuity between trigger and panel — the panel reads as the trigger opening up, not as a separate layer appearing below. This is the best interaction on the screen and feels intentional rather than templated.

**2. Category chip group coloring.** Using `groupColor + '18'` for inactive background and solid `groupColor` for active — with `theme.bg` text on active — creates immediately legible selection states that reinforce the 50/30/20 framework without being decorative. The "Needs" / "Wants" group sub-labels in their respective colors add semantic structure at no visual cost.

**3. Transaction dots on the calendar.** Filled dot for transactions, outlined dot for bills is a cleanly decodable binary encoding that requires no legend. The dots work as a heatmap of financial activity — useful for glance-mode users identifying dense days without reading individual rows.

---

## Priority Issues

**[P1] Two disconnected date mechanisms produce ambiguous state**
The main calendar panel's `selectedDay` and the filter sheet's `dateFilter` are parallel, disconnected systems. `selectedDay` triggers the `dayDetail` rendering path; `dateFilter` governs the `filtered` memo. They never communicate. A user who has `dateFilter = 'yesterday'` active from the sheet, then opens the calendar panel and taps May 15, now sees May 15's detail — but the filter badge still says "1 active" for yesterday. The `Reset` button in the calendar panel only clears `selectedDay` and `calViewMonth`; it does not touch `dateFilter`. "Clear all" in the filter sheet resets `dateFilter` but leaves `selectedDay` alive if set. The two mechanisms cannot be reconciled through any single action.

**Why it matters:** Users will encounter states where the badge says "1 filter active," the calendar shows a selected day, and they cannot determine which is controlling the list without opening the filter sheet. Confidence in the data being shown is the product's core value proposition — this directly undermines it.

**Fix:** Unify date selection. Option A: make calendar day-taps write to `dateFilter` as a single-day range `{ from: date, to: date }`, eliminating `selectedDay` entirely. Option B: make `selectedDay` visually subordinate to `dateFilter` with a clear label ("Showing: May 15 | Filters active: 1"). Option C: when a calendar day is selected, automatically clear `dateFilter`, and vice versa — enforce mutual exclusivity with a UI signal. Also: wire the calendar `Reset` button to call `setDateFilter(null)` in addition to its current behavior.

**Suggested command:** `/impeccable craft date-selection unification`

---

**[P1] MiniCalendar range fill is effectively invisible**
`theme.chipBg` in light mode is `rgba(14,14,16,0.04)` — 4% opacity on near-white. The fill strip connecting the start and end date endpoints in the MiniCalendar is invisible in practice. The start and end circles (solid `theme.text` fill) are clear; the range between them communicates nothing. The core UX contract of a range calendar — "see the days you've selected" — is broken.

**Why it matters:** Users selecting a range must trust their memory of which days they tapped rather than read visual confirmation. On a 6-row month with 42 cells, the correct range is impossible to verify without the fill. This is especially severe for the primary use case: "show me the last two weeks."

**Fix:** Use `theme.accent.fill` (verdigris, 100% opacity) for the range strip — consistent with the calendar panel's accent system and immediately visible. The fill sits beneath the day circles, so it won't obscure the numbers. If accent.fill is too strong, `theme.sep` (8% opacity) or a dedicated `rgba(14,14,16,0.10)` range token work as fallbacks.

**Suggested command:** `/impeccable polish ActivityScreen`

---

**[P2] Filter sheet section order inverts user priority**
SORT BY sits at the top of the filter sheet, occupying a full-width Segmented control — the highest visual weight and the first thing users see when the sheet opens. CATEGORY is below the fold on most devices, requiring scroll to reach. Usage frequency is the opposite: sort is a persistent preference changed rarely; category is the primary filter reason for opening the sheet at all.

**Why it matters:** Every time a user opens the filter sheet to set a category, they must scroll past SORT BY. Over the lifetime of the app, this is the most-repeated extra interaction. For the stated use case (busy professionals in short windows), every extra tap compounds.

**Fix:** Reorder sections to CATEGORY → DATE → SORT BY. Optionally, remove SORT BY from the sheet entirely and surface it as a small inline control (e.g., a toggle or compact chip row) in the main screen header, adjacent to the filter button. Sort is a display preference, not a filter — it belongs closer to the list it controls.

**Suggested command:** `/impeccable layout FilterSheet`

---

**[P2] No active filter state visible after sheet dismissal**
Once the filter sheet closes, the only indication that filters are active is the badge count on the filter button (a small numeric badge on a 44px chip). The specific active filters — the date range, the selected category — are invisible from the main view. A user who set "This week + Dining" will see a list of results with no label explaining what they're looking at.

**Why it matters:** The list content changes silently. Users comparing numbers across sessions ("wait, why does this look different from yesterday?") cannot verify their filter state without re-opening the sheet. This creates low-grade uncertainty that undermines trust in the data.

**Fix:** Add a filter summary strip below the search row that appears when `activeCount > 0`. Display each active filter as a small read-only pill with an individual × close tap target. Labels should match the chip labels from the sheet: "Dining" / "This week" / "Highest first". Tapping × on a pill clears that single filter without opening the sheet. This eliminates the need to open the sheet just to see or clear a single filter.

**Suggested command:** `/impeccable craft filter-summary-strip`

---

**[P2] Savings group absent from category filter**
`EXPENSE_GROUPS` in `ActivityScreen.tsx` contains only `needs` and `wants`. The Savings group — the third pillar of the 50/30/20 framework that organizes the entire app — is silently missing from the filter sheet. A user looking for savings-category transactions has no filter path.

**Why it matters:** The app's identity is built on the 50/30/20 framework. The filter sheet is the primary way users explore by that framework. Omitting one third of it undermines coherence. Even if the current mock data has no savings transactions, the UI structure should reflect the complete model.

**Fix:** Add `{ key: 'savings', label: 'Savings', cats: [] }` to `EXPENSE_GROUPS` with whatever categories from `CAT_TO_GROUP` map to savings. If no transaction categories currently map to savings in the data layer, note this as a data gap and add a placeholder group (greyed out, labeled "No savings transactions yet") rather than silently omitting it.

**Suggested command:** `/impeccable harden FilterSheet`

---

## Persona Red Flags

### Casey (Distracted Mobile User — Busy Professional)
Casey opens the history screen between meetings, one-handed, with 30 seconds to answer "how much did I spend on dining this week?"

**Red flags:**
- Tapping the filter button → sheet opens → SORT BY is front and center, not CATEGORY. Casey has to scroll before reaching the category chips. Abandonment risk: medium.
- The filter button is a small square chip in the top-right corner of the search row — top-of-screen, far from thumb zone. Casey will need a two-handed reach or a precision tap to hit it.
- After filtering by "Dining" and "This week," Casey dismisses the sheet. She now has a list with no label indicating what she's viewing. She glances at the total and gets interrupted. When she returns, she has forgotten what she filtered and the badge says "2" but she can't remember if that's "Dining + This week" or something she set last session.
- Swipe-to-dismiss on the calendar panel is completely undiscoverable. Casey will only ever close it by tapping the trigger chip again.

### Alex (Impatient Power User)
Alex wants to review Q1 spending across categories as fast as possible. He'll use every shortcut available.

**Red flags:**
- To set a date range, the path is: filter button → scroll → tap Custom → MiniCalendar appears → tap start → tap end. That is a minimum of 5 taps after opening the sheet, with no shortcut path. The main calendar panel is always visible but can only select a single day — it cannot be used for range selection at all. Alex will use the calendar panel, find it doesn't give him a range, then discover the filter sheet's MiniCalendar and be frustrated by the duplication.
- The month title in `TransactionCalendar` is tappable to open a MonthPicker (3-year grid). This is a genuine power feature. But there is no visual hint that the title is interactive — no underline, no secondary indicator, nothing. Alex may discover it by accident; he may not discover it at all.
- Once a filter is active, removing a single filter requires: tap filter button → scroll to the relevant section → find the active chip → tap it. There is no one-tap "remove this filter" path. Alex would strongly prefer individual × badges on filter pills in the main view.

### Riley (Deliberate Stress Tester)
Riley actively tries to break the interaction model.

**Red flags:**
- Riley sets a category filter (Dining), then selects a day in the calendar panel (May 15). The day-detail list shows Dining transactions for May 15. Then Riley opens the filter sheet — the DATE section shows no active preset, but `activeCount` shows 1 (for the category). Riley changes the date preset to "Today." Now the filter sheet's dateFilter = 'today', but `selectedDay = 15`. The rendered content is `dayDetail` (May 15, Dining-filtered), not the `filtered` list (Today, Dining). The badge count says "2." Riley has no way to understand what is actually driving the display.
- Riley sets a custom date range: May 1 – May 10. She then taps "This week" preset. The `customMode` is set to false and `dateFilter` becomes 'this-week'. But in the MiniCalendar, `localFrom` and `localTo` are still set until the next time the sheet opens (the `useEffect` clears them when `visible` becomes true). This is a benign bug — the state is cleared correctly on re-open — but it means mid-session there is orphaned local state.
- Riley sets "This month" filter (recently fixed to correctly filter by `CALENDAR_MONTH`). She navigates the main calendar panel to a different month (December). The calendar shows December with no dots. The list shows May transactions (correctly filtered by `this-month`). The calendar navigation state and the list content are now about different months with no visual reconciliation.

---

## Minor Observations

- The `Reset` button in the calendar panel uses uppercase tracked label style — it reads as a section header, not a CTA. It needs either a chip shape or a color distinction (e.g., `theme.accent.dot` color) to read as interactive.
- `May 6 – ?` as a chip label uses `?` as a UI element — the only place in the app. Replace with an ellipsis or en-dash followed by a placeholder: `May 6 – …` or `May 6 –   `.
- The `dotRow` height is fixed at 10px with `marginTop: 2` even on days with zero marks. The 12px reservation below every day number contributes ~5% to the total 420px `CAL_H`. If dots were conditional (`display: none` when no marks), the calendar could fit in a shorter panel.
- The `calActiveDot` on the calendar trigger (6×6px circle) appears when a day is selected but adds no information not already conveyed by `triggerLabel` changing from "May" to "May 6." Consider removing it or making it serve a different signaling purpose (e.g., appear when `dateFilter` is active from the sheet).
- Both calendar components start weeks on Monday. This is a documented design decision, but for a US-primary audience it diverges from iOS system calendars (Sunday-start). Worth a conscious call in DESIGN.md.
