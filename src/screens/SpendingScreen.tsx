import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  ImageBackground,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker, Text as SwiftText, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint, environment } from '@expo/ui/swift-ui/modifiers';

import { useTheme } from '../ThemeProvider';
import { Theme, catGroupColor, OVER_DOT } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, WallpaperP as P } from '../wallpaperPalette';
import { CATS, TRANSACTIONS, PERIOD_DATA, TREND } from '../data';
import { Icon } from '../components/Icon';
import { HeaderIcon, useHeaderScroll } from '../components/headerScroll';
import { ThemeToggle } from '../components/ThemeToggle';
import { FinanceBarChart, FinanceLineChart, FinanceDonut } from '../components/charts/FinanceCharts';
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');

const CARD_OUTER_PAD = 16;
const CARD_INNER_PAD = 18;
const CARD_W = SCREEN_W - CARD_OUTER_PAD * 2;
const CHART_INNER_W = CARD_W - CARD_INNER_PAD * 2;
const CHART_H = 188;

const CHART_TYPES = ['Trend', 'Pace', 'Mix'] as const;

const PERIODS = ['Week', 'Month', 'Year'] as const;
type Period = (typeof PERIODS)[number];

const BREAKDOWN_TABS = ['Category', 'Merchant'] as const;
type BreakdownMode = (typeof BREAKDOWN_TABS)[number];

// Mock date options per period — would be derived from real dates once wired up.
// Index 0 is always the current/most-recent period.
const DATE_OPTIONS: Record<Period, string[]> = {
  Week: ['16–22 May', '9–15 May', '2–8 May', '25 Apr–1 May', '18–24 Apr'],
  Month: ['May 2026', 'April 2026', 'March 2026', 'February 2026', 'January 2026'],
  Year: ['2026', '2025', '2024'],
};

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
}

// ── Frosted section card (mirrors HomeScreen) ────────────────────
function SectionCard({
  children,
  style,
  dark,
}: {
  children: React.ReactNode;
  style?: any;
  dark: boolean;
}) {
  const borderColor = dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  return (
    <BlurView
      intensity={dark ? 70 : 100}
      tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={[styles.sectionCard, style]}
    >
      <View style={[styles.sectionCardBorder, { borderColor }]}>{children}</View>
    </BlurView>
  );
}

// ── Header icon button ───────────────────────────────────────────
function IconBtn({
  onPress,
  children,
  size = 40,
  label,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  size?: number;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
    >
      {children}
    </Pressable>
  );
}

export function SpendingScreen({ theme, onOpenDrawer }: Props) {
  const { wallpaper } = useTheme();
  const insets = useSafeAreaInsets();
  const pWall = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;

  const [period, setPeriod] = useState<Period>('Week');
  const [chartIdx, setChartIdx] = useState(0);
  const [breakdown, setBreakdown] = useState<BreakdownMode>('Category');
  // Selected index within each period's option list — remembered per period so
  // switching Week ↔ Month doesn't reset the user's previous pick.
  const [dateIdxByPeriod, setDateIdxByPeriod] = useState<Record<Period, number>>({
    Week: 0,
    Month: 0,
    Year: 0,
  });
  const dateOptions = DATE_OPTIONS[period];
  const dateIdx = dateIdxByPeriod[period];
  const dateLabel = dateOptions[dateIdx] ?? dateOptions[0];

  const pd = PERIOD_DATA[period];
  const trendCfg = TREND[period];

  const { scrollY, headerBgOpacity, iconScrolledOpacity } = useHeaderScroll();

  const total = useMemo(
    () => pd.byCat.reduce((s, c) => s + c.value, 0),
    [pd],
  );

  type Row = { key: string; label: string; sub: string; icon: string; color: string; amount: number; pct: number };

  const categoryRows: Row[] = useMemo(() => {
    return pd.byCat
      .slice()
      .sort((a, b) => b.value - a.value)
      .map(c => {
        const cat = CATS[c.cat];
        const txCount = TRANSACTIONS.filter(t => t.cat === c.cat).length;
        return {
          key: c.cat,
          label: cat?.label ?? c.cat,
          sub: `${txCount} ${txCount === 1 ? 'transaction' : 'transactions'}`,
          icon: cat?.icon ?? 'tag',
          color: catGroupColor(c.cat, theme.dark),
          amount: c.value,
          pct: total > 0 ? c.value / total : 0,
        };
      });
  }, [pd, total, theme.dark]);

  const merchantRows: Row[] = useMemo(() => {
    const acc: Record<string, { merchant: string; cat: string; total: number; count: number }> = {};
    TRANSACTIONS.forEach(t => {
      if (!acc[t.merchant]) acc[t.merchant] = { merchant: t.merchant, cat: t.cat, total: 0, count: 0 };
      acc[t.merchant].total += t.amount;
      acc[t.merchant].count += 1;
    });
    const merchTotal = Object.values(acc).reduce((s, m) => s + m.total, 0);
    return Object.values(acc)
      .sort((a, b) => b.total - a.total)
      .map(m => {
        const cat = CATS[m.cat];
        return {
          key: m.merchant,
          label: m.merchant,
          sub: `${m.count} ${m.count === 1 ? 'transaction' : 'transactions'}`,
          icon: cat?.icon ?? 'tag',
          color: catGroupColor(m.cat, theme.dark),
          amount: m.total,
          pct: merchTotal > 0 ? m.total / merchTotal : 0,
        };
      });
  }, [theme.dark]);

  const rows = breakdown === 'Category' ? categoryRows : merchantRows;

  const chartScrollRef = useRef<ScrollView>(null);
  const onChartScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CHART_INNER_W);
    if (idx !== chartIdx && idx >= 0 && idx < CHART_TYPES.length) setChartIdx(idx);
  };

  const scrimTop = theme.dark ? 'rgba(8,6,20,0.55)' : 'rgba(8,6,20,0.30)';
  const scrimMid = theme.dark ? 'rgba(8,6,20,0.34)' : 'rgba(8,6,20,0.30)';
  const scrimLower = theme.dark ? 'rgba(8,6,20,0.68)' : 'rgba(8,6,20,0.20)';
  const scrimBottom = theme.dark ? 'rgba(8,6,20,0.88)' : 'transparent';

  const periodIdx = PERIODS.indexOf(period);
  const breakdownIdx = BREAKDOWN_TABS.indexOf(breakdown);

  // Hero: total spend formatted with subordinate cents + delta vs prev period.
  const spendDisplay = (() => {
    const v = pd.spent;
    const whole = Math.floor(v).toLocaleString();
    const cents = Math.round((v - Math.floor(v)) * 100).toString().padStart(2, '0');
    return { whole: `$${whole}`, cents: `.${cents}` };
  })();
  const deltaPct = pd.prevTotal > 0 ? (pd.spent - pd.prevTotal) / pd.prevTotal : 0;
  const deltaIsDown = deltaPct <= 0;
  const deltaPctAbs = Math.round(Math.abs(deltaPct) * 100);

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? '#000' : '#F8F6FF' }}>
      <ImageBackground source={wallpaper.source} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
        <LinearGradient
          pointerEvents="none"
          colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
          locations={[0, 0.28, 0.60, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* ─── Header ─────────────────────────────── */}
        <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: headerBgOpacity }]}>
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFillObject}
            />
            <View
              style={[
                styles.headerDivider,
                { backgroundColor: theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)' },
              ]}
            />
          </Animated.View>

          <View style={styles.headerRow}>
            <IconBtn onPress={onOpenDrawer} label="Open menu">
              <HeaderIcon
                name="menu"
                wallpaperColor={pWall.text}
                scrolledColor={p.text}
                scrolledOpacity={iconScrolledOpacity}
              />
            </IconBtn>
            <ThemeToggle />
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
        >
          {/* ─── Date range title (native iOS dropdown) ────── */}
          <View style={styles.dateBlock}>
            <Host matchContents>
              <Menu
                label={
                  <RNHostView>
                    <View style={styles.dateLabelRow}>
                      <Text style={[styles.dateTitle, { color: pWall.text }, shadow]}>
                        {dateLabel}
                      </Text>
                      <Icon name="chevDown" size={22} color={pWall.text} stroke={2.2} />
                    </View>
                  </RNHostView>
                }
              >
                <Picker
                  selection={dateIdx}
                  onSelectionChange={(val) => {
                    const next = Number(val);
                    setDateIdxByPeriod(prev => ({ ...prev, [period]: next }));
                  }}
                  modifiers={[pickerStyle('inline'), tint(theme.accent.dot)]}
                >
                  {dateOptions.map((opt, idx) => (
                    <SwiftText key={opt} modifiers={[tag(idx)]}>
                      {opt}
                    </SwiftText>
                  ))}
                </Picker>
              </Menu>
            </Host>
          </View>

          {/* ─── Native Week/Month/Year segmented ── */}
          <View style={styles.segmentWrap}>
            <Host matchContents>
              <Picker
                selection={periodIdx}
                onSelectionChange={(val) => {
                  const next = PERIODS[Number(val)];
                  if (next) setPeriod(next);
                }}
                modifiers={[
                  pickerStyle('segmented'),
                  tint(theme.accent.dot),
                  environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                ]}
              >
                {PERIODS.map((label, idx) => (
                  <SwiftText key={label} modifiers={[tag(idx)]}>
                    {label}
                  </SwiftText>
                ))}
              </Picker>
            </Host>
          </View>

          {/* ─── Sections ─────────────────────────── */}
          <View style={styles.sectionStack}>

            {/* Chart pager */}
            <SectionCard dark={theme.dark}>
              <View style={styles.chartTopRow}>
                <Text style={[styles.chartTitle, { color: p.text }]}>Overview</Text>
                <View
                  style={[
                    styles.chartTypePill,
                    {
                      backgroundColor: theme.dark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(14,12,24,0.06)',
                    },
                  ]}
                >
                  <Text style={[TYPE.captionEm, { color: p.text }]}>{CHART_TYPES[chartIdx]}</Text>
                </View>
              </View>

              <View style={styles.chartHero}>
                <Text style={[styles.chartHeroAmount, { color: p.text }]}>
                  {spendDisplay.whole}
                  <Text style={[styles.chartHeroCents, { color: p.text }]}>{spendDisplay.cents}</Text>
                </Text>
                <View style={styles.chartHeroSubRow}>
                  <Text style={[styles.chartHeroLabel, { color: p.textSec }]}>Total spend</Text>
                  <View
                    style={[
                      styles.deltaBadge,
                      {
                        backgroundColor: deltaIsDown
                          ? (theme.dark ? 'rgba(122,205,138,0.16)' : 'rgba(58,135,80,0.10)')
                          : (theme.dark ? 'rgba(212,82,42,0.18)' : 'rgba(212,82,42,0.12)'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.deltaText,
                        {
                          color: deltaIsDown
                            ? (theme.dark ? '#7ACD8A' : '#3A8750')
                            : OVER_DOT,
                        },
                      ]}
                    >
                      {deltaIsDown ? '▼' : '▲'} {deltaPctAbs}%
                    </Text>
                  </View>
                  <Text style={[styles.chartHeroVs, { color: p.textTer }]}>vs prev</Text>
                </View>
              </View>

              <ScrollView
                ref={chartScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={onChartScroll}
                onMomentumScrollEnd={onChartScroll}
                scrollEventThrottle={16}
                snapToInterval={CHART_INNER_W}
                decelerationRate="fast"
                disableIntervalMomentum
                bounces={false}
              >
                {/* 1. Trend — spend per bin with budget reference */}
                <View style={[styles.chartSlide, { width: CHART_INNER_W }]}>
                  <FinanceBarChart
                    data={trendCfg.data}
                    budget={trendCfg.budget}
                    theme={theme}
                    width={CHART_INNER_W}
                    height={CHART_H}
                  />
                </View>

                {/* 2. Pace — cumulative spend vs ideal pace line */}
                <View style={[styles.chartSlide, { width: CHART_INNER_W }]}>
                  <FinanceLineChart
                    data={trendCfg.data}
                    budget={trendCfg.budget}
                    theme={theme}
                    width={CHART_INNER_W}
                    height={CHART_H}
                  />
                </View>

                {/* 3. Mix — category composition donut */}
                <View
                  style={[
                    styles.chartSlide,
                    { width: CHART_INNER_W, alignItems: 'center', justifyContent: 'center' },
                  ]}
                >
                  <FinanceDonut
                    data={pd.byCat}
                    theme={theme}
                    size={Math.min(CHART_H - 8, 168)}
                  />
                </View>
              </ScrollView>

              <View style={styles.dotsRow}>
                {CHART_TYPES.map((_, i) => {
                  const active = i === chartIdx;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: active ? p.text : p.hairlineStrong,
                          width: active ? 18 : 6,
                          opacity: active ? 0.9 : 0.7,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </SectionCard>

            {/* Breakdown — Category / Merchant */}
            <SectionCard dark={theme.dark}>
              <View style={styles.breakdownTabsWrap}>
                <Host matchContents>
                  <Picker
                    selection={breakdownIdx}
                    onSelectionChange={(val) => {
                      const next = BREAKDOWN_TABS[Number(val)];
                      if (next) setBreakdown(next);
                    }}
                    modifiers={[
                      pickerStyle('segmented'),
                      tint(theme.accent.dot),
                      environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                    ]}
                  >
                    {BREAKDOWN_TABS.map((label, idx) => (
                      <SwiftText key={label} modifiers={[tag(idx)]}>
                        {label}
                      </SwiftText>
                    ))}
                  </Picker>
                </Host>
              </View>

              {rows.map((r, i) => (
                <View
                  key={r.key}
                  style={[
                    styles.row,
                    {
                      borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                      borderBottomColor: p.hairline,
                    },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: r.color }]}>
                    <Icon name={r.icon} size={18} color="#FBF8FF" stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.rowTitle, { color: p.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {r.label}
                    </Text>
                    <Text style={[styles.rowSub, { color: p.textSec }]}>{r.sub}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowAmt, { color: p.text }]}>
                      ${r.amount.toFixed(r.amount >= 100 ? 0 : 2)}
                    </Text>
                    <Text style={[styles.rowPct, { color: p.textSec }]}>
                      {Math.round(r.pct * 100)}%
                    </Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          </View>
        </Animated.ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
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
    paddingBottom: 8,
  },
  dateBlock: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 18,
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1.0,
    lineHeight: 38,
  },
  segmentWrap: {
    paddingHorizontal: CARD_OUTER_PAD,
    marginBottom: 22,
  },
  sectionStack: {
    paddingHorizontal: CARD_OUTER_PAD,
    gap: 22,
  },
  sectionCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  sectionCardBorder: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: CARD_INNER_PAD,
    paddingTop: 18,
    paddingBottom: 14,
  },
  chartTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chartTitle: {
    ...TYPE.bodySmEm,
    opacity: 0.7,
    letterSpacing: 0.2,
  },
  chartTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
  },
  chartHero: {
    marginBottom: 14,
  },
  chartHeroAmount: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.0,
    lineHeight: 38,
  },
  chartHeroCents: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.4,
    opacity: 0.65,
  },
  chartHeroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  chartHeroLabel: {
    ...TYPE.bodySm,
  },
  chartHeroVs: {
    ...TYPE.caption,
  },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  chartSlide: {
    height: CHART_H,
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  breakdownTabsWrap: {
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTitle: { ...TYPE.body },
  rowSub: { ...TYPE.caption, marginTop: 2 },
  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  rowAmt: { ...TYPE.body },
  rowPct: { ...TYPE.caption, marginTop: 2 },
});
