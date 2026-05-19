import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme, catPastel } from '../theme';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MAX_DOTS = 3;

export interface CalDayMark {
  txCats: string[];    // categories of transactions on this day → solid dots
  billCats: string[];  // categories of upcoming bills on this day → ring dots
}

interface Props {
  theme: Theme;
  year: number;
  month: number;                       // 0-indexed
  marks: Record<number, CalDayMark>;
  selectedDay: number | null;
  today: number | null;
  onSelectDay: (day: number) => void;
}

export function TransactionCalendar({
  theme, year, month, marks, selectedDay, today, onSelectDay,
}: Props) {
  const firstDow    = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <Text style={[styles.monthTitle, { color: theme.text }]}>
        {MONTH_NAMES[month]} {year}
      </Text>

      {/* Weekday header */}
      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <View key={i} style={styles.cell}>
            <Text style={[styles.weekday, { color: theme.textTer }]}>{w}</Text>
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

            const dots: { color: string; ring: boolean }[] = [];
            mark?.txCats.forEach(c   => dots.push({ color: catPastel(c, theme.dark), ring: false }));
            mark?.billCats.forEach(c => dots.push({ color: catPastel(c, theme.dark), ring: true  }));

            return (
              <TouchableOpacity
                key={di}
                style={styles.cell}
                activeOpacity={0.6}
                onPress={() => onSelectDay(day)}
              >
                <View style={[
                  styles.dayCircle,
                  isSelected             && { backgroundColor: theme.text },
                  !isSelected && isToday && { borderWidth: 1.5, borderColor: theme.accent.dot },
                ]}>
                  <Text style={[
                    styles.dayNum,
                    { color: isSelected ? theme.bg : theme.text },
                    isToday && !isSelected && { fontWeight: '700' },
                  ]}>
                    {day}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {dots.slice(0, MAX_DOTS).map((d, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        d.ring
                          ? { borderWidth: 1.5, borderColor: d.color }
                          : { backgroundColor: d.color },
                      ]}
                    />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={[styles.legend, { borderTopColor: theme.sep }]}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: theme.textSec }]} />
          <Text style={[styles.legendText, { color: theme.textTer }]}>Transaction</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { borderWidth: 1.5, borderColor: theme.textSec }]} />
          <Text style={[styles.legendText, { color: theme.textTer }]}>Upcoming bill</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthTitle: {
    fontSize: 16, fontWeight: '700', letterSpacing: -0.3,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
  },
  weekday: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3,
    marginBottom: 4,
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
    height: 9, marginTop: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: {
    width: 5.5, height: 5.5, borderRadius: 3,
  },
  legend: {
    flexDirection: 'row', gap: 18,
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1,
  },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  legendText: {
    fontSize: 11, fontWeight: '500',
  },
});
