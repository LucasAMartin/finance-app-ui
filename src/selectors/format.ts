// Shared string-formatting utilities. Use these for accessibility labels,
// toast copy, and any context where the Money component cannot be used.
import { formatActiveCurrencyAmount, formatCurrencyAmount, getCurrencyOption } from '../currency';

/**
 * Formats a numeric amount as a currency string.
 * Use the `Money` component (src/components/shared.tsx) for rendered text nodes.
 * @param value  Numeric amount (e.g. 12.5)
 * @param cents  Whether to always show 2 decimal places (default true)
 */
export function formatMoney(value: number, cents: boolean | number = true, currencyCode = 'active'): string {
  if (currencyCode === 'active') return formatActiveCurrencyAmount(value, cents);
  const currency = getCurrencyOption(currencyCode);
  if (typeof cents === 'number') return formatCurrencyAmount(value, currency, cents);
  return formatCurrencyAmount(value, currency, cents);
}
