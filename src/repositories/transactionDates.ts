import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from './types';
import { parseJson } from './json';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function deriveTransactionDisplay(occurredAt: string, now = new Date()) {
  const d = new Date(occurredAt);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  const when: Transaction['when'] = days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'earlier';
  const date = when === 'today' ? 'Today' : when === 'yesterday' ? 'Yesterday' : `${MONTHS[d.getMonth()]} ${d.getDate()}`;

  return {
    date,
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    when,
    fullDate: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
  };
}

export function transactionFromStored(row: {
  id: string;
  merchant: string;
  cat: string;
  amount: number;
  type?: Transaction['type'] | null;
  note?: string | null;
  occurredAt: string;
  recurring?: number | boolean | null;
  recurringRuleId?: string | null;
  visibility?: Transaction['visibility'] | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  ledgerId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  cloudRecordName?: string | null;
  cloudZoneName?: string | null;
  recordChangeTag?: string | null;
  syncStatus?: Transaction['syncStatus'] | null;
  meta?: string | null;
}): Transaction {
  return {
    id: row.id,
    merchant: row.merchant,
    cat: row.cat,
    amount: row.amount,
    type: row.type ?? 'expense',
    note: row.note ?? '',
    occurredAt: row.occurredAt,
    recurring: Boolean(row.recurring),
    recurringRuleId: row.recurringRuleId ?? undefined,
    visibility: row.visibility ?? 'shared',
    createdByUserId: row.createdByUserId ?? undefined,
    updatedByUserId: row.updatedByUserId ?? undefined,
    ledgerId: row.ledgerId ?? undefined,
    createdAt: row.createdAt ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
    deletedAt: row.deletedAt ?? undefined,
    cloudRecordName: row.cloudRecordName ?? undefined,
    cloudZoneName: row.cloudZoneName ?? undefined,
    recordChangeTag: row.recordChangeTag ?? undefined,
    syncStatus: row.syncStatus ?? 'local',
    meta: parseJson(row.meta ?? null),
    ...deriveTransactionDisplay(row.occurredAt),
  };
}

export function normalizeTransactionInput(input: CreateTransactionInput | UpdateTransactionInput) {
  return {
    merchant: input.merchant?.trim() ?? undefined,
    cat: input.cat,
    amount: input.amount,
    type: input.type,
    note: input.note?.trim() ?? '',
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    recurring: input.recurring ?? false,
    recurringRuleId: input.recurringRuleId,
    visibility: input.visibility,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.updatedByUserId,
    ledgerId: input.ledgerId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    deletedAt: input.deletedAt,
    cloudRecordName: input.cloudRecordName,
    cloudZoneName: input.cloudZoneName,
    recordChangeTag: input.recordChangeTag,
    syncStatus: input.syncStatus,
    meta: input.meta,
  };
}

export function shiftedSeedDate(seed: Transaction): string {
  if (!seed.occurredAt) return new Date().toISOString();
  const originalAnchor = new Date('2026-05-13T12:00:00-07:00');
  const seedDate = new Date(seed.occurredAt);
  const offsetDays = Math.round((startOfDay(originalAnchor).getTime() - startOfDay(seedDate).getTime()) / 86_400_000);
  const next = new Date();
  next.setDate(next.getDate() - offsetDays);

  const time = new Date(seed.occurredAt);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return next.toISOString();
}
