import React from 'react';
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button as SwiftButton,
  DatePicker,
  Form as SwiftForm,
  Host,
  LabeledContent,
  Picker,
  Section as SwiftSection,
  Text as SwiftText,
  Toggle as SwiftToggle,
} from '@expo/ui/swift-ui';
import {
  background,
  datePickerStyle,
  environment,
  foregroundStyle,
  listStyle,
  pickerStyle,
  scrollContentBackground,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';

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

        <View style={[styles.formWrap, { paddingTop: insets.top + 68 }]}>
          <Host
            style={styles.formHost}
            colorScheme={theme.dark ? 'dark' : 'light'}
            ignoreSafeArea="keyboard"
          >
            <SwiftForm
              modifiers={[
                listStyle('insetGrouped'),
                scrollContentBackground('hidden'),
                background(theme.bg),
                tint(theme.accent.dot),
              ]}
            >
              <SwiftSection footer={<SwiftText>{permissionCaption}</SwiftText>}>
                <LabeledContent label="Permission">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: permission.granted ? 'primary' : 'secondary' })]}>
                    {permissionLabel}
                  </SwiftText>
                </LabeledContent>
                <SwiftButton
                  label="Send Test Notification"
                  systemImage="paperplane"
                  onPress={sendTest}
                />
              </SwiftSection>

              <SwiftSection title="Bills" footer={<SwiftText>Quiet reminders before recurring bills are due.</SwiftText>}>
                <SwiftToggle
                  label="Bill Reminders"
                  isOn={prefs.billReminders.enabled}
                  onIsOnChange={value => updateToggle('billReminders', value)}
                />
                <Picker
                  label="Remind"
                  selection={prefs.billReminders.leadDays}
                  onSelectionChange={value => {
                    if (typeof value !== 'number') return;
                    setPrefs(current => ({
                      ...current,
                      billReminders: { ...current.billReminders, leadDays: value as BillReminderLeadDays },
                    }));
                  }}
                  modifiers={[pickerStyle('menu')]}
                >
                  {LEAD_OPTIONS.map(option => (
                    <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                      {option.label}
                    </SwiftText>
                  ))}
                </Picker>
                <LabeledContent label="Time">
                  <SwiftButton label={timeLabel(prefs.billReminders.time)} onPress={() => setTimeEditor('billTime')} />
                </LabeledContent>
              </SwiftSection>

              <SwiftSection title="Budget" footer={<SwiftText>A restrained alert when a category is close to, or over, plan.</SwiftText>}>
                <SwiftToggle
                  label="Budget Pace Check"
                  isOn={prefs.budgetAlerts.enabled}
                  onIsOnChange={value => updateToggle('budgetAlerts', value)}
                />
                <Picker
                  label="Alert For"
                  selection={prefs.budgetAlerts.mode}
                  onSelectionChange={value => {
                    if (value !== 'near-and-over' && value !== 'over-only') return;
                    setPrefs(current => ({
                      ...current,
                      budgetAlerts: { ...current.budgetAlerts, mode: value },
                    }));
                  }}
                  modifiers={[pickerStyle('menu')]}
                >
                  {BUDGET_MODE_OPTIONS.map(option => (
                    <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                      {option.label}
                    </SwiftText>
                  ))}
                </Picker>
                <LabeledContent label="Time">
                  <SwiftButton label={timeLabel(prefs.budgetAlerts.time)} onPress={() => setTimeEditor('budgetTime')} />
                </LabeledContent>
              </SwiftSection>

              <SwiftSection title="Summary" footer={<SwiftText>A weekly check-in with spending, remaining income, and bills due soon.</SwiftText>}>
                <SwiftToggle
                  label="Weekly Summary"
                  isOn={prefs.weeklySummary.enabled}
                  onIsOnChange={value => updateToggle('weeklySummary', value)}
                />
                <Picker
                  label="Day"
                  selection={prefs.weeklySummary.weekday}
                  onSelectionChange={value => {
                    if (typeof value !== 'number') return;
                    setPrefs(current => ({
                      ...current,
                      weeklySummary: { ...current.weeklySummary, weekday: value as NotificationWeekday },
                    }));
                  }}
                  modifiers={[pickerStyle('menu')]}
                >
                  {WEEKDAY_OPTIONS.map(option => (
                    <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                      {option.label}
                    </SwiftText>
                  ))}
                </Picker>
                <LabeledContent label="Time">
                  <SwiftButton label={timeLabel(prefs.weeklySummary.time)} onPress={() => setTimeEditor('weeklyTime')} />
                </LabeledContent>
              </SwiftSection>

              <SwiftSection title="Goals" footer={<SwiftText>A monthly prompt to review planned savings contributions.</SwiftText>}>
                <SwiftToggle
                  label="Goal Contribution Reminder"
                  isOn={prefs.goalReminders.enabled}
                  onIsOnChange={value => updateToggle('goalReminders', value)}
                />
                <Picker
                  label="Day"
                  selection={prefs.goalReminders.dayOfMonth}
                  onSelectionChange={value => {
                    if (typeof value !== 'number') return;
                    setPrefs(current => ({
                      ...current,
                      goalReminders: { ...current.goalReminders, dayOfMonth: value },
                    }));
                  }}
                  modifiers={[pickerStyle('menu')]}
                >
                  {GOAL_DAY_OPTIONS.map(option => (
                    <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                      {option.label}
                    </SwiftText>
                  ))}
                </Picker>
                <LabeledContent label="Time">
                  <SwiftButton label={timeLabel(prefs.goalReminders.time)} onPress={() => setTimeEditor('goalTime')} />
                </LabeledContent>
              </SwiftSection>
            </SwiftForm>
          </Host>
        </View>

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
  formWrap: {
    flex: 1,
  },
  formHost: {
    flex: 1,
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
