# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start Expo dev server (Metro bundler + QR code)
npm run ios        # Build and run on iOS simulator (requires macOS + Xcode)
npm run android    # Build and run on Android emulator
npm run web        # Run in browser
```

No linter or test runner is configured. TypeScript type-checking is the main correctness gate — run it via your editor or `npx tsc --noEmit`.

## Architecture

This is an Expo React Native app (TypeScript, React 19, Expo SDK 54). Navigation is implemented manually — there is no React Navigation or Expo Router.

**Navigation model (`App.tsx`):** All screens render simultaneously as `Animated.View` layers stacked with `absoluteFillObject`. The active screen sits at `translateX: 0`; inactive screens sit off-screen left or right based on a fixed `SCREEN_ORDER` map. On transition, only the two involved screens animate; the rest snap silently. `prevScreen` state tracks which screen was just left so `AnimatedScreen` knows which pair to animate.

**Theme system (`src/theme.ts` + `src/ThemeProvider.tsx`):** `makeTheme(dark, accentKey, cardStyle)` produces a `Theme` object with semantic color tokens (`bg`, `surface`, `text`, `textSec`, `textTer`, `sep`, `hairline`, `chipBg`). Every screen and component receives `theme` as a prop — there is no stylesheet. `getCardStyle(theme)` returns the appropriate shadow/border style for the active card variant (`flat | shadow | glass`). The `ThemeProvider` context exposes `setDark`, `setAccentKey`, and `setCardStyle` for runtime switching.

**Data layer (`src/data.ts`):** All data is static mock data — no network calls, no persistence. `TRANSACTIONS`, `PERIOD_DATA`, `TREND`, `SPEND_GROUPS`, `MONTH_BUDGETS`, and `UPCOMING_BILLS` are the main data structures. The 50/30/20 budget framework is the organizing principle: categories map to `needs | wants | savings` groups via `CAT_TO_GROUP` in `src/theme.ts`.

**Screens (`src/screens/`):**
- `HomeScreen` — primary dashboard with period toggle (Week/Month/Year), donut chart, sparkline, and transaction list
- `SpendingScreen` — category breakdown with trend chart
- `BudgetScreen` — 50/30/20 group view with monthly history switcher
- `ActivityScreen` — full transaction list with date grouping
- `DetailScreen` — single transaction detail; receives the `Transaction` object as a prop from App

**Components (`src/components/`):**
- `Icon` — inline SVG icon set (react-native-svg), `name` prop maps to a fixed set of path definitions. Add new icons directly in this file.
- `shared.tsx` — reusable primitives: `Money` (formatted currency display), `Segmented` (animated pill control), `CircleBtn`, `BackBtn`, `CatBadge`, `SectionHeader`
- `Donut` — SVG donut chart for category spending
- `TrendChart` — SVG bar chart with budget line
- `Sparkline` — 7-day mini sparkline
- `TabBar` — bottom tab bar (Home / Spending / Budget + Add button)
- `Drawer` — left slide-in navigation drawer
- `VoiceSheet` — bottom sheet for adding expenses by voice or manual keypad entry

**Voice input (`src/voice/`):**
- `useVoiceRecognition.ts` — wraps `expo-speech-recognition` with start/stop/abort/reset interface
- `parseVoiceExpense.ts` — pure function that parses free-form speech transcripts into `{ amount, cat, merchant }`. Handles both digit forms ("$6.50") and spoken numbers ("six fifty"). Add new category keywords to `CAT_KEYWORDS`.

**Fonts (`src/fonts.ts`):** Inter (via `@expo-google-fonts/inter`) is patched as the default Text font using `patchTextWithInter()`, called once at module load in `App.tsx`.

## Key conventions

- Every component that needs colors receives a `theme: Theme` prop — do not use hardcoded hex values.
- Category colors come from `catPastel(cat, dark)` for chart segments or `catGroupColor(cat, dark)` for group-level coloring. Both live in `src/theme.ts`.
- The app targets iOS first (voice recognition uses Apple's Speech framework). Android and web are secondary.
- There is no state management library. Local `useState` and props threading are used throughout.
