import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'finance-reminders';
const NOTIFICATION_PREFIX = 'finance-app:';

let handlerConfigured = false;

export function configureLocalNotifications() {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  ensureNotificationChannel().catch(() => {});
}

export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  const { AndroidImportance } = Notifications;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Finance reminders',
    importance: AndroidImportance.DEFAULT,
    description: 'Bills, budget pace checks, weekly summaries, and goal reminders.',
    sound: null,
    enableVibrate: true,
    showBadge: false,
  });
}

export async function getNotificationPermissionState() {
  try {
    const status = await Notifications.getPermissionsAsync();
    return {
      granted: allowsNotifications(status),
      canAskAgain: status.canAskAgain,
      status: status.status,
    };
  } catch {
    return {
      granted: false,
      canAskAgain: false,
      status: 'undetermined',
    };
  }
}

export async function requestLocalNotificationPermissions() {
  await ensureNotificationChannel();
  const status = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: false,
    },
  });
  return allowsNotifications(status);
}

export async function scheduleTestNotification() {
  await ensureNotificationChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: makeFinanceNotificationId(`test:${Date.now()}`),
    content: {
      title: 'Notifications are working',
      body: 'This is a local test reminder from your finance app.',
      interruptionLevel: 'active',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelFinanceNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(item => item.identifier.startsWith(NOTIFICATION_PREFIX))
        .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {})),
    );
  } catch {
    // Notification APIs can be unavailable in some dev/runtime environments.
  }
}

export async function scheduleDateNotification({
  identifier,
  title,
  body,
  date,
  data,
}: {
  identifier: string;
  title: string;
  body: string;
  date: Date;
  data?: Record<string, unknown>;
}) {
  if (date.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: makeFinanceNotificationId(identifier),
    content: {
      title,
      body,
      data,
      interruptionLevel: 'passive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: CHANNEL_ID,
    },
  });
}

export async function scheduleWeeklyNotification({
  identifier,
  title,
  body,
  weekday,
  hour,
  minute,
  data,
}: {
  identifier: string;
  title: string;
  body: string;
  weekday: number;
  hour: number;
  minute: number;
  data?: Record<string, unknown>;
}) {
  await Notifications.scheduleNotificationAsync({
    identifier: makeFinanceNotificationId(identifier),
    content: {
      title,
      body,
      data,
      interruptionLevel: 'passive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
}

export async function scheduleMonthlyNotification({
  identifier,
  title,
  body,
  day,
  hour,
  minute,
  data,
}: {
  identifier: string;
  title: string;
  body: string;
  day: number;
  hour: number;
  minute: number;
  data?: Record<string, unknown>;
}) {
  await Notifications.scheduleNotificationAsync({
    identifier: makeFinanceNotificationId(identifier),
    content: {
      title,
      body,
      data,
      interruptionLevel: 'passive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
}

export function nextLocalDateAfterDays(daysFromToday: number, hour: number, minute: number) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + Math.max(0, daysFromToday));
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function makeFinanceNotificationId(id: string) {
  return `${NOTIFICATION_PREFIX}${id}`;
}

function allowsNotifications(status: Notifications.NotificationPermissionsStatus) {
  return (
    status.granted ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}
