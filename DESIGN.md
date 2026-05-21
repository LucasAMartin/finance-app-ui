---
name: Finance App
description: Personal spending tracker built on the 50/30/20 budget framework.
colors:
  verdigris-dot: "#7A9D85"
  verdigris-fill: "#D6E4D8"
  verdigris-ink: "#3F5A48"
  butter-dot: "#C5A946"
  sky-dot: "#7393B3"
  rose-dot: "#B47A6E"
  plum-dot: "#8975A8"
  page-wash: "#F7F8FA"
  canvas-deep: "#0B1020"
  pure-surface: "#FFFFFF"
  surface-midnight: "#141B2E"
  near-ink: "#0E0E10"
  hero-bg: "#3A2860"
  hero-text: "#EDE8F5"
  hero-sec: "rgba(237,232,245,0.60)"
  over-ember: "#D4522A"
  over-bg: "#F4E9E5"
  caution-amber: "#C5A946"
  needs-slate: "#5E82A8"
  wants-amber: "#C19A4B"
  savings-moss: "#6E9B82"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    letterSpacing: "-1.2px"
    lineHeight: 1
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.4px"
    lineHeight: 1.2
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.3px"
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    letterSpacing: "-0.2px"
    lineHeight: 1.4
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.5px"
    lineHeight: 1.2
rounded:
  pill: "100px"
  card: "24px"
  modal: "18px"
  field: "14px"
  chip: "10px"
  bar: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "28px"
components:
  tab-mic-btn:
    backgroundColor: "{colors.verdigris-fill}"
    textColor: "{colors.verdigris-ink}"
    rounded: "{rounded.pill}"
    size: "52px"
  icon-circle:
    backgroundColor: "{colors.needs-slate}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    size: "36px"
  save-btn:
    backgroundColor: "{colors.near-ink}"
    textColor: "{colors.page-wash}"
    rounded: "{rounded.field}"
    padding: "16px 20px"
  segmented-active:
    backgroundColor: "{colors.near-ink}"
    textColor: "{colors.page-wash}"
    rounded: "{rounded.pill}"
---

# Design System: Finance App

## 1. Overview

**Creative North Star: "The Clear-Eyed Ledger"**

A finance tool stripped to its essential transaction: you, your spending, and clear numbers. The interface makes no attempt to impress. Typography is the primary aesthetic vehicle; color enters only to encode state (over or under budget, category groups, or a chosen accent). The surface recedes so the data can speak.

The palette is built on near-ink neutrals with one runtime-switchable accent. The default accent is Still Verdigris — dusty, muted, slightly aged, like patinated copper. It appears in three tightly bounded roles and nowhere else. The 50/30/20 budget framework is given its own color vocabulary (slate for needs, amber for wants, moss for savings) that never overlaps with the accent system.

This system explicitly rejects gamification (badges, points, streaks), dark mode as an aesthetic default (dark mode here serves low-ambient-light reading, not style), and every finance-domain reflex: no navy and gold, no gradient metrics, no glowing dashboards. If something shouts or celebrates, it is wrong.

**Key Characteristics:**
- Single typeface (Inter) carrying all roles: 10px uppercase metadata through 32px budget display
- Hairline borders define surfaces at rest; shadows appear only on chrome that physically layers above content
- Six switchable accent keys (sage, butter, sky, rose, plum, ink) using fill, ink, and dot roles
- 50/30/20 groups encoded in a fixed three-color palette: slate (needs), amber (wants), moss (savings)
- Dark mode shifts the canvas to deep navy (#0B1020), not pure black, preserving a tinted warmth

## 2. Colors: The Still Verdigris Palette

A two-tier palette: a fixed neutral field that carries most of the screen, and a single accent that enters with restraint.

**The Verdigris Economy Rule.** The accent appears in three roles only: the hero budget zone background (verdigris-fill), interactive action labels and dots (verdigris-dot), and text on accent surfaces (verdigris-ink). It never appears as a row border, a chart color, or a decorative fill. Switching accents (to butter, sky, rose, plum, or ink) replaces all three roles simultaneously.

### Primary
- **Still Verdigris** (#7A9D85): The default accent dot. Used on period-selector text, "See all" action links, and active states. The color of a spring-fed pond at low light.
- **Verdigris Fill** (#D6E4D8): The accent background tint. Used as the hero budget card surface and the mic/add button on the tab bar.
- **Verdigris Ink** (#3F5A48): Accent text. Used for month labels, hero status labels, and text sitting on verdigris-fill surfaces.

### Secondary
- **Over Ember** (#D4522A): Over-budget alert. Applied to the amount, the label, and the rightmost gradient ticks on the budget bar when spending exceeds the limit. Never used for decoration.
- **Caution Amber** (#C5A946): Bills due within 7–14 days. Same hue family as the butter accent variant, but used purely for urgency encoding, not as an accent choice.

### Tertiary
- **Needs Slate** (#5E82A8): Icon circles and progress bars for the Needs spending group (groceries, transport, bills).
- **Wants Amber** (#C19A4B): Icon circles and progress bars for the Wants group (dining, shopping, entertainment).
- **Savings Moss** (#6E9B82): Icon circles and progress bars for the Savings group.

### Neutral
- **Page Wash** (#F7F8FA): Page background in light mode. Slightly cool, never pure white.
- **Pure Surface** (#FFFFFF): Card and sheet surfaces in light mode.
- **Canvas Deep** (#0B1020): Page background in dark mode. Deep navy, not black.
- **Surface Midnight** (#141B2E): Card surfaces in dark mode.
- **Near Ink** (#0E0E10): Primary text in light mode. The save button background.

### Hero
- **Hero Bg** (#3A2860): The home screen budget hero surface. Deep plum, invariant across theme modes and accent keys. All text tokens below are calibrated against this surface.
- **Hero Text** (#EDE8F5): Primary text and display amount on the hero — lavender-tinted near-white for warmth against the plum.
- **Hero Sec** (rgba(237,232,245,0.60)): Secondary labels and metadata on the hero (status sub-label, income strip labels).

### Named Rules
**The No-Chart-Accent Rule.** Charts, donut segments, and progress bars always use the group palette (slate, amber, moss) or category pastels. The accent color is forbidden in data visualization. The eye should read "needs/wants/savings" from a chart, not "the user picked sage."

## 3. Typography

**Font:** Inter (via @expo-google-fonts/inter, patched as the default Text font)
**Fallback:** system-ui, sans-serif

**Character:** A single sans-serif family used throughout with no decorative pairing. Hierarchy comes entirely from scale and weight contrast, not from multiple typefaces. The type is precise and undemonstrative, like printed figures on a statement.

### Hierarchy
- **Display** (700, 32px, tracking −1.2px, line-height 1): The available/over-budget figure on the home screen. Used exactly once per screen.
- **Headline** (700, 18px, tracking −0.4px, line-height 1.2): Section headers — Spending, Upcoming, Activity. The only 700-weight text below display size.
- **Title** (600, 15px, tracking −0.3px, line-height 1.3): Income strip values, input fields, transaction sheet amounts (secondary).
- **Body** (500–600, 14px, tracking −0.2px, line-height 1.4): Row titles, merchant names, field labels.
- **Label** (600, 10–12px, tracking +0.4–0.6px, uppercase, line-height 1.2): Uppercase metadata — group names (TODAY, YESTERDAY), strip labels (INCOME, BUDGET), period selectors. Tight tracking enforces the all-caps feel without needing a separate typeface.

### Named Rules
**The Silent Scale Rule.** Type size changes signal function. The 32px display belongs to one metric: the available or over-budget figure. The 18px headline belongs to section titles. Emphasis within a tier uses weight (500→700), not size. Two elements sharing the same size should differ in weight, color, or case — never both size and weight at once.

## 4. Elevation

Flat-first. Surfaces are distinguished by 1px hairline borders and tonal fill differences, not shadows. The default card variant uses `borderWidth: 1` with a hairline-opacity border and no shadow at rest.

Elevation enters only for chrome that physically layers above content:

### Shadow Vocabulary
- **Tab bar ambient** (`shadowOffset: {0, 10}, shadowOpacity: 0.08, shadowRadius: 20` — light mode): The floating navigation pill separates from the content below. iOS wraps this in a BlurView (intensity 80); Android uses rgba(255,255,255,0.95) solid fill.
- **Dropdown structured** (`shadowOffset: {0, 10}, shadowOpacity: 0.16, shadowRadius: 32`): The month-picker dropdown must be read as higher than the scroll container beneath it.
- **TxSheet** (native SwiftUI bottom sheet elevation): Platform-managed. Not represented in app shadow tokens.

### Named Rules
**The Flat Content Rule.** Transaction rows, category group lists, budget progress bars, and any data surface are always flat at rest. No data surface ever casts a shadow. If a surface can be scrolled past, it cannot cast a shadow.

## 5. Components

### Tab Bar (Signature Component)
Floating pill anchored above the safe-area bottom. Full-radius capsule (borderRadius: 100) with a 1px hairline border. On iOS: BlurView backdrop (intensity 80, adaptive tint). On Android: solid rgba equivalent.

- **Tab buttons:** 52×52px circles, icon-only, 22px icon at stroke 1.7 (inactive) / 2.4 (active). Active icon is near-ink; inactive is textSec.
- **Mic/add button:** Separated by a 1px hairline divider. Background: verdigris-fill. Icon: verdigris-ink. Shape matches the tab buttons (52px circle).

### Segmented Control
Pill container (chipBg fill, radius 100, 3px padding) with a width-measuring animated sliding indicator. Indicator background: near-ink. Active label: bg color. Inactive label: textSec, weight 500. Easing: spring (tension 220, friction 22).

### Icon Circles
36×36px circles used in transaction rows, bill rows, and as category icons on the transaction sheet. Background color is determined by spending group: slate (needs), amber (wants), moss (savings). Icon: white (#fff), 16px at stroke 1.6. The circle is always perfectly round — radius never deviates from 18px.

### Category Progress Bars
Two sizes: 10px height with radius 5 at group level; 5px height with radius 3 at sub-category level. Background: hairline color. Fill: group color, or over-ember when over budget. No animation on mount; state changes instantly.

### Month Picker Dropdown
borderRadius: 18, borderWidth: 1 (hairline), shadow: 0 10px 32px opacity 0.16. Contains a search row (Icon + TextInput, borderBottom hairline) and a scrollable month list. Each row includes a 38px MonthDonut (SVG progress ring) and the month label.

### Transaction Sheet (TxSheet)
Native SwiftUI BottomSheet with two detents: 0.48 fraction (summary) and large (edit form). Summary state centers a 52px category icon circle (pastel rgba tint), merchant name at 20px/700, and the amount at 40px/700. Edit state slides in with a 250ms ease-out animation.

### Save Button
Full-width single-action button. backgroundColor: near-ink. textColor: page-wash. borderRadius: 16px. paddingVertical: 16px. font: 15px/700. The only full-bleed button in the system.

### Fields (Edit Form)
Grouped inside a chipBg-background container with radius 14. Each row: paddingVertical 13, paddingHorizontal 16, separated by hairline borders. Labels: 14px/500/textSec. Inputs: 15px/500/text, right-aligned.

## 6. Do's and Don'ts

### Do:
- **Do** use 1px hairline borders (`rgba(14,14,16,0.10)` light / `rgba(173,189,222,0.14)` dark) to define surfaces at rest. Let fills carry the rest of the depth.
- **Do** encode the three budget groups with their fixed colors: slate for needs, amber for wants, moss for savings. Every icon circle, progress bar, and group label uses these.
- **Do** reserve the accent color (verdigris-dot, fill, ink) for the hero zone, action links, and the mic button — and only those three roles.
- **Do** use over-ember (#D4522A) consistently for all over-budget signals: the amount, the label, and the tick bar gradient.
- **Do** let Inter carry the full visual hierarchy without introducing a second typeface.
- **Do** treat the 32px display as singular: exactly one per screen, for the primary budget figure.
- **Do** apply the flat-first rule: data surfaces never cast shadows at rest.

### Don't:
- **Don't** add gamification: no badges, achievement notifications, points, streaks, or celebratory animations. Finance is serious; these patterns trivialize money. (From PRODUCT.md.)
- **Don't** use navy and gold, neon on black, or any other finance-domain reflex palette. The first-order category reflex is explicitly rejected here.
- **Don't** use gradient text (`background-clip: text`). Decorative, never meaningful.
- **Don't** add side-stripe borders (border-left or border-right over 1px) to rows, cards, or callouts. Use a background tint, a leading icon, or nothing.
- **Don't** apply glassmorphism decoratively. The tab bar's BlurView is structural (it visually separates chrome from content); blur used as card decoration is banned.
- **Don't** use the accent color in charts or data visualization. Charts read spending groups, not accent preference.
- **Don't** shadow data rows, category cards, or list items. If it can be scrolled past, it stays flat.
- **Don't** build complex navigation hierarchies or hide features behind nested menus. Busy professionals need clarity at a glance, not exploration. (From PRODUCT.md.)
