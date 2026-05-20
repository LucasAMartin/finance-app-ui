import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, Animated } from 'react-native';
import { Theme, CAT_TO_GROUP, GROUP_COLORS } from '../theme';
import { CATS } from '../data';
import { Icon } from './Icon';
import { getCardStyle } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceRecognition } from '../voice/useVoiceRecognition';
import { parseVoiceExpense } from '../voice/parseVoiceExpense';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';

type Mode = 'idle' | 'listening' | 'parsed' | 'manual';

const VOICE_DETENT_DEFAULT: PresentationDetent = { fraction: 0.7 };
const VOICE_DETENT_LARGE: PresentationDetent = 'large';
const VOICE_DETENTS: PresentationDetent[] = [VOICE_DETENT_DEFAULT, VOICE_DETENT_LARGE];

const EXPENSE_GROUPS = [
  { key: 'needs',   label: 'Needs',   icon: 'home',    cats: ['groceries', 'transport', 'bills'],     defaultCat: 'groceries' },
  { key: 'wants',   label: 'Wants',   icon: 'sparkle', cats: ['dining', 'shopping', 'entertainment'], defaultCat: 'dining'    },
  { key: 'savings', label: 'Savings', icon: 'wallet',  cats: [],                                      defaultCat: 'savings'   },
];

interface VoiceSheetProps {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

export function VoiceSheet({ theme, visible, onClose }: VoiceSheetProps) {
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

  const barAnims = useRef(Array.from({ length: 24 }, () => new Animated.Value(0))).current;
  const waveLoops = useRef<Animated.CompositeAnimation[]>([]);

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

  useEffect(() => {
    if (visible) {
      setDetent(VOICE_DETENT_DEFAULT);
      setMode('idle');
      setManualAmt('0');
      setManualCat('groceries');
      setManualMerchant('');
      setManualNote('');
      setParsedAmtStr('');
      setParsedNote('');
      voice.reset();
      voice.start();
    } else {
      voice.abort();
      stopWave();
    }
    return () => { stopWave(); };
  }, [visible]);

  useEffect(() => {
    if (voice.listening) {
      setMode('listening');
      startWave();
      return;
    }
    stopWave();
    const finalText = transcriptRef.current.trim();
    setMode(m => (m === 'listening' ? (finalText ? 'parsed' : 'idle') : m));
    if (finalText) {
      const result = parseVoiceExpense(finalText);
      setParsed(result);
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
            <View style={[S.sheet, { backgroundColor: theme.dark ? '#16161A' : '#fff' }]}>
              {/* Header */}
              <View style={S.sheetHeader}>
                <Pressable
                  onPress={onClose}
                  pointerEvents="box-only"
                  disabled={mode === 'listening'}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={{ color: theme.textSec, fontSize: 14, fontWeight: '500', opacity: mode === 'listening' ? 0.4 : 1 }}>Cancel</Text>
                </Pressable>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>New expense</Text>
                {isParsedOrManual ? (
                  <Pressable
                    onPress={onClose}
                    pointerEvents="box-only"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>Save</Text>
                  </Pressable>
                ) : <View style={{ width: 44 }} />}
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
                    <View style={S.transcriptArea}>
                      {mode === 'listening' ? (
                        voice.transcript ? (
                          <Text style={{ fontSize: 20, fontWeight: '600', letterSpacing: -0.4, color: theme.text, textAlign: 'center' }}>
                            {voice.transcript}
                          </Text>
                        ) : null
                      ) : voice.error ? (
                        <Text style={{ fontSize: 13, color: theme.textSec, lineHeight: 20, textAlign: 'center' }}>
                          {voice.error}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 13, color: theme.textSec, lineHeight: 20, textAlign: 'center' }}>
                          Try <Text style={{ color: theme.text, fontWeight: '600' }}>"Coffee at Blue Bottle, six fifty"</Text>
                          {'\n'}or <Text style={{ color: theme.text, fontWeight: '600' }}>"Groceries, twenty dollars"</Text>
                        </Text>
                      )}
                    </View>

                    <View style={S.waveform}>
                      {barAnims.map((anim, i) => (
                        <Animated.View
                          key={i}
                          style={[
                            S.waveBar,
                            {
                              backgroundColor: mode === 'listening' ? theme.text : theme.hairline,
                              transform: [{ scaleY: mode === 'listening' ? anim : 0.3 }],
                            },
                          ]}
                        />
                      ))}
                    </View>

                    <Pressable
                      onPress={mode === 'listening' ? () => voice.stop() : () => voice.start()}
                      pointerEvents="box-only"
                      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                      style={[
                        S.micBtn,
                        {
                          backgroundColor: theme.text,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: mode === 'listening' ? 0 : (theme.dark ? 0.5 : 0.12),
                          shadowRadius: 18,
                          elevation: 8,
                          borderWidth: mode === 'listening' ? 10 : 0,
                          borderColor: theme.accent.fill,
                        },
                      ]}
                    >
                      {mode === 'listening' ? (
                        <View style={[S.stopSquare, { backgroundColor: theme.bg }]} />
                      ) : (
                        <Icon name="mic" size={30} color={theme.bg} stroke={1.6} />
                      )}
                    </Pressable>

                    <Text style={{ marginTop: 10, fontSize: 12, color: theme.textTer, fontWeight: '500' }}>
                      {mode === 'listening' ? 'Tap to stop' : 'Tap to record'}
                    </Text>

                    {mode !== 'listening' && (
                      <Pressable
                        onPress={goManual}
                        pointerEvents="box-only"
                        style={S.manualLink}
                      >
                        <Icon name="keypad" size={14} color={theme.textSec} stroke={1.5} />
                        <Text style={{ color: theme.textSec, fontSize: 13, fontWeight: '500', marginLeft: 6 }}>Enter manually</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* PARSED */}
                {mode === 'parsed' && (
                  <View style={{ paddingHorizontal: 28, paddingTop: 4 }}>
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
                      onChange={cat => setParsed(p => ({ ...p, cat }))}
                    />
                  </View>
                )}

                {/* MANUAL */}
                {mode === 'manual' && (
                  <View style={{ paddingHorizontal: 28, paddingTop: 4 }}>
                    {/* Amount display */}
                    <View style={{ alignItems: 'center', paddingVertical: 10, marginBottom: 14 }}>
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
                    <View style={[cardStyle, { overflow: 'hidden', marginBottom: 14 }]}>
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
                    <Text style={[S.sectionLabel, { color: theme.textTer, marginBottom: 8 }]}>Category</Text>
                    <View style={{ marginBottom: 14 }}>
                      <CategoryPicker
                        theme={theme}
                        activeCat={manualCat}
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

function CategoryPicker({ theme, activeCat, onChange }: { theme: Theme; activeCat: string; onChange: (cat: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {EXPENSE_GROUPS.map(g => {
        const activeGroup = CAT_TO_GROUP[activeCat] ?? (activeCat === 'savings' ? 'savings' : undefined);
        const isActive = activeGroup === g.key;
        const color = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
        return (
          <View key={g.key} style={{ flex: 1 }}>
            <Pressable
              onPress={() => onChange(g.defaultCat)}
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
              {g.cats.map(catId => {
                const c = CATS[catId];
                const isActiveCat = activeCat === catId;
                return (
                  <Pressable
                    key={catId}
                    onPress={() => onChange(catId)}
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
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  voiceCenter: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 16,
    paddingTop: 4,
  },
  transcriptArea: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    gap: 3,
    marginBottom: 16,
  },
  waveBar: {
    width: 3,
    height: 32,
    borderRadius: 2,
  },
  micBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  manualLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 4,
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
