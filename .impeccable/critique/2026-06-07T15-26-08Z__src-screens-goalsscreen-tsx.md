---
target: goals screen
total_score: 19
p0_count: 2
p1_count: 2
timestamp: 2026-06-07T15-26-08Z
slug: src-screens-goalsscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | Status badge is binary (on-track/behind) with no quantification; projected completion date is completely absent |
| 2 | Match System / Real World | 3/4 | Goal vocabulary is natural; ISO date string in a plain text field is a platform mismatch |
| 3 | User Control and Freedom | 2/4 | No goal deletion, no contribution editing/deletion; "Mark complete" is irreversible with no confirmation |
| 4 | Consistency and Standards | 3/4 | Color tokens used correctly; one hardcoded rgba in DetailStat label instead of theme.textTer |
| 5 | Error Prevention | 1/4 | Date field accepts any text and fails silently on parse; no live validation; "Mark complete" on a $9k-remaining goal has no confirmation |
| 6 | Recognition Rather Than Recall | 2/4 | "Needed" label in detail sheet requires the user to remember what it means; no guidance on what to do with the numbers |
| 7 | Flexibility and Efficiency | 2/4 | 430px hero forces scroll to reach goals 2+; no swipe-to-contribute; no quick-add from rows |
| 8 | Aesthetic and Minimalist Design | 2/4 | Hero contains 11 visual elements; "Activity: 3" is filler; TOTAL SAVED card then duplicate goal row is redundant |
| 9 | Error Recovery | 1/4 | No undo for any action; contribution amount errors have no recourse; mark-complete is permanent |
| 10 | Help and Documentation | 1/4 | No contextual explanation of "Needed" or how the suggested monthly is calculated; one generic sentence in the form |
| **Total** | | **19/40** | **Needs work** |

---

## Anti-Patterns Verdict

**Does this look AI-generated?**

**LLM assessment:** Moderate slop signal. The FeaturedGoal — progress ring centered on screen, amount below, three stat chips in a row — is textbook AI-generated savings-tracker structure. The 2×2 stat grid (Saved/Remaining/Monthly/Needed) is the canonical "four KPI tiles" pattern found in thousands of AI-generated finance UIs. The "Activity: 3" stat cell is the clearest slop tell: a filler chip with a count that conveys nothing actionable.

What prevents a full-slop verdict: the wallpaper-scrim approach is opinionated, the status logic is domain-specific, and there is no gradient text, neon glow, or gratuitous glassmorphism. The app system is holding; the hero component inside it is not.

**Deterministic scan:** `npx impeccable detect` returned zero findings — no side-stripe borders, gradient text, or other flagged patterns in the file.

---

## Overall Impression

The component structure is solid and the underlying data model is well thought-out. But the screen is trying to do two incompatible things at once: (1) surface one "priority" goal as a hero, and (2) give each goal equal treatment. The result satisfies neither. The user's most important question — "will I hit this goal by my deadline?" — is unanswerable from either the main screen or the detail sheet, because the projected completion date is never calculated or displayed.

---

## What's Working

1. **The `statusFor()` caution coloring.** Amber persists from the row badge through to the detail sheet's "Needed" stat. The visual signal is correct and consistent.

2. **Live suggested monthly calculation in the form.** Showing "Suggested plan: $420/mo" as the user fills in target/deadline is the best UX moment in the file — contextual, live, and immediately actionable.

3. **Contribution activity log in the detail sheet.** Placing the contribution ledger in the sheet (not the main screen) is the right information architecture decision. The date grouping and note field make it scannable.

---

## Priority Issues

**[P0] Architecture: goals[0] appears twice on the same screen**
- **What:** FeaturedGoal hero renders goals[0] at 430px tall. The goals list below it renders goals[0] again as a GoalRow. Two interaction targets lead to the same detail sheet for the same goal. The user's stated intention is each goal separately displayed — the hero-plus-list split violates this directly.
- **Why it matters:** A user with 4 goals sees only the hero and the top edge of the aggregate card on first render. Goals 2-4 are below the fold. The "featured" sorting algorithm means the hero shifts whenever the status order changes — destabilizing the user's mental map of the screen between visits.
- **Fix:** Replace FeaturedGoal + GoalRow with a uniform vertical stack of GoalCard components, one per goal. Each card is tall enough to show all key information (not a compressed row). The TOTAL SAVED aggregate belongs as a sticky page header, not a scrollable card wedged between the hero and the list. The `statusFor` sort order (caution first, then lowest funded) should remain.
- **Suggested command:** `/impeccable craft goals screen rebuild`

**[P0] Missing: projected completion date at current savings rate**
- **What:** The single most important piece of information for a savings goal — "at your current rate, you'll finish in March 2028" — is never calculated or displayed. The `monthDistance()` and `suggestedMonthly()` functions exist but the inverse calculation (given monthly → projected months → projected date) is absent. The detail sheet shows Saved, Remaining, Monthly, and Needed but never the answer to "will I make it?"
- **Why it matters:** Without projected completion date, the user cannot assess the severity of a "Behind plan" status. They must mentally compute: remaining ÷ monthly contribution = months remaining, add to today's date. This is the entire purpose of the screen and it's being delegated to the user's arithmetic.
- **Fix:** Add `projectedFinish(goal: Goal): Date | null` — returns `today + ceil(remaining / monthlyContribution)` months. Surface this as a key stat: "At $400/mo — done Jan 2028 (7 months late)" in each GoalCard. Show both projected date and target date when they differ, with a colored delta ("7 months late" in caution amber, "4 months early" in teal).
- **Suggested command:** `/impeccable craft goals screen rebuild`

**[P1] Status labels are uninformative and one is actively misleading**
- **What:** `"Active"` fires when the goal has no deadline. It reads as healthy but actually means "no plan." `"$X/mo needed"` is a recommendation dressed as a status badge. The behind/ahead gap is not quantified — $5/mo short fires the same amber as $800/mo short.
- **Why it matters:** A busy professional glancing at the screen sees "Behind plan" in amber and has no idea whether to act immediately or whether it's trivial.
- **Fix:** Replace `"Active"` with `"No deadline"`. Remove `"$X/mo needed"` from the badge and surface it as a card-level prompt instead. Add the delta to the caution state: `"Behind — $180/mo"` or `"Ahead — 3 months early"`.
- **Suggested command:** `/impeccable craft goals screen rebuild`

**[P1] Date field is broken on mobile**
- **What:** The target date field is a plain `TextInput` with `keyboardType="default"` (the full letter keyboard) and `placeholder="2026-12-31"`. `parseDate()` returns `null` for any natural-language date format ("Dec 2027", "December 2026", "12/2027") with no error feedback at the field level — the error only surfaces on submit.
- **Why it matters:** This is the single field most likely to produce errors for non-technical users on iOS, and it fires silently, producing a goal with no deadline that shows "No date" instead of the intended target.
- **Fix:** Replace with a month/year picker. On iOS, a `@react-native-community/datetimepicker` in `"date"` mode or a two-column scroll picker (month / year) eliminates the problem entirely. At minimum, restrict keyboard to numeric, enforce MM/YYYY format with a mask, and validate inline.
- **Suggested command:** `/impeccable harden GoalsScreen`

**[P2] No deletion or undo for contributions or goals**
- **What:** A contribution logged with the wrong amount cannot be corrected. "Mark complete" sets saved = target with no confirmation and is not undoable. Goals can be edited but not deleted from the detail sheet.
- **Why it matters:** Users will mis-log contributions. $1,000 instead of $100 moves a goal to 40% funded when it should be at 4%. There is no recovery path.
- **Fix:** Add swipe-to-delete on contribution rows (with a confirmation). Add a "Delete goal" destructive option in the detail sheet (with confirmation). "Mark complete" should show a confirmation dialog.
- **Suggested command:** `/impeccable harden GoalsScreen`

---

## Persona Red Flags

**Busy professional, commute check (primary use case):**
- Opens screen: sees 430px hero for one goal. Must scroll past it to see others. On a 4-minute commute, never reaches goals 3-4.
- Needs to know: "will I hit my vacation fund by June?" The answer requires: remaining ÷ monthly, add to today. The app never computes this. She's doing the math herself on a moving train.
- "Behind plan" in amber fires — she can't tell if she needs to act today or if it's marginal.

**Returning user, monthly check-in (secondary use case):**
- Returns to find a different goal in the hero position — the sort order changed because one goal's status changed. Her mental map of "vacation fund is at top" is broken.
- Opens detail sheet to check progress: sees Saved / Remaining / Monthly / Needed. Has to remember what "Needed" means. Still no projected date. Closes the sheet having learned nothing new.

---

## Minor Observations

- `heroStat` uses hardcoded `rgba(8,6,20,0.32)` for background and `rgba(235,239,242,0.16)` for border — these belong in the wallpaper palette or as named constants, not inline.
- `DetailStat` uses hardcoded `rgba(142,142,147,0.9)` for label color instead of `theme.textTer`.
- `GoalRow` goalIcon uses `${tint}26` for background (hex opacity suffix) — this pattern is used elsewhere in the app but is less readable than `tint` + alpha.
- The "Activity" HeroStat shows contribution count. A count of 3 vs 12 conveys nothing without context. Replace with "Last: 15 days ago" or drop it for the projected date stat.
- The `GoalDetailSheet` snapPoint is `['74%']` — with the full contribution log, this may not be enough to see both the stat grid and the activity list without scrolling. Consider `['80%', '95%']` with two snap points.
