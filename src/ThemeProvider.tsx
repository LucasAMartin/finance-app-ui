import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { makeTheme, Theme, AccentKey, CardStyle } from './theme';
import { CUSTOM_WALLPAPER_ID, DEFAULT_WALLPAPER_ID, findWallpaperById, Wallpaper } from './wallpapers';
import { useRepositories, useRepositoryList } from './repositories/RepositoryProvider';
import { DEFAULT_FLOOR_BASE } from './wallpaperPalette';
import { extractWallpaperColor } from './wallpaperColor';

interface ThemeCtx {
  theme: Theme;
  dark: boolean;
  setDark: (v: boolean) => void;
  toggleDark: () => void;
  accentKey: AccentKey;
  setAccentKey: (k: AccentKey) => void;
  cardStyle: CardStyle;
  setCardStyle: (s: CardStyle) => void;
  wallpaperId: string;
  wallpaper: Wallpaper;
  setWallpaperId: (id: string) => void;
  customWallpaperUri: string | undefined;
  setCustomWallpaperUri: (uri: string) => void;
  // Raw representative color extracted from the active wallpaper. Screens bend
  // this toward dark/light via deriveFloor() — see wallpaperPalette.ts.
  wallpaperFloorBase: string;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  followSystem?: boolean;
  defaultDark?: boolean;
  defaultAccent?: AccentKey;
  defaultCardStyle?: CardStyle;
  defaultWallpaperId?: string;
}

export function ThemeProvider({
  children,
  followSystem = false,
  defaultDark = false,
  defaultAccent = 'ink',
  defaultCardStyle = 'flat',
  defaultWallpaperId = DEFAULT_WALLPAPER_ID,
}: ProviderProps) {
  const { settingsRepo } = useRepositories();
  const settingsList = useRepositoryList(settingsRepo);
  const system = useColorScheme();
  const settings = settingsList[0] ?? {
    id: 'settings' as const,
    themeDark: followSystem ? system === 'dark' : defaultDark,
    accentKey: defaultAccent,
    cardStyle: defaultCardStyle,
    wallpaperId: defaultWallpaperId,
  };

  const dark = settings.themeDark;
  const accentKey = settings.accentKey;
  const cardStyle = settings.cardStyle;
  const wallpaperId = settings.wallpaperId ?? defaultWallpaperId;
  const customWallpaperUri = settings.meta?.customWallpaperUri as string | undefined;

  const theme = useMemo(
    () => makeTheme(dark, accentKey, cardStyle),
    [dark, accentKey, cardStyle],
  );

  // The app drives its own dark/light theme independent of the OS. app.json locks
  // userInterfaceStyle to "light", so without this the UIKit window stays light even
  // in our dark theme — and native sheet presentation containers (SwiftUI .sheet)
  // render a white backing that flashes at the edges when a sheet resizes or closes.
  // Forcing the UIKit interface style to match keeps those containers themed.
  useEffect(() => {
    Appearance.setColorScheme(dark ? 'dark' : 'light');
  }, [dark]);

  const wallpaper = useMemo(() => {
    if (wallpaperId === CUSTOM_WALLPAPER_ID && customWallpaperUri) {
      return { id: CUSTOM_WALLPAPER_ID, name: 'Custom Photo', source: { uri: customWallpaperUri } };
    }
    return findWallpaperById(wallpaperId);
  }, [wallpaperId, customWallpaperUri]);

  // ── Wallpaper floor color ───────────────────────────────────────
  // One representative color is extracted from the active wallpaper and cached
  // in settings.meta keyed by wallpaper (uri for custom photos). Extraction runs
  // only when the wallpaper changes and no cached value exists — so it happens
  // at selection time, never precomputed. The cached value seeds initial state
  // so relaunches and re-selections show the right floor instantly (no flash).
  const floorCache = (settings.meta?.wallpaperFloors ?? {}) as Record<string, string>;
  const floorKey =
    wallpaper.id === CUSTOM_WALLPAPER_ID ? `custom:${customWallpaperUri ?? ''}` : wallpaper.id;
  const [floorByKey, setFloorByKey] = useState<Record<string, string>>(floorCache);
  const wallpaperFloorBase = floorByKey[floorKey] ?? floorCache[floorKey] ?? DEFAULT_FLOOR_BASE;

  useEffect(() => {
    if (floorByKey[floorKey] || floorCache[floorKey]) return;
    let cancelled = false;
    extractWallpaperColor(wallpaper.source).then(color => {
      if (cancelled) return;
      setFloorByKey(prev => ({ ...prev, [floorKey]: color }));
      const latest = settingsRepo.get('settings');
      const latestMeta = latest?.meta ?? {};
      const latestMap = (latestMeta.wallpaperFloors as Record<string, string>) ?? {};
      settingsRepo.update('settings', {
        meta: { ...latestMeta, wallpaperFloors: { ...latestMap, [floorKey]: color } },
      });
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorKey]);

  const setDark = useCallback((v: boolean) => {
    settingsRepo.update('settings', { themeDark: v }) ?? settingsRepo.create({ ...settings, themeDark: v });
  }, [settingsRepo, settings]);
  const setAccentKey = useCallback((k: AccentKey) => {
    settingsRepo.update('settings', { accentKey: k }) ?? settingsRepo.create({ ...settings, accentKey: k });
  }, [settingsRepo, settings]);
  const setCardStyle = useCallback((s: CardStyle) => {
    settingsRepo.update('settings', { cardStyle: s }) ?? settingsRepo.create({ ...settings, cardStyle: s });
  }, [settingsRepo, settings]);
  const setWallpaperId = useCallback((id: string) => {
    settingsRepo.update('settings', { wallpaperId: id }) ?? settingsRepo.create({ ...settings, wallpaperId: id });
  }, [settingsRepo, settings]);
  const setCustomWallpaperUri = useCallback((uri: string) => {
    const currentMeta = settings.meta ?? {};
    settingsRepo.update('settings', { meta: { ...currentMeta, customWallpaperUri: uri } })
      ?? settingsRepo.create({ ...settings, meta: { ...currentMeta, customWallpaperUri: uri } });
  }, [settingsRepo, settings]);
  const toggleDark = useCallback(() => setDark(!dark), [dark, setDark]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme, dark, setDark, toggleDark,
      accentKey, setAccentKey,
      cardStyle, setCardStyle,
      wallpaperId, wallpaper, setWallpaperId,
      customWallpaperUri, setCustomWallpaperUri,
      wallpaperFloorBase,
    }),
    [theme, dark, setDark, toggleDark, accentKey, setAccentKey, cardStyle, setCardStyle, wallpaperId, wallpaper, setWallpaperId, customWallpaperUri, setCustomWallpaperUri, wallpaperFloorBase],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
