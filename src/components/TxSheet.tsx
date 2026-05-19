import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATS, TRANSACTIONS, Transaction } from '../data';
import { Icon } from './Icon';
import { Money } from './shared';
import { Theme, catGroupColor, catPastel } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.66);

export function TxSheet({
  tx,
  theme,
  onClose,
}: {
  tx: Transaction | null;
  theme: Theme;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const lastTx = useRef<Transaction | null>(null);
  const dismissing = useRef(false);

  if (tx) lastTx.current = tx;

  useEffect(() => {
    if (tx) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 200, friction: 24 }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (!dismissing.current) {
      // Normal close via button or backdrop — animate then unmount
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: SHEET_H, duration: 260, useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [tx]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) slideY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          dismissing.current = true;
          const remaining = Math.max(SHEET_H - gs.dy, 0);
          const duration = Math.max(80, (remaining / SHEET_H) * 260);
          Animated.parallel([
            Animated.timing(slideY, {
              toValue: SHEET_H,
              duration,
              useNativeDriver: true,
              easing: Easing.in(Easing.cubic),
            }),
            Animated.timing(fade, {
              toValue: 0,
              duration: Math.min(duration, 200),
              useNativeDriver: true,
            }),
          ]).start(() => {
            dismissing.current = false;
            setMounted(false);
            onClose();
          });
        } else {
          Animated.spring(slideY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 200,
            friction: 24,
          }).start();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  const t = lastTx.current!;
  const cat = CATS[t.cat];
  const color = catPastel(t.cat, theme.dark);
  const groupColor = catGroupColor(t.cat, theme.dark);
  const catTotal = TRANSACTIONS.filter(x => x.cat === t.cat).reduce((s, x) => s + x.amount, 0);
  const catBudget = cat?.budget ?? 0;
  const catPct = catBudget > 0 ? Math.min(100, Math.round((catTotal / catBudget) * 100)) : 0;

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: '#000',
            opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.46] }),
          },
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        {...pan.panHandlers}
        style={[
          S.sheet,
          {
            backgroundColor: theme.surface,
            borderColor: theme.hairline,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        <View style={[S.handle, { backgroundColor: theme.sep }]} />

        <TouchableOpacity
          onPress={onClose}
          style={[S.sheetClose, { backgroundColor: theme.chipBg }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="close" size={15} color={theme.textSec} />
        </TouchableOpacity>

        <View style={S.sheetHero}>
          <View style={[S.sheetCatCircle, { backgroundColor: color + '26' }]}>
            <Icon name={cat?.icon ?? 'tag'} size={24} color={groupColor} stroke={1.5} />
          </View>
          <Text style={[S.sheetMerchant, { color: theme.text }]}>{t.merchant}</Text>
          <Text style={[S.sheetCatName, { color: theme.textSec }]}>{cat?.label}</Text>
          <View style={{ marginTop: 14 }}>
            <Money value={t.amount} size={40} weight="700" prefix="−$" theme={theme} />
          </View>
          <Text style={[S.sheetDate, { color: theme.textTer }]}>{t.fullDate} · {t.time}</Text>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          {t.note ? (
            <View style={[S.noteRow, { backgroundColor: theme.chipBg, borderRadius: 14, marginBottom: 12 }]}>
              <Text style={[S.noteLabel, { color: theme.textSec }]}>Note</Text>
              <Text style={[S.noteValue, { color: theme.text }]}>{t.note}</Text>
            </View>
          ) : null}

          <View style={{ marginBottom: 16 }}>
            <View style={S.catUsageRow}>
              <Text style={[S.catUsageText, { color: theme.textSec }]}>{cat?.label} this month</Text>
              <Text style={[S.catUsageText, { color: theme.textSec }]}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>${catTotal.toFixed(0)}</Text>
                {' / $'}{catBudget}
              </Text>
            </View>
            <View style={[S.catBar, { backgroundColor: theme.hairline }]}>
              <View style={[S.catBarFill, { width: `${catPct}%` as any, backgroundColor: groupColor }]} />
            </View>
          </View>

          <View style={[S.cardRow, { backgroundColor: theme.chipBg, borderRadius: 14 }]}>
            <View style={[S.visaChip, { backgroundColor: theme.text }]}>
              <Text style={{ color: theme.bg, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 }}>VISA</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>Chase Sapphire</Text>
              <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 1 }}>•••• 4429</Text>
            </View>
            <View style={[S.postedPill, { backgroundColor: theme.surface }]}>
              <Text style={{ fontSize: 11, color: theme.textSec, fontWeight: '500' }}>Posted</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const S = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 12, marginBottom: 6,
  },
  sheetClose: {
    position: 'absolute', top: 16, right: 20,
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetHero: {
    alignItems: 'center', paddingTop: 10, paddingBottom: 20, paddingHorizontal: 20,
  },
  sheetCatCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  sheetMerchant: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center' },
  sheetCatName:  { fontSize: 13, marginTop: 3 },
  sheetDate:     { fontSize: 12, marginTop: 7 },
  noteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16,
  },
  noteLabel:    { fontSize: 13 },
  noteValue:    { fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 12 },
  catUsageRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  catUsageText: { fontSize: 12 },
  catBar:       { height: 3, borderRadius: 2, overflow: 'hidden' },
  catBarFill:   { height: '100%', borderRadius: 2 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 13, paddingHorizontal: 16,
  },
  visaChip: {
    width: 38, height: 26, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  postedPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100 },
});
