import { useEffect } from 'react';
import { useRepositories, useRepositoryItem } from './repositories/RepositoryProvider';
import type { MerchantLogo, MerchantLogosRepo, MerchantLogoStatus } from './repositories/types';

const ENDPOINT = process.env.EXPO_PUBLIC_MERCHANT_LOGO_ENDPOINT
  ?? 'https://logo-api-ten.vercel.app/api/merchant-logo/resolve';
const APP_KEY = process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY;
const COUNTRY_CODE = (process.env.EXPO_PUBLIC_MERCHANT_LOGO_COUNTRY_CODE ?? 'US').trim().toUpperCase();
const ENDPOINT_ORIGIN = new URL(ENDPOINT).origin;

const RESOLVED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 24 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<void>>();

type ResolveResponse = {
  status: MerchantLogoStatus;
  merchantKey?: string;
  domain?: string;
  logoUrl?: string;
  retryAfter?: string;
  lastCheckedAt?: string;
  source?: string;
};

export function merchantLogoKey(merchant: string): string {
  return merchant.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isSafeLogoUrl(value?: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.origin !== ENDPOINT_ORIGIN) return false;
    // Any Brandfetch URL, or any URL carrying a `c` query parameter, is treated
    // as credential-bearing. Never cache or render it.
    if (url.hostname.includes('brandfetch.io')) return false;
    if (url.searchParams.has('c')) return false;
    if (url.pathname.startsWith('/api/merchant-logo/image/')) {
      return url.searchParams.has('exp')
        && url.searchParams.has('token')
        && url.searchParams.has('sig');
    }
    return true;
  } catch {
    return false;
  }
}

function addMs(iso: string, ms: number) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function shouldResolve(entry: MerchantLogo | undefined, now = new Date()): boolean {
  if (!entry) return true;
  if (entry.status === 'resolved') {
    return !entry.logoUrl || now.getTime() - new Date(entry.lastCheckedAt).getTime() > RESOLVED_TTL_MS;
  }
  if (entry.retryAfter) {
    return new Date(entry.retryAfter).getTime() <= now.getTime();
  }
  return entry.status === 'error';
}

function isExpired(entry: MerchantLogo, now = new Date()): boolean {
  return now.getTime() - new Date(entry.lastCheckedAt).getTime() > RESOLVED_TTL_MS;
}

async function fetchMerchantLogo(merchant: string): Promise<ResolveResponse> {
  if (!APP_KEY) throw new Error('merchant_logo_key_missing');
  const body: { merchant: string; countryCode?: string } = { merchant };
  if (/^[A-Z]{2}$/.test(COUNTRY_CODE)) body.countryCode = COUNTRY_CODE;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-key': APP_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'merchant_logo_request_failed');
  }
  return data;
}

async function resolveAndCacheMerchantLogo(
  merchant: string,
  repo: MerchantLogosRepo,
  current?: MerchantLogo,
) {
  const key = merchantLogoKey(merchant);
  if (!key || !APP_KEY || !shouldResolve(current) || inflight.has(key)) return;

  const task = (async () => {
    const now = new Date().toISOString();
    try {
      const data = await fetchMerchantLogo(merchant);
      const checkedAt = data.lastCheckedAt ?? now;
      const status = data.status;
      const resolvedLogo = status === 'resolved' && isSafeLogoUrl(data.logoUrl);
      repo.create({
        id: key,
        merchantKey: key,
        displayName: merchant.trim(),
        domain: resolvedLogo ? data.domain : undefined,
        logoUrl: resolvedLogo ? data.logoUrl : undefined,
        status: resolvedLogo ? 'resolved' : status === 'not_found' ? 'not_found' : 'error',
        source: data.source,
        lastCheckedAt: checkedAt,
        retryAfter: status === 'not_found'
          ? data.retryAfter
          : status === 'error' || !resolvedLogo
            ? addMs(checkedAt, ERROR_RETRY_MS)
            : undefined,
        failureCount: status === 'resolved' && resolvedLogo ? 0 : (current?.failureCount ?? 0) + 1,
        meta: data.merchantKey && data.merchantKey !== key ? { providerMerchantKey: data.merchantKey } : undefined,
      });
    } catch (err) {
      repo.create({
        id: key,
        merchantKey: key,
        displayName: merchant.trim(),
        status: 'error',
        source: 'brandfetch-search-logo',
        lastCheckedAt: now,
        retryAfter: addMs(now, ERROR_RETRY_MS),
        failureCount: (current?.failureCount ?? 0) + 1,
        meta: { error: err instanceof Error ? err.message : 'merchant_logo_request_failed' },
      });
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
}

export function useMerchantLogo(merchant: string): MerchantLogo | undefined {
  const { merchantLogosRepo } = useRepositories();
  const key = merchantLogoKey(merchant);
  const entry = useRepositoryItem(merchantLogosRepo, key);

  useEffect(() => {
    if (entry?.logoUrl && !isSafeLogoUrl(entry.logoUrl)) {
      merchantLogosRepo.create({
        id: key,
        merchantKey: key,
        displayName: merchant.trim(),
        status: 'error',
        source: entry.source ?? 'brandfetch-search-logo',
        lastCheckedAt: new Date().toISOString(),
        retryAfter: addMs(new Date().toISOString(), ERROR_RETRY_MS),
        failureCount: entry.failureCount + 1,
        meta: { error: 'unsafe_logo_url_rejected' },
      });
      return;
    }
    resolveAndCacheMerchantLogo(merchant, merchantLogosRepo, entry).catch(() => {});
  }, [entry, key, merchant, merchantLogosRepo]);

  if (entry?.status === 'resolved' && isSafeLogoUrl(entry.logoUrl) && !isExpired(entry)) return entry;
  return undefined;
}

export function useInvalidateMerchantLogo() {
  const { merchantLogosRepo } = useRepositories();
  return (merchant: string) => {
    const key = merchantLogoKey(merchant);
    if (key) merchantLogosRepo.delete(key);
  };
}
