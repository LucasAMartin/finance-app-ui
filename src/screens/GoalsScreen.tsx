import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  TextInput,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button as SwiftButton, DatePicker, Host, Menu } from '@expo/ui/swift-ui';
import { datePickerStyle, environment, tint } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetModalProvider,
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Easing as ReEasing } from 'react-native-reanimated';

import { CAUTION_AMBER, GROUP_COLORS, ON_GROUP_ICON, OVER_DOT, Theme, cautionText } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { makeP, makeScrim, deriveFloor } from '../wallpaperPalette';
import { SectionCard } from '../components/SectionCard';
import { SheetPrimaryButton, ProgressBar, Money, FIELD_CARD, FIELD_ROW } from '../components/shared';
import { MerchantMark } from '../components/MerchantMark';
import { PopupNumericKeypad } from '../components/PopupNumericKeypad';
import { applyKeypadKey } from '../components/NumericKeypad';
import { Icon } from '../components/Icon';
import {
  ScreenExitButton,
  EXIT_FLOAT_STYLE,
  EXIT_BTN_SIZE,
  GlassCircleButton,
  SUPPORTS_GLASS,
} from '../components/GlassButton';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';
import { CATEGORY_ICON_OPTIONS, ICON_DISPLAY_NAMES, inferCategoryIcon } from '../categoryIcons';
import {
  archivedGoalsFromCategories,
  clampPct,
  contributionDateLabel,
  contributionTotal,
  deadlineLabel,
  goalMeta,
  goalProgressPct,
  goalRemaining,
  goalsFromCategories,
  goalSavedFromParts,
  money0,
  monthDeltaVsDeadline,
  monthDistance,
  parseAmount,
  parseGoalDate,
  projectedFinishDate,
  statusFor,
  suggestedMonthly,
  todayKey,
  type Goal,
  type GoalContribution,
} from '../selectors/goals';

const ICON_SF_SYMBOL: Record<string, string> = {
  cart: 'cart', fork: 'fork.knife', car: 'car', bag: 'bag', doc: 'doc',
  film: 'film', home: 'house', wallet: 'wallet.pass', receipt: 'receipt',
  cards: 'creditcard', repeat: 'repeat', tag: 'tag', sparkle: 'sparkles',
  cup: 'cup.and.saucer', cal: 'calendar', note: 'note.text', chart: 'chart.bar',
  profile: 'person', bell: 'bell', sun: 'sun.max', moon: 'moon',
};

const fmtAmt = (n: number) => n % 1 !== 0 ? n.toFixed(2) : n.toLocaleString();
const formatGoalDraft = (draft: string): string => {
  if (!draft) return '0';
  const dot = draft.indexOf('.');
  const intRaw = dot === -1 ? draft : draft.slice(0, dot);
  const intGrouped = intRaw ? Number(intRaw).toLocaleString() : '0';
  return dot === -1 ? intGrouped : `${intGrouped}.${draft.slice(dot + 1)}`;
};

// Crisp ease-out settle for every goal sheet — matches TxSheet's feel instead of
// gorhom's default spring.
const SHEET_EASING = ReEasing.out(ReEasing.cubic);
const SHEET_ANIM_MS = 300;

// Date bridge for the native DatePicker. Goals store dates as `YYYY-MM-DD`
// strings; parseGoalDate reads them back at local noon, so round-trip through
// noon here too to avoid a UTC day-shift (mirrors IncomeFlow's toYMD).
const ymdFromDate = (d: Date): string => {
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  return noon.toISOString().slice(0, 10);
};

interface Props {
  theme: Theme;
  visible: boolean;
  contributeRequestToken?: number;
  onClose: () => void;
  onEditGoalCategory?: (catId: string) => void;
}

interface GoalDraft {
  label: string;
  target: string;
  deadline: string;
  monthlyContribution: string;
}

interface ContributionDraft {
  amount: string;
  date: string;
  note: string;
}

interface ContributionTarget {
  goalId: string;
}

export function GoalsScreen({ theme, visible, contributeRequestToken = 0, onClose, onEditGoalCategory }: Props) {
  const insets = useSafeAreaInsets();
  const { wallpaper, wallpaperFloorBase } = useTheme();
  const { categoriesRepo, transactionsRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const [formGoalOpen, setFormGoalOpen] = useState(false);
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const [contributionTarget, setContributionTarget] = useState<ContributionTarget | null>(null);
  const [contributionPickerOpen, setContributionPickerOpen] = useState(false);
  const lastContributeRequestRef = useRef(contributeRequestToken);
  const returningToDetailRef = useRef<string | null>(null);

  const goals = useMemo<Goal[]>(() => goalsFromCategories(categories), [categories]);
  const archivedGoals = useMemo<Goal[]>(() => archivedGoalsFromCategories(categories), [categories]);

  const allGoals = useMemo(() => [...goals, ...archivedGoals], [goals, archivedGoals]);
  const detailGoal = allGoals.find(goal => goal.id === detailGoalId) ?? null;
  const contributionGoal = allGoals.find(goal => goal.id === contributionTarget?.goalId) ?? null;

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
  const goalsBehind = goals.filter(goal => statusFor(goal).tone === 'caution').length;
  const goalSavedTotal = goals.reduce((sum, goal) => sum + goal.saved, 0);
  const monthlyPlanTotal = goals.reduce((sum, goal) => sum + (goal.monthlyContribution ?? 0), 0);

  const beginContribution = (goal: Goal) => {
    setContributionPickerOpen(false);
    setDetailGoalId(null);
    setFormGoalOpen(false);
    requestAnimationFrame(() => setContributionTarget({ goalId: goal.id }));
  };


  useEffect(() => {
    if (contributeRequestToken === lastContributeRequestRef.current) return;
    if (!visible) return;
    lastContributeRequestRef.current = contributeRequestToken;
    setContributionTarget(null);
    setDetailGoalId(null);
    setFormGoalOpen(false);

    if (goals.length === 0) {
      setFormGoalOpen(true);
    } else if (goals.length === 1) {
      beginContribution(goals[0]);
    } else {
      setContributionPickerOpen(true);
    }
  }, [contributeRequestToken, goals, visible]);

  const saveGoal = (draft: GoalDraft, _goal: 'new') => {
    const target = parseAmount(draft.target);
    const monthly = parseAmount(draft.monthlyContribution);
    if (!draft.label.trim() || !target) return false;
    const icon = inferCategoryIcon(draft.label) || 'wallet';
    const contributions: GoalContribution[] = [];
    const startingBalance = 0;
    const nextSaved = goalSavedFromParts(target, startingBalance, contributions);
    const monthlyValue = monthly ?? suggestedMonthly(target, nextSaved, draft.deadline.trim());
    const meta = {
      custom: true,
      goalTarget: target,
      goalStartingBalance: startingBalance,
      goalSaved: nextSaved,
      goalDeadline: draft.deadline.trim() || undefined,
      goalMonthlyContribution: monthlyValue > 0 ? monthlyValue : undefined,
      goalContributions: contributions,
      goalStatus: nextSaved >= target ? 'completed' : 'active',
      goalCompletedAt: nextSaved >= target ? todayKey() : undefined,
    };

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
    return true;
  };

  const contributionStatusPatch = (goal: Goal, saved: number) => {
    const completed = saved >= goal.target;
    return {
      goalSaved: saved,
      goalStatus: completed ? 'completed' : goal.status === 'paused' ? 'paused' : 'active',
      goalCompletedAt: completed ? (goal.completedAt ?? todayKey()) : undefined,
    };
  };

  const upsertContributionTransaction = (
    goal: Goal,
    contribution: GoalContribution,
    draft: ContributionDraft,
    occurredAt: Date,
  ) => {
    const meta = {
      kind: 'goal-contribution',
      goalId: goal.id,
      contributionId: contribution.id,
    };
    const txInput = {
      merchant: goal.label,
      cat: goal.id,
      amount: contribution.amount,
      note: draft.note.trim(),
      occurredAt: occurredAt.toISOString(),
      type: 'expense' as const,
      visibility: 'shared' as const,
      updatedByUserId: 'local',
      meta,
    };

    if (contribution.transactionId && transactionsRepo.get(contribution.transactionId)) {
      transactionsRepo.update(contribution.transactionId, txInput);
      return contribution.transactionId;
    }

    const tx = transactionsRepo.create({
      ...txInput,
      createdByUserId: 'local',
    });
    return tx.id;
  };

  const saveContribution = (goal: Goal, draft: ContributionDraft) => {
    const amount = parseAmount(draft.amount);
    if (!amount || amount <= 0) return false;
    const date = todayKey();
    const occurredAt = parseGoalDate(date);
    if (!occurredAt) return false;
    const contribution: GoalContribution = {
      id: `goal-contribution-${Date.now()}`,
      amount,
      date,
    };
    contribution.transactionId = upsertContributionTransaction(goal, contribution, draft, occurredAt);
    const contributions = [contribution, ...goal.contributions];
    const saved = goalSavedFromParts(goal.target, goal.startingBalance, contributions);
    categoriesRepo.update(goal.id, {
      meta: goalMeta(goal, {
        goalContributions: contributions,
        ...contributionStatusPatch(goal, saved),
      }),
      updatedByUserId: 'local',
    });
    return true;
  };

  const markComplete = (goal: Goal) => {
    const startingBalance = Math.max(0, goal.target - contributionTotal(goal.contributions));
    categoriesRepo.update(goal.id, {
      meta: goalMeta(goal, {
        goalStartingBalance: startingBalance,
        goalSaved: goal.target,
        goalStatus: 'completed',
        goalCompletedAt: todayKey(),
      }),
      updatedByUserId: 'local',
    });
  };

  const setGoalPaused = (goal: Goal, paused: boolean) => {
    categoriesRepo.update(goal.id, {
      meta: goalMeta(goal, {
        goalStatus: paused ? 'paused' : goal.saved >= goal.target ? 'completed' : 'active',
      }),
      updatedByUserId: 'local',
    });
  };

  const archiveGoal = (goal: Goal) => {
    categoriesRepo.update(goal.id, {
      meta: goalMeta(goal, {
        goalStatus: 'archived',
        goalArchivedAt: todayKey(),
      }),
      updatedByUserId: 'local',
    });
    setDetailGoalId(null);
  };

  const restoreGoal = (goal: Goal) => {
    const meta = { ...(goal.category.meta ?? {}) };
    meta.goalStatus = goal.saved >= goal.target ? 'completed' : 'active';
    delete meta.goalArchivedAt;
    categoriesRepo.update(goal.id, {
      meta,
      updatedByUserId: 'local',
    });
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 78, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: floorColor }]}>
        <BottomSheetModalProvider>
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
              {SUPPORTS_GLASS ? (
                <GlassCircleButton
                  onPress={() => setFormGoalOpen(true)}
                  systemImage="plus"
                  size={EXIT_BTN_SIZE}
                  iconSize={18}
                  iconColor={pWallpaper.text}
                  accessibilityLabel="Add goal"
                />
              ) : (
                <Pressable
                  onPress={() => setFormGoalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add goal"
                  style={[
                    styles.headerAdd,
                    { backgroundColor: 'rgba(8,6,20,0.40)', borderColor: pWallpaper.hairline },
                  ]}
                >
                  <Icon name="plus" size={17} color={pWallpaper.text} stroke={2} />
                </Pressable>
              )}
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
              {goals.length === 0 && archivedGoals.length === 0 ? (
                <EmptyGoals theme={theme} tint={teal} p={p} onAdd={() => setFormGoalOpen(true)} />
              ) : (
                <>
                  {goals.length > 0 && (
                    <GoalSummary
                      theme={theme}
                      p={p}
                      activeCount={goals.length}
                      savedTotal={goalSavedTotal}
                      monthlyPlan={monthlyPlanTotal}
                      behindCount={goalsBehind}
                      tint={teal}
                      caution={caution}
                    />
                  )}
                  {goals.length === 0 && (
                    <EmptyActiveGoals theme={theme} p={p} onAdd={() => setFormGoalOpen(true)} />
                  )}
                  {goals.map(goal => (
                    <Pressable
                      key={goal.id}
                      onPress={() => setDetailGoalId(goal.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${goal.label} goal`}
                      style={({ pressed }) => [
                        { marginBottom: SPACE.md },
                        pressed && { opacity: 0.72 },
                      ]}
                    >
                      <SectionCard dark={theme.dark}>
                        <GoalCard
                          goal={goal}
                          p={p}
                          tint={teal}
                          caution={caution}
                        />
                      </SectionCard>
                    </Pressable>
                  ))}
                  {archivedGoals.length > 0 && (
                    <>
                      <View style={styles.archivedHeader}>
                        <Text style={[TYPE.labelLg, { color: p.textTer }]}>ARCHIVED</Text>
                        <Text style={[TYPE.caption, { color: p.textTer }]}>
                          {archivedGoals.length}
                        </Text>
                      </View>
                      {archivedGoals.map(goal => (
                        <Pressable
                          key={goal.id}
                          onPress={() => setDetailGoalId(goal.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Open archived ${goal.label} goal`}
                          style={({ pressed }) => [
                            { marginBottom: SPACE.md, opacity: pressed ? 0.56 : 0.78 },
                          ]}
                        >
                          <SectionCard dark={theme.dark}>
                            <GoalCard
                              goal={goal}
                              p={p}
                              tint={teal}
                              caution={caution}
                            />
                          </SectionCard>
                        </Pressable>
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>

            <GoalDetailSheet
              theme={theme}
              goal={detailGoal}
              tint={teal}
              caution={caution}
              onClose={() => setDetailGoalId(null)}
              onAddContribution={goal => {
                returningToDetailRef.current = goal.id;
                setDetailGoalId(null);
                setContributionTarget({ goalId: goal.id });
              }}
              onEditCategory={goal => {
                setDetailGoalId(null);
                onEditGoalCategory?.(goal.id);
              }}
              onComplete={markComplete}
              onPauseToggle={goal => setGoalPaused(goal, goal.status !== 'paused')}
              onArchive={archiveGoal}
              onRestore={restoreGoal}
            />
            <GoalFormSheet
              theme={theme}
              open={formGoalOpen}
              onClose={() => setFormGoalOpen(false)}
              onSave={saveGoal}
            />
            <ContributionGoalPickerSheet
              theme={theme}
              open={contributionPickerOpen}
              goals={goals}
              tint={teal}
              caution={caution}
              onClose={() => setContributionPickerOpen(false)}
              onChoose={beginContribution}
            />
            <ContributionSheet
              theme={theme}
              goal={contributionGoal}
              onClose={() => {
                returningToDetailRef.current = null;
                setContributionTarget(null);
              }}
              onSave={saveContribution}
              onDidSave={() => {
                const goalId = returningToDetailRef.current;
                returningToDetailRef.current = null;
                if (goalId) setTimeout(() => setDetailGoalId(goalId), SHEET_ANIM_MS + 50);
              }}
            />
          </ImageBackground>
        </BottomSheetModalProvider>
      </View>
    </Animated.View>
  );
}

function GoalCard({
  goal,
  p,
  tint,
  caution,
}: {
  goal: Goal;
  p: ReturnType<typeof makeP>;
  tint: string;
  caution: string;
}) {
  const pct = goalProgressPct(goal);
  const remaining = goalRemaining(goal);
  const status = statusFor(goal);
  const statusColor =
    status.tone === 'caution' ? caution : status.tone === 'good' ? tint : p.textTer;

  const monthly = goal.monthlyContribution;
  const proj = monthly && remaining > 0 ? projectedFinishDate(goal) : null;
  const delta = proj ? monthDeltaVsDeadline(goal) : null;

  // Single-line footer: factual rate + deadline. Status (on track / behind) lives
  // in the badge above — no need to repeat pace signals here.
  let footerLine: string | null = null;
  let footerLineColor = p.textSec;

  if (goal.status === 'archived') {
    footerLine = goal.archivedAt
      ? `Archived ${contributionDateLabel(goal.archivedAt)}`
      : 'Archived';
    footerLineColor = p.textTer;
  } else if (remaining > 0) {
    if (monthly && monthly > 0) {
      footerLine = goal.deadline
        ? `${money0(monthly)}/mo · ${deadlineLabel(goal.deadline)}`
        : `${money0(monthly)}/mo`;
    } else if (goal.deadline) {
      footerLine = `Target ${deadlineLabel(goal.deadline)}`;
      footerLineColor = p.textTer;
    } else {
      footerLine = 'Add a target date and monthly amount';
      footerLineColor = p.textTer;
    }
  }

  return (
    <View>
      <View style={styles.cardTopRow}>
        <View style={[styles.cardIcon, { backgroundColor: `${tint}28` }]}>
          <Icon name={goal.icon} size={16} color={tint} stroke={1.6} />
        </View>
        <Text style={[TYPE.body, { color: p.text, flex: 1 }]} numberOfLines={1}>
          {goal.label}
        </Text>
        <View style={[styles.cardBadge, { backgroundColor: `${statusColor}22` }]}>
          <View style={[styles.cardBadgeDot, { backgroundColor: statusColor }]} />
          <Text style={[TYPE.captionEm, { color: statusColor }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.cardBarRow}>
        <View style={{ flex: 1 }}>
          <ProgressBar pct={pct} color={tint} trackColor={p.hairline} height={8} />
        </View>
        <Text style={[TYPE.captionEm, { color: p.textSec, marginLeft: SPACE.sm }]}>{pct}%</Text>
      </View>

      <View style={styles.cardAmountRow}>
        <Text style={[TYPE.bodySmEm, { color: p.text }]}>
          {money0(goal.saved)}
          <Text style={[TYPE.bodySm, { color: p.textSec }]}> of {money0(goal.target)}</Text>
        </Text>
        <Text style={[TYPE.bodySm, { color: p.textSec }]}>
          {remaining > 0 ? `${money0(remaining)} to go` : 'Complete'}
        </Text>
      </View>

      {footerLine ? (
        <Text style={[TYPE.caption, { color: footerLineColor, marginTop: SPACE.sm }]} numberOfLines={1}>
          {footerLine}
        </Text>
      ) : null}
    </View>
  );
}

function GoalTimeline({
  goal,
  tint,
  caution,
  theme,
}: {
  goal: Goal;
  tint: string;
  caution: string;
  theme: Theme;
}) {
  if (goal.saved >= goal.target) return null;

  const pct = goalProgressPct(goal);
  const proj = projectedFinishDate(goal);
  const delta = proj && goal.deadline ? monthDeltaVsDeadline(goal) : null;
  const isLate = delta !== null && delta > 0;
  const barColor = isLate ? caution : tint;

  if (!proj && !goal.deadline) return null;

  // Estimated finish: only annotate when behind (not when ahead).
  let finishLabel: string | null = null;
  if (proj) {
    if (isLate) {
      const n = delta!;
      finishLabel = `Est. ${proj.label} · ${n} ${n === 1 ? 'month' : 'months'} behind`;
    } else {
      finishLabel = `Est. ${proj.label}`;
    }
  }

  return (
    <View style={styles.timelineWrap}>
      <Text style={[TYPE.labelSm, { color: theme.textTer, marginBottom: SPACE.sm }]}>
        SAVINGS PROGRESS
      </Text>
      <ProgressBar pct={pct} color={barColor} trackColor={theme.hairline} height={8} />
      <View style={[styles.timelineLabelRow, { marginTop: SPACE.sm }]}>
        {finishLabel ? (
          <Text style={[TYPE.captionEm, { color: barColor, flex: 1 }]} numberOfLines={1}>
            {finishLabel}
          </Text>
        ) : <View style={{ flex: 1 }} />}
        {goal.deadline && (
          <Text style={[TYPE.caption, { color: theme.textTer }]}>
            Target {deadlineLabel(goal.deadline)}
          </Text>
        )}
      </View>
    </View>
  );
}

function EmptyGoals({
  theme,
  tint,
  p,
  onAdd,
}: {
  theme: Theme;
  tint: string;
  p: ReturnType<typeof makeP>;
  onAdd: () => void;
}) {
  return (
    <SectionCard dark={theme.dark} style={{ marginBottom: SPACE.lg }}>
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIcon, { backgroundColor: tint }]}>
          <Icon name="target" size={22} color={ON_GROUP_ICON} stroke={1.6} />
        </View>
        <Text
          style={[TYPE.subsectionTitle, { color: p.text, marginTop: SPACE.md, textAlign: 'center' }]}
        >
          No goals yet
        </Text>
        <Text
          style={[TYPE.bodySm, { color: p.textSec, marginTop: SPACE.xs, textAlign: 'center' }]}
        >
          Create a goal for any savings plan, then track contributions here.
        </Text>
        <SheetPrimaryButton
          label="Add goal"
          onPress={onAdd}
          theme={theme}
          style={{ marginTop: SPACE.lg }}
        />
      </View>
    </SectionCard>
  );
}

function GoalSummary({
  theme,
  p,
  activeCount,
  savedTotal,
  monthlyPlan,
  behindCount,
  tint,
  caution,
}: {
  theme: Theme;
  p: ReturnType<typeof makeP>;
  activeCount: number;
  savedTotal: number;
  monthlyPlan: number;
  behindCount: number;
  tint: string;
  caution: string;
}) {
  return (
    <SectionCard dark={theme.dark} style={{ marginBottom: SPACE.md }}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopRow}>
          <View>
            <Text style={[TYPE.labelLg, { color: p.textTer }]}>GOAL PLAN</Text>
            <Text style={[TYPE.sectionTitle, { color: p.text, marginTop: SPACE.xs }]}>
              {activeCount} active {activeCount === 1 ? 'goal' : 'goals'}
            </Text>
          </View>
          <View style={[styles.summaryStatusPill, { backgroundColor: `${behindCount > 0 ? caution : tint}1F` }]}>
            <View style={[styles.summaryStatusDot, { backgroundColor: behindCount > 0 ? caution : tint }]} />
            <Text style={[TYPE.captionEm, { color: behindCount > 0 ? caution : tint }]}>
              {behindCount > 0 ? `${behindCount} behind` : 'On track'}
            </Text>
          </View>
        </View>
        <View style={styles.summaryStatRow}>
          <SummaryStat label="Saved" value={money0(savedTotal)} color={p.text} labelColor={p.textTer} />
          <SummaryStat label="Monthly plan" value={money0(monthlyPlan)} color={p.text} labelColor={p.textTer} />
          <SummaryStat label="Attention" value={String(behindCount)} color={behindCount > 0 ? caution : p.text} labelColor={p.textTer} />
        </View>
      </View>
    </SectionCard>
  );
}

function SummaryStat({
  label,
  value,
  color,
  labelColor,
}: {
  label: string;
  value: string;
  color: string;
  labelColor: string;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[TYPE.labelSm, { color: labelColor }]}>{label}</Text>
      <Text style={[TYPE.subsectionTitle, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function EmptyActiveGoals({
  theme,
  p,
  onAdd,
}: {
  theme: Theme;
  p: ReturnType<typeof makeP>;
  onAdd: () => void;
}) {
  return (
    <SectionCard dark={theme.dark} style={{ marginBottom: SPACE.md }}>
      <View style={styles.emptyActiveWrap}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[TYPE.body, { color: p.text }]}>No active goals</Text>
          <Text style={[TYPE.caption, { color: p.textSec, marginTop: SPACE.px2 }]}>
            Restore an archived goal or start a new one.
          </Text>
        </View>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add goal"
          style={[styles.emptyActiveButton, { borderColor: p.hairline }]}
        >
          <Text style={[TYPE.captionEm, { color: p.text }]}>Add</Text>
        </Pressable>
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
  onEditCategory,
  onPauseToggle,
  onComplete,
  onArchive,
  onRestore,
}: {
  theme: Theme;
  goal: Goal | null;
  tint: string;
  caution: string;
  onClose: () => void;
  onAddContribution: (goal: Goal) => void;
  onEditCategory: (goal: Goal) => void;
  onPauseToggle: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
  onRestore: (goal: Goal) => void;
}) {
  const sheetRef = useRef<BottomSheet>(null);
  const animationConfigs = useBottomSheetTimingConfigs({ duration: SHEET_ANIM_MS, easing: SHEET_EASING });
  const openedRef = useRef(false);
  const closingRef = useRef(false);
  const closeSheet = () => {
    closingRef.current = true;
    sheetRef.current?.close();
  };
  useEffect(() => {
    if (goal) {
      openedRef.current = true;
      closingRef.current = false;
      requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
    } else {
      openedRef.current = false;
      closingRef.current = false;
      sheetRef.current?.close();
    }
  }, [goal]);
  const handleSheetChange = (index: number) => {
    if (index === -1 && (openedRef.current || closingRef.current)) {
      openedRef.current = false;
      closingRef.current = false;
      onClose();
    }
  };
  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.4}
      pressBehavior="close"
    />
  );
  const status = goal ? statusFor(goal) : null;
  const statusColor =
    status?.tone === 'caution' ? caution : status?.tone === 'good' ? tint : theme.textTer;
  const isArchived = goal?.status === 'archived';

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['93%']}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      animationConfigs={animationConfigs}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      containerStyle={styles.sheetModalContainer}
      backgroundStyle={{
        backgroundColor: theme.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
      }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {goal && (
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheetContent, { paddingTop: SPACE.md }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header row: close left, more menu right */}
          <View style={styles.sheetHeaderRow}>
            <ScreenExitButton
              variant="close"
              onPress={closeSheet}
              tint={theme.textSec}
              fallbackBg={theme.chipBg}
            />
            {!isArchived && (
              <Host ignoreSafeArea="all" style={{ width: EXIT_BTN_SIZE, height: EXIT_BTN_SIZE }}>
                <Menu
                  label={
                    <View style={[styles.moreBtn, { backgroundColor: theme.chipBg }]}>
                      <Icon name="ellipsis" size={15} color={theme.textSec} />
                    </View>
                  }
                >
                  <SwiftButton label="Edit goal" onPress={() => onEditCategory(goal)} />
                  <SwiftButton
                    label={goal.status === 'paused' ? 'Resume goal' : 'Pause goal'}
                    onPress={() => onPauseToggle(goal)}
                  />
                  {goal.saved < goal.target && (
                    <SwiftButton
                      label="Mark complete"
                      onPress={() => Alert.alert(
                        'Mark complete?',
                        `Mark "${goal.label}" as complete.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Mark complete', onPress: () => onComplete(goal) },
                        ],
                      )}
                    />
                  )}
                  <SwiftButton
                    label="Archive goal"
                    onPress={() => Alert.alert(
                      'Archive goal?',
                      `"${goal.label}" will be hidden from your active goals. You can restore it later.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Archive', style: 'destructive', onPress: () => { closeSheet(); onArchive(goal); } },
                      ],
                    )}
                  />
                </Menu>
              </Host>
            )}
          </View>

          <View style={[styles.sheetHeroCenter, { paddingTop: SPACE.md }]}>
            <View style={[styles.sheetIcon, { backgroundColor: tint }]}>
              <Icon name={goal.icon} size={24} color={ON_GROUP_ICON} stroke={1.6} />
            </View>
            <Text style={[TYPE.headline, { color: theme.text, marginTop: SPACE.sm }]}>
              {goal.label}
            </Text>
            <View style={styles.sheetStatusRow}>
              <View style={[styles.sheetStatusDot, { backgroundColor: statusColor }]} />
              <Text style={[TYPE.bodySm, { color: theme.textSec }]}>
                {status?.label}
                {status?.subtext ? `  ·  ${status.subtext}` : ''}
              </Text>
            </View>
          </View>

          <GoalTimeline goal={goal} tint={tint} caution={caution} theme={theme} />

          <View style={[styles.detailStatGrid, { borderColor: theme.hairline }]}>
            <DetailStat label="Saved" value={money0(goal.saved)} color={theme.text} labelColor={theme.textTer} />
            <DetailStat
              label="To go"
              value={money0(Math.max(0, goal.target - goal.saved))}
              color={theme.text}
              labelColor={theme.textTer}
            />
          </View>

          {!isArchived && <DeltaCallout goal={goal} tint={tint} caution={caution} theme={theme} />}

          {isArchived ? (
            <SheetPrimaryButton
              label="Restore goal"
              onPress={() => onRestore(goal)}
              theme={theme}
              style={{ marginTop: SPACE.lg }}
            />
          ) : (
            <SheetPrimaryButton
              label="Add contribution"
              onPress={() => onAddContribution(goal)}
              theme={theme}
              style={{ marginTop: SPACE.lg }}
            />
          )}

          {goal.contributions.length > 0 && (
            <>
              <Text style={[TYPE.labelLg, { color: theme.textTer, marginTop: SPACE.xl, marginBottom: SPACE.sm }]}>
                ACTIVITY
              </Text>
              <View style={[styles.activityCard, { backgroundColor: theme.chipBg }]}>
                {goal.contributions.map((item, idx) => (
                  <ContributionRow
                    key={item.id}
                    contribution={item}
                    goalLabel={goal.label}
                    tint={tint}
                    theme={theme}
                    last={idx === goal.contributions.length - 1}
                  />
                ))}
              </View>
            </>
          )}
        </BottomSheetScrollView>
      )}
    </BottomSheet>
  );
}

function DeltaCallout({
  goal,
  tint,
  caution,
  theme,
}: {
  goal: Goal;
  tint: string;
  caution: string;
  theme: Theme;
}) {
  if (!goal.monthlyContribution || !goal.deadline) return null;
  const needed = suggestedMonthly(goal.target, goal.saved, goal.deadline);
  const deficit = needed - goal.monthlyContribution;
  if (Math.abs(deficit) < 1) return null;
  const isDeficit = deficit > 0;
  const monthsAhead = isDeficit ? null : Math.abs(monthDeltaVsDeadline(goal) ?? 0);
  return (
    <View
      style={[
        styles.deltaCallout,
        { backgroundColor: isDeficit ? `${caution}18` : `${tint}18` },
      ]}
    >
      <Text style={[TYPE.bodySm, { color: isDeficit ? caution : tint }]}>
        {isDeficit
          ? `${money0(Math.ceil(deficit))}/mo more to stay on track.`
          : `${monthsAhead} ${monthsAhead === 1 ? 'month' : 'months'} ahead of target.`}
      </Text>
    </View>
  );
}

function DetailStat({
  label,
  value,
  color,
  labelColor,
}: {
  label: string;
  value: string;
  color: string;
  labelColor: string;
}) {
  return (
    <View style={styles.detailStat}>
      <Text style={[TYPE.labelSm, { color: labelColor }]}>{label}</Text>
      <Text style={[TYPE.subsectionTitle, { color }]}>{value}</Text>
    </View>
  );
}

function ContributionRow({
  contribution,
  goalLabel,
  tint,
  theme,
  last,
}: {
  contribution: GoalContribution;
  goalLabel: string;
  tint: string;
  theme: Theme;
  last: boolean;
}) {
  const meta = [
    contribution.note,
    contributionDateLabel(contribution.date),
  ].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.activityRow,
        !last && { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <MerchantMark
        merchant={goalLabel}
        catIcon="target"
        color={tint}
        size={32}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[TYPE.body, { color: theme.text }]} numberOfLines={1}>
          {goalLabel} contribution
        </Text>
        <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Money
        value={contribution.amount}
        size={13}
        weight="500"
        prefix="−$"
        color={tint}
        theme={theme}
      />
    </View>
  );
}

function EditCaret({ color }: { color: string }) {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 480, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return <Animated.View style={[styles.editCaret, { backgroundColor: color, opacity: blink }]} />;
}

function GoalAmountField({
  label,
  value,
  onPress,
  active,
  theme,
  last,
}: {
  label: string;
  value: string;
  onPress: () => void;
  active?: boolean;
  theme: Theme;
  last?: boolean;
}) {
  const raw = value.replace(/[$,\s]/g, '');
  const num = Number(raw);
  const hasValue = !!value;
  const sep = !last ? { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth } : {};

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label}`}
      style={[styles.fieldRow, sep]}
    >
      <Text style={[TYPE.body, { color: active ? theme.accent.dot : theme.textSec, flexShrink: 0 }]}>{label}</Text>
      {active ? (
        <View style={[styles.numFieldWrap, { borderBottomColor: theme.accent.dot }]}>
          <Text style={[styles.numFieldText, { color: theme.text }]}>
            <Text style={{ opacity: 0.55 }}>$</Text>{formatGoalDraft(value || '0')}
          </Text>
          <EditCaret color={theme.accent.dot} />
        </View>
      ) : (
        <View style={[styles.numFieldWrap, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.numFieldText, { color: hasValue ? theme.text : theme.hairline }]}>
            <Text style={{ opacity: 0.55 }}>$</Text>{hasValue ? fmtAmt(isNaN(num) ? 0 : num) : '0'}
          </Text>
          <View style={styles.numFieldCaretSpacer} />
        </View>
      )}
    </Pressable>
  );
}

function GoalFormSheet({
  theme,
  open,
  onClose,
  onSave,
}: {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  onSave: (draft: GoalDraft, goal: 'new') => boolean;
}) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const animationConfigs = useBottomSheetTimingConfigs({ duration: SHEET_ANIM_MS, easing: SHEET_EASING });
  const openedRef = useRef(false);
  const closingRef = useRef(false);
  const iconManuallySet = useRef(false);
  const labelRef = useRef<TextInput>(null);

  const [draft, setDraft] = useState<GoalDraft>({
    label: '', target: '', deadline: '', monthlyContribution: '',
  });
  const [icon, setIcon] = useState('wallet');
  const [error, setError] = useState('');
  const [keypadField, setKeypadField] = useState<'target' | 'monthlyContribution' | null>(null);

  const tealColor = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light;
  const darkScheme = theme.dark ? 'dark' : 'light';
  const target = parseAmount(draft.target) ?? 0;
  const suggested = suggestedMonthly(target, 0, draft.deadline.trim());

  useEffect(() => {
    if (open) {
      setDraft({ label: '', target: '', deadline: '', monthlyContribution: '' });
      setIcon('wallet');
      setError('');
      setKeypadField(null);
      iconManuallySet.current = false;
      openedRef.current = true;
      closingRef.current = false;
      requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
    } else {
      openedRef.current = false;
      closingRef.current = false;
      sheetRef.current?.close();
    }
  }, [open]);

  const handleSheetChange = (index: number) => {
    if (index === -1 && (openedRef.current || closingRef.current)) {
      openedRef.current = false;
      closingRef.current = false;
      setKeypadField(null);
      onClose();
    }
  };

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} pressBehavior="close" />
  );

  const openKeypad = (field: 'target' | 'monthlyContribution') => {
    Keyboard.dismiss();
    setKeypadField(field);
  };

  const handleSave = () => {
    const ok = onSave(draft, 'new');
    if (!ok) { setError('Add a name and target amount.'); return; }
    setKeypadField(null);
    onClose();
  };

  const sep = { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['85%']}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      animationConfigs={animationConfigs}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      containerStyle={styles.sheetModalContainer}
      backgroundStyle={{ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {open && (
        <View style={{ flex: 1 }}>
          <ScreenExitButton
            variant="close"
            onPress={() => { setKeypadField(null); onClose(); }}
            tint={theme.textSec}
            fallbackBg={theme.chipBg}
            style={[EXIT_FLOAT_STYLE, { zIndex: 25 }]}
          />

          <BottomSheetScrollView
            contentContainerStyle={[
              styles.goalFormContent,
              keypadField !== null && { paddingBottom: SPACE.xxxl + 360 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => { if (keypadField) setKeypadField(null); }}
          >
            {/* Hero: tappable icon circle + live name preview */}
            <View style={styles.goalFormHero}>
              <Host ignoreSafeArea="all" style={{ width: 52, height: 52 }}>
                <Menu
                  label={
                    <View style={{ width: 52, height: 52 }} accessibilityRole="button" accessibilityLabel="Choose icon">
                      <View style={[styles.goalFormCircle, { backgroundColor: tealColor }]}>
                        <Icon name={icon} size={22} color={ON_GROUP_ICON} stroke={1.5} />
                      </View>
                      <View style={[styles.goalFormIconBadge, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                        <Icon name="chevDown" size={7} color={theme.dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'} stroke={2.4} />
                      </View>
                    </View>
                  }
                >
                  {CATEGORY_ICON_OPTIONS.map(opt => (
                    <SwiftButton
                      key={opt}
                      systemImage={opt === icon ? 'checkmark' : (ICON_SF_SYMBOL[opt] ?? 'tag') as any}
                      onPress={() => { iconManuallySet.current = true; setIcon(opt); }}
                      label={ICON_DISPLAY_NAMES[opt] ?? opt}
                    />
                  ))}
                </Menu>
              </Host>
              <Text style={[TYPE.headline, { color: theme.text, textAlign: 'center', marginTop: 4 }]} numberOfLines={1}>
                {draft.label.trim() || 'New goal'}
              </Text>
            </View>

            {/* Field card: Name + Monthly plan */}
            <View style={[styles.formCard, { backgroundColor: theme.chipBg }]}>
              <Pressable
                onPress={() => { setKeypadField(null); labelRef.current?.focus(); }}
                style={[styles.fieldRow, sep]}
              >
                <Text style={[TYPE.body, { color: theme.textSec, flexShrink: 0 }]}>Name</Text>
                <TextInput
                  ref={labelRef}
                  value={draft.label}
                  onChangeText={text => {
                    setDraft(prev => ({ ...prev, label: text }));
                    if (!iconManuallySet.current) setIcon(inferCategoryIcon(text) || 'wallet');
                    if (error) setError('');
                  }}
                  placeholder="Vacation fund"
                  placeholderTextColor={theme.textTer}
                  keyboardAppearance={darkScheme}
                  returnKeyType="done"
                  selectTextOnFocus
                  onFocus={() => setKeypadField(null)}
                  style={[TYPE.body, { color: theme.text, flex: 1, textAlign: 'right', padding: 0 }]}
                />
              </Pressable>
              <GoalAmountField
                label="Monthly plan"
                value={draft.monthlyContribution}
                active={keypadField === 'monthlyContribution'}
                onPress={() => openKeypad('monthlyContribution')}
                theme={theme}
                last
              />
            </View>

            {/* Savings goal section */}
            <Text style={[TYPE.labelLg, { color: theme.textTer, marginTop: 20, marginBottom: 10 }]}>
              SAVINGS GOAL
            </Text>
            <View style={[styles.formCard, { backgroundColor: theme.chipBg }]}>
              <GoalAmountField
                label="Goal amount"
                value={draft.target}
                active={keypadField === 'target'}
                onPress={() => openKeypad('target')}
                theme={theme}
              />
              <DateField
                label="Goal by"
                value={draft.deadline}
                onChange={value => { setKeypadField(null); setDraft(prev => ({ ...prev, deadline: value })); }}
                onClear={() => setDraft(prev => ({ ...prev, deadline: '' }))}
                theme={theme}
                placeholderLabel="Set date"
                last
              />
            </View>

            {target > 0 && (
              <View style={styles.goalFormPreview}>
                <View style={[styles.goalTrack, { backgroundColor: theme.hairline }]} />
                <Text style={[TYPE.caption, { color: theme.textSec }]}>
                  ${target.toLocaleString()} goal
                  {suggested > 0 ? `  ·  ${money0(suggested)}/mo suggested` : ''}
                </Text>
              </View>
            )}

            {error ? (
              <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: SPACE.sm }]}>{error}</Text>
            ) : null}
          </BottomSheetScrollView>

          <View style={[styles.goalFormFooter, { paddingBottom: Math.max(insets.bottom, SPACE.lg) + SPACE.sm }]}>
            <SheetPrimaryButton label="Create goal" onPress={handleSave} theme={theme} />
          </View>

          <PopupNumericKeypad
            visible={keypadField !== null}
            theme={theme}
            onKey={key => {
              const field = keypadField;
              if (!field) return;
              setDraft(prev => ({ ...prev, [field]: applyKeypadKey(prev[field], key) }));
            }}
            onDone={() => setKeypadField(null)}
            passthrough
          />
        </View>
      )}
    </BottomSheet>
  );
}

function ContributionGoalPickerSheet({
  theme,
  open,
  goals,
  tint,
  caution,
  onClose,
  onChoose,
}: {
  theme: Theme;
  open: boolean;
  goals: Goal[];
  tint: string;
  caution: string;
  onClose: () => void;
  onChoose: (goal: Goal) => void;
}) {
  const sheetRef = useRef<BottomSheet>(null);
  const animationConfigs = useBottomSheetTimingConfigs({ duration: SHEET_ANIM_MS, easing: SHEET_EASING });
  const openedRef = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (open) {
      openedRef.current = true;
      closingRef.current = false;
      requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
    } else {
      openedRef.current = false;
      closingRef.current = false;
      sheetRef.current?.close();
    }
  }, [open]);

  const handleSheetChange = (index: number) => {
    if (index === -1 && (openedRef.current || closingRef.current)) {
      openedRef.current = false;
      closingRef.current = false;
      onClose();
    }
  };

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.4}
      pressBehavior="close"
    />
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['58%', '78%']}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      animationConfigs={animationConfigs}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      containerStyle={styles.sheetModalContainer}
      backgroundStyle={{
        backgroundColor: theme.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
      }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {open && (
        <BottomSheetScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <ScreenExitButton
            variant="close"
            onPress={onClose}
            tint={theme.textSec}
            fallbackBg={theme.chipBg}
            style={EXIT_FLOAT_STYLE}
          />
          <Text style={[TYPE.pageTitle, styles.sheetTitle, { color: theme.text }]}>
            Contribute to goal
          </Text>
          <Text
            style={[
              TYPE.bodySm,
              { color: theme.textSec, textAlign: 'center', marginBottom: SPACE.lg },
            ]}
          >
            Choose which savings goal this expense should count toward.
          </Text>

          <View style={[styles.pickerCard, { backgroundColor: theme.chipBg }]}>
            {goals.map((goal, idx) => {
              const pct = goalProgressPct(goal);
              const status = statusFor(goal);
              const statusColor =
                status.tone === 'caution' ? caution : status.tone === 'good' ? tint : theme.textTer;
              return (
                <Pressable
                  key={goal.id}
                  onPress={() => onChoose(goal)}
                  accessibilityRole="button"
                  accessibilityLabel={`Contribute to ${goal.label}`}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    idx < goals.length - 1 && {
                      borderBottomColor: theme.sep,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                    pressed && { opacity: 0.68 },
                  ]}
                >
                  <View style={[styles.pickerIcon, { backgroundColor: `${tint}28` }]}>
                    <Icon name={goal.icon} size={16} color={tint} stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.pickerTitleRow}>
                      <Text style={[TYPE.body, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                        {goal.label}
                      </Text>
                      <Text style={[TYPE.captionEm, { color: statusColor }]}>{status.label}</Text>
                    </View>
                    <Text style={[TYPE.caption, { color: theme.textSec, marginTop: SPACE.px2 }]}>
                      {money0(goal.saved)} of {money0(goal.target)} · {pct}%
                    </Text>
                    <View style={{ marginTop: SPACE.xs }}>
                      <ProgressBar pct={pct} color={tint} trackColor={theme.hairline} height={5} />
                    </View>
                  </View>
                  <Icon name="chevR" size={13} color={theme.textTer} stroke={2.1} />
                </Pressable>
              );
            })}
          </View>
        </BottomSheetScrollView>
      )}
    </BottomSheet>
  );
}

function ContributionSheet({
  theme,
  goal,
  onClose,
  onSave,
  onDidSave,
}: {
  theme: Theme;
  goal: Goal | null;
  onClose: () => void;
  onSave: (goal: Goal, draft: ContributionDraft) => boolean;
  onDidSave?: () => void;
}) {
  const sheetRef = useRef<BottomSheet>(null);
  const animationConfigs = useBottomSheetTimingConfigs({ duration: SHEET_ANIM_MS, easing: SHEET_EASING });
  const openedRef = useRef(false);
  const closingRef = useRef(false);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (goal) {
      setAmount('');
      openedRef.current = true;
      closingRef.current = false;
      requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
    } else {
      openedRef.current = false;
      closingRef.current = false;
      sheetRef.current?.close();
    }
  }, [goal]);

  const handleSheetChange = (index: number) => {
    if (index === -1 && (openedRef.current || closingRef.current)) {
      openedRef.current = false;
      closingRef.current = false;
      onClose();
    }
  };

  const handleSave = () => {
    if (!goal) return;
    const ok = onSave(goal, { amount, date: todayKey(), note: '' });
    if (ok) {
      onDidSave?.();
      onClose();
    }
  };

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.4}
      pressBehavior="close"
    />
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={[560]}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      animationConfigs={animationConfigs}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      containerStyle={styles.sheetModalContainer}
      backgroundStyle={{
        backgroundColor: theme.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
      }}
      handleIndicatorStyle={{ backgroundColor: theme.textTer }}
    >
      {goal && (
        <View style={{ flex: 1 }}>
          <BottomSheetScrollView
            contentContainerStyle={[styles.sheetContent, { paddingBottom: SPACE.xxxl + 300 }]}
            scrollEnabled={false}
          >
            <ScreenExitButton
              variant="close"
              onPress={onClose}
              tint={theme.textSec}
              fallbackBg={theme.chipBg}
              style={EXIT_FLOAT_STYLE}
            />
            <Text style={[TYPE.pageTitle, styles.sheetTitle, { color: theme.text }]}>
              Add contribution
            </Text>
            <Text style={[TYPE.bodySm, { color: theme.textSec, textAlign: 'center', marginBottom: SPACE.xl }]}>
              {goal.label}
            </Text>
            <Text style={{ fontSize: 40, fontWeight: '600', letterSpacing: -1.4, color: theme.text, textAlign: 'center' }}>
              ${amount || '0'}
            </Text>
            <SheetPrimaryButton
              label="Save"
              onPress={handleSave}
              theme={theme}
              disabled={!amount || amount === '0'}
              style={{ marginTop: SPACE.xl }}
            />
          </BottomSheetScrollView>
          <PopupNumericKeypad
            visible
            theme={theme}
            onKey={key => setAmount(prev => applyKeypadKey(prev, key))}
            onDone={handleSave}
            passthrough
            hideDone
          />
        </View>
      )}
    </BottomSheet>
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
    <View
      style={[
        styles.fieldRow,
        !last && { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
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

function AmountField({
  label,
  value,
  onPress,
  active,
  theme,
  placeholder = '0',
  last,
}: {
  label: string;
  value: string;
  onPress: () => void;
  active?: boolean;
  theme: Theme;
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label}`}
      style={[
        styles.fieldRow,
        !last && { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[TYPE.body, { color: active ? theme.accent.dot : theme.textSec }]}>{label}</Text>
      <Text style={[TYPE.body, styles.fieldInput, { color: value ? theme.text : theme.textTer }]}>
        <Text style={{ color: theme.textSec }}>$</Text>
        {value || placeholder}
      </Text>
    </Pressable>
  );
}

function DateField({
  label,
  value,
  onChange,
  onClear,
  theme,
  placeholderLabel,
  last,
}: {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  onClear?: () => void;
  theme: Theme;
  placeholderLabel?: string;
  last?: boolean;
}) {
  const selected = parseGoalDate(value);
  const darkScheme = theme.dark ? 'dark' : 'light';
  return (
    <View
      style={[
        styles.fieldRow,
        !last && { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[TYPE.body, { color: theme.textSec }]}>{label}</Text>
      {selected ? (
        <View style={styles.dateFieldValue}>
          <Host matchContents ignoreSafeArea="all">
            <DatePicker
              selection={selected}
              onDateChange={d => onChange(ymdFromDate(d))}
              displayedComponents={['date']}
              modifiers={[
                datePickerStyle('compact'),
                tint(theme.accent.dot),
                environment({ key: 'colorScheme', value: darkScheme }),
              ]}
            />
          </Host>
          {onClear ? (
            <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
              <Icon name="close" size={11} color={theme.textTer} stroke={2} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => onChange(ymdFromDate(new Date()))}
          accessibilityRole="button"
          style={styles.dateFieldSet}
        >
          <Text style={[TYPE.bodySm, { color: theme.accent.dot }]}>
            {placeholderLabel ?? 'Set date'}
          </Text>
        </Pressable>
      )}
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
  summaryCard: {
    paddingBottom: SPACE.sm,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  summaryStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  summaryStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryStatRow: {
    flexDirection: 'row',
    marginTop: SPACE.lg,
    gap: SPACE.sm,
  },
  summaryStat: {
    flex: 1,
    gap: SPACE.xs,
  },
  archivedHeader: {
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
    paddingHorizontal: SPACE.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // GoalCard
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
  },
  cardBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  cardAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Timeline
  timelineWrap: {
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
  },
  timelineLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: SPACE.xs,
  },
  // Detail sheet
  deltaCallout: {
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    marginTop: SPACE.md,
  },
  sheetStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginTop: SPACE.xs,
  },
  sheetStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // Shared sheet
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
  emptyActiveWrap: {
    minHeight: 74,
    paddingHorizontal: LAYOUT.cardPadX,
    paddingVertical: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  emptyActiveButton: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingHorizontal: LAYOUT.cardPadX,
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
  sheetModalContainer: {
    zIndex: 900,
    elevation: 900,
  },
  detailStatGrid: {
    borderWidth: 1,
    borderRadius: RADIUS.field,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACE.lg,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: LAYOUT.rowPadY,
  },
  pickerCard: {
    borderRadius: RADIUS.field,
    overflow: 'hidden',
  },
  pickerRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  pickerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  formCard: FIELD_CARD,
  fieldRow: FIELD_ROW,
  fieldInput: {
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  dateFieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  dateFieldSet: {
    minHeight: 34,
    justifyContent: 'center',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.xs,
  },
  moreBtn: {
    width: EXIT_BTN_SIZE,
    height: EXIT_BTN_SIZE,
    borderRadius: EXIT_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalFormContent: {
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: 24,
    paddingBottom: SPACE.lg,
  },
  goalFormHero: {
    alignItems: 'center',
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.lg,
  },
  goalFormCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalFormIconBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  goalFormPreview: {
    marginTop: SPACE.md,
    gap: SPACE.sm,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  goalFormFooter: {
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.md,
  },
  numFieldWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 0,
    borderBottomWidth: 1,
    paddingBottom: 1,
  },
  numFieldText: {
    ...TYPE.subsectionTitle,
  },
  numFieldCaretSpacer: {
    width: 3,
  },
  editCaret: {
    width: 2,
    height: 17,
    borderRadius: 1,
    marginLeft: 1,
  },
});
