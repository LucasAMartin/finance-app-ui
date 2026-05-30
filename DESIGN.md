---
name: Finance App
description: Personal spending tracker built on the 50/30/20 budget framework.
colors:
  violet-dot: "#7B5CE0"
  violet-fill: "#EBE7FF"
  violet-ink: "#3D28A0"
  butter-dot: "#C5A946"
  sky-dot: "#7393B3"
  rose-dot: "#B47A6E"
  page-wash: "#F5F4F8"
  canvas-deep: "#0F0B1C"
  pure-surface: "#FFFFFF"
  surface-midnight: "#1A1530"
  near-ink: "#0E0C18"
  hero-bg: "#1E1050"
  hero-text: "#EDE9FF"
  hero-sec: "rgba(237,233,255,0.55)"
  hero-avail: "#5CC4BA"
  over-ember: "#D4522A"
  over-bg: "#F4E9E5"
  caution-amber: "#C5A946"
  needs-blue: "#5B7FBB"
  wants-clay: "#B86C60"
  savings-teal: "#4AA8A0"
typography:
  fontFamily: "SF Pro (System on iOS), sans-serif (Android)"
  displayXl:
    fontSize: "48px"
    fontWeight: 700
    letterSpacing: "-2.0px"
    lineHeight: "52px"
  display:
    fontSize: "32px"
    fontWeight: 700
    letterSpacing: "-1.2px"
    lineHeight: "36px"
  headline:
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.5px"
    lineHeight: "26px"
  pageTitle:
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "-0.4px"
    lineHeight: "22px"
  sectionTitle:
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.4px"
    lineHeight: "22px"
  subsectionTitle:
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.3px"
    lineHeight: "20px"
  body:
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "-0.2px"
    lineHeight: "19px"
  bodySm:
    fontSize: "13px"
    fontWeight: 500
    letterSpacing: "-0.2px"
    lineHeight: "18px"
  caption:
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "-0.1px"
    lineHeight: "16px"
  labelLg:
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.5px"
    lineHeight: "14px"
    textTransform: "uppercase"
  label:
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.6px"
    lineHeight: "13px"
    textTransform: "uppercase"
  labelSm:
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: "0.9px"
    lineHeight: "12px"
    textTransform: "uppercase"
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
    backgroundColor: "{colors.violet-fill}"
    textColor: "{colors.violet-ink}"
    rounded: "{rounded.pill}"
    size: "52px"
  icon-circle:
    backgroundColor: "{colors.needs-blue}"
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

**Creative North Star: "Still Violet"**

A finance tool stripped to its essential transaction: you, your spending, and clear numbers. The interface makes no attempt to impress. Typography is the primary aesthetic vehicle; color enters only to encode state (over or under budget, category groups, or a chosen accent). The surface recedes so the data can speak.

The palette is unified around a single hue family: deep violet. The hero zone is rich indigo-plum (#1E1050). The default accent is Still Violet — a vivid but measured purple that appears on buttons, action links, and the mic tab button, and nowhere else. The 50/30/20 budget framework uses its own three-color vocabulary (blue for needs, clay for wants, teal for savings) that never overlaps with the accent. The shopping category pastel echoes the violet brand hue, tying data visualization back to the brand identity.

This system explicitly rejects gamification (badges, points, streaks), dark mode as an aesthetic default (dark mode here serves low-ambient-light reading, not style), and every finance-domain reflex: no navy and gold, no golden amber, no gradient metrics, no glowing dashboards. The "wants = amber/gold" reflex is specifically rejected — wants group uses warm clay instead. If something shouts or celebrates, it is wrong.

**Key Characteristics:**
- Single typeface (SF Pro on iOS, system sans elsewhere) carrying all roles: 9px uppercase metadata through 48px display amount
- Hairline borders define surfaces at rest; shadows appear only on chrome that physically layers above content
- Seven switchable accent keys (sage, butter, sky, rose, plum, ink, wine) — plum is the brand default
- 50/30/20 groups encoded in a fixed three-color palette: blue (needs), clay (wants), teal (savings)
- Dark mode shifts the canvas to deep violet-black (#0F0B1C); the hero deepens to #1E1050; all surfaces carry a slight violet cast
- Surfaces, separators, and text in dark mode are violet-tinted rather than neutral gray, creating a unified depth

## 2. Colors: The Still Violet Palette

A two-tier palette: a fixed neutral-violet field that carries most of the screen, and a single vivid accent that enters in bounded roles.

**The Violet Economy Rule.** The accent appears in three roles only: the mic/add button background (violet-fill), interactive action labels and dots (violet-dot), and text on accent surfaces (violet-ink). It never appears as a row border, a chart color, or a decorative fill. Switching accents replaces all three roles simultaneously.

### Primary
- **Still Violet** (#7B5CE0 light / #A08AEA dark): The brand accent dot. Used on "See all" action links, the mic button icon, and active interactive states. A vivid medium-chroma violet — present without dominating.
- **Violet Fill** (#EBE7FF light / #1C1444 dark): The accent background tint. Used as the mic/add button background on the tab bar and as accent chip backgrounds.
- **Violet Ink** (#3D28A0 light / #B09AE8 dark): Accent text. Used for labels and text sitting on violet-fill surfaces.

### Secondary
- **Over Ember** (#D4522A): Over-budget alert. Applied to the amount, the label, and the budget bar fill when spending exceeds the limit. Never used for decoration.
- **Caution Amber** (#C5A946): Bills due within 7–14 days. A semantic urgency signal; not a brand accent.
- **Hero Available** (#5CC4BA): The "Available" status label and budget bar fill on the hero when spending is healthy. Teal reads as growth and calm against the deep violet hero background, intentional contrast.

### Tertiary
- **Needs Blue** (#5B7FBB light / #7A9ED8 dark): Icon circles and progress bars for the Needs spending group (groceries, transport, bills). Cool blue signals essential, structural.
- **Wants Clay** (#B86C60 light / #D08878 dark): Icon circles and progress bars for the Wants group (dining, shopping, entertainment). Warm terracotta signals discretionary, tactile. Explicitly not gold or amber — breaks the finance reflex.
- **Savings Teal** (#4AA8A0 light / #5CC4BA dark): Icon circles and progress bars for the Savings group. Teal signals forward-looking, growing.

### Neutral
- **Page Wash** (#F5F4F8): Page background in light mode. Barely violet-tinted — a whisper of the brand hue in the surface itself.
- **Pure Surface** (#FFFFFF): Card and sheet surfaces in light mode.
- **Canvas Deep** (#0F0B1C): Page background in dark mode. Deep violet-black, not navy, not gray.
- **Surface Midnight** (#1A1530): Card surfaces in dark mode. Violet-tinted dark.
- **Near Ink** (#0E0C18): Primary text in light mode. Slightly violet-tinted.

### Hero
- **Hero Bg** (#1E1050): The home screen budget hero surface. Deep indigo-violet, richer and more saturated than the page background, invariant across theme modes. All text tokens calibrated against this surface.
- **Hero Text** (#EDE9FF): Primary text and display amount on the hero — violet-tinted near-white.
- **Hero Sec** (rgba(237,233,255,0.55)): Secondary labels and metadata on the hero (status sub-label, income strip labels).

### Category Pastels
Muted fills used in chart segments and icon backgrounds. Note that **shopping** carries a violet pastel — the only category that intentionally echoes the brand hue, reinforcing identity inside data.
- Groceries: #8EC49A / #76B888
- Dining: #D4A48A / #C89070
- Transport: #8AAACE / #7AAAD4
- Shopping: #B09AE0 / #A08CD4 (violet — brand echo)
- Bills: #88BEB8 / #78B0AA
- Entertainment: #C498B4 / #BC88A8

### Named Rules
**The No-Chart-Accent Rule.** Charts, donut segments, and progress bars always use the group palette (blue, clay, teal) or category pastels. The accent violet is forbidden in data visualization. The eye should read "needs/wants/savings" from a chart, not "the user picked plum." Exception: shopping pastel carries a violet cast as an intentional brand echo, not as accent reuse.

## 3. Typography

**Font:** SF Pro — Apple's system typeface — applied via React Native's `'System'` family on iOS. The OS automatically swaps SF Pro Text (<20pt) and SF Pro Display (≥20pt) for the right optical variant at every size. No font is bundled.
**Fallback:** `sans-serif` (Roboto) on Android, system-ui on web.

**Character:** A single sans-serif family used throughout with no decorative pairing. Hierarchy comes entirely from scale and weight contrast, not from multiple typefaces. SF Pro is precise and undemonstrative, like printed figures on a statement — exactly what the brand demands.

All tokens are defined once in `src/typography.ts` and applied via `import { TYPE } from '../typography'`. Same role, same token, every screen. Color is never bundled into a token — apply with `[TYPE.body, { color: theme.text }]`.

### Hierarchy
- **displayXl** (700, 48px, tracking −2.0px, lh 52): The primary spending figure on the Insights screen. One per surface.
- **display** (700, 32px, tracking −1.2px, lh 36): The available / over-budget figure on the Home hero. One per surface.
- **headline** (700, 20px, tracking −0.5px, lh 26): Editable income amount on the Budget screen.
- **pageTitle** (700, 17px, tracking −0.4px, lh 22): Screen header titles — "History", "Insights", "Budget".
- **sectionTitle** (700, 18px, tracking −0.4px, lh 22): Primary section heads on Home — "Spending", "Upcoming", "Activity".
- **subsectionTitle** (700, 15px, tracking −0.3px, lh 20): Secondary section heads — "Recurring bills", "Needs / Wants / Savings", legend values.
- **body** (600, 14px, tracking −0.2px, lh 19): Row titles, merchant names, field labels, primary list text.
- **bodySm** (500, 13px, tracking −0.2px, lh 18): Amounts in rows, dense data, calendar action rows, sheet picker cells. `bodySmEm` (600) for emphasis.
- **caption** (500, 12px, tracking −0.1px, lh 16): Sub-row metadata, time stamps, filter pill text. `captionEm` (600) for emphasis.
- **labelLg** (600, 11px, tracking +0.5px, uppercase, lh 14): Status labels, strip headers, group headers — INCOME, BUDGET, TODAY, NEEDS.
- **label** (600, 10px, tracking +0.6px, uppercase, lh 13): Smaller strip labels — INCOME on the hero, eyebrow tags.
- **labelSm** (700, 9px, tracking +0.9px, uppercase, lh 12): Micro labels — UPCOMING pill, "FROM"/"TO" range markers, sheet group separators.

### Named Rules
**The Silent Scale Rule.** Type size changes signal function. The 48px display belongs to one metric (the Insights total); the 32px display belongs to one metric (the Home available figure). The 17px page title belongs to screen chrome; the 18px section title belongs to section anchors on Home. Emphasis within a tier uses weight (500→700), not size. Two elements sharing the same size should differ in weight, color, or case — never both size and weight at once.

**The Token Rule.** No screen sets `fontSize` inline as part of a typographic role — every typographic style routes through `TYPE`. Off-scale overrides (e.g. 16px on a group total) are permitted only as a deliberate spread on top of a base token, never as fresh inline declarations.

## 4. Elevation

**Two surface modes coexist.** Flat-first is the default; the media wallpaper treatment is the current direction for the primary content screens.

- **Flat surfaces** (default): distinguished by 1px hairline borders and tonal fill differences, not shadows. The default card variant uses `borderWidth: 1` with a hairline-opacity border and no shadow at rest. Used for sheets, forms, and any surface sitting on a solid page background.
- **Media wallpaper surfaces** (Home, Spending, History, Budget): these screens render over a full-bleed photographic `ImageBackground` with a `LinearGradient` scrim. Content sits in **frosted cards** — `BlurView` (intensity 70 dark / 100 light, `systemMaterial` tint) wrapped in a 1px hairline border (`SectionCard`). Here the blur is **structural, not decorative**: it is what makes content legible against the wallpaper and what separates a card from the photograph behind it. Text colors come from the `MEDIA` / wallpaper palette, not the flat-surface tokens.

Elevation (shadow) enters only for chrome that physically layers above content:

### Shadow Vocabulary
- **Tab bar ambient** (`shadowOffset: {0, 10}, shadowOpacity: 0.08, shadowRadius: 20` — light mode): The floating navigation pill separates from the content below. iOS wraps this in a BlurView (intensity 80); Android uses rgba(255,255,255,0.95) solid fill.
- **Dropdown structured** (`shadowOffset: {0, 10}, shadowOpacity: 0.16, shadowRadius: 32`): The month-picker dropdown must be read as higher than the scroll container beneath it.
- **TxSheet** (native SwiftUI bottom sheet elevation): Platform-managed. Not represented in app shadow tokens.

### Named Rules
**The Flat Content Rule.** Data *contents* — transaction rows, category group lists, budget progress bars — are always flat at rest and never cast a shadow. On flat screens they sit on the solid surface; on media wallpaper screens they sit inside a frosted `SectionCard`. The frosted card itself is a structural container against the wallpaper, not a shadowed elevation: if a surface can be scrolled past, it still casts no shadow. Shadows remain reserved for floating chrome (tab bar, dropdowns).

## 5. Components

### Tab Bar (Signature Component)
Floating pill anchored above the safe-area bottom. Full-radius capsule (borderRadius: 100) with a 1px hairline border. On iOS: BlurView backdrop (intensity 80, adaptive tint). On Android: solid rgba equivalent.

- **Tab buttons:** 52×52px circles, icon-only, 22px icon at stroke 1.7 (inactive) / 2.4 (active). Active icon is near-ink; inactive is textSec.
- **Mic/add button:** Separated by a 1px hairline divider. Background: violet-fill. Icon: violet-ink. Shape matches the tab buttons (52px circle).

### Segmented Control
Pill container (chipBg fill, radius 100, 3px padding) with a width-measuring animated sliding indicator. Indicator background: near-ink. Active label: bg color. Inactive label: textSec, weight 500. Easing: spring (tension 220, friction 22).

### Icon Circles
36×36px circles used in transaction rows, bill rows, and as category icons on the transaction sheet. Background color is determined by spending group: blue (needs), clay (wants), teal (savings). Icon: white (#fff), 16px at stroke 1.6. The circle is always perfectly round — radius never deviates from 18px.

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
- **Do** use 1px hairline borders (`rgba(14,12,24,0.10)` light / `rgba(180,160,240,0.14)` dark) to define surfaces at rest. The dark hairline carries a violet tint — use these exact values.
- **Do** encode the three budget groups with their fixed colors: blue for needs, clay for wants, teal for savings. Every icon circle, progress bar, and group label uses these.
- **Do** reserve the accent color (violet-dot, fill, ink) for action links, the mic button, and interactive indicators — and only those roles.
- **Do** use over-ember (#D4522A) consistently for all over-budget signals: the amount, the label, and the budget bar fill.
- **Do** use hero-avail (#5CC4BA) for the "Available" status and healthy budget bar on the hero — teal reads as growth against the deep violet hero.
- **Do** let SF Pro (the system typeface) carry the full visual hierarchy without introducing a second typeface.
- **Do** treat the 32px display as singular: exactly one per screen, for the primary budget figure.
- **Do** apply the flat-first rule: data surfaces never cast shadows at rest.
- **Do** tint dark mode surfaces with violet: bg #0F0B1C, surface #1A1530, surface2 #221D3C — not neutral gray.

### Don't:
- **Don't** add gamification: no badges, achievement notifications, points, streaks, or celebratory animations. Finance is serious; these patterns trivialize money. (From PRODUCT.md.)
- **Don't** use navy and gold, golden amber for the wants group, neon on black, or any other finance-domain reflex palette. The wants-clay color exists specifically to break the amber/gold reflex.
- **Don't** use gradient text (`background-clip: text`). Decorative, never meaningful.
- **Don't** add side-stripe borders (border-left or border-right over 1px) to rows, cards, or callouts. Use a background tint, a leading icon, or nothing.
- **Don't** apply glassmorphism decoratively on flat-surface screens. Blur is legitimate in exactly two roles: the tab bar's BlurView (chrome separating from content) and the frosted `SectionCard` on media wallpaper screens (structural legibility against a photographic background). Blur used as ornament anywhere else is banned.
- **Don't** use the accent violet in charts or data visualization. Charts read spending groups, not accent preference. (Exception: shopping pastel is violet-adjacent by design.)
- **Don't** shadow data rows, category cards, or list items. If it can be scrolled past, it stays flat.
- **Don't** build complex navigation hierarchies or hide features behind nested menus. Busy professionals need clarity at a glance, not exploration. (From PRODUCT.md.)
