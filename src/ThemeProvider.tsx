import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { makeTheme, Theme, AccentKey, CardStyle } from './theme';
import {
  CUSTOM_WALLPAPER_ID,
  DEFAULT_WALLPAPER_ID,
  customWallpaperId,
  customWallpaperUriFromId,
  findWallpaperById,
  Wallpaper,
} from './wallpapers';
import { useRepositories, useRepositoryList } from './repositories/RepositoryProvider';
import { DEFAULT_FLOOR_BASE } from './wallpaperPalette';
import { extractWallpaperColor } from './wallpaperColor';
import { getCurrencyOption, normalizeCurrencyCode, setActiveCurrencyCode, type CurrencyOption } from './currency';
import type { Ledger } from './repositories/types';

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
  applyAppearance: (next: { dark?: boolean; wallpaperId?: string }) => void;
  customWallpaperUri: string | undefined;
  setCustomWallpaperUri: (uri: string) => void;
  customWallpaperUris: string[];
  addCustomWallpaperUri: (uri: string) => void;
  removeCustomWallpaperUri: (uri: string) => void;
  // Raw representative color extracted from the active wallpaper. Screens bend
  // this toward dark/light via deriveFloor() — see wallpaperPalette.ts.
  wallpaperFloorBase: string;
  currency: CurrencyOption;
  currencyCode: string;
  setCurrencyCode: (code: string) => void;
  // Generic key/value flags stored in settings.meta. Used for one-time
  // onboarding signals (first-run prompt shown, framework card dismissed, etc.)
  // so individual screens don't need direct settingsRepo access.
  metaFlag: (key: string) => boolean;
  setMetaFlag: (key: string, value?: boolean) => void;
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
  const { settingsRepo, sessionRepo } = useRepositories();
  const settingsList = useRepositoryList(settingsRepo);
  const activeLedgerRef = useRef<Ledger | undefined>(undefined);
  const activeLedgerKeyRef = useRef('');
  const activeLedger = useSyncExternalStore(
    useCallback((listener: () => void) => sessionRepo.subscribe(listener), [sessionRepo]),
    useCallback(() => {
      const session = sessionRepo.getSession();
      const next = sessionRepo.listLedgers().find(ledger => ledger.id === session.activeLedgerId);
      const key = next
        ? [
            next.id,
            next.name,
            next.ownerUserId,
            next.active ? '1' : '0',
            next.updatedAt ?? '',
            JSON.stringify(next.meta ?? {}),
          ].join('\u001f')
        : '';
      if (activeLedgerKeyRef.current === key) return activeLedgerRef.current;
      activeLedgerKeyRef.current = key;
      activeLedgerRef.current = next;
      return next;
    }, [sessionRepo]),
    useCallback(() => undefined, []),
  );
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
  const ledgerCurrencyCode = activeLedger?.meta?.currencyCode;
  const currencyCode = normalizeCurrencyCode(ledgerCurrencyCode ?? settings.meta?.currencyCode);
  setActiveCurrencyCode(currencyCode);
  const currency = useMemo(() => getCurrencyOption(currencyCode), [currencyCode]);
  const customWallpaperUris = useMemo(() => {
    const raw = settings.meta?.customWallpaperUris;
    const uris = Array.isArray(raw)
      ? raw.filter((uri): uri is string => typeof uri === 'string' && uri.length > 0)
      : [];
    if (customWallpaperUri && !uris.includes(customWallpaperUri)) {
      return [customWallpaperUri, ...uris];
    }
    return uris;
  }, [customWallpaperUri, settings.meta]);

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
    const customUri = customWallpaperUriFromId(wallpaperId);
    if (customUri) {
      return { id: customWallpaperId(customUri), name: 'Custom Photo', source: { uri: customUri } };
    }
    if (wallpaperId === CUSTOM_WALLPAPER_ID && customWallpaperUri) {
      return { id: customWallpaperId(customWallpaperUri), name: 'Custom Photo', source: { uri: customWallpaperUri } };
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
  const floorKey = wallpaper.id;
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
  const setCurrencyCode = useCallback((code: string) => {
    const nextCode = normalizeCurrencyCode(code);
    if (activeLedger) {
      sessionRepo.updateLedger(activeLedger.id, {
        meta: { ...(activeLedger.meta ?? {}), currencyCode: nextCode },
      });
    }
    const currentMeta = settings.meta ?? {};
    settingsRepo.update('settings', { meta: { ...currentMeta, currencyCode: nextCode } })
      ?? settingsRepo.create({ ...settings, meta: { ...currentMeta, currencyCode: nextCode } });
  }, [activeLedger, sessionRepo, settingsRepo, settings]);

  useEffect(() => {
    if (!activeLedger || activeLedger.meta?.currencyCode || !settings.meta?.currencyCode) return;
    sessionRepo.updateLedger(activeLedger.id, {
      meta: { ...(activeLedger.meta ?? {}), currencyCode: normalizeCurrencyCode(settings.meta.currencyCode) },
    });
  }, [activeLedger, sessionRepo, settings.meta]);
  const applyAppearance = useCallback((next: { dark?: boolean; wallpaperId?: string }) => {
    const patch: Partial<Pick<typeof settings, 'themeDark' | 'wallpaperId'>> = {};
    if (typeof next.dark === 'boolean' && next.dark !== settings.themeDark) {
      patch.themeDark = next.dark;
    }
    if (next.wallpaperId && next.wallpaperId !== settings.wallpaperId) {
      patch.wallpaperId = next.wallpaperId;
    }
    if (Object.keys(patch).length === 0) return;
    settingsRepo.update('settings', patch)
      ?? settingsRepo.create({ ...settings, ...patch });
  }, [settingsRepo, settings]);
  const setCustomWallpaperUri = useCallback((uri: string) => {
    const currentMeta = settings.meta ?? {};
    const raw = currentMeta.customWallpaperUris;
    const currentUris = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
    const customWallpaperUris = currentUris.includes(uri) ? currentUris : [uri, ...currentUris];
    settingsRepo.update('settings', { meta: { ...currentMeta, customWallpaperUri: uri, customWallpaperUris } })
      ?? settingsRepo.create({ ...settings, meta: { ...currentMeta, customWallpaperUri: uri, customWallpaperUris } });
  }, [settingsRepo, settings]);
  const addCustomWallpaperUri = useCallback((uri: string) => {
    const currentMeta = settings.meta ?? {};
    const raw = currentMeta.customWallpaperUris;
    const currentUris = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
    const customWallpaperUris = currentUris.includes(uri) ? currentUris : [uri, ...currentUris];
    settingsRepo.update('settings', { meta: { ...currentMeta, customWallpaperUris } })
      ?? settingsRepo.create({ ...settings, meta: { ...currentMeta, customWallpaperUris } });
  }, [settingsRepo, settings]);
  const removeCustomWallpaperUri = useCallback((uri: string) => {
    const currentMeta = settings.meta ?? {};
    const raw = currentMeta.customWallpaperUris;
    const currentUris = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
    const nextUris = currentUris.filter(item => item !== uri);
    const nextLegacyUri = currentMeta.customWallpaperUri === uri ? nextUris[0] : currentMeta.customWallpaperUri;
    const nextWallpaperId = settings.wallpaperId === customWallpaperId(uri)
      ? (nextUris[0] ? customWallpaperId(nextUris[0]) : defaultWallpaperId)
      : settings.wallpaperId;
    settingsRepo.update('settings', {
      wallpaperId: nextWallpaperId,
      meta: { ...currentMeta, customWallpaperUri: nextLegacyUri, customWallpaperUris: nextUris },
    }) ?? settingsRepo.create({
      ...settings,
      wallpaperId: nextWallpaperId,
      meta: { ...currentMeta, customWallpaperUri: nextLegacyUri, customWallpaperUris: nextUris },
    });
  }, [defaultWallpaperId, settingsRepo, settings]);
  const toggleDark = useCallback(() => setDark(!dark), [dark, setDark]);

  const metaFlag = useCallback(
    (key: string) => !!(settings.meta?.[key]),
    [settings.meta],
  );
  const setMetaFlag = useCallback(
    (key: string, value = true) => {
      const currentMeta = settings.meta ?? {};
      const update = { meta: { ...currentMeta, [key]: value } };
      settingsRepo.update('settings', update)
        ?? settingsRepo.create({ ...settings, ...update });
    },
    [settingsRepo, settings],
  );

  const value = useMemo<ThemeCtx>(
    () => ({
      theme, dark, setDark, toggleDark,
      accentKey, setAccentKey,
      cardStyle, setCardStyle,
      wallpaperId, wallpaper, setWallpaperId, applyAppearance,
      customWallpaperUri, setCustomWallpaperUri,
      customWallpaperUris, addCustomWallpaperUri, removeCustomWallpaperUri,
      wallpaperFloorBase,
      currency, currencyCode, setCurrencyCode,
      metaFlag, setMetaFlag,
    }),
    [theme, dark, setDark, toggleDark, accentKey, setAccentKey, cardStyle, setCardStyle, wallpaperId, wallpaper, setWallpaperId, applyAppearance, customWallpaperUri, setCustomWallpaperUri, customWallpaperUris, addCustomWallpaperUri, removeCustomWallpaperUri, wallpaperFloorBase, currency, currencyCode, setCurrencyCode, metaFlag, setMetaFlag],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
