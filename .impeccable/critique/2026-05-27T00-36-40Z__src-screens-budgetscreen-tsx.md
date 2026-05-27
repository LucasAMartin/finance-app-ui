---
target: budget screen
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-05-27T00-36-40Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Hero shows budgeted amount and flips red when over budget. Undo toast is timely. `allocatedPct` is computed and never rendered — a natural signal removed and not replaced. |
| 2 | Match System / Real World | 3 | Finance vocabulary is correct. "Template" label is clearer. New users don't know what 50/30/20 means before opening the picker. |
| 3 | User Control and Freedom | 3 | Swipe-to-delete with undo toast is production-quality. Income edits and individual amount changes have no undo path. |
| 4 | Consistency and Standards | 3 | Swipe-to-delete is now iOS-standard. Amount field underline-only affordance is still non-standard at rest. |
| 5 | Error Prevention | 2 | Budget amounts can be $0 silently. No income floor. Group can be fully emptied. Template overwrites manual edits without warning. |
| 6 | Recognition Rather Than Recall | 2 | Swipe-to-delete is discoverable (iOS convention). Income field and amount fields show no resting-state editability signal. |
| 7 | Flexibility and Efficiency | 3 | Template is one tap. Cadence picker is thoughtful. No bulk-scale when income changes. |
| 8 | Aesthetic and Minimalist Design | 3 | Wallpaper + frosted glass is consistent, not decorative. Group cards vary by color and content. Dead code (allocatedPct) signals incomplete intent. |
| 9 | Error Recovery | 3 | Undo covers destructive actions. AmountField restores on bad input. 7s window short when toast appears far from editing context. |
| 10 | Help and Documentation | 1 | No empty state for emptied group. No tooltip on 50/30/20. No onboarding. |
| **Total** | | **26/40** | **Acceptable** |

## Anti-Patterns Verdict

Not AI-generated. The wallpaper-plus-frosted-glass pattern is coherent across HomeScreen and BudgetScreen. No gradient text, no side-stripe borders, no hero-metric template abuse.

## Priority Issues

**[P0] Sticky bar text is always white — invisible in light mode.**
BudgetScreen.tsx:527 passes `pWallpaper.text` and `pWallpaper.trackBg` to `allocationContent`. `pWallpaper` is `makeP(true)` — always white text. In light mode the BlurView renders a frosted white surface with white text on top. Fix: use `p.text` and `p.trackBg` instead.

**[P1] Hero amount unreadable on light wallpapers.**
`makeScrim(false)` returns 30% opacity at top. White text plus a 40% shadow at radius 6 cannot produce readable contrast on bright wallpapers. Fix: increase light-mode scrim to 58% top / 44% mid in `wallpaperPalette.ts`.

**[P1] Secondary hero text (`pWallpaper.textSec`) doubly fails on light wallpapers.**
The "of $x/mo" label uses `rgba(245,238,255,0.78)` — 78%-opaque near-white on a light wallpaper is near-invisible. Fix: use `pWallpaper.text` for this label, distinguishing primary from secondary through size alone.

**[P2] `allocatedPct` is dead code.**
Computed at line 389, never rendered. The percentage allocated is the most useful number on screen after the raw amount. Remove it or display it.

**[P2] Income and budget amounts show no resting-state editability.**
Nothing signals these numbers are tappable. First-time users see a list of numbers that look fixed. Fix: add visible resting-state underlines using `theme.accent.dot` at 35% opacity, or add a small pencil icon.
