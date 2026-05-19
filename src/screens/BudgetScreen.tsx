import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS, catGroupColor, OVER_DOT } from '../theme';
import { SPEND_GROUPS, UPCOMING_BILLS, MONTHLY_INCOME } from '../data';
import { Icon } from '../components/Icon';
import { ThemeToggle } from '../components/ThemeToggle';

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
}

type Cadence = 'Mo' | '2w' | 'Wk' | 'Yr';

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'Mo', label: 'Monthly'   },
  { value: '2w', label: 'Bi-weekly' },
  { value: 'Wk', label: 'Weekly'    },
  { value: 'Yr', label: 'Annual'    },
];

const bKey = (gKey: string, label: string) => `${gKey}:${label}`;

const initBudgets = (): Record<string, number> => {
  const out: Record<string, number> = {};
  SPEND_GROUPS.forEach(g => g.subs.forEach(s => { out[bKey(g.key, s.label)] = s.budget; }));
  return out;
};

const toMonthly = (v: number, c: Cadence): number => {
  switch (c) {
    case '2w': return Math.round(v * 26 / 12);
    case 'Wk': return Math.round(v * 52 / 12);
    case 'Yr': return Math.round(v / 12);
    default:   return Math.round(v);
  }
};
const fromMonthly = (monthly: number, c: Cadence): number => {
  switch (c) {
    case '2w': return Math.round(monthly * 12 / 26);
    case 'Wk': return Math.round(monthly * 12 / 52);
    case 'Yr': return monthly * 12;
    default:   return monthly;
  }
};

function IconBtn({ onPress, children, size = 40 }: { onPress?: () => void; children: React.ReactNode; size?: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.5}
      delayPressIn={0}
      hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </TouchableOpacity>
  );
}

function EditableRow({
  theme, icon, name, amount, onChange, last, groupColor,
}: {
  theme: Theme; icon: string; name: string; amount: number;
  onChange: (v: number) => void; last: boolean; groupColor: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(amount)));

  const commit = () => {
    const v = parseFloat(draft.replace(/[^0-9.]/g, ''));
    onChange(Number.isFinite(v) && v >= 0 ? v : 0);
    setEditing(false);
  };

  return (
    <View style={[styles.row, { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep }]}>
      <View style={[styles.rowIcon, { backgroundColor: groupColor }]}>
        <Icon name={icon} size={16} color="#fff" stroke={1.6} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.text, letterSpacing: -0.2, minWidth: 0 }}>
        {name}
      </Text>
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
          style={[styles.amountInput, {
            color: theme.text,
            backgroundColor: theme.chipBg,
            borderColor: theme.accent.dot,
          }]}
        />
      ) : (
        <TouchableOpacity
          onPress={() => { setDraft(String(Math.round(amount))); setEditing(true); }}
          style={[styles.amountChip, { backgroundColor: theme.chipBg }]}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
            ${Math.round(amount).toLocaleString()}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function BudgetScreen({ theme, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();

  const [income, setIncome] = useState(MONTHLY_INCOME);
  const [cadence, setCadence] = useState<Cadence>('Mo');
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState('');
  const [budgets, setBudgets] = useState<Record<string, number>>(initBudgets);

  const displayIncome = fromMonthly(income, cadence);

  const commitIncome = () => {
    const v = parseFloat(incomeDraft.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(v) && v > 0) setIncome(toMonthly(v, cadence));
    setEditingIncome(false);
  };

  const updateBudget = (gKey: string, label: string, v: number) =>
    setBudgets(b => ({ ...b, [bKey(gKey, label)]: v }));

  const groupTotals = useMemo(() => {
    const t: Record<string, number> = {};
    SPEND_GROUPS.forEach(g => {
      t[g.key] = g.subs.reduce((s, sub) => s + (budgets[bKey(g.key, sub.label)] ?? 0), 0);
    });
    return t;
  }, [budgets]);

  const needsTotal    = groupTotals.needs    ?? 0;
  const wantsTotal    = groupTotals.wants    ?? 0;
  const savingsTotal  = groupTotals.savings  ?? 0;
  const totalBudgeted = needsTotal + wantsTotal + savingsTotal;
  const remaining     = income - totalBudgeted;
  const isOver        = remaining < 0;

  const applyTemplate = () => {
    const next: Record<string, number> = {};
    SPEND_GROUPS.forEach(g => {
      const target = income * g.targetPct;
      const subSum = g.subs.reduce((s, sub) => s + sub.budget, 0);
      g.subs.forEach(sub => {
        const ratio = subSum > 0 ? sub.budget / subSum : 1 / g.subs.length;
        next[bKey(g.key, sub.label)] = Math.round(target * ratio);
      });
    });
    setBudgets(next);
  };

  const confirmTemplate = () =>
    Alert.alert(
      'Apply 50/30/20 template',
      'This will overwrite all your current category budgets. Your income stays the same.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply', style: 'destructive', onPress: applyTemplate },
      ],
    );

  const barMax      = Math.max(totalBudgeted, income);
  const needsFrac   = barMax > 0 ? needsTotal   / barMax : 0;
  const wantsFrac   = barMax > 0 ? wantsTotal   / barMax : 0;
  const savingsFrac = barMax > 0 ? savingsTotal / barMax : 0;

  const gCol = (key: string) =>
    (theme.dark ? GROUP_COLORS[key]?.dark : GROUP_COLORS[key]?.light) ?? '#888888';

  const needsCol   = gCol('needs');
  const wantsCol   = gCol('wants');
  const savingsCol = gCol('savings');

  const recurringTotal = UPCOMING_BILLS.reduce((s, b) => s + b.amount, 0);
  const discretionary  = Math.round(income - recurringTotal);
  const allocatedPct   = Math.round((totalBudgeted / (income || 1)) * 100);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, backgroundColor: theme.bg }}>

        {/* ── Header ──────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <IconBtn onPress={onOpenDrawer}>
            <Icon name="menu" size={22} color={theme.text} stroke={1.7} />
          </IconBtn>
          <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: theme.text }}>
            Budget
          </Text>
          <ThemeToggle />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Income ──────────────────────────────── */}
          <View style={styles.incomeBlock}>
            <Text style={[styles.eyebrow, { color: theme.textTer }]}>Income</Text>

            {editingIncome ? (
              <View style={styles.incomeRow}>
                <Text style={[styles.currencySign, { color: theme.textSec }]}>$</Text>
                <TextInput
                  value={incomeDraft}
                  onChangeText={setIncomeDraft}
                  onBlur={commitIncome}
                  onSubmitEditing={commitIncome}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  style={[styles.incomeInput, { color: theme.text, borderColor: theme.accent.dot }]}
                />
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => { setIncomeDraft(String(displayIncome)); setEditingIncome(true); }}
                activeOpacity={0.8}
                style={styles.incomeRow}
              >
                <Text style={[styles.currencySign, { color: theme.textSec }]}>$</Text>
                <Text style={[styles.incomeAmount, { color: theme.text }]}>
                  {displayIncome.toLocaleString()}
                </Text>
                <Icon name="chevDown" size={18} color={theme.textTer} stroke={1.5} />
              </TouchableOpacity>
            )}

            <View style={[styles.cadenceTrack, { backgroundColor: theme.chipBg }]}>
              {CADENCES.map(c => (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setCadence(c.value)}
                  activeOpacity={0.7}
                  style={[styles.cadencePill, cadence === c.value && { backgroundColor: theme.text }]}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: cadence === c.value ? theme.bg : theme.textSec,
                  }}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {cadence !== 'Mo' && (
              <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 8 }}>
                ~${income.toLocaleString()}/month effective
              </Text>
            )}
          </View>

          {/* ── Allocation bar ──────────────────────── */}
          <View style={styles.barSection}>
            <Text style={[styles.eyebrow, { color: theme.textTer, marginBottom: 10 }]}>
              {allocatedPct}% of income allocated
            </Text>
            <View style={[styles.allocationBar, { backgroundColor: theme.chipBg }]}>
              {needsTotal > 0 && (
                <View style={[styles.barSegment, {
                  width: `${(needsFrac * 100).toFixed(2)}%` as any,
                  backgroundColor: needsCol,
                }]} />
              )}
              {wantsTotal > 0 && (
                <View style={[styles.barSegment, {
                  width: `${(wantsFrac * 100).toFixed(2)}%` as any,
                  backgroundColor: wantsCol,
                }]} />
              )}
              {savingsTotal > 0 && (
                <View style={[styles.barSegment, {
                  width: `${(savingsFrac * 100).toFixed(2)}%` as any,
                  backgroundColor: savingsCol,
                }]} />
              )}
            </View>
            <View style={styles.legendRow}>
              {([
                { label: 'Needs',   labelColor: needsCol,   valueColor: theme.text,    amount: needsTotal   },
                { label: 'Wants',   labelColor: wantsCol,   valueColor: theme.text,    amount: wantsTotal   },
                { label: 'Savings', labelColor: savingsCol, valueColor: theme.text,    amount: savingsTotal  },
                {
                  label:      isOver ? 'Over' : 'Free',
                  labelColor: isOver ? OVER_DOT : theme.textTer,
                  valueColor: isOver ? OVER_DOT : theme.textSec,
                  amount:     Math.abs(remaining),
                },
              ] as const).map(item => (
                <View key={item.label} style={{ alignItems: 'center' }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '600', letterSpacing: 0.1,
                    color: item.labelColor, marginBottom: 3,
                  }}>
                    {item.label}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: item.valueColor, letterSpacing: -0.2 }}>
                    ${Math.round(item.amount).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Recurring bills ─────────────────────── */}
          <View style={[styles.divider, { backgroundColor: theme.sep }]} />
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recurring bills</Text>
          </View>
          {UPCOMING_BILLS.map((bill, i) => (
            <View
              key={bill.id}
              style={[styles.row, {
                borderBottomWidth: i < UPCOMING_BILLS.length - 1 ? 1 : 0,
                borderBottomColor: theme.sep,
              }]}
            >
              <View style={[styles.rowIcon, { backgroundColor: catGroupColor(bill.cat, theme.dark) }]}>
                <Icon name={bill.icon} size={16} color="#fff" stroke={1.6} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, letterSpacing: -0.2 }}>
                  {bill.name}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 2 }}>
                  {bill.dueDate}{bill.estimate ? ' · estimated' : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSec, letterSpacing: -0.2 }}>
                {bill.estimate ? '~' : ''}${bill.amount % 1 !== 0 ? bill.amount.toFixed(2) : bill.amount.toLocaleString()}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 12, color: theme.textTer, marginTop: 10, paddingHorizontal: 2 }}>
            ${recurringTotal.toFixed(2)} locked in · ${discretionary.toLocaleString()} discretionary
          </Text>

          {/* ── Category groups ─────────────────────── */}
          {SPEND_GROUPS.map(g => {
            const groupColor = gCol(g.key);
            return (
              <React.Fragment key={g.key}>
                <View style={[styles.divider, { backgroundColor: theme.sep }]} />
                <View style={styles.sectionHead}>
                  <Text style={[styles.sectionTitle, { color: groupColor }]}>{g.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: groupColor, letterSpacing: -0.2 }}>
                    ${Math.round(groupTotals[g.key] ?? 0).toLocaleString()}
                  </Text>
                </View>
                {g.subs.map((sub, si) => (
                  <EditableRow
                    key={sub.label}
                    theme={theme}
                    icon={sub.icon}
                    name={sub.label}
                    amount={budgets[bKey(g.key, sub.label)] ?? sub.budget}
                    onChange={v => updateBudget(g.key, sub.label, v)}
                    last={si === g.subs.length - 1}
                    groupColor={groupColor}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* ── Summary strip ──────────────────────── */}
          <View style={[styles.divider, { backgroundColor: theme.sep }]} />
          <View style={styles.summaryStrip}>
            {([
              { label: 'Budgeted',  value: `$${Math.round(totalBudgeted).toLocaleString()}`,                                        color: theme.text                          },
              { label: 'Remaining', value: `${isOver ? '-' : ''}$${Math.abs(Math.round(remaining)).toLocaleString()}`,              color: isOver ? OVER_DOT : theme.accent.dot },
              { label: 'Savings',   value: `$${Math.round(savingsTotal).toLocaleString()}`,                                         color: savingsCol                          },
            ] as const).map((stat, i, arr) => (
              <React.Fragment key={stat.label}>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryLabel, { color: theme.textTer }]}>{stat.label}</Text>
                  <Text style={[styles.summaryValue, { color: stat.color }]}>{stat.value}</Text>
                </View>
                {i < arr.length - 1 && (
                  <View style={[styles.summaryDiv, { backgroundColor: theme.hairline }]} />
                )}
              </React.Fragment>
            ))}
          </View>

          {/* ── 50/30/20 — tucked at the bottom ─────── */}
          <TouchableOpacity
            onPress={confirmTemplate}
            activeOpacity={0.6}
            style={styles.templateLink}
          >
            <Text style={{ fontSize: 12, color: theme.textTer, fontWeight: '500' }}>
              Apply 50/30/20 template
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  incomeBlock: {
    paddingTop: 20,
    paddingBottom: 28,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 8,
    marginBottom: 10,
  },
  currencySign: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.5,
  },
  incomeAmount: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  incomeInput: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.5,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 140,
  },
  cadenceTrack: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  cadencePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
  },
  barSection: {
    paddingBottom: 6,
  },
  allocationBar: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 14,
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    marginHorizontal: -20,
    marginVertical: 22,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  amountChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 76,
    alignItems: 'flex-end',
  },
  amountInput: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 92,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    borderWidth: 1.5,
  },
  summaryStrip: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingBottom: 24,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryDiv: {
    width: 1,
    height: 28,
    alignSelf: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  templateLink: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingBottom: 8,
  },
});
