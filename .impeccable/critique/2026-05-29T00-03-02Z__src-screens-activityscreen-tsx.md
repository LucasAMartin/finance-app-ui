---
target: the history screen
total_score: 33
p0_count: 0
p1_count: 2
timestamp: 2026-05-29T00-03-02Z
slug: src-screens-activityscreen-tsx
---
# Critique: History screen (`src/screens/ActivityScreen.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strong feedback (filter badge, active pills, filtered count+sum); no loading state |
| 2 | Match System / Real World | 4 | "Today/Yesterday", calendar, currency all natural |
| 3 | User Control and Freedom | 4 | Swipe-to-delete with Undo toast, clear-all, removable pills |
| 4 | Consistency and Standards | 3 | Hardcoded amber "Upcoming" pill bypasses the caution-amber token |
| 5 | Error Prevention | 3 | Delete is reversible via Undo (correct pattern) |
| 6 | Recognition Rather Than Recall | 4 | Filters as pills, current sort/date visible in pickers, calendar marks |
| 7 | Flexibility and Efficiency | 4 | Search + filter sheet + sort + presets + calendar + swipe |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and restrained; amber pill is the one loud note; calendar-open pushes list below fold |
| 9 | Error Recovery | 3 | Undo on delete is exemplary; no failed-load/offline state |
| 10 | Help and Documentation | 2 | Empty state is generic, doesn't teach how to add a first transaction |
| **Total** | | **33/40** | **Strong** |

## Anti-Patterns Verdict

**Not AI slop.** Hand-crafted, category-fluent work: violet-tinted palette, photographic wallpaper with scrim gradient, custom marked calendar, gesture-driven swipe-to-delete, native iOS pickers. The BlurView cards are the intentional "media wallpaper" treatment shared with Spending, not decorative glass. Detector returned `[]` (zero hits). No browser overlay (native screen).

## Overall Impression

One of the more complete screens in the app. The filter system, calendar integration, and the delete→Undo loop are genuine product craft. The gaps are not visual polish; they are production-completeness items that surface once real, async, multi-month data replaces the May-2026 mock: virtualization, loading/error states, and a real date model.

## What's Working

- **Destructive action done right.** Swipe-to-delete + Undo toast + single-open-row coordination. Makes a confirm dialog unnecessary.
- **Filter legibility.** Active filters render as removable pills colored by meaning, with a count badge on the filter button.
- **Progressive disclosure.** Calendar collapses, filters live in a sheet, custom range expands inline only when chosen.

## Priority Issues

- **[P1] List is not virtualized.** Entire result set is `.map()`-ed into a `ScrollView`. With real history (hundreds+ of transactions) it renders every row eagerly. Fix: `SectionList`/`FlatList` with day headers. Command: `optimize`
- **[P1] Date model pinned to mock constants.** `CALENDAR_YEAR=2026`, `CALENDAR_MONTH=4`, string `fullDate` parsing, `when` strings. Won't survive real `Date` data across months/years. Fix: derive from `occurredAt`. Command: `harden`
- **[P2] Hardcoded amber breaks tokens.** `BillRow` uses raw `rgba(255,200,80,...)` while `cautionBg`/`cautionText` are imported and unused; brighter/more saturated than brand caution-amber, leans into the golden-amber finance reflex the system rejects. Fix: use the tokens. Command: `colorize`
- **[P2] Calendar-open-by-default inverts hierarchy.** `cachedCalOpen=true` opens to a month grid, pushing the list below the fold on a screen titled "History." Fix: default collapsed or peek. Command: `layout`
- **[P2] No loading or error states.** Product register expects skeletons + offline/failed-load. Home has `Skeleton`; History has none. Command: `harden`

## Persona Red Flags

**Sam (busy professional, glances daily):** Opens to a month grid, not transactions; must scroll/collapse before the "at a glance" promise pays off.
**Alex (power user, large dataset):** Non-virtualized list stutters on a year of data; no pull-to-refresh; can't scroll continuous multi-month history (list binds to one calendar month).
**Jordan (first-timer, empty account):** "No transactions yet" with a search-magnifier icon; nothing points to the +/mic add action.

## Completeness Checklist

Present: search, multi-category filter, date presets, custom range, sort, calendar marks, day drill-down, swipe-delete + undo, filter pills, a11y labels.

Missing for production-complete:
1. List virtualization (`SectionList`/`FlatList`) — P1
2. Real `Date`-based date model — P1
3. Loading skeleton + error/offline state — P2
4. First-run empty state that teaches the add action — P2
5. Pull-to-refresh — minor
6. Continuous multi-month scroll (today bound to one calendar month) — design question
7. Income vs expense in calendar dots — minor

## Minor Observations

- Two empty states share one search icon; "no data yet" shouldn't use a search glyph.
- `CAL.dayText` style defined but unused.
- Bill rows always show repeat icon + Upcoming pill; stacks visual weight against real transactions on busy days.
