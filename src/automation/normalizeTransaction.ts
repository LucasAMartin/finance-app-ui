import { inferExpenseCategory } from '../voice/parseVoiceExpense';
import type { TransactionIntakeDraft } from './parseTransactionIntake';

const DEFAULT_ENDPOINT = 'https://logo-api-ten.vercel.app/api/transactions/normalize';
const DEFAULT_TIMEOUT_MS = 2500;
const NORMALIZATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NORMALIZATION_CACHE_ENTRIES = 80;
const PAYMENT_PROCESSOR_NAMES = new Set([
  'adyen',
  'afterpay',
  'applepay',
  'cashapp',
  'clover',
  'googlepay',
  'klarna',
  'paypal',
  'paypalinc',
  'shopify',
  'shoppay',
  'square',
  'stripe',
  'toast',
  'venmo',
  'zelle',
]);
const PAYMENT_PROCESSOR_DOMAINS = new Set([
  'adyen.com',
  'afterpay.com',
  'cash.app',
  'clover.com',
  'klarna.com',
  'paypal.com',
  'shopify.com',
  'squareup.com',
  'stripe.com',
  'toasttab.com',
  'venmo.com',
  'zellepay.com',
]);
const CARD_ALERT_FALSE_MERCHANT_KEYS = new Set([
  'account',
  'amex',
  'americanexpress',
  'bank',
  'bankofamerica',
  'bofa',
  'card',
  'charge',
  'credit',
  'creditcard',
  'creditcards',
  'creditcom',
  'debit',
  'debitcard',
  'discover',
  'mastercard',
  'purchase',
  'transaction',
  'visa',
]);
const CARD_ALERT_FALSE_MERCHANT_DOMAINS = new Set([
  'credit.com',
]);

export type TransactionNormalizationProvider = 'trove' | 'local';
export type TransactionNormalizationStatus = 'normalized' | 'fallback' | 'skipped' | 'error';

export interface TransactionNormalizationResult {
  draft: TransactionIntakeDraft;
  status: TransactionNormalizationStatus;
  provider: TransactionNormalizationProvider;
  domain?: string;
  providerCategories?: string[];
  errorCode?: string;
  normalizationReason?: string;
  cacheKey?: string;
  cacheHit?: boolean;
  nextCache?: TransactionNormalizationCache;
}

type NormalizeResponse = {
  status?: unknown;
  merchant?: unknown;
  domain?: unknown;
  category?: unknown;
  providerCategories?: unknown;
  provider?: unknown;
  confidence?: unknown;
  errorCode?: unknown;
  normalizationReason?: unknown;
};

export type TransactionNormalizationCacheEntry = {
  response: NormalizeResponse;
  expiresAt: number;
  lastUsedAt: number;
};

export type TransactionNormalizationCache = Record<string, TransactionNormalizationCacheEntry>;

type NormalizeTransactionOptions = {
  cache?: unknown;
  now?: number;
};

type NormalizationMerchantCandidate = {
  text: string;
  score: number;
  reason: string;
};

type NormalizationRequestDraft = {
  description: string;
  rawDescriptor?: string;
  merchantCandidates?: NormalizationMerchantCandidate[];
  amount: number;
  date: string;
  source: TransactionIntakeDraft['source'];
  localMerchant: string;
  localCategory: string;
};

export async function normalizeTransactionDraft(
  draft: TransactionIntakeDraft,
  installationId: string,
  options: NormalizeTransactionOptions = {},
): Promise<TransactionNormalizationResult> {
  const endpoint = transactionNormalizationEndpoint();
  const appKey = transactionNormalizationAppKey();
  const timeoutMs = transactionNormalizationTimeoutMs();
  const requestDraft = normalizationRequestDraft(draft);
  const now = options.now ?? Date.now();
  const cacheKey = transactionNormalizationCacheKey(requestDraft);

  if (!appKey || !requestDraft || !cacheKey) {
    return { draft, status: 'skipped', provider: 'local', errorCode: appKey ? 'insufficient_fields' : 'app_key_missing' };
  }

  const cache = normalizeTransactionNormalizationCache(options.cache, now);
  const cached = cache[cacheKey];
  if (cached) {
    const result = applyNormalizationResponse(draft, cached.response);
    return {
      ...result,
      cacheKey,
      cacheHit: true,
      nextCache: touchNormalizationCache(cache, cacheKey, now),
    };
  }

  try {
    const requestFingerprint = await normalizationRequestFingerprint(installationId);
    const response = await fetchWithTimeout(endpoint, timeoutMs, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key': appKey,
        'x-request-fingerprint': requestFingerprint,
      },
      body: JSON.stringify({
        ...requestDraft,
        installationId,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { draft, status: 'error', provider: 'local', errorCode: stringValue(data?.error) ?? `http_${response.status}` };
    }

    const result = applyNormalizationResponse(draft, data);
    return {
      ...result,
      cacheKey,
      cacheHit: false,
      nextCache: cacheableNormalizationResponse(data)
        ? writeNormalizationCache(cache, cacheKey, data, now)
        : cache,
    };
  } catch (error) {
    return {
      draft,
      status: 'error',
      provider: 'local',
      errorCode: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network_error',
      cacheKey,
    };
  }
}

export function applyNormalizationResponse(
  draft: TransactionIntakeDraft,
  data: NormalizeResponse,
): TransactionNormalizationResult {
  const status = data.status === 'normalized' ? 'normalized' : data.status === 'fallback' ? 'fallback' : 'error';
  const merchant = stringValue(data.merchant);
  const category = stringValue(data.category);
  const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence)
    ? data.confidence
    : draft.confidence;
  const providerCategories = Array.isArray(data.providerCategories)
    ? data.providerCategories.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : undefined;
  const domain = stringValue(data.domain);
  const errorCode = stringValue(data.errorCode);
  const normalizationReason = stringValue(data.normalizationReason);

  if (status !== 'normalized' || !merchant) {
    return {
      draft,
      status,
      provider: 'local',
      providerCategories,
      domain,
      errorCode,
      normalizationReason,
    };
  }

  const preferLocalMerchant = shouldPreferLocalMerchantForProvider(draft, merchant, domain);
  const finalMerchant = preferLocalMerchant ? draft.merchant : merchant;
  const finalDomain = preferLocalMerchant ? undefined : domain;
  const cat = preferLocalMerchant
    ? draft.cat || category || inferExpenseCategory(`${finalMerchant} ${draft.rawDescriptor ?? ''}`)
    : category || inferExpenseCategory(`${merchant} ${providerCategories?.join(' ') ?? ''} ${draft.rawText ?? ''}`);

  return {
    draft: {
      ...draft,
      merchant: finalMerchant,
      cat,
      confidence: Math.max(draft.confidence, preferLocalMerchant ? Math.min(confidence, 0.9) : confidence),
    },
    status: 'normalized',
    provider: 'trove',
    providerCategories,
    domain: finalDomain,
    errorCode,
    normalizationReason: normalizationReason ?? (preferLocalMerchant ? 'sms_local_override' : 'provider_direct'),
  };
}

export function normalizationRequestDraft(draft: TransactionIntakeDraft): NormalizationRequestDraft | undefined {
  const description = providerDescriptionForDraft(draft);
  const rawDescriptor = draft.rawDescriptor?.trim();
  const merchantCandidates = normalizationMerchantCandidates(draft, description);
  const date = dateOnly(draft.occurredAt);

  if (!description || !date || !Number.isFinite(draft.amount) || draft.amount <= 0) {
    return undefined;
  }

  return {
    description,
    ...(rawDescriptor && rawDescriptor !== description ? { rawDescriptor } : {}),
    ...(merchantCandidates.length ? { merchantCandidates } : {}),
    amount: draft.amount,
    date,
    source: draft.source,
    localMerchant: draft.merchant,
    localCategory: draft.cat,
  };
}

function providerDescriptionForDraft(draft: TransactionIntakeDraft): string {
  const merchant = draft.merchant.trim();
  const normalizedDescriptor = draft.normalizedDescriptor?.trim();
  const rawDescriptor = draft.rawDescriptor?.trim();

  if (draft.source === 'sms' && draft.confidence >= 0.9 && merchant) {
    return merchant;
  }

  return normalizedDescriptor || merchant || rawDescriptor || '';
}

function normalizationMerchantCandidates(
  draft: TransactionIntakeDraft,
  description: string,
): NormalizationMerchantCandidate[] {
  const seen = new Set<string>();
  const candidates: NormalizationMerchantCandidate[] = [];

  function add(text: string | undefined, score: number, reason: string) {
    const clean = stringValue(text)?.slice(0, 80);
    const key = clean ? merchantKey(clean) : '';
    if (!clean || !key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ text: clean, score, reason });
  }

  add(description, 0.92, 'request_description');
  for (const candidate of draft.merchantCandidates ?? []) {
    add(candidate.text, candidate.score, candidate.reason);
  }
  add(draft.normalizedDescriptor, 0.86, 'normalized_descriptor');
  add(draft.merchant, draft.confidence, 'local_merchant');
  add(draft.rawDescriptor, 0.72, 'raw_descriptor');

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function normalizationRequestFingerprint(installationId: string): Promise<string> {
  const value = `finance-app:${installationId}`;

  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle && typeof TextEncoder !== 'undefined') {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
      const hex = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      return `sha256_${hex.slice(0, 32)}`;
    }
  } catch {
    // Fall through to a stable non-secret bucket id. The server still hashes the install id before Trove.
  }

  return `fnv1a_${fnv1a(value)}`;
}

export function normalizeTransactionNormalizationCache(value: unknown, now = Date.now()): TransactionNormalizationCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]): [string, TransactionNormalizationCacheEntry][] => {
      if (!/^txn_norm_v1_[0-9a-f]{8}$/.test(key)) return [];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const expiresAt = typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt) ? record.expiresAt : 0;
      const lastUsedAt = typeof record.lastUsedAt === 'number' && Number.isFinite(record.lastUsedAt) ? record.lastUsedAt : 0;
      const response = record.response;
      if (expiresAt <= now || !isCacheableNormalizeResponse(response)) return [];
      return [[key, { response: response as NormalizeResponse, expiresAt, lastUsedAt }]];
    })
    .sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt)
    .slice(0, MAX_NORMALIZATION_CACHE_ENTRIES);

  return Object.fromEntries(entries);
}

export function transactionNormalizationCacheKey(requestDraft: NormalizationRequestDraft | undefined): string | undefined {
  if (!requestDraft) return undefined;
  const amountCents = Math.round(requestDraft.amount * 100);
  return `txn_norm_v1_${fnv1a([
    requestDraft.description,
    requestDraft.merchantCandidates
      ?.map(candidate => `${candidate.text}:${candidate.score.toFixed(2)}:${candidate.reason}`)
      .join('|') ?? '',
    amountCents,
    requestDraft.date,
    requestDraft.source,
    requestDraft.localMerchant,
    requestDraft.localCategory,
  ].join('\n'))}`;
}

function cacheableNormalizationResponse(data: NormalizeResponse): boolean {
  return data.status === 'normalized' && !!stringValue(data.merchant);
}

function isCacheableNormalizeResponse(value: unknown): value is NormalizeResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return cacheableNormalizationResponse(value as NormalizeResponse);
}

function writeNormalizationCache(
  cache: TransactionNormalizationCache,
  key: string,
  response: NormalizeResponse,
  now: number,
): TransactionNormalizationCache {
  const next: TransactionNormalizationCache = {
    ...cache,
    [key]: {
      response: sanitizeNormalizeResponseForCache(response),
      expiresAt: now + NORMALIZATION_CACHE_TTL_MS,
      lastUsedAt: now,
    },
  };

  return normalizeTransactionNormalizationCache(next, now);
}

function touchNormalizationCache(cache: TransactionNormalizationCache, key: string, now: number): TransactionNormalizationCache {
  const entry = cache[key];
  if (!entry) return cache;
  return {
    ...cache,
    [key]: {
      ...entry,
      lastUsedAt: now,
    },
  };
}

function sanitizeNormalizeResponseForCache(response: NormalizeResponse): NormalizeResponse {
  const providerCategories = Array.isArray(response.providerCategories)
    ? response.providerCategories.filter((item): item is string => typeof item === 'string' && !!item.trim()).slice(0, 8)
    : undefined;

  return {
    status: stringValue(response.status),
    merchant: stringValue(response.merchant),
    domain: stringValue(response.domain),
    category: stringValue(response.category),
    providerCategories,
    provider: stringValue(response.provider),
    confidence: typeof response.confidence === 'number' && Number.isFinite(response.confidence)
      ? response.confidence
      : undefined,
    errorCode: stringValue(response.errorCode),
    normalizationReason: stringValue(response.normalizationReason),
  };
}

function shouldPreferLocalMerchantForProvider(
  draft: TransactionIntakeDraft,
  providerMerchant: string,
  providerDomain?: string,
): boolean {
  const localMerchant = stringValue(draft.merchant);
  if (draft.source !== 'sms' || !localMerchant) return false;
  if (sameMerchant(localMerchant, providerMerchant)) return false;
  if (isPaymentProcessorMerchant(localMerchant)) return false;
  if (hasStrongSmsLocalMerchant(draft) && isCardAlertFalseMerchant(providerMerchant, providerDomain)) return true;
  return isPaymentProcessorMerchant(providerMerchant, providerDomain);
}

function hasStrongSmsLocalMerchant(draft: TransactionIntakeDraft): boolean {
  const merchant = stringValue(draft.merchant);
  if (!merchant || merchantKey(merchant).length < 4) return false;
  return draft.confidence >= 0.82 || !!stringValue(draft.rawDescriptor);
}

function isCardAlertFalseMerchant(merchant: string, domain?: string): boolean {
  const key = merchantKey(merchant);
  const host = domain?.toLowerCase().replace(/^www\./, '');
  return CARD_ALERT_FALSE_MERCHANT_KEYS.has(key)
    || (!!host && CARD_ALERT_FALSE_MERCHANT_DOMAINS.has(host));
}

function isPaymentProcessorMerchant(merchant: string, domain?: string): boolean {
  const key = merchantKey(merchant);
  const host = domain?.toLowerCase().replace(/^www\./, '');
  return PAYMENT_PROCESSOR_NAMES.has(key) || (!!host && PAYMENT_PROCESSOR_DOMAINS.has(host));
}

function sameMerchant(a: string, b: string): boolean {
  const left = merchantKey(a);
  const right = merchantKey(b);
  return !!left && left === right;
}

function merchantKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function dateOnly(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function transactionNormalizationEndpoint(): string {
  return process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_ENDPOINT ?? DEFAULT_ENDPOINT;
}

function transactionNormalizationAppKey(): string | undefined {
  return process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY
    ?? process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY;
}

function transactionNormalizationTimeoutMs(): number {
  return positiveInt(process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
