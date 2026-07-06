import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Asset } from 'expo-asset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Theme, makeTheme } from '../theme';
import { useTheme } from '../ThemeProvider';
import {
  CUSTOM_WALLPAPER_ID,
  DEFAULT_WALLPAPER_ID,
  WALLPAPER_TABS,
  customWallpaperId,
  customWallpaperUriFromId,
  findTabForWallpaper,
  Wallpaper,
} from '../wallpapers';
import { RADIUS } from '../radius';
import { Icon } from '../components/Icon';
import { GlassCircleButton, ScreenExitButton, SUPPORTS_GLASS, glassTintForTheme } from '../components/GlassButton';
import { FONT_WEIGHT, TYPE } from '../typography';
import { NativeWallpaperCarousel, type NativeWallpaperCarouselItem } from '../../modules/glass-card/src/NativeWallpaperCarousel';
import { NativeGlassSegmentedControl, SUPPORTS_GS_CONTROL } from '../../modules/glass-card/src/NativeGlassSegmentedControl';

const UPLOAD_TAB_ID = 'upload';
const UPLOAD_PLACEHOLDER_ID = 'upload-placeholder';
const GRID_COLS = 3;
const GRID_HPAD = 16;
const GRID_GAP = 10;
const RAIL_H = 58;

type LocalWallpaper = Wallpaper & { customUri?: string };
type ThemeTab = {
  id: string;
  label: string;
  items: LocalWallpaper[];
};

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

export function ThemeScreen({ theme, visible, onClose }: Props) {
  const {
    dark,
    accentKey,
    cardStyle,
    wallpaperId: currentId,
    applyAppearance,
    customWallpaperUri: currentCustomUri,
    customWallpaperUris,
    addCustomWallpaperUri,
    removeCustomWallpaperUri,
  } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const tileW = (screenW - GRID_HPAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const tileH = tileW * (19.5 / 9);
  const carouselH = Math.max(520, screenH - insets.top - insets.bottom - 64 - RAIL_H - 4);
  const [previewDark, setPreviewDark] = useState<boolean>(dark);
  const screenTheme = useMemo(
    () => (previewDark === dark ? theme : makeTheme(previewDark, accentKey, cardStyle)),
    [accentKey, cardStyle, dark, previewDark, theme],
  );

  const currentResolvedId = currentId === CUSTOM_WALLPAPER_ID && currentCustomUri
    ? customWallpaperId(currentCustomUri)
    : currentId;

  const initialTab = customWallpaperUriFromId(currentResolvedId)
    ? UPLOAD_TAB_ID
    : findTabForWallpaper(currentResolvedId).id;

  // Local selection state — only commit to context on Apply.
  const [pendingId, setPendingId] = useState<string>(currentResolvedId);
  const [carouselSelectionId, setCarouselSelectionId] = useState<string>(currentResolvedId);
  const [tabId, setTabId] = useState<string>(initialTab);
  const [wallpaperAssetUris, setWallpaperAssetUris] = useState<Record<string, string>>({});

  // Reset local state every time the screen is opened.
  const wasVisible = React.useRef(visible);
  React.useEffect(() => {
    if (visible && !wasVisible.current) {
      setPreviewDark(dark);
      setPendingId(currentResolvedId);
      setCarouselSelectionId(currentResolvedId);
      setTabId(customWallpaperUriFromId(currentResolvedId) ? UPLOAD_TAB_ID : findTabForWallpaper(currentResolvedId).id);
    }
    wasVisible.current = visible;
  }, [visible, dark, currentResolvedId]);

  React.useEffect(() => {
    if (!visible) setPreviewDark(dark);
  }, [dark, visible]);

  // Slide-up + fade animation.
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const uploadItems = useMemo(
    () => customWallpaperUris.map((uri, idx) => ({
      id: customWallpaperId(uri),
      name: `Upload ${idx + 1}`,
      source: { uri },
      customUri: uri,
    })),
    [customWallpaperUris],
  );
  const tabs = useMemo<ThemeTab[]>(
    () => [
      { id: UPLOAD_TAB_ID, label: 'Upload', items: uploadItems },
      ...WALLPAPER_TABS,
    ],
    [uploadItems],
  );
  const bundledWallpaperSources = useMemo(
    () => Array.from(new Set(
      tabs
        .flatMap(tab => tab.items)
        .map(wallpaper => wallpaper.source)
        .filter((source): source is number => typeof source === 'number'),
    )),
    [tabs],
  );
  const allWallpaperUris = useMemo(
    () => tabs
      .flatMap(tab => tab.items)
      .map(wallpaper => resolveWallpaperUri(wallpaper.source, wallpaperAssetUris))
      .filter(uri => uri.length > 0),
    [tabs, wallpaperAssetUris],
  );
  const activeTab = tabs.find(t => t.id === tabId) ?? tabs[0];
  const carouselItems = useMemo<NativeWallpaperCarouselItem[]>(
    () => {
      const items = activeTab.items.map(wallpaper => ({
        id: wallpaper.id,
        title: wallpaper.name,
        image: resolveWallpaperUri(wallpaper.source, wallpaperAssetUris),
      })).filter(item => item.image.length > 0);

      if (activeTab.id !== UPLOAD_TAB_ID) {
        return items;
      }

      return [
        {
          id: UPLOAD_PLACEHOLDER_ID,
          title: 'Upload',
          image: '',
          isUploadPlaceholder: true,
        },
        ...items,
      ];
    },
    [activeTab.id, activeTab.items, wallpaperAssetUris],
  );
  const carouselSelectedId = useMemo(() => {
    if (carouselItems.some(item => item.id === carouselSelectionId)) {
      return carouselSelectionId;
    }

    return carouselItems[0]?.id ?? '';
  }, [carouselItems, carouselSelectionId]);

  React.useEffect(() => {
    if (!SUPPORTS_GLASS || bundledWallpaperSources.length === 0) return;

    let cancelled = false;

    Promise.all(bundledWallpaperSources.map(async (source) => {
      const asset = Asset.fromModule(source);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
      return [assetSourceKey(source), asset.localUri ?? asset.uri] as const;
    }))
      .then(entries => {
        if (cancelled) return;
        setWallpaperAssetUris(prev => {
          let changed = false;
          const next = { ...prev };
          entries.forEach(([key, uri]) => {
            if (uri && next[key] !== uri) {
              next[key] = uri;
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [bundledWallpaperSources]);

  React.useEffect(() => {
    if (!SUPPORTS_GLASS) return;
    allWallpaperUris.forEach(uri => {
      Image.prefetch(uri).catch(() => {});
    });
  }, [allWallpaperUris]);

  const wallpaperDirty = pendingId !== currentResolvedId;
  const modeDirty = previewDark !== dark;
  const dirty = wallpaperDirty || modeDirty;

  const handleSelect = (w: Wallpaper) => {
    if (w.id === pendingId) return;
    Haptics.selectionAsync().catch(() => {});
    setPendingId(w.id);
    setCarouselSelectionId(w.id);
  };

  const handleUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    Haptics.selectionAsync().catch(() => {});
    addCustomWallpaperUri(uri);
    setTabId(UPLOAD_TAB_ID);
    const nextId = customWallpaperId(uri);
    setPendingId(nextId);
    setCarouselSelectionId(nextId);
  };

  const handleApply = () => {
    if (dirty) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    if (dirty) {
      applyAppearance({
        dark: modeDirty ? previewDark : undefined,
        wallpaperId: wallpaperDirty ? pendingId : undefined,
      });
    }
    requestAnimationFrame(onClose);
  };

  const handleToggleMode = () => {
    const nextDark = !previewDark;
    Haptics.selectionAsync().catch(() => {});
    setPreviewDark(nextDark);
  };

  const handleDeleteCustom = (uri: string) => {
    const id = customWallpaperId(uri);
    const nextUris = customWallpaperUris.filter(item => item !== uri);
    Haptics.selectionAsync().catch(() => {});
    removeCustomWallpaperUri(uri);
    if (pendingId === id) {
      const nextId = currentResolvedId === id
        ? (nextUris[0] ? customWallpaperId(nextUris[0]) : DEFAULT_WALLPAPER_ID)
        : currentResolvedId;
      setPendingId(nextId);
      if (!customWallpaperUriFromId(nextId)) {
        setTabId(findTabForWallpaper(nextId).id);
      }
      setCarouselSelectionId(nextId);
    }
  };

  const handleSelectTab = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setTabId(id);

    const nextTab = tabs.find(tab => tab.id === id);
    if (id === UPLOAD_TAB_ID) {
      setCarouselSelectionId(UPLOAD_PLACEHOLDER_ID);
      return;
    }

    const firstWallpaper = nextTab?.items[0];
    if (firstWallpaper) {
      setPendingId(firstWallpaper.id);
      setCarouselSelectionId(firstWallpaper.id);
    }
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 80, opacity: anim, transform: [{ translateY }] },
      ]}
    >
      <View style={[styles.root, { backgroundColor: screenTheme.surface }]}>
        <View
          style={[
            styles.headerWrap,
            {
              paddingTop: insets.top + 8,
              backgroundColor: screenTheme.surface,
              borderBottomColor: screenTheme.hairline,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <ScreenExitButton
              variant="back"
              onPress={onClose}
              tint={screenTheme.text}
              fallbackBg={screenTheme.chipBg}
              accessibilityLabel="Back"
            />
            <Text style={[styles.headerTitle, { color: screenTheme.text }]}>
              Appearance
            </Text>
            <ThemeModeButton theme={screenTheme} dark={previewDark} onPress={handleToggleMode} />
          </View>
        </View>

        <RNScrollView
          style={{ flex: 1 }}
          scrollEnabled={!SUPPORTS_GLASS}
          directionalLockEnabled
          contentContainerStyle={{
            paddingTop: insets.top + 64 + 20,
            paddingBottom: SUPPORTS_GLASS ? insets.bottom + 20 : insets.bottom + 110,
          }}
          showsVerticalScrollIndicator={false}
        >
          <ThemeCategoryRail
            tabs={tabs}
            selectedId={activeTab.id}
            theme={screenTheme}
            onSelect={handleSelectTab}
          />

          {SUPPORTS_GLASS ? (
            <NativeWallpaperCarousel
              wallpapers={carouselItems}
              selectedId={carouselSelectedId}
              resetKey={activeTab.id}
              isDark={screenTheme.dark}
              onSelect={(id) => {
                setCarouselSelectionId(id);
                if (id === UPLOAD_PLACEHOLDER_ID) return;
                const wallpaper = activeTab.items.find(item => item.id === id);
                if (wallpaper) handleSelect(wallpaper);
              }}
              onApply={handleApply}
              onAdd={handleUpload}
              bottomInset={insets.bottom}
              backgroundColor={screenTheme.surface}
              style={{ height: carouselH }}
            />
          ) : (
            <View style={styles.gridStack}>
              {tabs.map(tab => {
                const isActive = tab.id === activeTab.id;
                return (
                  <View
                    key={tab.id}
                    style={[
                      styles.grid,
                      !isActive && styles.gridHidden,
                    ]}
                    pointerEvents={isActive ? 'auto' : 'none'}
                  >
                    {tab.id === UPLOAD_TAB_ID && (
                      <UploadTile
                        theme={screenTheme}
                        tileW={tileW}
                        tileH={tileH}
                        onPress={handleUpload}
                      />
                    )}
                    {tab.items.map(w => {
                      const selected = w.id === pendingId;
                      const customUri = w.customUri;
                      return (
                        <Tile
                          key={w.id}
                          wallpaper={w}
                          selected={selected}
                          dark={screenTheme.dark}
                          accentFill={screenTheme.accent.fill}
                          accentInk={screenTheme.accent.ink}
                          tileW={tileW}
                          tileH={tileH}
                          onPress={() => handleSelect(w)}
                          onDelete={customUri ? () => handleDeleteCustom(customUri) : undefined}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}
        </RNScrollView>

        {!SUPPORTS_GLASS && (
          <View
            style={[
              styles.applyWrap,
              {
                paddingBottom: insets.bottom + 14,
                paddingTop: 14,
                backgroundColor: screenTheme.surface,
                borderTopColor: screenTheme.hairline,
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel={dirty ? 'Apply selected appearance' : 'Close'}
              style={({ pressed }) => [
                styles.applyBtn,
                {
                  backgroundColor: screenTheme.accent.fill,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.applyText, { color: screenTheme.accent.ink }]}>
                {dirty ? 'Apply' : 'Done'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function assetSourceKey(source: number): string {
  return String(source);
}

function resolveWallpaperUri(source: Wallpaper['source'], assetUris: Record<string, string> = {}): string {
  if (typeof source === 'number') {
    return assetUris[assetSourceKey(source)] ?? Image.resolveAssetSource(source)?.uri ?? '';
  }

  return source.uri;
}

function ThemeModeButton({
  theme,
  dark,
  onPress,
}: {
  theme: Theme;
  dark: boolean;
  onPress: () => void;
}) {
  const accessibilityLabel = dark ? 'Switch to light mode' : 'Switch to dark mode';
  const iconName = dark ? 'sun' : 'moon';
  if (SUPPORTS_GLASS) {
    return (
      <View style={[styles.headerIconBtn, { alignItems: 'flex-end' }]}>
        <GlassCircleButton
          onPress={onPress}
          systemImage={dark ? 'sun.max' : 'moon'}
          size={40}
          iconSize={18}
          iconColor={theme.text}
          glassTint={glassTintForTheme(theme.dark)}
          colorScheme={theme.dark ? 'dark' : 'light'}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.headerIconBtn, { alignItems: 'flex-end' }]}
    >
      <View style={[styles.modeFallback, { backgroundColor: theme.chipBg }]}>
        <Icon name={iconName} size={18} color={theme.text} stroke={1.8} />
      </View>
    </Pressable>
  );
}

function ThemeCategoryRail({
  tabs,
  selectedId,
  theme,
  onSelect,
}: {
  tabs: ThemeTab[];
  selectedId: string;
  theme: Theme;
  onSelect: (id: string) => void;
}) {
  if (SUPPORTS_GS_CONTROL) {
    return (
      <NativeGlassSegmentedControl
        tabs={tabs.map(tab => ({ id: tab.id, title: tab.label }))}
        selectedId={selectedId}
        isDark={theme.dark}
        onSelect={onSelect}
        style={styles.railHost}
      />
    );
  }

  return (
    <RNScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railFallbackContent}
      style={styles.railFallback}
    >
      {tabs.map(tab => {
        const selected = tab.id === selectedId;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.railFallbackPill,
              selected && { backgroundColor: theme.chipBg, borderColor: theme.hairline },
            ]}
          >
            <Text style={[styles.railFallbackText, { color: selected ? theme.text : theme.textSec }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </RNScrollView>
  );
}

function UploadTile({
  theme,
  tileW,
  tileH,
  onPress,
}: {
  theme: Theme;
  tileW: number;
  tileH: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Upload wallpaper"
      style={({ pressed }) => [
        styles.tile,
        styles.uploadTile,
        {
          width: tileW,
          height: tileH,
          borderColor: theme.hairline,
          backgroundColor: theme.surface2,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={[styles.uploadGlyph, { backgroundColor: theme.chipBg }]}>
        <Icon name="plus" size={30} color={theme.textSec} stroke={1.9} />
      </View>
    </Pressable>
  );
}

// ── Tile ──────────────────────────────────────────────────────────
function Tile({
  wallpaper,
  selected,
  dark,
  accentFill,
  accentInk,
  tileW,
  tileH,
  onPress,
  onDelete,
}: {
  wallpaper: LocalWallpaper;
  selected: boolean;
  dark: boolean;
  accentFill: string;
  accentInk: string;
  tileW: number;
  tileH: number;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const borderColor = dark ? 'rgba(235,225,255,0.20)' : 'rgba(14,12,24,0.10)';
  const borderWidth = StyleSheet.hairlineWidth;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width: tileW,
          height: tileH,
          borderColor,
          borderWidth,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${wallpaper.name} wallpaper`}
      accessibilityState={{ selected }}
    >
      <Image
        source={wallpaper.source}
        resizeMode="cover"
        style={styles.tileImage}
      />
      {selected && (
        <View style={[styles.checkBadge, { backgroundColor: accentFill }]}>
          <Icon name="check" size={14} color={accentInk} stroke={2.4} />
        </View>
      )}
      {onDelete && (
        <Pressable
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${wallpaper.name}`}
          style={[styles.deleteBadge, { backgroundColor: accentFill }]}
        >
          <Icon name="close" size={12} color={accentInk} stroke={2.4} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  headerIconBtn: {
    minWidth: 60,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },
  modeFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railHost: {
    width: '100%',
    height: RAIL_H,
    marginBottom: 14,
  },
  railFallback: {
    height: RAIL_H,
    marginBottom: 14,
  },
  railFallbackContent: {
    paddingHorizontal: GRID_HPAD,
    alignItems: 'center',
    gap: 10,
  },
  railFallbackPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  railFallbackText: {
    ...TYPE.bodySmEm,
  },
  gridStack: {
    position: 'relative',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_HPAD,
    gap: GRID_GAP,
  },
  gridHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  tile: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTile: {
    borderWidth: 1,
    borderStyle: 'solid',
  },
  uploadGlyph: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  applyWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyBtn: {
    height: 54,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontSize: 17,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.3,
  },
});
