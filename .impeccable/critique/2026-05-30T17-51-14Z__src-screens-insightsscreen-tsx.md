---
target: insights screen
total_score: 25
p0_count: 0
p1_count: 1
timestamp: 2026-05-30T17-51-14Z
slug: src-screens-insightsscreen-tsx
---
**Design Health Score**

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Chart tap-to-arm then tap-again-for-details is still unannounced. |
| 2 | Match System / Real World | 3 | Period / Planned / Categories read clearly; "at this pace" can mislead on past ranges. |
| 3 | User Control and Freedom | 3 | Sheet and drill-downs have escapes; chart selection has no reset. |
| 4 | Consistency and Standards | 3 | Category colors now match Home (vibrant light / tuned dark); custom chart gestures remain bespoke. |
| 5 | Error Prevention | 3 | Empty states exist per chart and breakdown. |
| 6 | Recognition Rather Than Recall | 2 | Detail sheet now carries real value, but the gesture to reach it is hidden. |
| 7 | Flexibility and Efficiency | 3 | Charts expose adjustable actions; drill-downs into Activity work well. |
| 8 | Aesthetic and Minimalist Design | 3 | Redundant "Insights" title removed, donut center transparent: lighter, less crowded. |
| 9 | Error Recovery | 2 | Little guidance when projections run on partial data. |
| 10 | Help and Documentation | 1 | No contextual help for chart gestures or analytic terms. |
| **Total** | | **25/40** | **Acceptable, improving; discoverability is the ceiling.** |

**Anti-Patterns Verdict**

LLM assessment: Does not read as AI-generated. No gradient text, no decorative glass beyond the app's structural wallpaper cards, no identical KPI grid, no gamification. Color is now consistent with the rest of the app rather than a separate muted palette. The remaining risk is the same as before: an analyst screen that knows a lot and explains its controls little.

Deterministic scan: `npx impeccable detect --json src/screens/InsightsScreen.tsx src/components/charts/InsightsCharts.tsx` returned `[]`. No detector findings.

Visual overlays: Skipped. React Native iOS target, not a browser-viewable page.

**Overall Impression**

The screen is in good shape and just got better on three fronts the user named: the detail sheet now answers "so what" (average, trend, budget status), categories match Home, and removing the title plus opening the donut center reduces visual noise. The single biggest remaining gap is teaching the chart interaction model: the data is rich but the way in is a secret.

**What's Working**

- The native bottom sheet now provides real value: average per transaction, trend vs the previous period, and budget remaining/over, not just a share percentage.
- Category color parity with Home (vibrant group colors in light, tuned variants in dark) makes the app feel like one system.
- The transparent donut center lets the frosted card read through, lightening the chart.
- Removing the redundant "Insights" title lets the total spend anchor the card.

**Priority Issues**

[P1] The chart interaction model is still invisible.
Why it matters: Tap to arm, tap again for details, hold to scrub is powerful but untaught. The selected strip has a Details button (good), but the chart itself gives no hint.
Fix: A one-line affordance near the chart ("Tap a bar for details, drag to scrub") shown until first use.
Suggested command: impeccable onboard insights screen

[P2] Chart-mode labels are clear but unexplained.
Why it matters: Period / Planned / Categories are better than Rhythm/Pace/Mix, but a first-timer still guesses what each answers.
Fix: A short caption under the segmented control that swaps with the mode ("Spend by period" / "Actual vs plan" / "50/30/20 split").
Suggested command: impeccable clarify insights screen

[P2] Projections can mislead on completed or partial ranges.
Why it matters: "At this pace" copy implies an in-progress range even when viewing a past, complete week.
Fix: Suppress pace projection language when the range has fully elapsed; show actuals instead.
Suggested command: impeccable harden insights screen

[P2] Accessibility is good on charts, thin on rows.
Why it matters: Charts expose adjustable actions, but the selected strip and breakdown rows lean on color and position.
Fix: Explicit accessibilityValue on the strip and trend direction announced for rows.
Suggested command: impeccable audit insights screen

**Persona Red Flags**

Busy Professional (project persona): Now gets a useful answer on tap (average, trend, budget). Still has to discover the gesture; a glanceable hint would close the loop.

Casey (distracted mobile): Two-step chart gesture remains a fragile mental model mid-scroll; the richer sheet rewards the effort once found.

**Minor Observations**

- The "Now" panel now leads the chart card without a title; confirm it reads as a headline, not a tappable control, when it has no onPress.
- The budget dash line in the bar chart is still unlabeled.
