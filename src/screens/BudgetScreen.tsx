import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
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
  { value: 'Mo', label: 'Monthly' },
  { value: '2w', label: 'Bi-weekly' },
  { value: 'Wk', label: 'Weekly' },
  { value: 'Yr', label: 'Annual' },
];

interface BudgetTemplate {
  id: string;
  label: string;
  subtitle: string;
  needs: number;
  wants: number;
  savings: number;
}

const BUDGET_TEMPLATES: BudgetTemplate[] = [
  { id: '50-30-20', label: '50 / 30 / 20', subtitle: 'Classic — needs, wants, savings', needs: 0.50, wants: 0.30, savings: 0.20 },
  { id: '70-20-10', label: '70 / 20 / 10', subtitle: 'Essential-heavy, minimal extras',  needs: 0.70, wants: 0.20, savings: 0.10 },
  { id: '60-25-15', label: '60 / 25 / 15', subtitle: 'Balanced lifestyle',               needs: 0.60, wants: 0.25, savings: 0.15 },
  { id: '40-30-30', label: '40 / 30 / 30', subtitle: 'Aggressive savings focus',         needs: 0.40, wants: 0.30, savings: 0.30 },
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

const cadenceSuffix = (c: Cadence) => ({ Mo: '/mo', '2w': '/2wk', Wk: '/wk', Yr: '/yr' }[c]);

function IconBtn({ onPress, children, size = 40 }: { onPress?: () => void; children: React.ReactNode; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
    >
      {children}
    </Pressable>
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
  const [committed, setCommitted] = useState(false);

  const commit = () => {
    const raw = draft.replace(/[^0-9.]/g, '');
    const v = parseFloat(raw);
    if (raw.length > 0 && Number.isFinite(v) && v >= 0) {
      onChange(v);
      setCommitted(true);
      setTimeout(() => setCommitted(false), 1200);
    }
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
          style={[styles.amountChip, {
            backgroundColor: theme.chipBg,
            borderWidth: 1.5,
            borderColor: committed ? theme.accent.dot : 'transparent',
          }]}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: committed ? theme.accent.dot : theme.text }}>
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
  const [showCadence, setShowCadence] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);

  const prevBudgets = useRef<Record<string, number> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayIncome = fromMonthly(income, cadence);
  const activeCadenceLabel = CADENCES.find(c => c.value === cadence)?.label ?? 'Monthly';

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

  const showUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoVisible(true);
    undoTimer.current = setTimeout(() => setUndoVisible(false), 7000);
  }, []);

  const handleUndo = useCallback(() => {
    if (prevBudgets.current) {
      setBudgets(prevBudgets.current);
      setActiveTemplate(null);
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoVisible(false);
  }, []);

  const applyTemplate = (template: BudgetTemplate) => {
    prevBudgets.current = budgets;
    const next: Record<string, number> = {};
    SPEND_GROUPS.forEach(g => {
      const pct = (template as any)[g.key] as number;
      const target = income * pct;
      const subSum = g.subs.reduce((s, sub) => s + sub.budget, 0);
      g.subs.forEach(sub => {
        const ratio = subSum > 0 ? sub.budget / subSum : 1 / g.subs.length;
        next[bKey(g.key, sub.label)] = Math.round(target * ratio);
      });
    });
    setBudgets(next);
    setActiveTemplate(template.id);
    setShowTemplates(false);
    showUndo();
  };

  const confirmTemplate = (template: BudgetTemplate) =>
    Alert.alert(
      `Apply ${template.label}?`,
      'This will overwrite your current category budgets. Your income stays the same.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply', style: 'destructive', onPress: () => applyTemplate(template) },
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

  const allocatedPct   = Math.round((totalBudgeted / (income || 1)) * 100);
  const recurringTotal = UPCOMING_BILLS.reduce((s, b) => s + b.amount, 0);
  const discretionary  = Math.round(income - recurringTotal);

  const activeTemplateName = BUDGET_TEMPLATES.find(t => t.id === activeTemplate)?.label;

  const legendItems = [
    { label: 'Needs',                   dotColor: needsCol,                               valueColor: theme.text,    amount: needsTotal            },
    { label: 'Wants',                   dotColor: wantsCol,                               valueColor: theme.text,    amount: wantsTotal            },
    { label: 'Savings',                 dotColor: savingsCol,                             valueColor: theme.text,    amount: savingsTotal          },
    { label: isOver ? 'Over' : 'Free',  dotColor: isOver ? OVER_DOT : theme.textTer,     valueColor: isOver ? OVER_DOT : theme.textSec, amount: Math.abs(remaining) },
  ];

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

        {/* ── Sticky allocation bar (always visible) ── */}
        <View style={[styles.stickyBar, {
          backgroundColor: theme.bg,
          borderBottomWidth: 1,
          borderBottomColor: theme.sep,
        }]}>
          <View style={styles.stickyBarTop}>
            <Text style={[styles.eyebrow, { color: theme.textTer }]}>
              {allocatedPct}% allocated
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textSec }}>
              ${Math.round(totalBudgeted).toLocaleString()} of ${income.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.allocationBar, { backgroundColor: theme.chipBg }]}>
            {needsTotal > 0 && (
              <View style={[styles.barSegment, { width: `${(needsFrac * 100).toFixed(2)}%` as any, backgroundColor: needsCol }]} />
            )}
            {wantsTotal > 0 && (
              <View style={[styles.barSegment, { width: `${(wantsFrac * 100).toFixed(2)}%` as any, backgroundColor: wantsCol }]} />
            )}
            {savingsTotal > 0 && (
              <View style={[styles.barSegment, { width: `${(savingsFrac * 100).toFixed(2)}%` as any, backgroundColor: savingsCol }]} />
            )}
          </View>
          <View style={styles.legendRow}>
            {legendItems.map(item => (
              <View key={item.label} style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.dotColor }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.1, color: item.dotColor }}>
                    {item.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: item.valueColor, letterSpacing: -0.4 }}>
                  ${Math.round(item.amount).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>

          {/* ── Undo toast ─────────────────────────── */}
          {undoVisible && (
            <View style={[styles.undoRow, { backgroundColor: theme.text }]}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: theme.bg }}>
                Applied {activeTemplateName}
              </Text>
              <TouchableOpacity onPress={handleUndo} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.bg }}>
                  Undo
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Income (compact) ────────────────────── */}
          <View style={styles.incomeBlock}>
            <View style={styles.incomeCompactRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: theme.textTer }]}>Income</Text>
                {editingIncome ? (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 5 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSec }}>$</Text>
                    <TextInput
                      value={incomeDraft}
                      onChangeText={setIncomeDraft}
                      onBlur={commitIncome}
                      onSubmitEditing={commitIncome}
                      keyboardType="decimal-pad"
                      autoFocus
                      selectTextOnFocus
                      style={{
                        fontSize: 20,
                        fontWeight: '700',
                        letterSpacing: -0.5,
                        color: theme.text,
                        borderBottomWidth: 1.5,
                        borderBottomColor: theme.accent.dot,
                        paddingVertical: 2,
                        minWidth: 80,
                      }}
                    />
                    <Text style={{ fontSize: 12, color: theme.textTer, marginLeft: 2 }}>
                      {cadenceSuffix(cadence)}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { setIncomeDraft(String(displayIncome)); setEditingIncome(true); }}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSec }}>$</Text>
                    <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: theme.text }}>
                      {displayIncome.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textTer }}>
                      {cadenceSuffix(cadence)}
                    </Text>
                    <Icon name="pencil" size={13} color={theme.textTer} stroke={1.5} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Pay period toggle — shows active cadence so it's self-describing */}
              <TouchableOpacity
                onPress={() => setShowCadence(v => !v)}
                activeOpacity={0.7}
                style={[styles.cadenceToggleBtn, {
                  backgroundColor: showCadence ? theme.text : theme.chipBg,
                }]}
              >
                <Text style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: showCadence ? theme.bg : theme.textSec,
                }}>
                  {activeCadenceLabel}
                </Text>
                <View style={{ transform: [{ rotate: showCadence ? '180deg' : '0deg' }] }}>
                  <Icon
                    name="chevDown"
                    size={11}
                    color={showCadence ? theme.bg : theme.textTer}
                    stroke={1.8}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {showCadence && (
              <View style={{ marginTop: 12 }}>
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
                  <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 6 }}>
                    ${income.toLocaleString()}/month
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* ── Template selector ───────────────────── */}
          <TouchableOpacity
            onPress={() => setShowTemplates(v => !v)}
            activeOpacity={0.7}
            style={[styles.templateHeader, { backgroundColor: theme.chipBg }]}
          >
            <Icon name="split" size={15} color={theme.textSec} stroke={1.5} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, letterSpacing: -0.2 }}>
                {activeTemplateName ? activeTemplateName : 'Split templates'}
              </Text>
              {activeTemplateName && (
                <Text style={{ fontSize: 11, color: theme.accent.dot, marginTop: 1 }}>
                  Applied
                </Text>
              )}
            </View>
            <View style={{ transform: [{ rotate: showTemplates ? '180deg' : '0deg' }] }}>
              <Icon name="chevDown" size={14} color={theme.textTer} stroke={1.5} />
            </View>
          </TouchableOpacity>

          {showTemplates && (
            <View style={[styles.templateDropdown, { borderColor: theme.sep, backgroundColor: theme.bg }]}>
              {BUDGET_TEMPLATES.map((t, i) => {
                const isActive = activeTemplate === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => confirmTemplate(t)}
                    activeOpacity={0.7}
                    style={[styles.templateOption, {
                      borderBottomWidth: i < BUDGET_TEMPLATES.length - 1 ? 1 : 0,
                      borderBottomColor: theme.sep,
                      backgroundColor: isActive ? theme.chipBg : 'transparent',
                    }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: isActive ? theme.accent.dot : theme.text,
                        letterSpacing: -0.3,
                      }}>
                        {t.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 2 }}>
                        {t.subtitle}
                      </Text>
                    </View>
                    {/* Percentage split as colored text */}
                    <View style={styles.templateSplit}>
                      {[
                        { abbr: 'N', pct: t.needs, col: needsCol },
                        { abbr: 'W', pct: t.wants, col: wantsCol },
                        { abbr: 'S', pct: t.savings, col: savingsCol },
                      ].map(seg => (
                        <View key={seg.abbr} style={styles.templateSplitItem}>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: seg.col }}>
                            {seg.abbr}
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: seg.col }}>
                            {Math.round(seg.pct * 100)}%
                          </Text>
                        </View>
                      ))}
                    </View>
                    {isActive && (
                      <View style={[styles.appliedChip, { backgroundColor: theme.accent.fill }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.accent.ink }}>
                          On
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Recurring bills ─────────────────────── */}
          <View style={[styles.divider, { backgroundColor: theme.sep }]} />
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recurring bills</Text>
          </View>
          <Text style={{ fontSize: 11, color: theme.textTer, marginBottom: 10, paddingHorizontal: 2 }}>
            Tracked separately from your category budgets.
          </Text>
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
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSec, letterSpacing: -0.2 }}>
                {bill.estimate ? '≈' : ''}${bill.amount % 1 !== 0 ? bill.amount.toFixed(2) : bill.amount.toLocaleString()}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 12, color: theme.textTer, marginTop: 10, paddingHorizontal: 2 }}>
            ${recurringTotal.toFixed(2)} locked in · ${discretionary.toLocaleString()} discretionary
          </Text>

          {/* ── Category groups ─────────────────────── */}
          {SPEND_GROUPS.map(g => {
            const groupColor = gCol(g.key);
            const groupTotal = Math.round(groupTotals[g.key] ?? 0);
            return (
              <React.Fragment key={g.key}>
                <View style={[styles.divider, { backgroundColor: theme.sep }]} />
                <View style={styles.sectionHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: groupColor }} />
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{g.label}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: groupColor, letterSpacing: -0.4 }}>
                    ${groupTotal.toLocaleString()}
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
              { label: 'Budgeted',  value: `$${Math.round(totalBudgeted).toLocaleString()}`,                                          color: theme.text                          },
              { label: 'Left over', value: `${isOver ? '-' : ''}$${Math.abs(Math.round(remaining)).toLocaleString()}`,                color: isOver ? OVER_DOT : theme.accent.dot },
              { label: 'Savings',   value: `$${Math.round(savingsTotal).toLocaleString()}`,                                           color: savingsCol                          },
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
    paddingBottom: 12,
  },
  stickyBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
  },
  stickyBarTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  allocationBar: {
    height: 20,
    borderRadius: 10,
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
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  incomeBlock: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  incomeCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cadenceToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
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
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  templateDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 2,
  },
  templateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  templateSplit: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  templateSplitItem: {
    alignItems: 'center',
    gap: 1,
  },
  appliedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    marginHorizontal: -20,
    marginVertical: 22,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
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
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
});
