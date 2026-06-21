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
import {
  Button as SwiftButton,
  GlassEffectContainer,
  Host,
  LazyHStack,
  ScrollView as SwiftScrollView,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  font,
  foregroundStyle,
  glassEffect,
  padding,
  scrollIndicators,
} from '@expo/ui/swift-ui/modifiers';
import * as ImagePicker from 'expo-image-picker';
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
import { TYPE } from '../typography';

const UPLOAD_TAB_ID = 'upload';
const GRID_COLS = 3;
const GRID_HPAD = 16;
const GRID_GAP = 10;
const RAIL_H = 52;

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
  const { width: screenW } = useWindowDimensions();
  const tileW = (screenW - GRID_HPAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const tileH = tileW * (19.5 / 9);
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
  const [tabId, setTabId] = useState<string>(initialTab);

  // Reset local state every time the screen is opened.
  const wasVisible = React.useRef(visible);
  React.useEffect(() => {
    if (visible && !wasVisible.current) {
      setPreviewDark(dark);
      setPendingId(currentResolvedId);
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
  const activeTab = tabs.find(t => t.id === tabId) ?? tabs[0];

  const wallpaperDirty = pendingId !== currentResolvedId;
  const modeDirty = previewDark !== dark;
  const dirty = wallpaperDirty || modeDirty;

  const handleSelect = (w: Wallpaper) => {
    if (w.id === pendingId) return;
    Haptics.selectionAsync().catch(() => {});
    setPendingId(w.id);
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
    setPendingId(customWallpaperId(uri));
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
          contentContainerStyle={{
            paddingTop: insets.top + 64 + 20,
            paddingBottom: insets.bottom + 110,
          }}
          showsVerticalScrollIndicator={false}
        >
          <ThemeCategoryRail
            tabs={tabs}
            selectedId={activeTab.id}
            theme={screenTheme}
            onSelect={(id) => {
              Haptics.selectionAsync().catch(() => {});
              setTabId(id);
            }}
          />

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
        </RNScrollView>

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
      </View>
    </Animated.View>
  );
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
  if (SUPPORTS_GLASS) {
    return (
      <Host ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'} style={styles.railHost}>
        <GlassEffectContainer>
          <SwiftScrollView
            axes="horizontal"
            showsIndicators={false}
            modifiers={[scrollIndicators('hidden', 'horizontal')]}
          >
            <LazyHStack spacing={10} alignment="center" modifiers={[padding({ horizontal: GRID_HPAD })]}>
              {tabs.map(tab => {
                const selected = tab.id === selectedId;
                return (
                  <SwiftButton
                    key={tab.id}
                    onPress={() => onSelect(tab.id)}
                    modifiers={[
                      buttonStyle('plain'),
                      padding({ horizontal: selected ? 14 : 4, vertical: 8 }),
                      ...(selected
                        ? [glassEffect({
                            glass: {
                              variant: 'regular',
                              interactive: true,
                              tint: glassTintForTheme(theme.dark),
                            },
                            shape: 'capsule',
                          })]
                        : []),
                    ]}
                  >
                    <SwiftText
                      modifiers={[
                        font({ size: 15, weight: selected ? 'semibold' : 'medium' }),
                        foregroundStyle(selected ? theme.text : theme.textSec),
                      ]}
                    >
                      {tab.label}
                    </SwiftText>
                  </SwiftButton>
                );
              })}
            </LazyHStack>
          </SwiftScrollView>
        </GlassEffectContainer>
      </Host>
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
          backgroundColor: theme.chipBg,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={[styles.uploadGlyph, { backgroundColor: theme.surface2 }]}>
        <Icon name="plus" size={22} color={theme.text} stroke={2} />
      </View>
      <Text style={[styles.uploadTileText, { color: theme.textSec }]}>Upload</Text>
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
    borderStyle: 'dashed',
    gap: 10,
  },
  uploadGlyph: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTileText: {
    ...TYPE.bodySmEm,
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
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
