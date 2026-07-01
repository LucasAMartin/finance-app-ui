import { inferExpenseCategory } from '../voice/parseVoiceExpense';

export type TransactionIntakeSource = 'sms' | 'wallet' | 'shortcut' | 'url' | 'unknown';

export interface TransactionIntakeDraft {
  amount: number;
  merchant: string;
  cat: string;
  source: TransactionIntakeSource;
  note: string;
  cardLast4?: string;
  occurredAt?: string;
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

const MERCHANT_STOP = /\b(?:with|using|on|for|from)\s+(?:your\s+)?(?:credit|debit|card|visa|mastercard|amex|account)\b|\b(?:card|account|acct)\s+(?:ending|ends(?:\s+in)?|[xX*.\s-]*\d{4})\b|\s+for\s+(?:USD\s*)?\$?\s*\d|(?:^|\s)(?:reply|msg|message|data|rates?|apply|stop|txt|available|balance)\b|[.。]\s*(?:reply|msg|message)\b/i;
const LEADING_MERCHANT_FILLER = /^(?:[\s:;,.=-]+|(?:was|is|has been)\s+|(?:made|authorized|approved|posted|processed)\s+|(?:at|to|from|merchant|purchase|charge|transaction)\s*)+/i;
const SMS_TRANSACTION_CUE = /\b(?:purchase|purchased|spent|charge|charged|transaction|authorization|authorized)\b|\b(?:card|visa|mastercard|amex)[^.!?]{0,50}\b(?:used|charged)\b/i;
const SMS_NON_TRANSACTION_CUE = /\b(?:verification|security|one[-\s]?time|otp|login|password|fraud|declined|denied|blocked|payment\s+due|minimum\s+payment|statement|auto\s*pay|autopay|payment\s+(?:received|posted|processed)|deposit|transfer|refund|credit\s+limit)\b|\b(?:did\s+you|was\s+this\s+you)\b|\breply\s+(?:yes|no)\b/i;

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
  const money = text.match(/(?:USD\s*)?\$?\s*([0-9]{1,6})(?:[.,]([0-9]{2}))\b|\b([0-9]{1,6})(?:[.,]([0-9]{2}))\s*(?:USD|dollars?)\b/i);
  if (!money) return 0;
  const dollars = parseInt(money[1] ?? money[3], 10);
  const cents = parseInt(money[2] ?? money[4] ?? '0', 10);
  return dollars + cents / 100;
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
  }

  return null;
}

function parseCardLast4(text: string): string | undefined {
  const match = text.match(/(?:card|account|acct|ending|ends(?:\s+in)?)[^\d]{0,12}(?:[xX*.\s-]*)(\d{4})\b/);
  return match?.[1];
}

function cleanupMerchant(raw: string): string {
  let value = compact(raw)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^[#*•\s-]+/, '')
    .replace(/\s*[.,;:!]+$/g, '');

  // Common processor prefixes from card alerts. Keep the actual merchant.
  value = value.replace(/^(?:SQ|TST|SP|PAYPAL|PP|POS|DEBIT|APPLE\s+PAY)\s*[*-]\s*/i, '');
  value = value.replace(/^(?:SQ|TST|SP)\s+/i, '');

  if (value.length <= 3) return value.toUpperCase();
  if (/[a-z]/.test(value)) return value;
  return value
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function merchantFromCandidate(raw: string): string {
  const candidate = compact(raw).replace(LEADING_MERCHANT_FILLER, '');
  const stop = candidate.search(MERCHANT_STOP);
  return cleanupMerchant(stop >= 0 ? candidate.slice(0, stop) : candidate);
}

function parseMerchant(text: string): string {
  const patterns = [
    /\b(?:at|from|to)\s+(.+)$/i,
    /\bmerchant\s*[:=-]\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const merchant = merchantFromCandidate(match[1]);
    if (merchant) return merchant;
  }

  const amountMatch = text.match(/(?:USD\s*)?\$?\s*[0-9]{1,6}(?:[.,][0-9]{2})\b|\b[0-9]{1,6}(?:[.,][0-9]{2})\s*(?:USD|dollars?)\b/i);
  if (amountMatch?.index !== undefined) {
    const afterAmount = text.slice(amountMatch.index + amountMatch[0].length);
    const merchant = merchantFromCandidate(afterAmount);
    if (merchant) return merchant;
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

  const merchant = parseMerchant(text);
  const categoryProbe = `${merchant} ${text}`;
  const cat = inferExpenseCategory(categoryProbe);
  const cardLast4 = parseCardLast4(text);
  const confidence = merchant ? 0.86 : 0.58;

  return {
    amount,
    merchant,
    cat,
    source,
    note: noteFor(source),
    cardLast4,
    rawText: text,
    confidence,
  };
}

export function transactionIntakeSourceLabel(source: TransactionIntakeSource): string {
  return SOURCE_LABELS[source];
}
