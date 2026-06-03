import { getDb, json } from './db';
import { SQLiteRepository } from './base';
import type { MerchantLogo, UpsertMerchantLogoInput } from '../types';

interface MerchantLogoRow {
  merchant_key: string;
  display_name: string | null;
  domain: string | null;
  logo_url: string | null;
  bg_color: string | null;
  status: MerchantLogo['status'];
  source: string | null;
  last_checked_at: string;
  retry_after: string | null;
  failure_count: number;
  meta: string | null;
}

const fromRow = (row: MerchantLogoRow): MerchantLogo => ({
  id: row.merchant_key,
  merchantKey: row.merchant_key,
  displayName: row.display_name ?? undefined,
  domain: row.domain ?? undefined,
  logoUrl: row.logo_url ?? undefined,
  bgColor: row.bg_color,
  status: row.status,
  source: row.source ?? undefined,
  lastCheckedAt: row.last_checked_at,
  retryAfter: row.retry_after ?? undefined,
  failureCount: row.failure_count,
  meta: row.meta ? JSON.parse(row.meta) : undefined,
});

export class SQLiteMerchantLogosRepo extends SQLiteRepository<MerchantLogo, UpsertMerchantLogoInput, Partial<UpsertMerchantLogoInput>> {
  protected readAll(): MerchantLogo[] {
    return getDb()
      .getAllSync<MerchantLogoRow>('SELECT * FROM merchant_logos ORDER BY merchant_key ASC')
      .map(fromRow);
  }

  create(input: UpsertMerchantLogoInput): MerchantLogo {
    getDb().runSync(
      'INSERT OR REPLACE INTO merchant_logos (merchant_key, display_name, domain, logo_url, bg_color, status, source, last_checked_at, retry_after, failure_count, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      input.merchantKey,
      input.displayName ?? null,
      input.domain ?? null,
      input.logoUrl ?? null,
      input.bgColor ?? null,
      input.status,
      input.source ?? null,
      input.lastCheckedAt,
      input.retryAfter ?? null,
      input.failureCount ?? 0,
      json(input.meta),
    );
    this.emit();
    return this.get(input.merchantKey)!;
  }

  update(id: string, patch: Partial<UpsertMerchantLogoInput>): MerchantLogo | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    return this.create({
      id,
      merchantKey: patch.merchantKey ?? current.merchantKey,
      displayName: patch.displayName ?? current.displayName,
      domain: patch.domain ?? current.domain,
      logoUrl: patch.logoUrl ?? current.logoUrl,
      bgColor: patch.bgColor !== undefined ? patch.bgColor : current.bgColor,
      status: patch.status ?? current.status,
      source: patch.source ?? current.source,
      lastCheckedAt: patch.lastCheckedAt ?? current.lastCheckedAt,
      retryAfter: patch.retryAfter ?? current.retryAfter,
      failureCount: patch.failureCount ?? current.failureCount,
      meta: patch.meta ?? current.meta,
    });
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM merchant_logos WHERE merchant_key = ?', id);
    this.emit();
  }
}
