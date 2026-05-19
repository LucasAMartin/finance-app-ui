import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, Animated,
  StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { Theme, CAT_TO_GROUP, GROUP_COLORS } from '../theme';
import { CATS } from '../data';
import { Icon } from './Icon';
import { Money } from './shared';
import { getCardStyle } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceRecognition } from '../voice/useVoiceRecognition';
import { parseVoiceExpense } from '../voice/parseVoiceExpense';

const { height: SCREEN_H } = Dimensions.get('window');

type Mode = 'idle' | 'listening' | 'parsed' | 'manual';

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
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [mode, setMode] = useState<Mode>('idle');
  const [parsed, setParsed] = useState({ amount: 0, cat: 'dining', merchant: '' });
  const [parsedAmtStr, setParsedAmtStr] = useState('');
  const [parsedNote, setParsedNote] = useState('');
  const [manualAmt, setManualAmt] = useState('0');
  const [manualCat, setManualCat] = useState('groceries');
  const [manualMerchant, setManualMerchant] = useState('');
  const [manualNote, setManualNote] = useState('');

  const voice = useVoiceRecognition();
  // Mirror the transcript in a ref so the listening effect can read the final
  // value without re-running on every interim word.
  const transcriptRef = useRef('');
  useEffect(() => { transcriptRef.current = voice.transcript; }, [voice.transcript]);

  // Waveform animations
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
      setMode('idle');
      setManualAmt('0');
      setManualCat('groceries');
      setManualMerchant('');
      setManualNote('');
      setParsedAmtStr('');
      setParsedNote('');
      voice.reset();
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
      // Auto-begin voice transcription (prompts for permission on first use)
      voice.start();
    } else {
      voice.abort();
      stopWave();
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
    return () => { stopWave(); };
  }, [visible]);

  // Drive the UI mode + waveform from the recognizer's listening state.
  // When a session ends, parse the final transcript into budget fields.
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

  const startListen = () => { voice.start(); };
  const stopListen = () => { voice.stop(); };

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

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={mode === 'listening' ? 'none' : 'auto'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.dark ? '#16161A' : '#fff',
            transform: [{ translateY: slideAnim }],
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        {/* Grabber */}
        <View style={styles.grabberRow}>
          <View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(14,14,16,0.14)' }]} />
        </View>

        {/* Header */}
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose} disabled={mode === 'listening'} delayPressIn={0} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: theme.textSec, fontSize: 14, fontWeight: '500', opacity: mode === 'listening' ? 0.4 : 1 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>New expense</Text>
          {mode === 'parsed' || mode === 'manual' ? (
            <TouchableOpacity onPress={onClose} delayPressIn={0} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 44 }} />}
        </View>

        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
          {/* IDLE / LISTENING */}
          {(mode === 'idle' || mode === 'listening') && (
            <View style={styles.voiceCenter}>
              {/* Transcript area */}
              <View style={styles.transcriptArea}>
                {mode === 'listening' ? (
                  voice.transcript ? (
                    <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: theme.text, textAlign: 'center' }}>
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

              {/* Waveform */}
              <View style={styles.waveform}>
                {barAnims.map((anim, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        backgroundColor: mode === 'listening' ? theme.text : theme.hairline,
                        transform: [{ scaleY: mode === 'listening' ? anim : 0.3 }],
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Mic button */}
              <TouchableOpacity
                onPress={mode === 'listening' ? stopListen : startListen}
                activeOpacity={0.7}
                delayPressIn={0}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={[
                  styles.micBtn,
                  {
                    backgroundColor: theme.text,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: mode === 'listening' ? 0 : (theme.dark ? 0.5 : 0.14),
                    shadowRadius: 20,
                    elevation: 8,
                    borderWidth: mode === 'listening' ? 10 : 0,
                    borderColor: theme.accent.fill,
                  },
                ]}
              >
                {mode === 'listening' ? (
                  <View style={[styles.stopSquare, { backgroundColor: theme.bg }]} />
                ) : (
                  <Icon name="mic" size={32} color={theme.bg} stroke={1.6} />
                )}
              </TouchableOpacity>

              <Text style={{ marginTop: 12, fontSize: 12, color: theme.textTer, fontWeight: '500' }}>
                {mode === 'listening' ? 'Tap to stop' : 'Hold or tap'}
              </Text>

              {mode !== 'listening' && (
                <TouchableOpacity onPress={() => setMode('manual')} delayPressIn={0} style={styles.manualLink}>
                  <Icon name="keypad" size={15} color={theme.textSec} stroke={1.5} />
                  <Text style={{ color: theme.textSec, fontSize: 13, fontWeight: '500', marginLeft: 6 }}>Enter manually</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* PARSED */}
          {mode === 'parsed' && (
            <View style={{ padding: 20, paddingTop: 8 }}>
              {/* Transcript chip */}
              <View style={[styles.transcriptChip, { backgroundColor: theme.chipBg }]}>
                <Icon name="mic" size={14} color={theme.textSec} />
                <Text style={{ flex: 1, fontSize: 13, color: theme.textSec, marginLeft: 8 }} numberOfLines={2}>
                  "{voice.transcript}"
                </Text>
                <TouchableOpacity onPress={() => voice.start()} delayPressIn={0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>Redo</Text>
                </TouchableOpacity>
              </View>

              {/* Editable fields */}
              <View style={[cardStyle, { overflow: 'hidden', marginBottom: 24 }]}>
                <View style={[styles.parsedRow, { borderBottomColor: theme.sep, borderBottomWidth: 1 }]}>
                  <Text style={[styles.parsedRowLabel, { color: theme.textSec }]}>Amount</Text>
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
                <View style={[styles.parsedRow, { borderBottomColor: theme.sep, borderBottomWidth: 1 }]}>
                  <Text style={[styles.parsedRowLabel, { color: theme.textSec }]}>Merchant</Text>
                  <TextInput
                    value={parsed.merchant}
                    onChangeText={v => setParsed({ ...parsed, merchant: v })}
                    placeholder="Where?"
                    placeholderTextColor={theme.textTer}
                    style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                  />
                </View>
                <View style={styles.parsedRow}>
                  <Text style={[styles.parsedRowLabel, { color: theme.textSec }]}>Note</Text>
                  <TextInput
                    value={parsedNote}
                    onChangeText={setParsedNote}
                    placeholder="Optional"
                    placeholderTextColor={theme.textTer}
                    style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                  />
                </View>
              </View>

              {/* Category */}
              <Text style={[styles.parsedFieldLabel, { color: theme.textTer, marginBottom: 10 }]}>Category</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EXPENSE_GROUPS.map(g => {
                  const activeGroup = CAT_TO_GROUP[parsed.cat] ?? (parsed.cat === 'savings' ? 'savings' : undefined);
                  const isActive = activeGroup === g.key;
                  const color = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
                  return (
                    <View key={g.key} style={{ flex: 1 }}>
                      {/* Group header — tapping selects the group and resets to its default cat */}
                      <TouchableOpacity
                        onPress={() => setParsed(p => ({ ...p, cat: g.defaultCat }))}
                        activeOpacity={0.7}
                        delayPressIn={0}
                        style={[styles.groupHeader, {
                          backgroundColor: isActive ? color + '20' : theme.chipBg,
                          borderColor: isActive ? color + '80' : 'transparent',
                        }]}
                      >
                        <View style={[styles.groupHeaderIcon, {
                          backgroundColor: isActive
                            ? color + '30'
                            : theme.dark ? 'rgba(173,189,222,0.10)' : 'rgba(14,14,16,0.07)',
                        }]}>
                          <Icon name={g.icon} size={13} color={isActive ? color : theme.textTer} stroke={1.6} />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500', color: isActive ? theme.text : theme.textSec, letterSpacing: -0.1 }}>
                          {g.label}
                        </Text>
                      </TouchableOpacity>

                      {/* Subcategory list — always rendered, fixed height so savings column matches */}
                      <View style={styles.subcatList}>
                        {g.cats.map(catId => {
                          const c = CATS[catId];
                          const isActiveCat = parsed.cat === catId;
                          return (
                            <TouchableOpacity
                              key={catId}
                              onPress={() => setParsed(p => ({ ...p, cat: catId }))}
                              activeOpacity={0.7}
                              delayPressIn={0}
                              style={[styles.subcatRow, {
                                backgroundColor: isActiveCat ? theme.text : 'transparent',
                              }]}
                            >
                              <Icon name={c.icon} size={12} color={isActiveCat ? theme.bg : theme.textTer} stroke={1.5} />
                              <Text style={{ fontSize: 12, fontWeight: isActiveCat ? '600' : '400', color: isActiveCat ? theme.bg : theme.textSec, marginLeft: 5 }}>
                                {c.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* MANUAL */}
          {mode === 'manual' && (
            <View style={{ padding: 20, paddingTop: 8 }}>
              {/* Amount display */}
              <View style={{ alignItems: 'center', paddingVertical: 12, marginBottom: 20 }}>
                <Text style={{ fontSize: 11, color: theme.textSec, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Amount</Text>
                <Text style={{
                  fontSize: 52, fontWeight: '600', letterSpacing: -1.5,
                  color: parseFloat(manualAmt) > 0 ? theme.text : theme.textTer,
                }}>
                  <Text style={{ fontSize: 28, color: theme.textSec, fontWeight: '500' }}>$ </Text>
                  {whole}
                  {frac !== undefined && <Text style={{ opacity: 0.45 }}>.{frac}</Text>}
                </Text>
              </View>

              {/* Merchant + Note — same card pattern as parsed mode */}
              <View style={[cardStyle, { overflow: 'hidden', marginBottom: 20 }]}>
                <View style={[styles.parsedRow, { borderBottomColor: theme.sep, borderBottomWidth: 1 }]}>
                  <Text style={[styles.parsedRowLabel, { color: theme.textSec }]}>Merchant</Text>
                  <TextInput
                    value={manualMerchant}
                    onChangeText={setManualMerchant}
                    placeholder="Where?"
                    placeholderTextColor={theme.textTer}
                    style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                  />
                </View>
                <View style={styles.parsedRow}>
                  <Text style={[styles.parsedRowLabel, { color: theme.textSec }]}>Note</Text>
                  <TextInput
                    value={manualNote}
                    onChangeText={setManualNote}
                    placeholder="Optional"
                    placeholderTextColor={theme.textTer}
                    style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right', padding: 0 }}
                  />
                </View>
              </View>

              {/* Category — same 3-group layout as parsed mode */}
              <Text style={[styles.parsedFieldLabel, { color: theme.textTer, marginBottom: 10 }]}>Category</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                {EXPENSE_GROUPS.map(g => {
                  const activeGroup = CAT_TO_GROUP[manualCat] ?? (manualCat === 'savings' ? 'savings' : undefined);
                  const isActive = activeGroup === g.key;
                  const color = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
                  return (
                    <View key={g.key} style={{ flex: 1 }}>
                      <TouchableOpacity
                        onPress={() => setManualCat(g.defaultCat)}
                        activeOpacity={0.7}
                        delayPressIn={0}
                        style={[styles.groupHeader, {
                          backgroundColor: isActive ? color + '20' : theme.chipBg,
                          borderColor: isActive ? color + '80' : 'transparent',
                        }]}
                      >
                        <View style={[styles.groupHeaderIcon, {
                          backgroundColor: isActive
                            ? color + '30'
                            : theme.dark ? 'rgba(173,189,222,0.10)' : 'rgba(14,14,16,0.07)',
                        }]}>
                          <Icon name={g.icon} size={13} color={isActive ? color : theme.textTer} stroke={1.6} />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500', color: isActive ? theme.text : theme.textSec, letterSpacing: -0.1 }}>
                          {g.label}
                        </Text>
                      </TouchableOpacity>
                      <View style={styles.subcatList}>
                        {g.cats.map(catId => {
                          const c = CATS[catId];
                          const isActiveCat = manualCat === catId;
                          return (
                            <TouchableOpacity
                              key={catId}
                              onPress={() => setManualCat(catId)}
                              activeOpacity={0.7}
                              delayPressIn={0}
                              style={[styles.subcatRow, {
                                backgroundColor: isActiveCat ? theme.text : 'transparent',
                              }]}
                            >
                              <Icon name={c.icon} size={12} color={isActiveCat ? theme.bg : theme.textTer} stroke={1.5} />
                              <Text style={{ fontSize: 12, fontWeight: isActiveCat ? '600' : '400', color: isActiveCat ? theme.bg : theme.textSec, marginLeft: 5 }}>
                                {c.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Keypad */}
              <View style={[styles.keypad, { paddingHorizontal: 0 }]}>
                {['1','2','3','4','5','6','7','8','9','.','0','del'].map(k => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => press(k)}
                    delayPressIn={0}
                    style={[styles.keyBtn, { backgroundColor: theme.chipBg }]}
                  >
                    {k === 'del' ? (
                      <Icon name="backspace" size={22} color={theme.text} stroke={1.5} />
                    ) : (
                      <Text style={{ fontSize: 22, fontWeight: '500', color: theme.text }}>{k}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={() => setMode('idle')} delayPressIn={0} style={styles.manualLink}>
                <Icon name="mic" size={15} color={theme.textSec} stroke={1.5} />
                <Text style={{ color: theme.textSec, fontSize: 13, fontWeight: '500', marginLeft: 6 }}>Use voice instead</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,14,16,0.38)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '92%',
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  voiceCenter: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  transcriptArea: {
    width: '100%',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    gap: 3,
    marginBottom: 24,
  },
  waveBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  micBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 22,
    height: 22,
    borderRadius: 5,
  },
  manualLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  transcriptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
  },
  parsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  parsedRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
    flexShrink: 0,
  },
  parsedFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    marginBottom: 5,
  },
  groupHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subcatList: {
    height: 105,
  },
  subcatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 3,
  },
  keypad: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  keyBtn: {
    width: '30%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
});
