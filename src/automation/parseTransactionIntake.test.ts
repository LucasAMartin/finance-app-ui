import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTransactionIntake, transactionAutomationFingerprint } from './parseTransactionIntake';

test('parses card purchase SMS alerts', () => {
  const parsed = parseTransactionIntake(
    'You made a purchase of $12.50 at SQ *LASANG PINOY with credit card ...7780. Reply STOP to end. Msg & data rates may apply.',
    'sms',
  );

  assert.deepEqual(parsed && {
    amount: parsed.amount,
    merchant: parsed.merchant,
    cat: parsed.cat,
    cardLast4: parsed.cardLast4,
    note: parsed.note,
  }, {
    amount: 12.5,
    merchant: 'Lasang Pinoy',
    cat: 'dining',
    cardLast4: '7780',
    note: 'Imported from SMS alert',
  });
});

test('parses wallet shortcut text', () => {
  const parsed = parseTransactionIntake('Apple Pay: $48.13 at Shell', 'wallet');

  assert.equal(parsed?.amount, 48.13);
  assert.equal(parsed?.merchant, 'Shell');
  assert.equal(parsed?.cat, 'transport');
});

test('returns null when there is no usable amount', () => {
  assert.equal(parseTransactionIntake('Reply STOP to end messages', 'sms'), null);
});

test('creates stable transaction automation fingerprints', () => {
  const base = {
    amount: 12.5,
    occurredAt: '2026-06-29T12:34:20.000Z',
    cardLast4: '7780',
    source: 'wallet' as const,
  };

  assert.equal(
    transactionAutomationFingerprint({ ...base, merchant: 'Lasang Pinoy' }),
    transactionAutomationFingerprint({ ...base, merchant: 'LASANG   PINOY!!!' }),
  );
  assert.notEqual(
    transactionAutomationFingerprint({ ...base, merchant: 'Lasang Pinoy' }),
    transactionAutomationFingerprint({ ...base, merchant: 'Lasang Pinoy', cardLast4: '1111' }),
  );
});
