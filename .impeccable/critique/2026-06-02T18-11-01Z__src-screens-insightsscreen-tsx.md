---
target: insights screen + chart detail screen + insight bottom sheets
total_score: 25
p0_count: 0
p1_count: 3
timestamp: 2026-06-02T18-11-01Z
slug: src-screens-insightsscreen-tsx
---
# Critique: Insights screen + chart detail screen + insight bottom sheets

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Chart-type pill shows an active state but the chart never changes; no loading state for paginated list |
| 2 | Match System / Real World | 2 | "6M" chip silently shows a full year; "repeat" icon used for "Reset view" |
| 3 | User Control and Freedom | 3 | Back, sheet-close, scrub-release all present and clean |
| 4 | Consistency and Standards | 2 | Two different period/date controls across the two screens; two greens; off-token hero sizes; detail screen forced dark in light mode |
| 5 | Error Prevention | 3 | Read-only surface, low stakes |
| 6 | Recognition Rather Than Recall | 2 | Date navigation buried inside a "..." overflow on the detail screen; chart-type icons ambiguous |
| 7 | Flexibility and Efficiency | 3 | Scrub, tabs, search, sort, pagination — genuinely strong |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, restrained, on-brand frosted material; dead controls add noise |
| 9 | Error Recovery | 3 | "No results" + detail empty state handled; Insights empty state is bare |
| 10 | Help and Documentation | 2 | None; mostly self-evident, but "6M" actively misleads |
| **Total** | | **25/40** | **Moderate — solid core, undermined by consistency + a few broken affordances** |

## Anti-Patterns Verdict

Does this look AI-generated? No. The insight engine is real product thinking: scored candidate pool, recurring-vs-variable separation, timing-aware projection. No gradient text, no hero-metric cliche, no identical card grid, no accent leaking into charts. Frosted bento + native SwiftUI sheet reads as a deliberate premium material identity. Failures are broken/inconsistent affordances (product-register failure mode), not slop.

## Overall Impression

The data layer is the strongest thing here and it's genuinely good. The presentation layer leaks trust in three places that matter disproportionately for a finance app: a control that pretends to work, a timeframe chip that shows the wrong range, and the same "pick a period" task solved two different ways on two screens reached in one tap. Biggest opportunity: make the two screens feel like one system, and delete every control that doesn't do what it claims.

## What's Working

- The insight engine: scored, threshold-gated snapshots, recurring-aware deltas, fixed/variable projection split.
- Scrub interactions on hero/trends/saved tiles with live headline + date-following label.
- One coherent detail target: both "What changed" and "Where it went" rows open the identical InsightBottomSheet with a matching viz vocabulary.

## Priority Issues

[P1] Chart-type pill in the detail header is a dead control. chartTypeIdx is set and highlighted but never read; SpendChart always draws a line. Trust-corrosive on a finance screen; the "repeat" icon (meaning recurring everywhere else) reused for "Reset view" compounds it. Fix: wire up bar/reset or remove the pill.

[P1] "6M" silently shows a full year. TF_TO_PERIOD maps 6M to Year (admitted placeholder). A chip whose label differs from its range is a data-integrity break against the brand promise. Fix: hide 6M until real, or implement it.

[P1] Same "pick a period" task is two different controls across one tap. Insights: timeframe segmented + labeled chevron month menu. Detail: timeframe segmented + unlabeled "..." overflow hiding both sort and date. Recognition collapses to recall. Fix: one date-nav pattern on both; give sort its own visible affordance.

[P2] Signature display figure off-spec. DESIGN.md reserves 48px displayXl for the Insights total; Insights renders 32px (TYPE.display) and the detail hero hard-codes inline fontSize 44 (violates Token Rule). Fix: one hero token, applied on both, reconcile DESIGN.md.

[P2] Detail screen forced-dark in light mode; Insights empty state bare. InsightDetailScreen hard-codes dark scrim + makeP(true) regardless of theme; tapping a chart in light mode jumps to a dark screen. No-spend Insights hides both sections leaving a $0 hero and two empty tiles, while the built EmptyState component is dead code. Fix: make detail theme-aware (or document media-always-dark), wire EmptyState into the no-spend case.

## Persona Red Flags

Sam (busy professional, core persona): taps bar-chart icon, nothing happens, assumes buggy; picks 6M and reads a year as half a year; hero always shows cents, slowing the glance.

Jordan (first-timer): fresh month shows $0 hero + two empty tiles, nothing teaches the screen; on detail, can't find date change (behind "...").

Alex (power user): annoyed the promised line/bar toggle is inert; date stepping buried in overflow mixed with sort.

## Minor Observations

- Two greens: DeltaBadge hard-codes #3A8750/#7ACD8A while snapshots use the savings group color for the same semantic.
- Dead code: primaryComparison, groupMix, topMoved, CHART_TYPES, SelectedInsightStrip, EmptyState, ReadoutRow, and InsightBarChart/InsightPaceChart imports are defined/computed but never rendered.
- Bottom-sheet detents are fixed fractions (0.46/0.54); verify the 3-metric + compare-viz case doesn't clip on small devices.
