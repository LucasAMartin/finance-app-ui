import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Host, TextInput as NativeTextInput } from '@expo/ui';
import {
  Button as SwiftButton,
  Text as SwiftText,
  Toggle as SwiftToggle,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  contentShape,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { useTheme } from '../ThemeProvider';
import { formatMoney } from '../selectors/format';
import { GROUP_COLORS, Theme } from '../theme';
import type { GroupKey } from '../repositories/types';
import { FONT_WEIGHT, TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';

type ShareIntent = 'solo' | 'shareLater';
type PageKey = 'welcome' | 'profile' | 'income' | 'plan' | 'sync' | 'preview';

type OnboardingBudgetItem = {
  id: string;
  label: string;
  icon: string;
  group: GroupKey;
  defaultAmount: number;
  recurringMerchant?: string;
  recurringDay?: number;
};

export type OnboardingBudgetDraft = {
  id: string;
  label: string;
  icon: string;
  group: GroupKey;
  amount: number;
};

export type OnboardingRecurringDraft = {
  categoryId: string;
  merchant: string;
  amount: number;
  dayOfMonth: number;
};

export interface OnboardingDraft {
  name: string;
  monthlyIncome: number;
  budgets: OnboardingBudgetDraft[];
  recurringRules: OnboardingRecurringDraft[];
  iCloudSyncEnabled: boolean;
  shareIntent: ShareIntent;
}

interface Props {
  theme: Theme;
  visible: boolean;
  allowDismiss?: boolean;
  memberName?: string;
  initialMonthlyIncome?: number;
  initialBudgetAmounts?: Record<string, number>;
  iCloudSyncEnabled: boolean;
  onComplete: (draft: OnboardingDraft) => void;
  onSkip: () => void;
  onClose?: () => void;
}

const PAGES: PageKey[] = ['welcome', 'profile', 'income', 'plan', 'sync', 'preview'];

const BUDGET_ITEMS: OnboardingBudgetItem[] = [
  { id: 'housing', label: 'Housing', icon: 'home', group: 'needs', defaultAmount: 1350, recurringMerchant: 'Housing', recurringDay: 1 },
  { id: 'groceries', label: 'Groceries', icon: 'cart', group: 'needs', defaultAmount: 500 },
  { id: 'transport', label: 'Transport', icon: 'car', group: 'needs', defaultAmount: 360 },
  { id: 'bills', label: 'Utilities', icon: 'doc', group: 'needs', defaultAmount: 240, recurringMerchant: 'Utilities', recurringDay: 8 },
  { id: 'dining', label: 'Dining', icon: 'fork', group: 'wants', defaultAmount: 440 },
  { id: 'shopping', label: 'Shopping', icon: 'bag', group: 'wants', defaultAmount: 300 },
  { id: 'entertainment', label: 'Entertainment', icon: 'film', group: 'wants', defaultAmount: 180, recurringMerchant: 'Subscriptions', recurringDay: 5 },
  { id: 'emergency-fund', label: 'Emergency fund', icon: 'wallet', group: 'savings', defaultAmount: 650 },
  { id: 'retirement', label: 'Retirement', icon: 'repeat', group: 'savings', defaultAmount: 415 },
];

const GROUP_LABELS: Record<GroupKey, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

const GROUP_TARGETS: Record<GroupKey, number> = {
  needs: 0.5,
  wants: 0.3,
  savings: 0.2,
};

export function OnboardingFlow({
  theme,
  visible,
  allowDismiss = false,
  memberName,
  initialMonthlyIncome,
  initialBudgetAmounts,
  iCloudSyncEnabled,
  onComplete,
  onSkip,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { currency } = useTheme();
  const pageWidth = Math.max(320, width);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useSharedValue(0);
  const footerOpacity = useSharedValue(1);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(() => displayInitialName(memberName));
  const [incomeText, setIncomeText] = useState(() => amountToText(initialMonthlyIncome ?? 5200));
  const [budgetTextById, setBudgetTextById] = useState<Record<string, string>>(() => (
    Object.fromEntries(
      BUDGET_ITEMS.map(item => [
        item.id,
        amountToText(initialBudgetAmounts?.[item.id] ?? item.defaultAmount),
      ]),
    )
  ));
  const [recurringById, setRecurringById] = useState<Record<string, boolean>>(() => ({
    housing: true,
    bills: true,
    entertainment: true,
  }));
  const [syncEnabled, setSyncEnabled] = useState(iCloudSyncEnabled);
  const [shareIntent, setShareIntent] = useState<ShareIntent>('solo');

  const monthlyIncome = parseAmount(incomeText);
  const budgetDrafts = useMemo(() => BUDGET_ITEMS.map(item => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    group: item.group,
    amount: parseAmount(budgetTextById[item.id]),
  })), [budgetTextById]);
  const groupTotals = useMemo(() => groupBudgetTotals(budgetDrafts), [budgetDrafts]);
  const totalBudget = groupTotals.needs + groupTotals.wants + groupTotals.savings;
  const recurringCount = Object.entries(recurringById).filter(([id, enabled]) => {
    const item = BUDGET_ITEMS.find(candidate => candidate.id === id);
    return enabled && item?.recurringMerchant && parseAmount(budgetTextById[id]) > 0;
  }).length;
  const incomeReady = monthlyIncome > 0;
  const canContinue = PAGES[step] !== 'income' || incomeReady;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: event => {
      const next = Math.round(event.contentOffset.x / pageWidth);
      runOnJS(setStep)(Math.max(0, Math.min(PAGES.length - 1, next)));
    },
  });

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: footerOpacity.value,
    transform: [{ translateY: interpolate(footerOpacity.value, [0, 1], [8, 0]) }],
  }));

  if (!visible) return null;

  const navigateToStep = (next: number) => {
    const clamped = Math.max(0, Math.min(PAGES.length - 1, next));
    if (clamped === step) return;
    Haptics.selectionAsync().catch(() => {});
    footerOpacity.value = withTiming(0.76, { duration: 80 }, () => {
      footerOpacity.value = withTiming(1, { duration: 170 });
    });
    setStep(clamped);
    scrollRef.current?.scrollTo({ x: clamped * pageWidth, animated: true });
  };

  const complete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onComplete({
      name: name.trim(),
      monthlyIncome,
      budgets: budgetDrafts,
      recurringRules: BUDGET_ITEMS
        .filter(item => item.recurringMerchant && item.recurringDay && recurringById[item.id])
        .map(item => ({
          categoryId: item.id,
          merchant: item.recurringMerchant!,
          dayOfMonth: item.recurringDay!,
          amount: parseAmount(budgetTextById[item.id]),
        }))
        .filter(rule => rule.amount > 0),
      iCloudSyncEnabled: syncEnabled,
      shareIntent,
    });
  };

  const handlePrimary = () => {
    if (!canContinue) return;
    if (step === PAGES.length - 1) {
      complete();
      return;
    }
    navigateToStep(step + 1);
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setStep(Math.max(0, Math.min(PAGES.length - 1, next)));
  };

  const handleShareIntentChange = (intent: ShareIntent) => {
    setShareIntent(intent);
    if (intent === 'shareLater') setSyncEnabled(true);
    Haptics.selectionAsync().catch(() => {});
  };

  const topInset = insets.top + (height < 720 ? SPACE.sm : SPACE.lg);
  const bottomInset = Math.max(insets.bottom, SPACE.md);
  const pageBottom = bottomInset + 112;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: topInset }]}>
          <ProgressDots
            theme={theme}
            pageCount={PAGES.length}
            pageWidth={pageWidth}
            scrollX={scrollX}
          />
          {allowDismiss && onClose ? (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close onboarding"
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: theme.chipBg,
                  opacity: pressed ? 0.62 : 1,
                },
              ]}
            >
              <Icon name="close" size={17} color={theme.text} stroke={1.8} />
            </Pressable>
          ) : <View style={styles.closeButtonSpace} />}
        </View>

        <Animated.ScrollView
          ref={scrollRef as React.RefObject<Animated.ScrollView>}
          horizontal
          pagingEnabled
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          onMomentumScrollEnd={handleMomentumEnd}
          style={styles.pager}
        >
          <OnboardingPage index={0} width={pageWidth} scrollX={scrollX} bottomInset={pageBottom}>
            <WelcomePage theme={theme} monthlyIncome={monthlyIncome} />
          </OnboardingPage>
          <OnboardingPage index={1} width={pageWidth} scrollX={scrollX} bottomInset={pageBottom}>
            <ProfilePage theme={theme} name={name} onNameChange={setName} />
          </OnboardingPage>
          <OnboardingPage index={2} width={pageWidth} scrollX={scrollX} bottomInset={pageBottom}>
            <IncomePage
              theme={theme}
              incomeText={incomeText}
              monthlyIncome={monthlyIncome}
              currencySymbol={currency.symbol}
              onIncomeTextChange={(value) => setIncomeText(sanitizeAmountText(value))}
            />
          </OnboardingPage>
          <OnboardingPage index={3} width={pageWidth} scrollX={scrollX} bottomInset={pageBottom}>
            <PlanPage
              theme={theme}
              budgetTextById={budgetTextById}
              monthlyIncome={monthlyIncome}
              currencySymbol={currency.symbol}
              onBudgetTextChange={(id, value) => {
                setBudgetTextById(current => ({ ...current, [id]: sanitizeAmountText(value) }));
              }}
            />
          </OnboardingPage>
          <OnboardingPage index={4} width={pageWidth} scrollX={scrollX} bottomInset={pageBottom}>
            <SyncPage
              theme={theme}
              syncEnabled={syncEnabled}
              shareIntent={shareIntent}
              recurringById={recurringById}
              budgetTextById={budgetTextById}
              onSyncEnabledChange={setSyncEnabled}
              onShareIntentChange={handleShareIntentChange}
              onRecurringChange={(id, enabled) => {
                setRecurringById(current => ({ ...current, [id]: enabled }));
              }}
            />
          </OnboardingPage>
          <OnboardingPage index={5} width={pageWidth} scrollX={scrollX} bottomInset={pageBottom}>
            <PreviewPage
              theme={theme}
              monthlyIncome={monthlyIncome}
              groupTotals={groupTotals}
              totalBudget={totalBudget}
              syncEnabled={syncEnabled}
              shareIntent={shareIntent}
              recurringCount={recurringCount}
            />
          </OnboardingPage>
        </Animated.ScrollView>

        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.footer,
            footerAnimatedStyle,
            {
              paddingBottom: bottomInset + SPACE.md,
              backgroundColor: theme.bg,
              borderTopColor: theme.sep,
            },
          ]}
        >
          <View style={styles.footerButtons}>
            {step > 0 ? (
              <NativeButton
                theme={theme}
                label="Back"
                variant="secondary"
                onPress={() => navigateToStep(step - 1)}
              />
            ) : (
              <Pressable
                onPress={onSkip}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.skipButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Text style={[TYPE.bodySmEm, { color: theme.textSec }]}>
                  {allowDismiss ? 'Close preview' : 'Set up later'}
                </Text>
              </Pressable>
            )}
            <NativeButton
              theme={theme}
              label={step === 0 ? 'Get started' : step === PAGES.length - 1 ? 'Start trial' : 'Continue'}
              variant="primary"
              disabled={!canContinue}
              onPress={handlePrimary}
            />
          </View>
          {!incomeReady && PAGES[step] === 'income' ? (
            <Text style={[TYPE.caption, styles.footerHint, { color: theme.textTer }]}>
              Add a monthly income to continue.
            </Text>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function OnboardingPage({
  index,
  width,
  bottomInset,
  scrollX,
  children,
}: {
  index: number;
  width: number;
  bottomInset: number;
  scrollX: SharedValue<number>;
  children: React.ReactNode;
}) {
  const pageStyle = useAnimatedStyle(() => {
    const pageProgress = scrollX.value / width;
    const distance = Math.abs(pageProgress - index);
    return {
      opacity: interpolate(distance, [0, 0.7, 1.2], [1, 0.6, 0.25], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(distance, [0, 1], [0, 18], Extrapolation.CLAMP) },
        { scale: interpolate(distance, [0, 1], [1, 0.96], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={[styles.page, { width }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.pageScroll, { paddingBottom: bottomInset }]}
      >
        <Animated.View style={[styles.pageInner, pageStyle]}>
          {children}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function WelcomePage({ theme, monthlyIncome }: { theme: Theme; monthlyIncome: number }) {
  return (
    <View style={styles.centerPage}>
      <BudgetOrbit theme={theme} />
      <View style={styles.centerCopy}>
        <Text style={[TYPE.display, styles.centerTitle, { color: theme.text }]}>
          A clearer month in about a minute
        </Text>
        <Text style={[TYPE.bodyRegular, styles.centerSubtitle, { color: theme.textSec }]}>
          Build a starting ledger around income, fixed costs, savings, and optional iCloud sync.
        </Text>
      </View>
      <View style={styles.previewChips}>
        <SoftPill theme={theme} label="50% needs" color={GROUP_COLORS.needs.vibrant} />
        <SoftPill theme={theme} label="30% wants" color={GROUP_COLORS.wants.vibrant} />
        <SoftPill theme={theme} label="20% savings" color={GROUP_COLORS.savings.vibrant} />
      </View>
      {monthlyIncome > 0 ? (
        <Text style={[TYPE.caption, { color: theme.textTer }]}>
          Current estimate: {formatMoney(monthlyIncome, false)} per month
        </Text>
      ) : null}
    </View>
  );
}

function ProfilePage({
  theme,
  name,
  onNameChange,
}: {
  theme: Theme;
  name: string;
  onNameChange: (value: string) => void;
}) {
  return (
    <View style={styles.formPage}>
      <PageIntro
        theme={theme}
        eyebrow="Profile"
        title="What should we call you?"
        subtitle="This is used for your profile and shared ledger membership."
      />
      <NativeField
        theme={theme}
        label="First name"
        placeholder="Name"
        defaultValue={name}
        onChangeText={onNameChange}
        autoCapitalize="words"
      />
      <InlineSystemNote
        theme={theme}
        icon="profile"
        title="Private by default"
        detail="Nothing is shared unless you enable iCloud sharing later."
      />
    </View>
  );
}

function IncomePage({
  theme,
  incomeText,
  monthlyIncome,
  currencySymbol,
  onIncomeTextChange,
}: {
  theme: Theme;
  incomeText: string;
  monthlyIncome: number;
  currencySymbol: string;
  onIncomeTextChange: (value: string) => void;
}) {
  return (
    <View style={styles.formPage}>
      <PageIntro
        theme={theme}
        eyebrow="Income"
        title="Anchor the budget."
        subtitle="One monthly number powers the targets across Home, Budget, and Insights."
      />
      <NativeAmountField
        theme={theme}
        label="Monthly income"
        value={incomeText}
        currencySymbol={currencySymbol}
        onChangeText={onIncomeTextChange}
        autoFocus
      />
      <View style={styles.targetGrid}>
        {(['needs', 'wants', 'savings'] as GroupKey[]).map(group => (
          <TargetTile
            key={group}
            theme={theme}
            group={group}
            amount={monthlyIncome * GROUP_TARGETS[group]}
          />
        ))}
      </View>
    </View>
  );
}

function PlanPage({
  theme,
  budgetTextById,
  monthlyIncome,
  currencySymbol,
  onBudgetTextChange,
}: {
  theme: Theme;
  budgetTextById: Record<string, string>;
  monthlyIncome: number;
  currencySymbol: string;
  onBudgetTextChange: (id: string, value: string) => void;
}) {
  return (
    <View style={styles.formPage}>
      <PageIntro
        theme={theme}
        eyebrow="Plan"
        title="Make the month feel real."
        subtitle="Rough numbers are enough. These become editable category budgets."
      />
      {(['needs', 'wants', 'savings'] as GroupKey[]).map(group => {
        const groupItems = BUDGET_ITEMS.filter(item => item.group === group);
        const total = groupItems.reduce((sum, item) => sum + parseAmount(budgetTextById[item.id]), 0);
        const target = monthlyIncome * GROUP_TARGETS[group];
        return (
          <PlanGroup
            key={group}
            theme={theme}
            group={group}
            total={total}
            target={target}
          >
            {groupItems.map(item => (
              <NativeAmountRow
                key={item.id}
                theme={theme}
                icon={item.icon}
                label={item.label}
                value={budgetTextById[item.id] ?? ''}
                currencySymbol={currencySymbol}
                onChangeText={(value) => onBudgetTextChange(item.id, value)}
              />
            ))}
          </PlanGroup>
        );
      })}
    </View>
  );
}

function SyncPage({
  theme,
  syncEnabled,
  shareIntent,
  recurringById,
  budgetTextById,
  onSyncEnabledChange,
  onShareIntentChange,
  onRecurringChange,
}: {
  theme: Theme;
  syncEnabled: boolean;
  shareIntent: ShareIntent;
  recurringById: Record<string, boolean>;
  budgetTextById: Record<string, string>;
  onSyncEnabledChange: (enabled: boolean) => void;
  onShareIntentChange: (intent: ShareIntent) => void;
  onRecurringChange: (id: string, enabled: boolean) => void;
}) {
  const recurringItems = BUDGET_ITEMS.filter(item => item.recurringMerchant && item.recurringDay);

  return (
    <View style={styles.formPage}>
      <PageIntro
        theme={theme}
        eyebrow="Sync"
        title="Decide how this ledger travels."
        subtitle="You can keep it local, sync privately, or prepare it for sharing."
      />
      <NativeToggleRow
        theme={theme}
        label="iCloud sync"
        detail="Use iCloud to keep the ledger available on your devices."
        systemImage="icloud"
        value={syncEnabled}
        onValueChange={onSyncEnabledChange}
      />
      <View style={styles.choiceRow}>
        <ChoiceTile
          theme={theme}
          title="Just me"
          detail="Private ledger"
          icon="profile"
          selected={shareIntent === 'solo'}
          onPress={() => onShareIntentChange('solo')}
        />
        <ChoiceTile
          theme={theme}
          title="Share later"
          detail="iCloud ready"
          icon="cards"
          selected={shareIntent === 'shareLater'}
          onPress={() => onShareIntentChange('shareLater')}
        />
      </View>
      <View style={styles.nativeGroup}>
        <Text style={[TYPE.label, styles.groupLabel, { color: theme.textTer }]}>Recurring</Text>
        {recurringItems.map((item, index) => (
          <NativeToggleRow
            key={item.id}
            theme={theme}
            label={item.recurringMerchant ?? item.label}
            detail={`${formatMoney(parseAmount(budgetTextById[item.id]), false)} monthly`}
            systemImage={systemImageForCategory(item.id)}
            value={!!recurringById[item.id]}
            onValueChange={(enabled) => onRecurringChange(item.id, enabled)}
            separated={index > 0}
          />
        ))}
      </View>
    </View>
  );
}

function PreviewPage({
  theme,
  monthlyIncome,
  groupTotals,
  totalBudget,
  syncEnabled,
  shareIntent,
  recurringCount,
}: {
  theme: Theme;
  monthlyIncome: number;
  groupTotals: Record<GroupKey, number>;
  totalBudget: number;
  syncEnabled: boolean;
  shareIntent: ShareIntent;
  recurringCount: number;
}) {
  return (
    <View style={styles.formPage}>
      <PageIntro
        theme={theme}
        eyebrow="Preview"
        title="Your starting point is ready."
        subtitle="The app will open with these targets, categories, and sync settings."
      />
      <View style={[styles.previewPanel, { backgroundColor: theme.surface }]}>
        <View style={styles.previewHeader}>
          <View>
            <Text style={[TYPE.captionEm, { color: theme.textTer }]}>Monthly income</Text>
            <Text style={[TYPE.display, styles.previewAmount, { color: theme.text }]}>
              {formatMoney(monthlyIncome, false)}
            </Text>
          </View>
          <View style={styles.previewPlanned}>
            <Text style={[TYPE.captionEm, { color: theme.textTer }]}>Planned</Text>
            <Text style={[TYPE.headline, { color: theme.text }]}>{formatMoney(totalBudget, false)}</Text>
          </View>
        </View>
        <View style={styles.previewBarStack}>
          {(['needs', 'wants', 'savings'] as GroupKey[]).map(group => (
            <PreviewBar
              key={group}
              theme={theme}
              group={group}
              amount={groupTotals[group]}
              income={monthlyIncome}
            />
          ))}
        </View>
      </View>
      <View style={styles.summaryList}>
        <SummaryRow theme={theme} icon="repeat" label="Recurring" value={`${recurringCount} monthly`} />
        <SummaryRow theme={theme} icon="cloud" label="Sync" value={syncEnabled ? 'iCloud' : 'Local'} />
        <SummaryRow theme={theme} icon="profile" label="Ledger" value={shareIntent === 'shareLater' ? 'Ready to share' : 'Private'} />
      </View>
    </View>
  );
}

function PageIntro({
  theme,
  eyebrow,
  title,
  subtitle,
}: {
  theme: Theme;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.pageIntro}>
      <Text style={[TYPE.label, { color: theme.textTer }]}>{eyebrow}</Text>
      <Text style={[TYPE.display, styles.pageTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[TYPE.bodyRegular, styles.pageSubtitle, { color: theme.textSec }]}>{subtitle}</Text>
    </View>
  );
}

function ProgressDots({
  theme,
  pageCount,
  pageWidth,
  scrollX,
}: {
  theme: Theme;
  pageCount: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
}) {
  return (
    <View style={styles.progressDots}>
      {Array.from({ length: pageCount }).map((_, index) => (
        <ProgressDot
          key={index}
          theme={theme}
          index={index}
          pageWidth={pageWidth}
          scrollX={scrollX}
        />
      ))}
    </View>
  );
}

function ProgressDot({
  theme,
  index,
  pageWidth,
  scrollX,
}: {
  theme: Theme;
  index: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
}) {
  const dotStyle = useAnimatedStyle(() => {
    const pageProgress = scrollX.value / pageWidth;
    const distance = Math.abs(pageProgress - index);
    return {
      width: interpolate(distance, [0, 1], [24, 7], Extrapolation.CLAMP),
      opacity: interpolate(distance, [0, 1], [1, 0.42], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      style={[
        styles.progressDot,
        { backgroundColor: theme.text },
        dotStyle,
      ]}
    />
  );
}

function BudgetOrbit({ theme }: { theme: Theme }) {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[styles.orbit, { backgroundColor: theme.surface }]}
    >
      <View style={[styles.orbitCenter, { backgroundColor: theme.bg }]}>
        <Text style={[TYPE.labelSmPlain, { color: theme.textTer }]}>50/30/20</Text>
        <Text style={[TYPE.headline, { color: theme.text }]}>Plan</Text>
      </View>
      <View style={[styles.orbitBar, styles.orbitBarNeeds, { backgroundColor: GROUP_COLORS.needs.vibrant }]} />
      <View style={[styles.orbitBar, styles.orbitBarWants, { backgroundColor: GROUP_COLORS.wants.vibrant }]} />
      <View style={[styles.orbitBar, styles.orbitBarSavings, { backgroundColor: GROUP_COLORS.savings.vibrant }]} />
      <View style={[styles.orbitChip, styles.orbitChipNeeds, { backgroundColor: GROUP_COLORS.needs.vibrant }]}>
        <Text style={styles.orbitChipText}>Needs</Text>
      </View>
      <View style={[styles.orbitChip, styles.orbitChipWants, { backgroundColor: GROUP_COLORS.wants.vibrant }]}>
        <Text style={styles.orbitChipText}>Wants</Text>
      </View>
      <View style={[styles.orbitChip, styles.orbitChipSavings, { backgroundColor: GROUP_COLORS.savings.vibrant }]}>
        <Text style={styles.orbitChipText}>Savings</Text>
      </View>
    </Animated.View>
  );
}

function NativeField({
  theme,
  label,
  placeholder,
  defaultValue,
  autoCapitalize,
  onChangeText,
}: {
  theme: Theme;
  label: string;
  placeholder: string;
  defaultValue: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={[styles.nativeFieldShell, { backgroundColor: theme.surface }]}>
      <Text style={[TYPE.captionEm, { color: theme.textTer }]}>{label}</Text>
      <Host ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'} style={styles.nativeTextInputHost}>
        <NativeTextInput
          defaultValue={defaultValue}
          placeholder={placeholder}
          placeholderTextColor={theme.textTer}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType="done"
          selectionColor={theme.accent.dot}
          textStyle={{
            fontSize: 22,
            fontWeight: FONT_WEIGHT.semibold,
            color: theme.text,
          }}
          style={styles.nativeTextInput}
        />
      </Host>
    </View>
  );
}

function NativeAmountField({
  theme,
  label,
  value,
  currencySymbol,
  autoFocus,
  onChangeText,
}: {
  theme: Theme;
  label: string;
  value: string;
  currencySymbol: string;
  autoFocus?: boolean;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={[styles.amountShell, { backgroundColor: theme.surface }]}>
      <Text style={[TYPE.captionEm, { color: theme.textTer }]}>{label}</Text>
      <View style={styles.amountFieldRow}>
        <Text style={[styles.amountSymbol, { color: theme.textSec }]}>{currencySymbol}</Text>
        <Host ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'} style={styles.amountInputHost}>
          <NativeTextInput
            defaultValue={value}
            placeholder="0"
            placeholderTextColor={theme.textTer}
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus={autoFocus}
            onChangeText={onChangeText}
            selectionColor={theme.accent.dot}
            textAlign="left"
            textStyle={{
              fontSize: 44,
              fontWeight: FONT_WEIGHT.bold,
              color: theme.text,
            }}
            style={styles.amountNativeInput}
          />
        </Host>
      </View>
    </View>
  );
}

function NativeAmountRow({
  theme,
  icon,
  label,
  value,
  currencySymbol,
  onChangeText,
}: {
  theme: Theme;
  icon: string;
  label: string;
  value: string;
  currencySymbol: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={[styles.amountRow, { borderTopColor: theme.sep }]}>
      <View style={styles.amountRowLabel}>
        <View style={[styles.rowIcon, { backgroundColor: theme.chipBg }]}>
          <Icon name={icon} size={15} color={theme.text} stroke={1.5} />
        </View>
        <Text style={[TYPE.bodySmEm, { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.rowAmountInput}>
        <Text style={[TYPE.bodySmEm, { color: theme.textSec }]}>{currencySymbol}</Text>
        <Host ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'} style={styles.rowNativeInputHost}>
          <NativeTextInput
            defaultValue={value}
            placeholder="0"
            placeholderTextColor={theme.textTer}
            keyboardType="decimal-pad"
            inputMode="decimal"
            onChangeText={onChangeText}
            selectionColor={theme.accent.dot}
            textAlign="right"
            textStyle={{
              fontSize: 14,
              fontWeight: FONT_WEIGHT.semibold,
              color: theme.text,
              textAlign: 'right',
            }}
            style={styles.rowNativeInput}
          />
        </Host>
      </View>
    </View>
  );
}

function NativeToggleRow({
  theme,
  label,
  detail,
  systemImage,
  value,
  separated,
  onValueChange,
}: {
  theme: Theme;
  label: string;
  detail: string;
  systemImage: React.ComponentProps<typeof SwiftToggle>['systemImage'];
  value: boolean;
  separated?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[
      styles.toggleShell,
      { backgroundColor: theme.surface },
      separated ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.sep } : null,
    ]}>
      <Host ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'} style={styles.nativeToggleHost}>
        <SwiftToggle
          label={label}
          systemImage={systemImage}
          isOn={value}
          onIsOnChange={(next) => {
            Haptics.selectionAsync().catch(() => {});
            onValueChange(next);
          }}
          modifiers={[tint(theme.text)]}
        />
      </Host>
      <Text style={[TYPE.caption, styles.toggleDetail, { color: theme.textSec }]}>{detail}</Text>
    </View>
  );
}

function NativeButton({
  theme,
  label,
  variant,
  disabled = false,
  onPress,
}: {
  theme: Theme;
  label: string;
  variant: 'primary' | 'secondary';
  disabled?: boolean;
  onPress: () => void;
}) {
  const [buttonWidth, setButtonWidth] = useState(0);
  const primary = variant === 'primary';

  return (
    <View
      style={[styles.nativeButtonWrap, primary ? styles.primaryButtonWrap : styles.secondaryButtonWrap]}
      onLayout={(event) => setButtonWidth(event.nativeEvent.layout.width)}
    >
      {buttonWidth > 0 ? (
        <Host ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'} style={{ width: buttonWidth, height: 54 }}>
          <SwiftButton
            onPress={onPress}
            modifiers={[
              buttonStyle(primary ? 'borderedProminent' : 'bordered'),
              controlSize('large'),
              tint(theme.text),
              disabledModifier(disabled),
            ]}
          >
            <SwiftText
              modifiers={[
                frame({ width: buttonWidth, height: 54 }),
                contentShape(shapes.rectangle()),
                font({ size: 17, weight: 'semibold' }),
                foregroundStyle(primary ? theme.bg : theme.text),
              ]}
            >
              {label}
            </SwiftText>
          </SwiftButton>
        </Host>
      ) : null}
    </View>
  );
}

function TargetTile({
  theme,
  group,
  amount,
}: {
  theme: Theme;
  group: GroupKey;
  amount: number;
}) {
  return (
    <View style={[styles.targetTile, { backgroundColor: theme.surface }]}>
      <View style={[styles.targetDot, { backgroundColor: GROUP_COLORS[group].vibrant }]} />
      <Text style={[TYPE.captionEm, { color: theme.textTer }]}>{GROUP_LABELS[group]}</Text>
      <Text style={[TYPE.bodySmEm, { color: theme.text }]}>{formatMoney(amount, false)}</Text>
    </View>
  );
}

function PlanGroup({
  theme,
  group,
  total,
  target,
  children,
}: {
  theme: Theme;
  group: GroupKey;
  total: number;
  target: number;
  children: React.ReactNode;
}) {
  const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0;
  return (
    <View style={[styles.planGroup, { backgroundColor: theme.surface }]}>
      <View style={styles.planGroupHeader}>
        <View style={styles.groupTitleLine}>
          <View style={[styles.groupDot, { backgroundColor: GROUP_COLORS[group].vibrant }]} />
          <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>{GROUP_LABELS[group]}</Text>
        </View>
        <Text style={[TYPE.bodySmEm, { color: theme.textSec }]}>{formatMoney(total, false)}</Text>
      </View>
      <View style={[styles.planTrack, { backgroundColor: theme.chipBg }]}>
        <View style={[styles.planFill, { width: `${pct}%`, backgroundColor: GROUP_COLORS[group].vibrant }]} />
      </View>
      <View style={styles.planRows}>{children}</View>
    </View>
  );
}

function ChoiceTile({
  theme,
  title,
  detail,
  icon,
  selected,
  onPress,
}: {
  theme: Theme;
  title: string;
  detail: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.choiceTile,
        {
          backgroundColor: selected ? theme.text : theme.surface,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon name={icon} size={19} color={selected ? theme.bg : theme.text} stroke={1.6} />
      <Text style={[TYPE.subsectionTitle, { color: selected ? theme.bg : theme.text }]}>{title}</Text>
      <Text style={[TYPE.caption, { color: selected ? theme.bg : theme.textSec }]}>{detail}</Text>
    </Pressable>
  );
}

function InlineSystemNote({
  theme,
  icon,
  title,
  detail,
}: {
  theme: Theme;
  icon: string;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.inlineNote}>
      <View style={[styles.rowIcon, { backgroundColor: theme.chipBg }]}>
        <Icon name={icon} size={15} color={theme.text} stroke={1.5} />
      </View>
      <View style={styles.inlineNoteCopy}>
        <Text style={[TYPE.bodySmEm, { color: theme.text }]}>{title}</Text>
        <Text style={[TYPE.caption, { color: theme.textSec }]}>{detail}</Text>
      </View>
    </View>
  );
}

function SoftPill({ theme, label, color }: { theme: Theme; label: string; color: string }) {
  return (
    <View style={[styles.softPill, { backgroundColor: theme.chipBg }]}>
      <View style={[styles.softPillDot, { backgroundColor: color }]} />
      <Text style={[TYPE.captionEm, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

function PreviewBar({
  theme,
  group,
  amount,
  income,
}: {
  theme: Theme;
  group: GroupKey;
  amount: number;
  income: number;
}) {
  const pct = income > 0 ? Math.min(100, (amount / income) * 100) : 0;
  return (
    <View style={styles.previewBarRow}>
      <View style={styles.previewBarMeta}>
        <View style={styles.groupTitleLine}>
          <View style={[styles.groupDot, { backgroundColor: GROUP_COLORS[group].vibrant }]} />
          <Text style={[TYPE.bodySmEm, { color: theme.text }]}>{GROUP_LABELS[group]}</Text>
        </View>
        <Text style={[TYPE.bodySmEm, { color: theme.textSec }]}>{formatMoney(amount, false)}</Text>
      </View>
      <View style={[styles.previewTrack, { backgroundColor: theme.chipBg }]}>
        <View style={[styles.previewFill, { width: `${pct}%`, backgroundColor: GROUP_COLORS[group].vibrant }]} />
      </View>
    </View>
  );
}

function SummaryRow({
  theme,
  icon,
  label,
  value,
}: {
  theme: Theme;
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.summaryRow, { backgroundColor: theme.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.chipBg }]}>
        <Icon name={icon} size={15} color={theme.text} stroke={1.5} />
      </View>
      <Text style={[TYPE.bodySmEm, styles.summaryLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[TYPE.bodySm, { color: theme.textSec }]}>{value}</Text>
    </View>
  );
}

function displayInitialName(name?: string) {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'alex') return '';
  return trimmed;
}

function amountToText(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (Math.abs(amount - Math.round(amount)) < 0.005) return String(Math.round(amount));
  return amount.toFixed(2).replace(/\.?0+$/, '');
}

function sanitizeAmountText(value: string) {
  const clean = value.replace(/[^\d.]/g, '');
  const [whole, ...rest] = clean.split('.');
  const fraction = rest.join('').slice(0, 2);
  return rest.length > 0 ? `${whole}.${fraction}` : whole;
}

function parseAmount(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupBudgetTotals(items: OnboardingBudgetDraft[]) {
  return items.reduce<Record<GroupKey, number>>(
    (totals, item) => {
      totals[item.group] += item.amount;
      return totals;
    },
    { needs: 0, wants: 0, savings: 0 },
  );
}

function systemImageForCategory(id: string): React.ComponentProps<typeof SwiftToggle>['systemImage'] {
  if (id === 'housing') return 'house';
  if (id === 'bills') return 'doc.text';
  return 'repeat';
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  flex: {
    flex: 1,
  },
  header: {
    minHeight: 54,
    paddingHorizontal: LAYOUT.screenGutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  progressDot: {
    height: 7,
    borderRadius: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonSpace: {
    width: 36,
    height: 36,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageScroll: {
    flexGrow: 1,
    paddingHorizontal: LAYOUT.screenGutter,
    paddingTop: SPACE.lg,
  },
  pageInner: {
    flex: 1,
  },
  centerPage: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xxl,
    paddingTop: SPACE.xxxl,
  },
  centerCopy: {
    width: '100%',
    maxWidth: 340,
    gap: SPACE.md,
    alignItems: 'center',
  },
  centerTitle: {
    textAlign: 'center',
  },
  centerSubtitle: {
    textAlign: 'center',
    maxWidth: 310,
  },
  previewChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  formPage: {
    gap: SPACE.xl,
    paddingTop: SPACE.xxxl,
  },
  pageIntro: {
    gap: SPACE.sm,
    paddingBottom: SPACE.sm,
  },
  pageTitle: {
    maxWidth: 340,
  },
  pageSubtitle: {
    maxWidth: 360,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: SPACE.md,
    paddingHorizontal: LAYOUT.screenGutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACE.sm,
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  nativeButtonWrap: {
    height: 54,
  },
  primaryButtonWrap: {
    flex: 1,
  },
  secondaryButtonWrap: {
    width: 104,
  },
  skipButton: {
    width: 116,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerHint: {
    textAlign: 'right',
  },
  orbit: {
    width: 248,
    height: 248,
    borderRadius: 124,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orbitCenter: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  orbitBar: {
    position: 'absolute',
    height: 13,
    borderRadius: 7,
  },
  orbitBarNeeds: {
    width: 206,
    transform: [{ rotate: '-18deg' }],
    top: 62,
    left: 20,
  },
  orbitBarWants: {
    width: 162,
    transform: [{ rotate: '22deg' }],
    top: 130,
    right: 24,
  },
  orbitBarSavings: {
    width: 136,
    transform: [{ rotate: '-32deg' }],
    bottom: 56,
    left: 46,
  },
  orbitChip: {
    position: 'absolute',
    minWidth: 72,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  orbitChipNeeds: {
    top: 34,
    right: 24,
  },
  orbitChipWants: {
    right: 14,
    bottom: 72,
  },
  orbitChipSavings: {
    left: 20,
    bottom: 42,
  },
  orbitChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: FONT_WEIGHT.bold,
  },
  nativeFieldShell: {
    minHeight: 102,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    gap: SPACE.sm,
  },
  nativeTextInputHost: {
    height: 48,
    width: '100%',
  },
  nativeTextInput: {
    width: '100%',
    height: 48,
  },
  amountShell: {
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
    gap: SPACE.sm,
  },
  amountFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountSymbol: {
    fontSize: 34,
    fontWeight: FONT_WEIGHT.semibold,
    paddingTop: 2,
  },
  amountInputHost: {
    flex: 1,
    height: 62,
  },
  amountNativeInput: {
    width: '100%',
    height: 62,
  },
  targetGrid: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  targetTile: {
    flex: 1,
    minHeight: 104,
    borderRadius: RADIUS.card,
    padding: SPACE.md,
    justifyContent: 'space-between',
  },
  targetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planGroup: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    paddingTop: SPACE.md,
  },
  planGroupHeader: {
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  groupDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  planTrack: {
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    height: 5,
    borderRadius: RADIUS.bar,
    overflow: 'hidden',
  },
  planFill: {
    height: '100%',
    borderRadius: RADIUS.bar,
  },
  planRows: {
    marginTop: SPACE.sm,
  },
  amountRow: {
    minHeight: 56,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACE.md,
  },
  amountRowLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAmountInput: {
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACE.xs,
  },
  rowNativeInputHost: {
    width: 82,
    height: 36,
  },
  rowNativeInput: {
    width: 82,
    height: 36,
  },
  nativeGroup: {
    overflow: 'hidden',
    borderRadius: RADIUS.card,
  },
  groupLabel: {
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xs,
  },
  toggleShell: {
    minHeight: 78,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  nativeToggleHost: {
    height: 32,
    width: '100%',
  },
  toggleDetail: {
    paddingTop: SPACE.xs,
    paddingLeft: 30,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  choiceTile: {
    flex: 1,
    minHeight: 124,
    borderRadius: RADIUS.card,
    padding: SPACE.lg,
    gap: SPACE.sm,
    justifyContent: 'space-between',
  },
  previewPanel: {
    borderRadius: RADIUS.card,
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACE.lg,
  },
  previewAmount: {
    marginTop: SPACE.xs,
  },
  previewPlanned: {
    alignItems: 'flex-end',
  },
  previewBarStack: {
    gap: SPACE.lg,
  },
  previewBarRow: {
    gap: SPACE.sm,
  },
  previewBarMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTrack: {
    height: 7,
    borderRadius: RADIUS.bar,
    overflow: 'hidden',
  },
  previewFill: {
    height: '100%',
    borderRadius: RADIUS.bar,
  },
  summaryList: {
    gap: SPACE.sm,
  },
  summaryRow: {
    minHeight: 58,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  summaryLabel: {
    flex: 1,
  },
  inlineNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    paddingHorizontal: SPACE.xs,
  },
  inlineNoteCopy: {
    flex: 1,
    gap: SPACE.xs,
  },
  softPill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  softPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
