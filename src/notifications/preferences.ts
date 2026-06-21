import type { AppSettings, Repository } from '../repositories/types';

export const NOTIFICATION_META_KEY = 'notifications';

export type NotificationWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type BillReminderLeadDays = 0 | 1 | 3;
export type BudgetAlertMode = 'near-and-over' | 'over-only';

export interface NotificationTime {
  hour: number;
  minute: number;
}

export interface NotificationPrefs {
  billReminders: {
    enabled: boolean;
    leadDays: BillReminderLeadDays;
    time: NotificationTime;
  };
  budgetAlerts: {
    enabled: boolean;
    mode: BudgetAlertMode;
    time: NotificationTime;
  };
  weeklySummary: {
    enabled: boolean;
    weekday: NotificationWeekday;
    time: NotificationTime;
  };
  goalReminders: {
    enabled: boolean;
    dayOfMonth: number;
    time: NotificationTime;
  };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  billReminders: {
    enabled: false,
    leadDays: 1,
    time: { hour: 9, minute: 0 },
  },
  budgetAlerts: {
    enabled: false,
    mode: 'near-and-over',
    time: { hour: 18, minute: 0 },
  },
  weeklySummary: {
    enabled: false,
    weekday: 1,
    time: { hour: 18, minute: 0 },
  },
  goalReminders: {
    enabled: false,
    dayOfMonth: 1,
    time: { hour: 9, minute: 0 },
  },
};

type SettingsRepo = Repository<AppSettings, AppSettings, Partial<Omit<AppSettings, 'id'>>>;

export function getNotificationPrefs(settings?: AppSettings): NotificationPrefs {
  return normalizeNotificationPrefs(settings?.meta?.[NOTIFICATION_META_KEY]);
}

export function notificationsEnabled(prefs: NotificationPrefs): boolean {
  return (
    prefs.billReminders.enabled ||
    prefs.budgetAlerts.enabled ||
    prefs.weeklySummary.enabled ||
    prefs.goalReminders.enabled
  );
}

export function notificationSummary(prefs: NotificationPrefs): string {
  const enabled = [
    prefs.billReminders.enabled ? 'Bills' : null,
    prefs.budgetAlerts.enabled ? 'Budget' : null,
    prefs.weeklySummary.enabled ? 'Weekly' : null,
    prefs.goalReminders.enabled ? 'Goals' : null,
  ].filter(Boolean);
  return enabled.length > 0 ? enabled.join(', ') : 'Off';
}

export function updateNotificationPrefs(
  settingsRepo: SettingsRepo,
  updater: (prefs: NotificationPrefs) => NotificationPrefs,
) {
  const current = settingsRepo.get('settings') ?? {
    id: 'settings' as const,
    themeDark: true,
    accentKey: 'ink' as const,
    cardStyle: 'flat' as const,
  };
  const meta = current.meta ?? {};
  const nextPrefs = updater(getNotificationPrefs(current));
  const nextMeta = { ...meta, [NOTIFICATION_META_KEY]: nextPrefs };
  settingsRepo.update('settings', { meta: nextMeta }) ?? settingsRepo.create({ ...current, meta: nextMeta });
}

function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const obj = isRecord(raw) ? raw : {};
  const bill = isRecord(obj.billReminders) ? obj.billReminders : {};
  const budget = isRecord(obj.budgetAlerts) ? obj.budgetAlerts : {};
  const weekly = isRecord(obj.weeklySummary) ? obj.weeklySummary : {};
  const goals = isRecord(obj.goalReminders) ? obj.goalReminders : {};

  return {
    billReminders: {
      enabled: typeof bill.enabled === 'boolean' ? bill.enabled : DEFAULT_NOTIFICATION_PREFS.billReminders.enabled,
      leadDays: normalizeLeadDays(bill.leadDays),
      time: normalizeTime(bill.time, DEFAULT_NOTIFICATION_PREFS.billReminders.time),
    },
    budgetAlerts: {
      enabled: typeof budget.enabled === 'boolean' ? budget.enabled : DEFAULT_NOTIFICATION_PREFS.budgetAlerts.enabled,
      mode: budget.mode === 'over-only' ? 'over-only' : DEFAULT_NOTIFICATION_PREFS.budgetAlerts.mode,
      time: normalizeTime(budget.time, DEFAULT_NOTIFICATION_PREFS.budgetAlerts.time),
    },
    weeklySummary: {
      enabled: typeof weekly.enabled === 'boolean' ? weekly.enabled : DEFAULT_NOTIFICATION_PREFS.weeklySummary.enabled,
      weekday: normalizeWeekday(weekly.weekday),
      time: normalizeTime(weekly.time, DEFAULT_NOTIFICATION_PREFS.weeklySummary.time),
    },
    goalReminders: {
      enabled: typeof goals.enabled === 'boolean' ? goals.enabled : DEFAULT_NOTIFICATION_PREFS.goalReminders.enabled,
      dayOfMonth: normalizeDayOfMonth(goals.dayOfMonth),
      time: normalizeTime(goals.time, DEFAULT_NOTIFICATION_PREFS.goalReminders.time),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLeadDays(value: unknown): BillReminderLeadDays {
  return value === 0 || value === 1 || value === 3 ? value : DEFAULT_NOTIFICATION_PREFS.billReminders.leadDays;
}

function normalizeWeekday(value: unknown): NotificationWeekday {
  return typeof value === 'number' && value >= 1 && value <= 7
    ? value as NotificationWeekday
    : DEFAULT_NOTIFICATION_PREFS.weeklySummary.weekday;
}

function normalizeDayOfMonth(value: unknown): number {
  return typeof value === 'number' && value >= 1 && value <= 28
    ? Math.round(value)
    : DEFAULT_NOTIFICATION_PREFS.goalReminders.dayOfMonth;
}

function normalizeTime(value: unknown, fallback: NotificationTime): NotificationTime {
  if (!isRecord(value)) return fallback;
  const hour = typeof value.hour === 'number' ? Math.round(value.hour) : fallback.hour;
  const minute = typeof value.minute === 'number' ? Math.round(value.minute) : fallback.minute;
  return {
    hour: Math.max(0, Math.min(23, hour)),
    minute: Math.max(0, Math.min(59, minute)),
  };
}
