---
target: src/screens/BudgetScreen.tsx
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-05-27T03-57-50Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Amount edits update totals, but the edited field itself has weak active/saved feedback. |
| 2 | Match System / Real World | 3 | 50/30/20 grouping is clear; abbreviations like Mo/2w/Wk/Yr are terse for money planning. |
| 3 | User Control and Freedom | 3 | Swipe delete has undo; inline edit can blur/commit, but there is no explicit cancel/revert state. |
| 4 | Consistency and Standards | 3 | Budget screen mostly follows local tokens, but amount fields differ from the stronger income/edit patterns. |
| 5 | Error Prevention | 2 | Numeric parsing permits ambiguous states while typing and gives no invalid/empty-state feedback. |
| 6 | Recognition Rather Than Recall | 2 | Editable amounts are only signaled by a small underline, easy to miss and not self-explanatory. |
| 7 | Flexibility and Efficiency | 3 | Inline editing and templates are efficient; no bulk rebalance or percent-based tuning yet. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and calm, but the hero is underpowered and category cards become visually repetitive. |
| 9 | Error Recovery | 2 | Delete has recovery; invalid amount recovery is silent and not user-teaching. |
| 10 | Help and Documentation | 1 | No contextual explanation for templates, cadence, or what the hero should mean. |
| **Total** | | **24/40** | **Acceptable, solid foundation with important interaction polish needed.** |

## Anti-Patterns Verdict

This does not read as generic AI slop. It avoids the obvious finance reflexes, keeps the palette close to the Still Violet system, and uses real product patterns instead of decorative gimmicks.

The weak spot is not visual excess. It is under-articulation. The screen asks users to edit high-trust financial numbers, but the interaction feedback is so quiet that the experience feels less premium than the rest of the app.

Deterministic scan: `npx impeccable detect --json src/screens/BudgetScreen.tsx` returned `[]`.

Visual overlay: skipped because Expo web cannot start without `react-dom` and `react-native-web`; I did not install web dependencies for a critique-only pass.

## Overall Impression

The budget screen has a good bones problem: the data architecture, grouping, templates, undo, and sticky allocation summary are worthwhile. But the surface currently treats budget editing like changing a tiny table cell, while the product positioning says numbers are the interface. The category numbers need to feel more like precise financial controls, not tappable text with a line under it.

## What's Working

- The 50/30/20 group model is strong. Needs, Wants, and Savings create useful mental buckets, and group colors are doing real semantic work.
- Inline editing is the right direction. A budget screen should not send users through modals for every number.
- The sticky allocation bar is a good concept. It keeps the consequence of edits visible while the user works through the list.

## Priority Issues

### [P1] Editable amount fields lack financial-weight feedback

Why it matters: Users are changing money limits, but the active state only changes a thin underline. There is no clear field boundary, no editing mode, no saved pulse, and no warning when the value becomes risky or invalid.

Fix: Replace `AmountField` with a compact numeric control: right-aligned figure in a small rounded field, currency prefix locked outside the editable text, focus ring/tinted fill on edit, commit checkmark or subtle flash on save, and invalid/empty state in over-ember. Use monospaced/tabular number styling if available.

Suggested command: `impeccable craft modern budget amount editor`

### [P1] Hero section does not answer the budgeting question

Why it matters: The hero says "$5,311 of $5,200/mo" and exposes Template, but it does not make the status legible: over/remaining, target split, and whether the current plan is healthy are not the first read.

Fix: Make the hero a planning summary: primary status should be "Over by $111" or "$432 unassigned"; secondary should show "$5,311 planned of $5,200 income"; include the allocation bar in the hero, or a clear 50/30/20 split summary. Let the template picker become a supporting action, not the visual endpoint.

Suggested command: `impeccable shape budget hero`

### [P2] Category cards are scan-friendly but visually flat after the first card

Why it matters: Repeated cards with identical internal rhythm make the user work row-by-row. The group total is visible, but it does not communicate group health against the intended 50/30/20 target.

Fix: Add per-group target feedback in the header: `Needs 52% / target 50%`, a tiny progress rail, and status copy only when needed. Keep it restrained; no badges or gamification.

Suggested command: `impeccable polish budget groups`

### [P2] Numeric input has quiet edge-case failure

Why it matters: Empty strings, pasted symbols, multiple decimals, and partial typing can silently parse in ways the user may not expect. Finance UI needs explicit precision.

Fix: Keep draft string separate from committed value, validate on commit, show invalid state inline, and do not update the budget total until the draft is valid or committed. Alternatively, live-update with a visible "editing" state and a stable revert path.

Suggested command: `impeccable harden budget amount editing`

## Persona Red Flags

Alex, power user: Efficient inline editing is promising, but there is no bulk rebalance, no percent-first adjustment, and no quick way to distribute the remaining/over amount across a group.

Sam, accessibility-dependent user: The underline-only editable amount is a visual-only affordance unless explicit accessibility labels are added. Swipe delete also needs an accessible alternate remove action.

Casey, distracted mobile user: Small amount targets near the right edge are easy to miss one-handed. The value should have a larger, stable touch box and stronger active state so interruptions do not leave the user wondering what changed.

## Questions to Consider

- Should this screen optimize for editing exact dollar amounts, adjusting percentages, or quickly correcting an over/under plan?
- Should templates feel like a one-time setup action or a persistent mode users can compare against?
- What should the hero make impossible to miss: total planned, over/under status, or adherence to 50/30/20?
