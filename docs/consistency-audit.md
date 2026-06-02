# Consistency Audit — Finance App UI
(date: 2026-06-02)

---

## Executive Summary

The codebase is architecturally sound and largely follows its own design system. Theming, wallpaper palette usage, component reuse (`ScreenExitButton`, `Money`, `Skeleton`), and group-color routing are well-established. The main failure modes are:

1. **Wholesale raw typography in `Drawer.tsx`** — every text node uses bespoke inline `fontSize`/`fontWeight` instead of `TYPE` tokens.
2. **`DetailScreen.tsx` uses a pencil icon** (forbidden by standing rule).
3. **`InsightDetailScreen.tsx` hardcodes `color: '#FFFFFF'`** on the header title instead of using `pW.text` from the wallpaper palette.
4. **Off-grid spacing scattered throughout** — values of 5, 7, 9, 11, 13, 14, 22, 26 appear in layout padding/gap/margin across multiple files.
5. **`Toast` radius is 14** (`RADIUS.field`) when a floating notification should use `RADIUS.modal` (18) or a full pill (`RADIUS.full`).
6. **`InsightsScreen` `CARD_INNER_PAD` is 18** (off-grid, acknowledged in a comment but still a systemic issue — chart width arithmetic locks it in).
7. **`BudgetScreen.SectionCard`'s dark border is a violet-tinted `rgba(235,225,255,0.20)`** instead of the neutral `MEDIA.hairline` used on every other wallpaper card.
8. **`MonthlySpendingTracker` uses hard-coded STOPS_LIGHT / STOPS_DARK hex colors** that are not theme tokens or any design-system palette.
9. **`CategoryGroups.tsx` has entirely inline typography** (no `TYPE` tokens at all).
10. **`ThemeScreen` Apply button radius is `27` (height/2 = half of 54)** — a capsule — but the spec uses `RADIUS.button` (16) for the save button.

**Top 10 highest-impact issues** (by blast radius):

| Rank | Issue | Blast radius |
|------|-------|-------------|
| 1 | `Drawer.tsx` — all text inline, no TYPE tokens | Every app open (drawer is global chrome) |
| 2 | `DetailScreen.tsx` — pencil icon used on a Save action | Standing rule violation, visible on every tx detail |
| 3 | `BudgetScreen.SectionCard` dark border is violet-tinted | Budget screen (frequent) breaks glass card consistency |
| 4 | `InsightDetailScreen` header title hardcodes `#FFFFFF` | Light mode breaks contrast contract |
| 5 | `CategoryGroups.tsx` — no TYPE tokens anywhere | Spending groups component used across multiple screens |
| 6 | `VoiceSheet` / `ExpenseFlow` — raw font sizes for core input flow | Primary expense-entry path |
| 7 | `Toast` radius is 14 (field radius) not a pill shape | Every delete/undo toast in 4 screens |
| 8 | `MonthlySpendingTracker` STOPS_* colors outside design system | Budget tracker bespoke gradient |
| 9 | Off-grid spacing (5, 7, 9, 11, 13, 14, 22, 26) across 8+ files | Subtle but accumulates across every surface |
| 10 | `InsightsScreen` CARD_INNER_PAD = 18 (off-grid) locks in chart sizing | Insights card padding inconsistent with LAYOUT.cardPadX = 20 |

---

## Findings by Category

### 1. Typography

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/components/Drawer.tsx:104` | Avatar initial: `fontSize: 24, fontWeight: '700'` — raw inline | `TYPE.headline` (20/600) or `TYPE.display` | `[TYPE.headline, { color: theme.accent.ink }]` |
| P1 | `src/components/Drawer.tsx:108-113` | Profile name: `fontSize: 19, fontWeight: '700', letterSpacing: -0.4` — no TYPE token | Closest match `TYPE.headline` (20/600/-0.5) | Use `[TYPE.headline, { color: theme.text }]` |
| P1 | `src/components/Drawer.tsx:117` | "View profile": `fontSize: 13, fontWeight: '500'` | `TYPE.bodySm` (13/400) or `TYPE.bodySmEm` (13/500) | Use `[TYPE.bodySmEm, { color: theme.textSec }]` |
| P1 | `src/components/Drawer.tsx:160-163` | Nav item labels: `fontSize: 15, fontWeight: '500', letterSpacing: -0.2` | `TYPE.subsectionTitle` (15/600/-0.3) | Use `[TYPE.subsectionTitle, { color: theme.text }]` |
| P1 | `src/components/Drawer.tsx:170` | Badge text: `fontSize: 11, fontWeight: '700'` | `TYPE.labelLg` (11/500) | Use `[TYPE.labelLg, { color: theme.accent.ink }]` |
| P1 | `src/components/Drawer.tsx:226-228` | Section title: `fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase'` | `TYPE.label` (10/500/0.6/uppercase) — note: 11px is `TYPE.labelLg` | Use `[TYPE.labelLg, { color: theme.textTer }]` |
| P1 | `src/components/CategoryGroups.tsx:162-163` | Group total: `fontSize: 16, fontWeight: '700'` — not a TYPE token | No exact token for 16/700; closest `TYPE.headline`-spread or bespoke — should align with the display hierarchy | Use `[TYPE.body, { fontSize: 16, fontWeight: '700', color: ... }]` if deliberate, or migrate to `TYPE.headline` |
| P1 | `src/components/CategoryGroups.tsx:167-168` | Group label: `fontSize: 14, fontWeight: '600'` | `TYPE.body` is 14/500; `TYPE.subsectionTitle` is 15/600 | Use `[TYPE.body, { color: ... }]` or `TYPE.subsectionTitle` |
| P1 | `src/components/CategoryGroups.tsx:172-173` | Sub label: `fontSize: 11, fontWeight: '500'` | `TYPE.labelLg` | Use `TYPE.labelLg` |
| P2 | `src/components/VoiceSheet.tsx:812` | `hintExample`: `fontSize: 20, fontWeight: '500', letterSpacing: -0.4, lineHeight: 27` | `TYPE.headline` (20/600/-0.5) is the closest — weight differs | Use `TYPE.headline` |
| P2 | `src/components/VoiceSheet.tsx:813` | `hintText`: `fontSize: 16, fontWeight: '500', letterSpacing: -0.3, lineHeight: 24` | No TYPE token at 16; falls between `body` (14) and `headline` (20) | Consider `TYPE.subsectionTitle` (15/600) or add a mid-body token |
| P2 | `src/components/VoiceSheet.tsx:814` | `listeningText`: `fontSize: 22, fontWeight: '500', letterSpacing: -0.4, lineHeight: 28` | Between `headline` (20) and `display` (32) — no token | Add `TYPE.titleLg` or map to `TYPE.headline` with override |
| P2 | `src/components/VoiceSheet.tsx:815` | `transcriptLive`: `fontSize: 26, fontWeight: '600', letterSpacing: -0.5, lineHeight: 33` | Between `headline` and `display` — no token | As above; or use `[TYPE.display, { fontSize: 26 }]` to at least anchor |
| P2 | `src/components/ExpenseFlow.tsx:822-823` | `manualAmountSign/Value`: `fontSize: 46, fontWeight: '600', letterSpacing: -1.2, lineHeight: 52` | `TYPE.displayXl` is 48/600 — size 2pt different | Align to `TYPE.displayXl` (48); drop to 48 is imperceptible |
| P2 | `src/screens/InsightDetailScreen.tsx:703` | `headerTitle` bakes `color: '#FFFFFF'` into the StyleSheet definition | `color` must come from `pW.text` at render time, not the stylesheet | Remove `color` from the StyleSheet; apply `{ color: pW.text }` inline |
| P2 | `src/components/NumericKeypad.tsx:128-129` | `keyLabel` overrides `TYPE.pageTitle` with `fontSize: 28, fontWeight: '400'` | Intentional size spread, but weight `'400'` on a key glyph is inconsistent with all other keypad-key text | Acceptable spread pattern — at minimum document this is intentional |
| P2 | `src/components/TransactionCalendar.tsx:307` | Day number: `fontSize: 16, fontWeight: '700', letterSpacing: -0.3` | No direct token — mid-range bespoke | `[TYPE.bodyRegular, { fontSize: 16, fontWeight: '700' }]` to anchor to TYPE |
| P2 | `src/components/TransactionCalendar.tsx:321` | Month header: `fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3` | Off-scale (9.5 not on grid) — closest `TYPE.labelSm` (9/600/0.9) | Migrate to `TYPE.labelSm` |
| P2 | `src/components/TransactionCalendar.tsx:328` | Day-of-week: `fontSize: 13, fontWeight: '500', letterSpacing: -0.2` | `TYPE.bodySmEm` (13/500) | Use `TYPE.bodySmEm` |
| P2 | `src/components/MonthlySpendingTracker.tsx:194-195` | Tick label: `fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3` | Off-scale 10.5 — closest `TYPE.label` (10/500/0.6) or `TYPE.labelLg` (11/500/0.5) | Migrate to `TYPE.label` |
| P2 | `src/components/MonthlySpendingTracker.tsx:204-205` | Month label: `fontSize: 11.5, fontWeight: '500'` | Between `TYPE.label`(10) and `TYPE.labelLg`(11) — off-scale | Migrate to `TYPE.labelLg` |
| P2 | `src/screens/ThemeScreen.tsx:506-508` | Apply button: `fontSize: 17, fontWeight: '700', letterSpacing: -0.3` | `TYPE.pageTitle` is 17/600; weight `'700'` is heavier than the convention | Use `[TYPE.pageTitle, { fontWeight: '700' }]` if bold is intentional, or `TYPE.pageTitle` |
| P2 | `src/components/charts/TrendBars.tsx:186-187` | SVG axis labels: `fontSize={9}, fontWeight='700'/'500'` | `TYPE.labelSm` (9/600) — but SVG `Text` can't use the style array; must be a numeric value | Pass `TYPE.labelSm.fontSize` and `TYPE.labelSm.fontWeight` from the token |
| P3 | `src/components/shared.tsx:97` | `BackBtn` chevron uses raw HTML entity `‹` at `fontSize: 18` | Should be an `Icon name="chevL"` consistent with all other back indicators | Replace with `<Icon name="chevL" size={18} color={theme.text} />` |
| P3 | `src/screens/InsightsScreen.tsx:2127-2128` | `deltaText`: `fontSize: 11, fontWeight: '700', letterSpacing: -0.1` | `TYPE.labelLg` (11/500/0.5) — weight and tracking differ | Use `TYPE.labelLg` or `TYPE.captionEm` |
| P3 | `src/components/HomeSpendGroups.tsx:309` | Progress bar label: `fontSize: 16` (off-scale from chart-only context) | Not a TYPE token path | Anchor to `TYPE.body` with override if needed |

---

### 2. Color

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/screens/InsightDetailScreen.tsx:703` | `headerTitle` color `'#FFFFFF'` baked into StyleSheet | `pW.text` from `makeP(true)` = `MEDIA.text` = `#F2F4F5` | `{ color: pW.text }` in JSX |
| P1 | `src/components/Drawer.tsx:80` | `shadowColor: '#000'` | Acceptable for elevation — only applies when `cardStyle=shadow`, no theme token needed | Minor — keep or use `theme.dark ? '#000' : '#0E0E10'` |
| P1 | `src/screens/BudgetScreen.tsx:246` | `SectionCard` dark border: `rgba(235,225,255,0.20)` — violet-tinted | `MEDIA.hairline` = `rgba(235,239,242,0.18)` — neutral, same as every other wallpaper card | Replace with `MEDIA.hairline` |
| P1 | `src/screens/BudgetScreen.tsx:1257` | `stickyBorderColor` dark: `rgba(235,225,255,0.16)` — violet-tinted | `MEDIA.hairline` (0.18) | Same fix as above |
| P1 | `src/screens/BudgetScreen.tsx:2380` | `keypadSurface` dark border: `rgba(235,225,255,0.16)` | `theme.hairline` (on a flat surface) | Use `theme.hairline` |
| P1 | `src/screens/BudgetScreen.tsx:1163` | Fallback group color `'#8B8597'` (bespoke violet-gray) | No token; use `theme.textTer` as fallback for an unknown group | Replace `?? '#8B8597'` with `?? theme.textTer` |
| P1 | `src/components/MonthlySpendingTracker.tsx:19-20` | `STOPS_LIGHT` / `STOPS_DARK` custom hex gradient (`#7A9D85`, `#C5A946`, `#C25A2E` etc.) — not design system colors | Closest semantic tokens: `GROUP_COLORS.savings.light`, `CAUTION_AMBER`, `OVER_DOT` | Rebuild gradient stops from `GROUP_COLORS.savings.light → CAUTION_AMBER → OVER_DOT` |
| P2 | `src/screens/InsightDetailScreen.tsx:601` | `incomeColor = GROUP_COLORS.savings.dark` — hardcoded to `.dark` variant regardless of mode | `group​Display​Color('savings', theme.dark)` | Use the mode-aware helper |
| P2 | `src/screens/ActivityScreen.tsx:634` | `selectedText: '#111111'` in calendar override colors | Not a design-system token — should be `theme.bg` (near-black in light mode) | Replace with `theme.bg` |
| P2 | `src/screens/ActivityScreen.tsx:876,879` | Filter button: `'rgba(0,0,0,0.75)'`, `'#FBF8FF'` — bespoke dark/light indicator pair | `theme.dark ? ... : ...` branches are correct intent; use `theme.text`/`theme.bg` tokens | Replace `rgba(0,0,0,0.75)` → `theme.bg`, `#FBF8FF` → `theme.surface` |
| P2 | `src/components/BudgetScreen.tsx:2631,2635` | Undo popup: `rgba(255,255,255,0.95)` / `rgba(0,0,0,0.06)` light-only values | Should reference `theme.surface` / `theme.hairline` | Use `theme.surface` / `theme.hairline` |
| P2 | `src/screens/HomeScreen.tsx:805` | `paidAction` background: `#34C759` — Apple system green, no design-system token | Closest token: `HERO_AVAIL` = `#5CC4BA` (the "positive/available" state) or `GROUP_COLORS.savings.light` | Replace with `GROUP_COLORS.savings.light` or `HERO_AVAIL` |
| P2 | `src/screens/InsightsScreen.tsx:311,313` | `DeltaBadge` up-bg: `rgba(212,82,42,0.18)` / `rgba(212,82,42,0.12)` — inline, not a token | `overBg(dark)` exists exactly for this | Use `overBg(theme.dark)` |
| P2 | `src/screens/ThemeScreen.tsx:168` | Root bg: `theme.dark ? '#000' : '#F8F6FF'` | `theme.bg` = `#080A0D` dark / `#F4F5F6` light; `#F8F6FF` has a violet tint not present in bg | Use `theme.bg` |
| P2 | `src/screens/ThemeScreen.tsx:44-46` | `SEGMENT_BG_DARK/LIGHT/TEXT` constants are hardcoded hex/rgba | These are always-on-wallpaper, so `makeP(true)` / `MEDIA` palette applies | Use `MEDIA.trackBg`, `MEDIA.textSec`, etc. |
| P2 | `src/components/Drawer.tsx:104` | Profile section color `theme.accent.ink` for a content label is ambiguous — `accent.ink` is text-on-accent-fill, but here the parent bg is `accent.fill` | Correct usage: `accent.fill` as bg, `accent.ink` as text-on-top — this is fine | No change needed; note confirmed correct usage |
| P3 | `src/screens/InsightsScreen.tsx:456,458` | Inline SegmentedControl `activeFontStyle.color`: `'#080A0D'` / `'#F2F4F5'` | These are `theme.accent.inkDark` / `theme.accent.ink` — exposed via `theme.accent.ink` | Use `theme.accent.ink` (flip per dark/light automatically) |
| P3 | `src/screens/InsightDetailScreen.tsx:760,762` | `moreBtn` bg: `rgba(242,244,245,0.10)` — on-wallpaper tint | `MEDIA.trackBg = rgba(235,239,242,0.18)` is the standard on-media surface | Use `MEDIA.trackBg` |

---

### 3. Spacing & Layout

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/screens/InsightsScreen.tsx:84` | `CARD_INNER_PAD = 18` — off-grid (admitted in a comment) | `LAYOUT.cardPadX = 20` | Migrate to 20; chart geometry derived from it needs updating |
| P2 | `src/screens/HomeScreen.tsx:1237` | `sectionStack gap: 22` — off-grid | `LAYOUT.sectionGap = 24` | Use 24 |
| P2 | `src/screens/HomeScreen.tsx:1294-1296` | `billRow paddingVertical: 16` | `LAYOUT.rowPadY = 12` | Use 12; 16 is already `SPACE.lg` but exceeds rowPadY |
| P2 | `src/screens/HomeScreen.tsx:1311-1313` | `txRow paddingVertical: 16` — same as above | `LAYOUT.rowPadY = 12` | Use 12 |
| P2 | `src/screens/ActivityScreen.tsx:2088` | Empty-state clear button: `marginTop: 16, paddingHorizontal: 20, paddingVertical: 13` | `paddingVertical: 13` is off-grid | Use `SPACE.md = 12` or `SPACE.lg = 16` |
| P2 | `src/screens/ActivityScreen.tsx:2078` | Filter pill: `paddingLeft: 11, paddingRight: 8, paddingVertical: 8` — 11 is off-grid | `SPACE.md = 12` / `SPACE.sm = 8` | Use 12 left, 8 right |
| P2 | `src/screens/ActivityScreen.tsx:2107` | Upcoming pill: `paddingHorizontal: 7, paddingVertical: 2.5` — 7 and 2.5 are off-grid | `SPACE.sm = 8` / `SPACE.px2 = 2` for optical nudge | Use 8/2 |
| P2 | `src/screens/ActivityScreen.tsx:1369` | FilterSheet mini-calendar wrap: `paddingHorizontal: 22` — off-grid | `LAYOUT.screenGutter = 16` or `LAYOUT.cardPadX = 20` | Use 20 |
| P2 | `src/screens/ActivityScreen.tsx:2167,2197,2221,2232,2248` | CAL / FS styles: `paddingHorizontal: 22` repeated — off-grid | `LAYOUT.cardPadX = 20` | Use 20 |
| P2 | `src/screens/ActivityScreen.tsx:2233-2234` | `paddingVertical: 13, gap: 13` — off-grid | 12 or 16 | Use 12 |
| P2 | `src/screens/BudgetScreen.tsx:2453,2737` | `fontWeight: '500' as const` in styles (not spacing, but odd cast; no alignment issue) | Fine stylistically | Low priority |
| P2 | `src/components/Toast.tsx:115` | `paddingVertical: 11` — off-grid | `SPACE.md = 12` | Use 12 |
| P2 | `src/components/Toast.tsx:114` | `gap: 20` — off-grid | `SPACE.xl = 20` is on-grid (20 is valid) | Actually fine; 20 = SPACE.xl |
| P2 | `src/components/Drawer.tsx:192` | `borderTopRightRadius/borderBottomRightRadius: 28` — off-grid radius | `RADIUS.card = 24` or `RADIUS.modal = 18` | Use `RADIUS.card` (24) for a full-surface edge |
| P2 | `src/components/Drawer.tsx:215` | `avatar borderRadius: 30` — diameter 60, so 30 is correct for a circle (width/2) | Correct usage — circles use width/2 | No change |
| P2 | `src/components/Drawer.tsx:243,250` | `itemIcon borderRadius: 11` and `badge borderRadius: 11` — off-grid | `RADIUS.chip = 10` | Use `RADIUS.chip` |
| P2 | `src/screens/InsightDetailScreen.tsx:779-780` | `searchCard borderRadius: 18`, `searchCardInner borderRadius: 18` | `RADIUS.modal = 18` — matches, fine | No change needed |
| P2 | `src/screens/InsightDetailScreen.tsx:800,804` | `dayCard borderRadius: 22`, `dayCardInner borderRadius: 22` — off-grid | `RADIUS.card = 24` | Use 24 |
| P2 | `src/screens/ThemeScreen.tsx:500-501` | Apply button: `height: 54, borderRadius: 27` — capsule | Spec says save button uses `RADIUS.button = 16` | Use `height: 52, borderRadius: RADIUS.button` |
| P2 | `src/screens/ThemeScreen.tsx:449` | `segmentClip borderRadius: 14` | `RADIUS.field = 14` — matches exactly | Fine |
| P2 | `src/components/HomeSpendGroups.tsx:276` | `borderRadius: 10` for a progress bar chip | `RADIUS.chip = 10` — matches | Fine |
| P3 | `src/screens/HomeScreen.tsx:1157-1161` | Hero padding: `paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32` | 24 = `SPACE.xxl` (on-grid); 32 = `SPACE.xxxl` (on-grid) | Fine; values on-grid but exceeds `LAYOUT.cardPadX`/`cardPadTop` |
| P3 | `src/components/VoiceSheet.tsx:847` | `keypad maxHeight: 268` — fine as a one-off constraint | Intentional layout value | No action |
| P3 | `src/screens/InsightsScreen.tsx:1963` | `timeframeSeg borderRadius: 13` — off-grid | `RADIUS.field = 14` | Use 14 |
| P3 | `src/screens/InsightsScreen.tsx:2029` | `whereSeg borderRadius: 13` — off-grid | `RADIUS.field = 14` | Use 14 |
| P3 | `src/screens/InsightDetailScreen.tsx:752` | `pickerSeg borderRadius: 18` | `RADIUS.modal = 18` — fine for a control row | Fine |
| P3 | `src/screens/InsightDetailScreen.tsx:686` | `headerWrap paddingHorizontal: 16` | `LAYOUT.screenGutter = 16` — matches | Fine; all other headers use 20 — inconsistency across screens |

---

### 4. Radius & Elevation

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/screens/InsightDetailScreen.tsx:800,804` | `dayCard` and `dayCardInner` `borderRadius: 22` | `RADIUS.card = 24` | Change to 24; all other section cards use 24 |
| P2 | `src/components/Drawer.tsx:192` | Drawer right edge: `borderTopRightRadius/borderBottomRightRadius: 28` | Off-grid; nearest token `RADIUS.card = 24` | Use 24 for visual consistency |
| P2 | `src/components/Drawer.tsx:243,250` | Item icon + badge: `borderRadius: 11` | `RADIUS.chip = 10` | Use 10 |
| P2 | `src/screens/ThemeScreen.tsx:500-501` | Apply button: `borderRadius: 27` (height/2 capsule) | Spec save button = `RADIUS.button = 16` | Use `RADIUS.button` |
| P2 | `src/screens/InsightsScreen.tsx:1963,2029` | `timeframeSeg` / `whereSeg` `borderRadius: 13` | `RADIUS.field = 14` | Use 14 |
| P2 | `src/components/BentoTile.tsx:78` | Internal `RADIUS` constant used without import from `radius.ts` | Should import `RADIUS.card` from `../radius` | Verify constant matches; if it equals 24, add explicit import |
| P3 | `src/components/TxSheet.tsx:544` | Tx icon circle: `borderRadius: 26` (diameter 52) | Correct — circles use width/2 | Fine |
| P3 | `src/components/TxSheet.tsx:552` | Button row radius: `borderRadius: 20` | `RADIUS.button = 16` | Change to 16 |
| P3 | `src/components/TxSheet.tsx:607` | Notes field: `borderRadius: 14` | `RADIUS.field = 14` — matches | Fine |
| P3 | `src/components/TxSheet.tsx:645,653` | Tag chip/row: `borderRadius: 18`, `borderRadius: 14` | `RADIUS.modal = 18` / `RADIUS.field = 14` — both match | Fine |
| P3 | `src/components/RecurringSheet.tsx:287` | Save button: `borderRadius: 16` | `RADIUS.button = 16` — matches | Fine |
| P3 | `src/components/RecurringSheet.tsx:339` | Card: `borderRadius: 12` — off-grid; not a card radius | `RADIUS.chip = 10` or `RADIUS.field = 14`? | Clarify role and align |
| P3 | `src/components/BillSheet.tsx:203` | Close icon wrap: `borderRadius: 26` (diameter 52) — circle | Correct width/2 pattern | Fine |
| P3 | `src/components/BillSheet.tsx:247-248` | Modal/form: `borderRadius: 16`, `paddingVertical: 15` | `RADIUS.button = 16` fine; `paddingVertical: 15` off-grid | Change 15 → `SPACE.md = 12` or `SPACE.lg = 16` |

---

### 5. Component / Primitive Reuse

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/components/shared.tsx:79-100` | `BackBtn` exists but is never imported anywhere in screens/sheets — a bespoke `Pressable` with a raw `‹` character is used instead | Standard dismiss = `ScreenExitButton variant="back"` | Remove `BackBtn` or alias it to `ScreenExitButton`; ensure all dismissals use `ScreenExitButton` |
| P2 | `src/screens/HomeScreen.tsx:230` | Custom `fmtAmount` formats currency locally as a string — does not reuse `Money` component | `Money` component from `shared.tsx` | The `Money` component is preferred; but on the Home wallpaper surface a `Text` node is needed for mixed styles (cents smaller). Document as intentional or extract a `WallpaperMoney` variant |
| P2 | `src/screens/InsightsScreen.tsx:232` | `money()` helper function defined locally — similar to `Money` component | `Money` component for rendered values | In charts/data compute contexts a string helper is acceptable; inline display text should use `Money` |
| P2 | `src/screens/InsightDetailScreen.tsx:78` | Another local `money()` helper — third definition across the codebase | Centralize into `src/selectors/format.ts` or similar | Extract to a shared utility |
| P2 | `src/screens/ActivityScreen.tsx:1386` | `fontWeight: '600'` applied directly to `FS.groupDividerLabel` without a TYPE token | `TYPE.subsectionTitle` (15/600) or `TYPE.labelLg` (11/500) | Migrate to TYPE token |
| P3 | Multiple screens | Each main screen re-declares its own `SectionCard` frosted card component (HomeScreen, InsightsScreen, BudgetScreen, ActivityScreen, InsightDetailScreen all have private `SectionCard`). All are identical or near-identical BlurView wrappers. | A shared `SectionCard` primitive | Extract to `src/components/SectionCard.tsx` — reduces duplication and ensures any card-radius/border change propagates everywhere |

---

### 6. Iconography

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/screens/DetailScreen.tsx:160` | **Pencil icon used** on a "Save" action row: `{ icon: 'pencil', label: 'Save', ... }` | Pencil is forbidden by standing rule. Save → no icon (button label), edit-mode → `chevR` or background treatment | Replace with no icon or `chevR` |
| P2 | `src/components/Drawer.tsx:97` | Close button uses an `Icon name="close"` directly, no `ScreenExitButton` | Standing rule: all dismiss buttons use `ScreenExitButton` variant="close" | Wrap in `ScreenExitButton variant="close"` |
| P2 | `src/screens/ThemeScreen.tsx:394` | Selection check badge uses `Icon name="plus"` (plus sign) to indicate "selected" | A checkmark is semantically correct for selection; `Icon name="check"` or SF Symbol `checkmark` | Replace with `"check"` icon or system `checkmark` symbol |
| P3 | Multiple files | `Icon name="filter"` used as a sort control in `InsightDetailScreen` (line 512) — ambiguous meaning (filter vs sort) | If it's sort-only, prefer a sort icon or SF Symbol `arrow.up.arrow.down` | Consider distinct icon for sort vs filter |

---

### 7. Buttons, Controls & Touch Targets

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/components/Drawer.tsx:90-98` | Drawer close `TouchableOpacity`: `hitSlop top: 60` is intentional (large target near top) but the `closeBtn` style is only 40×40, meaning the bottom 20pt is dead area below the button | Touch target fine overall but the inflated top-hitSlop is unbalanced | Normalize to `{ top: 10, bottom: 10, left: 10, right: 10 }` and increase button size to 44×44 |
| P2 | `src/screens/InsightsScreen.tsx:562,569` | `changeRow` / `catRow` rows have `opacity: pressed ? 0.6 : 1` but no explicit `accessibilityRole="button"` on the Pressable | `accessibilityRole="button"` already present (checked) | Fine |
| P2 | `src/components/shared.tsx:130-138` | `SectionHeader` action `Pressable` has `hitSlop` but no `accessibilityRole="button"` | `accessibilityRole="button"` | Add role |
| P3 | `src/screens/HomeScreen.tsx:633-636` | Bell icon is rendered in a `View` (not a Pressable) — it's a static icon with a notification dot but non-interactive | If bell opens notifications, needs `Pressable + accessibilityRole="button"` | Either wire up a navigation target or remove the dot |

---

### 8. Navigation & Dismissal

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/components/Drawer.tsx:90-98` | Drawer close is a bespoke `TouchableOpacity` with `Icon name="close"` — not `ScreenExitButton` | `ScreenExitButton variant="close"` | Replace with the standardized component |
| P2 | `src/screens/InsightDetailScreen.tsx:364-371` | `ScreenExitButton variant="back"` used correctly; tint is hardcoded `"#F2F4F5"` | On-wallpaper tint should be `pW.text` (= `MEDIA.text`) | Use `tint={pW.text}` |
| P2 | `src/screens/ThemeScreen.tsx:207-212` | `ScreenExitButton variant="back"` used; tint hardcoded `"#F2F4F5"` | Same as above — `pW.text` | Use `tint={pW.text}` |
| P2 | `src/screens/InsightsScreen.tsx:463-469` | `InsightBottomSheet` uses `ScreenExitButton variant="close"` correctly + `EXIT_FLOAT_STYLE` | Correct | Fine |
| P3 | `src/screens/ActivityScreen.tsx:1331-1337` | `FilterSheet` header uses `ScreenExitButton variant="close"` but the ScreenExitButton is placed inside a `headerLeft` View (not floated top-left). The button is semantically correct but its positioning diverges from the convention (float: top 16 / left 20) | Per spec sheets may inline the button in a header row | Acceptable inline placement for a sheet header row; document as the sheet variant |
| P3 | All screens | Header `paddingHorizontal` inconsistency: `HomeScreen`, `InsightsScreen`, `BudgetScreen` headers use `paddingHorizontal: 20`; `InsightDetailScreen` and `ThemeScreen` use `paddingHorizontal: 16` (matching `LAYOUT.screenGutter`) | `LAYOUT.screenGutter = 16` is canonical | Unify to 16 for screens that float over wallpaper OR to 20 consistently |

---

### 9. Bottom Sheets

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/screens/InsightsScreen.tsx:436-447` | `InsightBottomSheet` does not pass `environment` modifier to set `colorScheme` — dark/light is unhandled in the SwiftUI host | Add `environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })` | Add the `environment` modifier (already done in the BudgetScreen income sheet — inconsistency) |
| P2 | `src/screens/InsightsScreen.tsx:454-458` | Sheet content background: `backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.44)'` — the light case is semi-transparent, not `theme.surface` | `background(theme.surface)` is the spec | Use `theme.surface` for both modes |
| P2 | `src/screens/ActivityScreen.tsx:1317-1321` | `FilterSheet` `presentationDetents` is hardcoded to `{ fraction: 0.88 }` with no `large` fallback | Per-sheet sizing fine; but check if `large` is more appropriate for a full-screen filter | Acceptable; document as intentional |
| P3 | `src/components/BillSheet.tsx` | `BillSheet` appears to use a `BottomSheet` from `@expo/ui` with `ScreenExitButton`. Confirmed correct pattern. | Fine | No change |
| P3 | `src/components/TxSheet.tsx` | Similar — confirm `background(theme.surface)` is passed. Yes it is. | Fine | No change |

---

### 10. Empty / Loading / Error States

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/screens/ActivityScreen.tsx:967-975` | `LoadError` component uses a custom empty state with `SectionCard`; does not use `ContentUnavailableView` consistently (the day-detail empty state at line 983 does use `ContentUnavailableView`) | Prefer `ContentUnavailableView` for both, or standardize on the custom variant | Align: both should use the same pattern |
| P2 | `src/screens/HomeScreen.tsx:778-780` | Empty "No upcoming transactions" state is a plain `Text` with no icon or `ContentUnavailableView` | The Activity screen's empty day-detail uses `ContentUnavailableView` | Add an icon or use `ContentUnavailableView` for parity |
| P3 | `src/screens/InsightsScreen.tsx:1880-1884` | `EmptyState` is a bespoke component with inline `borderRadius: 16` and `opacity: 0.045/0.035` fill | `RADIUS.button = 16` — fine; the fill opacity is a one-off | Consider tokenizing the surface as `theme.chipBg` |
| P3 | `src/screens/BudgetScreen.tsx` | No error/retry state for budget data load failures | `ActivityScreen` has a `LoadError` retry component | Add similar error boundary for budget data |

---

### 11. Motion

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/screens/InsightDetailScreen.tsx:136-143` | Slide-in: `duration: 280` (in), `220` (out) | `App.tsx` uses `FADE_DURATION = 180` for screen transitions | Align with a shared constant or document different curves per context |
| P2 | `src/screens/ThemeScreen.tsx:93-97` | Slide-up: `duration: 260` (in), `200` (out) | Same inconsistency | Document or align |
| P3 | `src/screens/BudgetScreen.tsx:533-538` | Pin animation: `duration: 220` (pin), `150` (unpin) | Reasonable; no shared constant to violate | Fine |
| P3 | `src/components/BudgetScreen.tsx:370-375` | `EditCaret` blink uses `duration: 480` — fine as a one-off cursor behavior | No standard token for blink timing | Fine |

---

### 12. Copy & Formatting

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/screens/HomeScreen.tsx:783,838` | Amounts in the upcoming/activity sections rendered via local `fmtAmount` helper rather than `Money` component | `Money` from `shared.tsx` | Use `Money` for rendered amounts where the component structure allows |
| P2 | `src/screens/ActivityScreen.tsx:999` | `$${dayDetailSpend.toFixed(2)}` — raw string concat for currency | `Money` component | Use `<Money value={dayDetailSpend} ...>` |
| P2 | `src/screens/ActivityScreen.tsx:1040` | `$${filteredSpendTotal.toFixed(2)}` — raw string concat | `Money` | Use `Money` |
| P2 | `src/screens/InsightsScreen.tsx:577-578` | `insightSheetAction` button label: "View matching transactions" | Consistent across sheet, fine | Fine |
| P3 | `src/screens/ActivityScreen.tsx:1067-1069` | `Toast actionLabel` not passed — falls back to "Undo". The HomeScreen toast at line 131 formats `Added $${info.amount.toFixed(2)}` inline | Use `Money` for toast copy amounts | Low priority — toast strings |
| P3 | `src/screens/BudgetScreen.tsx:1375` | `accessibilityLabel` uses `fmtMoney` for the income/assigned inline — not routed through `Money` | Acceptable in a11y labels (string required) | Fine for a11y strings |

---

### 13. Accessibility

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P2 | `src/components/shared.tsx:126-141` | `SectionHeader` action `Pressable` missing `accessibilityRole="button"` | All interactive `Pressable`/`TouchableOpacity` require the role | Add `accessibilityRole="button"` |
| P2 | `src/screens/HomeScreen.tsx:633-636` | Bell icon + dot is a non-interactive `View` — looks like a notification affordance but no press handler, no role | Remove the dot or wire up navigation | Document as placeholder or add `onPress` + role |
| P2 | `src/screens/InsightsScreen.tsx:1607-1611` | `Hero BentoTile` gets `accessibilityLabel` but no `accessibilityRole` | `BentoTile` should propagate role="button" when `onPress` is provided | Check `BentoTile.tsx` — add `accessibilityRole="button"` if `onPress` provided |
| P2 | `src/screens/BudgetScreen.tsx:1462-1463` | Group collapse `Pressable` has `accessibilityState={{ expanded: !isCollapsed }}` ✓ — good; but `accessibilityHint` is missing | Add `accessibilityHint="Double tap to toggle"` | Minor |
| P3 | `src/screens/InsightDetailScreen.tsx:631` | `DetailDayGroup` tx row: `accessibilityLabel` is set ✓ | Fine | No change |
| P3 | `src/components/Drawer.tsx:136-175` | Drawer nav items use `TouchableOpacity` without `accessibilityRole="button"` | Add role | Add `accessibilityRole="button"` to each nav item |
| P3 | `src/screens/InsightsScreen.tsx:1030-1039` | `ActivityScreen.FilterSheet` category rows correctly have `accessibilityState={{ selected: active }}` and `accessibilityRole="button"` ✓ | Fine | No change |

---

### 14. Theming Completeness

| Severity | File — approx line | Issue | Canonical value | Suggested fix |
|----------|--------------------|-------|----------------|---------------|
| P1 | `src/screens/InsightDetailScreen.tsx:703` | `headerTitle color: '#FFFFFF'` is baked in — will not adapt if a light-mode wallpaper surface has a dark blur (impossible now but fragile) | `pW.text` | Fix as noted in Color section |
| P2 | `src/screens/ThemeScreen.tsx:44-46` | `SEGMENT_BG_DARK/LIGHT/TEXT` are module-level constants — never respond to theme changes | `MEDIA.trackBg`, `MEDIA.textSec` | Replace with makeP/MEDIA values |
| P2 | `src/components/MonthlySpendingTracker.tsx:19-20` | `STOPS_LIGHT`/`STOPS_DARK` are module-level constants — they do derive one value from dark/light, but are not reactive to theme token changes | Compute from `GROUP_COLORS` / `CAUTION_AMBER` / `OVER_DOT` at render time | Derive stops from tokens inline |
| P2 | `src/screens/BudgetScreen.tsx:2631,2635` | Undo popup light-only: `rgba(255,255,255,0.95)` / `rgba(0,0,0,0.06)` — unhandled dark mode | `theme.surface` / `theme.hairline` | Use tokens |
| P3 | `src/screens/InsightDetailScreen.tsx:119-121` | Scrim values inline `rgba(8,6,20,...)` — derived per-mode inside the component. Not from `makeScrim(dark)`. | `makeScrim(theme.dark)` from `wallpaperPalette.ts` | Use the shared scrim helper for consistency |

---

## Systemic Gaps

### Gap 1: No shared `SectionCard` primitive
Every main screen re-implements a private `SectionCard` (BlurView + hairline border + `borderRadius: 24`). At least 5 copies exist. Any change to card radius, blur intensity, or border color must be made in 5 places. Extract to `src/components/SectionCard.tsx` and export from there.

### Gap 2: No centralized `money()` string formatter
Three independent local `money()` helper functions exist (HomeScreen `fmtAmount`, InsightsScreen `money()`, InsightDetailScreen `money()`). The `Money` component in `shared.tsx` handles rendering but not pure string formatting (for a11y labels, toast messages). A shared `formatMoney(value, decimals?)` utility in `src/selectors/format.ts` would unify all three.

### Gap 3: Missing `TYPE` tokens for 16px and 22px sizes
The voice/expense flow needs a "spoken-amount" size (22–26px) and a "hint" size (16px) that sit between `headline` (20) and `display` (32). Without TYPE tokens, every component in these flows hardcodes bespoke sizes. Proposed additions: `TYPE.titleLg = { fontSize: 22, fontWeight: '500', letterSpacing: -0.4, lineHeight: 28 }` and `TYPE.mid = { fontSize: 16, fontWeight: '500', letterSpacing: -0.3, lineHeight: 22 }`. Alternatively: accept that ExpenseFlow / VoiceSheet are "one-of" surfaces with their own scale and document it.

### Gap 4: No token for "on-wallpaper tint" vs "on-flat tint" for ScreenExitButton
`ScreenExitButton` is called with hardcoded `tint="#F2F4F5"` on wallpaper screens and `tint={theme.textSec}` on flat (sheet) surfaces. A constant `EXIT_TINT_WALLPAPER = MEDIA.text` exported from `GlassButton.tsx` would prevent the `#F2F4F5` literal being re-introduced.

### Gap 5: Off-grid `CARD_INNER_PAD = 18` in InsightsScreen
This value is acknowledged in a comment as "kept because chart geometry is derived from it." The right fix is to recompute chart widths with `LAYOUT.cardPadX = 20` so the bento card interior aligns with every other card in the app. Medium effort — needs `HERO_CHART_W`, `HALF_W`, `HALF_CHART_W` constants updated.

---

## Design-System Reference

Quick token lookup for future audits:

| Domain | File | Key tokens |
|--------|------|-----------|
| Typography | `src/typography.ts` | `TYPE.displayXl` (48/600), `TYPE.display` (32/600), `TYPE.headline` (20/600), `TYPE.pageTitle` (17/600), `TYPE.sectionTitle` (18/600), `TYPE.subsectionTitle` (15/600), `TYPE.body` (14/500), `TYPE.bodyRegular` (14/400), `TYPE.bodySm` (13/400), `TYPE.bodySmEm` (13/500), `TYPE.caption` (12/400), `TYPE.captionEm` (12/500), `TYPE.labelLg` (11/500/uppercase), `TYPE.label` (10/500/uppercase), `TYPE.labelSm` (9/600/uppercase), `TYPE.txDateLabel` (13/500), `TYPE.onMediaAmount` (44/700) |
| Color (theme) | `src/theme.ts` | `theme.bg`, `.surface`, `.surface2`, `.text`, `.textSec`, `.textTer`, `.sep`, `.hairline`, `.chipBg`, `.accent.fill/.ink/.dot`; state: `OVER_DOT`, `overBg(dark)`, `overText(dark)`, `CAUTION_AMBER`, `cautionBg/Text(dark)`, `HERO_AVAIL`; groups: `GROUP_COLORS.needs/wants/savings` |
| Color (on-media) | `src/wallpaperPalette.ts` | `MEDIA.text`, `.textSec`, `.textTer`, `.hairline`, `.hairlineStrong`, `.trackBg`; `makeP(dark)` for card interior; `makeScrim(dark)` for scrim stops |
| Spacing | `src/spacing.ts` | `SPACE.xs=4, .sm=8, .md=12, .lg=16, .xl=20, .xxl=24, .xxxl=32`; `LAYOUT.screenGutter=16, .cardPadX=20, .cardPadTop=20, .cardPadBottom=12, .sectionGap=24, .rowPadY=12` |
| Radius | `src/radius.ts` | `RADIUS.bar=4, .chip=10, .field=14, .button=16, .modal=18, .card=24, .full=100` |
| Cards | `src/theme.ts` | `getCardStyle(theme)` — consumes `RADIUS.card`; handles flat/shadow/glass variants |
| Primitives | `src/components/shared.tsx` | `Money`, `CircleBtn`, `BackBtn` (deprecated — use `ScreenExitButton`), `CatBadge`, `SectionHeader`, `SheetPrimaryButton` |
| Exit button | `src/components/GlassButton.tsx` | `ScreenExitButton`, `EXIT_FLOAT_STYLE`, `EXIT_BTN_SIZE=36` |

**Standing rules (non-negotiable):**
- Never use the pencil icon — use chevR or background treatment for editability.
- All dismiss buttons → `ScreenExitButton`: top-left, chevron for pushed screens, X for sheets.
- No hardcoded hex/rgba for themed roles.
- AccentKey is `'ink'` only.
- No chart/data-viz use of the ink accent.
- No shadow on scrollable data rows.
- No nested glass-inside-glass.
