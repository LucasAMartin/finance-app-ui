import { inferExpenseCategory } from '../voice/parseVoiceExpense';

export type TransactionIntakeSource = 'sms' | 'wallet' | 'shortcut' | 'url' | 'unknown';

export interface TransactionMerchantCandidate {
  text: string;
  score: number;
  reason: string;
}

export interface TransactionIntakeDraft {
  amount: number;
  merchant: string;
  cat: string;
  source: TransactionIntakeSource;
  note: string;
  cardLast4?: string;
  occurredAt?: string;
  rawDescriptor?: string;
  normalizedDescriptor?: string;
  processorName?: string;
  merchantCandidates?: TransactionMerchantCandidate[];
  rawText?: string;
  confidence: number;
}

export interface TransactionAutomationFingerprintInput {
  amount: number;
  merchant?: string;
  occurredAt?: string;
  cardLast4?: string;
  source?: TransactionIntakeSource;
}

const SOURCE_LABELS: Record<TransactionIntakeSource, string> = {
  sms: 'SMS alert',
  wallet: 'Wallet shortcut',
  shortcut: 'Shortcut',
  url: 'automation link',
  unknown: 'automation',
};

const MERCHANT_STOP = /\b(?:with|using|on|for|from)\s+(?:your\s+)?(?:credit|debit|card|visa|mastercard|amex|account)\b|\s+on\s+(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b|\b(?:card|account|acct)\s+(?:ending|ends(?:\s+in)?|[xX*.\s-]*\d{4})\b|\s+for\s+(?:USD\s*)?\$?\s*\d|\b(?:was|is|has\s+been)?\s*(?:approved|authorized|processed|posted|completed|successful|succeeded)\b(?:[.!]|\s|$)|(?:^|[\s,.])(?:above\s+your\s+(?:chosen\s+)?limit|above\s+the\s+limit|over\s+your\s+(?:chosen\s+)?limit|for\s+help|to\s+stop|reply|msg|message|data|rates?|apply|stop|txt|text|available|balance)\b|[.。]\s*(?:no\s+action|see\s+it|view|text|reply|msg|message|for\s+help|to\s+stop)\b|\s+https?:\/\/\S+/i;
const LEADING_MERCHANT_FILLER = /^(?:[\s:;,.=-]+|(?:was|is|has been)\s+|(?:made|authorized|approved|posted|processed|charged)\s+|(?:(?:at|to|from|merchant|purchase|charge|charged|transaction)\b)\s*)+/i;
const SMS_TRANSACTION_CUE = /\b(?:purchase|purchased|spent|charge|charged|transaction|authorization|authorized)\b|\b(?:card|visa|mastercard|amex)[^.!?]{0,50}\b(?:used|charged)\b/i;
const SMS_NON_TRANSACTION_CUE = /\b(?:verification|security|one[-\s]?time|otp|login|password|fraud|declined|denied|blocked|payment\s+due|minimum\s+payment|statement|auto\s*pay|autopay|payment\s+(?:received|posted|processed)|deposit|transfer|refund|credit\s+limit)\b|\b(?:did\s+you|was\s+this\s+you)\b|\breply\s+(?:yes|no)\b/i;
const SMS_FOOTER = /\b(?:above\s+your\s+(?:chosen\s+)?limit|above\s+the\s+limit|over\s+your\s+(?:chosen\s+)?limit|for\s+help|to\s+stop|no\s+action\s+needed|see\s+it|view|https?:\/\/|reply|msg|message|data|rates?|apply|stop|txt|text)\b.*$/i;
const MONEY_PATTERN = /(?:[$€£]|USD|EUR|GBP)?\s*[0-9]{1,3}(?:(?:[,\s.][0-9]{3})+)?[.,][0-9]{2}\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)?|\b[0-9]{1,6}[.,][0-9]{2}\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b/i;
const PROCESSOR_PREFIX = /^(?:SQ|SQUARE|TST|TOAST|SP|STRIPE|PAYPAL|PYPL|PP|POS|DEBIT|CLOVER|SHOP\s*PAY|SHOPIFY|VENMO|CASH\s*APP|CASHAPP|APPLE\s+PAY|GOOGLE\s+PAY)\b/i;
const DESCRIPTOR_STATUS = /^(?:was|is|has\s+been)?\s*(?:approved|authorized|processed|posted|completed|successful|succeeded)\s*[.!]?$/i;
const PROCESSOR_NAMES: Record<string, string> = {
  adyen: 'Adyen',
  afterpay: 'Afterpay',
  applepay: 'Apple Pay',
  cashapp: 'Cash App',
  clover: 'Clover',
  googlepay: 'Google Pay',
  klarna: 'Klarna',
  paypal: 'PayPal',
  pp: 'PayPal',
  pypl: 'PayPal',
  shopify: 'Shopify',
  shoppay: 'Shop Pay',
  square: 'Square',
  sq: 'Square',
  sp: 'Shopify',
  stripe: 'Stripe',
  toast: 'Toast',
  tst: 'Toast',
  venmo: 'Venmo',
  zelle: 'Zelle',
};

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeAutomationMerchant(value: string): string {
  return compact(value.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
}

export function transactionAutomationFingerprint(input: TransactionAutomationFingerprintInput): string | undefined {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined;

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const occurredAtMs = occurredAt.getTime();
  if (!Number.isFinite(occurredAtMs)) return undefined;

  const source = input.source ?? 'unknown';
  const amountCents = Math.round(input.amount * 100);
  const merchant = normalizeAutomationMerchant(input.merchant ?? '') || 'unknown';
  const minuteBucket = Math.floor(occurredAtMs / 60_000);
  const card = input.cardLast4?.replace(/\D/g, '').slice(-4) || 'unknown';
  return `${source}:v1:${amountCents}:${merchant}:${minuteBucket}:${card}`;
}

function parseAmount(text: string): number {
  const money = text.match(MONEY_PATTERN);
  if (!money) return 0;
  return parseLocalizedAmount(money[0]);
}

function parseLocalizedAmount(raw: string): number {
  let value = raw
    .replace(/\b(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b/gi, '')
    .replace(/[$€£]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!value) return 0;

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  const decimalSep = lastComma >= 0 && lastDot >= 0
    ? lastComma > lastDot ? ',' : '.'
    : lastComma >= 0
      ? ','
      : '.';
  const thousandSep = decimalSep === ',' ? '.' : ',';
  value = value.replace(new RegExp(`\\${thousandSep}`, 'g'), '');
  if (decimalSep === ',') value = value.replace(',', '.');

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function parseOccurredAt(text: string): string | undefined {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }

  const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{2,4})\b/i);
  if (named) {
    const month = monthIndex(named[1]);
    const day = parseInt(named[2], 10);
    const rawYear = parseInt(named[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(Date.UTC(year, month, day, 12));
    if (
      month >= 0 &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month &&
      date.getUTCDate() === day
    ) {
      return date.toISOString();
    }
  }

  const slash = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (!slash) return undefined;

  const first = parseInt(slash[1], 10);
  const second = parseInt(slash[2], 10);
  const rawYear = parseInt(slash[3], 10);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const month = first > 12 && second <= 12 ? second : first;
  const day = first > 12 && second <= 12 ? first : second;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString();
}

function monthIndex(value: string): number {
  const key = value.slice(0, 3).toLowerCase();
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key);
}

function isLikelySmsTransaction(text: string): boolean {
  return SMS_TRANSACTION_CUE.test(text) && !SMS_NON_TRANSACTION_CUE.test(text);
}

export function explainTransactionIntakeRejection(
  rawText: string,
  source: TransactionIntakeSource = 'unknown',
): string | null {
  const text = compact(rawText);
  if (!text) {
    return source === 'sms'
      ? 'No receipt text reached finance-app. In Shortcuts, tap the blank text field in Process Receipt and choose Shortcut Input.'
      : 'No transaction text was provided.';
  }

  const amount = parseAmount(text);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'No transaction amount was found.';
  }

  if (source === 'sms') {
    if (SMS_NON_TRANSACTION_CUE.test(text)) {
      return 'Ignored because this looks like a non-purchase card alert.';
    }
    if (!SMS_TRANSACTION_CUE.test(text)) {
      return 'Ignored because the text did not include purchase, spent, charge, transaction, or authorized.';
    }
    if (!parseMerchant(text)) {
      return 'Ignored because no merchant could be found in the text.';
    }
  }

  return null;
}

function parseCardLast4(text: string): string | undefined {
  const match = text.match(/(?:card|account|acct|ending|ends(?:\s+in)?)[^\d]{0,12}(?:[xX*.\s-]*)(\d{4})\b/i);
  return match?.[1];
}

function stripSmsFooter(text: string): string {
  return compact(text.replace(SMS_FOOTER, ''));
}

function isDateSegment(value: string): boolean {
  return /^\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\s*[.]?\s*$/.test(value);
}

function isCardSegment(value: string): boolean {
  return /\b(?:card|account|acct)\b[^\d]{0,20}(?:ending|ends(?:\s+in)?|[xX*.\s-]+)\d{4}\b/i.test(value);
}

function startsWithCardContext(value: string): boolean {
  return /^[\s,;:.-]*(?:credit|debit)?\s*(?:card|account|acct)\b/i.test(value);
}

function cleanupDescriptor(raw: string): string {
  return stripSmsFooter(raw)
    .replace(/\s*[.,;:!]+$/g, '')
    .replace(/^[\s:;,.=-]+/, '')
    .trim();
}

function firstStopIndex(value: string): number {
  const stops = [
    value.search(MERCHANT_STOP),
    value.search(MONEY_PATTERN),
  ].filter(index => index >= 0);
  return stops.length ? Math.min(...stops) : -1;
}

function isDescriptorNoise(value: string): boolean {
  const clean = cleanupDescriptor(value);
  return !/[\p{L}]/u.test(clean)
    || DESCRIPTOR_STATUS.test(clean)
    || startsWithCardContext(clean)
    || MONEY_PATTERN.test(clean);
}

function processorNameFromPrefix(value: string): string | undefined {
  const match = compact(value).match(PROCESSOR_PREFIX);
  if (!match) return undefined;
  const key = normalizeAutomationMerchant(match[0]).replace(/\s+/g, '');
  return PROCESSOR_NAMES[key];
}

function stripProcessorPrefixes(raw: string): string {
  let value = raw;
  for (let i = 0; i < 4; i += 1) {
    const next = value.replace(PROCESSOR_PREFIX, '').replace(/^[\s*#:-]+/, '');
    if (next === value) break;
    value = next;
  }
  return value;
}

function normalizeDescriptor(raw: string): string | undefined {
  let value = cleanupDescriptor(raw)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^[#*•\s-]+/, '');

  value = stripProcessorPrefixes(value);
  value = value
    .replace(/\b(?:card|acct|account|visa|mastercard|amex)\b.*$/i, '')
    .replace(/\b(?:store|terminal|term|auth|ref|id)\s*#?\s*[A-Z0-9-]{3,}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[.,;:!]+$/g, '')
    .trim();

  return /[\p{L}]/u.test(value) ? value : undefined;
}

function descriptorFromCandidate(raw: string): string {
  const candidate = cleanupDescriptor(raw).replace(LEADING_MERCHANT_FILLER, '');
  const stop = firstStopIndex(candidate);
  const descriptor = cleanupDescriptor(stop >= 0 ? candidate.slice(0, stop) : candidate);
  return isDescriptorNoise(descriptor) ? '' : descriptor;
}

function descriptorBeforeAmount(text: string, amountIndex: number): string | undefined {
  const beforeAmount = cleanupDescriptor(text.slice(0, amountIndex));
  if (!beforeAmount) return undefined;

  let candidate = beforeAmount
    .replace(/^[^:]{1,48}:\s*/i, '')
    .replace(/.*?\b(?:(?:debit|credit)\s+card|visa|mastercard|amex|card)(?:\s*(?:ending|ends(?:\s+in)?|[xX*.\s-]*\d{4}|\d{4}))?\s+(?:purchase|transaction|charge|charged|authorization|authorized|spent)\b\s*(?:of|for|was|made|approved|posted|processed)?\s*/i, '')
    .replace(/.*?\b(?:purchase|transaction|charge|charged|authorization|authorized|spent)\b\s*(?:of|for|was|made|approved|posted|processed)?\s*/i, '')
    .trim();

  candidate = descriptorFromCandidate(candidate);
  if (!candidate || isDescriptorNoise(candidate)) return undefined;
  return /[\p{L}]/u.test(candidate) ? candidate : undefined;
}

function parseRawDescriptor(text: string): string | undefined {
  const withoutFooter = stripSmsFooter(text);

  const explicit = withoutFooter.match(/\b(?:at|from|to|by)\s+(.+)$/i);
  if (explicit) {
    const descriptor = descriptorFromCandidate(explicit[1]);
    if (descriptor) return descriptor;
  }

  const parts = withoutFooter.split(/\s*,\s*/).map(part => part.trim()).filter(Boolean);
  const cardIndex = parts.findIndex(isCardSegment);
  if (cardIndex >= 0) {
    for (let i = cardIndex + 1; i < parts.length; i += 1) {
      const part = parts[i];
      if (isDateSegment(part) || isCardSegment(part) || MONEY_PATTERN.test(part)) continue;
      if (/[\p{L}\p{N}]/u.test(part)) return cleanupDescriptor(part);
    }
  }

  const amountMatch = withoutFooter.match(MONEY_PATTERN);
  if (amountMatch?.index !== undefined) {
    const afterAmount = withoutFooter.slice(amountMatch.index + amountMatch[0].length);
    if (!startsWithCardContext(afterAmount)) {
      const descriptor = descriptorFromCandidate(afterAmount);
      if (descriptor) return descriptor;
    }

    const descriptor = descriptorBeforeAmount(withoutFooter, amountMatch.index);
    if (descriptor) return descriptor;
  }

  return undefined;
}

function candidateKey(value: string): string {
  return normalizeAutomationMerchant(value).replace(/\s+/g, '');
}

function addMerchantCandidate(
  candidates: TransactionMerchantCandidate[],
  seen: Set<string>,
  raw: string | undefined,
  reason: string,
  score: number,
) {
  if (!raw) return;
  const text = cleanupMerchant(raw);
  const key = candidateKey(text);
  if (!key || seen.has(key)) return;
  seen.add(key);
  candidates.push({ text, reason, score });
}

function parseMerchantCandidates(text: string, merchant: string, rawDescriptor?: string): TransactionMerchantCandidate[] {
  const searchable = stripSmsFooter(text);
  const candidates: TransactionMerchantCandidate[] = [];
  const seen = new Set<string>();

  addMerchantCandidate(candidates, seen, merchant, 'parsed_merchant', merchant ? 0.9 : 0);

  const normalizedDescriptor = rawDescriptor ? normalizeDescriptor(rawDescriptor) : undefined;
  addMerchantCandidate(candidates, seen, normalizedDescriptor, 'normalized_descriptor', 0.86);
  addMerchantCandidate(candidates, seen, rawDescriptor, 'raw_descriptor', 0.76);

  const explicit = searchable.match(/\b(?:at|from|to|by)\s+(.+)$/i);
  addMerchantCandidate(
    candidates,
    seen,
    explicit ? descriptorFromCandidate(explicit[1]) : undefined,
    'after_preposition',
    0.88,
  );

  const amountMatch = searchable.match(MONEY_PATTERN);
  if (amountMatch?.index !== undefined) {
    const afterAmount = searchable.slice(amountMatch.index + amountMatch[0].length);
    if (!startsWithCardContext(afterAmount)) {
      addMerchantCandidate(candidates, seen, descriptorFromCandidate(afterAmount), 'after_amount', 0.74);
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function titleCaseMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s/&().,#-])(\p{L})/gu, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

function cleanBrandToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function domainDescriptorAlias(value: string): string | undefined {
  const match = value.match(/\b([A-Z0-9][A-Z0-9_-]*(?:\.[A-Z0-9][A-Z0-9_-]*)+)\b/i);
  if (!match) return undefined;
  const labels = match[1].split('.');
  const tld = labels[labels.length - 1].toLowerCase();
  if (!/^(?:ai|app|co|com|io|net|org|so|us)$/.test(tld)) return undefined;
  const first = labels[0].toLowerCase();
  const supportLabels = new Set(['help', 'support', 'secure', 'www']);
  const brandLabel = supportLabels.has(first) && labels.length > 2 ? labels[1] : labels[0];
  const brand = cleanBrandToken(brandLabel);
  return brand ? titleCaseMerchant(brand) : undefined;
}

function storeLocationAlias(value: string): string | undefined {
  const hadStoreMarker = /(?:^|[\s,])#\s*[A-Z0-9-]{2,}\b|\b(?:store|location|loc|terminal|term)\s*#?\s*[A-Z0-9-]{2,}\b|\b[A-Z]{1,3}-?\d{3,}\b/.test(value);
  if (!hadStoreMarker) return undefined;

  const base = value
    .replace(/\b(?:store|location|loc|terminal|term)\s*#?\s*[A-Z0-9-]{2,}\b/gi, '')
    .replace(/(?:^|[\s,])#\s*[A-Z0-9-]{2,}(?:\s+[A-Z])?\b/gi, '')
    .replace(/\b[A-Z]{1,3}-?\d{3,}\b/g, '')
    .replace(/\s*,\s*[\p{L} .'-]{2,}$/u, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[.,;:!]+$/g, '')
    .trim();

  return base && /[\p{L}]/u.test(base)
    ? titleCaseMerchant(cleanBrandToken(base))
    : undefined;
}

function merchantAlias(value: string): string | undefined {
  const genericAlias = domainDescriptorAlias(value) ?? storeLocationAlias(value);
  if (genericAlias) return genericAlias;

  const compacted = normalizeAutomationMerchant(value).replace(/\s+/g, '');
  if (compacted.includes('openai')) return 'OpenAI';
  if (compacted.includes('anthropic')) return 'Anthropic';
  if (/^(amzn|amazon|amazonmktp|amznmktp)/.test(compacted)) return 'Amazon';
  if (compacted.includes('applecombill') || compacted.includes('itunes')) return 'Apple';
  if (compacted.includes('googleyoutube')) return 'YouTube';
  return undefined;
}

function cleanupMerchant(raw: string): string {
  let value = compact(raw)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^[#*•\s-]+/, '')
    .replace(/\s*[.,;:!]+$/g, '');

  const initialAlias = merchantAlias(value);
  if (initialAlias) return initialAlias;

  // Common processor prefixes from card alerts. Keep the actual merchant.
  value = normalizeDescriptor(value) ?? '';

  const alias = merchantAlias(value);
  if (alias) return alias;

  if (value.length <= 3) return value.toUpperCase();
  if (/[a-z]/.test(value)) return value;
  return titleCaseMerchant(value);
}

function merchantFromCandidate(raw: string): string {
  const candidate = compact(raw).replace(LEADING_MERCHANT_FILLER, '');
  const stop = firstStopIndex(candidate);
  const descriptor = cleanupDescriptor(stop >= 0 ? candidate.slice(0, stop) : candidate);
  return isDescriptorNoise(descriptor) ? '' : cleanupMerchant(descriptor);
}

function parseMerchant(text: string): string {
  const searchable = stripSmsFooter(text);
  const patterns = [
    /\b(?:at|from|to|by)\s+(.+)$/i,
    /\bmerchant\s*[:=-]\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = searchable.match(pattern);
    if (!match) continue;
    const merchant = merchantFromCandidate(match[1]);
    if (merchant) return merchant;
  }

  const rawDescriptor = parseRawDescriptor(searchable);
  if (rawDescriptor) {
    const merchant = merchantFromCandidate(rawDescriptor);
    if (merchant) return merchant;
  }

  const amountMatch = searchable.match(MONEY_PATTERN);
  if (amountMatch?.index !== undefined) {
    const afterAmount = searchable.slice(amountMatch.index + amountMatch[0].length);
    if (!startsWithCardContext(afterAmount)) {
      const merchant = merchantFromCandidate(afterAmount);
      if (merchant) return merchant;
    }

    const descriptor = descriptorBeforeAmount(searchable, amountMatch.index);
    if (descriptor) {
      const merchant = merchantFromCandidate(descriptor);
      if (merchant) return merchant;
    }
  }

  return '';
}

function noteFor(source: TransactionIntakeSource): string {
  return `Imported from ${SOURCE_LABELS[source]}`;
}

export function parseTransactionIntake(
  rawText: string,
  source: TransactionIntakeSource = 'unknown',
): TransactionIntakeDraft | null {
  const text = compact(rawText);
  if (!text) return null;

  const amount = parseAmount(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (source === 'sms' && !isLikelySmsTransaction(text)) return null;

  const rawDescriptor = parseRawDescriptor(text);
  const normalizedDescriptor = rawDescriptor ? normalizeDescriptor(rawDescriptor) : undefined;
  const processorName = rawDescriptor ? processorNameFromPrefix(rawDescriptor) : undefined;
  const merchant = parseMerchant(text);
  if (source === 'sms' && !merchant) return null;
  const merchantCandidates = parseMerchantCandidates(text, merchant, rawDescriptor);
  const categoryProbe = `${merchant} ${rawDescriptor ?? ''} ${text}`;
  const cat = inferExpenseCategory(categoryProbe);
  const cardLast4 = parseCardLast4(text);
  const occurredAt = parseOccurredAt(text);
  const alias = merchant ? merchantAlias(`${merchant} ${normalizedDescriptor ?? ''}`) : undefined;
  const confidence = merchant ? (alias ? 0.93 : rawDescriptor ? 0.88 : 0.86) : 0.58;

  return {
    amount,
    merchant,
    cat,
    source,
    note: noteFor(source),
    cardLast4,
    occurredAt,
    rawDescriptor,
    normalizedDescriptor,
    processorName,
    merchantCandidates,
    rawText: text,
    confidence,
  };
}

export function transactionIntakeSourceLabel(source: TransactionIntakeSource): string {
  return SOURCE_LABELS[source];
}
