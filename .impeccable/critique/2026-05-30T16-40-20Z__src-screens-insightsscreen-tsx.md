---
target: src/screens/InsightsScreen.tsx
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-05-30T16-40-20Z
slug: src-screens-insightsscreen-tsx
---
**Design Health Score**

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Selection updates, but the armed second-tap state and scrub mode are not explained. |
| 2 | Match System / Real World | 3 | Finance language is mostly plain, but Rhythm, Pace, and Mix need clearer translation. |
| 3 | User Control and Freedom | 3 | Sheet has escape paths and Activity drill-downs, but chart state has no clear reset. |
| 4 | Consistency and Standards | 2 | Uses platform sheet and segmented controls, but custom chart gestures and token drift create inconsistency. |
| 5 | Error Prevention | 2 | No dangerous actions, but empty or stale-data states can make the screen look broken. |
| 6 | Recognition Rather Than Recall | 2 | Users must discover double-tap details and remember what each chart mode means. |
| 7 | Flexibility and Efficiency | 2 | Drill-downs help, but there are no alternate accessible paths for chart inspection. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and premium, but the readout adds density before it adds hierarchy. |
| 9 | Error Recovery | 2 | Few error states exist, but there is also little guidance when data is missing. |
| 10 | Help and Documentation | 1 | No contextual help for new chart gestures or analytic terms. |
| **Total** | | **24/40** | **Acceptable, strong foundation with discoverability and density issues** |

**Anti-Patterns Verdict**

LLM assessment: This does not scream AI-generated. It avoids the biggest traps: no gradient text, no decorative glass beyond the app's wallpaper card system, no identical KPI grid, no gamification. The risk is more product-specific: it feels like an analyst screen that knows too much and explains too little. The labels are compact to the point of opacity.

Deterministic scan: `npx impeccable detect --json src/screens/InsightsScreen.tsx src/components/charts/InsightsCharts.tsx` returned `[]`. No detector findings.

Visual overlays: Skipped. The target is a React Native iOS screen rather than a directly viewable browser page, and I did not run a simulator visual pass for this critique.

**Overall Impression**

The Insights screen has good raw material: native sheet, scrub charts, restrained color, meaningful drill-downs. The biggest opportunity is editorial hierarchy. The screen should feel like it is telling the user one clear financial story, then letting them investigate, not presenting three charts plus a readout plus a breakdown as equal citizens.

**What's Working**

- The segmented chart switch is a smart replacement for horizontal chart swiping. It protects scrub gestures and aligns with iOS conventions.
- The native bottom sheet is the right escalation pattern for chart details. It feels more trustworthy than a custom modal for finance data.
- The chart visuals are restrained. They avoid noisy gridlines and mostly use the established group color system.
- Activity drill-downs from chart details, readout rows, categories, and merchants create a useful investigation path.

**Priority Issues**

[P1] The chart interaction model is invisible.
Why it matters: Tap once to highlight, tap again for details, hold and drag to scrub is powerful, but nothing teaches it. Users will tap once, see the selected strip change, and may never discover the sheet.
Fix: Add one compact instruction only when needed, such as "Tap to select. Tap again for details." Better: make the selected strip include a visible "Details" affordance so sheet access is not secret.
Suggested command: `impeccable clarify insights screen`

[P1] The screen lacks a single primary insight.
Why it matters: The screen now has total spend, chart mode, selected chart detail, top driver, projection, budget pressure, upcoming bill, what changed, and breakdown. Each is individually useful, but together they compete.
Fix: Promote one computed "Now" insight above the chart, then collapse secondary readouts into two to three rows. Put full breakdown behind the existing Category/Merchant switch lower on the page.
Suggested command: `impeccable distill insights screen`

[P2] The chart names are elegant but not self-explanatory.
Why it matters: Rhythm, Pace, and Mix sound polished, but busy users may not know whether they answer "when did I spend," "am I on budget," or "what kind of spending is this." This adds recall load.
Fix: Rename or add subtitles: "Rhythm: spend by period," "Pace: actual vs plan," "Mix: 50/30/20." Keep the segmented labels short if needed, but put the explanatory phrase near the chart.
Suggested command: `impeccable clarify insights screen`

[P2] Accessibility is visually polished but functionally thin.
Why it matters: The charts use `accessibilityRole="adjustable"`, but there are no explicit accessibility actions, values, or non-visual detail controls. VoiceOver users likely cannot inspect the charts meaningfully.
Fix: Add `accessibilityLabel`, `accessibilityValue`, and increment/decrement actions for chart points. Give selected strip and readout rows explicit labels. Make details reachable from a normal button.
Suggested command: `impeccable audit insights screen`

[P2] The design system is starting to drift.
Why it matters: The screen uses inline type sizes and hardcoded colors in several places, plus accent violet as a healthy category budget-bar fill. The app's rules say chart and budget data should use group or semantic colors, not the user accent.
Fix: Route typography through `TYPE`, replace hardcoded neutrals/greens with theme tokens or semantic constants, and use group colors for budget fills.
Suggested command: `impeccable polish insights screen`

[P2] Empty and stale-data states are underdesigned.
Why it matters: The app uses static mock data. If the current period has little or no data, the screen can render zeros, weak projections, and sparse readouts with no explanation. That looks broken, especially on May 30, 2026 if seed data sits earlier in May.
Fix: Add explicit empty states per chart and readout: "No spending in this range" plus a clear path to change period. For demo mode, consider anchoring default ranges to latest transaction date.
Suggested command: `impeccable harden insights screen`

**Cognitive Load**

Failed checklist items: 3 of 8, moderate load.

- Fails single focus: the chart card and Readout card both compete to be the main takeaway.
- Fails minimal choices in the readout zone: users process up to seven separate insight rows before the breakdown.
- Fails progressive disclosure: chart details and advanced readout logic are visible or hidden in ways users cannot predict.

**Persona Red Flags**

Alex, data-fluent power user: The chart interaction is fast once learned, but the first-run discovery cost is high. Alex will want direct inspection, comparison, and clear semantics, not a secret second tap.

Sam, accessibility-dependent user: The chart is mostly visual. `adjustable` without values or actions creates the promise of accessibility without the mechanics. Color and position carry too much meaning.

Casey, distracted mobile user: The 36px period arrows are below the 44pt comfort target, and the screen asks Casey to remember a two-step chart gesture while scrolling. The chart scrub lock is good, but the mental model is fragile.

Project persona, Busy Professional: The screen answers many good questions, but not in the order this user needs. They need "what should I pay attention to right now" first, then charts if they have another 30 seconds.

**Minor Observations**

- `Readout` is a vague section name. `Now` or `Signals` would be more direct.
- "At this pace" may be misleading when viewing past completed ranges.
- The budget dash line in the bar chart is useful but unlabeled.
- The close button in the sheet should have an accessibility label.
- The chart selected strip is useful, but it reads like a caption rather than an action gateway.

**Questions to Consider**

- What if Insights opened with one sentence: "Dining is the reason you are trending over plan," then the charts supported that claim?
- Should the chart card be the primary exploration tool, or should the readout be the primary summary?
- Is "premium" here better expressed as fewer, sharper answers rather than more analytics?
