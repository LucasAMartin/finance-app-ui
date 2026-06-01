import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Theme } from '../theme';
import { useTheme } from '../ThemeProvider';
import { makeP, DARK_TEXT_SHADOW, MEDIA } from '../wallpaperPalette';
import { Icon } from '../components/Icon';
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');

// What a tapped bento tile asks the detail screen to show. The screen is a
// placeholder for now; this descriptor is what each future detail view will be
// built around.
export interface InsightDetailTarget {
  title: string;
  subtitle?: string;
  icon?: string;
  accentColor?: string;
}

interface Props {
  theme: Theme;
  target: InsightDetailTarget | null;
  onClose: () => void;
}

export function InsightDetailScreen({ theme, target, onClose }: Props) {
  const { wallpaper } = useTheme();
  const insets = useSafeAreaInsets();
  const pW = makeP(true);
  const visible = target !== null;

  // Keep the last target mounted through the slide-out so content doesn't blank.
  const last = useRef<InsightDetailTarget | null>(null);
  if (target) last.current = target;
  const t = last.current;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 220,
      useNativeDriver: true,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    }).start();
  }, [visible, anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_W, 0],
  });

  const accent = t?.accentColor ?? pW.text;

  const scrimTop = 'rgba(8,6,20,0.62)';
  const scrimMid = 'rgba(8,6,20,0.48)';
  const scrimLower = 'rgba(8,6,20,0.74)';
  const scrimBottom = 'rgba(8,6,20,0.90)';

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 80, opacity: anim, transform: [{ translateX }] },
      ]}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <ImageBackground
          source={wallpaper.source}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
            locations={[0, 0.28, 0.6, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* ─── Header ─────────────────────────────────────── */}
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
              style={StyleSheet.absoluteFillObject}
            />
            <View
              style={[styles.headerDivider, { backgroundColor: MEDIA.hairline }]}
            />
            <View style={styles.headerRow}>
              <Pressable
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Icon name="chevL" size={26} color="#FFFFFF" stroke={2.2} />
              </Pressable>
              <Text
                style={[styles.headerTitle, DARK_TEXT_SHADOW]}
                numberOfLines={1}
              >
                {t?.title ?? ''}
              </Text>
              <View style={styles.backBtn} />
            </View>
          </View>

          {/* ─── Placeholder body ───────────────────────────── */}
          <View style={[styles.body, { paddingTop: insets.top + 64 }]}>
            <View style={[styles.mark, { backgroundColor: `${accent}2B` }]}>
              <Icon name={t?.icon ?? 'chart'} size={30} color={accent} stroke={1.7} />
            </View>
            <Text
              style={[TYPE.headline, { color: pW.text, marginTop: 18 }, DARK_TEXT_SHADOW]}
            >
              {t?.title ?? ''}
            </Text>
            {t?.subtitle ? (
              <Text
                style={[
                  TYPE.body,
                  { color: pW.textSec, marginTop: 6, textAlign: 'center' },
                ]}
              >
                {t.subtitle}
              </Text>
            ) : null}
            <Text style={[TYPE.bodySm, { color: pW.textTer, marginTop: 24 }]}>
              Detailed view coming soon.
            </Text>
          </View>
        </ImageBackground>
      </View>
    </Animated.View>
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
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
