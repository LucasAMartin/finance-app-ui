import { canEditRecord, getDb, json, parseJson } from '../repositories/sqlite/db';
import type { SQLiteDatabaseLike } from '../repositories/sqlite/driver';
import type { SyncConflict, SyncRecord, SyncRecordStore, SyncRecordType } from './syncEngine';

export type SQLiteSyncFieldKind = 'text' | 'number' | 'boolean' | 'json';

export interface SQLiteSyncFieldMapping {
  field: string;
  column: string;
  kind?: SQLiteSyncFieldKind;
  defaultValue?: unknown;
}

export interface SQLiteSyncTableAdapter {
  recordType: SyncRecordType;
  tableName: string;
  ledgerColumn?: string | null;
  fields: SQLiteSyncFieldMapping[];
  fallbackLedgerId?: (row: SyncRow) => string;
}

type SyncRow = Record<string, unknown>;

const localLedgerMetaKeys = new Set([
  'cloudDatabaseScope',
  'cloudOwnerName',
  'cloudZoneName',
  'cloudShareRecordName',
  'cloudShareUrl',
  'cloudShareAcceptedAt',
  'cloudParticipantPermission',
]);

const dateOnly = (value: string) => value.slice(0, 10);
const monthOnly = (value: string) => value.slice(0, 7);

export const sqliteSyncRegistry: SQLiteSyncTableAdapter[] = [
  {
    recordType: 'ledger',
    tableName: 'ledgers',
    ledgerColumn: null,
    fallbackLedgerId: row => String(row.id),
    fields: [
      { field: 'name', column: 'name', defaultValue: 'Shared finances' },
      { field: 'ownerUserId', column: 'owner_user_id', defaultValue: 'alex' },
      { field: 'active', column: 'active', kind: 'boolean', defaultValue: true },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'ledgerMember',
    tableName: 'ledger_members',
    fields: [
      { field: 'userId', column: 'user_id', defaultValue: 'unknown' },
      { field: 'displayName', column: 'display_name', defaultValue: 'Member' },
      { field: 'role', column: 'role', defaultValue: 'member' },
      { field: 'status', column: 'status', defaultValue: 'active' },
      { field: 'allowOthersToEditMyItems', column: 'allow_others_to_edit_my_items', kind: 'boolean', defaultValue: true },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'transaction',
    tableName: 'transactions',
    fields: [
      { field: 'type', column: 'type', defaultValue: 'expense' },
      { field: 'amount', column: 'amount', kind: 'number', defaultValue: 0 },
      { field: 'merchant', column: 'merchant', defaultValue: 'Unknown' },
      { field: 'cat', column: 'category', defaultValue: 'shopping' },
      { field: 'occurredAt', column: 'occurred_at', defaultValue: (record: SyncRecord) => record.updatedAt },
      { field: 'note', column: 'note' },
      { field: 'recurring', column: 'recurring', kind: 'boolean', defaultValue: false },
      { field: 'recurringRuleId', column: 'recurring_rule_id' },
      { field: 'visibility', column: 'visibility', defaultValue: 'shared' },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'income',
    tableName: 'incomes',
    fields: [
      { field: 'kind', column: 'kind', defaultValue: 'regular' },
      { field: 'amount', column: 'amount', kind: 'number', defaultValue: 0 },
      { field: 'source', column: 'source', defaultValue: 'Unknown' },
      { field: 'cadence', column: 'cadence', defaultValue: 'monthly' },
      { field: 'startDate', column: 'start_date', defaultValue: (record: SyncRecord) => dateOnly(record.updatedAt) },
      { field: 'endDate', column: 'end_date' },
      { field: 'receivedAt', column: 'received_at' },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'category',
    tableName: 'categories',
    fields: [
      { field: 'label', column: 'label', defaultValue: 'Unknown' },
      { field: 'icon', column: 'icon', defaultValue: 'tag' },
      { field: 'group', column: 'group_key', defaultValue: 'needs' },
      { field: 'defaultBudget', column: 'default_budget', kind: 'number', defaultValue: 0 },
      { field: 'sortOrder', column: 'sort_order', kind: 'number', defaultValue: 0 },
      { field: 'archived', column: 'archived', kind: 'boolean', defaultValue: false },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'budget',
    tableName: 'budgets',
    fields: [
      { field: 'month', column: 'month', defaultValue: (record: SyncRecord) => monthOnly(record.updatedAt) },
      { field: 'group', column: 'group_key' },
      { field: 'category', column: 'category' },
      { field: 'label', column: 'label' },
      { field: 'icon', column: 'icon' },
      { field: 'amount', column: 'amount', kind: 'number', defaultValue: 0 },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'recurringRule',
    tableName: 'recurring_rules',
    fields: [
      { field: 'merchant', column: 'merchant', defaultValue: 'Unknown' },
      { field: 'cat', column: 'category', defaultValue: 'shopping' },
      { field: 'amount', column: 'amount', kind: 'number', defaultValue: 0 },
      { field: 'cadence', column: 'cadence', defaultValue: 'monthly' },
      { field: 'startDate', column: 'start_date', defaultValue: (record: SyncRecord) => dateOnly(record.updatedAt) },
      { field: 'nextDueDate', column: 'next_due_date', defaultValue: (record: SyncRecord) => record.updatedAt },
      { field: 'dayOfMonth', column: 'day_of_month', kind: 'number' },
      { field: 'monthOfYear', column: 'month_of_year', kind: 'number' },
      { field: 'estimate', column: 'estimate', kind: 'boolean', defaultValue: false },
      { field: 'active', column: 'active', kind: 'boolean', defaultValue: true },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'bill',
    tableName: 'bills',
    fields: [
      { field: 'amount', column: 'amount', kind: 'number', defaultValue: 0 },
      { field: 'merchant', column: 'merchant', defaultValue: 'Unknown' },
      { field: 'name', column: 'name', defaultValue: 'Unknown' },
      { field: 'icon', column: 'icon', defaultValue: 'tag' },
      { field: 'cat', column: 'category', defaultValue: 'shopping' },
      { field: 'dueDate', column: 'due_date', defaultValue: '' },
      { field: 'recurring', column: 'recurring', kind: 'boolean', defaultValue: true },
      { field: 'daysUntil', column: 'days_until', kind: 'number', defaultValue: 0 },
      { field: 'estimate', column: 'estimate', kind: 'boolean', defaultValue: false },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
  {
    recordType: 'attachment',
    tableName: 'attachments',
    fields: [
      { field: 'transactionId', column: 'transaction_id', defaultValue: '' },
      { field: 'localUri', column: 'local_uri', defaultValue: '' },
      { field: 'type', column: 'type', defaultValue: 'receipt' },
      { field: 'createdAt', column: 'created_at', defaultValue: (record: SyncRecord) => record.createdAt ?? record.updatedAt },
      { field: 'cloudAssetId', column: 'cloud_asset_id' },
      { field: 'meta', column: 'meta', kind: 'json' },
    ],
  },
];

function adapterFor(type: SyncRecordType): SQLiteSyncTableAdapter {
  const adapter = sqliteSyncRegistry.find(item => item.recordType === type);
  if (!adapter) throw new Error(`No SQLite sync adapter registered for ${type}`);
  return adapter;
}

function allRecordColumns(adapter: SQLiteSyncTableAdapter): string[] {
  return [...new Set([
    'id',
    ...adapter.fields.map(field => field.column),
    ...(adapter.ledgerColumn === null ? [] : [adapter.ledgerColumn ?? 'ledger_id']),
    'created_by_user_id',
    'updated_by_user_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'cloud_record_name',
    'cloud_zone_name',
    'record_change_tag',
    'sync_status',
  ])];
}

function encodeField(value: unknown, kind: SQLiteSyncFieldKind = 'text'): unknown {
  if (value === undefined) return null;
  if (kind === 'boolean') return value ? 1 : 0;
  if (kind === 'number') return typeof value === 'number' ? value : Number(value ?? 0);
  if (kind === 'json') return value && typeof value === 'object' ? JSON.stringify(value) : null;
  return value ?? null;
}

function decodeField(value: unknown, kind: SQLiteSyncFieldKind = 'text'): unknown {
  if (value === null || value === undefined) return undefined;
  if (kind === 'boolean') return Boolean(value);
  if (kind === 'number') return Number(value);
  if (kind === 'json') return typeof value === 'string' ? parseJson(value) : undefined;
  return value;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') return objectRecord(parseJson(value));
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stripLocalLedgerMeta(meta: unknown): Record<string, unknown> | undefined {
  const source = objectRecord(meta);
  if (!source) return undefined;
  const next = { ...source };
  localLedgerMetaKeys.forEach(key => {
    delete next[key];
  });
  return Object.keys(next).length > 0 ? next : undefined;
}

function mergeLocalLedgerMeta(remoteMeta: unknown, localMeta: unknown): Record<string, unknown> | undefined {
  const next = stripLocalLedgerMeta(remoteMeta) ?? {};
  const local = objectRecord(localMeta);
  localLedgerMetaKeys.forEach(key => {
    if (local && Object.prototype.hasOwnProperty.call(local, key)) {
      next[key] = local[key];
    }
  });
  return Object.keys(next).length > 0 ? next : undefined;
}

function fieldDefault(field: SQLiteSyncFieldMapping, record: SyncRecord): unknown {
  if (typeof field.defaultValue === 'function') {
    return (field.defaultValue as (record: SyncRecord) => unknown)(record);
  }
  return field.defaultValue;
}

function rowLedgerId(adapter: SQLiteSyncTableAdapter, row: SyncRow): string {
  if (adapter.ledgerColumn === null) {
    return adapter.fallbackLedgerId?.(row) ?? String(row.id);
  }
  return String(row[adapter.ledgerColumn ?? 'ledger_id']);
}

function rowToRecord(adapter: SQLiteSyncTableAdapter, row: SyncRow): SyncRecord {
  const fields: Record<string, unknown> = {};
  adapter.fields.forEach(field => {
    let value = decodeField(row[field.column], field.kind);
    if (adapter.recordType === 'ledger' && field.field === 'meta') {
      value = stripLocalLedgerMeta(value);
    }
    if (value !== undefined) fields[field.field] = value;
  });
  return {
    recordName: String(row.cloud_record_name ?? row.id),
    recordType: adapter.recordType,
    zoneName: String(row.cloud_zone_name ?? `zone-${rowLedgerId(adapter, row)}`),
    ledgerId: rowLedgerId(adapter, row),
    fields,
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : undefined,
    updatedByUserId: row.updated_by_user_id ? String(row.updated_by_user_id) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
    recordChangeTag: row.record_change_tag ? String(row.record_change_tag) : undefined,
    syncStatus: row.sync_status as SyncRecord['syncStatus'],
  };
}

export class SQLiteSyncStore implements SyncRecordStore {
  constructor(
    private database: SQLiteDatabaseLike = getDb(),
    private registry: SQLiteSyncTableAdapter[] = sqliteSyncRegistry,
  ) {}

  getChangeToken(zoneName: string): string | undefined {
    return this.database.getFirstSync<{ change_token: string | null }>(
      'SELECT change_token FROM sync_state WHERE zone_name = ?',
      zoneName,
    )?.change_token ?? undefined;
  }

  setChangeToken(zoneName: string, token?: string): void {
    this.database.runSync(
      `INSERT INTO sync_state (zone_name, change_token, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(zone_name) DO UPDATE SET change_token = excluded.change_token, updated_at = excluded.updated_at`,
      zoneName,
      token ?? null,
      new Date().toISOString(),
    );
  }

  getRecord(recordName: string): SyncRecord | undefined {
    for (const adapter of this.registry) {
      const row = this.findRow(adapter, recordName);
      if (row) return rowToRecord(adapter, row);
    }
    return undefined;
  }

  listPendingRecords(ledgerId: string): SyncRecord[] {
    return this.registry.flatMap(adapter => {
      const ledgerSql = adapter.ledgerColumn === null
        ? 'id = ?'
        : `${adapter.ledgerColumn ?? 'ledger_id'} = ?`;
      return this.database
        .getAllSync<SyncRow>(
          `SELECT * FROM ${adapter.tableName} WHERE ${ledgerSql} AND sync_status IN ('pending', 'local')`,
          ledgerId,
        )
        .map(row => rowToRecord(adapter, row));
    });
  }

  applyRemoteRecord(record: SyncRecord): void {
    const adapter = adapterFor(record.recordType);
    const current = this.findRow(adapter, record.recordName);
    if (record.recordType === 'ledger' && shouldApplyLedgerReset(record, current)) {
      clearLedgerRowsForReset(this.database, record.ledgerId);
    }
    const id = String(current?.id ?? record.fields.id ?? record.recordName);
    const columns = allRecordColumns(adapter);
    const values = columns.map(column => this.valueForColumn(adapter, record, column, current, id, 'synced'));
    const updates = columns
      .filter(column => column !== 'id')
      .map(column => `${column} = excluded.${column}`)
      .join(', ');
    this.database.runSync(
      `INSERT INTO ${adapter.tableName} (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
      ...values,
    );
  }

  markSynced(record: SyncRecord): void {
    const adapter = adapterFor(record.recordType);
    this.database.runSync(
      `UPDATE ${adapter.tableName}
       SET cloud_record_name = ?, cloud_zone_name = ?, record_change_tag = ?,
           sync_status = 'synced', updated_at = ?, deleted_at = ?
       WHERE cloud_record_name = ? OR id = ?`,
      record.recordName,
      record.zoneName,
      record.recordChangeTag ?? null,
      record.updatedAt,
      record.deletedAt ?? null,
      record.recordName,
      record.recordName,
    );
  }

  markConflicted(conflict: SyncConflict): void {
    const adapter = adapterFor(conflict.local.recordType);
    const current = this.findRow(adapter, conflict.local.recordName);
    const meta = {
      ...(parseJson(typeof current?.meta === 'string' ? current.meta : null) ?? {}),
      syncConflictReason: conflict.reason,
      remoteRecordChangeTag: conflict.remote?.recordChangeTag,
    };
    this.database.runSync(
      `UPDATE ${adapter.tableName}
       SET sync_status = 'conflicted', meta = ?
       WHERE cloud_record_name = ? OR id = ?`,
      json(meta),
      conflict.local.recordName,
      conflict.local.recordName,
    );
  }

  canPushRecord(record: SyncRecord): boolean {
    return canEditRecord(record.createdByUserId, record.ledgerId);
  }

  private findRow(adapter: SQLiteSyncTableAdapter, recordName: string): SyncRow | null {
    return this.database.getFirstSync<SyncRow>(
      `SELECT * FROM ${adapter.tableName} WHERE cloud_record_name = ? OR id = ? LIMIT 1`,
      recordName,
      recordName,
    );
  }

  private valueForColumn(
    adapter: SQLiteSyncTableAdapter,
    record: SyncRecord,
    column: string,
    current: SyncRow | null,
    id: string,
    syncStatus: SyncRecord['syncStatus'],
  ): unknown {
    if (column === 'id') return id;
    if (adapter.ledgerColumn !== null && column === (adapter.ledgerColumn ?? 'ledger_id')) return record.ledgerId;
    if (column === 'created_by_user_id') return record.createdByUserId ?? current?.created_by_user_id ?? null;
    if (column === 'updated_by_user_id') return record.updatedByUserId ?? current?.updated_by_user_id ?? null;
    if (column === 'created_at') return record.createdAt ?? current?.created_at ?? record.updatedAt;
    if (column === 'updated_at') return record.updatedAt;
    if (column === 'deleted_at') return record.deletedAt ?? null;
    if (column === 'cloud_record_name') return record.recordName;
    if (column === 'cloud_zone_name') return record.zoneName;
    if (column === 'record_change_tag') return record.recordChangeTag ?? null;
    if (column === 'sync_status') return syncStatus;

    const field = adapter.fields.find(item => item.column === column);
    if (!field) return current?.[column] ?? null;
    const nextValue = Object.prototype.hasOwnProperty.call(record.fields, field.field)
      ? record.fields[field.field]
      : current?.[column] ?? fieldDefault(field, record);
    if (adapter.recordType === 'ledger' && field.field === 'meta') {
      const currentMeta = typeof current?.[column] === 'string' ? parseJson(current[column] as string) : current?.[column];
      return encodeField(mergeLocalLedgerMeta(nextValue, currentMeta), field.kind);
    }
    return encodeField(nextValue, field.kind);
  }
}

function shouldApplyLedgerReset(record: SyncRecord, current: SyncRow | null): boolean {
  const incomingResetId = resetIdFromMeta(record.fields.meta);
  if (!incomingResetId) return false;
  const currentMeta = parseJson(typeof current?.meta === 'string' ? current.meta : null);
  return resetIdFromMeta(currentMeta) !== incomingResetId;
}

function resetIdFromMeta(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const resetId = (meta as { cloudResetId?: unknown }).cloudResetId;
  return typeof resetId === 'string' && resetId.length > 0 ? resetId : undefined;
}

function clearLedgerRowsForReset(database: SQLiteDatabaseLike, ledgerId: string): void {
  database.runSync('DELETE FROM attachments WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM transactions WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM incomes WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM budgets WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM bills WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM recurring_rules WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM categories WHERE ledger_id = ?', ledgerId);
  database.runSync('DELETE FROM ledger_members WHERE ledger_id = ?', ledgerId);
}
