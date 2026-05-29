---
target: add expense voice + manual screens
total_score: 22
p0_count: 0
p1_count: 1
timestamp: 2026-05-28T20-00-36Z
slug: src-components-voicesheet-tsx
---
# Critique: Add Expense (Voice + Manual)

Total: 22/40 (Acceptable, low end).

## Priority Issues
- [P1] Save has no confirmation, no undo, and $0 save is a silent dead tap (VoiceSheet.tsx:181). Disable button at <=0; add success haptic + confirmation + Undo. -> harden
- [P2] Voice->manual handoff discards transcript; parse (fuzzy amounts) cannot be verified (VoiceSheet.tsx:127-135). Keep "heard: ..." line in manual. -> clarify
- [P3] Mic auto-starts on open before intent (VoiceSheet.tsx:104); example prompts hidden in idle state; tab entry is a mic icon not a +. Open idle with examples; start on tap. -> onboard
- [P3] Decorative shimmer/blur DictationText on manual amount (VoiceSheet.tsx:373) - decorative motion + gradient-on-glyphs, breaks brand precision. Use static display token. -> quieter

## Anti-Patterns
One real slop tell: shimmering/blurring keypad-entered dollar amount via DictationText. Detector returned [] but is blind to RN/SwiftUI (not applicable, not passed).

## Persona Red Flags
- Casey: hot mic in quiet room; save vanishes with no ack.
- Jordan: mic icon not +; examples never seen; two identical segmented controls.
- Riley: "six fifty" -> $6.50 unverifiable; $0 save silent; denied permission strands on voice screen.

## Minor
- Two identical segmented controls, different jobs.
- Keypad left-to-right + decimal key vs cents-first convention.
- Inline fontSize on keypad violates Token Rule.
- No a11y labels on mic/keypad/cancel.
- No "save and add another".
