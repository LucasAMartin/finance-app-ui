import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  ImageBackground,
  Pressable,
  TextInput,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';

import { CAUTION_AMBER, GROUP_COLORS, ON_GROUP_ICON, OVER_DOT, Theme, cautionText } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import type { Category } from '../repositories/types';
import { makeP, makeScrim, deriveFloor, DARK_TEXT_SHADOW } from '../wallpaperPalette';
import { SectionCard } from '../components/SectionCard';
import { Money, SheetPrimaryButton } from '../components/shared';
import { Icon } from '../components/Icon';
import { ScreenExitButton, EXIT_FLOAT_STYLE } from '../components/GlassButton';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';
import { inferCategoryIcon } from '../categoryIcons';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

interface GoalContribution {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

interface Goal {
  id: string;
  label: string;
  icon: string;
  target: number;
  saved: number;
  deadline?: string;
  monthlyContribution?: number;
  contributions: GoalContribution[];
  category: Category;
}

interface GoalDraft {
  label: string;
  target: string;
  saved: string;
  deadline: string;
  monthlyContribution: string;
}

interface ContributionDraft {
  amount: string;
  date: string;
  note: string;
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const money0 = (n: number) => `$${Math.round(n).toLocaleString()}`;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));
const parseAmount = (value: string): number | null => {
  const cleaned = value.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

const parseDate = (value?: string): Date | null => {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const monthDistance = (deadline?: string): number | null => {
  const target = parseDate(deadline);
  if (!target) return null;
  const now = new Date();
  const raw = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth();
  return Math.max(1, raw + 1);
};

const deadlineLabel = (deadline?: string): string => {
  const d = parseDate(deadline);
  if (!d) return deadline ?? 'No date';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const contributionDateLabel = (date: string): string => {
  const d = parseDate(date);
  if (!d) return date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const goalMeta = (goal: Goal, patch: Record<string, unknown>) => ({
  ...(goal.category.meta ?? {}),
  ...patch,
});

function suggestedMonthly(target: number, saved: number, deadline?: string): number {
  const months = monthDistance(deadline);
  if (!months) return 0;
  return Math.max(0, Math.ceil((target - saved) / months));
}

function statusFor(goal: Goal) {
  const remaining = Math.max(0, goal.target - goal.saved);
  if (remaining <= 0) return { label: 'Complete', tone: 'good' as const };
  const needed = suggestedMonthly(goal.target, goal.saved, goal.deadline);
  if (!goal.deadline) return { label: 'Active', tone: 'neutral' as const };
  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return { label: `${money0(needed)}/mo needed`, tone: 'neutral' as const };
  if (goal.monthlyContribution + 1 < needed) return { label: 'Behind plan', tone: 'caution' as const };
  if (goal.monthlyContribution > needed * 1.18) return { label: 'Ahead', tone: 'good' as const };
  return { label: 'On track', tone: 'good' as const };
}

export function GoalsScreen({ theme, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { wallpaper, wallpaperFloorBase } = useTheme();
  const { categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const [formGoal, setFormGoal] = useState<Goal | 'new' | null>(null);
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null);

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
          monthlyContribution: typeof c.meta?.goalMonthlyContribution === 'number' ? c.meta!.goalMonthlyContribution as number : undefined,
          contributions: Array.isArray(c.meta?.goalContributions) ? c.meta!.goalContributions as GoalContribution[] : [],
          category: c,
        }))
        .sort((a, b) => {
          const aStatus = statusFor(a).tone === 'caution' ? 1 : 0;
          const bStatus = statusFor(b).tone === 'caution' ? 1 : 0;
          if (aStatus !== bStatus) return bStatus - aStatus;
          return (a.saved / a.target) - (b.saved / b.target);
        }),
    [categories],
  );

  const totals = useMemo(() => {
    const target = goals.reduce((s, g) => s + g.target, 0);
    const saved = goals.reduce((s, g) => s + Math.min(g.saved, g.target), 0);
    return { target, saved, pct: target > 0 ? clampPct(Math.round((saved / target) * 100)) : 0 };
  }, [goals]);

  const featured = goals[0];
  const detailGoal = goals.find(goal => goal.id === detailGoalId) ?? null;
  const contributionGoal = goals.find(goal => goal.id === contributionGoalId) ?? null;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const teal = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light;
  const caution = theme.dark ? cautionText(true) : CAUTION_AMBER;
  const p = makeP(theme.dark);
  const pWallpaper = makeP(true);
  const scrim = makeScrim(theme.dark);
  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);

  const saveGoal = (draft: GoalDraft, goal: Goal | 'new') => {
    const target = parseAmount(draft.target);
    const saved = parseAmount(draft.saved) ?? 0;
    const monthly = parseAmount(draft.monthlyContribution);
    if (!draft.label.trim() || !target || saved > target) return false;
    const icon = goal === 'new' ? (inferCategoryIcon(draft.label) || 'wallet') : goal.icon;
    const monthlyValue = monthly ?? suggestedMonthly(target, saved, draft.deadline.trim());
    const meta = {
      custom: true,
      goalTarget: target,
      goalSaved: saved,
      goalDeadline: draft.deadline.trim() || undefined,
      goalMonthlyContribution: monthlyValue > 0 ? monthlyValue : undefined,
      goalContributions: goal !== 'new' ? goal.contributions : [],
    };

    if (goal === 'new') {
      categoriesRepo.create({
        label: draft.label.trim(),
        icon,
        group: 'savings',
        defaultBudget: monthlyValue,
        sortOrder: Math.max(0, ...categories.map(cat => cat.sortOrder)) + 10,
        meta,
        createdByUserId: 'local',
        updatedByUserId: 'local',
      });
    } else {
      categoriesRepo.update(goal.id, {
        label: draft.label.trim(),
        icon,
        defaultBudget: monthlyValue,
        meta: { ...(goal.category.meta ?? {}), ...meta },
        updatedByUserId: 'local',
      });
    }
    return true;
  };

  const saveContribution = (goal: Goal, draft: ContributionDraft) => {
    const amount = parseAmount(draft.amount);
    if (!amount || amount <= 0) return false;
    const contribution: GoalContribution = {
      id: `goal-contribution-${Date.now()}`,
      amount,
      date: draft.date.trim() || todayKey(),
      note: draft.note.trim() || undefined,
    };
    categoriesRepo.update(goal.id, {
      meta: goalMeta(goal, {
        goalSaved: Math.min(goal.target, goal.saved + amount),
        goalContributions: [contribution, ...goal.contributions],
      }),
      updatedByUserId: 'local',
    });
    return true;
  };

  const markComplete = (goal: Goal) => {
    categoriesRepo.update(goal.id, {
      meta: goalMeta(goal, { goalSaved: goal.target, goalCompletedAt: todayKey() }),
      updatedByUserId: 'local',
    });
  };

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

          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <ScreenExitButton
              variant="back"
              onPress={onClose}
              tint={pWallpaper.text}
              fallbackBg="rgba(8,6,20,0.45)"
              accessibilityLabel="Back"
            />
            <Text style={[styles.headerTitle, { color: pWallpaper.text }]}>Goals</Text>
            <Pressable
              onPress={() => setFormGoal('new')}
              accessibilityRole="button"
              accessibilityLabel="Add goal"
              style={[styles.headerAdd, { backgroundColor: 'rgba(8,6,20,0.35)', borderColor: pWallpaper.hairline }]}
            >
              <Icon name="plus" size={17} color={pWallpaper.text} stroke={2} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: insets.top + 68,
              paddingHorizontal: LAYOUT.screenGutter,
              paddingBottom: insets.bottom + SPACE.xxxl,
            }}
            showsVerticalScrollIndicator={false}
          >
            {featured ? (
              <FeaturedGoal
                goal={featured}
                theme={theme}
                tint={teal}
                caution={caution}
                pWallpaper={pWallpaper}
                onOpen={() => setDetailGoalId(featured.id)}
                onContribute={() => setContributionGoalId(featured.id)}
              />
            ) : (
              <EmptyGoals theme={theme} tint={teal} p={p} onAdd={() => setFormGoal('new')} />
            )}

            {goals.length > 0 && (
              <>
                <SectionCard dark={theme.dark} style={{ marginBottom: SPACE.lg }}>
                  <View style={styles.totalHeader}>
                    <Text style={[TYPE.labelLg, { color: p.textTer }]}>TOTAL SAVED</Text>
                    <Text style={[TYPE.captionEm, { color: teal }]}>{totals.pct}% funded</Text>
                  </View>
                  <View style={styles.summaryAmountRow}>
                    <Money value={totals.saved} theme={theme} size={32} color={p.text} prefix="$" />
                    <Text style={[TYPE.subsectionTitle, { color: p.textSec, marginBottom: 3 }]}>
                      {' '}of ${totals.target.toLocaleString()}
                    </Text>
                  </View>
                  <ProgressBar pct={totals.pct} color={teal} trackColor={p.hairline} height={10} />
                </SectionCard>

                <SectionCard dark={theme.dark} noPad>
                  {goals.map((goal, i) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      theme={theme}
                      p={p}
                      tint={teal}
                      caution={caution}
                      last={i === goals.length - 1}
                      onPress={() => setDetailGoalId(goal.id)}
                    />
                  ))}
                </SectionCard>
              </>
            )}
          </ScrollView>

          <GoalDetailSheet
            theme={theme}
            goal={detailGoal}
            tint={teal}
            caution={caution}
            onClose={() => setDetailGoalId(null)}
            onAddContribution={(goal) => {
              setDetailGoalId(null);
              setContributionGoalId(goal.id);
            }}
            onEdit={(goal) => {
              setDetailGoalId(null);
              setFormGoal(goal);
            }}
            onComplete={markComplete}
          />
          <GoalFormSheet
            theme={theme}
            goal={formGoal}
            onClose={() => setFormGoal(null)}
            onSave={saveGoal}
          />
          <ContributionSheet
            theme={theme}
            goal={contributionGoal}
            onClose={() => setContributionGoalId(null)}
            onSave={saveContribution}
          />
        </ImageBackground>
      </View>
    </Animated.View>
  );
}

function FeaturedGoal({
  goal,
  theme,
  tint,
  caution,
  pWallpaper,
  onOpen,
  onContribute,
}: {
  goal: Goal;
  theme: Theme;
  tint: string;
  caution: string;
  pWallpaper: ReturnType<typeof makeP>;
  onOpen: () => void;
  onContribute: () => void;
}) {
  const pct = goal.target > 0 ? clampPct(Math.round((goal.saved / goal.target) * 100)) : 0;
  const remaining = Math.max(0, goal.target - goal.saved);
  const status = statusFor(goal);
  const needed = suggestedMonthly(goal.target, goal.saved, goal.deadline);
  const statusColor = status.tone === 'caution' ? caution : tint;

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${goal.label} goal`} style={styles.hero}>
      <View style={styles.heroTopRow}>
        <View style={[styles.statusPill, { backgroundColor: 'rgba(8,6,20,0.35)', borderColor: pWallpaper.hairline }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[TYPE.onMediaStatus, { color: pWallpaper.text }, DARK_TEXT_SHADOW]}>{status.label}</Text>
        </View>
        <Text style={[TYPE.onMediaStatusSub, { color: pWallpaper.textSec }, DARK_TEXT_SHADOW]}>
          {goal.deadline ? deadlineLabel(goal.deadline) : 'No target date'}
        </Text>
      </View>

      <View style={styles.heroMain}>
        <ProgressRing pct={pct} color={tint} trackColor={pWallpaper.hairline} size={172} stroke={10}>
          <View style={[styles.heroIcon, { backgroundColor: tint }]}>
            <Icon name={goal.icon} size={30} color={ON_GROUP_ICON} stroke={1.6} />
          </View>
          <Text style={[TYPE.headline, { color: pWallpaper.text, marginTop: SPACE.sm }, DARK_TEXT_SHADOW]} numberOfLines={1}>
            {goal.label}
          </Text>
          <Text style={[TYPE.captionEm, { color: pWallpaper.textSec }, DARK_TEXT_SHADOW]}>{pct}% funded</Text>
        </ProgressRing>
      </View>

      <View style={styles.heroAmountBlock}>
        <Money value={goal.saved} theme={theme} size={38} color={pWallpaper.text} prefix="$" />
        <Text style={[TYPE.bodySmEm, { color: pWallpaper.textSec, marginTop: SPACE.xs }, DARK_TEXT_SHADOW]}>
          {money0(remaining)} remaining of {money0(goal.target)}
        </Text>
      </View>

      <View style={styles.heroStats}>
        <HeroStat label="Monthly" value={goal.monthlyContribution ? money0(goal.monthlyContribution) : 'Unset'} />
        <HeroStat label="Needed" value={needed > 0 ? money0(needed) : 'Done'} />
        <HeroStat label="Activity" value={`${goal.contributions.length}`} />
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onContribute();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add contribution to ${goal.label}`}
        style={[styles.heroAction, { backgroundColor: pWallpaper.text, borderColor: pWallpaper.hairline }]}
      >
        <Icon name="plus" size={14} color={theme.bg} stroke={2.2} />
        <Text style={[TYPE.captionEm, { color: theme.bg }]}>Add contribution</Text>
      </Pressable>
    </Pressable>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={[TYPE.labelSm, { color: 'rgba(242,244,245,0.58)' }]}>{label}</Text>
      <Text style={[TYPE.subsectionTitle, { color: 'rgba(242,244,245,0.94)' }]}>{value}</Text>
    </View>
  );
}

function GoalRow({
  goal,
  theme,
  p,
  tint,
  caution,
  last,
  onPress,
}: {
  goal: Goal;
  theme: Theme;
  p: ReturnType<typeof makeP>;
  tint: string;
  caution: string;
  last: boolean;
  onPress: () => void;
}) {
  const pct = goal.target > 0 ? clampPct(Math.round((goal.saved / goal.target) * 100)) : 0;
  const remaining = Math.max(0, goal.target - goal.saved);
  const status = statusFor(goal);
  const statusColor = status.tone === 'caution' ? caution : tint;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${goal.label} goal`}
      style={({ pressed }) => [
        styles.goalRow,
        !last && { borderBottomColor: p.hairline, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { opacity: 0.62 },
      ]}
    >
      <View style={[styles.goalIcon, { backgroundColor: `${tint}26` }]}>
        <Icon name={goal.icon} size={16} color={tint} stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.goalTitleRow}>
          <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{goal.label}</Text>
          <View style={[styles.smallStatus, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[TYPE.labelSmPlain, { color: statusColor }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.goalBarRow}>
          <ProgressBar pct={pct} color={tint} trackColor={p.hairline} height={5} />
        </View>
        <Text style={[TYPE.caption, { color: p.textSec, marginTop: SPACE.xs }]}>
          {money0(remaining)} to go · {pct}% · {goal.deadline ? deadlineLabel(goal.deadline) : 'no date'}
        </Text>
      </View>
      <View style={styles.goalAmounts}>
        <Money value={goal.saved} theme={theme} size={15} color={p.text} prefix="$" />
        <Icon name="chevR" size={13} color={p.textTer} stroke={2.1} />
      </View>
    </Pressable>
  );
}

function EmptyGoals({ theme, tint, p, onAdd }: { theme: Theme; tint: string; p: ReturnType<typeof makeP>; onAdd: () => void }) {
  return (
    <SectionCard dark={theme.dark} style={{ marginBottom: SPACE.lg }}>
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIcon, { backgroundColor: tint }]}>
          <Icon name="target" size={22} color={ON_GROUP_ICON} stroke={1.6} />
        </View>
        <Text style={[TYPE.subsectionTitle, { color: p.text, marginTop: SPACE.md, textAlign: 'center' }]}>
          No goals yet
        </Text>
        <Text style={[TYPE.bodySm, { color: p.textSec, marginTop: SPACE.xs, textAlign: 'center' }]}>
          Create a goal for any savings plan, then track contributions here.
        </Text>
        <SheetPrimaryButton label="Add goal" onPress={onAdd} theme={theme} style={{ marginTop: SPACE.lg }} />
      </View>
    </SectionCard>
  );
}

function GoalDetailSheet({
  theme,
  goal,
  tint,
  caution,
  onClose,
  onAddContribution,
  onEdit,
  onComplete,
}: {
  theme: Theme;
  goal: Goal | null;
  tint: string;
  caution: string;
  onClose: () => void;
  onAddContribution: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  useEffect(() => {
    if (goal) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [goal]);
  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.42} pressBehavior="close" />
  );
  const status = goal ? statusFor(goal) : null;

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['74%']}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {goal && (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <ScreenExitButton variant="close" onPress={onClose} tint={theme.textSec} fallbackBg={theme.chipBg} style={EXIT_FLOAT_STYLE} />
          <View style={styles.sheetHeroCenter}>
            <View style={[styles.sheetIcon, { backgroundColor: tint }]}>
              <Icon name={goal.icon} size={24} color={ON_GROUP_ICON} stroke={1.6} />
            </View>
            <Text style={[TYPE.headline, { color: theme.text, marginTop: SPACE.sm }]}>{goal.label}</Text>
            <Text style={[TYPE.bodySm, { color: theme.textSec, marginTop: SPACE.xs }]}>
              {status?.label} · {goal.deadline ? deadlineLabel(goal.deadline) : 'No target date'}
            </Text>
          </View>

          <View style={[styles.detailStatGrid, { borderColor: theme.hairline }]}>
            <DetailStat label="Saved" value={money0(goal.saved)} color={theme.text} />
            <DetailStat label="Remaining" value={money0(Math.max(0, goal.target - goal.saved))} color={theme.text} />
            <DetailStat label="Monthly" value={goal.monthlyContribution ? money0(goal.monthlyContribution) : 'Unset'} color={theme.text} />
            <DetailStat label="Needed" value={money0(suggestedMonthly(goal.target, goal.saved, goal.deadline))} color={status?.tone === 'caution' ? caution : tint} />
          </View>

          <SheetPrimaryButton label="Add contribution" onPress={() => onAddContribution(goal)} theme={theme} style={{ marginTop: SPACE.lg }} />
          <Pressable onPress={() => onEdit(goal)} accessibilityRole="button" style={styles.sheetSecondary}>
            <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>Edit goal</Text>
            <Icon name="chevR" size={13} color={theme.accent.dot} stroke={2.2} />
          </Pressable>
          {goal.saved < goal.target && (
            <Pressable onPress={() => onComplete(goal)} accessibilityRole="button" style={styles.sheetSecondary}>
              <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>Mark complete</Text>
              <Icon name="check" size={13} color={theme.accent.dot} stroke={2.2} />
            </Pressable>
          )}

          <Text style={[TYPE.labelLg, { color: theme.textTer, marginTop: SPACE.xl, marginBottom: SPACE.sm }]}>ACTIVITY</Text>
          {goal.contributions.length === 0 ? (
            <Text style={[TYPE.bodySm, { color: theme.textSec }]}>No contributions logged yet.</Text>
          ) : (
            <View style={[styles.activityCard, { backgroundColor: theme.chipBg }]}>
              {goal.contributions.map((item, idx) => (
                <View
                  key={item.id}
                  style={[
                    styles.activityRow,
                    idx < goal.contributions.length - 1 && { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[TYPE.body, { color: theme.text }]}>{money0(item.amount)}</Text>
                    <Text style={[TYPE.caption, { color: theme.textSec }]}>{item.note || 'Contribution'}</Text>
                  </View>
                  <Text style={[TYPE.bodySm, { color: theme.textTer }]}>{contributionDateLabel(item.date)}</Text>
                </View>
              ))}
            </View>
          )}
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}

function DetailStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.detailStat}>
      <Text style={[TYPE.labelSm, { color: 'rgba(142,142,147,0.9)' }]}>{label}</Text>
      <Text style={[TYPE.subsectionTitle, { color }]}>{value}</Text>
    </View>
  );
}

function GoalFormSheet({
  theme,
  goal,
  onClose,
  onSave,
}: {
  theme: Theme;
  goal: Goal | 'new' | null;
  onClose: () => void;
  onSave: (draft: GoalDraft, goal: Goal | 'new') => boolean;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState<GoalDraft>({ label: '', target: '', saved: '', deadline: '', monthlyContribution: '' });
  const [error, setError] = useState('');
  const isOpen = goal !== null;
  const editing = goal && goal !== 'new' ? goal : null;

  useEffect(() => {
    if (goal) {
      setDraft(goal === 'new'
        ? { label: '', target: '', saved: '', deadline: '', monthlyContribution: '' }
        : {
          label: goal.label,
          target: String(goal.target),
          saved: String(goal.saved),
          deadline: goal.deadline ?? '',
          monthlyContribution: goal.monthlyContribution ? String(goal.monthlyContribution) : '',
        });
      setError('');
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [goal]);

  const target = parseAmount(draft.target) ?? 0;
  const saved = parseAmount(draft.saved) ?? 0;
  const suggested = suggestedMonthly(target, saved, draft.deadline.trim());
  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.42} pressBehavior="close" />
  );
  const update = (key: keyof GoalDraft) => (value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    if (error) setError('');
  };
  const handleSave = () => {
    if (!goal) return;
    const ok = onSave(draft, goal);
    if (!ok) {
      setError('Add a name, target amount, and make sure saved is not above target.');
      return;
    }
    onClose();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['84%']}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {isOpen && (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ScreenExitButton variant="close" onPress={onClose} tint={theme.textSec} fallbackBg={theme.chipBg} style={EXIT_FLOAT_STYLE} />
          <Text style={[TYPE.headline, styles.sheetTitle, { color: theme.text }]}>{editing ? 'Edit goal' : 'Add goal'}</Text>
          <Text style={[TYPE.bodySm, { color: theme.textSec, textAlign: 'center', marginBottom: SPACE.lg }]}>
            Goals create a savings category automatically, then track progress here.
          </Text>

          <View style={[styles.formCard, { backgroundColor: theme.chipBg }]}>
            <Field label="Goal name" value={draft.label} onChangeText={update('label')} theme={theme} placeholder="Vacation fund" />
            <Field label="Target" value={draft.target} onChangeText={update('target')} theme={theme} placeholder="$0" keyboardType="decimal-pad" />
            <Field label="Saved so far" value={draft.saved} onChangeText={update('saved')} theme={theme} placeholder="$0" keyboardType="decimal-pad" />
            <Field label="Target date" value={draft.deadline} onChangeText={update('deadline')} theme={theme} placeholder="2026-12-31" />
            <Field label="Monthly plan" value={draft.monthlyContribution} onChangeText={update('monthlyContribution')} theme={theme} placeholder={suggested > 0 ? `${suggested}` : '$0'} keyboardType="decimal-pad" last />
          </View>

          {suggested > 0 && (
            <Text style={[TYPE.caption, { color: theme.textSec, marginTop: SPACE.sm }]}>
              Suggested plan: {money0(suggested)} per month.
            </Text>
          )}
          {error ? <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: SPACE.sm }]}>{error}</Text> : null}
          <SheetPrimaryButton label={editing ? 'Save goal' : 'Create goal'} onPress={handleSave} theme={theme} style={{ marginTop: SPACE.xl }} />
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}

function ContributionSheet({
  theme,
  goal,
  onClose,
  onSave,
}: {
  theme: Theme;
  goal: Goal | null;
  onClose: () => void;
  onSave: (goal: Goal, draft: ContributionDraft) => boolean;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState<ContributionDraft>({ amount: '', date: todayKey(), note: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (goal) {
      setDraft({ amount: '', date: todayKey(), note: '' });
      setError('');
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [goal]);

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.42} pressBehavior="close" />
  );
  const update = (key: keyof ContributionDraft) => (value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    if (error) setError('');
  };
  const handleSave = () => {
    if (!goal) return;
    const ok = onSave(goal, draft);
    if (!ok) {
      setError('Enter a contribution amount.');
      return;
    }
    onClose();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['58%']}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {goal && (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ScreenExitButton variant="close" onPress={onClose} tint={theme.textSec} fallbackBg={theme.chipBg} style={EXIT_FLOAT_STYLE} />
          <Text style={[TYPE.headline, styles.sheetTitle, { color: theme.text }]}>Add contribution</Text>
          <Text style={[TYPE.bodySm, { color: theme.textSec, textAlign: 'center', marginBottom: SPACE.lg }]}>{goal.label}</Text>
          <View style={[styles.formCard, { backgroundColor: theme.chipBg }]}>
            <Field label="Amount" value={draft.amount} onChangeText={update('amount')} theme={theme} placeholder="$0" keyboardType="decimal-pad" />
            <Field label="Date" value={draft.date} onChangeText={update('date')} theme={theme} placeholder={todayKey()} />
            <Field label="Note" value={draft.note} onChangeText={update('note')} theme={theme} placeholder="Paycheck transfer" last />
          </View>
          {error ? <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: SPACE.sm }]}>{error}</Text> : null}
          <SheetPrimaryButton label="Save contribution" onPress={handleSave} theme={theme} style={{ marginTop: SPACE.xl }} />
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  keyboardType,
  last,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: Theme;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, !last && { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[TYPE.body, { color: theme.textSec }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTer}
        keyboardType={keyboardType}
        keyboardAppearance={theme.dark ? 'dark' : 'light'}
        style={[TYPE.body, styles.fieldInput, { color: theme.text }]}
      />
    </View>
  );
}

function ProgressRing({
  pct,
  color,
  trackColor,
  size,
  stroke,
  children,
}: {
  pct: number;
  color: string;
  trackColor: string;
  size: number;
  stroke: number;
  children: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clampPct(pct) / 100) * circumference;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

function ProgressBar({ pct, color, trackColor, height }: { pct: number; color: string; trackColor: string; height: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${clampPct(pct)}%`, borderRadius: height / 2, backgroundColor: color }} />
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
  headerAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    minHeight: 430,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.xl,
    marginBottom: SPACE.lg,
  },
  heroTopRow: {
    minHeight: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACE.md,
  },
  statusPill: {
    minHeight: 32,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  heroMain: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.lg,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmountBlock: {
    alignItems: 'center',
    marginTop: SPACE.lg,
  },
  heroStats: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.lg,
  },
  heroStat: {
    flex: 1,
    borderRadius: RADIUS.field,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(8,6,20,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(235,239,242,0.16)',
  },
  heroAction: {
    alignSelf: 'center',
    minHeight: 42,
    marginTop: SPACE.lg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  totalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACE.xs,
    marginBottom: SPACE.md,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: LAYOUT.cardPadX,
    paddingVertical: SPACE.md,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  smallStatus: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 3,
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
    gap: SPACE.xs,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingHorizontal: LAYOUT.screenGutter,
    paddingTop: SPACE.xxxl,
    paddingBottom: SPACE.xxxl,
  },
  sheetTitle: {
    textAlign: 'center',
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
  },
  sheetHeroCenter: {
    alignItems: 'center',
    paddingTop: SPACE.lg,
  },
  sheetIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailStatGrid: {
    borderWidth: 1,
    borderRadius: RADIUS.field,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACE.xl,
    overflow: 'hidden',
  },
  detailStat: {
    width: '50%',
    padding: SPACE.lg,
    gap: SPACE.xs,
  },
  sheetSecondary: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  activityCard: {
    borderRadius: RADIUS.field,
    overflow: 'hidden',
  },
  activityRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  formCard: {
    borderRadius: RADIUS.field,
    overflow: 'hidden',
  },
  fieldRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  fieldInput: {
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
});
