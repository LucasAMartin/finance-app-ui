import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNormalizationResponse, normalizeTransactionDraft, normalizationRequestFingerprint } from './normalizeTransaction';
import { parseTransactionIntake, type TransactionIntakeDraft } from './parseTransactionIntake';

const draft: TransactionIntakeDraft = {
  amount: 21.9,
  merchant: 'OpenAI',
  cat: 'bills',
  source: 'sms',
  note: 'Imported from SMS alert',
  cardLast4: '8917',
  occurredAt: '2026-06-27T12:00:00.000Z',
  rawDescriptor: 'PAYPAL OPENAIOPCOL OPENA',
  normalizedDescriptor: 'OPENAIOPCOL OPENA',
  processorName: 'PayPal',
  rawText: 'BofA: Credit card charge $21.90, credit card - 8917, PAYPAL OPENAIOPCOL OPENA, 06/27/26.',
  confidence: 0.93,
};

test('applyNormalizationResponse uses Trove merchant and category when normalized', () => {
  const result = applyNormalizationResponse(draft, {
    status: 'normalized',
    merchant: 'OpenAI',
    domain: 'openai.com',
    category: 'bills',
    providerCategories: ['Artificial Intelligence', 'Software'],
    confidence: 0.94,
  });

  assert.equal(result.status, 'normalized');
  assert.equal(result.provider, 'trove');
  assert.equal(result.draft.merchant, 'OpenAI');
  assert.equal(result.draft.cat, 'bills');
  assert.equal(result.draft.confidence, 0.94);
  assert.equal(result.domain, 'openai.com');
  assert.deepEqual(result.providerCategories, ['Artificial Intelligence', 'Software']);
});

test('applyNormalizationResponse keeps SMS local merchant when Trove returns a payment processor', () => {
  const result = applyNormalizationResponse(draft, {
    status: 'normalized',
    merchant: 'PayPal',
    domain: 'paypal.com',
    category: 'bills',
    providerCategories: ['Ecommerce', 'FinTech', 'Payment Processing', 'Software'],
    confidence: 0.94,
  });

  assert.equal(result.status, 'normalized');
  assert.equal(result.provider, 'trove');
  assert.equal(result.draft.merchant, 'OpenAI');
  assert.equal(result.draft.cat, 'bills');
  assert.equal(result.draft.confidence, 0.93);
  assert.equal(result.domain, undefined);
  assert.deepEqual(result.providerCategories, ['Ecommerce', 'FinTech', 'Payment Processing', 'Software']);
});

test('applyNormalizationResponse keeps strong SMS merchant when provider returns card alert text', () => {
  const claudeDraft = parseTransactionIntake(
    'BofA: Credit card charge $21.90, credit card - 8917, CLAUDE.AI SUBSCRIPTION.  STOP to end account texts',
    'sms',
  );
  assert.ok(claudeDraft);

  const result = applyNormalizationResponse(claudeDraft, {
    status: 'normalized',
    merchant: 'Credit.com',
    domain: 'credit.com',
    category: 'bills',
    providerCategories: ['Credit Cards', 'Finance'],
    confidence: 0.94,
  });

  assert.equal(result.status, 'normalized');
  assert.equal(result.provider, 'trove');
  assert.equal(result.draft.merchant, 'Claude');
  assert.equal(result.draft.cat, 'bills');
  assert.equal(result.domain, undefined);
  assert.equal(result.normalizationReason, 'sms_local_override');
});

test('applyNormalizationResponse rejects card-alert provider merchants for generic strong SMS merchants', () => {
  const figmaDraft = parseTransactionIntake(
    'BofA: Credit card charge $12.00, credit card - 8917, FIGMA.COM SUBSCRIPTION. STOP to end account texts',
    'sms',
  );
  assert.ok(figmaDraft);

  const result = applyNormalizationResponse(figmaDraft, {
    status: 'normalized',
    merchant: 'Credit Card',
    domain: 'credit.com',
    category: 'bills',
    providerCategories: ['Credit Cards', 'Finance'],
    confidence: 0.94,
  });

  assert.equal(result.draft.merchant, 'Figma');
  assert.equal(result.domain, undefined);
  assert.equal(result.normalizationReason, 'sms_local_override');
});

test('applyNormalizationResponse does not suppress a real processor merchant', () => {
  const paypalDraft: TransactionIntakeDraft = {
    ...draft,
    merchant: 'PayPal',
    rawDescriptor: 'PAYPAL',
    rawText: 'BofA: Credit card charge $5.99, credit card - 8917, PAYPAL, 06/27/26.',
  };
  const result = applyNormalizationResponse(paypalDraft, {
    status: 'normalized',
    merchant: 'PayPal',
    domain: 'paypal.com',
    category: 'bills',
    providerCategories: ['FinTech'],
    confidence: 0.94,
  });

  assert.equal(result.draft.merchant, 'PayPal');
  assert.equal(result.domain, 'paypal.com');
});

test('applyNormalizationResponse preserves local draft on fallback responses', () => {
  const result = applyNormalizationResponse(draft, {
    status: 'fallback',
    merchant: 'OpenAI',
    category: 'bills',
    errorCode: 'provider_429',
  });

  assert.equal(result.status, 'fallback');
  assert.equal(result.provider, 'local');
  assert.equal(result.draft, draft);
  assert.equal(result.errorCode, 'provider_429');
});

test('normalizeTransactionDraft sends minimal data and a non-raw request fingerprint', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  process.env = {
    ...process.env,
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_ENDPOINT: 'https://example.test/api/transactions/normalize',
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY: 'app-key',
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_TIMEOUT_MS: '2500',
  };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({
      status: 'fallback',
      merchant: 'OpenAI',
      category: 'bills',
      provider: 'local',
      confidence: 0.62,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    await normalizeTransactionDraft(draft, 'install_secret_123');
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }

  assert.equal(capturedUrl, 'https://example.test/api/transactions/normalize');
  assert.ok(capturedInit);

  const headers = capturedInit.headers as Record<string, string>;
  assert.equal(headers['x-app-key'], 'app-key');
  assert.equal(typeof headers['x-request-fingerprint'], 'string');
  assert.equal(headers['x-request-fingerprint'].includes('install_secret_123'), false);

  const body = JSON.parse(String(capturedInit.body));
  assert.deepEqual(Object.keys(body).sort(), [
    'amount',
    'date',
    'description',
    'installationId',
    'localCategory',
    'localMerchant',
    'merchantCandidates',
    'rawDescriptor',
    'source',
  ].sort());
  assert.equal(body.description, 'OpenAI');
  assert.equal(body.rawDescriptor, 'PAYPAL OPENAIOPCOL OPENA');
  assert.deepEqual(body.merchantCandidates.map((candidate: { text: string }) => candidate.text), [
    'OpenAI',
    'OPENAIOPCOL OPENA',
    'PAYPAL OPENAIOPCOL OPENA',
  ]);
  assert.equal(JSON.stringify(body).includes(draft.rawText ?? ''), false);
  assert.equal(JSON.stringify(body).includes(draft.cardLast4 ?? ''), false);
});

test('normalizeTransactionDraft sends cleaned descriptor for weaker local merchant guesses', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  const weakDraft: TransactionIntakeDraft = {
    ...draft,
    merchant: 'Cafe Luna',
    cat: 'dining',
    rawDescriptor: 'TOAST *CAFE LUNA',
    normalizedDescriptor: 'CAFE LUNA',
    processorName: 'Toast',
    confidence: 0.88,
  };

  process.env = {
    ...process.env,
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_ENDPOINT: 'https://example.test/api/transactions/normalize',
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY: 'app-key',
  };
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({
      status: 'fallback',
      merchant: 'Cafe Luna',
      category: 'dining',
      provider: 'local',
      confidence: 0.62,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    await normalizeTransactionDraft(weakDraft, 'install_secret_123');
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }

  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.description, 'CAFE LUNA');
  assert.equal(body.rawDescriptor, 'TOAST *CAFE LUNA');
  assert.deepEqual(body.merchantCandidates.map((candidate: { text: string }) => candidate.text), [
    'CAFE LUNA',
    'TOAST *CAFE LUNA',
  ]);
});

test('normalizeTransactionDraft caches successful normalized responses on device', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  process.env = {
    ...process.env,
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_ENDPOINT: 'https://example.test/api/transactions/normalize',
    EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY: 'app-key',
  };
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      status: 'normalized',
      merchant: 'OpenAI',
      domain: 'openai.com',
      category: 'bills',
      providerCategories: ['Artificial Intelligence', 'Software'],
      provider: 'trove',
      confidence: 0.94,
      normalizationReason: 'provider_direct',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const first = await normalizeTransactionDraft(draft, 'install_secret_123', { now: 1000 });
    const second = await normalizeTransactionDraft(draft, 'install_secret_123', {
      cache: first.nextCache,
      now: 2000,
    });

    assert.equal(fetchCount, 1);
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(second.draft.merchant, 'OpenAI');
    assert.equal(second.domain, 'openai.com');
    assert.ok(first.cacheKey);
    assert.equal(JSON.stringify(first.nextCache).includes(draft.rawText ?? ''), false);
    assert.equal(JSON.stringify(first.nextCache).includes(draft.cardLast4 ?? ''), false);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test('normalizationRequestFingerprint is stable and does not expose the installation id', async () => {
  const first = await normalizationRequestFingerprint('install_secret_123');
  const second = await normalizationRequestFingerprint('install_secret_123');

  assert.equal(first, second);
  assert.equal(first.includes('install_secret_123'), false);
});
