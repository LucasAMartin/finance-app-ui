---
target: history screen
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-05-20T18-45-54Z
slug: src-screens-activityscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Filter badge and calendar animation good; no persistent sorted-by-amount reminder |
| 2 | Match System / Real World | 3 | Natural language throughout; "Custom range" slightly technical |
| 3 | User Control and Freedom | 3 | Pills/reset/search all dismissible; no explicit close on filter sheet |
| 4 | Consistency and Standards | 2 | Rounded date cells vs flat category rows; pill color neutral vs group-colored sheet; Clear vs Reset styled inconsistently |
| 5 | Error Prevention | 3 | Toggleable selections, nothing destructive |
| 6 | Recognition Rather Than Recall | 2 | Anonymous pills require recall; sort active state barely perceptible |
| 7 | Flexibility and Efficiency | 3 | Multi-select, calendar range, search — good |
| 8 | Aesthetic and Minimalist Design | 2 | DayGroup header weight imbalance, inline "No savings" placeholder, subdued amounts, invisible pills |
| 9 | Error Recovery | 3 | Clear all, remove individual filters, clear search |
| 10 | Help and Documentation | 1 | No contextual help; non-obvious interactions undiscoverable |
| **Total** | | **25/40** | **Acceptable** |

## Priority Issues

**[P1] Sort controls — active state barely visible, conditional chevron causes layout shift**
Active/inactive differentiation is a 30-point opacity bump on 10px uppercase text. Inactive buttons have no affordance at all. The conditional chevron makes the active button physically wider than the inactive.
Fix: Always render both chevrons; opacity-differentiate (active solid, inactive 30%). Use theme.text for active label.

**[P1] DayGroup header — date label subordinate to daily total**
dayLabel: 11px/600/uppercase/textSec. dayTotal: 16px/700/text. Total carries 4–5x visual weight of the date. In a date-navigated list, the date is the landmark — it should not lose to the total.
Fix: Bring date to theme.text 13px, or tone total down to textSec 14px/600.

**[P2] Filter pills — anonymous, no visual connection to origin**
Pills use chipBg (rgba 0.04 in light) and text-only label. In the filter sheet, same categories were shown with group-colored icon circles. The connection breaks. Pills are also nearly invisible against the page background.
Fix: Add category icon in group color, apply groupColor + '1A' background. Date pill gets accent fill tint.

**[P2] "Clear" in filter header nearly invisible**
12px/400/textTer (32% opacity) next to 17px/700 title. Clear-all is the primary action in the header when filters are active.
Fix: textSec minimum. Show count inline (Clear (2)). Consider accent.dot color per design system action link convention.

**[P3] "No savings transactions yet" — italic placeholder in navigation UI**
Savings group divider renders even with no categories. Italic 12px message below it looks like a broken state.
Fix: Hide empty groups from filter sheet entirely, or render as disabled row, not an italic placeholder.
