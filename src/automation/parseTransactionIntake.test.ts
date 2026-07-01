import assert from 'node:assert/strict';
import test from 'node:test';
import {
  explainTransactionIntakeRejection,
  parseTransactionIntake,
  transactionAutomationFingerprint,
} from './parseTransactionIntake';

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

test('parses text alerts where merchant follows the amount directly', () => {
  const parsed = parseTransactionIntake(
    'Debit card purchase $12.50 SQ *LASANG PINOY card ending 7780. Reply STOP.',
    'sms',
  );

  assert.equal(parsed?.amount, 12.5);
  assert.equal(parsed?.merchant, 'Lasang Pinoy');
  assert.equal(parsed?.cardLast4, '7780');
});

test('parses text alerts where amount follows the merchant', () => {
  const parsed = parseTransactionIntake(
    'A charge at STARBUCKS for $4.65 was approved on card ending 7780.',
    'sms',
  );

  assert.equal(parsed?.amount, 4.65);
  assert.equal(parsed?.merchant, 'Starbucks');
  assert.equal(parsed?.cat, 'dining');
});

test('parses purchase alerts with trailing balance details', () => {
  const parsed = parseTransactionIntake(
    'You spent $8.10 at BLUE BOTTLE with card ending 7780. Available balance $123.45.',
    'sms',
  );

  assert.equal(parsed?.amount, 8.1);
  assert.equal(parsed?.merchant, 'Blue Bottle');
  assert.equal(parsed?.cardLast4, '7780');
});

test('ignores non-transaction text alerts with dollar amounts', () => {
  assert.equal(parseTransactionIntake('Your available balance is $500.00 as of 9:41 AM.', 'sms'), null);
  assert.equal(parseTransactionIntake('Your minimum payment of $25.00 is due on July 12.', 'sms'), null);
  assert.equal(parseTransactionIntake('A transaction for $12.50 at TARGET was declined.', 'sms'), null);
  assert.equal(parseTransactionIntake('Did you make a purchase of $12.50 at TARGET? Reply YES or NO.', 'sms'), null);
});

test('explains why text alerts are ignored', () => {
  assert.equal(
    explainTransactionIntakeRejection('', 'sms'),
    'No receipt text reached finance-app. In Shortcuts, tap the blank text field in Process Receipt and choose Shortcut Input.',
  );
  assert.equal(
    explainTransactionIntakeRejection('test text from me', 'sms'),
    'No transaction amount was found.',
  );
  assert.equal(
    explainTransactionIntakeRejection('A transaction for $12.50 at TARGET was declined.', 'sms'),
    'Ignored because this looks like a non-purchase card alert.',
  );
  assert.equal(
    explainTransactionIntakeRejection('I paid $12.50 at Target', 'sms'),
    'Ignored because the text did not include purchase, spent, charge, transaction, or authorized.',
  );
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
