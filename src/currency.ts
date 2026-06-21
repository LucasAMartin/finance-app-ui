export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  decimals: 0 | 2;
}

export const DEFAULT_CURRENCY_CODE = 'USD';

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar', decimals: 2 },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar', decimals: 2 },
  { code: 'NZD', symbol: '$', name: 'New Zealand Dollar', decimals: 2 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', decimals: 2 },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', decimals: 2 },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso', decimals: 2 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0 },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', decimals: 0 },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 0 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2 },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', decimals: 2 },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar', decimals: 2 },
  { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar', decimals: 2 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2 },
];

const CURRENCY_BY_CODE = new Map(CURRENCY_OPTIONS.map(currency => [currency.code, currency]));
let activeCurrencyCode = DEFAULT_CURRENCY_CODE;

export function normalizeCurrencyCode(value: unknown): string {
  return typeof value === 'string' && CURRENCY_BY_CODE.has(value)
    ? value
    : DEFAULT_CURRENCY_CODE;
}

export function getCurrencyOption(code: unknown): CurrencyOption {
  return CURRENCY_BY_CODE.get(normalizeCurrencyCode(code)) ?? CURRENCY_OPTIONS[0];
}

export function setActiveCurrencyCode(code: unknown) {
  activeCurrencyCode = normalizeCurrencyCode(code);
}

export function getActiveCurrency() {
  return getCurrencyOption(activeCurrencyCode);
}

export function currencyDecimals(currency: CurrencyOption, requestedDecimals?: number | boolean) {
  if (currency.decimals === 0) return 0;
  if (typeof requestedDecimals === 'number') return Math.max(0, Math.min(2, requestedDecimals));
  if (requestedDecimals === false) return 0;
  return 2;
}

export function formatCurrencyAmount(
  value: number,
  currency: CurrencyOption,
  requestedDecimals?: number | boolean,
) {
  const decimals = currencyDecimals(currency, requestedDecimals);
  const abs = Math.abs(value);
  const rounded = decimals === 0 ? Math.round(abs) : abs;
  return `${currency.symbol}${rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatActiveCurrencyAmount(value: number, requestedDecimals?: number | boolean) {
  return formatCurrencyAmount(value, getActiveCurrency(), requestedDecimals);
}
