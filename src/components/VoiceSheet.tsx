import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, Animated,
  StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { Theme, catPastel } from '../theme';
import { CATS } from '../data';
import { Icon } from './Icon';
import { Money } from './shared';
import { getCardStyle } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');

const VOICE_SCRIPT = [
  { t: 280,  text: 'Coffee' },
  { t: 680,  text: 'Coffee at' },
  { t: 1100, text: 'Coffee at Blue Bottle' },
  { t: 2050, text: 'Coffee at Blue Bottle six' },
  { t: 2400, text: 'Coffee at Blue Bottle six fifty' },
];

type Mode = 'idle' | 'listening' | 'parsed' | 'manual';

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
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState({ amount: 0, cat: 'coffee', merchant: '' });
  const [manualAmt, setManualAmt] = useState('0');
  const [manualCat, setManualCat] = useState('groceries');
  const [manualMerchant, setManualMerchant] = useState('');

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
      setTranscript('');
      setManualAmt('0');
      setManualCat('groceries');
      setManualMerchant('');
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
      // Auto-begin voice transcription
      setMode('listening');
      startWave();
      timers.current = VOICE_SCRIPT.map(s =>
        setTimeout(() => setTranscript(s.text), s.t)
      );
      timers.current.push(setTimeout(() => {
        stopWave();
        setParsed({ amount: 6.50, cat: 'coffee', merchant: 'Blue Bottle' });
        setMode('parsed');
      }, 2900));
    } else {
      stopWave();
      timers.current.forEach(clearTimeout);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
    return () => { timers.current.forEach(clearTimeout); stopWave(); };
  }, [visible]);

  const startListen = () => {
    setMode('listening');
    setTranscript('');
    startWave();
    timers.current = VOICE_SCRIPT.map(s =>
      setTimeout(() => setTranscript(s.text), s.t)
    );
    timers.current.push(setTimeout(() => {
      stopWave();
      setParsed({ amount: 6.50, cat: 'coffee', merchant: 'Blue Bottle' });
      setMode('parsed');
    }, 2900));
  };

  const stopListen = () => {
    timers.current.forEach(clearTimeout);
    stopWave();
    if (transcript) {
      setParsed({ amount: 6.50, cat: 'coffee', merchant: 'Blue Bottle' });
      setMode('parsed');
    } else {
      setMode('idle');
    }
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
          <TouchableOpacity onPress={onClose} disabled={mode === 'listening'}>
            <Text style={{ color: theme.textSec, fontSize: 14, fontWeight: '500', opacity: mode === 'listening' ? 0.4 : 1 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>New expense</Text>
          {mode === 'parsed' || mode === 'manual' ? (
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 44 }} />}
        </View>

        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {/* IDLE / LISTENING */}
          {(mode === 'idle' || mode === 'listening') && (
            <View style={styles.voiceCenter}>
              <Text style={{ fontSize: 11, color: theme.textSec, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>
                {mode === 'listening' ? 'Listening…' : 'Tap to log an expense'}
              </Text>

              {/* Transcript area */}
              <View style={styles.transcriptArea}>
                {mode === 'listening' ? (
                  transcript ? (
                    <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: theme.text, textAlign: 'center' }}>
                      {transcript}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 15, color: theme.textTer }}>I'm listening…</Text>
                  )
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
                <TouchableOpacity onPress={() => setMode('manual')} style={styles.manualLink}>
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
                <Text style={{ flex: 1, fontSize: 13, color: theme.textSec, marginLeft: 8 }}>"{transcript}"</Text>
                <TouchableOpacity onPress={() => { setMode('idle'); setTranscript(''); }}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>Redo</Text>
                </TouchableOpacity>
              </View>

              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 11, color: theme.textSec, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Amount</Text>
                <Money value={parsed.amount} size={52} weight="600" prefix="$" theme={theme} />
              </View>

              <View style={[cardStyle, { overflow: 'hidden', marginBottom: 16 }]}>
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.sep }]}>
                  <Text style={{ fontSize: 13, color: theme.textSec, width: 72 }}>Where</Text>
                  <TextInput
                    value={parsed.merchant}
                    onChangeText={v => setParsed({ ...parsed, merchant: v })}
                    style={{ flex: 1, fontSize: 14, color: theme.text, fontWeight: '500', textAlign: 'right' }}
                    placeholderTextColor={theme.textTer}
                  />
                </View>
                <View style={styles.detailRow}>
                  <Text style={{ fontSize: 13, color: theme.textSec, width: 72 }}>Category</Text>
                  <Text style={{ flex: 1, fontSize: 14, color: theme.text, fontWeight: '500', textAlign: 'right' }}>
                    {CATS[parsed.cat]?.label}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 11, color: theme.textSec, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>
                Change category
              </Text>
              <View style={styles.chipWrap}>
                {Object.entries(CATS).map(([id, c]) => {
                  const active = id === parsed.cat;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => setParsed({ ...parsed, cat: id })}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: active ? catPastel(id, theme.dark) + '88' : theme.chipBg,
                        },
                      ]}
                    >
                      <Icon name={c.icon} size={13} color={theme.text} stroke={1.5} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: theme.text, marginLeft: 5 }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* MANUAL */}
          {mode === 'manual' && (
            <View>
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
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

              <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
                <TextInput
                  value={manualMerchant}
                  onChangeText={setManualMerchant}
                  placeholder="Where? (optional)"
                  placeholderTextColor={theme.textTer}
                  style={[styles.merchantInput, { backgroundColor: theme.chipBg, color: theme.text }]}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 10 }} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
                {Object.entries(CATS).map(([id, c]) => {
                  const active = id === manualCat;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => setManualCat(id)}
                      style={[
                        styles.catChip,
                        { backgroundColor: active ? catPastel(id, theme.dark) + '88' : theme.chipBg },
                      ]}
                    >
                      <Icon name={c.icon} size={13} color={theme.text} stroke={1.5} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: theme.text, marginLeft: 5 }}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Keypad */}
              <View style={styles.keypad}>
                {['1','2','3','4','5','6','7','8','9','.','0','del'].map(k => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => press(k)}
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

              <TouchableOpacity onPress={() => setMode('idle')} style={styles.manualLink}>
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
    padding: 0,
  },
  transcriptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  merchantInput: {
    borderRadius: 14,
    padding: 11,
    paddingHorizontal: 14,
    fontSize: 14,
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
