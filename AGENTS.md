# AGENTS.md

Concise guidance for agents working in this repo.

## Commands

```bash
npm start          # Expo dev server
npm run ios        # Build/run iOS app
npm run android    # Build/run Android app
npm run web        # Expo web
npm run typecheck  # TypeScript correctness gate
npm test           # Node test runner for src/**/*.test.ts
npm run test:repo  # Repository-focused tests
```

For Swift/native module changes, also build the touched module, usually:

```bash
xcodebuild -workspace ios/financeapp.xcworkspace -scheme GlassCard -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build
```

## App Shape

- Expo React Native app, TypeScript, React 19, Expo SDK 56. `package.json` uses `expo-router/entry`.
- Main dashboard navigation still lives in `App.tsx`, not React Navigation. The primary screens are stacked as absolute `Animated.View` layers and fade via per-screen opacity values. `navigate()` owns transition cancellation so rapid tab taps do not leave stale animations behind.
- Expo Router is used for routed flows such as `/income` and `/expense`; do not assume the app is router-free.
- The bottom tab bar is `src/components/TabBar.tsx`; on supported iOS it uses the native glass tab bar from `modules/glass-card`.

## Data & Sync

- Runtime data goes through repositories in `src/repositories`. Production uses SQLite repositories; tests use in-memory repositories.
- CloudKit sync lives in `src/sync` plus the native module in `modules/cloudkit-sync`.
- Sharing, conflicts, session metadata, notification prefs, automation imports, and widgets are real app surfaces. Do not treat `src/data.ts` as the app's source of truth.

## Native Modules

- Native SwiftUI/Expo modules live under `modules/`, especially:
  - `modules/glass-card` for Liquid Glass UI, onboarding, LG toasts, native sheets, tab bar, notification demo.
  - `modules/animated-key-pad` for the animated keypad demo/income flow pieces.
  - `modules/intro-login` for imported onboarding/name-page code.
  - `modules/cloudkit-sync` for CloudKit bridge code.
- SwiftUI views are exported through Expo Modules and consumed by small TS wrappers in each module's `src/` directory.
- When integrating code supplied from Downloads, preserve the provided implementation unless the user explicitly asks for design/code changes. Prefer minimal adapters over rewriting native screens in React Native.

## Design & UI Rules

- `DESIGN.md` documents the current visual intent; leave larger design-system rewrites for the SwiftUI migration unless the user asks.
- The app targets iOS first. Prefer native iOS/SwiftUI components for imported native demos and iOS-specific polish.
- The theme object from `src/theme.ts` is the normal color source for React Native screens. Typography, spacing, and radius tokens live in `src/typography.ts`, `src/spacing.ts`, and `src/radius.ts`.
- App toasts use `src/components/Toast.tsx`, backed by `NativeLGToast` on iOS.

## Editing Conventions

- Keep changes scoped. There are often unrelated dirty files.
- Use `rg` for search.
- Run `npm run typecheck` after TypeScript changes.
- Run the relevant `xcodebuild` target after Swift/native module changes.
- Do not rewrite native imported views from scratch when a small edit or wrapper change will solve the request.
