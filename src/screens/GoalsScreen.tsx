import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Theme, GROUP_COLORS } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { makeP, makeScrim, deriveFloor } from '../wallpaperPalette';
import { SectionCard } from '../components/SectionCard';
import { Money } from '../components/shared';
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

interface Goal {
  id: string;
  label: string;
  icon: string;
  target: number;
  saved: number;
  deadline?: string;
}

export function GoalsScreen({ theme, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { wallpaper, wallpaperFloorBase } = useTheme();
  const { categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);

  // Goals are authored in BudgetScreen as savings-category metadata. This screen
  // is the read-side aggregate of every funded goal across those categories.
  const goals = useMemo<Goal[]>(
    () =>
      categories
        .filter(
          c =>
            !c.archived &&
            c.group === 'savings' &&
            typeof c.meta?.goalTarget === 'number' &&
            (c.meta.goalTarget as number) > 0,
        )
        .map(c => ({
          id: c.id,
          label: c.label,
          icon: c.icon,
          target: c.meta!.goalTarget as number,
          saved: typeof c.meta?.goalSaved === 'number' ? (c.meta!.goalSaved as number) : 0,
          deadline: typeof c.meta?.goalDeadline === 'string' ? (c.meta!.goalDeadline as string) : undefined,
        }))
        .sort((a, b) => b.saved / b.target - a.saved / a.target),
    [categories],
  );

  const totals = useMemo(() => {
    const target = goals.reduce((s, g) => s + g.target, 0);
    const saved = goals.reduce((s, g) => s + Math.min(g.saved, g.target), 0);
    return { target, saved, pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0 };
  }, [goals]);

  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const teal = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light;
  const p = makeP(theme.dark);
  const pWallpaper = makeP(true);
  const scrim = makeScrim(theme.dark);
  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 78, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: floorColor }]}>
        <ImageBackground source={wallpaper.source} resizeMode="cover" style={StyleSheet.absoluteFill}>
          <LinearGradient
            pointerEvents="none"
            colors={[scrim.top, scrim.mid, scrim.lower, scrim.bottom]}
            locations={[0, 0.3, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Header — pinned over the scrim, white text/icon. */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <ScreenExitButton
              variant="back"
              onPress={onClose}
              tint={pWallpaper.text}
              fallbackBg="rgba(8,6,20,0.45)"
              accessibilityLabel="Back"
            />
            <Text style={[styles.headerTitle, { color: pWallpaper.text }]}>Goals</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: insets.top + 52 + SPACE.lg,
              paddingHorizontal: LAYOUT.screenGutter,
              paddingBottom: insets.bottom + SPACE.xxxl,
            }}
            showsVerticalScrollIndicator={false}
          >
            {goals.length === 0 ? (
              <SectionCard dark={theme.dark}>
                <View style={styles.emptyWrap}>
                  <View style={[styles.emptyIcon, { backgroundColor: teal }]}>
                    <Icon name="sparkle" size={20} color="#FFFFFF" stroke={1.6} />
                  </View>
                  <Text style={[TYPE.subsectionTitle, { color: p.text, marginTop: SPACE.md, textAlign: 'center' }]}>
                    No goals yet
                  </Text>
                  <Text style={[TYPE.bodySm, { color: p.textSec, marginTop: SPACE.xs, textAlign: 'center' }]}>
                    Add a target to any savings category in Budget to start tracking it here.
                  </Text>
                </View>
              </SectionCard>
            ) : (
              <>
                {/* Summary — overall saved vs target across every goal. */}
                <SectionCard dark={theme.dark} style={{ marginBottom: SPACE.lg }}>
                  <Text style={[TYPE.labelLg, { color: p.textTer }]}>TOTAL SAVED</Text>
                  <View style={styles.summaryAmountRow}>
                    <Money value={totals.saved} theme={theme} size={32} color={p.text} prefix="$" />
                    <Text style={[TYPE.subsectionTitle, { color: p.textSec, marginBottom: 3 }]}>
                      {' '}of ${totals.target.toLocaleString()}
                    </Text>
                  </View>
                  <ProgressBar pct={totals.pct} color={teal} trackColor={p.hairline} height={10} />
                  <Text style={[TYPE.caption, { color: p.textSec, marginTop: SPACE.sm }]}>
                    {totals.pct}% of your goals funded · {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
                  </Text>
                </SectionCard>

                {/* One row per goal. */}
                <SectionCard dark={theme.dark}>
                  {goals.map((g, i) => {
                    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
                    const remaining = Math.max(0, g.target - g.saved);
                    const complete = remaining === 0;
                    return (
                      <View
                        key={g.id}
                        style={[
                          styles.goalRow,
                          i < goals.length - 1 && { borderBottomColor: p.hairline, borderBottomWidth: StyleSheet.hairlineWidth },
                        ]}
                      >
                        <View style={styles.goalHeader}>
                          <View style={[styles.goalIcon, { backgroundColor: teal }]}>
                            <Icon name={g.icon} size={16} color="#FFFFFF" stroke={1.6} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{g.label}</Text>
                            {g.deadline && (
                              <Text style={[TYPE.caption, { color: p.textTer, marginTop: 1 }]}>by {g.deadline}</Text>
                            )}
                          </View>
                          <View style={styles.goalAmounts}>
                            <Money value={g.saved} theme={theme} size={15} color={p.text} prefix="$" />
                            <Text style={[TYPE.caption, { color: p.textTer }]}>of ${g.target.toLocaleString()}</Text>
                          </View>
                        </View>
                        <View style={styles.goalBarRow}>
                          <ProgressBar pct={pct} color={teal} trackColor={p.hairline} height={5} />
                        </View>
                        <Text style={[TYPE.caption, { color: complete ? teal : p.textSec, marginTop: SPACE.xs }]}>
                          {complete ? 'Goal reached' : `$${remaining.toLocaleString()} to go · ${pct}%`}
                        </Text>
                      </View>
                    );
                  })}
                </SectionCard>
              </>
            )}
          </ScrollView>
        </ImageBackground>
      </View>
    </Animated.View>
  );
}

function ProgressBar({ pct, color, trackColor, height }: { pct: number; color: string; trackColor: string; height: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct}%`, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LAYOUT.screenGutter,
    paddingBottom: SPACE.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  summaryAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACE.xs,
    marginBottom: SPACE.md,
  },
  goalRow: {
    paddingVertical: SPACE.md,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  goalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalAmounts: {
    alignItems: 'flex-end',
  },
  goalBarRow: {
    marginTop: SPACE.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: SPACE.xl,
    paddingHorizontal: SPACE.lg,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
