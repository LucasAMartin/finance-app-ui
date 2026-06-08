---
target: goal screen and all interior screens
total_score: 33
p0_count: 0
p1_count: 1
timestamp: 2026-06-08T02-15-26Z
slug: src-screens-goalsscreen-tsx
---
# Critique: GoalsScreen (all sheets)

## Score: 33/40

H4 (Consistency) is the only real gap. Three token-level inconsistencies: status badge type mismatch (labelSmPlain vs captionEm), dot size off-by-1px, ContributionSheet amount uses displayXl (48px) — wrong token for a 70% sheet (BillSheet uses 32px).

## Priority Issues
- [P1] GoalCard line 576: TYPE.labelSmPlain → TYPE.captionEm. Same role as picker sheet line 1505 which already uses captionEm. 9px vs 12px for same status badge.
- [P2] sheetStatusDot: 7×7/r4 while cardBadgeDot/summaryStatusDot are 6×6/r3. Change to 6×6/r3.
- [P2] ContributionSheet amount: TYPE.displayXl (48px) is for full-screen insight detail only. Change to inline fontSize:40,fontWeight:'600',letterSpacing:-1.4.
- [P3] Picker icon circle bg: tint+24 vs card tint+28. Change picker to tint+28.
- [P3] Header Add button fallback bg hardcoded rgba(8,6,20,0.35). Use pWallpaper palette values.

## What's Working
- Sheet structure exact: FIELD_CARD/FIELD_ROW, SheetPrimaryButton, ScreenExitButton, borderTopLeftRadius:32, handleIndicatorStyle
- Header pattern matches other wallpaper screens
- Color discipline: savings teal only, OVER_DOT for archive, no rogue hex in theme layer
