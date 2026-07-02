// Focused unit tests for the merchant logo resolver policy.
// Run with: node --test src/merchantLogoPolicy.test.ts  (Node 24+, native TS).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MerchantLogo } from './repositories/types.ts';
import {
  ERROR_RETRY_MS,
  RESOLVED_SOURCE,
  RESOLVED_TTL_MS,
  isLookupableMerchantName,
  isSafeLogoUrl,
  merchantLogoKey,
  planLogoEntry,
  redactLogoUrl,
  shouldCacheLogoAsset,
  sanitizeBgColor,
  shouldResolve,
  withRenderableLogoUrl,
  type ResolveResponse,
} from './merchantLogoPolicy.ts';

const NOW = '2026-06-03T12:00:00.000Z';
const PK_URL =
  'https://img.logo.dev/chipotle.com?token=pk_abc123&size=128&format=png&theme=light&fallback=404&retina=true';

test('merchantLogoKey normalizes case and whitespace', () => {
  assert.equal(merchantLogoKey('  Chipotle   Mexican  Grill '), 'chipotle mexican grill');
});

test('isLookupableMerchantName skips blank, too-short, punctuation-only, and category names', () => {
  assert.equal(isLookupableMerchantName('Chipotle'), true);
  assert.equal(isLookupableMerchantName(''), false);
  assert.equal(isLookupableMerchantName('   '), false);
  assert.equal(isLookupableMerchantName('x'), false);
  assert.equal(isLookupableMerchantName('!!!'), false);
  assert.equal(isLookupableMerchantName('Dining'), false);
  assert.equal(isLookupableMerchantName('rent'), false);
});

test('isSafeLogoUrl accepts a direct Logo.dev CDN url with a pk_ token', () => {
  assert.equal(isSafeLogoUrl(PK_URL), true);
});

test('isSafeLogoUrl rejects secret keys, non-CDN hosts, http, and legacy proxy/Brandfetch urls', () => {
  // sk_ secret must never be accepted, regardless of host.
  assert.equal(isSafeLogoUrl('https://img.logo.dev/chipotle.com?token=sk_secret123'), false);
  // http (non-https)
  assert.equal(isSafeLogoUrl('http://img.logo.dev/chipotle.com?token=pk_abc'), false);
  // wrong host
  assert.equal(isSafeLogoUrl('https://evil.example.com/chipotle.com?token=pk_abc'), false);
  // legacy app-proxy image route
  assert.equal(
    isSafeLogoUrl('https://logo-api-ten.vercel.app/api/merchant-logo/image/chipotle?exp=1&token=t&sig=s'),
    false,
  );
  // legacy Brandfetch url
  assert.equal(isSafeLogoUrl('https://cdn.brandfetch.io/chipotle.com/logo?c=abc'), false);
  assert.equal(isSafeLogoUrl(undefined), false);
  assert.equal(isSafeLogoUrl('not a url'), false);
});

test('redactLogoUrl strips the query string (and its token) for logging', () => {
  assert.equal(redactLogoUrl(PK_URL), 'https://img.logo.dev/chipotle.com?…');
  assert.match(redactLogoUrl(PK_URL), /^https:\/\/img\.logo\.dev\/chipotle\.com\?…$/);
  assert.doesNotMatch(redactLogoUrl(PK_URL), /pk_/);
  assert.equal(redactLogoUrl(undefined), '');
});

test('planLogoEntry: resolved → caches logoUrl + domain, status resolved, no retryAfter, failureCount reset', () => {
  const data: ResolveResponse = {
    status: 'resolved',
    merchantKey: 'chipotle',
    domain: 'chipotle.com',
    logoUrl: PK_URL,
    lastCheckedAt: NOW,
    source: RESOLVED_SOURCE,
  };
  const entry = planLogoEntry('Chipotle', 'chipotle', data, { failureCount: 3 } as MerchantLogo, NOW);
  assert.equal(entry.status, 'resolved');
  assert.equal(entry.logoUrl, PK_URL);
  assert.equal(entry.domain, 'chipotle.com');
  assert.equal(entry.retryAfter, undefined);
  assert.equal(entry.failureCount, 0);
});

test('sanitizeBgColor: accepts #rrggbb, lowercases, rejects everything else → null', () => {
  assert.equal(sanitizeBgColor('#A81612'), '#a81612');
  assert.equal(sanitizeBgColor('#a81612'), '#a81612');
  assert.equal(sanitizeBgColor(null), null);
  assert.equal(sanitizeBgColor(undefined), null);
  assert.equal(sanitizeBgColor('a81612'), null); // missing #
  assert.equal(sanitizeBgColor('#abc'), null); // shorthand unsupported
  assert.equal(sanitizeBgColor('#a81612ff'), null); // alpha hex rejected
  assert.equal(sanitizeBgColor('red'), null);
});

test('planLogoEntry: resolved carries sanitized bgColor; null bgColor passes through', () => {
  const base = {
    status: 'resolved' as const,
    merchantKey: 'chipotle',
    domain: 'chipotle.com',
    logoUrl: PK_URL,
    lastCheckedAt: NOW,
    source: RESOLVED_SOURCE,
  };
  assert.equal(planLogoEntry('Chipotle', 'chipotle', { ...base, bgColor: '#A81612' }, undefined, NOW).bgColor, '#a81612');
  assert.equal(planLogoEntry('Chipotle', 'chipotle', { ...base, bgColor: null }, undefined, NOW).bgColor, null);
  // Garbage from the server collapses to null rather than reaching the disc.
  assert.equal(planLogoEntry('Chipotle', 'chipotle', { ...base, bgColor: 'bogus' }, undefined, NOW).bgColor, null);
});

test('planLogoEntry: non-resolved statuses do not carry a bgColor', () => {
  const notFound = planLogoEntry(
    'Unknown',
    'unknown',
    { status: 'not_found', retryAfter: NOW, lastCheckedAt: NOW },
    undefined,
    NOW,
  );
  assert.equal(notFound.bgColor, undefined);
});

test('planLogoEntry: resolved but unsafe url → demoted to error with backoff, no logoUrl stored', () => {
  const data: ResolveResponse = {
    status: 'resolved',
    domain: 'chipotle.com',
    logoUrl: 'https://img.logo.dev/x?token=sk_leaked',
    lastCheckedAt: NOW,
  };
  const entry = planLogoEntry('Chipotle', 'chipotle', data, undefined, NOW);
  assert.equal(entry.status, 'error');
  assert.equal(entry.logoUrl, undefined);
  assert.equal(entry.domain, undefined);
  assert.equal(entry.retryAfter, new Date(Date.parse(NOW) + ERROR_RETRY_MS).toISOString());
});

test('planLogoEntry: not_found → caches status with server retryAfter and no logoUrl', () => {
  const retryAfter = '2026-06-10T12:00:00.000Z';
  const data: ResolveResponse = {
    status: 'not_found',
    merchantKey: 'unknown merchant',
    retryAfter,
    lastCheckedAt: NOW,
  };
  const entry = planLogoEntry('Unknown Merchant', 'unknown merchant', data, undefined, NOW);
  assert.equal(entry.status, 'not_found');
  assert.equal(entry.logoUrl, undefined);
  assert.equal(entry.retryAfter, retryAfter);
  assert.equal(entry.failureCount, 1);
});

test('planLogoEntry: error → caches error with computed backoff retryAfter', () => {
  const data: ResolveResponse = { status: 'error', merchantKey: 'chipotle', lastCheckedAt: NOW };
  const entry = planLogoEntry('Chipotle', 'chipotle', data, { failureCount: 1 } as MerchantLogo, NOW);
  assert.equal(entry.status, 'error');
  assert.equal(entry.retryAfter, new Date(Date.parse(NOW) + ERROR_RETRY_MS).toISOString());
  assert.equal(entry.failureCount, 2);
});

test('planLogoEntry: records provider merchantKey in meta only when it differs from our key', () => {
  const same = planLogoEntry(
    'Chipotle',
    'chipotle',
    { status: 'error', merchantKey: 'chipotle', lastCheckedAt: NOW },
    undefined,
    NOW,
  );
  assert.equal(same.meta, undefined);
  const diff = planLogoEntry(
    'Chipotle Grill',
    'chipotle grill',
    { status: 'error', merchantKey: 'chipotle', lastCheckedAt: NOW },
    undefined,
    NOW,
  );
  assert.deepEqual(diff.meta, { providerMerchantKey: 'chipotle' });
});

test('withRenderableLogoUrl prefers locally cached logo assets', () => {
  const entry: MerchantLogo = {
    id: 'chipotle',
    merchantKey: 'chipotle',
    status: 'resolved',
    logoUrl: PK_URL,
    lastCheckedAt: NOW,
    failureCount: 0,
    meta: { localLogoUri: 'file:///cache/chipotle.png' },
  };

  assert.equal(withRenderableLogoUrl(entry).logoUrl, 'file:///cache/chipotle.png');
});

test('shouldCacheLogoAsset waits for resolved safe urls and backs off failures', () => {
  const now = new Date(NOW);
  const base: MerchantLogo = {
    id: 'chipotle',
    merchantKey: 'chipotle',
    status: 'resolved',
    logoUrl: PK_URL,
    lastCheckedAt: NOW,
    failureCount: 0,
  };

  assert.equal(shouldCacheLogoAsset(base, now), true);
  assert.equal(shouldCacheLogoAsset({ ...base, meta: { localLogoUri: 'file:///cache/chipotle.png' } }, now), false);
  assert.equal(
    shouldCacheLogoAsset({ ...base, meta: { localLogoRetryAfter: new Date(now.getTime() + 60_000).toISOString() } }, now),
    false,
  );
  assert.equal(
    shouldCacheLogoAsset({ ...base, meta: { localLogoRetryAfter: new Date(now.getTime() - 60_000).toISOString() } }, now),
    true,
  );
});

test('shouldResolve: no entry resolves; fresh resolved does not; expired resolved does', () => {
  const now = new Date(NOW);
  assert.equal(shouldResolve(undefined, now), true);

  const fresh: MerchantLogo = {
    id: 'chipotle',
    merchantKey: 'chipotle',
    status: 'resolved',
    logoUrl: PK_URL,
    lastCheckedAt: NOW,
    failureCount: 0,
  };
  assert.equal(shouldResolve(fresh, now), false);

  const expired: MerchantLogo = {
    ...fresh,
    lastCheckedAt: new Date(now.getTime() - RESOLVED_TTL_MS - 1000).toISOString(),
  };
  assert.equal(shouldResolve(expired, now), true);
});

test('shouldResolve: not_found / error wait until retryAfter passes', () => {
  const now = new Date(NOW);
  const base: MerchantLogo = {
    id: 'chipotle',
    merchantKey: 'chipotle',
    status: 'not_found',
    lastCheckedAt: NOW,
    failureCount: 1,
  };
  const future: MerchantLogo = { ...base, retryAfter: new Date(now.getTime() + 60_000).toISOString() };
  assert.equal(shouldResolve(future, now), false);
  const past: MerchantLogo = { ...base, retryAfter: new Date(now.getTime() - 60_000).toISOString() };
  assert.equal(shouldResolve(past, now), true);
});
