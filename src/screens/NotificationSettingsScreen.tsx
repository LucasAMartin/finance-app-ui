import React from 'react';
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DatePicker, Host, Image } from '@expo/ui/swift-ui';
import { datePickerStyle, environment, tint } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Theme } from '../theme';
import { ScreenExitButton } from '../components/GlassButton';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import {
  getNotificationPrefs,
  notificationSummary,
  updateNotificationPrefs,
  type BillReminderLeadDays,
  type BudgetAlertMode,
  type NotificationPrefs,
  type NotificationTime,
  type NotificationWeekday,
} from '../notifications/preferences';
import {
  getNotificationPermissionState,
  requestLocalNotificationPermissions,
  scheduleTestNotification,
} from '../notifications/service';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
import { SPACE, LAYOUT } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

type NotificationPermissionState = Awaited<ReturnType<typeof getNotificationPermissionState>>;
type TimeEditor =
  | 'billTime'
  | 'budgetTime'
  | 'weeklyTime'
  | 'goalTime'
  | null;

const WEEKDAY_OPTIONS: Array<{ label: string; value: NotificationWeekday }> = [
  { label: 'Sunday', value: 1 },
  { label: 'Monday', value: 2 },
  { label: 'Tuesday', value: 3 },
  { label: 'Wednesday', value: 4 },
  { label: 'Thursday', value: 5 },
  { label: 'Friday', value: 6 },
  { label: 'Saturday', value: 7 },
];

const LEAD_OPTIONS: Array<{ label: string; value: BillReminderLeadDays }> = [
  { label: 'On due day', value: 0 },
  { label: '1 day before', value: 1 },
  { label: '3 days before', value: 3 },
];

const BUDGET_MODE_OPTIONS: Array<{ label: string; value: BudgetAlertMode }> = [
  { label: 'Near limit and over', value: 'near-and-over' },
  { label: 'Over only', value: 'over-only' },
];

const GOAL_DAY_OPTIONS = [
  { label: '1st of month', value: 1 },
  { label: '5th of month', value: 5 },
  { label: '15th of month', value: 15 },
];

export function NotificationSettingsScreen({ theme, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { settingsRepo } = useRepositories();
  const settings = useRepositoryList(settingsRepo)[0];
  const prefs = getNotificationPrefs(settings);
  const [permission, setPermission] = React.useState<NotificationPermissionState>({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
  });
  const [timeEditor, setTimeEditor] = React.useState<TimeEditor>(null);

  const refreshPermission = React.useCallback(() => {
    getNotificationPermissionState().then(setPermission).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (visible) refreshPermission();
  }, [refreshPermission, visible]);

  React.useEffect(() => {
    if (!visible) setTimeEditor(null);
  }, [visible]);

  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const setPrefs = React.useCallback((updater: (current: NotificationPrefs) => NotificationPrefs) => {
    updateNotificationPrefs(settingsRepo, updater);
  }, [settingsRepo]);

  const ensureAllowed = React.useCallback(async () => {
    const current = await getNotificationPermissionState();
    if (current.granted) {
      setPermission(current);
      return true;
    }
    const granted = await requestLocalNotificationPermissions();
    refreshPermission();
    if (!granted) {
      Alert.alert(
        'Notifications are off',
        current.canAskAgain
          ? 'Allow notifications to receive local reminders for bills, budgets, goals, and summaries.'
          : 'Notifications are disabled in system settings. You can turn them on from the Settings app.',
        current.canAskAgain
          ? [{ text: 'OK' }]
          : [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
            ],
      );
    }
    return granted;
  }, [refreshPermission]);

  const sendTest = React.useCallback(async () => {
    if (!(await ensureAllowed())) return;
    try {
      await scheduleTestNotification();
      Alert.alert('Test scheduled', 'A local notification should arrive in about five seconds.');
    } catch {
      Alert.alert('Could not schedule test', 'The notification API is not available in this runtime.');
    }
  }, [ensureAllowed]);

  const updateToggle = React.useCallback(async (
    key: keyof NotificationPrefs,
    enabled: boolean,
  ) => {
    if (enabled && !(await ensureAllowed())) return;
    setPrefs(current => ({
      ...current,
      [key]: { ...current[key], enabled },
    }));
  }, [ensureAllowed, setPrefs]);

  const permissionLabel = permission.granted
    ? 'Allowed'
    : permission.canAskAgain
      ? 'Not enabled'
      : 'Disabled in Settings';
  const permissionCaption = permission.granted
    ? `Active: ${notificationSummary(prefs)}`
    : 'Turn on any reminder to request permission.';

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 79, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.bg }]}>
          <ScreenExitButton
            variant="back"
            onPress={onClose}
            tint={theme.text}
            fallbackBg={theme.chipBg}
            accessibilityLabel="Back"
          />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Notifications</Text>
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
          <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <View style={styles.statusIconWrap}>
              <Host style={styles.statusIconHost} ignoreSafeArea="all">
                <Image systemName="bell" size={22} color={theme.text} />
              </Host>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>Local reminders</Text>
              <Text style={[TYPE.caption, { color: theme.textSec, marginTop: SPACE.xs }]}>
                {permissionCaption}
              </Text>
            </View>
            <Text style={[TYPE.captionEm, { color: permission.granted ? theme.text : theme.textTer }]}>
              {permissionLabel}
            </Text>
          </View>

          <Pressable
            onPress={sendTest}
            accessibilityRole="button"
            accessibilityLabel="Send test notification"
            style={({ pressed }) => [
              styles.testButton,
              {
                backgroundColor: pressed ? theme.chipBg : theme.surface,
                borderColor: theme.hairline,
              },
            ]}
          >
            <IconHost icon="paperplane" theme={theme} />
            <View style={styles.rowCopy}>
              <Text style={[TYPE.body, { color: theme.text }]}>Send test notification</Text>
              <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 2 }]}>
                Schedules a local test alert for five seconds from now.
              </Text>
            </View>
            <Text style={[TYPE.bodySm, { color: theme.textTer }]}>Test</Text>
          </Pressable>

          <SettingsGroup title="Bills" theme={theme}>
            <NotificationToggleRow
              theme={theme}
              icon="bell"
              label="Bill reminders"
              caption="Quiet reminders before recurring bills are due."
              value={prefs.billReminders.enabled}
              onValueChange={value => updateToggle('billReminders', value)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="calendar"
              label="Remind"
              value={leadLabel(prefs.billReminders.leadDays)}
              onPress={() => chooseLeadDays(setPrefs)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="clock"
              label="Time"
              value={timeLabel(prefs.billReminders.time)}
              onPress={() => setTimeEditor('billTime')}
            />
          </SettingsGroup>

          <SettingsGroup title="Budget" theme={theme}>
            <NotificationToggleRow
              theme={theme}
              icon="chart.bar"
              label="Budget pace check"
              caption="A restrained alert when a category is close to, or over, plan."
              value={prefs.budgetAlerts.enabled}
              onValueChange={value => updateToggle('budgetAlerts', value)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="exclamationmark.triangle"
              label="Alert for"
              value={budgetModeLabel(prefs.budgetAlerts.mode)}
              onPress={() => chooseBudgetMode(setPrefs)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="clock"
              label="Time"
              value={timeLabel(prefs.budgetAlerts.time)}
              onPress={() => setTimeEditor('budgetTime')}
            />
          </SettingsGroup>

          <SettingsGroup title="Summary" theme={theme}>
            <NotificationToggleRow
              theme={theme}
              icon="calendar"
              label="Weekly summary"
              caption="A weekly check-in with spending, remaining income, and bills due soon."
              value={prefs.weeklySummary.enabled}
              onValueChange={value => updateToggle('weeklySummary', value)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="calendar"
              label="Day"
              value={weekdayLabel(prefs.weeklySummary.weekday)}
              onPress={() => chooseWeekday(setPrefs)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="clock"
              label="Time"
              value={timeLabel(prefs.weeklySummary.time)}
              onPress={() => setTimeEditor('weeklyTime')}
            />
          </SettingsGroup>

          <SettingsGroup title="Goals" theme={theme}>
            <NotificationToggleRow
              theme={theme}
              icon="target"
              label="Goal contribution reminder"
              caption="A monthly prompt to review planned savings contributions."
              value={prefs.goalReminders.enabled}
              onValueChange={value => updateToggle('goalReminders', value)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="calendar"
              label="Day"
              value={goalDayLabel(prefs.goalReminders.dayOfMonth)}
              onPress={() => chooseGoalDay(setPrefs)}
              showSeparator
            />
            <NotificationValueRow
              theme={theme}
              icon="clock"
              label="Time"
              value={timeLabel(prefs.goalReminders.time)}
              onPress={() => setTimeEditor('goalTime')}
            />
          </SettingsGroup>
        </ScrollView>

        <NativeTimePopup
          bottomInset={insets.bottom}
          editor={timeEditor}
          prefs={prefs}
          theme={theme}
          onClose={() => setTimeEditor(null)}
          onChange={time => {
            if (!timeEditor) return;
            setPrefs(current => updateTimePreference(current, timeEditor, time));
          }}
        />
      </View>
    </Animated.View>
  );
}

function SettingsGroup({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={[TYPE.labelLg, styles.groupTitle, { color: theme.textTer }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
        {children}
      </View>
    </View>
  );
}

function NotificationToggleRow({
  theme,
  icon,
  label,
  caption,
  value,
  onValueChange,
  showSeparator,
}: {
  theme: Theme;
  icon: SFSymbol;
  label: string;
  caption?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  showSeparator?: boolean;
}) {
  return (
    <View>
      <View style={styles.row}>
        <IconHost icon={icon} theme={theme} />
        <View style={styles.rowCopy}>
          <Text style={[TYPE.body, { color: theme.text }]}>{label}</Text>
          {caption ? (
            <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 2 }]}>{caption}</Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: theme.chipBg, true: theme.accent.fill }}
          thumbColor={value ? theme.accent.ink : theme.surface}
          ios_backgroundColor={theme.chipBg}
          accessibilityLabel={label}
        />
      </View>
      {showSeparator ? <Separator theme={theme} /> : null}
    </View>
  );
}

function NotificationValueRow({
  theme,
  icon,
  label,
  value,
  onPress,
  showSeparator,
}: {
  theme: Theme;
  icon: SFSymbol;
  label: string;
  value: string;
  onPress: () => void;
  showSeparator?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [pressed && { backgroundColor: theme.chipBg }]}
    >
      <View style={styles.row}>
        <IconHost icon={icon} theme={theme} />
        <Text style={[TYPE.body, styles.rowCopy, { color: theme.text }]}>{label}</Text>
        <Text style={[TYPE.bodySm, { color: theme.textTer }]}>{value}</Text>
      </View>
      {showSeparator ? <Separator theme={theme} /> : null}
    </Pressable>
  );
}

function IconHost({ icon, theme }: { icon: SFSymbol; theme: Theme }) {
  return (
    <Host style={styles.iconHost} ignoreSafeArea="all">
      <Image systemName={icon} size={19} color={theme.textSec} />
    </Host>
  );
}

function Separator({ theme }: { theme: Theme }) {
  return <View style={[styles.separator, { backgroundColor: theme.sep }]} />;
}

function NativeTimePopup({
  bottomInset,
  editor,
  prefs,
  theme,
  onClose,
  onChange,
}: {
  bottomInset: number;
  editor: TimeEditor;
  prefs: NotificationPrefs;
  theme: Theme;
  onClose: () => void;
  onChange: (time: NotificationTime) => void;
}) {
  const value = timeForEditor(editor, prefs);

  return (
    <Modal
      visible={editor !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close time picker"
          onPress={onClose}
          style={styles.modalScrim}
        />
        <View
          style={[
            styles.timeSheet,
            {
              paddingBottom: bottomInset + SPACE.md,
              backgroundColor: theme.surface,
              borderColor: theme.hairline,
            },
          ]}
        >
          <View style={[styles.timeSheetHandle, { backgroundColor: theme.sep }]} />
          <View style={styles.timeSheetHeader}>
            <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>{timeEditorTitle(editor)}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Done"
              hitSlop={10}
            >
              <Text style={[TYPE.body, { color: theme.accent.dot }]}>Done</Text>
            </Pressable>
          </View>
          <Host style={styles.nativeTimeHost} ignoreSafeArea="all">
            <DatePicker
              selection={dateForTime(value)}
              onDateChange={date => onChange({ hour: date.getHours(), minute: date.getMinutes() })}
              displayedComponents={['hourAndMinute']}
              modifiers={[
                datePickerStyle('wheel'),
                tint(theme.accent.dot),
                environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
              ]}
            />
          </Host>
        </View>
      </View>
    </Modal>
  );
}

function chooseLeadDays(setPrefs: (updater: (current: NotificationPrefs) => NotificationPrefs) => void) {
  Alert.alert('Bill reminder', undefined, [
    ...LEAD_OPTIONS.map(option => ({
      text: option.label,
      onPress: () => setPrefs(current => ({
        ...current,
        billReminders: { ...current.billReminders, leadDays: option.value },
      })),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

function chooseBudgetMode(setPrefs: (updater: (current: NotificationPrefs) => NotificationPrefs) => void) {
  Alert.alert('Budget alerts', undefined, [
    ...BUDGET_MODE_OPTIONS.map(option => ({
      text: option.label,
      onPress: () => setPrefs(current => ({
        ...current,
        budgetAlerts: { ...current.budgetAlerts, mode: option.value },
      })),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

function chooseWeekday(setPrefs: (updater: (current: NotificationPrefs) => NotificationPrefs) => void) {
  Alert.alert('Weekly summary', undefined, [
    ...WEEKDAY_OPTIONS.map(option => ({
      text: option.label,
      onPress: () => setPrefs(current => ({
        ...current,
        weeklySummary: { ...current.weeklySummary, weekday: option.value },
      })),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

function chooseGoalDay(setPrefs: (updater: (current: NotificationPrefs) => NotificationPrefs) => void) {
  Alert.alert('Goal reminder', undefined, [
    ...GOAL_DAY_OPTIONS.map(option => ({
      text: option.label,
      onPress: () => setPrefs(current => ({
        ...current,
        goalReminders: { ...current.goalReminders, dayOfMonth: option.value },
      })),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

function updateTimePreference(
  prefs: NotificationPrefs,
  editor: NonNullable<TimeEditor>,
  time: NotificationTime,
): NotificationPrefs {
  switch (editor) {
    case 'billTime':
      return { ...prefs, billReminders: { ...prefs.billReminders, time } };
    case 'budgetTime':
      return { ...prefs, budgetAlerts: { ...prefs.budgetAlerts, time } };
    case 'weeklyTime':
      return { ...prefs, weeklySummary: { ...prefs.weeklySummary, time } };
    case 'goalTime':
      return { ...prefs, goalReminders: { ...prefs.goalReminders, time } };
  }
}

function timeForEditor(editor: TimeEditor, prefs: NotificationPrefs) {
  switch (editor) {
    case 'billTime':
      return prefs.billReminders.time;
    case 'budgetTime':
      return prefs.budgetAlerts.time;
    case 'weeklyTime':
      return prefs.weeklySummary.time;
    case 'goalTime':
      return prefs.goalReminders.time;
    default:
      return prefs.billReminders.time;
  }
}

function timeEditorTitle(editor: TimeEditor) {
  switch (editor) {
    case 'billTime':
      return 'Bill reminder time';
    case 'budgetTime':
      return 'Budget alert time';
    case 'weeklyTime':
      return 'Weekly summary time';
    case 'goalTime':
      return 'Goal reminder time';
    default:
      return 'Reminder time';
  }
}

function timeLabel(time: NotificationTime) {
  return dateForTime(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function leadLabel(value: BillReminderLeadDays) {
  if (value === 0) return 'On due day';
  if (value === 1) return '1 day before';
  return '3 days before';
}

function budgetModeLabel(value: BudgetAlertMode) {
  return value === 'over-only' ? 'Over only' : 'Near limit and over';
}

function weekdayLabel(value: NotificationWeekday) {
  return WEEKDAY_OPTIONS.find(option => option.value === value)?.label ?? 'Sunday';
}

function goalDayLabel(day: number) {
  if (day === 1) return '1st of month';
  if (day === 2) return '2nd of month';
  if (day === 3) return '3rd of month';
  return `${day}th of month`;
}

function dateForTime(time: NotificationTime) {
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  return date;
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
  statusCard: {
    marginHorizontal: LAYOUT.screenGutter,
    marginBottom: SPACE.xxl,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    padding: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  statusIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconHost: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButton: {
    marginHorizontal: LAYOUT.screenGutter,
    marginTop: -SPACE.lg,
    marginBottom: SPACE.xxl,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  group: {
    marginBottom: SPACE.xxl,
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
  iconHost: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACE.lg + 24 + SPACE.md,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  timeSheet: {
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    borderWidth: 1,
    paddingTop: SPACE.sm,
    paddingHorizontal: LAYOUT.screenGutter,
  },
  timeSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACE.md,
  },
  timeSheetHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.xs,
  },
  nativeTimeHost: {
    height: 170,
    width: '100%',
  },
});
