---
target: home page
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-05-26T01-24-37Z
slug: src-screens-homescreen-tsx
---
# Critique: Home screen (`src/screens/HomeScreen.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Status + bar + semantic colors all present |
| 2 | Match System / Real World | 4 | iOS pickers, currency, plain-English labels |
| 3 | User Control & Freedom | 3 | Month picker + drawer good; bell button no-op |
| 4 | Consistency & Standards | 2 | Typography tokens bypassed inline (heroStatusLabel/Sub/Amount/qaLabel) |
| 5 | Error Prevention | 3 | Read-mostly screen; little risk surface |
| 6 | Recognition Rather Than Recall | 4 | Icons + labels throughout |
| 7 | Flexibility & Efficiency | 3 | Quick actions add a path but duplicate tab bar |
| 8 | Aesthetic & Minimalist | 2 | Wallpaper + scrim + 3 blur cards + 4 quick-action tiles compete |
| 9 | Error Recovery | 3 | N/A for this surface |
| 10 | Help & Documentation | 3 | Appropriate for native mobile home |
| **Total** | | **30/40** | Moderate — solid bones, fighting itself in spots |

## Anti-Patterns Verdict

Partially AI-flavored. The blur-cards-over-vivid-wallpaper pattern is saturated in design feeds. Specific bans hit: glassmorphism prominent; hero-metric template present; three identical card frames; `#fff` used directly (`MEDIA.text`).

Detector returned `[]`; not meaningful (web-only patterns).

## What's Working

- Section internal variation: Spending/Upcoming/Activity each carry distinct content layouts.
- BudgetBar color encoding (teal → clay → amber → ember).
- Loading-state thoughtfulness: three custom skeletons + `onMedia` shimmer variant.

## Priority Issues

### [P1] Three near-identical section cards
Spending, Upcoming, Activity share the same blur container, radius, header. The data hierarchy doesn't reach the frame. Fix: vary container weight; e.g., Spending keeps the card, Upcoming becomes flat inline, Activity uses a date-gutter treatment.

### [P1] Quick-action row duplicates the tab bar
Insights/Budget/Activity all reachable from tabs; "More" duplicates the menu icon. Four equal circles compete with the hero. Fix: drop entirely, or keep one action unique to this surface.

### [P2] Tonal mismatch with brand
Wallpaper reads "consumer feed app"; PRODUCT.md asks for premium/restraint. Short-term: deepen scrim around hero. Long-term: make wallpaper a curated user preference.

### [P2] `#fff` and untinted neutrals
DESIGN.md mandates tinted neutrals; `MEDIA.text` is pure `#FFFFFF`, scrim is pure black, borders are pure white-alpha. Fix: shift toward violet-tinted values.

### [P3] Typography tokens bypassed
`heroStatusLabel/Sub/Amount`, `qaLabel` hardcode fontSize/weight inline. Add `TYPE.onMediaStatus/Sub/Amount` tokens; reference via TYPE.

## Persona Red Flags

**Maya (Busy Professional)**: bright wallpaper band overlaps hero text — beat of visual disambiguation before reading. Quick-action row adds a 4-decision pause before any data section. Risk: stops at hero, never scrolls.

**Alex (Power User)**: drill-down requires expanding group then tapping category. No shortcut to a specific category from home.

**Jordan (First-Timer)**: wallpaper sets consumer-feed expectation. "More" tile uses ☰ which is also the header menu icon — same glyph, two affordances.

## Minor Observations

- Bell button has no `onPress`.
- `TxRow` hardcodes `dark = true` for icon color.
- SwiftUI Picker chevron color not controllable via modifiers.
- `MEDIA.textTer` and `MEDIA.trackBg` defined but unused / bypassed.
