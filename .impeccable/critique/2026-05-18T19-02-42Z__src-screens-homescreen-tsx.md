---
target: home screen
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-05-18T19-02-42Z
slug: src-screens-homescreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading skeletons solid; no feedback when pull-to-refresh completes |
| 2 | Match System / Real World | 3 | "$0.00 available" when over-budget misrepresents the situation |
| 3 | User Control and Freedom | 2 | Month picker is the primary control; its trigger is too small to hit reliably |
| 4 | Consistency and Standards | 3 | CategoryGroups rows indent 18px while bill/tx rows indent 0px — visible seam |
| 5 | Error Prevention | 2 | Read-only screen limits opportunities; over-budget display is the main gap |
| 6 | Recognition Rather Than Recall | 3 | Section labels and "See all" links are discoverable but very subtle |
| 7 | Flexibility and Efficiency | 2 | Month switching requires dropdown; no swipe or quick-access alternative |
| 8 | Aesthetic and Minimalist Design | 3 | Budget meta row carries 4 data points in one line; hero area is clean |
| 9 | Error Recovery | 1 | No error states for data loading failures; month picker recovers fine |
| 10 | Help and Documentation | 1 | 50/30/20 targets unexplained; no contextual guidance anywhere |
| **Total** | | **23/40** | **Acceptable — significant improvements before users are happy** |

---

## Anti-Patterns Verdict

**Not AI-generated.** The ledger document direction — flat rows, full-bleed hairline dividers, small-caps section labels, no card chrome — is distinctive and not a standard fintech training-data reflex. The palette (sage, butter, sky) avoids the navy/gold first-order reflex and the mint-green/rounded-card second-order reflex. This reads like a considered design choice, not a prompt output.

One flag worth naming: the budget hero structurally resembles the "hero-metric template" (big number, small label, supporting stats below). The absolute ban requires a gradient accent, which isn't present, so it doesn't trigger. But the composition is recognizable as a fintech widget pattern. The tick bar as a full-width element is what saves it — it's a genuinely distinctive visualization, not a decorative gradient ring.

**Deterministic scan**: Unavailable this run (npm cache permissions issue). No automated overlay results.

---

## Overall Impression

The redesign successfully broke away from the card-stack convention. The ledger document direction is coherent, and the budget hero is the right primary signal. The core problem is that the design solved the wrong version of "glanceability": the big number is now prominent, but the supporting layer (meta row, section labels, action links) was made so quiet that users who need more than a single number will struggle to parse or interact with the page. The contrast choices that create elegance also create functional gaps in the interactive layer.

---

## What's Working

**1. The budget hero as above-the-fold signal.** The 48px available amount in accent color with no card wrapper is the right answer to "glanceability." It hits before any other element. Combined with the tick bar immediately below, a user can assess their month status in under 2 seconds without scrolling. This is the design's best move.

**2. Full-bleed hairline dividers as section structure.** The `marginHorizontal: -20` dividers feel like a deliberate editorial choice, not an oversight. They give the screen a clean "document page" feel at zero visual cost. The ledger aesthetic is consistently applied.

**3. The days-remaining chip on bills.** The compact `14d` chip in accent fill next to each bill amount is a micro-design decision that adds real signal: urgency is scannable without reading the date string. This is genuinely additive — it communicates something the previous design didn't.

---

## Priority Issues

**[P1] Month picker touch target is below the 44pt minimum**
- **What**: The `monthTrigger` `TouchableOpacity` has no `paddingVertical` and no `hitSlop`. Its tap surface is the text height of 11px uppercase text — approximately 18–22pt in practice. The minimum for iOS touch targets is 44pt.
- **Why it matters**: Month switching is the primary navigation act on this screen. For a user trying to review a past month, this is a frequently used control that will produce consistent miss-taps and frustration.
- **Fix**: Add `paddingVertical: 10` and `hitSlop={{ top: 12, bottom: 12 }}` to the `monthTrigger` style. This brings the effective tap target to approximately 40–44pt with no visual change.
- **Suggested command**: `/impeccable polish`

**[P1] Interactive element contrast fails WCAG AA**
- **What**: "See all" links, the ledger action links, and the date greeting all use `theme.textTer` — `rgba(14,14,16,0.32)` in light mode, `rgba(232,236,245,0.36)` in dark. Both produce approximately 1.7:1 contrast, far below the WCAG AA 4.5:1 requirement for interactive text.
- **Why it matters**: "See all" is a tap target that navigates to another screen. Users with any vision impairment, or anyone using the app in bright sunlight, may not see these links at all. They're not decorative — they're navigational.
- **Fix**: Ledger action links ("See all") should use `theme.textSec` (55–60% opacity = ~3.5:1 contrast). Section labels can stay at `textTer` since they're non-interactive. The date greeting, also non-interactive, can stay at `textTer`.
- **Suggested command**: `/impeccable polish`

**[P1] Over-budget state shows "$0.00 available" — misleading**
- **What**: When `spent > budget`, `Math.max(budget - spent, 0)` clamps to 0. The hero reads: "$0.00 available this month" in OVER_DOT color. The actual situation is the user has overspent by `spent - budget`.
- **Why it matters**: "$0.00 available" implies there is nothing left to spend but no overage — a neutral reading. The reality is an active debt against the budget. Users who check the number quickly will under-respond to the problem.
- **Fix**: When `over`, render the overage amount (`mb.spent - mb.budget`) with a minus prefix, and change the label to "over budget" or "overspent by". Example: `-$140.00` in OVER_DOT with "over budget this month" label below.
- **Suggested command**: `/impeccable harden`

**[P2] Budget meta row packs four data points into a single line**
- **What**: "of $2,400  ·  16%  ·  On target  ·  17 days remaining" is four independent pieces of information in one line. Users must parse all four to extract any one, and the four bullets create visual noise.
- **Why it matters**: The brief's stated goal was glanceability. Four inline data points in 11.5px text directly undermine that. The status word ("On target") is the most important piece here and is buried mid-line.
- **Fix**: Move "On target" / "Off target" / "Over budget" to a chip next to the month trigger label (near the top of the hero, where context is set), and collapse the meta row to two items: "of $X  ·  Y days remaining". The percentage is derivable from the bar; remove it.
- **Suggested command**: `/impeccable layout`

**[P2] CategoryGroups rows are 16px out of alignment with their section label**
- **What**: The "SPENDING" ledger label has `paddingHorizontal: 2` (from `sectionHead` style), but `GroupRow` inside `CategoryGroups` has `paddingHorizontal: 18` (from `styles.group`). The chevron starts 18px from the left edge; the section label starts 2px from the left edge. This is a 16px mismatch.
- **Why it matters**: On a page without card borders to define sections, visual alignment is the only mechanism communicating that the rows belong to the label above them. A 16px offset reads as misalignment, not intentional hierarchy.
- **Fix**: Either (a) change `sectionHead.paddingHorizontal` from 2 to 18 for the Spending section, matching the row indent, or (b) pass a `paddingHorizontal: 0` override into `GroupRow` when `naked=true` so row content starts at 0 and aligns with the section labels.
- **Suggested command**: `/impeccable polish`

---

## Persona Red Flags

**Casey (Distracted Mobile User)**: Opens app in a 30-second break, one-handed. Immediately sees the large green number — good. Wants to check last month. Tries to tap "May budget" — misses it because the tap target is ~20pt. Taps again, the dropdown opens. Selects April. Gets interrupted. Reopens the app — it's back on May because state is not persisted. For a user checking in and out multiple times daily, the ephemeral month selection is a real friction point.

**Alex (Power User)**: Wants to compare months efficiently. Finds the dropdown-only month navigation patronizing — three interactions (tap trigger, scroll list, tap month) for an action they'll do repeatedly. Expects a swipe gesture or at minimum a left/right tap on the month label. The "See all" on Spending navigates away; there's no quick-return mechanism they can see from the home screen. Not broken, but not efficient.

**Project-Specific Persona — "The Busy Professional"** (from PRODUCT.md: busy professionals, multiple glances daily, short windows, needs to spot budget overages at a glance): The primary use case is a 3-second check, not a 30-second read. For this persona, the single biggest failure is the month picker trigger — it's the one interaction they'll need when something feels off, and it's the hardest to hit. The "On target" status buried mid-line in the meta row is also a miss: they want to see a green/red signal, not parse a sentence.

---

## Minor Observations

- The `section: {}` style is empty — clean, but Activity section has no trailing spacing of its own and relies entirely on `paddingBottom: 140` from the scroll container. If the tab bar height changes, Activity rows may crowd the tab bar.
- The `rowSub` style has no explicit `fontWeight` — it inherits the system default (400). This is intentional but worth making explicit for future maintainability.
- The `dateGreeting` function computes on every render via a function call in the component body. It should be memoized with `useMemo` or moved outside the component since it only needs to update when the date changes.
- Bill rows are not tappable (unlike transaction rows). This is intentional but the visual pattern is identical — a user may expect tap behavior.
- The `MonthDonut` in the picker could show a "100% complete" ring for past months rather than just the spent/budget fill, to quickly distinguish current vs. complete months.
