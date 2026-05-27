import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { makeTheme, Theme, AccentKey, CardStyle } from './theme';
import { DEFAULT_WALLPAPER_ID, findWallpaperById, Wallpaper } from './wallpapers';
import { useRepositories, useRepositoryList } from './repositories/RepositoryProvider';

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
  defaultAccent = 'sage',
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

  const theme = useMemo(
    () => makeTheme(dark, accentKey, cardStyle),
    [dark, accentKey, cardStyle],
  );

  const wallpaper = useMemo(() => findWallpaperById(wallpaperId), [wallpaperId]);

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
  const toggleDark = useCallback(() => setDark(!dark), [dark, setDark]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme, dark, setDark, toggleDark,
      accentKey, setAccentKey,
      cardStyle, setCardStyle,
      wallpaperId, wallpaper, setWallpaperId,
    }),
    [theme, dark, setDark, toggleDark, accentKey, setAccentKey, cardStyle, setCardStyle, wallpaperId, wallpaper, setWallpaperId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
