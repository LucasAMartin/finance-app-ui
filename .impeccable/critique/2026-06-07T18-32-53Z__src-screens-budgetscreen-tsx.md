---
target: budget screen
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-06-07T18-32-53Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Allocation bar shows the split; no target markers show compliance with the 50/30/20 rule |
| 2 | Match System / Real World | 3/4 | Good vocabulary overall; "Unassigned" is financial-software jargon ("remaining" is more natural) |
| 3 | User Control and Freedom | 3/4 | Undo toast handles deletes; keypad close commits silently — no cancel path if user typed garbage |
| 4 | Consistency and Standards | 4/4 | Token-consistent throughout; ScreenExitButton correct; group colors applied uniformly |
| 5 | Error Prevention | 2/4 | Hairline underline on amount barely discoverable; swipe-delete has no confirmation; past-month edits save silently |
| 6 | Recognition Rather Than Recall | 2/4 | Collapsed groups require recall; inline edit path requires discovering the underline; swipe-delete hidden |
| 7 | Flexibility and Efficiency | 3/4 | ExternalStore inline keypad is a genuine power shortcut; copyFromPreviousMonth is coded but has no UI surface |
| 8 | Aesthetic and Minimalist Design | 3/4 | Color encoding and scroll choreography are well-calibrated; FrameworkCard uses a different material vocab (opaque chipBg inside frosted glass) |
| 9 | Error Recovery | 3/4 | Undo handles deletions; dismissing the category sheet discards name/icon changes silently |
| 10 | Help and Documentation | 1/4 | FrameworkCard explains 50/30/20 once then disappears; inline edit path is undocumented; auto-deadline projection is invisible |
| **Total** | | **27/40** | **Solid with gaps** |

---

## Anti-Patterns Verdict

**Does this look AI-generated?**

**LLM assessment:** Mostly passes. The color strategy is a genuine departure from finance-app reflex: wants-clay instead of amber/gold, savings-teal not green, needs-blue that reads structural not corporate. The sticky allocation bar swap on scroll and the inline keypad ExternalStore pattern are domain-specific and opinionated.

Two soft failures: the allocation card legend is a 4-column equal-weight grid (dot + label + amount + %) that reads mechanical — the same skeleton as an identical-card grid at miniature scale. The FrameworkCard with its three dot+percent+label items in a chipBg box could belong to any budgeting app. Content is correct; layout is generic.

**Deterministic scan:** Zero findings from `npx impeccable detect`.

---

## Overall Impression

The screen has genuinely strong bones: the real-time keypad, scroll-pinned allocation bar, and group color system are production-quality. The critical failure is one step above the surface: **the allocation card answers the wrong question.** A busy professional opening this screen wants to know "am I following the 50/30/20 rule?" The bar answers "how is my budget split?" These look similar but are not the same. Fix that and the screen becomes meaningfully more useful; everything else is friction reduction.

---

## What's Working

1. **Inline keypad with ExternalStore pattern.** Keypresses repaint only the active amount field, not the whole screen. The blinking caret, stable digit position, and instant response make this feel native. It's the screen's standout interaction and the right shortcut for the primary task.

2. **Group color encoding applied uniformly.** Blue/clay/teal appear consistently in the group dot, icon circle background, progress bar fill, and allocation bar segment. A user learns the color once and reads it everywhere without effort.

3. **Scroll-pinned allocation bar.** The frosted bar fading in as the allocation card fades out — with the 4px hysteresis preventing jitter — is clean scroll choreography. The key metric stays in view during scrolling without a jarring header collapse.

---

## Priority Issues

**[P1] Allocation card answers "how is income split," not "am I on track"**
- The tricolor bar encodes the fraction of total budget across groups. It does not encode the 50/30/20 targets. A user seeing "Needs: 44%" cannot tell from the bar alone whether 44% is good (target is 50%) or bad (they're under-allocating essentials). The only rule-compliance signal is the small caption text in each group header ("X over target of 30%") which is 12pt/400w in textSec — easy to scroll past.
- **Fix:** Add target tick marks to the bar at the 50/80/100 positions (50% for Needs, 80% for Needs+Wants, 100% for all three). A ghost region or subtle rule line at each boundary turns the bar from "here is your split" into "here is your split relative to the framework." A one-line summary chip below the bar — "Needs 6% under target · Wants on track · Savings 4% over" — would further close the gap.
- *Suggested command:* `/impeccable craft allocation bar compliance indicators`

**[P1] `copyFromPreviousMonth` is fully implemented but has no UI entry point**
- The function exists at line ~784, correctly copies all budget records from the previous month to the selected month, and handles deduplication. There is no button, prompt, or affordance that triggers it. For the primary use case of setting up a new month's budget, this is the most important feature on the screen.
- **Fix:** Show a prompt when the user switches to a month that has no budget records: "No budgets for [Month]. Copy from [Prev Month]?" with a single primary action. This surfaces the feature exactly when it's needed without cluttering the UI otherwise.
- *Suggested command:* `/impeccable craft copy-from-previous-month prompt`

**[P1] Income tap affordance is too weak on the wallpaper hero**
- The income row has an underline at `rgba(255,255,255,0.35)` — a hairline-weight white at 35% opacity over a photographic wallpaper. On any light-toned wallpaper section this is invisible. Tapping income fires an external callback (`onOpenIncome`) which exits the budget-editing context to open a separate income sheet. Many users will never know this is tappable, treating income as a display-only label.
- **Fix:** Add a small "edit" chip or a chevron-right affordance next to the income amount that signals interaction, rather than relying on the underline alone. The external navigation behavior is acceptable given income changes are low-frequency; the issue is only the discoverability of the tap target.
- *Suggested command:* `/impeccable harden BudgetScreen`

**[P2] Past-month editing has no lock state or warning**
- When the user switches to a past month via the month picker, the screen looks identical to the current month. All budget amounts are editable, the inline keypad works, and changes save silently to historical budget records. There is no banner, lock icon, or confirmation prompt. A user who accidentally selects "April" instead of "May" and edits a number has permanently altered historical data without any warning.
- **Fix:** When `selectedMonth < currentMonthKey()`, show a subtle "Viewing [Month] — editing historical data" banner in the header or a lock treatment on amount fields. Past-month editing should feel deliberate, not accidental.
- *Suggested command:* `/impeccable harden BudgetScreen`

**[P2] Group header is the entire collapse tap target, making accidental collapses likely**
- The group header row (`TouchableOpacity` wrapping icon + label + total amount + chevron) is both the primary scan row and the full collapse target. The `RotatingChevron` is 11px at textTer opacity — the smallest, least visible element in the header. A user tapping through to browse group totals will frequently trigger collapse. Compounding this: the "Add category" row is outside `<Collapsible>`, so it remains visible even when the group is collapsed, which is visually inconsistent (you see the add button but no category rows to provide context).
- **Fix:** Constrain the collapse tap target to the right-side cluster (chevron + total) rather than the full header width. Move the "Add category" row inside `<Collapsible>` so it hides when the group is collapsed.
- *Suggested command:* `/impeccable harden BudgetScreen`

---

## Persona Red Flags

**Quick checker (opens to scan budget status mid-day):**
- Opens Budget tab expecting a fast "over or under?" answer.
- Gets: tricolor bar (no targets → can't read compliance), legend with four equal-weight columns (reads as raw data, not verdict), group headers (must read each caption to find the over-budget group). There is no single above-the-fold indicator.
- Red flag: the most important status signal — group over-budget caption in OVER_DOT — is 12pt text below the section title. Scanning at speed, the user may see the group total in group color and miss it entirely.

**Budget planner (adjusting next month's savings):**
- Wants to set up next month. Taps month picker. If next month has no budget records, it may not appear in the list at all (`monthOptions` is built from existing records plus the current month only). They're stranded on the current month.
- Finds a savings category, opens the editor. Sees "Monthly budget" and "SAVINGS GOAL" as separate fields with no explicit explanation that the budget drives the goal monthly contribution. Sets a new goal target but forgets to adjust monthly budget. Goal is created with an inconsistent plan.
- Red flag: the relationship between monthly budget and goal monthly contribution is implicit, explained only by the auto-deadline calculation's behavior, which is invisible unless the user enters all three goal fields in the correct order.

---

## Minor Observations

- `formatDraft("900")` shows "900" but the keypad treats it as 900¢ on first keypress (this was fixed in the category sheet; the same fix should be audited for the inline `EditableBudgetAmount` — when the user opens the keypad, the initial `draftStore.value` is set from `applyKeypadKey('0.00', ...)` starting from zero, not from the existing amount. Existing amount is only used for display; the keypad always starts from $0.00. For a user with a $1,200 housing budget who wants to change it to $1,250, they must type "125000" from scratch, not from "1200.")
- The `FrameworkCard` uses `theme.chipBg` background inside a frosted `SectionCard`, creating an opaque box inside the glass material. On wallpaper screens this reads as two nested surfaces — nested cards are always wrong per the design laws.
- "Unassigned" in the allocation legend would be clearer as "Remaining" (what's left to allocate) or "Available" (money not yet budgeted).
- The `collapsedGroups` state is local component state and resets when the user switches tabs. This is fine behavior, but if a user collapses Wants deliberately, returns to Home, then comes back to Budget, they'll re-expand. Consider persisting collapse state in `metaFlag` if users adopt heavy use of this feature.
