---
target: Goals screen and goal detail sheet
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-12T01-48-45Z
slug: src-screens-goalsscreen-tsx
---
# Goals Screen and Goal Sheet Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Status is visible, but repeated in card badge, footer, and sheet timeline. |
| 2 | Match System / Real World | 3 | Goal language is understandable, but "Attention 0" feels internal. |
| 3 | User Control and Freedom | 3 | Close, menu, archive, pause, complete, and restore are available. |
| 4 | Consistency and Standards | 3 | Matches app glass/material direction, but sheet stat grid diverges from cleaner Home/Budget patterns. |
| 5 | Error Prevention | 3 | Destructive archive is confirmed. Completion is confirmed. |
| 6 | Recognition Rather Than Recall | 3 | Goal cards expose saved, target, remaining, and percent without digging. |
| 7 | Flexibility and Efficiency | 3 | Add contribution is clear, but the sheet does not prioritize it as strongly as it could. |
| 8 | Aesthetic and Minimalist Design | 2 | Main issue: redundant target/status copy and boxed saved/to-go stats add cognitive weight. |
| 9 | Error Recovery | 3 | Archived goals can be restored. |
| 10 | Help and Documentation | 2 | Empty states help, but active goal status semantics are not explained. |
| **Total** | | **28/40** | **Good foundation, needs distillation.** |

## Anti-Patterns Verdict

This does not read like generic AI UI. The glass treatment is structural and aligned with the app, not decorative. The detector found no issues in `src/screens/GoalsScreen.tsx`.

The risk is not AI slop. The risk is finance-report clutter: several small pieces of status text all explaining similar things. That weakens the premium, quick-glance feel.

Browser overlay was skipped because this is a React Native native screen, not a browser-viewable page.

## Overall Impression

The Goals screen has the right ingredients: native glass cards, restrained color, progress bars, savings-oriented semantic color, and familiar sheet actions. It becomes harder to read because progress, target timing, health status, saved amount, remaining amount, and monthly plan are all fighting for the same visual tier.

The biggest opportunity is to make the card answer one question: "How is this goal doing?" Then make the sheet answer: "What is left, what pace am I on, and what can I do next?"

## What's Working

- The native goal cards fit the app well. They mirror the newer liquid glass direction without changing the entire interaction model.
- The progress bar plus percent is a strong quick-read pattern and matches Budget's data-forward language.
- Contribution history already uses the app's transaction-row vocabulary with `MerchantMark`, which is the right move. It feels connected to Activity rather than like a separate subsystem.

## Priority Issues

### [P1] The goal card repeats target status too many times

Why it matters: The badge already says "Ahead of target", "On target", or "Behind target". The footer then repeats "Ahead of target for Sep 2026". The sheet timeline also repeats projected timing. This makes the card feel like it is explaining itself instead of presenting a clean summary.

Fix: Remove the status phrase from `goalFooterLine`. For goals with deadlines, use a neutral deadline footer such as `Target Sep 2026`. For goals with monthly contribution and no deadline, use `$250/mo planned`. Keep health status only in the pill. On the sheet, let the timeline carry projection details.

Suggested command: `impeccable distill goals screen`

### [P1] The sheet's "Saved / To go" grid feels too boxy and low-context

Why it matters: Two equal boxes imply equal importance, but "Saved" is the proof of progress and "To go" is the next decision. The border grid also feels more like a settings table than the rest of your glass/data surfaces.

Fix: Replace the boxed 2-column grid with a progress module:

- Top line: large `Saved $X` with smaller `of $Y` inline, like the goal card and Home hero hierarchy.
- Progress bar directly below, using the goal tint.
- Bottom row: `Left $Y` and `Planned $Z/mo` as quiet labels, separated by spacing rather than a boxed border.
- If deadline exists, add one compact line: `Target Sep 2026` or `Est. Jul 2026`.

This would feel closer to Home's "one primary amount plus supporting context" and Budget's progress-bar language.

Suggested command: `impeccable layout goal sheet`

### [P2] The sheet hero and timeline compete with each other

Why it matters: The sheet currently has icon, title, maybe status, then timeline, then saved/to-go. That is three summary areas before the primary action. It asks the user to parse layout instead of acting.

Fix: Make the sheet hero tighter:

- Header controls stay as-is.
- Icon + title remain, but do not reserve vertical space for hidden "Ahead of target" status.
- Put status into the progress module, not a separate centered row.
- Move `Add contribution` closer to the progress story so action follows understanding.

Suggested command: `impeccable distill goal sheet`

### [P2] The summary card has one awkward metric: "Attention 0"

Why it matters: "Attention" is vague and a value of `0` reads like a system counter, not human finance language. This is especially noticeable because the rest of the app uses plain labels like Saved, Monthly plan, Activity, Upcoming.

Fix: Either remove the third stat when there are no behind goals, or rename it contextually:

- If all good: show `On pace` as a status pill only, no third stat.
- If behind: show `Behind 2` or `Needs review 2`.
- Better: use the third slot for `Remaining` across all active goals if that value is available.

Suggested command: `impeccable clarify goals summary`

### [P3] The goal card amount row could become more glanceable

Why it matters: `$1,200 of $4,000` and `$2,800 to go` are both useful, but they sit at similar weight. The eye has to choose.

Fix: Let saved progress lead: `$1,200 saved` on the left, `$2,800 left` on the right. Put `of $4,000` in the footer or beneath the progress bar. This matches the app's tendency to make the actionable number plain and the denominator quieter.

Suggested command: `impeccable clarify goal cards`

## Persona Red Flags

Busy professional: They open Goals for a 5-second check. The duplicate "Ahead of target" language slows the scan because the card provides health in two places.

First-time user: "Attention 0" is ambiguous. They may not know if 0 means good, empty, broken, or no tracked goals.

Power user: The sheet shows useful information, but not in decision order. They want to see remaining amount, current pace, then contribute. The current stat grid interrupts that flow.

## Minor Observations

- Hiding "Ahead of target" in the sheet status row leaves an empty-ish row. Better to remove the row entirely or move all status into one consistent module.
- The contribution activity section is solid. Keep it flat, row-based, and transaction-like.
- Avoid adding more chips. Goals already have a badge, percent, footer, timeline, stats, and action. The fix is subtraction.

## Questions to Consider

- Should the card show timing at all, or should timing live only in the sheet?
- Is "monthly plan" actually useful on the Goals summary, or is total remaining more useful?
- Should the sheet lead with saved progress or remaining amount? My preference: saved progress first, remaining amount second.
