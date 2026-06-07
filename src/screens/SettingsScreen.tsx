import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Switch,
  Pressable,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Image } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Theme, overText } from '../theme';
import { useTheme } from '../ThemeProvider';
import { ScreenExitButton } from '../components/GlassButton';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
import { SPACE, LAYOUT } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  onOpenAppearance: () => void;
  onOpenIncome: () => void;
  activeLedgerName?: string;
  memberCount: number;
}

// Row kinds. `nav` pushes/opens something; `toggle` flips a persisted flag;
// `action` fires a one-shot (export, sign out). `value` is the trailing summary.
type Row =
  | { kind: 'nav'; icon: SFSymbol; label: string; value?: string; onPress: () => void }
  | { kind: 'toggle'; icon: SFSymbol; label: string; caption?: string; value: boolean; onValueChange: (v: boolean) => void }
  | { kind: 'action'; icon: SFSymbol; label: string; destructive?: boolean; onPress: () => void }
  | { kind: 'info'; icon: SFSymbol; label: string; value: string };

interface Group {
  title?: string;
  rows: Row[];
}

export function SettingsScreen({
  theme,
  visible,
  onClose,
  onOpenAppearance,
  onOpenIncome,
  activeLedgerName,
  memberCount,
}: Props) {
  const insets = useSafeAreaInsets();
  const { dark, metaFlag, setMetaFlag } = useTheme();

  // Slide-up + fade, mirroring ThemeScreen so pushed screens feel consistent.
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const profileName = activeLedgerName ?? 'Shared ledger';

  // Several rows below describe features whose native/backend half isn't built
  // yet (push notifications, app lock, CloudKit sync, export, invites). They
  // ship as real, persisted UI; this is the honest placeholder for the action.
  const comingSoon = (title: string) =>
    Alert.alert(title, 'This will be available in a future update.');

  const handleSignOut = () =>
    Alert.alert('Sign out', "You'll need to sign in again to reach your data.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => comingSoon('Sign out') },
    ]);

  const toggle = (key: string) => (v: boolean) => setMetaFlag(key, v);

  const groups: Group[] = [
    {
      rows: [
        { kind: 'nav', icon: 'paintbrush', label: 'Appearance', value: dark ? 'Dark' : 'Light', onPress: onOpenAppearance },
      ],
    },
    {
      title: 'Notifications',
      rows: [
        { kind: 'toggle', icon: 'bell', label: 'Bill reminders', value: metaFlag('notifyBills'), onValueChange: toggle('notifyBills') },
        { kind: 'toggle', icon: 'exclamationmark.triangle', label: 'Over-budget alerts', value: metaFlag('notifyOverBudget'), onValueChange: toggle('notifyOverBudget') },
        { kind: 'toggle', icon: 'calendar', label: 'Weekly summary', value: metaFlag('notifyWeekly'), onValueChange: toggle('notifyWeekly') },
      ],
    },
    {
      title: 'Privacy & Security',
      rows: [
        { kind: 'toggle', icon: 'faceid', label: 'Require Face ID', caption: 'Lock the app when it opens', value: metaFlag('appLock'), onValueChange: toggle('appLock') },
        { kind: 'toggle', icon: 'eye.slash', label: 'Hide amounts when inactive', value: metaFlag('hideAmounts'), onValueChange: toggle('hideAmounts') },
      ],
    },
    {
      title: 'Preferences',
      rows: [
        { kind: 'nav', icon: 'dollarsign.circle', label: 'Currency', value: 'USD', onPress: () => comingSoon('Currency') },
        { kind: 'nav', icon: 'banknote', label: 'Monthly income', onPress: onOpenIncome },
        { kind: 'nav', icon: 'calendar', label: 'Start week on', value: 'Sunday', onPress: () => comingSoon('Start week on') },
      ],
    },
    {
      title: 'Data',
      rows: [
        { kind: 'toggle', icon: 'icloud', label: 'iCloud sync', value: metaFlag('icloudSync'), onValueChange: toggle('icloudSync') },
        { kind: 'action', icon: 'square.and.arrow.up', label: 'Export data', onPress: () => comingSoon('Export data') },
      ],
    },
    {
      title: 'Sharing',
      rows: [
        { kind: 'nav', icon: 'person.2', label: 'Shared ledger', value: profileName, onPress: () => comingSoon('Shared ledger') },
        { kind: 'nav', icon: 'person.3', label: 'Members', value: String(memberCount), onPress: () => comingSoon('Members') },
        { kind: 'action', icon: 'person.badge.plus', label: 'Invite someone', onPress: () => comingSoon('Invite someone') },
      ],
    },
    {
      title: 'About',
      rows: [
        { kind: 'nav', icon: 'questionmark.circle', label: 'Help & support', onPress: () => comingSoon('Help & support') },
        { kind: 'nav', icon: 'hand.raised', label: 'Privacy policy', onPress: () => comingSoon('Privacy policy') },
        { kind: 'nav', icon: 'doc.text', label: 'Terms of service', onPress: () => comingSoon('Terms of service') },
        { kind: 'info', icon: 'info.circle', label: 'Version', value: version },
      ],
    },
    {
      rows: [
        { kind: 'action', icon: 'rectangle.portrait.and.arrow.right', label: 'Sign out', destructive: true, onPress: handleSignOut },
      ],
    },
  ];

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 78, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        {/* Header — solid, hairline base. This is a flat form surface, not glass. */}
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.bg }]}>
          <ScreenExitButton
            variant="back"
            onPress={onClose}
            tint={theme.text}
            fallbackBg={theme.chipBg}
            accessibilityLabel="Back"
          />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
          {/* Spacer balances the back button so the title stays centered. */}
          <View style={styles.headerSpacer} />
          <View style={[styles.headerDivider, { backgroundColor: theme.hairline }]} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 52 + SPACE.lg,
            paddingBottom: insets.bottom + SPACE.xxxl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {groups.map((group, gi) => (
            <View key={gi} style={styles.group}>
              {group.title && (
                <Text style={[TYPE.labelLg, styles.groupTitle, { color: theme.textTer }]}>
                  {group.title}
                </Text>
              )}
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                {group.rows.map((row, ri) => (
                  <SettingsRowView
                    key={ri}
                    theme={theme}
                    dark={dark}
                    row={row}
                    showSeparator={ri < group.rows.length - 1}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

function SettingsRowView({
  theme,
  dark,
  row,
  showSeparator,
}: {
  theme: Theme;
  dark: boolean;
  row: Row;
  showSeparator: boolean;
}) {
  const destructive = row.kind === 'action' && row.destructive;
  const ember = overText(dark);
  const tint = destructive ? ember : theme.text;

  const body = (
    <View style={styles.row}>
      <Host style={styles.iconHost} ignoreSafeArea="all">
        <Image
          systemName={row.icon}
          size={19}
          color={destructive ? ember : theme.textSec}
        />
      </Host>
      <View style={styles.rowCopy}>
        <Text style={[TYPE.body, { color: tint }]}>{row.label}</Text>
        {row.kind === 'toggle' && row.caption && (
          <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 2 }]}>{row.caption}</Text>
        )}
      </View>

      {row.kind === 'toggle' ? (
        <Switch
          value={row.value}
          onValueChange={row.onValueChange}
          trackColor={{ false: theme.chipBg, true: theme.accent.fill }}
          thumbColor={row.value ? theme.accent.ink : theme.surface}
          ios_backgroundColor={theme.chipBg}
          accessibilityLabel={row.label}
        />
      ) : row.kind === 'info' ? (
        <Text style={[TYPE.bodySm, { color: theme.textTer }]}>{row.value}</Text>
      ) : (
        <View style={styles.rowTrailing}>
          {row.kind === 'nav' && row.value != null && (
            <Text style={[TYPE.bodySm, { color: theme.textTer }]} numberOfLines={1}>
              {row.value}
            </Text>
          )}
          <Host style={styles.chevronHost} ignoreSafeArea="all">
            <Image systemName="chevron.right" size={13} color={theme.textTer} />
          </Host>
        </View>
      )}
    </View>
  );

  const content = (
    <>
      {body}
      {showSeparator && (
        <View style={[styles.separator, { backgroundColor: theme.sep }]} />
      )}
    </>
  );

  if (row.kind === 'toggle' || row.kind === 'info') {
    return <View>{content}</View>;
  }
  return (
    <Pressable
      onPress={row.onPress}
      android_ripple={{ color: theme.chipBg }}
      style={({ pressed }) => [pressed && { backgroundColor: theme.chipBg }]}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LAYOUT.screenGutter,
    paddingBottom: SPACE.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  group: {
    marginBottom: SPACE.xxl,
    // Pull the scroll content below the absolutely-positioned header.
    paddingTop: 0,
  },
  groupTitle: {
    marginLeft: LAYOUT.screenGutter + SPACE.xs,
    marginBottom: SPACE.sm,
  },
  card: {
    marginHorizontal: LAYOUT.screenGutter,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: 50,
    paddingVertical: 13,
    paddingHorizontal: SPACE.lg,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    flexShrink: 1,
    maxWidth: '52%',
    justifyContent: 'flex-end',
  },
  iconHost: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronHost: {
    width: 12,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACE.lg + 24 + SPACE.md,
  },
});
