import { useEffect, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { useRepositories, useRepositoryItem, useRepositoryList } from './repositories/RepositoryProvider';
import type { MerchantLogo, MerchantLogosRepo, Transaction } from './repositories/types';
import {
  ERROR_RETRY_MS,
  RESOLVED_SOURCE,
  addMs,
  isExpired,
  isLookupableMerchantName,
  isSafeLogoUrl,
  merchantLogoKey,
  planLogoEntry,
  shouldResolve,
  type ResolveResponse,
} from './merchantLogoPolicy';

export {
  isLookupableMerchantName,
  isSafeLogoUrl,
  merchantLogoKey,
  redactLogoUrl,
  type MerchantLogoResolveResponse,
} from './merchantLogoPolicy';

const ENDPOINT = process.env.EXPO_PUBLIC_MERCHANT_LOGO_ENDPOINT
  ?? 'https://logo-api-ten.vercel.app/api/merchant-logo/resolve';
const APP_KEY = process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY;
const COUNTRY_CODE = (process.env.EXPO_PUBLIC_MERCHANT_LOGO_COUNTRY_CODE ?? 'US').trim().toUpperCase();

const inflight = new Map<string, Promise<void>>();

export function transactionUsesMerchantLogo(tx: Transaction): boolean {
  if (tx.meta?.kind === 'goal-contribution') return false;
  const source = tx.meta?.merchantSource;
  if (source === 'fallback' || source === 'note') return false;
  return isLookupableMerchantName(tx.merchant);
}

async function fetchMerchantLogo(merchant: string): Promise<ResolveResponse> {
  if (!APP_KEY) throw new Error('merchant_logo_key_missing');
  // The resolver country-ranks results server-side, so US merchants always send
  // countryCode: "US". Keep the body minimal and compatible with the resolver.
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
    // 401 (bad x-app-key), 422 (invalid merchant/countryCode), 429 (rate limit).
    throw new Error(data?.error ?? `merchant_logo_request_failed_${res.status}`);
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
      repo.create(planLogoEntry(merchant, key, data, current, now));
    } catch (err) {
      // Network/HTTP failure: short backoff so we retry within ERROR_RETRY_MS.
      // Never log the resolved URL (it carries the publishable token); only the
      // error message is recorded.
      repo.create({
        id: key,
        merchantKey: key,
        displayName: merchant.trim(),
        status: 'error',
        source: RESOLVED_SOURCE,
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

export function useMerchantLogo(merchant: string, enabled = true): MerchantLogo | undefined {
  const { merchantLogosRepo } = useRepositories();
  const canLookup = enabled && isLookupableMerchantName(merchant);
  const key = canLookup ? merchantLogoKey(merchant) : '';
  const entry = useRepositoryItem(merchantLogosRepo, key);

  useEffect(() => {
    if (!canLookup || !key) return;
    const task = InteractionManager.runAfterInteractions(() => {
      // Migration: any previously cached URL that is no longer a safe Logo.dev
      // CDN URL is invalidated only after the first interactive frame.
      if (entry?.logoUrl && !isSafeLogoUrl(entry.logoUrl)) {
        merchantLogosRepo.create({
          id: key,
          merchantKey: key,
          displayName: merchant.trim(),
          status: 'error',
          source: entry.source ?? RESOLVED_SOURCE,
          lastCheckedAt: new Date().toISOString(),
          retryAfter: addMs(new Date().toISOString(), ERROR_RETRY_MS),
          failureCount: entry.failureCount + 1,
          meta: { error: 'unsafe_logo_url_rejected' },
        });
        return;
      }
      resolveAndCacheMerchantLogo(merchant, merchantLogosRepo, entry).catch(() => {});
    });
    return () => task.cancel();
  }, [canLookup, entry, key, merchant, merchantLogosRepo]);

  if (canLookup && entry?.status === 'resolved' && isSafeLogoUrl(entry.logoUrl) && !isExpired(entry)) return entry;
  return undefined;
}

export function useMerchantLogoMap(transactions: Transaction[], enabled = true): Map<string, MerchantLogo> {
  const { merchantLogosRepo } = useRepositories();
  const entries = useRepositoryList(merchantLogosRepo);

  const entriesByKey = useMemo(() => {
    const next = new Map<string, MerchantLogo>();
    entries.forEach(entry => next.set(entry.merchantKey, entry));
    return next;
  }, [entries]);

  useEffect(() => {
    if (!enabled) return;

    const task = InteractionManager.runAfterInteractions(() => {
      const seen = new Set<string>();
      transactions.forEach(tx => {
        if (!transactionUsesMerchantLogo(tx)) return;
        const key = merchantLogoKey(tx.merchant);
        if (!key || seen.has(key)) return;
        seen.add(key);

        const entry = entriesByKey.get(key);
        if (entry?.logoUrl && !isSafeLogoUrl(entry.logoUrl)) {
          merchantLogosRepo.create({
            id: key,
            merchantKey: key,
            displayName: tx.merchant.trim(),
            status: 'error',
            source: entry.source ?? RESOLVED_SOURCE,
            lastCheckedAt: new Date().toISOString(),
            retryAfter: addMs(new Date().toISOString(), ERROR_RETRY_MS),
            failureCount: entry.failureCount + 1,
            meta: { error: 'unsafe_logo_url_rejected' },
          });
          return;
        }

        resolveAndCacheMerchantLogo(tx.merchant, merchantLogosRepo, entry).catch(() => {});
      });
    });
    return () => task.cancel();
  }, [enabled, entriesByKey, merchantLogosRepo, transactions]);

  return useMemo(() => {
    const next = new Map<string, MerchantLogo>();
    entries.forEach(entry => {
      if (entry.status === 'resolved' && isSafeLogoUrl(entry.logoUrl) && !isExpired(entry)) {
        next.set(entry.merchantKey, entry);
      }
    });
    return next;
  }, [entries]);
}

export function useMerchantLogoMapForMerchants(merchants: string[], enabled = true): Map<string, MerchantLogo> {
  const { merchantLogosRepo } = useRepositories();
  const entries = useRepositoryList(merchantLogosRepo);

  const entriesByKey = useMemo(() => {
    const next = new Map<string, MerchantLogo>();
    entries.forEach(entry => next.set(entry.merchantKey, entry));
    return next;
  }, [entries]);

  useEffect(() => {
    if (!enabled) return;

    const task = InteractionManager.runAfterInteractions(() => {
      const seen = new Set<string>();
      merchants.forEach(merchant => {
        if (!isLookupableMerchantName(merchant)) return;
        const key = merchantLogoKey(merchant);
        if (!key || seen.has(key)) return;
        seen.add(key);

        const entry = entriesByKey.get(key);
        if (entry?.logoUrl && !isSafeLogoUrl(entry.logoUrl)) {
          merchantLogosRepo.create({
            id: key,
            merchantKey: key,
            displayName: merchant.trim(),
            status: 'error',
            source: entry.source ?? RESOLVED_SOURCE,
            lastCheckedAt: new Date().toISOString(),
            retryAfter: addMs(new Date().toISOString(), ERROR_RETRY_MS),
            failureCount: entry.failureCount + 1,
            meta: { error: 'unsafe_logo_url_rejected' },
          });
          return;
        }

        resolveAndCacheMerchantLogo(merchant, merchantLogosRepo, entry).catch(() => {});
      });
    });
    return () => task.cancel();
  }, [enabled, entriesByKey, merchantLogosRepo, merchants]);

  return useMemo(() => {
    const next = new Map<string, MerchantLogo>();
    entries.forEach(entry => {
      if (entry.status === 'resolved' && isSafeLogoUrl(entry.logoUrl) && !isExpired(entry)) {
        next.set(entry.merchantKey, entry);
      }
    });
    return next;
  }, [entries]);
}

export function useInvalidateMerchantLogo() {
  const { merchantLogosRepo } = useRepositories();
  return (merchant: string) => {
    const key = merchantLogoKey(merchant);
    if (key) merchantLogosRepo.delete(key);
  };
}
