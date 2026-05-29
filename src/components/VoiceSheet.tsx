import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, Animated, Easing, Linking, type TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Theme } from '../theme';
import { Icon } from './Icon';
import { DictationText } from './DictationText';
import { SheetPrimaryButton } from './shared';
import { TYPE } from '../typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupFor, categoryMap } from '../repositories/categoryUtils';
import type { Category, GroupKey } from '../repositories/types';
import { useVoiceRecognition } from '../voice/useVoiceRecognition';
import { parseVoiceExpense } from '../voice/parseVoiceExpense';
import { BottomSheet, Group, Host, Picker, RNHostView, Text as SwiftText } from '@expo/ui/swift-ui';
import { background, controlSize, fixedSize, font, pickerStyle, presentationDetents, presentationDragIndicator, tag, tint, environment, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';

type Mode = 'idle' | 'listening' | 'manual';

const VOICE_DETENT_DEFAULT: PresentationDetent = { fraction: 0.62 };
const VOICE_DETENT_LARGE: PresentationDetent = 'large';
const VOICE_DETENTS: PresentationDetent[] = [VOICE_DETENT_DEFAULT, VOICE_DETENT_LARGE];

const GROUP_META: Record<GroupKey, { label: string; icon: string }> = {
  needs: { label: 'Needs', icon: 'home' },
  wants: { label: 'Wants', icon: 'sparkle' },
  savings: { label: 'Savings', icon: 'wallet' },
};
const GROUP_KEYS: GroupKey[] = ['needs', 'wants', 'savings'];

const BAR_COUNT = 24;
// Bell-curve sine pattern for the idle waveform silhouette
const STATIC_WAVE = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i / (BAR_COUNT - 1);
  return 0.12 + 0.55 * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(t * Math.PI * 4));
});

export interface SavedExpenseInfo {
  id: string;
  amount: number;
  catLabel: string;
  merchant: string;
}

interface VoiceSheetProps {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  onSaved?: (info: SavedExpenseInfo) => void;
  initialMode?: 'voice' | 'manual';
}

export function VoiceSheet({ theme, visible, onClose, onSaved, initialMode = 'voice' }: VoiceSheetProps) {
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();

  const [detent, setDetent] = useState<PresentationDetent>(VOICE_DETENT_DEFAULT);
  const [mode, setMode] = useState<Mode>('idle');
  const [manualAmt, setManualAmt] = useState('0.00');
  const [manualCat, setManualCat] = useState('groceries');
  const [manualMerchant, setManualMerchant] = useState('');
  const [manualNote, setManualNote] = useState('');
  // What the voice transcript said, kept visible in the form so a misheard
  // amount can be caught against what was actually spoken.
  const [heardTranscript, setHeardTranscript] = useState('');

  const voice = useVoiceRecognition();
  const transcriptRef = useRef('');
  useEffect(() => { transcriptRef.current = voice.transcript; }, [voice.transcript]);

  const voiceLevelAnim = useRef(new Animated.Value(0)).current;
  const cancelVoiceResultRef = useRef(false);

  // Three staggered pulse rings that expand outward while listening
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

  useEffect(() => {
    if (visible) {
      setManualAmt('0.00');
      setManualCat(categories[0]?.id ?? 'groceries');
      setManualMerchant('');
      setManualNote('');
      setHeardTranscript('');
      voice.reset();
      if (initialMode === 'manual') {
        setDetent(VOICE_DETENT_LARGE);
        setMode('manual');
      } else {
        // Open to a resting state that shows the example prompts; the mic goes
        // live only when the user taps it, never the instant the sheet appears.
        setDetent(VOICE_DETENT_DEFAULT);
        setMode('idle');
      }
    } else {
      voice.abort();
      voiceLevelAnim.setValue(0);
      stopRings();
    }
    return () => { stopRings(); };
  }, [visible, categories]);

  useEffect(() => {
    if (voice.listening) {
      if (cancelVoiceResultRef.current) return;
      setMode('listening');
      startRings();
      return;
    }
    voiceLevelAnim.setValue(0);
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
      setDetent(VOICE_DETENT_LARGE);
      setMode('manual');
    } else if (mode === 'listening') {
      setMode('idle');
    }
  }, [voice.listening, mode, cats, categories]);

  useEffect(() => {
    Animated.timing(voiceLevelAnim, {
      toValue: voice.listening ? voice.level : 0,
      duration: 80,
      useNativeDriver: true,
    }).start();
  }, [voice.level, voice.listening, voiceLevelAnim]);

  const switchToManual = () => {
    if (voice.listening) cancelVoiceResultRef.current = true;
    voice.abort();
    voiceLevelAnim.setValue(0);
    stopRings();
    setMode('manual');
    setDetent(VOICE_DETENT_LARGE);
  };

  const switchToVoice = () => {
    setHeardTranscript('');
    setMode('idle');
    setDetent(VOICE_DETENT_DEFAULT);
  };

  // Cents-first entry: every key shifts digits in from the right, the way
  // Cash App / Apple Wallet handle money. No decimal key to fumble for.
  const press = (k: string) => {
    if (k === 'clear') { setManualAmt('0.00'); return; }
    setManualAmt(a => {
      const cents = Math.round(parseFloat(a || '0') * 100) || 0;
      let next: number;
      if (k === 'del') next = Math.floor(cents / 10);
      else next = cents * 10 + parseInt(k, 10);
      next = Math.min(next, 99_999_999); // cap at $999,999.99
      return (next / 100).toFixed(2);
    });
  };

  const waveScaleForBar = (i: number) => {
    const t = i / (BAR_COUNT - 1);
    const center = 1 - Math.abs(t - 0.5) * 2;
    const min = 0.14 + center * 0.12;
    const max = 0.26 + center * 1.4;
    return voiceLevelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [min, max],
      extrapolate: 'clamp',
    });
  };

  const amountValue = parseFloat(manualAmt);
  const canSave = Number.isFinite(amountValue) && amountValue > 0;

  // Writes the transaction and returns a summary for the confirmation view.
  const commit = () => {
    const amount = parseFloat(manualAmt);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const cat = manualCat;
    const merchant = manualMerchant.trim() || cats[cat]?.label || 'Expense';
    const tx = transactionsRepo.create({
      amount,
      cat,
      merchant,
      note: manualNote,
      occurredAt: new Date().toISOString(),
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return { id: tx.id, amount, catLabel: cats[cat]?.label ?? cat, merchant };
  };

  // Save closes the sheet immediately; confirmation + Undo live in a small
  // toast at the app level so they stay out of the way.
  const saveExpense = () => {
    const info = commit();
    if (!info) return;
    voice.abort();
    onSaved?.(info);
    onClose();
  };

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents(VOICE_DETENTS, { selection: detent, onSelectionChange: setDetent }),
          presentationDragIndicator('visible'),
          environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
          background(theme.surface),
        ]}>
          <RNHostView>
            <View style={[S.sheet, {
              backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)',
            }]}>
              {/* Header */}
              <View style={S.sheetHeader}>
                <Pressable
                  onPress={() => { voice.abort(); onClose(); }}
                  pointerEvents="box-only"
                  style={S.headerBtn}
                >
                  <Text style={[TYPE.body, { color: theme.textSec }]}>Cancel</Text>
                </Pressable>
                <Text style={[TYPE.pageTitle, { color: theme.text }]}>New expense</Text>
                <View style={S.headerBtn} />
              </View>

              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                scrollEnabled={mode !== 'manual'}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
              >
                <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
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
                        environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                      ]}
                    >
                      <SwiftText modifiers={[tag(0)]}>Voice</SwiftText>
                      <SwiftText modifiers={[tag(1)]}>Manual</SwiftText>
                    </Picker>
                  </Host>
                </View>

                {/* IDLE / LISTENING */}
                {(mode === 'idle' || mode === 'listening') && (
                  <View style={S.voiceCenter}>

                    {/* Hint text or live transcript */}
                    <View style={[S.topZone, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
                      {mode === 'listening' ? (
                        voice.transcript ? (
                          <DictationText
                            text={voice.transcript}
                            baseColor={theme.textSec}
                            highlightColor={theme.text}
                            textStyle={S.transcriptLive}
                          />
                        ) : (
                          <Text style={[S.hintSub, { color: theme.textTer }]}>Listening now</Text>
                        )
                      ) : voice.error ? (
                        <View style={{ alignItems: 'center', gap: 10 }}>
                          <Text style={[S.hintSub, { color: theme.textSec, textAlign: 'center' }]}>
                            {voice.error}
                          </Text>
                          <View style={S.errorActions}>
                            {voice.error.includes('Settings') && (
                              <Pressable
                                onPress={() => Linking.openSettings()}
                                pointerEvents="box-only"
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel="Open Settings"
                              >
                                <Text style={[TYPE.body, { color: theme.accent.dot }]}>Open Settings</Text>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={switchToManual}
                              pointerEvents="box-only"
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Type it instead"
                            >
                              <Text style={[TYPE.body, { color: theme.accent.dot }]}>Type instead</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <>
                          <Text style={[TYPE.captionEm, { color: theme.textTer, marginBottom: 4 }]}>Say something like</Text>
                          <Text style={[S.hintExample, { color: theme.textSec }]}>
                            "Coffee at Blue Bottle, six fifty"
                          </Text>
                          <Text style={[S.hintExample, { color: theme.textSec }]}>
                            "Groceries, twenty dollars"
                          </Text>
                        </>
                      )}
                    </View>

                    {/* Mic button with expanding pulse rings */}
                    <View style={S.micZone}>
                      {ringAnims.map((anim, i) => {
                        const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
                        const opacity = anim.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.22, 0] });
                        return (
                          <Animated.View
                            key={i}
                            style={[
                              S.ring,
                              {
                                backgroundColor: theme.accent.fill,
                                opacity,
                                transform: [{ scale }],
                              },
                            ]}
                          />
                        );
                      })}
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(
                            mode === 'listening'
                              ? Haptics.ImpactFeedbackStyle.Medium
                              : Haptics.ImpactFeedbackStyle.Light
                          );
                          if (mode === 'listening') voice.stop(); else voice.start();
                        }}
                        pointerEvents="box-only"
                        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                        accessibilityRole="button"
                        accessibilityLabel={mode === 'listening' ? 'Stop recording' : 'Start recording'}
                        style={[S.micBtn, { backgroundColor: theme.accent.fill }]}
                      >
                        {mode === 'listening' ? (
                          <View style={[S.stopSquare, { backgroundColor: theme.accent.dot }]} />
                        ) : (
                          <Icon name="mic" size={26} color={theme.accent.dot} stroke={1.8} />
                        )}
                      </Pressable>
                    </View>

                    <Text style={[TYPE.captionEm, S.stateLabel, { color: theme.textTer }]}>
                      {mode === 'listening' ? 'Tap to stop' : 'Tap to speak'}
                    </Text>

                    {/* Waveform — static at rest, level-driven while listening */}
                    <View style={[S.waveformShell, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
                      <View style={S.waveform}>
                        {Array.from({ length: BAR_COUNT }, (_, i) => (
                          <Animated.View
                            key={i}
                            style={[
                              S.waveBar,
                              {
                                backgroundColor: mode === 'listening' ? theme.accent.dot : theme.textTer,
                                transform: [{ scaleY: mode === 'listening' ? waveScaleForBar(i) : STATIC_WAVE[i] }],
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </View>

                  </View>
                )}

                {/* MANUAL */}
                {mode === 'manual' && (
                  <View style={{ paddingHorizontal: 20, paddingTop: 0 }}>
                    {/* Amount display — only the freshly entered digit eases in */}
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

                    {/* What we heard, so a misheard amount can be checked against it */}
                    {heardTranscript ? (
                      <View style={S.heardRow}>
                        <Icon name="mic" size={11} color={theme.textTer} stroke={1.7} />
                        <Text style={[TYPE.caption, { color: theme.textTer, flexShrink: 1 }]} numberOfLines={1}>
                          “{heardTranscript}”
                        </Text>
                      </View>
                    ) : null}

                    {/* Merchant + Note */}
                    <View style={[S.fieldCard, { backgroundColor: theme.chipBg }]}>
                      <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                        <Text style={[TYPE.body, { color: theme.textSec }]}>Merchant</Text>
                        <TextInput
                          value={manualMerchant}
                          onChangeText={setManualMerchant}
                          placeholder="Where?"
                          placeholderTextColor={theme.textTer}
                          style={[S.fieldInput, { color: theme.text, flex: 1 }]}
                        />
                      </View>
                      <View style={S.fieldRow}>
                        <Text style={[TYPE.body, { color: theme.textSec }]}>Note</Text>
                        <TextInput
                          value={manualNote}
                          onChangeText={setManualNote}
                          placeholder="Optional"
                          placeholderTextColor={theme.textTer}
                          style={[S.fieldInput, { color: theme.text, flex: 1 }]}
                        />
                      </View>
                    </View>

                    <View style={S.manualCategoryWrap}>
                      <ManualCategoryPicker
                        theme={theme}
                        activeCat={manualCat}
                        categories={categories}
                        cats={cats}
                        onChange={setManualCat}
                      />
                    </View>

                    {/* Keypad */}
                    <View style={S.keypad}>
                      {['1','2','3','4','5','6','7','8','9','clear','0','del'].map(k => (
                        <KeyButton
                          key={k}
                          theme={theme}
                          onPress={() => press(k)}
                          label={k === 'del' ? 'Delete' : k === 'clear' ? 'Clear' : k}
                        >
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
                    <SheetPrimaryButton
                      label="Save expense"
                      onPress={saveExpense}
                      theme={theme}
                      disabled={!canSave}
                      style={S.saveBtn}
                    />
                  </View>
                )}
              </ScrollView>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

function ManualCategoryPicker({
  theme,
  activeCat,
  categories,
  cats,
  onChange,
}: {
  theme: Theme;
  activeCat: string;
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  onChange: (cat: string) => void;
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
            environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
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
          <Host matchContents>
            <Picker
              selection={selectedSubIdx}
              onSelectionChange={(val) => {
                const idx = Number(val);
                const next = subcats[idx];
                if (next) onChange(next.id);
              }}
              modifiers={[
                pickerStyle('menu'),
                tint(theme.text),
                controlSize('small'),
                font({ size: 15, weight: 'medium' }),
                environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                fixedSize({ horizontal: true, vertical: false }),
              ]}
            >
              {subcats.map((cat, idx) => (
                <SwiftText key={cat.id} modifiers={[tag(idx)]}>
                  {cats[cat.id]?.label ?? cat.label}
                </SwiftText>
              ))}
            </Picker>
          </Host>
        ) : (
          <Text style={[TYPE.bodySm, { color: theme.textTer }]}>No subcategories</Text>
        )}
      </View>
    </View>
  );
}

// Cash-App-style amount: digits update instantly, but the freshly entered
// rightmost digit eases up + in. Deletes and clears don't animate.
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
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      anim.setValue(1);
    }
  }, [value]);

  const lastIdx = chars.length - 1;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [7, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={S.amountChars}>
      {chars.map((ch, i) =>
        i === lastIdx ? (
          <Animated.Text
            key={`last-${i}`}
            style={[textStyle, { color, opacity: anim, transform: [{ translateY }, { scale }] }]}
          >
            {ch}
          </Animated.Text>
        ) : (
          <Text key={i} style={[textStyle, { color }]}>{ch}</Text>
        )
      )}
    </View>
  );
}

// Keypad key with a spring scale-down + background shift on press, and a light
// selection tick for haptics.
function KeyButton({
  theme,
  label,
  onPress,
  children,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
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
      >
        <Animated.View style={[S.keyFace, { backgroundColor }]}>
          {children}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const S = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    minWidth: 56,
  },
  voiceCenter: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 16,
  },
  topZone: {
    width: '100%',
    minHeight: 94,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 4,
  },
  hintExample: {
    ...TYPE.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  hintSub: {
    ...TYPE.body,
    textAlign: 'center',
  },
  transcriptLive: {
    ...TYPE.headline,
    textAlign: 'center',
  },
  micZone: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  micBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  stateLabel: {
    marginBottom: 12,
  },
  waveformShell: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    gap: 3,
    width: '100%',
  },
  waveBar: {
    width: 3,
    height: 40,
    borderRadius: 2,
  },
  saveBtn: {
    marginTop: 14,
  },
  transcriptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  fieldCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldInput: {
    ...TYPE.subsectionTitle,
    fontWeight: '500',
    textAlign: 'right',
    padding: 0,
  },
  manualAmountWrap: {
    alignItems: 'center',
    paddingVertical: 2,
    marginBottom: 2,
  },
  manualAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  manualAmountSign: {
    fontSize: 24,
    fontWeight: '500',
    letterSpacing: -0.3,
    lineHeight: 30,
    marginRight: 5,
  },
  manualAmountValue: {
    fontSize: 46,
    fontWeight: '600',
    letterSpacing: -1.2,
    lineHeight: 52,
    fontVariant: ['tabular-nums'],
  },
  amountChars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  manualCategoryWrap: {
    marginTop: 10,
    marginBottom: 10,
  },
  categoryPanel: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  subcategoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    marginBottom: 4,
  },
  groupHeaderIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subcatList: {
    height: 93,
  },
  subcatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRadius: 8,
    marginBottom: 3,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  keyCell: {
    width: '30%',
    flexGrow: 1,
  },
  keyFace: {
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: -2,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
});
