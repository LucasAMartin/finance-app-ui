// Pure, dependency-free policy for the merchant logo resolver. This module
// holds the URL-safety, eligibility, caching, and cache-entry decisions so they
// can be unit-tested without React Native / Expo. The hook layer in
// `merchantLogos.ts` wires these helpers to the repository and network.
import type { MerchantLogo, MerchantLogoStatus, UpsertMerchantLogoInput } from './repositories/types';

// Direct Logo.dev CDN host. The resolver returns ready-to-render image URLs on
// this host carrying a publishable `pk_...` token; we render them verbatim and
// never proxy, sign, or append params.
export const LOGO_CDN_HOST = 'img.logo.dev';

export const RESOLVED_SOURCE = 'logo-dev-search-logo';
export const RESOLVED_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const ERROR_RETRY_MS = 24 * 60 * 60 * 1000;

const NON_MERCHANT_NAMES = new Set([
  'bill',
  'bills',
  'dining',
  'entertainment',
  'expense',
  'food',
  'gas',
  'groceries',
  'grocery',
  'housing',
  'income',
  'manual expense',
  'note',
  'rent',
  'shopping',
  'subscription',
  'transport',
  'transportation',
  'unknown',
  'utilities',
  'utility',
]);

// Discriminated union matching the resolver's documented response shapes.
export type MerchantLogoResolveResponse =
  | {
      status: 'resolved';
      merchantKey: string;
      domain: string;
      logoUrl: string;
      // Sampled logo tile background (#rrggbb), or null when the logo reads
      // cleanest on the client's default white disc (white/transparent tiles).
      bgColor: string | null;
      lastCheckedAt: string;
      source: 'logo-dev-search-logo';
    }
  | {
      status: 'not_found';
      merchantKey: string;
      retryAfter: string;
      lastCheckedAt: string;
      source: 'logo-dev-search-logo';
    }
  | {
      status: 'error';
      merchantKey: string;
      lastCheckedAt: string;
      source: 'logo-dev-search-logo';
    };

// Tolerant view of the wire payload — runtime is untrusted, so every field is
// optional until validated.
export type ResolveResponse = {
  status: MerchantLogoStatus;
  merchantKey?: string;
  domain?: string;
  logoUrl?: string;
  bgColor?: string | null;
  retryAfter?: string;
  lastCheckedAt?: string;
  source?: string;
};

// Accept only a lowercase-able `#rrggbb` from the server; anything else (null,
// malformed, alpha hex) collapses to null → the client uses the white disc.
export function sanitizeBgColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

export function merchantLogoKey(merchant: string): string {
  return merchant.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isLookupableMerchantName(merchant: string): boolean {
  const key = merchantLogoKey(merchant);
  if (key.length < 2) return false;
  if (NON_MERCHANT_NAMES.has(key)) return false;
  if (!/[a-z0-9]/i.test(key)) return false;
  return true;
}

// The resolver hands back a direct Logo.dev CDN URL. We render it as-is, so the
// only thing we validate is that it is an https image on the Logo.dev host and
// that it never carries a secret key. A publishable `pk_...` token is expected
// and safe in a client image URL; an `sk_...` secret must never appear.
export function isSafeLogoUrl(value?: string): value is string {
  if (!value) return false;
  if (/\bsk_[A-Za-z0-9]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return url.hostname === LOGO_CDN_HOST;
  } catch {
    return false;
  }
}

export function cachedLogoUri(entry?: { meta?: Record<string, unknown> }): string | undefined {
  const value = entry?.meta?.localLogoUri;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.startsWith('file://') ? value : undefined;
}

export function logoAssetRetryAfter(entry?: { meta?: Record<string, unknown> }): string | undefined {
  const value = entry?.meta?.localLogoRetryAfter;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function shouldCacheLogoAsset(entry: MerchantLogo | undefined, now: Date = new Date()): boolean {
  if (!entry || entry.status !== 'resolved' || !isSafeLogoUrl(entry.logoUrl)) return false;
  if (cachedLogoUri(entry)) return false;
  const retryAfter = logoAssetRetryAfter(entry);
  return !retryAfter || new Date(retryAfter).getTime() <= now.getTime();
}

export function renderableLogoUrl(entry: MerchantLogo): string | undefined {
  const localUri = cachedLogoUri(entry);
  if (localUri) return localUri;
  return entry.logoUrl;
}

export function withRenderableLogoUrl(entry: MerchantLogo): MerchantLogo {
  const logoUrl = renderableLogoUrl(entry);
  return logoUrl !== entry.logoUrl ? { ...entry, logoUrl } : entry;
}

// Logo.dev image URLs embed a publishable token in the query string. It is safe
// to render but should not be written to logs verbatim, so strip the query when
// surfacing a URL for diagnostics.
export function redactLogoUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}?…`;
  } catch {
    return '[redacted]';
  }
}

export function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

// Whether a cache entry is stale enough to re-hit the resolver. `resolved`
// entries live for RESOLVED_TTL_MS; `not_found` waits until its server-provided
// retryAfter; `error` backs off until its computed retryAfter.
export function shouldResolve(entry: MerchantLogo | undefined, now: Date = new Date()): boolean {
  if (!entry) return true;
  if (entry.status === 'resolved') {
    return !entry.logoUrl || now.getTime() - new Date(entry.lastCheckedAt).getTime() > RESOLVED_TTL_MS;
  }
  if (entry.retryAfter) {
    return new Date(entry.retryAfter).getTime() <= now.getTime();
  }
  return entry.status === 'error';
}

export function isExpired(entry: MerchantLogo, now: Date = new Date()): boolean {
  return now.getTime() - new Date(entry.lastCheckedAt).getTime() > RESOLVED_TTL_MS;
}

// Translate a resolver response into the cache row to persist. Pure so the
// resolved / not_found / error branches can be exercised directly in tests.
export function planLogoEntry(
  merchant: string,
  key: string,
  data: ResolveResponse,
  current: MerchantLogo | undefined,
  nowIso: string,
): UpsertMerchantLogoInput {
  const checkedAt = data.lastCheckedAt ?? nowIso;
  const status = data.status;
  const resolvedLogo = status === 'resolved' && isSafeLogoUrl(data.logoUrl);
  return {
    id: key,
    merchantKey: key,
    displayName: merchant.trim(),
    domain: resolvedLogo ? data.domain : undefined,
    logoUrl: resolvedLogo ? data.logoUrl : undefined,
    bgColor: resolvedLogo ? sanitizeBgColor(data.bgColor) : undefined,
    status: resolvedLogo ? 'resolved' : status === 'not_found' ? 'not_found' : 'error',
    source: data.source ?? RESOLVED_SOURCE,
    lastCheckedAt: checkedAt,
    retryAfter: status === 'not_found'
      ? data.retryAfter
      : status === 'error' || !resolvedLogo
        ? addMs(checkedAt, ERROR_RETRY_MS)
        : undefined,
    failureCount: status === 'resolved' && resolvedLogo ? 0 : (current?.failureCount ?? 0) + 1,
    meta: data.merchantKey && data.merchantKey !== key ? { providerMerchantKey: data.merchantKey } : undefined,
  };
}
