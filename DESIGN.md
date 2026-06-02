---
name: Finance App
description: Personal spending tracker built on the 50/30/20 budget framework.
sourceOfTruth:
  color: "src/theme.ts (+ src/wallpaperPalette.ts for on-wallpaper surfaces)"
  typography: "src/typography.ts → TYPE"
  spacing: "src/spacing.ts → SPACE / LAYOUT"
  radius: "src/radius.ts → RADIUS"
colors:
  # Accent — single monochrome ink (high-contrast, flips per mode).
  accent-fill: "#0E1116 light / #E7EAED dark"
  accent-ink: "#F2F4F5 light / #080A0D dark"
  accent-dot: "#0E1116 light / #E7EAED dark"
  # Neutral field (cool gray — no longer violet-tinted)
  bg: "#F4F5F6 light / #080A0D dark"
  surface: "#FAFBFC light / #101215 dark"
  surface2: "#EEF0F2 light / #1C1F24 dark"
  text: "#0B0D10 light / #F2F4F5 dark"
  # State
  over-ember: "#D4522A"
  over-bg: "#F4E9E5 light / #2A1612 dark"
  caution-amber: "#C5A946"
  hero-avail: "#5CC4BA"
  # 50/30/20 groups
  needs-blue: "#4E8FDB"
  wants-clay: "#D76F5F"
  savings-teal: "#48B8A4"
  # On-wallpaper (frosted-glass screens)
  media-text: "#F2F4F5"
  media-text-sec: "rgba(242,244,245,0.72)"
  media-hairline: "rgba(235,239,242,0.18)"
typography:
  fontFamily: "SF Pro (System on iOS), sans-serif (Android)"
  # Weights tuned to a native SwiftUI feel: most text sits at Regular/Medium,
  # Semibold (600) reserved for true emphasis. Color is never baked into a token.
  displayXl:       { fontSize: 48, fontWeight: 600, letterSpacing: -2.0, lineHeight: 52 }
  display:         { fontSize: 32, fontWeight: 600, letterSpacing: -1.2, lineHeight: 36 }
  headline:        { fontSize: 20, fontWeight: 600, letterSpacing: -0.5, lineHeight: 26 }
  pageTitle:       { fontSize: 17, fontWeight: 600, letterSpacing: -0.4, lineHeight: 22 }
  sectionTitle:    { fontSize: 18, fontWeight: 600, letterSpacing: -0.4, lineHeight: 22 }
  subsectionTitle: { fontSize: 15, fontWeight: 600, letterSpacing: -0.3, lineHeight: 20 }
  body:            { fontSize: 14, fontWeight: 500, letterSpacing: -0.2, lineHeight: 19 }
  bodyRegular:     { fontSize: 14, fontWeight: 400, letterSpacing: -0.2, lineHeight: 19 }
  bodySm:          { fontSize: 13, fontWeight: 400, letterSpacing: -0.2, lineHeight: 18 }
  bodySmEm:        { fontSize: 13, fontWeight: 500, letterSpacing: -0.2, lineHeight: 18 }
  caption:         { fontSize: 12, fontWeight: 400, letterSpacing: -0.1, lineHeight: 16 }
  captionEm:       { fontSize: 12, fontWeight: 500, letterSpacing: -0.1, lineHeight: 16 }
  labelLg:         { fontSize: 11, fontWeight: 500, letterSpacing: 0.5, lineHeight: 14, textTransform: uppercase }
  label:           { fontSize: 10, fontWeight: 500, letterSpacing: 0.6, lineHeight: 13, textTransform: uppercase }
  labelSm:         { fontSize: 9,  fontWeight: 600, letterSpacing: 0.9, lineHeight: 12, textTransform: uppercase }
  labelPlain:      { fontSize: 10, fontWeight: 500, letterSpacing: 0, lineHeight: 13 }
  labelSmPlain:    { fontSize: 9,  fontWeight: 600, letterSpacing: 0, lineHeight: 12 }
  txDateLabel:     { fontSize: 13, fontWeight: 500, letterSpacing: 0, lineHeight: 18 }
  # On-media — text on the wallpaper / BlurView surfaces, scaled to match the
  # adjacent native SwiftUI controls.
  onMediaStatus:    { fontSize: 15, fontWeight: 600, letterSpacing: -0.2, lineHeight: 20 }
  onMediaStatusSub: { fontSize: 15, fontWeight: 400, letterSpacing: -0.2, lineHeight: 20 }
  onMediaAmount:    { fontSize: 44, fontWeight: 700, letterSpacing: -1.4, lineHeight: 48 }
  onMediaQa:        { fontSize: 12, fontWeight: 600, letterSpacing: -0.1, lineHeight: 16 }
rounded:   # src/radius.ts → RADIUS
  bar: 4
  chip: 10
  field: 14
  button: 16
  modal: 18
  card: 24
  full: 100   # pills / capsules; circles use width/2
spacing:   # src/spacing.ts → SPACE (strict 4pt grid; px2=2 for optical nudges only)
  xs: 4
  sm: 8
  md: 12
  lg: 16
  xl: 20
  xxl: 24
  xxxl: 32
layout:    # src/spacing.ts → LAYOUT (semantic roles)
  screenGutter: 16
  cardPadX: 20
  cardPadTop: 20
  cardPadBottom: 12
  sectionGap: 24
  rowPadY: 12
components:
  screen-exit-btn:
    material: "Liquid Glass circle (iOS 26+), JS fallback below"
    placement: "top-left (float: top 16 / left 20)"
    size: "36px"
    icon: "chevron.left (back / pushed screens) | xmark (close / sheets)"
  section-card:
    material: "BlurView intensity 70 dark / 100 light, systemMaterial tint"
    border: "1px hairline"
    rounded: "{rounded.card}"
  save-btn:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    padding: "16px 20px"
  segmented-active:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.full}"
  icon-circle:
    backgroundColor: "group color (needs-blue | wants-clay | savings-teal)"
    textColor: "#ffffff"
    rounded: "full (width/2)"
    size: "36px"
---

# Design System: Finance App

> **Token sources of truth.** Color lives in `src/theme.ts` (and
> `src/wallpaperPalette.ts` for on-wallpaper surfaces); typography in
> `src/typography.ts` (`TYPE`); spacing in `src/spacing.ts` (`SPACE` / `LAYOUT`);
> radius in `src/radius.ts` (`RADIUS`). This document describes intent; the code
> is authoritative. When they disagree, fix the doc.

## 1. Overview

**Creative North Star: "Quiet Glass"**

A finance tool stripped to its essential transaction: you, your spending, and clear numbers. The interface makes no attempt to impress. Typography is the primary aesthetic vehicle; color enters only to encode state (over or under budget, the three budget groups, or a selected accent). The surface recedes so the data can speak.

The identity rests on two materials. **Type is monochrome ink** — a single near-black/near-white voice that carries the entire hierarchy, with no brand hue competing for attention. **Surfaces are frosted glass over a soft photographic wallpaper** — content rides in `BlurView` cards above a full-bleed image, the system's "Liquid Glass" material made structural. Color is rationed: the 50/30/20 framework owns a fixed three-color vocabulary (blue for needs, clay for wants, teal for savings), a small set of state colors signals over-budget and caution, and everything else is neutral.

This system explicitly rejects gamification (badges, points, streaks), dark mode as an aesthetic default (dark mode here serves low-ambient-light reading, not style), and every finance-domain reflex: no navy and gold, no golden amber, no gradient metrics, no glowing dashboards. The "wants = amber/gold" reflex is specifically rejected — the wants group uses warm clay instead. If something shouts or celebrates, it is wrong.

**Key Characteristics:**
- Single typeface (SF Pro on iOS, system sans elsewhere) carrying all roles: 9px uppercase metadata through 48px display amount. Weights tuned low — most text is Regular/Medium, Semibold reserved for real emphasis.
- Frosted-glass cards over a photographic wallpaper are the signature resting surface; flat solid surfaces are the secondary mode (sheets, forms).
- A **single monochrome accent**: high-contrast ink (near-black on light, near-white on dark), used for primary actions, selected states, and action links. There is one accent (`ink`) by design — the legacy multi-hue keys were removed.
- Neutral, cool-gray field — surfaces and text are neutral, **not** tinted toward any hue.
- 50/30/20 groups encoded in a fixed three-color palette: blue (needs), clay (wants), teal (savings).
- Dismiss controls are standardized: a top-left Liquid Glass circle, chevron on pushed screens / X on sheets (`ScreenExitButton`).

## 2. Color

Color is organized in three layers: a **neutral field** that carries most of every screen, a **monochrome accent** that marks action and selection, and a small set of **semantic colors** for budget state and the three spending groups. On wallpaper screens a separate **on-media palette** replaces the flat tokens.

All flat-surface color comes from the `Theme` object (`makeTheme` in `src/theme.ts`) via the `theme` prop. No component hardcodes a hex for a themed role.

### Accent (monochrome ink)
The accent is a high-contrast ink, resolved per mode by `makeTheme`:
- **accent.fill** — `#0E1116` light / `#E7EAED` dark. Primary button fills, segmented-control active indicator, selected chips.
- **accent.ink** — `#F2F4F5` light / `#080A0D` dark. Text/icon sitting on an accent.fill surface.
- **accent.dot** — `#0E1116` light / `#E7EAED` dark. Action links ("See all"), active dots, interactive indicators.

> The accent is a single key (`ink`). Earlier multi-hue keys (sage/butter/sky/rose/plum/wine) were legacy and had silently collapsed to identical values; they've been removed. `makeTheme` falls back to ink for any stale `accent_key` still in a user's settings.

### Neutral field
- **bg** — `#F4F5F6` / `#080A0D`. Page background (the "floor" beneath the wallpaper).
- **surface** — `#FAFBFC` / `#101215`. Flat card and sheet surfaces.
- **surface2** — `#EEF0F2` / `#1C1F24`. Recessed fills, secondary surfaces.
- **text / textSec / textTer** — `#0B0D10` / `#F2F4F5`, then 62%/36% (light) and 66%/42% (dark) opacity. Primary, secondary, tertiary text.
- **sep / hairline / chipBg** — low-opacity neutral ink/white for separators, 1px borders, and chip backgrounds.

### Semantic — state
- **Over Ember** (`#D4522A`, dark text `#F09272`): over-budget. Applied to the amount, the label, and the budget-bar fill when spending exceeds the limit. Never decorative. (`OVER_DOT` / `overBg` / `overText`.)
- **Caution Amber** (`#C5A946`, dark `#CCA838`): bills due soon / off-target spending. A semantic urgency signal, not a brand accent. (`CAUTION_AMBER` / `cautionBg` / `cautionText`.)
- **Hero Available** (`#5CC4BA`): the "Available" status and healthy budget-bar fill on the home hero. Teal reads as calm growth. (`HERO_AVAIL`.)

### Semantic — 50/30/20 groups (`GROUP_COLORS`)
- **Needs Blue** (`#4E8FDB`): groceries, transport, bills, housing. Cool blue — essential, structural.
- **Wants Clay** (`#D76F5F`): dining, shopping, entertainment. Warm terracotta — discretionary, tactile. Explicitly not gold/amber.
- **Savings Teal** (`#48B8A4`): emergency-fund, retirement. Forward-looking, growing.

Group for a category resolves via `CAT_TO_GROUP`; color via `catGroupColor(cat, dark)` / `categoryGroupColor(...)`. Add new categories to `CAT_TO_GROUP` so their color follows automatically.

### Category pastels (`CAT_PASTEL`, light / dark)
Muted fills for chart segments and icon backgrounds, via `catPastel(cat, dark)`:
- Groceries `#79B7A8` / `#48B8A4`
- Dining `#D68A7F` / `#D76F5F`
- Transport `#79A8D8` / `#4E8FDB`
- Shopping `#C3877C` / `#D76F5F`
- Bills `#6F9CCF` / `#4E8FDB`
- Entertainment `#C58A82` / `#D76F5F`

### On-media palette (wallpaper screens, `src/wallpaperPalette.ts`)
Text and lines on the wallpaper/scrim use `MEDIA` and the `makeP(dark)` palette, **not** the flat theme tokens:
- `makeP(true)` (on-wallpaper): always white — `text #F2F4F5`, `textSec` 72%, `textTer` 52%. For the header, hero, and labels sitting directly on the image/scrim.
- `makeP(theme.dark)` (card interior): flips to near-ink in light mode so dark text reads on the light frosted glass.
- `makeScrim(dark)` returns the four-stop `LinearGradient` that holds card contrast over the photo; `deriveFloor(...)` bends a wallpaper's representative color into the solid scroll "floor."

### Named Rules
**The No-Chart-Accent Rule.** Charts, donut segments, and progress bars use the group palette (blue/clay/teal) or category pastels — never the ink accent. The eye should read "needs/wants/savings" from a chart, not "an action color."

**The Rationed Color Rule.** Outside charts, color must encode meaning: accent = action/selection, ember = over budget, amber = caution, teal = available, group colors = the 50/30/20 framework. Everything else is neutral. A color with no meaning is wrong.

## 3. Typography

**Font:** SF Pro — Apple's system typeface — via React Native's `'System'` family on iOS. The OS auto-swaps SF Pro Text (<20pt) and SF Pro Display (≥20pt) for the right optical variant at every size. No font is bundled. **Fallback:** `sans-serif` (Roboto) on Android, system-ui on web.

**Character:** one sans-serif family throughout, no decorative pairing. Hierarchy comes from scale and weight contrast. Weights are tuned to a native SwiftUI feel — most text sits at Regular (400) / Medium (500), with Semibold (600) reserved for true emphasis; the old all-Semibold setting has been dialed back.

All tokens live in `src/typography.ts` and apply via `import { TYPE } from '../typography'` as `[TYPE.body, { color: theme.text }]`. **Color is never bundled into a token.**

### Hierarchy
- **displayXl** (600, 48): the single full-screen figure on the insight detail screen. One per surface.
- **display** (600, 32): the available / over-budget figure on the Home hero, and the Spent figure on the Insights bento hero tile. One per surface.
- **headline** (600, 20): editable income amount on Budget.
- **pageTitle** (600, 17): screen header titles — "History", "Insights", "Budget".
- **sectionTitle** (600, 18): primary section heads on Home — "Spending", "Upcoming", "Activity".
- **subsectionTitle** (600, 15): secondary section heads, legend values.
- **body / bodyRegular** (500 / 400, 14): row titles, merchant names, primary list text. Use `body` (Medium) for labels that anchor a row, `bodyRegular` for running text.
- **bodySm / bodySmEm** (400 / 500, 13): amounts in rows, dense data, picker cells.
- **caption / captionEm** (400 / 500, 12): sub-row metadata, timestamps, filter-pill text.
- **labelLg / label / labelSm** (500 / 500 / 600; 11 / 10 / 9; uppercase): eyebrows and group headers — INCOME, BUDGET, TODAY, NEEDS.
- **labelPlain / labelSmPlain**: same size/weight as label/labelSm but **without** uppercase or tracking — for sentence-case badges, pills, calendar headers.
- **txDateLabel** (500, 13): transaction date-group headers — "Today", "Yesterday", "Mon 12 May".
- **onMediaStatus / onMediaStatusSub / onMediaAmount / onMediaQa**: text on the wallpaper/glass, sized to sit alongside native SwiftUI controls (status row, hero amount at 44/700, quick-action labels).

### Named Rules
**The Silent Scale Rule.** Type size signals function. The 48px display belongs to one metric (insight detail); the 32px display to the Home available figure and the Insights bento hero. The 17px page title is screen chrome; the 18px section title anchors Home sections. Two elements sharing a size differ in weight, color, or case — never all at once.

**The Token Rule.** No screen sets `fontSize` inline as a typographic role — every typographic style routes through `TYPE`. Off-scale overrides are permitted only as a deliberate spread on top of a base token (`[TYPE.bodySm, { fontSize: 16 }]`), never as fresh inline declarations.

## 4. Spacing & Radius

Spacing and radius are now tokenized like type and color. Reference the tokens; don't reach for magic numbers.

**Spacing** (`src/spacing.ts`). A strict 4pt grid — `SPACE.xs` (4) through `SPACE.xxxl` (32). The only sub-grid token is `px2` (2), reserved for 1–2px optical nudges — never layout. The old half-steps (6/10/14/18) have been migrated out. For structural decisions use the **semantic `LAYOUT` roles** so the same role resolves identically everywhere:
- `screenGutter` 16 — outer L/R padding of screen content.
- `cardPadX / cardPadTop / cardPadBottom` 20 / 20 / 12 — `SectionCard` interior.
- `sectionGap` 24 — vertical gap between stacked cards.
- `rowPadY` 12 — list/transaction row vertical padding.

> Screens still use a mix of gutters (16 / 20 / 22). `screenGutter: 16` is the canonical target (matches Insights `CARD_OUTER_PAD`); migrate the others onto it.

**Radius** (`src/radius.ts`). `RADIUS`: `bar` 4, `chip` 10, `field` 14, `button` 16, `modal` 18, `card` 24, `full` 100. Same element type → same token. `getCardStyle` consumes `RADIUS.card`. Fully-circular elements (icon circles, tab buttons) use `width / 2`, not a radius token.

## 5. Elevation & Material

**Frosted glass over a photographic wallpaper is the signature surface of the app.** The primary content screens (Home, Insights, History, Budget) render over a full-bleed `ImageBackground` with a `LinearGradient` scrim; content lives in **frosted cards** — `BlurView` (intensity 70 dark / 100 light, `systemMaterial` tint) wrapped in a 1px hairline border (`SectionCard`). This is a deliberate material identity, not a fallback. Flat solid surfaces are the **secondary** mode, for surfaces that don't sit over the wallpaper: sheets, forms, edit fields.

The non-negotiable constraint on the glass is **legibility**. The blur is structural (it separates a card from the photo and keeps content readable), never ornamental, and when glass and legibility conflict, legibility wins:
- **Scrim must hold card contrast.** Deepen the `makeScrim` gradient (and/or raise the blur tint opacity) until numbers and labels clear WCAG AA (4.5:1) against the busiest region of the wallpaper behind them. Tune per screen — data-dense screens need a stronger scrim.
- **The wallpaper is a backdrop, not a subject.** Behind text-heavy screens, prefer low-contrast, low-detail imagery.
- **Text on glass uses the `MEDIA` / `makeP` palette,** not the flat-surface tokens.

Elevation (shadow) enters only for chrome that physically layers above content:

### Shadow Vocabulary
- **Tab bar ambient** (`shadowOffset {0,10}, opacity 0.08, radius 20`, light): the floating navigation pill separates from content. iOS wraps it in a BlurView; Android uses a solid rgba fill.
- **Dropdown / menu structured** (`shadowOffset {0,10}, opacity 0.16, radius 32`): popovers read as higher than the scroll container.
- **Native sheets**: platform-managed SwiftUI elevation; not represented in app shadow tokens.
- **`getCardStyle` variants**: `flat` (hairline border, no shadow), `shadow` (soft ambient), `glass` (translucent fill + hairline + soft shadow) — selected at runtime via `cardStyle`.

### Named Rules
**The Flat Content Rule.** Data *contents* — transaction rows, group lists, budget bars — are flat at rest and never cast a shadow. On flat screens they sit on the solid surface; on wallpaper screens they sit inside a frosted `SectionCard`. If a surface can be scrolled past, it casts no shadow. Shadows are reserved for floating chrome.

**The Frosted Glass Rule.** The frosted `SectionCard` is the signature resting surface on wallpaper screens, not an exception. Two hard limits keep it from becoming slop: (1) **never nest glass inside glass** — one blur layer per stack; a frosted card on a frosted card is always wrong. (2) **never let blur cost legibility** — if a frosted card can't clear AA contrast against its wallpaper, deepen the scrim or calm the wallpaper; don't ship the unreadable card.

## 6. Components

### Screen / Sheet Exit Button (`ScreenExitButton`, signature convention)
The single standardized dismiss control, app-wide. A **Liquid Glass circle** (iOS 26+, `GlassCircleButton`; JS fallback circle below that), **top-left**, 36px (`EXIT_BTN_SIZE`), floated at `top 16 / left 20` when not hosted in a header row. **Variant decides the glyph: `back` → chevron (pushed full-screen views), `close` → X (bottom sheets / modals).** Only the tint adapts per surface. Never substitute a bespoke back/close button.

### Section Card (`SectionCard`)
The frosted resting surface on wallpaper screens. `BlurView` (intensity 70 dark / 100 light, `systemMaterial` tint) + 1px hairline border, `RADIUS.card` (24), interior padding `LAYOUT.cardPadX/Top/Bottom` (20/20/12). `noPad` variant for flush content (e.g. the embedded calendar).

### Tab Bar (signature component)
Floating pill anchored above the safe-area bottom — full capsule (`RADIUS.full`) with a 1px hairline border. iOS: BlurView backdrop; Android: solid rgba. Tab buttons are 52×52 icon-only circles (22px icon, stroke 1.7 inactive / 2.4 active; active = text, inactive = textSec). The mic/add button is divided off by a 1px hairline and carries the **accent** (fill + ink).

### Segmented Control (`Segmented`)
Pill container (chipBg fill, `RADIUS.full`, 3px padding) with a width-measuring animated sliding indicator. Active indicator: `accent.fill`; active label: `accent.ink`; inactive label: textSec, weight 500. Spring easing.

### Icon Circles
36×36 circles in transaction rows, bill rows, and as category icons. Background = spending-group color (blue/clay/teal); icon white, 16px, stroke 1.6. Always perfectly round (radius = width/2 = 18).

### Category Progress Bars
Two sizes: 10px height / radius 5 at group level; 5px / radius 3 at sub-category level. Background: hairline. Fill: group color, or over-ember when over budget. No mount animation; state changes instantly.

### Save Button
Full-width single-action button. Background `accent.fill`, text `accent.ink`, `RADIUS.button` (16), paddingVertical 16. The only full-bleed button in the system.

### Fields (Edit Form)
Grouped inside a chipBg container at `RADIUS.field` (14). Each row: paddingVertical 13, paddingHorizontal 16, hairline separators. Labels 14/500/textSec; inputs 15/500/text, right-aligned.

### Bottom Sheets
Native `@expo/ui` `BottomSheet` inside a `Host`, with `presentationDetents`, `presentationDragIndicator('visible')`, and `background(theme.surface)`. Header is a `ScreenExitButton` (`close` variant) + title; content scrolls with safe-area bottom padding. Sheets are flat surfaces (solid `theme.surface`), not frosted.

## 7. Do's and Don'ts

### Do:
- **Do** pull every constant from its token source: color from `theme` / `MEDIA`, type from `TYPE`, spacing from `SPACE`/`LAYOUT`, radius from `RADIUS`.
- **Do** keep type monochrome — hierarchy from size/weight/case, not hue.
- **Do** encode the three budget groups with their fixed colors: blue (needs), clay (wants), teal (savings). Every icon circle, progress bar, and group label uses these.
- **Do** reserve the accent (fill/ink/dot) for actions, selected states, and interactive indicators — and only those roles.
- **Do** use over-ember (`#D4522A`) for every over-budget signal, hero-avail (`#5CC4BA`) for the healthy/available state, caution-amber (`#C5A946`) for due-soon.
- **Do** treat the frosted `SectionCard` as the signature surface on wallpaper screens, and tune the scrim (and wallpaper choice) so content clears AA contrast.
- **Do** keep data surfaces flat (no shadow) at rest, whether on a solid page or inside a frosted card.
- **Do** use `ScreenExitButton` for every dismiss — top-left, chevron for pushed screens, X for sheets.

### Don't:
- **Don't** hardcode a hex/rgba for a themed role, or set `fontSize`/radius/spacing as a fresh inline literal when a token exists.
- **Don't** add gamification: no badges, achievement notifications, points, streaks, or celebratory animations. (From PRODUCT.md.)
- **Don't** use navy and gold, golden amber for wants, neon on black, or any finance-domain reflex palette. Wants-clay exists specifically to break the amber/gold reflex.
- **Don't** reintroduce a brand hue into the neutral field or the accent — the field is neutral and the accent is ink.
- **Don't** use the accent in charts or data visualization. Charts read spending groups, not action color.
- **Don't** nest glass inside glass, or let blur cost legibility. One frosted layer per stack; if a card can't hold AA contrast, deepen the scrim or calm the wallpaper rather than shipping it.
- **Don't** add side-stripe borders (border-left/right over 1px) to rows, cards, or callouts. Use a background tint, a leading icon, or nothing.
- **Don't** shadow data rows, category cards, or list items. If it can be scrolled past, it stays flat.
- **Don't** build a bespoke back/close button — use `ScreenExitButton`.
- **Don't** use a pencil icon anywhere — use a chevron or a background treatment to signal "editable."
- **Don't** build complex navigation hierarchies or hide features behind nested menus. (From PRODUCT.md.)
