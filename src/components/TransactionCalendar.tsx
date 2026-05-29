import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Theme } from '../theme';
import { categoryGroupColor } from '../repositories/categoryUtils';
import type { Category } from '../repositories/types';
import { Icon } from './Icon';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MAX_DOTS = 3;

export interface CalDayMark {
  txCats: string[];
  billCats: string[];
}

export interface CalOverrideColors {
  text: string;
  textSec: string;
  textTer: string;
  selectedBg: string;
  selectedText: string;
  todayBorder: string;
  dotFill: string;
  billDotBorder: string;
}

interface Props {
  theme: Theme;
  year: number;
  month: number;
  marks: Record<number, CalDayMark>;
  selectedDay: number | null;
  today: number | null;
  categories?: Category[];
  onSelectDay: (day: number | null) => void;
  onViewMonthChange?: (year: number, month: number) => void;
  onCollapse?: () => void;
  overrideColors?: CalOverrideColors;
}

// ── Color resolver ─────────────────────────────────────────────────────────────

function resolveColors(theme: Theme, override?: CalOverrideColors) {
  return {
    text:         override?.text         ?? theme.text,
    textSec:      override?.textSec      ?? theme.textSec,
    textTer:      override?.textTer      ?? theme.textTer,
    selectedBg:   override?.selectedBg   ?? theme.text,
    selectedText: override?.selectedText ?? theme.bg,
    todayBorder:  override?.todayBorder  ?? theme.accent.dot,
    dotFill:      override?.dotFill      ?? theme.accent.dot,
    billDotBorder: override?.billDotBorder ?? theme.textSec,
  };
}

// ── Nav chevron ─────────────────────────────────────────────────────────────────

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

function NavChevron({
  dir, onPress, color, tint, label,
}: {
  dir: 'chevL' | 'chevR';
  onPress: () => void;
  color: string;
  tint: string;
  label: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const pressIn = () => {
    setPressed(true);
    Animated.timing(scale, {
      toValue: 0.86,
      duration: 80,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  };
  const pressOut = () => {
    setPressed(false);
    Animated.timing(scale, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
      easing: EASE_OUT_EXPO,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.navBtn, { backgroundColor: 'transparent' }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          styles.navHit,
          { transform: [{ scale }] },
          pressed && { backgroundColor: tint, opacity: 0.55 },
        ]}
      >
        <Icon name={dir} size={20} color={color} stroke={1.6} />
      </Animated.View>
    </Pressable>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export function TransactionCalendar({
  theme, year, month, marks, selectedDay, today,
  categories = [],
  onSelectDay, onViewMonthChange, overrideColors,
}: Props) {
  const clr = resolveColors(theme, overrideColors);
  const [viewYear, setViewYear]   = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  const didMountRef = useRef(false);

  const firstDow    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const navigateToMonth = (y: number, m: number) => {
    setViewYear(y);
    setViewMonth(m);
  };

  const prevMonth = () => {
    if (viewMonth === 0) navigateToMonth(viewYear - 1, 11);
    else navigateToMonth(viewYear, viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) navigateToMonth(viewYear + 1, 0);
    else navigateToMonth(viewYear, viewMonth + 1);
  };

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    onViewMonthChange?.(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  const handleDayPress = (day: number) => {
    onSelectDay(day === selectedDay ? null : day);
  };

  return (
    <View>
      {/* ── Header: [←] [Month Year ↓] [→] ── */}
      <View style={styles.headerRow}>
        <NavChevron
          dir="chevL"
          onPress={prevMonth}
          color={clr.textSec}
          tint={clr.text + '14'}
          label="Previous month"
        />

        <MenuView
          shouldOpenOnLongPress={false}
          themeVariant={theme.dark ? 'dark' : 'light'}
          actions={[viewYear, viewYear - 1, viewYear - 2].flatMap(y =>
            MONTH_NAMES.map((name, m) => ({
              id: `${y}-${m}`,
              title: `${name} ${y}`,
              state: (y === viewYear && m === viewMonth ? 'on' : 'off') as 'on' | 'off',
            }))
          )}
          onPressAction={({ nativeEvent }) => {
            const [y, m] = nativeEvent.event.split('-').map(Number);
            navigateToMonth(y, m);
          }}
          style={{ flex: 1, height: 44 }}
        >
          <View style={styles.monthPickerBtn}>
            <Text style={[styles.monthTitle, { color: clr.text }]}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <Icon name="chevDown" size={11} color={clr.textSec} stroke={2} />
          </View>
        </MenuView>

        <NavChevron
          dir="chevR"
          onPress={nextMonth}
          color={clr.textSec}
          tint={clr.text + '14'}
          label="Next month"
        />
      </View>

      <>
        {/* Weekday labels */}
        <View style={styles.row}>
          {WEEKDAYS.map((w, i) => (
            <View key={i} style={styles.cell}>
              <Text style={[styles.weekday, { color: clr.textSec }]}>{w}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.row}>
            {week.map((day, di) => {
                if (day == null) return <View key={di} style={styles.cell} />;

                const mark       = marks[day];
                const isSelected = day === selectedDay;
                const isToday    = day === today;

                const txDotColors   = [...new Set((mark?.txCats   ?? []).map(c => categoryGroupColor(c, categories, theme.dark)))].slice(0, MAX_DOTS);
                const billDotColors = [...new Set((mark?.billCats ?? []).map(c => categoryGroupColor(c, categories, theme.dark)))].slice(0, Math.max(0, MAX_DOTS - txDotColors.length));

                return (
                  <Pressable
                    key={di}
                    onPress={() => handleDayPress(day)}
                    pointerEvents="box-only"
                    style={[styles.cell, { backgroundColor: 'transparent' }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${MONTH_NAMES[viewMonth]} ${day}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[
                      styles.dayCircle,
                      isSelected && { backgroundColor: clr.selectedBg },
                      !isSelected && isToday && { borderWidth: 1.5, borderColor: clr.todayBorder },
                    ]}>
                      <Text style={[
                        styles.dayNum,
                        { color: isSelected ? clr.selectedText : clr.text },
                        isToday && !isSelected && { fontWeight: '700' },
                      ]}>
                        {day}
                      </Text>
                    </View>
                    <View style={styles.dotRow}>
                      {txDotColors.map((color, i) => (
                        <View key={`tx${i}`} style={[styles.dot, { backgroundColor: color }]} />
                      ))}
                      {billDotColors.map((color, i) => (
                        <View key={`b${i}`} style={[styles.dot, { borderWidth: 1.5, borderColor: color }]} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
      </>
    </View>
  );
}

// ── Calendar styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  navBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  navHit: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16, fontWeight: '700', letterSpacing: -0.3,
  },
  monthPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  row: { flexDirection: 'row' },
  cell: {
    flex: 1, alignItems: 'center', paddingVertical: 3,
  },
  weekday: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4,
  },
  dayCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  dayNum: {
    fontSize: 13, fontWeight: '500', letterSpacing: -0.2,
  },
  dotRow: {
    flexDirection: 'row', gap: 3,
    height: 10, marginTop: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: {
    width: 7, height: 7, borderRadius: 3.5,
  },
});
