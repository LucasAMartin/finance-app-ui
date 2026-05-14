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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, OVER_DOT } from '../theme';
import { CATS } from '../data';
import { Icon } from '../components/Icon';
import { BackBtn } from '../components/shared';

interface Props {
  theme: Theme;
  onBack: () => void;
}

interface IncomeItem {
  id: string;
  name: string;
  icon: string;
  amount: number;
}

const INITIAL_INCOME: IncomeItem[] = [
  { id: 'i1', name: 'Paycheck',  icon: 'doc',  amount: 4200 },
  { id: 'i2', name: 'Interest',  icon: 'tag',  amount: 10   },
];

// Seed expense budgets from CATS so the screen matches the rest of the app.
const initialExpenseBudgets = (): Record<string, number> => {
  const out: Record<string, number> = {};
  Object.entries(CATS).forEach(([key, c]) => { out[key] = c.budget; });
  return out;
};

const fmtMoney = (v: number) =>
  `$${Math.round(v).toLocaleString()}`;

export function BudgetScreen({ theme, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const card = getCardStyle(theme);

  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>(INITIAL_INCOME);
  const [expenseBudgets, setExpenseBudgets] = useState<Record<string, number>>(initialExpenseBudgets);

  const totalIncome   = useMemo(() => incomeItems.reduce((s, i) => s + i.amount, 0), [incomeItems]);
  const totalExpenses = useMemo(() => Object.values(expenseBudgets).reduce((s, v) => s + v, 0), [expenseBudgets]);
  const leftToBudget  = totalIncome - totalExpenses;
  const overAllocated = leftToBudget < 0;

  const expensePct = totalIncome > 0 ? Math.min(totalExpenses / totalIncome, 1) : 0;

  const updateIncome = (id: string, amount: number) =>
    setIncomeItems(items => items.map(i => (i.id === id ? { ...i, amount } : i)));
  const updateExpense = (key: string, amount: number) =>
    setExpenseBudgets(b => ({ ...b, [key]: amount }));

  const heroColor = overAllocated ? OVER_DOT : theme.accent.dot;
  const heroInk   = overAllocated ? '#fff' : theme.accent.ink;
  const heroBg    = overAllocated ? OVER_DOT : theme.accent.fill;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, paddingTop: insets.top + 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header: back + month + add ─────────────────── */}
        <View style={styles.header}>
          <BackBtn theme={theme} onBack={onBack} />
          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.chevBtn}>
              <Icon name="chevL" size={16} color={theme.textSec} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginHorizontal: 8 }}>
              May 2026
            </Text>
            <TouchableOpacity style={styles.chevBtn}>
              <Icon name="chevR" size={16} color={theme.textSec} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[
              styles.iconBtn,
              { backgroundColor: theme.surface, borderColor: theme.hairline },
            ]}
          >
            <Icon name="cal" size={17} color={theme.text} stroke={1.6} />
          </TouchableOpacity>
        </View>

        {/* ─── Hero: Left to budget ─────────────────────────── */}
        <View style={[styles.heroPill, { backgroundColor: heroBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: heroInk }}>
              {overAllocated ? 'Over budget' : 'Left to budget'}
            </Text>
            <Icon name="sparkle" size={13} color={heroInk} stroke={1.5} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: heroInk, letterSpacing: -0.5 }}>
            {overAllocated ? '−' : ''}{fmtMoney(Math.abs(leftToBudget))}
          </Text>
        </View>

        {/* ─── Summary card (Income + Expenses bars) ───────── */}
        <View style={[card, styles.summaryCard]}>
          <SummaryRow
            theme={theme}
            label="Income"
            primaryLabel={`${fmtMoney(totalIncome)} earned`}
            secondaryLabel={`${fmtMoney(totalIncome)} budget`}
            barColor={theme.accent.dot}
            pct={1}
          />
          <View style={[styles.divider, { backgroundColor: theme.sep }]} />
          <SummaryRow
            theme={theme}
            label="Expenses"
            primaryLabel={`${fmtMoney(totalExpenses)} allocated`}
            secondaryLabel={`${fmtMoney(totalIncome)} budget`}
            barColor={overAllocated ? OVER_DOT : theme.accent.dot}
            pct={expensePct}
            warn={overAllocated}
          />
        </View>

        {/* ─── Income section ────────────────────────────── */}
        <SectionHeader theme={theme} title="Income" />
        <View style={[card, styles.listCard]}>
          {incomeItems.map((item, i) => (
            <EditableRow
              key={item.id}
              theme={theme}
              icon={item.icon}
              name={item.name}
              amount={item.amount}
              onChange={(v) => updateIncome(item.id, v)}
              last={i === incomeItems.length - 1}
              accent={theme.accent.dot}
            />
          ))}
        </View>

        {/* ─── Expense categories ─────────────────────────── */}
        <SectionHeader theme={theme} title="Expenses" />
        <View style={[card, styles.listCard]}>
          {Object.entries(CATS).map(([key, c], i, arr) => (
            <EditableRow
              key={key}
              theme={theme}
              icon={c.icon}
              name={c.label}
              amount={expenseBudgets[key] ?? 0}
              onChange={(v) => updateExpense(key, v)}
              last={i === arr.length - 1}
            />
          ))}
        </View>

        <Text style={[styles.hint, { color: theme.textTer }]}>
          Tap any amount to edit. Totals update live.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Section header ─────────────────────────────────────────────
function SectionHeader({ theme, title }: { theme: Theme; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: theme.text }}>
        {title}
      </Text>
      <View style={styles.sectionHeaderCols}>
        <Text style={[styles.colLabel, { color: theme.textTer }]}>Budget</Text>
      </View>
    </View>
  );
}

// ── Summary row with progress bar ──────────────────────────────
function SummaryRow({
  theme,
  label,
  primaryLabel,
  secondaryLabel,
  barColor,
  pct,
  warn,
}: {
  theme: Theme;
  label: string;
  primaryLabel: string;
  secondaryLabel: string;
  barColor: string;
  pct: number;
  warn?: boolean;
}) {
  return (
    <View>
      <View style={styles.summaryHead}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSec }}>{secondaryLabel}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.hairline }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(pct * 100, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <View style={styles.summaryFoot}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: warn ? OVER_DOT : theme.text }}>
          {primaryLabel}
        </Text>
      </View>
    </View>
  );
}

// ── Editable row (icon + name + tappable amount) ───────────────
function EditableRow({
  theme,
  icon,
  name,
  amount,
  onChange,
  last,
  accent,
}: {
  theme: Theme;
  icon: string;
  name: string;
  amount: number;
  onChange: (v: number) => void;
  last: boolean;
  accent?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(amount));

  const commit = () => {
    const v = parseFloat(draft.replace(/[^0-9.]/g, ''));
    onChange(Number.isFinite(v) ? v : 0);
    setEditing(false);
  };

  return (
    <View style={[styles.row, { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep }]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.chipBg }]}>
        <Icon name={icon} size={16} color={theme.text} stroke={1.5} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.text, letterSpacing: -0.2 }}>
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
          style={[
            styles.amountInput,
            {
              color: accent ?? theme.text,
              backgroundColor: theme.chipBg,
              borderColor: theme.accent.dot,
            },
          ]}
        />
      ) : (
        <TouchableOpacity
          onPress={() => { setDraft(String(Math.round(amount))); setEditing(true); }}
          style={[styles.amountChip, { backgroundColor: theme.chipBg }]}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: accent ?? theme.text }}>
            {fmtMoney(amount)}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 18,
    marginBottom: 14,
  },

  summaryCard: {
    padding: 18,
    marginBottom: 22,
  },
  summaryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  summaryFoot: {
    marginTop: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeaderCols: {
    flexDirection: 'row',
  },
  colLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  listCard: {
    overflow: 'hidden',
    marginBottom: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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

  hint: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
  },
});
