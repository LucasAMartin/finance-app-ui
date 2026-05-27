import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, Animated } from 'react-native';
import { Theme, GROUP_COLORS } from '../theme';
import { Icon } from './Icon';
import { getCardStyle } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupFor, categoryMap } from '../repositories/categoryUtils';
import type { Category, GroupKey } from '../repositories/types';
import { useVoiceRecognition } from '../voice/useVoiceRecognition';
import { parseVoiceExpense } from '../voice/parseVoiceExpense';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';

type Mode = 'idle' | 'listening' | 'parsed' | 'manual';

const VOICE_DETENT_DEFAULT: PresentationDetent = { fraction: 0.52 };
const VOICE_DETENT_LARGE: PresentationDetent = 'large';
const VOICE_DETENTS: PresentationDetent[] = [VOICE_DETENT_DEFAULT, VOICE_DETENT_LARGE];

const GROUP_META: Record<GroupKey, { label: string; icon: string }> = {
  needs: { label: 'Needs', icon: 'home' },
  wants: { label: 'Wants', icon: 'sparkle' },
  savings: { label: 'Savings', icon: 'wallet' },
};

const BAR_COUNT = 24;
// Bell-curve sine pattern for the idle waveform silhouette
const STATIC_WAVE = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i / (BAR_COUNT - 1);
  return 0.12 + 0.55 * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(t * Math.PI * 4));
});

interface VoiceSheetProps {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  initialMode?: 'voice' | 'manual';
}

export function VoiceSheet({ theme, visible, onClose, initialMode = 'voice' }: VoiceSheetProps) {
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();

  const [detent, setDetent] = useState<PresentationDetent>(VOICE_DETENT_DEFAULT);
  const [mode, setMode] = useState<Mode>('idle');
  const [parsed, setParsed] = useState({ amount: 0, cat: 'dining', merchant: '' });
  const [parsedAmtStr, setParsedAmtStr] = useState('');
  const [parsedNote, setParsedNote] = useState('');
  const [manualAmt, setManualAmt] = useState('0');
  const [manualCat, setManualCat] = useState('groceries');
  const [manualMerchant, setManualMerchant] = useState('');
  const [manualNote, setManualNote] = useState('');

  const voice = useVoiceRecognition();
  const transcriptRef = useRef('');
  useEffect(() => { transcriptRef.current = voice.transcript; }, [voice.transcript]);

  const barAnims = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0))).current;
  const waveLoops = useRef<Animated.CompositeAnimation[]>([]);

  // Three staggered pulse rings that expand outward while listening
  const ringAnims = useRef(Array.from({ length: 3 }, () => new Animated.Value(0))).current;
  const ringLoops = useRef<(Animated.CompositeAnimation | null)[]>([null, null, null]);
  const ringTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startWave = () => {
    waveLoops.current.forEach(l => l.stop());
    waveLoops.current = barAnims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 300 + i * 20, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration: 300 + i * 20, useNativeDriver: true }),
        ])
      );
      setTimeout(() => loop.start(), i * 40);
      return loop;
    });
  };

  const stopWave = () => {
    waveLoops.current.forEach(l => l.stop());
    barAnims.forEach(a => a.setValue(0));
  };

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
      setManualAmt('0');
      setManualCat(categories[0]?.id ?? 'groceries');
      setManualMerchant('');
      setManualNote('');
      setParsedAmtStr('');
      setParsedNote('');
      voice.reset();
      if (initialMode === 'manual') {
        setDetent(VOICE_DETENT_LARGE);
        setMode('manual');
      } else {
        setDetent(VOICE_DETENT_DEFAULT);
        setMode('idle');
        voice.start();
      }
    } else {
      voice.abort();
      stopWave();
      stopRings();
    }
    return () => { stopWave(); stopRings(); };
  }, [visible, categories]);

  useEffect(() => {
    if (voice.listening) {
      setMode('listening');
      startWave();
      startRings();
      return;
    }
    stopWave();
    stopRings();
    const finalText = transcriptRef.current.trim();
    setMode(m => (m === 'listening' ? (finalText ? 'parsed' : 'idle') : m));
    if (finalText) {
      const result = parseVoiceExpense(finalText);
      setParsed({
        ...result,
        cat: cats[result.cat] ? result.cat : categories[0]?.id ?? 'groceries',
      });
      setParsedAmtStr(result.amount > 0 ? result.amount.toFixed(2) : '');
    }
  }, [voice.listening]);

  const goManual = () => {
    setMode('manual');
    setDetent(VOICE_DETENT_LARGE);
  };

  const goVoice = () => {
    setMode('idle');
    setDetent(VOICE_DETENT_DEFAULT);
  };

  const press = (k: string) => {
    setManualAmt(a => {
      if (k === 'del') return a.length <= 1 ? '0' : a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : a + '.';
      if (a === '0') return k;
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      return a + k;
    });
  };

  const [whole, frac] = manualAmt.split('.');
  const cardStyle = getCardStyle(theme);

  const isManual = mode === 'manual';
  const isParsedOrManual = mode === 'parsed' || mode === 'manual';

  const saveExpense = () => {
    const amount = mode === 'manual' ? parseFloat(manualAmt) : parsed.amount;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const cat = mode === 'manual' ? manualCat : parsed.cat;
    const merchant = (mode === 'manual' ? manualMerchant : parsed.merchant).trim() || cats[cat]?.label || 'Expense';
    const note = mode === 'manual' ? manualNote : parsedNote;
    transactionsRepo.create({
      amount,
      cat,
      merchant,
      note,
      occurredAt: new Date().toISOString(),
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    voice.abort();
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
        ]}>
          <RNHostView>
            <View style={[S.sheet, { backgroundColor: theme.dark ? '#1A1530' : '#fff' }]}>
              {/* Header */}
              <View style={S.sheetHeader}>
                <Pressable
                  onPress={() => { voice.abort(); onClose(); }}
                  pointerEvents="box-only"
                  style={S.headerBtn}
                >
                  <Text style={{ color: theme.textSec, fontSize: 14, fontWeight: '500' }}>Cancel</Text>
                </Pressable>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>New expense</Text>
                {isParsedOrManual ? (
                  <Pressable
                    onPress={saveExpense}
                    pointerEvents="box-only"
                    style={S.headerBtn}
                  >
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>Save</Text>
                  </Pressable>
                ) : <View style={S.headerBtn} />}
              </View>

              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                scrollEnabled={!isManual}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
              >
                {/* IDLE / LISTENING */}
                {(mode === 'idle' || mode === 'listening') && (
                  <View style={S.voiceCenter}>

                    {/* Hint text or live transcript */}
                    <View style={S.topZone}>
                      {mode === 'listening' ? (
                        voice.transcript ? (
                          <Text style={[S.transcriptLive, { color: theme.text }]}>
                            {voice.transcript}
                          </Text>
                        ) : (
                          <Text style={[S.hintSub, { color: theme.textTer }]}>Listening...</Text>
                        )
                      ) : voice.error ? (
                        <Text style={[S.hintSub, { color: theme.textSec, textAlign: 'center' }]}>
                          {voice.error}
                        </Text>
                      ) : (
                        <>
                          <Text style={[S.hintMeta, { color: theme.textTer }]}>Say something like</Text>
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
                        onPress={mode === 'listening' ? () => voice.stop() : () => voice.start()}
                        pointerEvents="box-only"
                        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                        style={[S.micBtn, { backgroundColor: theme.accent.fill }]}
                      >
                        {mode === 'listening' ? (
                          <View style={[S.stopSquare, { backgroundColor: theme.accent.dot }]} />
                        ) : (
                          <Icon name="mic" size={26} color={theme.accent.dot} stroke={1.8} />
                        )}
                      </Pressable>
                    </View>

                    <Text style={[S.stateLabel, { color: theme.textTer }]}>
                      {mode === 'listening' ? 'Tap to stop' : 'Tap to speak'}
                    </Text>

                    {/* Waveform — static silhouette at rest, animated when listening */}
                    <View style={S.waveform}>
                      {barAnims.map((anim, i) => (
                        <Animated.View
                          key={i}
                          style={[
                            S.waveBar,
                            {
                              backgroundColor: mode === 'listening' ? theme.accent.dot : theme.hairline,
                              transform: [{ scaleY: mode === 'listening' ? anim : STATIC_WAVE[i] }],
                            },
                          ]}
                        />
                      ))}
                    </View>

                    {/* Enter manually — proper bordered pill */}
                    {mode !== 'listening' && (
                      <Pressable
                        onPress={goManual}
                        pointerEvents="box-only"
                        style={[S.manualBtn, { borderColor: theme.hairline }]}
                      >
                        <Icon name="keypad" size={14} color={theme.textSec} stroke={1.5} />
                        <Text style={{ color: theme.textSec, fontSize: 14, fontWeight: '500', marginLeft: 7 }}>
                          Enter manually
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* PARSED */}
                {mode === 'parsed' && (
                  <View style={{ paddingHorizontal: 24, paddingTop: 4 }}>
                    <View style={[S.transcriptChip, { backgroundColor: theme.chipBg }]}>
                      <Icon name="mic" size={14} color={theme.textSec} />
                      <Text style={{ flex: 1, fontSize: 13, color: theme.textSec, marginLeft: 8 }} numberOfLines={2}>
                        "{voice.transcript}"
                      </Text>
                      <Pressable onPress={() => voice.start()} pointerEvents="box-only" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>Redo</Text>
                      </Pressable>
                    </View>

                    <View style={[cardStyle, { overflow: 'hidden', marginBottom: 20 }]}>
                      <View style={[S.parsedRow, { borderBottomColor: theme.sep, borderBottomWidth: 1 }]}>
                        <Text style={[S.parsedRowLabel, { color: theme.textSec }]}>Amount</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontSize: 15, fontWeight: '500', color: theme.textSec, marginRight: 1 }}>$</Text>
                          <TextInput
                            value={parsedAmtStr}
                            onChangeText={v => {
                              setParsedAmtStr(v);
                              setParsed(p => ({ ...p, amount: parseFloat(v) || 0 }));
                            }}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            placeholder="0.00"
                            placeholderTextColor={theme.textTer}
                            style={{ fontSize: 15, fontWeight: '600', color: theme.text, textAlign: 'right', minWidth: 64, padding: 0 }}
                          />
                        </View>
                      </View>
                      <View style={[S.parsedRow, { borderBottomColor: theme.sep, borderBottomWidth: 1 }]}>
                        <Text style={[S.parsedRowLabel, { color: theme.textSec }]}>Merchant</Text>
                        <TextInput
                          value={parsed.merchant}
                          onChangeText={v => setParsed({ ...parsed, merchant: v })}
                          placeholder="Where?"
                          placeholderTextColor={theme.textTer}
                          style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                        />
                      </View>
                      <View style={S.parsedRow}>
                        <Text style={[S.parsedRowLabel, { color: theme.textSec }]}>Note</Text>
                        <TextInput
                          value={parsedNote}
                          onChangeText={setParsedNote}
                          placeholder="Optional"
                          placeholderTextColor={theme.textTer}
                          style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                        />
                      </View>
                    </View>

                    <Text style={[S.sectionLabel, { color: theme.textTer, marginBottom: 10 }]}>Category</Text>
                    <CategoryPicker
                      theme={theme}
                      activeCat={parsed.cat}
                      categories={categories}
                      cats={cats}
                      onChange={cat => setParsed(p => ({ ...p, cat }))}
                    />
                  </View>
                )}

                {/* MANUAL */}
                {mode === 'manual' && (
                  <View style={{ paddingHorizontal: 24, paddingTop: 0 }}>
                    {/* Amount display */}
                    <View style={{ alignItems: 'center', paddingVertical: 6, marginBottom: 10 }}>
                      <Text style={{
                        fontSize: 46, fontWeight: '600', letterSpacing: -1.2,
                        color: parseFloat(manualAmt) > 0 ? theme.text : theme.textTer,
                      }}>
                        <Text style={{ fontSize: 24, color: theme.textSec, fontWeight: '500' }}>$ </Text>
                        {whole}
                        {frac !== undefined && <Text style={{ opacity: 0.4 }}>.{frac}</Text>}
                      </Text>
                    </View>

                    {/* Merchant + Note */}
                    <View style={[cardStyle, { overflow: 'hidden', marginBottom: 10 }]}>
                      <View style={[S.parsedRow, { borderBottomColor: theme.sep, borderBottomWidth: 1 }]}>
                        <Text style={[S.parsedRowLabel, { color: theme.textSec }]}>Merchant</Text>
                        <TextInput
                          value={manualMerchant}
                          onChangeText={setManualMerchant}
                          placeholder="Where?"
                          placeholderTextColor={theme.textTer}
                          style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                        />
                      </View>
                      <View style={S.parsedRow}>
                        <Text style={[S.parsedRowLabel, { color: theme.textSec }]}>Note</Text>
                        <TextInput
                          value={manualNote}
                          onChangeText={setManualNote}
                          placeholder="Optional"
                          placeholderTextColor={theme.textTer}
                          style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                        />
                      </View>
                    </View>

                    {/* Category */}
                    <Text style={[S.sectionLabel, { color: theme.textTer, marginBottom: 6 }]}>Category</Text>
                    <View style={{ marginBottom: 10 }}>
                      <CategoryPicker
                        theme={theme}
                        activeCat={manualCat}
                        categories={categories}
                        cats={cats}
                        onChange={setManualCat}
                      />
                    </View>

                    {/* Keypad */}
                    <View style={S.keypad}>
                      {['1','2','3','4','5','6','7','8','9','.','0','del'].map(k => (
                        <Pressable
                          key={k}
                          onPress={() => press(k)}
                          pointerEvents="box-only"
                          style={[S.keyBtn, { backgroundColor: theme.chipBg }]}
                        >
                          {k === 'del' ? (
                            <Icon name="backspace" size={20} color={theme.text} stroke={1.5} />
                          ) : (
                            <Text style={{ fontSize: 20, fontWeight: '500', color: theme.text }}>{k}</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>

                    {/* Switch to voice */}
                    <Pressable
                      onPress={goVoice}
                      pointerEvents="box-only"
                      style={S.voiceLink}
                    >
                      <Icon name="mic" size={14} color={theme.textTer} stroke={1.5} />
                      <Text style={{ color: theme.textTer, fontSize: 12, fontWeight: '500', marginLeft: 5 }}>Use voice instead</Text>
                    </Pressable>
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

function CategoryPicker({
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
  const grouped = (['needs', 'wants', 'savings'] as GroupKey[]).map(key => ({
    key,
    ...GROUP_META[key],
    cats: categories.filter(cat => cat.group === key && !cat.archived),
  }));
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {grouped.map(g => {
        const activeGroup = categoryGroupFor(activeCat, categories);
        const isActive = activeGroup === g.key;
        const color = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
        const defaultCat = g.cats[0]?.id ?? activeCat;
        return (
          <View key={g.key} style={{ flex: 1 }}>
            <Pressable
              onPress={() => onChange(defaultCat)}
              pointerEvents="box-only"
              style={[S.groupHeader, {
                backgroundColor: isActive ? color + '20' : theme.chipBg,
                borderColor: isActive ? color + '80' : 'transparent',
              }]}
            >
              <View style={[S.groupHeaderIcon, {
                backgroundColor: isActive ? color + '30' : theme.dark ? 'rgba(173,189,222,0.10)' : 'rgba(14,14,16,0.07)',
              }]}>
                <Icon name={g.icon} size={13} color={isActive ? color : theme.textTer} stroke={1.6} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500', color: isActive ? theme.text : theme.textSec, letterSpacing: -0.1 }}>
                {g.label}
              </Text>
            </Pressable>
            <View style={S.subcatList}>
              {g.cats.map(cat => {
                const c = cats[cat.id] ?? cat;
                const isActiveCat = activeCat === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => onChange(cat.id)}
                    pointerEvents="box-only"
                    style={[S.subcatRow, { backgroundColor: isActiveCat ? theme.text : 'transparent' }]}
                  >
                    <Icon name={c.icon} size={12} color={isActiveCat ? theme.bg : theme.textTer} stroke={1.5} />
                    <Text style={{ fontSize: 12, fontWeight: isActiveCat ? '600' : '400', color: isActiveCat ? theme.bg : theme.textSec, marginLeft: 5 }}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
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
    paddingTop: 12,
    paddingBottom: 16,
  },
  topZone: {
    width: '100%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 4,
  },
  hintMeta: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  hintExample: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 22,
  },
  hintSub: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  transcriptLive: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.4,
    textAlign: 'center',
    lineHeight: 26,
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
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
    marginBottom: 12,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 3,
    marginBottom: 16,
    width: '100%',
  },
  waveBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 100,
    borderWidth: 1,
    minHeight: 44,
  },
  voiceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
    minHeight: 36,
  },
  transcriptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  parsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  parsedRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
    gap: 7,
    marginBottom: 4,
  },
  keyBtn: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
});
