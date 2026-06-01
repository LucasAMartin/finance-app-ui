---
target: insights screen
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-06-01T02-15-09Z
slug: src-screens-insightsscreen-tsx
---
# Insights Screen — Design Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Amount, comparison label, and range are shown; no loading/skeleton state for the coming CloudKit data |
| 2 | Match System / Real World | 3 | Good plain language; "Snapshot" and "Pace" are unexplained jargon |
| 3 | User Control and Freedom | 3 | Drill-downs + per-period date memory; no pin/reorder/custom range |
| 4 | Consistency and Standards | 2 | Three different row layouts, two icon treatments, chevron only on snapshot rows |
| 5 | Error Prevention | 3 | Low error surface; mostly n/a |
| 6 | Recognition Rather Than Recall | 3 | Sections labeled but headers are near-invisible |
| 7 | Flexibility and Efficiency | 3 | Decent drill-downs; no power-user affordances |
| 8 | Aesthetic and Minimalist Design | 2 | Wallpaper + 4 frosted cards + cross-section redundancy + dense control cluster |
| 9 | Error Recovery | 2 | Empty states exist for no-data; no failure/error state |
| 10 | Help and Documentation | 2 | Empty states teach lightly; Pace/Snapshot never explained |
| **Total** | | **26/40** | **Moderate — strong engineering bones undermined by visual noise and redundancy** |

## Anti-Patterns Verdict

**Not generic AI slop.** This screen has real identity: a committed violet system, custom SVG charts with scrub + haptics, native SwiftUI sheets, a recurring-aware pace/budget model. No gradient text, no neon-on-black, no canned hero-metric template.

But it leans on **two of the shared absolute bans**:
- **Glassmorphism as default.** The entire screen is frosted `BlurView` cards stacked over a photographic wallpaper + scrim. DESIGN.md sanctions the frosted `SectionCard` as *structural* legibility against the wallpaper, but that rationale fits the dashboard-style screens. On a dense *analytics* surface, four large blur panels over a photo is decoration carrying a legibility cost.
- **Identical card grid (adjacent).** Snapshot, Categories, and Merchants are three near-identical frosted list-cards: same radius, same padding, same header (title + right-meta), same row rhythm. Stacked, they read as one repeating template.

**Deterministic scan:** `npx impeccable detect` returned clean (`[]`). Not meaningful here, its rules target HTML/CSS, not RN StyleSheet, so treat it as "no signal," not "passed."

## Overall Impression

The data layer is genuinely sophisticated; the *presentation* is working against it. PRODUCT.md asks for "clarity at a glance" and "data-forward design," but the screen makes you wade through a decorative photo, four blur panels, two segmented controls, and three overlapping lists before you can answer the one question a busy professional opens this for: *am I okay this week or not?* The single biggest opportunity: decide what this screen is **for** in a 10-second glance, make that the loud thing, and demote or cut the rest.

## What's Working

- **The chart hero.** The 32px spend figure + interactive bar/pace chart with scrub and haptics is the best thing here. It's a real, custom, tactile data object, not a template.
- **Honest period semantics.** Week = pace, Month/Year = budget, recurring bills separated from variable spend. This is correctness most finance apps get wrong, and the recent fixes (no fake weekly "over budget," bar only where a real budget exists) show good judgment.
- **The unified detail sheet.** Every tappable thing now opens the same hero + viz + stat layout. Consistent payoff for a tap.

## Priority Issues

**[P1] Decorative wallpaper + 4 stacked blur panels on a data screen.**
- *Why it matters:* Blur over a photo lowers text/number contrast and adds visual work on the screen that most needs to be scannable. It makes an analytics tool feel like a lock-screen widget. Directly fights "clarity at a glance" and "let data speak."
- *Fix:* Either drop Insights out of the wallpaper treatment onto a near-solid page (flat-first, per DESIGN.md's default), or keep the wallpaper only behind the chart hero and render the lists on solid surfaces below. Reserve blur for chrome.
- *Suggested command:* `quieter` (or `distill`).

**[P1] Three sections overlap in content and look identical.**
- *Why it matters:* The top merchant appears in Snapshot *and* atop Merchants; budget pressure appears in Snapshot *and* in Categories. Users re-read the same fact two or three times, and the three identical cards give no visual cue that they serve different jobs. High cognitive load, low information gain.
- *Fix:* Make Snapshot the clear "what changed / what matters now" summary and visually distinguish it (it's interpretation, not raw data). Let Categories and Merchants be the raw breakdowns, and consider collapsing one (tabs, or Merchants nested under a tapped category) to kill the redundancy.
- *Suggested command:* `distill` (then `layout`).

**[P2] Inconsistent row vocabulary and tap affordance.**
- *Why it matters:* Snapshot rows use a monochrome dark icon circle + chevron; Categories/Merchants use colored category circles + no chevron, yet all three open the same sheet. Users can't tell the category/merchant rows are tappable, and the mixed icon treatment makes one screen feel like three.
- *Fix:* One icon treatment, one row skeleton, one drill affordance (add the chevron to category/merchant rows, or remove it everywhere and rely on press feedback). Replace the repeated "N transactions" subtitle with something with signal.
- *Suggested command:* `polish` (consistency pass).

**[P2] Weak structural hierarchy.**
- *Why it matters:* Section titles render at ~13px and 0.7 opacity (`chartTitle`), so the only loud element on the whole screen is the 32px amount. Everything else is a flat, quiet field, which makes the screen hard to scan and the sections hard to tell apart. DESIGN.md even defines an 18px `sectionTitle` role that isn't being used here.
- *Fix:* Promote the section headers (use the real `sectionTitle` token, full contrast), and create deliberate spacing rhythm between a section head and its rows.
- *Suggested command:* `typeset`.

**[P2] Overloaded chart card.**
- *Why it matters:* One card carries the period toggle (Week/Month/Year), the spend amount, the Spent/Pace toggle, a comparison label, the chart, and a selected-insight strip. That's two segmented controls plus four data elements competing in one frame; the Spent/Pace control is cramped at 128px beside the big number. More than 4 decision points at one glance.
- *Fix:* Let the amount + comparison own the top, move the Spent/Pace switch onto the chart (or make Pace a toggle on the y-axis rather than a mode), and give the period switch more room.
- *Suggested command:* `layout`.

## Persona Red Flags

**Busy Professional (project persona, 10-second glance, mobile, mid-day):** Opens Insights to learn "am I over or under this week." The answer is the *comparison label* ("28% over projected"), rendered in tiny `captionEm` tucked beside the Pace toggle, while the loud 32px number is just the raw total, which answers nothing on its own. They have to parse four cards to feel oriented. Glance fails.

**Jordan (First-Timer):** Why are there three lists? "Snapshot" vs "Categories" vs "Merchants" isn't self-evident, and "Pace" is never defined. Taps a Categories row only by accident, since nothing signals it's interactive. Leaves unsure what the screen is telling them.

**Alex (Power User):** Wants density and speed; gets a decorative photo and blur. No way to pin the snapshots they care about, no custom date range (only a stepper + preset menu), no way to collapse the redundancy. Efficient for them would be denser and flatter.

## Minor Observations

- "N transactions" as every row's subtitle is repetitive filler; spend a subtitle on signal (e.g., top merchant in a category, or last-charge date).
- No loading skeleton. Fine for mock data, but the CloudKit migration will need one (product register asks for skeletons over spinners).
- "Snapshot" is a vague title for a heterogeneous list (budget pressure, a bill due, no-spend days, daily average all share one list). The row types span different temporal meanings.
- Centered date scrubber in the header reads as the screen title slot; mildly unconventional.
