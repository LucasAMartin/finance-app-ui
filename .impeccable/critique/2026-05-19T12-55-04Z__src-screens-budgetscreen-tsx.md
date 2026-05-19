---
target: budget page
total_score: 22
p0_count: 0
p1_count: 2
timestamp: 2026-05-19T12-55-04Z
slug: src-screens-budgetscreen-tsx
---
## Budget Screen Critique

**Score: 22/40** — Acceptable. Significant improvements needed before users are happy.

---

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Budget edits commit on blur with zero confirmation; allocation bar updates silently |
| 2 | Match System / Real World | 3 | "50/30/20" requires prior knowledge; "discretionary" is lightly jargony |
| 3 | User Control and Freedom | 2 | No undo for budget edits; commit-on-blur with no cancel affordance in edit mode |
| 4 | Consistency and Standards | 3 | Bill amounts use `fontWeight: '500'` vs budget amounts at `'600'`; otherwise cohesive |
| 5 | Error Prevention | 2 | Template replacement has confirmation; inputs accept $0 and blank silently |
| 6 | Recognition Rather Than Recall | 3 | Chip affordance on amounts is clear; "Apply 50/30/20 template" is buried |
| 7 | Flexibility and Efficiency | 2 | Template is the only accelerator; no per-category reset, no batch edit |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and organized; allocation bar undersized at 10px for its semantic role |
| 9 | Error Recovery | 1 | No undo; silent $0 commits; template reset is destructive and all-or-nothing |
| 10 | Help and Documentation | 1 | No inline explanation of 50/30/20; no tooltip on "discretionary"; no onboarding |
| **Total** | | **22/40** | **Acceptable** |

---

### Anti-Patterns Verdict

**LLM assessment**: No AI slop detected. The interface avoids all absolute bans: no gradient text, no glassmorphism, no hero-metric decoration (the income number serves a functional role, not a decorative one), no identical card grids. The layout uses semantic colors purposefully. The overall aesthetic doesn't trigger the category-reflex check — nothing about this reads as "fintech navy-and-gold" or generic dashboard SaaS cream.

**Deterministic scan**: The automated detector returned zero findings across all 27 pattern checks. Clean.

---

### Overall Impression

The screen's information architecture is solid: income → allocation summary → bills → category groups → total. The visual language is cohesive after the recent layout and typeset passes. The core failure is interaction feedback: budget edits are the primary action on this screen, and they happen silently. A user who fat-fingers an amount and taps away has no way to know something changed, and no way to undo it. For a finance app where precision matters, that's the most important fix.

---

### What's Working

1. **The cadence track as a segmented control** — after the recent fix, the track container makes the paycheck frequency selector immediately recognizable as an interactive control. The equal-width pill segments and the clean active state read as a proper segmented component.

2. **Category color coding** — the needs/wants/savings palette carries consistently from the allocation bar segments through the legend, section headers, and row icon backgrounds. Users learn the color language once and it works everywhere on the screen.

3. **The summary strip** — "Budgeted / Remaining / Savings" as three divided stats at the end of the page is an efficient use of the bottom scroll area. It answers "how did I do" without redundant UI.

---

### Priority Issues

**[P1] Budget edits commit silently on blur with no feedback**
- **What**: Tapping an amount chip, typing a new value, and then tapping away commits the budget. No confirmation, no animation, no visual acknowledgment that anything changed. The allocation bar updates but users in the middle of editing may not be watching it.
- **Why it matters**: Mobile users blur fields accidentally all the time — notification arrives, they switch apps, they tap the wrong area. For a finance app where the stakes of a wrong number are real, silent commits create anxiety.
- **Fix**: Add a brief haptic + a transient visual state on the committed chip (e.g., briefly highlight the chip border in accent color, then fade, ~300ms). This costs nothing to implement and dramatically improves confidence.
- **Suggested command**: `/impeccable polish`

**[P1] $0 and blank inputs commit silently without validation feedback**
- **What**: The `commit` function in `EditableRow` parses the draft, and falls back to 0 for non-finite values. Blank input = $0 budget. There's no warning, no red state, no prompt to re-enter.
- **Why it matters**: A user who accidentally clears a budget field and taps away has silently set that category's budget to zero. The allocation bar shifts, but they may not notice. Budget tracking data is now wrong.
- **Fix**: If the committed value is 0 and the previous value was >0, either reject the edit (restore prior value) or show an inline warning ("Budget set to $0 — tap to change").
- **Suggested command**: `/impeccable harden`

**[P2] The allocation bar is undersized relative to its importance**
- **What**: At `height: 10, borderRadius: 5`, the bar is thin. It's the primary visualization on the screen, showing how income is distributed across needs/wants/savings. At 10px it reads as a progress indicator rather than a meaningful data chart.
- **Why it matters**: Users who don't deeply read the legend and number data can use the bar at a glance to understand their budget split. At 10px, the glanceability is compromised — especially for the "Free" gap that shows unallocated income.
- **Fix**: Increase to 14px height. This alone improves the bar's visual weight and makes the color segments easier to distinguish.
- **Suggested command**: `/impeccable layout`

**[P2] "Apply 50/30/20 template" is invisible and unexplained**
- **What**: The template link sits at the bottom of the scroll at 12px, `theme.textTer` color, `fontWeight: '500'`. It's deliberately de-emphasized, but to the point of being undiscoverable. More critically, "50/30/20" is meaningless to users who haven't heard of the framework.
- **Why it matters**: This is the screen's most powerful feature — it auto-populates all budget allocations proportionally. Most users will never find it, and those who do won't know what it does until after they tap (which triggers a confirmation alert).
- **Fix**: Move it to a more visible position — perhaps as a soft chip button just below the allocation bar section, labeled "Auto-fill from 50/30/20 rule" with a one-line description. Or add a small "?" icon next to it that explains the framework inline before confirming.
- **Suggested command**: `/impeccable clarify`

**[P2] Recurring bills section lacks clear context about its role**
- **What**: The bills are shown as a read-only list with amounts and due dates. Users have no way to know: are these auto-subtracted from my budgets? Are they tracked separately? Do they inform the "discretionary" calculation?
- **Why it matters**: Users might budget for "Housing" at $1,500/month while their mortgage is listed as $1,600 in recurring bills — a mismatch that's invisible because the two sections don't talk to each other in the UI.
- **Fix**: Add a one-line contextual note below the section title: "These are tracked separately from your category budgets" (or connect them if that's the intended behavior). The existing "locked in · discretionary" footer note is helpful but gets buried.
- **Suggested command**: `/impeccable clarify`

---

### Persona Red Flags

**Casey (Distracted Mobile User)** — primary persona for this app:
- Opens Budget between meetings to adjust the "Dining" budget after an expensive week
- Has to scroll past Income, cadence, allocation bar, and all of Recurring bills to find "Dining" under "Wants"
- Taps the Dining chip, types $350, gets interrupted by a notification
- Returns to the app — field may have blurred and committed or not, depending on app lifecycle
- No visual indication of the current committed value vs what they typed
- Checks the allocation bar to verify, but at 10px it's hard to read the segment breakdown at a glance

**Jordan (Confused First-Timer)**:
- Sees the "Income" label and big number — understands this is their take-home pay
- Sees the colored bar with "72% of income allocated" — what does allocated mean?
- Reads legend: Needs, Wants, Savings, Free — needs prior knowledge to understand these map to a framework
- Taps a budget amount chip to edit it — works, but what should they set it to? No guidance, no suggested amounts, no explanation of the 50/30/20 rule visible from this view
- Scrolls to the very bottom, doesn't notice "Apply 50/30/20 template" link (12px, low contrast)
- Never discovers the auto-fill feature

---

### Minor Observations

- Bill amounts use `fontWeight: '500'` while budget amounts use `fontWeight: '600'` — both represent dollar amounts in identical list rows. Pick one weight for all monetary values in list context.
- The "~$X/month effective" note uses `~` to indicate approximation. Users may expect an exact figure; consider "≈$X/month" (≈ is the standard math approximation symbol) or simply "$X/month (effective)".
- The `summaryValue` at 15px sits slightly weak relative to the section header at 16px. Bumping to 17px would give the summary numbers more presence.
- The "Remaining" label in the summary strip could be "Left over" — slightly warmer framing for when the user is under-budget.
