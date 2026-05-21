---
target: home screen
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-05-20T19-58-40Z
slug: src-screens-homescreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Budget status and loading states excellent; no data freshness signal |
| 2 | Match System / Real World | 3 | "After budget" is non-standard; all other terms map cleanly |
| 3 | User Control and Freedom | 2 | Month navigation requires opening a modal; no period toggle visible; group panels have no tap affordance |
| 4 | Consistency and Standards | 3 | Icon circles: 36px full-color in rows vs 28px faint-tint in spend groups |
| 5 | Error Prevention | 2 | Simulated refresh always succeeds; no designed error paths |
| 6 | Recognition Rather Than Recall | 3 | Gradient bar colors carry meaning but are never labeled |
| 7 | Flexibility and Efficiency | 2 | No swipe-to-previous-month; no period toggle for week/month/year |
| 8 | Aesthetic and Minimalist Design | 3 | Clean hero; spending section information-dense; gradient bar decorative |
| 9 | Error Recovery | 1 | No error states designed for any section |
| 10 | Help and Documentation | 2 | No 50/30/20 onboarding; labels mostly self-explanatory aside from "After budget" |
| **Total** | | **24/40** | **Functional but needs design authority and UX depth** |

## Anti-Patterns Verdict

No AI slop tells. No hero-metric template, no gradient text, no glassmorphism. Deterministic scan: zero findings.

## Overall Impression

Solid structure but the primary amount (32px vs design system spec of 42px) drains authority from the one number that matters most. Spending section shows 9-12 sub-items where a home screen should show 3 group summaries.

## What's Working

1. Skeleton loading states mirror exact component structures with group-type differentiation.
2. OVER_DOT applied consistently at hero, group bar, sub-category, and bill rows.
3. Group-tinted header zones use color to encode structure without cards or shadows.

## Priority Issues

[P1] Hero amount at 32px vs design system 42px display spec. Fix: change size={32} to size={42}.

[P1] HomeSpendGroups shows 9-12 sub-rows on a glance screen. Fix: collapse to group summaries only; sub-rows behind tap or "See all."

[P1] HERO_BG hardcoded #3A2860, bypasses theme/accent system. In light mode creates jarring contrast island.

[P2] "After budget" label is ambiguous. Fix: rename to "Unallocated" or "Free cash."

[P2] Icon circle visual language inconsistent: 36px full-color in transaction/bill rows, 28px faint-tint in spend group sub-rows.

## Persona Red Flags

Busy professional: 6 data points to scroll before finding dining overage. No swipe-to-previous-month.
First-timer: "After budget" meaning unclear. Gradient bar colors unexplained. Double-percentage meta text takes a beat to parse.
