---
target: history screen
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-05-28T23-11-20Z
slug: src-screens-activityscreen-tsx
---
# Critique — History screen (`src/screens/ActivityScreen.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Filters/calendar surface *what* is shown, but never *how much* — no totals or result counts |
| 2 | Match System / Real World | 4 | "Today/Yesterday", calendar, group names read naturally |
| 3 | User Control and Freedom | 2 | Swipe gesture reveals a tag action that does nothing; delete is buried 2 levels deep |
| 4 | Consistency and Standards | 3 | On-brand tokens throughout, but swipe-to-delete (platform standard) not honored |
| 5 | Error Prevention | 2 | Delete in TxSheet fires immediately, no confirmation on a destructive action |
| 6 | Recognition Rather Than Recall | 4 | Active filter pills + calendar dots keep state visible |
| 7 | Flexibility and Efficiency | 3 | Search + sort + filter + calendar is rich; no working shortcuts or bulk actions |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained, violet-tinted, genuinely premium; stack is slightly tall |
| 9 | Error Recovery | 2 | No undo on delete; `Toast` component exists but isn't wired here |
| 10 | Help and Documentation | 3 | Empty states guide adequately; nothing else needed |
| **Total** | | **30/40** | **Good — clear, on-brand, with specific gaps** |

## Anti-Patterns Verdict

**Does not look AI-generated.** The deterministic detector flagged **zero** patterns across `ActivityScreen.tsx` and `TransactionCalendar.tsx`. No gradient text, no side-stripe borders, no decorative glass, no hero-metric template, no identical card grid. The custom dotted calendar + day-grouped list is a considered, brand-specific layout, not a template. This passes the slop test cleanly.

## Overall Impression

This is a well-built, on-brand screen that does *navigation and filtering* of history excellently but forgets it is a **finance** screen. For an app whose stated north star is "spot spending patterns and budget overages at a glance" and "numbers are the interface," the History view shows no monetary totals anywhere. That is the single biggest gap and the most "expected but missing" thing here.

## What's Working

- **Filtering system is genuinely strong.** Search + native sort picker + date presets + custom range mini-calendar + grouped category multi-select, with removable pills and a live count badge. This is power-user grade and stays visually quiet.
- **The calendar is the signature element.** Per-day dots colored by spending group (with bill dots as hollow rings) communicate density and category mix at a glance, and it collapses to stay out of the way. On-brand and custom.
- **Restraint holds.** Hairline borders, violet-tinted surfaces, group-color icon circles, single typeface scale. It reads premium without decoration.

## Priority Issues

### [P1] No monetary totals anywhere on a finance history screen
**Why it matters:** `grouped[day].total` and `dayDetail.total` are *already computed* and then thrown away — never rendered. Day headers show only a date; the selected-day view has no header at all; filtered results show no aggregate. A user filtering "Dining, this month" gets a list but never the one number they came for. This directly contradicts Design Principle 3 (data-forward) and the "clarity at a glance" promise.
**Fix:** Render `group.total` right-aligned in each `DayGroup` header (the `dayHeader` style already uses `space-between` with `alignItems: baseline` — it was clearly built for this). Add a total to the selected-day view header. When any filter/search is active, show a slim summary line above the list: "12 transactions · $1,240".
**Suggested command:** `/impeccable craft` (totals + summary line)

### [P1] The swipe gesture is a dead end
**Why it matters:** `SwipeRow` reveals a tag icon on left-swipe, but `PanResponder` has no release handler that does anything — the row springs back and nothing happens. You are teaching users a gesture that lies. Worse, the platform-standard expectation for a swiped transaction row is **delete**, and the slot is already built.
**Fix:** Wire the swipe to a real action. Given delete is currently buried, swipe-to-delete is the highest-value choice — pair it with the existing `Toast` for undo. If the intent was categorize/tag, label it and wire the tap.
**Suggested command:** `/impeccable craft` (swipe action + undo toast)

### [P2] Destructive delete with no confirmation and no undo
**Why it matters:** `deleteTx` in TxSheet calls `transactionsRepo.delete` and closes immediately. One mis-tap permanently removes a transaction, with no confirm and no recovery. Heuristics 5 and 9 both fail here. The brand is "trustworthy precision"; silent irreversible deletion undercuts it.
**Fix:** Add an undo `Toast` ("Transaction deleted · Undo") rather than a blocking confirm dialog — it preserves low-friction flow while making the action recoverable. The `Toast` component already exists in the tree.
**Suggested command:** `/impeccable harden`

### [P2] No loading / async state for the incoming backend
**Why it matters:** The screen has empty and populated states but no loading state. Per the project's CloudKit migration, this list will soon be async; today it would flash from empty-state straight to content, and on a slow fetch show the "No transactions yet" copy falsely.
**Fix:** Add a skeleton-row state (3-4 shimmer rows reusing `txRow` geometry) gated on a loading flag, so the empty state only shows after a settled fetch.
**Suggested command:** `/impeccable harden`

### [P3] Selected-day view loses context
**Why it matters:** Tapping a calendar day swaps the list to that day's items, but there's no header inside the card naming the day or its total — only the removable pill above carries the date. The computed `dayDetail.total` is unused.
**Fix:** Add a small header row to the day-detail branch: "May 14 · $84.20", matching the `DayGroup` treatment.
**Suggested command:** `/impeccable layout`

## Persona Red Flags

**The Busy Professional (project persona — checks finances in short windows):** Opens History to answer "how much did I spend on dining this week?" Filters to Dining + This week, gets a clean list, and still has to add the amounts in their head. The one-glance number they came for isn't on screen. Highest-impact failure for the core user.

**Alex (Power User):** Filtering is fast and satisfying, but tries the obvious swipe-to-delete on a row, feels it bounce back dead, and concludes the gesture is broken. Then hunts for delete: tap row, expand sheet, scroll, find it. Four interactions for a one-swipe task.

**The Anxious Spender:** Accidentally deletes a transaction from the sheet. It vanishes instantly, no "are you sure," no undo. For someone nervous about their money, an irreversible silent delete is exactly the trust break the brand promises to avoid.

## Minor Observations

- Day-grouped list has no sticky date headers; on long months you lose the date context while scrolling. Optional.
- No pull-to-refresh — irrelevant today, expected once data is remote.
- Income vs expense isn't visually distinguished in rows (all amounts render unsigned); if `type: 'income'` transactions exist, inflow/outflow needs a sign or color cue.
- Calendar + search + filter pills + list stack tall before the first transaction; fine given the calendar collapses, but worth watching as totals get added.
