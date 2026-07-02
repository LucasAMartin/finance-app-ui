import {
  getActiveLedgerId,
  getCurrentUserId,
  getDb,
  json,
  ledgerParam,
  nextId,
  parseJson,
} from './db';
import { SQLiteRepository } from './base';
import type {
  AutomationImport,
  AutomationImportSource,
  AutomationImportStatus,
  CreateAutomationImportInput,
  UpdateAutomationImportInput,
} from '../types';

interface AutomationImportRow {
  id: string;
  source: string;
  raw_text: string | null;
  amount_hint: number | null;
  merchant_hint: string | null;
  category_hint: string | null;
  occurred_at_hint: string | null;
  card_last4_hint: string | null;
  fingerprint: string;
  status: string;
  attempts: number;
  processed_transaction_id: string | null;
  error: string | null;
  received_at: string;
  ledger_id: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  meta: string | null;
}

function source(value: string): AutomationImportSource {
  return value === 'sms' ? 'sms' : 'wallet';
}

function status(value: string): AutomationImportStatus {
  if (
    value === 'pending' ||
    value === 'processing' ||
    value === 'processed' ||
    value === 'duplicate' ||
    value === 'ignored' ||
    value === 'failed' ||
    value === 'needs_review'
  ) {
    return value;
  }
  return 'pending';
}

function importFromRow(row: AutomationImportRow): AutomationImport {
  return {
    id: row.id,
    source: source(row.source),
    rawText: row.raw_text ?? undefined,
    amountHint: row.amount_hint ?? undefined,
    merchantHint: row.merchant_hint ?? undefined,
    categoryHint: row.category_hint ?? undefined,
    occurredAtHint: row.occurred_at_hint ?? undefined,
    cardLast4Hint: row.card_last4_hint ?? undefined,
    fingerprint: row.fingerprint,
    status: status(row.status),
    attempts: row.attempts,
    processedTransactionId: row.processed_transaction_id ?? undefined,
    error: row.error ?? undefined,
    receivedAt: row.received_at,
    ledgerId: row.ledger_id,
    createdByUserId: row.created_by_user_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: parseJson(row.meta),
  };
}

export class SQLiteAutomationImportsRepo
  extends SQLiteRepository<AutomationImport, CreateAutomationImportInput, UpdateAutomationImportInput> {
  protected readAll(): AutomationImport[] {
    return getDb()
      .getAllSync<AutomationImportRow>(
        `SELECT * FROM automation_imports
         WHERE ledger_id = ?
         ORDER BY received_at DESC, id DESC`,
        ledgerParam(),
      )
      .map(importFromRow);
  }

  listPending(limit = 25): AutomationImport[] {
    return getDb()
      .getAllSync<AutomationImportRow>(
        `SELECT * FROM automation_imports
         WHERE ledger_id = ?
           AND status = 'pending'
         ORDER BY received_at ASC, id ASC
         LIMIT ?`,
        ledgerParam(),
        Math.max(1, Math.min(limit, 100)),
      )
      .map(importFromRow);
  }

  create(input: CreateAutomationImportInput): AutomationImport {
    const now = new Date().toISOString();
    const id = nextId('automation-import');
    const receivedAt = input.receivedAt ?? now;
    getDb().runSync(
      `INSERT OR IGNORE INTO automation_imports (
        id, source, raw_text, amount_hint, merchant_hint, category_hint,
        occurred_at_hint, card_last4_hint, fingerprint, status, attempts,
        processed_transaction_id, error, received_at, ledger_id,
        created_by_user_id, created_at, updated_at, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.source,
      input.rawText ?? null,
      input.amountHint ?? null,
      input.merchantHint ?? null,
      input.categoryHint ?? null,
      input.occurredAtHint ?? null,
      input.cardLast4Hint ?? null,
      input.fingerprint,
      input.status ?? 'pending',
      input.attempts ?? 0,
      input.processedTransactionId ?? null,
      input.error ?? null,
      receivedAt,
      input.ledgerId ?? getActiveLedgerId(),
      input.createdByUserId ?? getCurrentUserId(),
      now,
      now,
      json(input.meta),
    );
    this.emit();
    return this.byFingerprint(input.fingerprint) ?? this.get(id)!;
  }

  update(id: string, patch: UpdateAutomationImportInput): AutomationImport | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    getDb().runSync(
      `UPDATE automation_imports
       SET raw_text = ?, amount_hint = ?, merchant_hint = ?, category_hint = ?,
           occurred_at_hint = ?, card_last4_hint = ?, status = ?, attempts = ?,
           processed_transaction_id = ?, error = ?, received_at = ?,
           ledger_id = ?, created_by_user_id = ?, updated_at = ?, meta = ?
       WHERE id = ?`,
      next.rawText ?? null,
      next.amountHint ?? null,
      next.merchantHint ?? null,
      next.categoryHint ?? null,
      next.occurredAtHint ?? null,
      next.cardLast4Hint ?? null,
      next.status,
      next.attempts,
      next.processedTransactionId ?? null,
      next.error ?? null,
      next.receivedAt,
      next.ledgerId ?? getActiveLedgerId(),
      next.createdByUserId ?? getCurrentUserId(),
      next.updatedAt,
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    const result = getDb().runSync('DELETE FROM automation_imports WHERE id = ?', id);
    if (result.changes > 0) this.emit();
  }

  private byFingerprint(fingerprint: string): AutomationImport | undefined {
    const row = getDb().getFirstSync<AutomationImportRow>(
      'SELECT * FROM automation_imports WHERE fingerprint = ? LIMIT 1',
      fingerprint,
    );
    return row ? importFromRow(row) : undefined;
  }
}
