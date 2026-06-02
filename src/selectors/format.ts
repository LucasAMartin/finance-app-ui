// Shared string-formatting utilities. Use these for accessibility labels,
// toast copy, and any context where the Money component cannot be used.

/**
 * Formats a numeric amount as a currency string.
 * Use the `Money` component (src/components/shared.tsx) for rendered text nodes.
 * @param value  Numeric amount (e.g. 12.5)
 * @param cents  Whether to always show 2 decimal places (default true)
 */
export function formatMoney(value: number, cents = true): string {
  if (cents) return `$${value.toFixed(2)}`;
  return value % 1 === 0 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}
