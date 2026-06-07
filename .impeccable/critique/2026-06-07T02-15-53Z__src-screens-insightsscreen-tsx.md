---
target: insights screen including interior chart pages
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-06-07T02-15-53Z
slug: src-screens-insightsscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No "historical period" indicator when browsing past dates |
| 2 | Match System / Real World | 3 | "Spending trends" label ambiguous; "Most improved" semantically loose |
| 3 | User Control and Freedom | 2 | Bottom sheet is a partial dead-end; no breadcrumb trail from drill-in |
| 4 | Consistency and Standards | 3 | InsightDetailScreen hardcodes `#080A0D`/`#F2F4F5` instead of theme.accent.ink |
| 5 | Error Prevention | 2 | Fixed snap points on the sheet may clip on small devices; empty states offer no guidance |
| 6 | Recognition Rather Than Recall | 3 | Long-press to Activity on "Where it went" is invisible |
| 7 | Flexibility and Efficiency | 2 | 3 taps to category history; chart and grain controls visually tied |
| 8 | Aesthetic and Minimalist Design | 3 | All BentoTiles share identical visual weight; hero doesn't dominate |
| 9 | Error Recovery | 2 | Empty states give no recovery path |
| 10 | Help and Documentation | 2 | 50/30/20 unexplained on first contact; trend stat lacks context |
| **Total** | | **25/40** | **Fair — strong foundation, specific fixable problems** |

## Anti-Patterns Verdict

Not AI-generated. The parallax wallpaper + frosted bento grid is distinctive. Avoids all hard bans.

Second-order risk: hero chart line uses rgba(147,197,253,0.92) — a semantic-free data blue that reads as needs-blue by accident, not intent.

## Priority Issues

- [P1] Hero chart line uses semantic-free blue — fix: use theme.text at 80% opacity
- [P1] InsightDetailScreen.tsx:703 hardcodes #080A0D/#F2F4F5 instead of theme.accent.ink
- [P2] Insight bottom sheet dead-end — no "View full chart" path; richer InsightDetailScreen unreachable from sheet
- [P2] All BentoTiles share identical visual weight — hero doesn't dominate
- [P3] Long-press to Activity on Where-it-went rows is invisible — no visual affordance
