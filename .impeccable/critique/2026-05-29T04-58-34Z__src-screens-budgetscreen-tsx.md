---
target: budget screen
total_score: 23
p0_count: 0
p1_count: 2
p2_count: 3
timestamp: 2026-05-29T04-58-34Z
slug: src-screens-budgetscreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Budget saves silent; hero status labels clear; amount-field focus ring good |
| 2 | Match System / Real World | 3 | "Left to assign" / "Needs/Wants/Savings" natural; "Cadence" slightly technical |
| 3 | User Control and Freedom | 2 | Swipe-delete on categories is permanently destructive — no saveSnapshot, no undo toast |
| 4 | Consistency and Standards | 3 | Mostly cohesive; rowIcon 32px vs 36px spec; amountInput bypasses TYPE tokens |
| 5 | Error Prevention | 2 | No confirm before destructive swipe; no template preview before apply |
| 6 | Recognition Rather Than Recall | 2 | Swipe-to-delete and tap-to-edit both completely invisible affordances |
| 7 | Flexibility and Efficiency | 2 | Template quick-apply and copy-from-last-month solid; no bulk edit, no reorder |
| 8 | Aesthetic and Minimalist Design | 3 | Hero elegant and purposeful; dense with many categories |
| 9 | Error Recovery | 2 | Amount inline validation good; swipe-deleted categories unrecoverable |
| 10 | Help and Documentation | 1 | No contextual hints; template subtitles are only affordance for first-timers |
| **Total** | | **23/40** | **Acceptable** |

## Anti-Patterns Verdict

**AI slop verdict: Not AI-generated.** Wants-clay break from amber/gold, violet-tinted dark surfaces, zero-based "Left to assign" hero framing, AmountField rest/focus pattern — these are committed design decisions, not template defaults.

**Automated scan:** CLI detector returned no findings (React Native TSX doesn't trigger DOM-pattern rules).

**Code-level issues found:**
1. amountInput (line 1993-1996) hardcodes bodySm values inline — Token Rule violation
2. bodySmEm and captionEm both use fontWeight '500'; DESIGN.md specifies 600 for Em variants
3. Root dark background (line 903) uses #000 — should be #0F0B1C (canvas-deep)
4. rowIcon 32×32px; DESIGN.md specifies 36×36px for icon circles
5. removeSub calls categoriesRepo.delete() with no saveSnapshot() or showUndo() — undo infrastructure exists but isn't wired to category deletion

## Priority Issues

**[P1] Swipe-delete is permanently destructive**
removeSub (line 646) immediately calls categoriesRepo.delete() without saveSnapshot() or showUndo(). Template application has undo. Category deletion — the more consequential action — does not.
Fix: Wire removeSub and removeBill into the same undo snapshot mechanism as applyTemplate.

**[P1] All secondary interactions are invisible affordances**
Swipe-to-delete and tap-icon-to-edit leave no hint they exist. Users will never discover either.
Fix for swipe: Add trailing dots/chevron on rows. Fix for category tap: Add subtle chevron in dead space between icon and label.

**[P2] Pure black root background in dark mode**
Line 903: #000 in dark mode. DESIGN.md bans #000. Exposed on scroll-bounce overscroll.
Fix: Use #0F0B1C (canvas-deep) and #F5F4F8 (page-wash).

**[P2] AmountField inline font styles bypass TYPE tokens**
styles.amountInput hardcodes fontSize/fontWeight/letterSpacing matching TYPE.bodySm values.
Fix: Spread TYPE.bodySm, keep layout overrides only.

**[P2] No micro-moment at "Fully assigned"**
When remaining === 0, hero shows label change but no visual response. Missed moment.
Fix: Brief pulse on allocation bar track or savings-teal flash on the label (400ms, one pulse).

## Persona Red Flags

**Jordan (First-Timer):** Never discovers amounts are editable. Never swipes. Applies template but gets no "what now?" guidance. Template prompt reappears on every mount (useState resets).

**Casey (Distracted Mobile):** Swipes category by accident, it disappears instantly, no undo. Irreversible data loss on distracted mobile user.

**Marcus (Busy Professional):** Template prompt reappears every session even after dismissal — local state not persisted.
