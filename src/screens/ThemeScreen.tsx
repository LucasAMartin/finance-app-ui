import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { CardStyle, Theme, makeTheme } from '../theme';
import { useTheme } from '../ThemeProvider';
import {
  CUSTOM_WALLPAPER_ID,
  WALLPAPER_TABS,
  findTabForWallpaper,
  Wallpaper,
} from '../wallpapers';
import { MEDIA, DARK_TEXT_SHADOW } from '../wallpaperPalette';
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');

const GRID_COLS = 3;
const GRID_HPAD = 16;
const GRID_GAP = 10;
const TILE_W = (SCREEN_W - GRID_HPAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const TILE_H = TILE_W * (19.5 / 9);
const APPEARANCE_OPTIONS: Array<{ label: string; dark: boolean }> = [
  { label: 'Dark Mode', dark: true },
  { label: 'Light Mode', dark: false },
];

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

export function ThemeScreen({ theme, visible, onClose }: Props) {
  const {
    dark,
    setDark,
    accentKey,
    cardStyle,
    wallpaperId: currentId,
    setWallpaperId,
    customWallpaperUri: currentCustomUri,
    setCustomWallpaperUri,
  } = useTheme();
  const insets = useSafeAreaInsets();

  const initialTab = currentId === CUSTOM_WALLPAPER_ID
    ? WALLPAPER_TABS[0].id
    : findTabForWallpaper(currentId).id;

  // Local selection state — only commit to context on Apply.
  const [pendingDark, setPendingDark] = useState<boolean>(dark);
  const [pendingId, setPendingId] = useState<string>(currentId);
  const [customUri, setCustomUri] = useState<string | undefined>(currentCustomUri);
  const [tabId, setTabId] = useState<string>(initialTab);

  // Reset local state every time the screen is opened.
  const wasVisible = React.useRef(visible);
  React.useEffect(() => {
    if (visible && !wasVisible.current) {
      setPendingDark(dark);
      setPendingId(currentId);
      setCustomUri(currentCustomUri);
      setTabId(currentId === CUSTOM_WALLPAPER_ID ? WALLPAPER_TABS[0].id : findTabForWallpaper(currentId).id);
    }
    wasVisible.current = visible;
  }, [visible, dark, accentKey, currentId, currentCustomUri]);

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

  const activeTab =
    WALLPAPER_TABS.find(t => t.id === tabId) ?? WALLPAPER_TABS[0];
  const tabIdx = Math.max(0, WALLPAPER_TABS.findIndex(t => t.id === activeTab.id));

  // Preview source for the page background — switches as user picks.
  const previewSource = useMemo((): number | { uri: string } => {
    if (pendingId === CUSTOM_WALLPAPER_ID && customUri) return { uri: customUri };
    for (const tab of WALLPAPER_TABS) {
      const found = tab.items.find(w => w.id === pendingId);
      if (found) return found.source as number;
    }
    return WALLPAPER_TABS[0].items[0].source as number;
  }, [pendingId, customUri]);

  const dirty =
    pendingId !== currentId ||
    pendingDark !== dark ||
    (pendingId === CUSTOM_WALLPAPER_ID && customUri !== currentCustomUri);

  const appearanceIdx = Math.max(0, APPEARANCE_OPTIONS.findIndex(opt => opt.dark === pendingDark));

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
    setCustomUri(uri);
    setPendingId(CUSTOM_WALLPAPER_ID);
  };

  const handleApply = () => {
    if (pendingDark !== dark) setDark(pendingDark);
    if (pendingId !== currentId) setWallpaperId(pendingId);
    if (pendingId === CUSTOM_WALLPAPER_ID && customUri && customUri !== currentCustomUri) {
      setCustomWallpaperUri(customUri);
    }
    if (dirty) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    onClose();
  };

  const scrimTop    = theme.dark ? 'rgba(8,6,20,0.68)' : 'rgba(8,6,20,0.48)';
  const scrimMid    = theme.dark ? 'rgba(8,6,20,0.50)' : 'rgba(8,6,20,0.44)';
  const scrimLower  = theme.dark ? 'rgba(8,6,20,0.78)' : 'rgba(8,6,20,0.38)';
  const scrimBottom = theme.dark ? 'rgba(8,6,20,0.92)' : 'rgba(8,6,20,0.18)';

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 80, opacity: anim, transform: [{ translateY }] },
      ]}
    >
      <View style={[styles.root, { backgroundColor: theme.dark ? '#000' : '#F8F6FF' }]}>
        <ImageBackground
          source={previewSource}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
            locations={[0, 0.28, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* ─── Header ─────────────────────────────────────── */}
          {/* Solid dark backdrop + dark frosted overlay = guaranteed contrast
              for the white title/icons on ANY wallpaper, regardless of
              whether BlurView renders frost or whether the iOS color scheme
              differs from the in-app theme. */}
          <View
            style={[
              styles.headerWrap,
              {
                paddingTop: insets.top + 8,
                backgroundColor: 'rgba(8,6,20,0.55)',
              },
            ]}
          >
            <BlurView
              intensity={60}
              tint="systemMaterialDark"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.headerDivider,
                { backgroundColor: MEDIA.hairline },
              ]}
            />
            <View style={styles.headerRow}>
              <ScreenExitButton
                variant="back"
                onPress={onClose}
                tint="#F2F4F5"
                fallbackBg="rgba(8,6,20,0.45)"
                accessibilityLabel="Back"
              />
              <Text style={[styles.headerTitle, { color: '#FFFFFF' }, DARK_TEXT_SHADOW]}>
                Background
              </Text>
              <Pressable
                onPress={handleUpload}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.headerIconBtn, { alignItems: 'flex-end' }]}
                accessibilityLabel="Upload custom wallpaper"
                accessibilityRole="button"
              >
                <Text style={[styles.uploadLink, { color: theme.accent.dot }, DARK_TEXT_SHADOW]}>
                  Upload
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: insets.top + 64 + 18,
              paddingBottom: insets.bottom + 110,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.segmentWrap}>
              <SegmentedControl
                values={APPEARANCE_OPTIONS.map(o => o.label)}
                selectedIndex={appearanceIdx}
                onChange={(e) => {
                  const next = APPEARANCE_OPTIONS[e.nativeEvent.selectedSegmentIndex];
                  if (next) setPendingDark(next.dark);
                }}
                tintColor={makeTheme(pendingDark, accentKey, cardStyle).accent.dot}
                appearance={pendingDark ? 'dark' : 'light'}
                backgroundColor={pendingDark ? 'rgba(242,244,245,0.055)' : 'rgba(255,255,255,0.12)'}
                fontStyle={{ color: 'rgba(242,244,245,0.68)' }}
                activeFontStyle={{ color: pendingDark ? '#080A0D' : '#F2F4F5', fontWeight: '600' }}
              />
            </View>

            {/* ─── Tab selector ────────────────────────────── */}
            <View style={styles.segmentWrap}>
              <SegmentedControl
                values={WALLPAPER_TABS.map(t => t.label)}
                selectedIndex={tabIdx}
                onChange={(e) => {
                  const next = WALLPAPER_TABS[e.nativeEvent.selectedSegmentIndex];
                  if (next) setTabId(next.id);
                }}
                tintColor={makeTheme(pendingDark, accentKey, cardStyle).accent.dot}
                appearance={pendingDark ? 'dark' : 'light'}
                backgroundColor={pendingDark ? 'rgba(242,244,245,0.055)' : 'rgba(255,255,255,0.12)'}
                fontStyle={{ color: 'rgba(242,244,245,0.68)' }}
                activeFontStyle={{ color: pendingDark ? '#080A0D' : '#F2F4F5', fontWeight: '600' }}
              />
            </View>

            {/* ─── Grids (all mounted to avoid image pop-in) ─── */}
            {/* Each tab's grid renders once on first mount; non-active tabs
                are stacked invisibly so their <Image> components stay mounted
                and decoded. Switching tabs becomes an instant opacity swap. */}
            <View style={styles.gridStack}>
              {WALLPAPER_TABS.map(tab => {
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
                    {tab.items.map(w => {
                      const selected = w.id === pendingId;
                      return (
                        <Tile
                          key={w.id}
                          wallpaper={w}
                          selected={selected}
                          dark={theme.dark}
                          accentFill={theme.accent.dot}
                          accentInk={theme.accent.ink}
                          onPress={() => handleSelect(w)}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* ─── Apply button (sticky bottom) ──────────────── */}
          <View
            style={[
              styles.applyWrap,
              {
                paddingBottom: insets.bottom + 14,
                paddingTop: 14,
              },
            ]}
            pointerEvents="box-none"
          >
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(0,0,0,0)',
                theme.dark ? 'rgba(8,6,20,0.55)' : 'rgba(8,6,20,0.18)',
                theme.dark ? 'rgba(8,6,20,0.85)' : 'rgba(8,6,20,0.30)',
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel={dirty ? 'Apply selected background' : 'Close'}
              style={({ pressed }) => [
                styles.applyBtn,
                {
                  backgroundColor: theme.accent.fill,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.applyText, { color: theme.accent.ink }]}>
                {dirty ? 'Apply' : 'Done'}
              </Text>
            </Pressable>
          </View>
        </ImageBackground>
      </View>
    </Animated.View>
  );
}

// ── Tile ──────────────────────────────────────────────────────────
function Tile({
  wallpaper,
  selected,
  dark,
  accentFill,
  accentInk,
  onPress,
}: {
  wallpaper: Wallpaper;
  selected: boolean;
  dark: boolean;
  accentFill: string;
  accentInk: string;
  onPress: () => void;
}) {
  const borderColor = dark ? 'rgba(235,225,255,0.20)' : 'rgba(14,12,24,0.10)';
  const borderWidth = StyleSheet.hairlineWidth;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor,
          borderWidth,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={wallpaper.name}
      accessibilityState={{ selected }}
    >
      <Image source={wallpaper.source} resizeMode="cover" style={styles.tileImage} />
      {selected && (
        <View style={[styles.checkBadge, { backgroundColor: accentFill }]}>
          <Icon name="plus" size={14} color={accentInk} stroke={2.4} />
        </View>
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
  },
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
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
  uploadLink: {
    ...TYPE.body,
    fontWeight: '600',
    textAlign: 'right',
    width: 60,
  },

  segmentWrap: {
    paddingHorizontal: GRID_HPAD,
    marginBottom: 18,
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
    width: TILE_W,
    height: TILE_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,12,24,0.25)',
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

  applyWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    alignItems: 'stretch',
  },
  applyBtn: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
