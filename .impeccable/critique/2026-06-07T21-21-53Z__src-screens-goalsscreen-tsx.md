---
target: goal screen and goal popup sheet
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-07T21-21-53Z
slug: src-screens-goalsscreen-tsx
---
# Critique: Goals screen + goal sheets

## Score: 28/40 — solid surface, consistency is the soft spot

Heuristic lows: Consistency (2), Error Prevention (2), Recognition (2), Error Recovery (2).
No AI slop. Problem is drift from the app's own sheet conventions.

## Priority Issues
- [P1] Dates typed by hand (TextInput, placeholder 2026-12-31) instead of native @expo/ui DatePicker. GoalsScreen.tsx:1255,:1545. Siblings: BillSheet:413, IncomeFlow:454, TxSheet:730. Fix: compact DatePicker in the fieldRow.
- [P1] Amounts use decimal-pad TextInput instead of tap-to-PopupNumericKeypad pattern (BillSheet:396, TxSheet:693, IncomeFlow:366). Different keyboard for the same task.
- [P2] GoalDetailSheet uses gorhom BottomSheet + manual ref-dance (:849-873) while the other three sheets in-file and TxSheet/BillSheet use BottomSheetModal portaled via SheetPortalContainer. Convert to BottomSheetModal.
- [P2] Field/formCard and ProgressBar re-implemented; the fieldCard/fieldRow pattern is duplicated 4x (TxSheet:953, BillSheet:484, IncomeFlow:621) and ProgressBar 3x. Extract shared FieldCard/FieldRow + ProgressBar into shared.tsx.
- [P2] Hardcoded label color 'rgba(142,142,147,0.9)' in SummaryStat:785 and DetailStat:1112 — violates token rule; use p.textTer/theme.textTer.

## Minor
- Header Add button (:1673) is flat translucent circle beside the Liquid Glass ScreenExitButton — mismatched.
- Action-list icon semantics: pause=ellipsis, resume=plus, archive=trash (:1003,:1017).
- Goals sheets use flat theme.surface; BillSheet/TxSheet tint content rgba(255,255,255,0.40) in light mode.
- Five equal-weight sheetSecondary action rows in detail sheet — borderline cognitive load.
