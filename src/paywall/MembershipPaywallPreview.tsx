import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Checkbox, Host } from '@expo/ui';
import {
  Button as SwiftButton,
  GlassEffectContainer,
  HStack,
  Image as SwiftImage,
  Spacer,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  contentShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import Animated, { Easing, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { GlassCircleButton, SUPPORTS_GLASS } from '../components/GlassButton';
import { FONT_WEIGHT, TYPE } from '../typography';
import { NativePaywallGradient } from '../../modules/glass-card/src/NativePaywallGradient';

interface Props {
  visible: boolean;
  onClose: () => void;
  embedded?: boolean;
  layoutHeight?: number;
}

type Plan = {
  id: string;
  title: string;
  price: string;
  cadence: string;
  badge?: string;
};

const PLANS: Plan[] = [
  { id: 'yearly', title: 'Yearly', price: '$19.99', cadence: '/year', badge: 'Best value' },
  { id: 'monthly', title: 'Monthly', price: '$2.99', cadence: '/month' },
];

const PREMIUM_BENEFITS = [
  'Unlimited budgets, categories, and transactions',
  'Shared ledgers with household members',
  'iCloud sync, recurring bills, and deeper insights',
];

const PAYWALL_PRESENT_MS = 320;
const PAYWALL_DISMISS_MS = 240;

const slideInFromBottom = (values: { windowHeight: number }) => {
  'worklet';
  return {
    initialValues: {
      transform: [{ translateY: values.windowHeight }],
    },
    animations: {
      transform: [{
        translateY: withTiming(0, {
          duration: PAYWALL_PRESENT_MS,
          easing: Easing.out(Easing.cubic),
        }),
      }],
    },
  };
};

const slideOutToBottom = (values: { windowHeight: number }) => {
  'worklet';
  return {
    initialValues: {
      transform: [{ translateY: 0 }],
    },
    animations: {
      transform: [{
        translateY: withTiming(values.windowHeight, {
          duration: PAYWALL_DISMISS_MS,
          easing: Easing.in(Easing.cubic),
        }),
      }],
    },
  };
};

export function MembershipPaywallPreview({
  visible,
  onClose,
  embedded = false,
  layoutHeight,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const height = layoutHeight ?? windowHeight;
  const [trialEnabled, setTrialEnabled] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const contentTop = Math.max((embedded ? 0 : insets.top) + 92, height * 0.15);
  const closeTop = embedded ? 12 : insets.top + 10;

  if (!visible) return null;

  const selectPlan = (planId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedPlan(planId);
  };

  return (
    <Animated.View
      entering={embedded ? undefined : slideInFromBottom}
      exiting={embedded ? undefined : slideOutToBottom}
      style={embedded ? [styles.sheetRoot, { height }] : styles.root}
    >
      <View style={styles.baseFill} />

      <NativePaywallGradient style={styles.backgroundGradient} />
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(2,4,12,0.04)',
          'rgba(5,8,22,0.10)',
          'rgba(5,8,18,0.28)',
          'rgba(3,5,12,0.58)',
          'rgba(1,3,7,0.84)',
        ]}
        locations={[0, 0.26, 0.52, 0.76, 1]}
        style={styles.scrim}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(5,40,36,0.00)',
          'rgba(6,42,55,0.05)',
          'rgba(12,82,88,0.18)',
          'rgba(7,68,60,0.26)',
        ]}
        locations={[0, 0.58, 0.84, 1]}
        style={styles.bottomWash}
      />

      <CloseButton top={closeTop} onClose={onClose} />

      <Animated.View
        style={styles.contentShell}
      >
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              minHeight: height,
              paddingTop: contentTop,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
        >
          <View style={styles.copyBlock}>
            <Text style={styles.appName}>Finance App Premium</Text>
            <Text style={styles.title}>Unlock Premium</Text>
            <Text style={styles.subtitle}>
              Plan every paycheck with synced budgets,{'\n'}shared ledgers, and smarter insights.
            </Text>
          </View>

          <View style={styles.benefitsList}>
            {PREMIUM_BENEFITS.map(benefit => (
              <View key={benefit} style={styles.benefitRow}>
                <View style={styles.benefitCheck}>
                  <Icon name="check" size={13} color="#071820" stroke={2.8} />
                </View>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

          <View style={styles.purchasePanel}>
            <NativeTrialCheckbox
              value={trialEnabled}
              onValueChange={(value) => {
                Haptics.selectionAsync().catch(() => {});
                setTrialEnabled(value);
              }}
            />

            <View style={styles.planRows}>
              {PLANS.map(plan => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedPlan}
                  onPress={() => selectPlan(plan.id)}
                />
              ))}
            </View>

            <Text style={styles.reassurance}>
              No charges yet. Cancel anytime.
            </Text>
          </View>

          <View style={styles.footerStack}>
            <NativeSubscribeButton label="Subscribe" onPress={() => Haptics.selectionAsync().catch(() => {})} />

            <Pressable
              onPress={() => Haptics.selectionAsync().catch(() => {})}
              hitSlop={10}
              style={({ pressed }) => [styles.restoreHit, pressed && styles.pressed]}
            >
              <Text style={styles.restore}>Restore Subscription</Text>
            </Pressable>

            <Text style={styles.legal}>Terms of Service And Privacy Policy</Text>
          </View>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

function NativeTrialCheckbox({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.trialRow}>
      <Host ignoreSafeArea="all" colorScheme="dark" style={styles.trialCheckboxHost}>
        <Checkbox
          value={value}
          onValueChange={onValueChange}
          label="Enable 30 day trial"
          modifiers={[
            tint('#58D7F2'),
          ]}
        />
      </Host>
    </View>
  );
}

function PlanRow({
  plan,
  selected,
  onPress,
}: {
  plan: Plan;
  selected: boolean;
  onPress: () => void;
}) {
  if (SUPPORTS_GLASS) {
    return <NativeGlassPlanRow plan={plan} selected={selected} onPress={onPress} />;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.planRow,
        selected ? styles.planRowSelected : styles.planRowIdle,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.title}, ${plan.price}${plan.cadence}`}
    >
      <View style={[styles.planRadio, selected ? styles.planRadioSelected : null]}>
        {selected ? (
          <Icon name="check" size={15} color="#0A222B" stroke={2.8} />
        ) : null}
      </View>

      <View style={styles.planRowLabel}>
        <Text style={styles.planRowTitle}>{plan.title}</Text>
        {plan.badge ? (
          <View style={styles.planBadgePill}>
            <Text style={styles.planBadgePillText}>{plan.badge}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.planRowPriceWrap}>
        <Text style={styles.planRowPrice}>{plan.price}</Text>
        <Text style={styles.planRowCadence}>{plan.cadence}</Text>
      </View>
    </Pressable>
  );
}

function NativeGlassPlanRow({
  plan,
  selected,
  onPress,
}: {
  plan: Plan;
  selected: boolean;
  onPress: () => void;
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const iconColor = selected ? '#B8F6FF' : 'rgba(255,255,255,0.64)';
  const glassTint = selected ? 'rgba(76,190,218,0.24)' : 'rgba(255,255,255,0.12)';
  const contentWidth = Math.max(rowWidth - 36, 1);

  return (
    <View
      style={[styles.nativePlanRowWrap, selected ? styles.nativePlanRowSelected : null]}
      onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
    >
      {rowWidth > 0 ? (
        <Host ignoreSafeArea="all" colorScheme="dark" style={[styles.nativePlanRowHost, { width: rowWidth }]}>
          <GlassEffectContainer>
            <SwiftButton
              onPress={onPress}
              modifiers={[
                frame({ width: rowWidth, height: 66 }),
                glassEffect({
                  glass: { variant: 'regular', interactive: true, tint: glassTint },
                  shape: 'roundedRectangle',
                  cornerRadius: 18,
                }),
                contentShape(shapes.roundedRectangle({ cornerRadius: 18 })),
              ]}
            >
              <HStack spacing={12} alignment="center" modifiers={[frame({ width: contentWidth, height: 66 })]}>
                <SwiftImage
                  systemName={selected ? 'checkmark.circle.fill' : 'circle'}
                  size={26}
                  color={iconColor}
                />
                <SwiftText
                  modifiers={[
                    font({ size: 17, weight: 'semibold' }),
                    foregroundStyle('#FFFFFF'),
                  ]}
                >
                  {plan.title}
                </SwiftText>
                {plan.badge ? (
                  <SwiftText
                    modifiers={[
                      font({ size: 11, weight: 'medium' }),
                      foregroundStyle('#9CEEFF'),
                    ]}
                  >
                    {plan.badge}
                  </SwiftText>
                ) : null}
                <Spacer />
                <SwiftText
                  modifiers={[
                    font({ size: 17, weight: 'semibold' }),
                    foregroundStyle('#FFFFFF'),
                  ]}
                >
                  {plan.price}
                </SwiftText>
                <SwiftText
                  modifiers={[
                    font({ size: 14, weight: 'medium' }),
                    foregroundStyle('rgba(255,255,255,0.62)'),
                  ]}
                >
                  {plan.cadence}
                </SwiftText>
              </HStack>
            </SwiftButton>
          </GlassEffectContainer>
        </Host>
      ) : null}
    </View>
  );
}

function CloseButton({ top, onClose }: { top: number; onClose: () => void }) {
  if (SUPPORTS_GLASS) {
    return (
      <View style={[styles.closeHostWrap, { top }]}>
        <GlassCircleButton
          onPress={onClose}
          systemImage="xmark"
          size={42}
          iconSize={18}
          iconColor="rgba(255,255,255,0.88)"
          glassTint="rgba(255,255,255,0.14)"
          accessibilityLabel="Close paywall"
          colorScheme="dark"
        />
      </View>
    );
  }

  return (
    <View style={[styles.closeHostWrap, { top }]}>
      <Host ignoreSafeArea="all" colorScheme="dark" style={styles.closeHost}>
        <SwiftButton
          onPress={onClose}
          modifiers={[
            buttonStyle('plain'),
            controlSize('large'),
            tint('#FFFFFF'),
          ]}
        >
          <SwiftText
            modifiers={[
              frame({ width: 42, height: 42 }),
              contentShape(shapes.circle()),
              font({ size: 22, weight: 'medium' }),
              foregroundStyle('rgba(255,255,255,0.88)'),
            ]}
          >
            ×
          </SwiftText>
        </SwiftButton>
      </Host>
    </View>
  );
}

function NativeSubscribeButton({ label, onPress }: { label: string; onPress: () => void }) {
  const [buttonWidth, setButtonWidth] = useState(0);
  const subscribeStyle = SUPPORTS_GLASS ? buttonStyle('glassProminent') : buttonStyle('borderedProminent');
  const subscribeTint = SUPPORTS_GLASS ? '#8BEAFF' : '#D7D7DC';

  return (
    <View style={styles.subscribeButtonWrap} onLayout={event => setButtonWidth(event.nativeEvent.layout.width)}>
      {buttonWidth > 0 ? (
        <Host ignoreSafeArea="all" colorScheme="dark" style={{ width: buttonWidth, height: 55 }}>
          <SwiftButton
            onPress={onPress}
            modifiers={[
              subscribeStyle,
              controlSize('large'),
              tint(subscribeTint),
            ]}
          >
            <SwiftText
              modifiers={[
                frame({ width: buttonWidth, height: 55 }),
                contentShape(shapes.rectangle()),
                font({ size: 17, weight: 'semibold' }),
                foregroundStyle('#171820'),
              ]}
            >
              {label}
            </SwiftText>
          </SwiftButton>
        </Host>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 130,
  },
  sheetRoot: {
    backgroundColor: '#05070D',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  backgroundGradient: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  scrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  bottomWash: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  baseFill: {
    backgroundColor: '#05070D',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  closeHostWrap: {
    height: 42,
    position: 'absolute',
    right: 16,
    width: 42,
    zIndex: 4,
  },
  closeHost: {
    height: 42,
    width: 42,
  },
  contentShell: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  content: {
    alignItems: 'center',
  },
  copyBlock: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  appName: {
    ...TYPE.pageTitle,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0,
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    ...TYPE.display,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0,
    textAlign: 'center',
  },
  subtitle: {
    ...TYPE.onMediaStatusSubMd,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 8,
    textAlign: 'center',
  },
  benefitsList: {
    gap: 10,
    marginTop: 28,
    paddingHorizontal: 42,
    width: '100%',
  },
  benefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  benefitCheck: {
    alignItems: 'center',
    backgroundColor: 'rgba(156,238,255,0.88)',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  benefitText: {
    ...TYPE.body,
    color: 'rgba(255,255,255,0.88)',
    flex: 1,
    fontWeight: FONT_WEIGHT.medium,
  },
  purchasePanel: {
    marginTop: 28,
    paddingHorizontal: 34,
    width: '100%',
  },
  trialRow: {
    height: 44,
    justifyContent: 'center',
    marginBottom: 12,
    width: '100%',
  },
  trialCheckboxHost: {
    height: 44,
    width: '100%',
  },
  planRows: {
    gap: 10,
    width: '100%',
  },
  nativePlanRowWrap: {
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 66,
    overflow: 'hidden',
    width: '100%',
  },
  nativePlanRowHost: {
    height: 66,
  },
  nativePlanRowSelected: {
    borderColor: 'rgba(156,238,255,0.78)',
    borderWidth: 1,
  },
  planRow: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    height: 66,
    paddingHorizontal: 18,
  },
  planRowSelected: {
    backgroundColor: 'rgba(75,92,106,0.44)',
    borderColor: '#58D7F2',
  },
  planRowIdle: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  planRadio: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.48)',
    borderRadius: 14,
    borderWidth: 1.4,
    height: 28,
    justifyContent: 'center',
    marginRight: 14,
    width: 28,
  },
  planRadioSelected: {
    backgroundColor: '#58D7F2',
    borderColor: '#58D7F2',
  },
  planRowLabel: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  planRowTitle: {
    ...TYPE.pageTitle,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0,
  },
  planBadgePill: {
    backgroundColor: 'rgba(88,215,242,0.16)',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planBadgePillText: {
    ...TYPE.labelPlain,
    color: '#7DE4F6',
    fontWeight: FONT_WEIGHT.medium,
  },
  planRowPriceWrap: {
    alignItems: 'baseline',
    flexDirection: 'row',
    marginLeft: 12,
  },
  planRowPrice: {
    ...TYPE.pageTitle,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0,
  },
  planRowCadence: {
    ...TYPE.body,
    color: 'rgba(255,255,255,0.62)',
    fontWeight: FONT_WEIGHT.medium,
  },
  reassurance: {
    ...TYPE.bodySm,
    color: 'rgba(255,255,255,0.56)',
    marginTop: 18,
    textAlign: 'center',
  },
  footerStack: {
    alignItems: 'center',
    marginTop: 14,
    width: '100%',
  },
  subscribeButtonWrap: {
    borderRadius: 14,
    height: 55,
    overflow: 'hidden',
    width: '84%',
  },
  restoreHit: {
    marginTop: 17,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  restore: {
    ...TYPE.subsectionTitle,
    color: '#F4F5FA',
    fontWeight: FONT_WEIGHT.bold,
    textAlign: 'center',
  },
  legal: {
    ...TYPE.captionXsEm,
    color: 'rgba(255,255,255,0.56)',
    fontWeight: FONT_WEIGHT.semibold,
    marginTop: 7,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.74,
  },
});
