---
target: transaction history page
total_score: 27
p0_count: 1
p1_count: 2
timestamp: 2026-05-19T04-23-06Z
slug: src-screens-activityscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Active filter chips highlighted; no result count |
| 2 | Match System / Real World | 3/4 | Clear nav; flag swipe action has no label |
| 3 | User Control and Freedom | 3/4 | Can deselect chips; no clear-all |
| 4 | Consistency and Standards | 1/4 | Icon circles, amounts, card wrapping, header all diverge from HomeScreen |
| 5 | Error Prevention | 4/4 | No destructive actions |
| 6 | Recognition Rather Than Recall | 2/4 | Two "All" chips with different meanings; flag undiscoverable |
| 7 | Flexibility and Efficiency | 2/4 | Two rows require multiple taps to combine date + category filter |
| 8 | Aesthetic and Minimalist Design | 2/4 | Card wrapping adds weight; header breaks tab hierarchy |
| 9 | Error Recovery | 3/4 | Easy to clear; empty state clear |
| 10 | Help and Documentation | 3/4 | Swipe affordance undiscoverable |
| **Total** | | **27/40** | Functional but visually fragmented |

## Anti-Patterns Verdict

Partially AI-patterned. Two separate horizontal-scroll filter rows is a common AI tell. Automated scan returned 0 findings; all problems are cross-file consistency issues.

## Priority Issues

**[P0] Icon circles break visual continuity** — ActivityScreen uses catPastel+'2E' (18% opacity) with colored icon; HomeScreen uses catGroupColor (solid) with white icon. Same transactions look different across screens. Fix: use catGroupColor + white icon + 36px circle.

**[P1] Two "All" chips silently do different things** — date "All" and category "All" look identical, serve different filter dimensions. Category chips also have an active-state dot that date chips don't. Fix: collapse to one filter row or rename chips to disambiguate.

**[P1] Amount typography inverted from system standard** — HomeScreen: Money component, 13px, weight 500, theme.textSec. History: Text, 14px, weight 600, theme.text, with "−" prefix. Fix: use Money component with matching size/weight/color.

**[P2] Card wrapping per day group is a foreign pattern** — HomeScreen uses naked rows. History wraps each day in a borderRadius:24 card. Adds visual weight, clips swipe at rounded corners. Fix: remove card wrapper, use naked rows with marginBottom spacing.

**[P2] Header scale doesn't match tab screens** — 28px left-aligned title vs SpendingScreen's centered 17px. Fix: match SpendingScreen's header pattern.
