import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';
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
  onSelectDay: (day: number | null) => void;
  onViewMonthChange?: (year: number, month: number) => void;
  onCollapse?: () => void;
  overrideColors?: CalOverrideColors;
}

// ── Month picker ──────────────────────────────────────────────────────────────

function MonthPicker({
  viewYear, viewMonth, onSelect, clr,
}: {
  viewYear: number;
  viewMonth: number;
  onSelect: (year: number, month: number) => void;
  clr: ReturnType<typeof resolveColors>;
}) {
  const years = [viewYear, viewYear - 1, viewYear - 2];
  return (
    <View style={P.container}>
      {years.map(y => (
        <View key={y} style={P.section}>
          <Text style={[P.yearLabel, { color: clr.textTer }]}>{y}</Text>
          <View style={P.monthGrid}>
            {MONTH_ABBR.map((abbr, m) => {
              const active = y === viewYear && m === viewMonth;
              return (
                <Pressable
                  key={m}
                  onPress={() => onSelect(y, m)}
                  pointerEvents="box-only"
                  style={P.monthCell}
                  accessibilityRole="button"
                  accessibilityLabel={`${abbr} ${y}`}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[P.monthPill, active && { backgroundColor: clr.selectedBg }]}>
                    <Text style={[P.monthText, { color: active ? clr.selectedText : clr.textSec }]}>
                      {abbr}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
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

// ── Calendar ──────────────────────────────────────────────────────────────────

export function TransactionCalendar({
  theme, year, month, marks, selectedDay, today,
  onSelectDay, onViewMonthChange, overrideColors,
}: Props) {
  const clr = resolveColors(theme, overrideColors);
  const [viewYear, setViewYear]     = useState(year);
  const [viewMonth, setViewMonth]   = useState(month);
  const [pickerOpen, setPickerOpen] = useState(false);
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
    setPickerOpen(false);
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
        <Pressable
          onPress={prevMonth}
          pointerEvents="box-only"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.navBtn, { backgroundColor: 'transparent' }]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Icon name="chevL" size={18} color={clr.textSec} stroke={1.6} />
        </Pressable>

        <Pressable
          onPress={() => setPickerOpen(o => !o)}
          pointerEvents="box-only"
          style={styles.titleBtn}
          accessibilityRole="button"
          accessibilityLabel={`${MONTH_NAMES[viewMonth]} ${viewYear}, change month`}
          accessibilityState={{ expanded: pickerOpen }}
        >
          <Text style={[styles.monthTitle, { color: clr.text }]}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <View style={{ transform: [{ rotate: pickerOpen ? '180deg' : '0deg' }] }}>
            <Icon name="chevDown" size={12} color={clr.textSec} stroke={1.8} />
          </View>
        </Pressable>

        <Pressable
          onPress={nextMonth}
          pointerEvents="box-only"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.navBtn, { backgroundColor: 'transparent' }]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Icon name="chevR" size={18} color={clr.textSec} stroke={1.6} />
        </Pressable>
      </View>

      {pickerOpen ? (
        <MonthPicker
          viewYear={viewYear}
          viewMonth={viewMonth}
          onSelect={navigateToMonth}
          clr={clr}
        />
      ) : (
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

                const txCount   = Math.min(mark?.txCats.length ?? 0, MAX_DOTS);
                const billCount = Math.min(mark?.billCats.length ?? 0, MAX_DOTS - txCount);

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
                      {Array.from({ length: txCount }).map((_, i) => (
                        <View key={`tx${i}`} style={[styles.dot, { backgroundColor: clr.dotFill }]} />
                      ))}
                      {Array.from({ length: billCount }).map((_, i) => (
                        <View key={`b${i}`} style={[styles.dot, { borderWidth: 1.5, borderColor: clr.billDotBorder }]} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}
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
  titleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 44,
  },
  monthTitle: {
    fontSize: 16, fontWeight: '700', letterSpacing: -0.3,
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

// ── Month picker styles ───────────────────────────────────────────────────────

const P = StyleSheet.create({
  container: {
    paddingBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  yearLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 8,
  },
  monthGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
  },
  monthCell: {
    width: '25%',
    paddingVertical: 3, paddingHorizontal: 3,
    alignItems: 'center',
  },
  monthPill: {
    width: '100%',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  monthText: {
    fontSize: 13, fontWeight: '500',
  },
});
