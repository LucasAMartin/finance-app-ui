---
target: the home screen
total_score: 20
p0_count: 1
p1_count: 2
timestamp: 2026-05-26T20-00-39Z
slug: src-screens-homescreen-tsx
---
# Home Screen Critique

## Anti-Patterns Verdict

Not AI-generated looking. Wallpaper + violet hero + frosted cards reads as a committed aesthetic. No navy-and-gold, no neon, no gradient text on metrics, no SaaS-cream. Soft warning: the 4 quick-action circles (icon + label, evenly spaced) edge toward the "identical card grids" template — made worse by the fact that all four duplicate existing nav.

## Overall Impression

The hero, sections, and wallpaper do real work for a glance user: "Available · $X" answers the primary question in one read. The screen falls apart in two places: the quick actions row is dead weight (redundant nav), and the screen is entirely rear-view. PRODUCT.md asks for "spot spending patterns" — nothing here is forward-looking, no pace, no projection, no change-vs-last-month. Single biggest opportunity.

## What's Working

- Hero composition: "Available · $X · [month picker]" with budget bar is calm, scannable, one strong answer. Over Ember swap on overspend is correct. Earns its peak status.
- 50/30/20 group color encoding (blue/clay/teal) is consistent across icon circles, sub-rows, breakdown. Returning user gets instant recognition.
- Progressive header backdrop (recently shipped) is the right structural-blur call.

## Priority Issues

### [P0] The 4 quick actions duplicate the tab bar and drawer.

- Insights (chart) → SpendingScreen. Tab bar already has `spending` (chart) → same screen.
- Budget (wallet) → BudgetScreen. Tab bar already has `budget` (wallet) → same screen.
- Activity (receipt) → ActivityScreen. Tab bar `profile` uses receipt icon. Drawer "Activity" badge=3 also exists.
- More (menu) → drawer. Hamburger in the same header opens the same drawer.

Why: a glance-and-go user thinks twice. PRODUCT.md bans "too many options per screen." This row is the cognitive-load offender; removing it reduces visible options at the primary decision point by ~30% with zero capability loss. Nielsen #4, #8.

Fix: remove the row, OR repurpose into actual actions (log expense, voice add, scan receipt, log income).

### [P1] Nothing on the screen is forward-looking.

Hero = current state. Sections = history. Upcoming = next bills only. Missing: am I on pace, what's projected end-of-month, what changed vs last month at this point.

Why: product is about pattern recognition, not bookkeeping. A static "available" figure can't surface pattern; only trajectory can. User has to mentally do the math, defeating the glance goal.

Fix: single line of pace context under the budget bar. `On pace · $3,180 projected` or `$240 above pace`. Use hero-avail / caution-amber / over-ember per state.

### [P1] The bell has no destination.

Static View, not Pressable. Red dot is permanent regardless of state. Nielsen #1 fails: signals state without telling the user what state.

Fix: wire bell → notifications screen and drive the dot from real data, OR remove the bell entirely. Half-built chrome erodes trust.

### [P2] Upcoming bills aren't actionable.

List is read-only. A bill labeled "in 3 days" is the perfect moment to offer Mark paid / Snooze.

Fix: long-press or swipe-left on a bill row → Mark paid / Edit / Snooze. Pay button on bills due ≤2 days.

### [P2] No primary action identifiable on the screen content.

Tab-bar Add is the de-facto primary, but on the screen itself there's no "do" surface, only "look" surfaces. Redundant quick-action row makes this worse — four equally-weighted nav choices.

Fix: if quick-actions row becomes actions (P0), give one slot a filled violet treatment as the primary; rest stay outlined.

## What the 4 buttons should be

Three options, ordered by recommended:

A. Daily actions (recommended): Log expense (filled, primary) | Voice add | Scan receipt | Log income.
B. Remove the row entirely. Hero gets more weight; tab bar handles nav. Most on-brand.
C. Trim to one: "View full month" link to BudgetScreen, replacing the 4-button row.

Ship B for a week to feel the screen without the row, then commit to A.

## What functionality should be added

1. Pace projection on hero (one line under budget bar).
2. Income visibility (small strip near hero: "Income $5,200" or "Net so far +$1,847").
3. Anomaly callouts on Activity rows (>2x median = caution-amber dot).
4. Tappable bell + real notifications (bill-due, category 90%, anomalies — ties to #3).
5. Pull-to-refresh that does something visible, or remove it.

NOT to add: search bar, chart preview, badges/streaks (banned by PRODUCT.md), savings goal widget.

## Persona Red Flags

Maya (busy professional, lunch glance): opens → Available ✓ → forced to choose between 4 quick-action circles AND 4 tab bar icons that look like the same options. Half-second daily friction. By month two she's tapping past quick-actions without reading them.

Jordan (first-time user, day 1): taps Insights → SpendingScreen → back → taps tab bar chart → same screen. Mental model adjusts to "this app has duplicate nav." First impression slightly off. "More" is unlabeled-in-intent.

## Minor Observations

- Theme toggle in the header is unusual placement (normally settings-deep). Consider moving to Drawer.
- Tab bar `{ id: 'profile', icon: 'receipt' }` — id and icon disagree. Pick one.
- "See all" links at 11pt + opacity 0.82 are dim. 0.92 or full opacity at existing size.
- RefreshControl uses theme.accent.dot for spinner — verify against DESIGN.md's accent-economy rule.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Bell dot signals nothing; no pace/trend signal |
| 2 | Match system / real world | 3 | "Available"/"Over budget" clear; "More" vague |
| 3 | User control and freedom | 2 | No undo, no scroll-to-top, no bill-row actions |
| 4 | Consistency and standards | 2 | Quick actions duplicate tab bar; theme toggle in chrome |
| 5 | Error prevention | 3 | Mostly read-only; bills color-coded by urgency |
| 6 | Recognition over recall | 3 | Group color system strong; "More" needs recall |
| 7 | Flexibility and efficiency | 2 | No shortcuts, no long-press, no swipe actions |
| 8 | Aesthetic and minimalist | 2 | 4-button row is decoration; hero earns its moment |
| 9 | Error recovery | n/a | Read-only at this depth |
| 10 | Help and documentation | 1 | No tooltips, no first-run, ambiguous bell, unlabeled icons |
| **Total** | | **20/40** | Workable, redundant chrome dragging it down |

The score is harsher than the screen feels — visual craft (hero, palette, blur) masks structural issues (redundant nav, no forward-looking content). Fix P0+P1 and score moves to ~28/40 without touching a pixel of the aesthetic.
