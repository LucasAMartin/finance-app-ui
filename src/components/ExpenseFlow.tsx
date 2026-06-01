import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet,
  Animated, Easing, KeyboardAvoidingView, Platform, Linking,
  type TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme';
import { Icon } from './Icon';
import { DictationText } from './DictationText';
import { SheetPrimaryButton } from './shared';
import { TYPE } from '../typography';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupFor, categoryMap } from '../repositories/categoryUtils';
import type { Category, GroupKey } from '../repositories/types';
import { useVoiceRecognition } from '../voice/useVoiceRecognition';
import { parseVoiceExpense } from '../voice/parseVoiceExpense';
import { Host, Picker, Text as SwiftText, Button, Image as SwiftImage, DatePicker } from '@expo/ui/swift-ui';
import {
  buttonStyle, controlSize, datePickerStyle, environment, pickerStyle, tag, tint,
} from '@expo/ui/swift-ui/modifiers';
import { MenuView } from '@react-native-menu/menu';

export interface SavedExpenseInfo {
  id: string;
  amount: number;
  catLabel: string;
  merchant: string;
}

interface ExpenseFlowProps {
  theme: Theme;
  initialMode?: 'voice' | 'manual';
  onClose: () => void;
  onSaved?: (info: SavedExpenseInfo) => void;
}

type Mode = 'idle' | 'listening' | 'manual';

const GROUP_META: Record<GroupKey, { label: string; icon: string }> = {
  needs: { label: 'Needs', icon: 'home' },
  wants: { label: 'Wants', icon: 'sparkle' },
  savings: { label: 'Savings', icon: 'wallet' },
};
const GROUP_KEYS: GroupKey[] = ['needs', 'wants', 'savings'];
const KEY_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'del'],
];

// Recurring cadence offered on the expense screen. 'never' = a one-off expense.
type RepeatValue = 'never' | 'weekly' | 'monthly' | 'annual';
const REPEAT_OPTIONS: { value: RepeatValue; label: string }[] = [
  { value: 'never',   label: 'Never' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual',  label: 'Yearly' },
];
const repeatLabel = (v: RepeatValue) => REPEAT_OPTIONS.find(o => o.value === v)?.label ?? 'Never';

// nextDueDate for a freshly-created rule: one cadence interval past the start.
function nextDueAfter(start: Date, cadence: 'weekly' | 'monthly' | 'annual'): string {
  const d = new Date(start);
  if (cadence === 'weekly') d.setDate(d.getDate() + 7);
  else if (cadence === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export function ExpenseFlow({ theme, initialMode = 'voice', onClose, onSaved }: ExpenseFlowProps) {
  const { transactionsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();
  const darkScheme = theme.dark ? 'dark' : 'light';

  const [mode, setMode] = useState<Mode>(initialMode === 'manual' ? 'manual' : 'idle');
  const [manualAmt, setManualAmt] = useState('0.00');
  const [manualCat, setManualCat] = useState('groceries');
  const [manualMerchant, setManualMerchant] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualDate, setManualDate] = useState<Date>(() => new Date());
  const [manualRepeat, setManualRepeat] = useState<RepeatValue>('never');
  const [heardTranscript, setHeardTranscript] = useState('');

  const voice = useVoiceRecognition();
  const transcriptRef = useRef('');
  useEffect(() => { transcriptRef.current = voice.transcript; }, [voice.transcript]);

  const cancelVoiceResultRef = useRef(false);

  const ringAnims = useRef(Array.from({ length: 3 }, () => new Animated.Value(0))).current;
  const ringLoops = useRef<(Animated.CompositeAnimation | null)[]>([null, null, null]);
  const ringTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startRings = () => {
    ringTimeouts.current.forEach(clearTimeout);
    ringLoops.current.forEach(l => l?.stop());
    ringAnims.forEach(a => a.setValue(0));
    ringTimeouts.current = ringAnims.map((anim, i) =>
      setTimeout(() => {
        const loop = Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true })
        );
        ringLoops.current[i] = loop;
        loop.start();
      }, i * 600)
    );
  };

  const stopRings = () => {
    ringTimeouts.current.forEach(clearTimeout);
    ringLoops.current.forEach(l => l?.stop());
    ringAnims.forEach(a => a.setValue(0));
  };

  // Reset when opened.
  useEffect(() => {
    setManualAmt('0.00');
    setManualCat(categories[0]?.id ?? 'groceries');
    setManualMerchant('');
    setManualNote('');
    setManualDate(new Date());
    setManualRepeat('never');
    setHeardTranscript('');
    voice.reset();
    return () => { voice.abort(); stopRings(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (voice.listening) {
      if (cancelVoiceResultRef.current) return;
      setMode('listening');
      startRings();
      return;
    }
    stopRings();
    if (cancelVoiceResultRef.current) {
      cancelVoiceResultRef.current = false;
      return;
    }
    const finalText = transcriptRef.current.trim();
    if (mode === 'listening' && finalText) {
      const result = parseVoiceExpense(finalText);
      setManualAmt(result.amount > 0 ? result.amount.toFixed(2) : '0.00');
      setManualCat(cats[result.cat] ? result.cat : categories[0]?.id ?? 'groceries');
      setManualMerchant(result.merchant);
      setManualNote('');
      setHeardTranscript(finalText);
      setMode('manual');
    } else if (mode === 'listening') {
      setMode('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.listening]);

  const switchToManual = () => {
    if (voice.listening) cancelVoiceResultRef.current = true;
    voice.abort();
    stopRings();
    setMode('manual');
  };

  const switchToVoice = () => {
    setHeardTranscript('');
    setMode('idle');
  };

  const press = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (k === 'clear') { setManualAmt('0.00'); return; }
    setManualAmt(a => {
      const cents = Math.round(parseFloat(a || '0') * 100) || 0;
      let next: number;
      if (k === 'del') next = Math.floor(cents / 10);
      else next = cents * 10 + parseInt(k, 10);
      next = Math.min(next, 99_999_999);
      return (next / 100).toFixed(2);
    });
  };

  const amountValue = parseFloat(manualAmt);
  const canSave = Number.isFinite(amountValue) && amountValue > 0;

  const commit = () => {
    const amount = parseFloat(manualAmt);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const cat = manualCat;
    const rawMerchant = manualMerchant.trim();
    const merchant = rawMerchant || cats[cat]?.label || 'Expense';
    const tx = transactionsRepo.create({
      amount, cat, merchant, note: manualNote,
      occurredAt: manualDate.toISOString(),
      type: 'expense', visibility: 'shared',
      createdByUserId: 'local', updatedByUserId: 'local',
      meta: { merchantSource: rawMerchant ? 'user' : 'fallback' },
    });
    // When marked recurring, also seed a rule so future instances are tracked.
    if (manualRepeat !== 'never') {
      recurringRulesRepo.create({
        merchant, cat, amount,
        cadence: manualRepeat,
        startDate: manualDate.toISOString().slice(0, 10),
        nextDueDate: nextDueAfter(manualDate, manualRepeat),
        active: true, estimate: false,
        createdByUserId: 'local', updatedByUserId: 'local',
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return { id: tx.id, amount, catLabel: cats[cat]?.label ?? cat, merchant };
  };

  const saveExpense = () => {
    const info = commit();
    if (!info) return;
    voice.abort();
    onSaved?.(info);
    onClose();
  };

  const isVoiceMode = mode === 'idle' || mode === 'listening';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[S.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={S.header}>
          <Host colorScheme={darkScheme} matchContents style={S.backBtnHost}>
            <Button
              onPress={() => { voice.abort(); onClose(); }}
              modifiers={[
                buttonStyle('glass'),
                controlSize('regular'),
                environment({ key: 'colorScheme', value: darkScheme }),
              ]}
            >
              <SwiftImage systemName="chevron.left" />
            </Button>
          </Host>
          <Text style={[TYPE.pageTitle, { color: theme.text }]}>New expense</Text>
          <View style={S.headerSpacer} />
        </View>

        {/* Voice / Manual toggle */}
        <View style={S.pickerWrapper}>
          <Host matchContents>
            <Picker
              selection={mode === 'manual' ? 1 : 0}
              onSelectionChange={(val) => {
                if (Number(val) === 0) switchToVoice();
                else switchToManual();
              }}
              modifiers={[
                pickerStyle('segmented'),
                tint(theme.accent.dot),
                environment({ key: 'colorScheme', value: darkScheme }),
              ]}
            >
              <SwiftText modifiers={[tag(0)]}>Voice</SwiftText>
              <SwiftText modifiers={[tag(1)]}>Manual</SwiftText>
            </Picker>
          </Host>
        </View>

        {/* Body — fills the space below the header; never scrolls. The manual
            keypad flexes to absorb slack / shrink so everything always fits. */}
        <View style={{ flex: 1 }}>
          {/* ── IDLE / LISTENING ── */}
          {isVoiceMode && (
            <View style={S.voiceLayout}>
              {/* Floating center text — no background */}
              <View style={S.voiceTextZone}>
                {mode === 'listening' ? (
                  voice.transcript ? (
                    <DictationText
                      text={voice.transcript}
                      baseColor={theme.textSec}
                      highlightColor={theme.text}
                      textStyle={S.transcriptLive}
                    />
                  ) : (
                    <DictationText
                      text="Listening…"
                      baseColor={theme.textSec}
                      highlightColor={theme.accent.dot}
                      textStyle={S.listeningText}
                    />
                  )
                ) : voice.error ? (
                  <View style={{ alignItems: 'center', gap: 12 }}>
                    <Text style={[S.hintText, { color: theme.textSec, textAlign: 'center' }]}>
                      {voice.error}
                    </Text>
                    <View style={S.errorActions}>
                      {voice.error.includes('Settings') && (
                        <Pressable onPress={() => Linking.openSettings()} hitSlop={8} accessibilityRole="button">
                          <Text style={[TYPE.body, { color: theme.accent.dot }]}>Open Settings</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={switchToManual} hitSlop={8} accessibilityRole="button">
                        <Text style={[TYPE.body, { color: theme.accent.dot }]}>Type instead</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[TYPE.captionEm, { color: theme.textTer, marginBottom: 10 }]}>Say something like</Text>
                    <Text style={[S.hintExample, { color: theme.textSec }]}>Groceries at Walmart, sixty-two fifty</Text>
                  </View>
                )}
              </View>

              {/* Mic button anchored near bottom */}
              <View style={S.micBottomZone}>
                <View style={S.micRingWrapper}>
                  {ringAnims.map((anim, i) => {
                    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
                    const opacity = anim.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.22, 0] });
                    return (
                      <Animated.View
                        key={i}
                        style={[S.ring, { backgroundColor: theme.accent.fill, opacity, transform: [{ scale }] }]}
                      />
                    );
                  })}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(mode === 'listening'
                        ? Haptics.ImpactFeedbackStyle.Medium
                        : Haptics.ImpactFeedbackStyle.Light);
                      if (mode === 'listening') voice.stop(); else voice.start();
                    }}
                    pointerEvents="box-only"
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                    style={[S.micBtn, {
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(14,12,24,0.07)',
                      borderWidth: 1,
                      borderColor: theme.hairline,
                    }]}
                  >
                    {mode === 'listening'
                      ? <View style={[S.stopSquare, { backgroundColor: theme.accent.dot }]} />
                      : <Icon name="mic" size={30} color={theme.accent.dot} stroke={1.7} />
                    }
                  </Pressable>
                </View>
                
              </View>
            </View>
          )}

          {/* ── MANUAL ── */}
          {mode === 'manual' && (
            <View style={[S.manualRoot, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <View style={S.manualAmountWrap}>
                <View style={S.manualAmountRow}>
                  <Text style={[S.manualAmountSign, { color: theme.textSec }]}>$</Text>
                  <AmountText
                    value={manualAmt}
                    color={canSave ? theme.text : theme.textTer}
                    textStyle={S.manualAmountValue}
                  />
                </View>
              </View>

              {heardTranscript ? (
                <View style={S.heardRow}>
                  <Icon name="mic" size={11} color={theme.textTer} stroke={1.7} />
                  <Text style={[TYPE.caption, { color: theme.textTer, flexShrink: 1 }]} numberOfLines={1}>
                    "{heardTranscript}"
                  </Text>
                </View>
              ) : null}

              <View style={[S.fieldCard, { backgroundColor: theme.chipBg }]}>
                <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[TYPE.body, { color: theme.textSec }]}>Merchant</Text>
                  <TextInput
                    value={manualMerchant} onChangeText={setManualMerchant}
                    placeholder="Where?" placeholderTextColor={theme.textTer}
                    style={[S.fieldInput, { color: theme.text, flex: 1 }]}
                    keyboardAppearance={darkScheme}
                  />
                </View>
                <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[TYPE.body, { color: theme.textSec }]}>Note</Text>
                  <TextInput
                    value={manualNote} onChangeText={setManualNote}
                    placeholder="Optional" placeholderTextColor={theme.textTer}
                    style={[S.fieldInput, { color: theme.text, flex: 1 }]}
                    keyboardAppearance={darkScheme}
                  />
                </View>
                <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[TYPE.body, { color: theme.textSec }]}>Date</Text>
                  <Host matchContents>
                    <DatePicker
                      selection={manualDate}
                      displayedComponents={['date']}
                      onDateChange={setManualDate}
                      modifiers={[
                        datePickerStyle('compact'),
                        tint(theme.accent.dot),
                        environment({ key: 'colorScheme', value: darkScheme }),
                      ]}
                    />
                  </Host>
                </View>
                <View style={S.fieldRow}>
                  <Text style={[TYPE.body, { color: theme.textSec }]}>Repeat</Text>
                  <MenuView
                    shouldOpenOnLongPress={false}
                    themeVariant={theme.dark ? 'dark' : 'light'}
                    actions={REPEAT_OPTIONS.map(o => ({
                      id: o.value,
                      title: o.label,
                      state: o.value === manualRepeat ? 'on' : 'off',
                    }))}
                    onPressAction={({ nativeEvent }) => setManualRepeat(nativeEvent.event as RepeatValue)}
                  >
                    <View style={S.subcatMenuTrigger}>
                      <Text style={[S.subcatMenuText, { color: theme.text }]} numberOfLines={1}>
                        {repeatLabel(manualRepeat)}
                      </Text>
                      <Icon name="chevDown" size={11} color={theme.text} stroke={2} />
                    </View>
                  </MenuView>
                </View>
              </View>

              <View style={S.categoryWrap}>
                <CategoryPicker
                  theme={theme}
                  activeCat={manualCat}
                  categories={categories}
                  cats={cats}
                  onChange={setManualCat}
                  darkScheme={darkScheme}
                />
              </View>

              <View style={S.keypad}>
                {KEY_ROWS.map((row, ri) => (
                  <View key={ri} style={S.keyRow}>
                    {row.map(k => (
                      <KeyButton key={k} theme={theme} onPress={() => press(k)} label={k === 'del' ? 'Delete' : k === 'clear' ? 'Clear' : k}>
                        {k === 'del' ? (
                          <Icon name="backspace" size={20} color={theme.text} stroke={1.5} />
                        ) : k === 'clear' ? (
                          <Text style={[TYPE.body, { fontWeight: '600', color: theme.textSec }]}>Clear</Text>
                        ) : (
                          <Text style={[TYPE.headline, { fontWeight: '500', color: theme.text }]}>{k}</Text>
                        )}
                      </KeyButton>
                    ))}
                  </View>
                ))}
              </View>

              <SheetPrimaryButton
                label="Save expense"
                onPress={saveExpense}
                theme={theme}
                disabled={!canSave}
                style={{ marginTop: 10 }}
              />
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Category picker ─────────────────────────────────────────────────────────

function CategoryPicker({
  theme, activeCat, categories, cats, onChange, darkScheme,
}: {
  theme: Theme;
  activeCat: string;
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  onChange: (cat: string) => void;
  darkScheme: 'dark' | 'light';
}) {
  const selectedGroup = categoryGroupFor(activeCat, categories);
  const selectedGroupIdx = Math.max(0, GROUP_KEYS.indexOf(selectedGroup));
  const subcats = categories.filter(cat => cat.group === selectedGroup && !cat.archived);
  const selectedSubIdx = Math.max(0, subcats.findIndex(cat => cat.id === activeCat));

  return (
    <View style={[S.categoryPanel, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
      <Host matchContents>
        <Picker
          selection={selectedGroupIdx}
          onSelectionChange={(val) => {
            const nextGroup = GROUP_KEYS[Number(val)];
            if (!nextGroup) return;
            const nextSubcats = categories.filter(cat => cat.group === nextGroup && !cat.archived);
            if (nextSubcats.length === 0) return;
            const nextKeep = nextSubcats.find(cat => cat.id === activeCat);
            onChange((nextKeep ?? nextSubcats[0]).id);
          }}
          modifiers={[
            pickerStyle('segmented'),
            tint(theme.accent.dot),
            environment({ key: 'colorScheme', value: darkScheme }),
          ]}
        >
          {GROUP_KEYS.map((key, idx) => (
            <SwiftText key={key} modifiers={[tag(idx)]}>{GROUP_META[key].label}</SwiftText>
          ))}
        </Picker>
      </Host>

      <View style={[S.subcategoryRow, { borderTopColor: theme.hairline }]}>
        <Text style={[TYPE.body, { color: theme.textSec }]}>Subcategory</Text>
        {subcats.length > 0 ? (
          <MenuView
            shouldOpenOnLongPress={false}
            themeVariant={theme.dark ? 'dark' : 'light'}
            actions={subcats.map((cat, idx) => ({
              id: String(idx),
              title: cats[cat.id]?.label ?? cat.label,
              state: idx === selectedSubIdx ? 'on' : 'off',
            }))}
            onPressAction={({ nativeEvent }) => {
              const next = subcats[Number(nativeEvent.event)];
              if (next) onChange(next.id);
            }}
          >
            <View style={S.subcatMenuTrigger}>
              <Text style={[S.subcatMenuText, { color: theme.text }]} numberOfLines={1}>
                {cats[subcats[selectedSubIdx]?.id ?? '']?.label ?? subcats[selectedSubIdx]?.label}
              </Text>
              <Icon name="chevDown" size={11} color={theme.text} stroke={2} />
            </View>
          </MenuView>
        ) : (
          <Text style={[TYPE.bodySm, { color: theme.textTer }]}>No subcategories</Text>
        )}
      </View>
    </View>
  );
}

// ─── Amount display ───────────────────────────────────────────────────────────

function AmountText({ value, color, textStyle }: { value: string; color: string; textStyle: TextStyle }) {
  const chars = value.split('');
  const prevRef = useRef(value);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const prev = prevRef.current;
    const grew = value.length > prev.length ||
      (value.length === prev.length && parseFloat(value) > parseFloat(prev));
    prevRef.current = value;
    if (grew) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1, duration: 170,
        easing: Easing.out(Easing.quad), useNativeDriver: true,
      }).start();
    } else { anim.setValue(1); }
  }, [value]);

  const lastIdx = chars.length - 1;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [7, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={S.amountChars}>
      {chars.map((ch, i) =>
        i === lastIdx ? (
          <Animated.Text key={`last-${i}`} style={[textStyle, { color, opacity: anim, transform: [{ translateY }, { scale }] }]}>
            {ch}
          </Animated.Text>
        ) : (
          <Text key={i} style={[textStyle, { color }]}>{ch}</Text>
        )
      )}
    </View>
  );
}

// ─── Key button ───────────────────────────────────────────────────────────────

function KeyButton({ theme, label, onPress, children }: {
  theme: Theme; label: string; onPress: () => void; children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressed = useRef(new Animated.Value(0)).current;

  const setPressed = (active: boolean) => {
    Animated.spring(scale, { toValue: active ? 0.92 : 1, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
    Animated.timing(pressed, { toValue: active ? 1 : 0, duration: active ? 60 : 160, useNativeDriver: false }).start();
  };

  const backgroundColor = pressed.interpolate({ inputRange: [0, 1], outputRange: [theme.chipBg, theme.sep] });

  return (
    <Animated.View style={[S.keyCell, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={() => { Haptics.selectionAsync().catch(() => {}); setPressed(true); }}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        pointerEvents="box-only"
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ flex: 1 }}
      >
        <Animated.View style={[S.keyFace, { backgroundColor }]}>
          {children}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
  },
  backBtnHost: { width: 44, height: 44 },
  headerSpacer: { width: 44 },
  pickerWrapper: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },

  // Voice layout
  voiceLayout: { flex: 1, alignItems: 'center' },
  voiceTextZone: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, paddingTop: 8,
  },
  micBottomZone: { alignItems: 'center', paddingBottom: 36, paddingTop: 16 },
  micRingWrapper: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  ring: { position: 'absolute', width: 88, height: 88, borderRadius: 44 },
  micBtn: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 18, height: 18, borderRadius: 5 },
  hintExample: { fontSize: 20, fontWeight: '500', letterSpacing: -0.4, lineHeight: 27, textAlign: 'center' },
  hintText: { fontSize: 16, fontWeight: '500', letterSpacing: -0.3, lineHeight: 24, textAlign: 'center' },
  listeningText: { fontSize: 22, fontWeight: '500', letterSpacing: -0.4, lineHeight: 28, textAlign: 'center' },
  transcriptLive: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5, lineHeight: 33, textAlign: 'center' },
  errorActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },

  // Manual layout
  manualRoot: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },
  manualAmountWrap: { alignItems: 'center', paddingVertical: 10, marginBottom: 2 },
  manualAmountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  manualAmountSign: { fontSize: 46, fontWeight: '600', letterSpacing: -1.2, lineHeight: 52, marginRight: 3 },
  manualAmountValue: { fontSize: 46, fontWeight: '600', letterSpacing: -1.2, lineHeight: 52, fontVariant: ['tabular-nums'] },
  amountChars: { flexDirection: 'row', alignItems: 'flex-end' },
  heardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, marginTop: -4, marginBottom: 12, paddingHorizontal: 16,
  },
  fieldCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 16, gap: 12, minHeight: 46,
  },
  fieldInput: { ...TYPE.subsectionTitle, fontWeight: '500', textAlign: 'right', padding: 0 },
  categoryPanel: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  categoryWrap: { marginBottom: 10 },
  subcategoryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth,
  },
  subcatMenuTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingLeft: 8, flexShrink: 1 },
  subcatMenuText: { ...TYPE.body, fontWeight: '500', flexShrink: 1 },
  // Keypad fills the slack below the form and shrinks to whatever space is left
  // so the screen never needs to scroll. maxHeight keeps keys from ballooning on
  // tall devices; it's free to shrink below that on short ones.
  keypad: { flex: 1, gap: 8, marginBottom: 8, maxHeight: 268 },
  keyRow: { flex: 1, flexDirection: 'row', gap: 8 },
  keyCell: { flex: 1 },
  keyFace: { flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
