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

test('parses Discover alerts with month-name dates and trailing action links', () => {
  const parsed = parseTransactionIntake(
    'Discover Card Alert: A transaction of $9.27 at EMERALD CITY SMOOTHIE on June 30, 2026. No Action needed. See it at https://app.discover.com/ACTVT. Text STOP to end',
    'sms',
  );

  assert.equal(parsed?.amount, 9.27);
  assert.equal(parsed?.merchant, 'Emerald City Smoothie');
  assert.equal(parsed?.cat, 'dining');
  assert.equal(parsed?.occurredAt, '2026-06-30T12:00:00.000Z');
  assert.equal(parsed?.rawDescriptor, 'EMERALD CITY SMOOTHIE');
  assert.equal(parsed?.normalizedDescriptor, 'EMERALD CITY SMOOTHIE');
  assert.deepEqual(parsed?.merchantCandidates?.map(candidate => candidate.text), [
    'Emerald City Smoothie',
  ]);
});

test('parses Discover merchant store numbers without treating them as card digits', () => {
  const parsed = parseTransactionIntake(
    'Discover Card Alert: A transaction of $9.27 at Subway 11538 on March 29, 2026. No Action needed. See it at https://app.discover.com/ACTVT. Text STOP to end',
    'sms',
  );

  assert.equal(parsed?.amount, 9.27);
  assert.equal(parsed?.merchant, 'Subway 11538');
  assert.equal(parsed?.occurredAt, '2026-03-29T12:00:00.000Z');
  assert.equal(parsed?.rawDescriptor, 'Subway 11538');
  assert.equal(parsed?.normalizedDescriptor, 'Subway 11538');
  assert.deepEqual(parsed?.merchantCandidates?.map(candidate => candidate.text), [
    'Subway 11538',
  ]);
});

test('parses BofA processor descriptors into normalized merchant fields', () => {
  const parsed = parseTransactionIntake(
    'BofA: Credit card charge $21.90, credit card - 8917, PAYPAL  OPENAIOPCOL OPENA, 06/27/26. STOP to end account texts',
    'sms',
  );

  assert.equal(parsed?.amount, 21.9);
  assert.equal(parsed?.merchant, 'OpenAI');
  assert.equal(parsed?.cat, 'bills');
  assert.equal(parsed?.cardLast4, '8917');
  assert.equal(parsed?.occurredAt, '2026-06-27T12:00:00.000Z');
  assert.equal(parsed?.rawDescriptor, 'PAYPAL OPENAIOPCOL OPENA');
  assert.equal(parsed?.normalizedDescriptor, 'OPENAIOPCOL OPENA');
  assert.equal(parsed?.processorName, 'PayPal');
  assert.equal(parsed?.confidence, 0.93);
});

test('trims bank alert limit boilerplate after merchant descriptors', () => {
  const parsed = parseTransactionIntake(
    'Alert: AAA Advantage Washington 2160 purchase of $11.82 at FRED-MEYER #0424, PUYALLUP, above your chosen limit of $1. For help reply HELP. To stop reply STOP.',
    'sms',
  );

  assert.equal(parsed?.amount, 11.82);
  assert.equal(parsed?.merchant, 'Fred Meyer');
  assert.equal(parsed?.cat, 'groceries');
  assert.equal(parsed?.rawDescriptor, 'FRED-MEYER #0424, PUYALLUP');
  assert.equal(parsed?.normalizedDescriptor, 'FRED-MEYER #0424, PUYALLUP');
  assert.equal(parsed?.confidence, 0.93);
  assert.deepEqual(parsed?.merchantCandidates?.map(candidate => candidate.text), [
    'Fred Meyer',
  ]);
});

test('trims limit boilerplate generically for store-number merchants', () => {
  const parsed = parseTransactionIntake(
    'Alert: Rewards card purchase of $4.50 at RIVER-MARKET #9876, TACOMA, above your chosen limit of $1. For help reply HELP. To stop reply STOP.',
    'sms',
  );

  assert.equal(parsed?.amount, 4.5);
  assert.equal(parsed?.merchant, 'River Market');
  assert.equal(parsed?.rawDescriptor, 'RIVER-MARKET #9876, TACOMA');
  assert.equal(parsed?.merchantCandidates?.[0]?.text, 'River Market');
});

test('parses BofA direct subscription descriptors without card-context candidates', () => {
  const parsed = parseTransactionIntake(
    'BofA: Credit card charge $21.90, credit card - 8917, CLAUDE.AI SUBSCRIPTION.  STOP to end account texts',
    'sms',
  );

  assert.equal(parsed?.amount, 21.9);
  assert.equal(parsed?.merchant, 'Claude');
  assert.equal(parsed?.cat, 'bills');
  assert.equal(parsed?.cardLast4, '8917');
  assert.equal(parsed?.rawDescriptor, 'CLAUDE.AI SUBSCRIPTION');
  assert.equal(parsed?.normalizedDescriptor, 'CLAUDE.AI SUBSCRIPTION');
  assert.equal(parsed?.confidence, 0.93);
  assert.equal(parsed?.merchantCandidates?.some(candidate => candidate.text.toLowerCase() === 'credit'), false);
});

test('normalizes domain-style subscription descriptors generically', () => {
  const parsed = parseTransactionIntake(
    'BofA: Credit card charge $12.00, credit card - 8917, FIGMA.COM SUBSCRIPTION. STOP to end account texts',
    'sms',
  );

  assert.equal(parsed?.amount, 12);
  assert.equal(parsed?.merchant, 'Figma');
  assert.equal(parsed?.rawDescriptor, 'FIGMA.COM SUBSCRIPTION');
  assert.equal(parsed?.merchantCandidates?.some(candidate => candidate.text.toLowerCase() === 'credit'), false);
});

test('handles common bank alert merchant shapes without leaking boilerplate', () => {
  const cases = [
    {
      text: 'Capital One Alert: $31.99 purchase approved at UBER TRIP HELP.UBER.COM on card ending 1234.',
      merchant: 'Uber',
      amount: 31.99,
      cardLast4: '1234',
      rawDescriptor: 'UBER TRIP HELP.UBER.COM',
    },
    {
      text: 'Your debit card ending 1234 was charged $29.99 by NETFLIX.COM.',
      merchant: 'Netflix',
      amount: 29.99,
      cardLast4: '1234',
      rawDescriptor: 'NETFLIX.COM',
    },
    {
      text: 'Debit purchase: WM SUPERCENTER #1234 $84.21 card xx1234',
      merchant: 'Wm Supercenter',
      amount: 84.21,
      cardLast4: '1234',
      rawDescriptor: 'WM SUPERCENTER #1234',
    },
    {
      text: 'CHICK-FIL-A #1234 $9.00 purchase approved.',
      merchant: 'Chick Fil A',
      amount: 9,
      rawDescriptor: 'CHICK-FIL-A #1234',
    },
    {
      text: 'AMEX: A $45.67 charge at THE HOME DEPOT 4712 was approved. Card ending 2222.',
      merchant: 'The Home Depot 4712',
      amount: 45.67,
      cardLast4: '2222',
      rawDescriptor: 'THE HOME DEPOT 4712',
    },
    {
      text: "US Bank: Debit card purchase of USD 15.20 at MCDONALD'S F12345 on 07/01/26. Reply STOP.",
      merchant: "Mcdonald's",
      amount: 15.2,
      occurredAt: '2026-07-01T12:00:00.000Z',
      rawDescriptor: "MCDONALD'S F12345",
    },
    {
      text: 'Citi Alert: Purchase for $8.99 from SPOTIFY USA on card ending in 9876.',
      merchant: 'Spotify Usa',
      amount: 8.99,
      cardLast4: '9876',
      rawDescriptor: 'SPOTIFY USA',
    },
    {
      text: "PNC Alert: VISA purchase approved MERCHANT: TRADER JOE'S #123 $76.54 card ending 4444",
      merchant: "Trader Joe's",
      amount: 76.54,
      cardLast4: '4444',
      rawDescriptor: "TRADER JOE'S #123",
    },
    {
      text: 'Wells Fargo: Card 1234 purchase GOOGLE *YouTubePremium $13.99',
      merchant: 'YouTube',
      amount: 13.99,
      cardLast4: '1234',
      rawDescriptor: 'GOOGLE *YouTubePremium',
    },
    {
      text: 'Chase Sapphire: You made a purchase of $18.42 at POS DEBIT PANERA BREAD CAFE. Msg & data rates may apply.',
      merchant: 'Panera Bread Cafe',
      amount: 18.42,
      rawDescriptor: 'POS DEBIT PANERA BREAD CAFE',
      normalizedDescriptor: 'PANERA BREAD CAFE',
    },
  ];

  for (const item of cases) {
    const parsed = parseTransactionIntake(item.text, 'sms');
    assert.equal(parsed?.merchant, item.merchant, item.text);
    assert.equal(parsed?.amount, item.amount, item.text);
    assert.equal(parsed?.rawDescriptor, item.rawDescriptor, item.text);
    if ('normalizedDescriptor' in item) {
      assert.equal(parsed?.normalizedDescriptor, item.normalizedDescriptor, item.text);
    }
    if ('cardLast4' in item) {
      assert.equal(parsed?.cardLast4, item.cardLast4, item.text);
    }
    if ('occurredAt' in item) {
      assert.equal(parsed?.occurredAt, item.occurredAt, item.text);
    }
    assert.equal(parsed?.merchant.includes('$'), false, item.text);
    assert.equal(/\b(?:approved|reply|stop|no action|see it|for help)\b/i.test(parsed?.merchant ?? ''), false, item.text);
  }
});

test('removes common payment processor prefixes from SMS merchants', () => {
  assert.equal(
    parseTransactionIntake('Card purchase $34.20 STRIPE *FIGMA card ending 8917.', 'sms')?.merchant,
    'Figma',
  );
  assert.equal(
    parseTransactionIntake('Card purchase $18.75 TOAST *CAFE LUNA card ending 8917.', 'sms')?.merchant,
    'Cafe Luna',
  );
  assert.equal(
    parseTransactionIntake('Debit card purchase $12.50 SQ*LASANG PINOY card ending 7780.', 'sms')?.merchant,
    'Lasang Pinoy',
  );
});

test('normalizes decimal comma amounts and day-month dates device-side', () => {
  const parsed = parseTransactionIntake(
    'Card purchase €1.234,56 STRIPE *FIGMA card ending 8917 on 27/06/26.',
    'sms',
  );

  assert.equal(parsed?.amount, 1234.56);
  assert.equal(parsed?.merchant, 'Figma');
  assert.equal(parsed?.normalizedDescriptor, 'FIGMA');
  assert.equal(parsed?.processorName, 'Stripe');
  assert.equal(parsed?.occurredAt, '2026-06-27T12:00:00.000Z');
});

test('ignores non-transaction text alerts with dollar amounts', () => {
  assert.equal(parseTransactionIntake('Your available balance is $500.00 as of 9:41 AM.', 'sms'), null);
  assert.equal(parseTransactionIntake('Your minimum payment of $25.00 is due on July 12.', 'sms'), null);
  assert.equal(parseTransactionIntake('A transaction for $12.50 at TARGET was declined.', 'sms'), null);
  assert.equal(parseTransactionIntake('Did you make a purchase of $12.50 at TARGET? Reply YES or NO.', 'sms'), null);
  assert.equal(parseTransactionIntake('Your debit card ending 1234 was charged $29.99.', 'sms'), null);
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
  assert.equal(
    explainTransactionIntakeRejection('Your debit card ending 1234 was charged $29.99.', 'sms'),
    'Ignored because no merchant could be found in the text.',
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
