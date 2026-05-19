export interface ParsedExpense {
  amount: number;
  cat: string;
  merchant: string;
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const MONEY_WORDS = new Set(['dollar', 'dollars', 'buck', 'bucks', 'cent', 'cents']);

// Spoken keyword -> category id. Ids must match the keys of CATS in ../data.
const CAT_KEYWORDS: Record<string, string> = {
  groceries: 'groceries', grocery: 'groceries', supermarket: 'groceries',
  market: 'groceries',
  dining: 'dining', dinner: 'dining', lunch: 'dining', breakfast: 'dining',
  brunch: 'dining', restaurant: 'dining', takeout: 'dining', food: 'dining',
  cafe: 'dining', latte: 'dining', espresso: 'dining', cappuccino: 'dining',
  cortado: 'dining', tea: 'dining', starbucks: 'dining',
  transport: 'transport', transit: 'transport', uber: 'transport',
  lyft: 'transport', taxi: 'transport', cab: 'transport', gas: 'transport',
  fuel: 'transport', train: 'transport', bus: 'transport', parking: 'transport',
  shopping: 'shopping', shop: 'shopping', clothes: 'shopping',
  clothing: 'shopping', amazon: 'shopping', store: 'shopping',
  bill: 'bills', bills: 'bills', utility: 'bills', utilities: 'bills',
  rent: 'bills', electric: 'bills', electricity: 'bills', internet: 'bills',
  entertainment: 'entertainment', movie: 'entertainment',
  movies: 'entertainment', netflix: 'entertainment', spotify: 'entertainment',
  concert: 'entertainment', game: 'entertainment', games: 'entertainment',
};

const DEFAULT_CAT = 'dining';

const isNumberWord = (t: string) => t in ONES || t in TENS || t === 'hundred';

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

function numericValue(parts: string[]): number {
  let current = 0;
  for (const t of parts) {
    if (t in ONES) current += ONES[t];
    else if (t in TENS) current += TENS[t];
    else if (t === 'hundred') current = (current || 1) * 100;
  }
  return current;
}

function parseAmount(lower: string): number {
  // 1. Explicit decimal separator: "$6.50", "6.50", "14,80"
  const decimal = lower.match(/\$?\s*(\d+)[.,](\d{1,2})(?!\d)/);
  if (decimal) {
    const dollars = parseInt(decimal[1], 10);
    const cents = parseInt(decimal[2].padEnd(2, '0'), 10);
    return dollars + cents / 100;
  }

  // 2. Space-separated dollar-cents — Apple SR output for spoken prices:
  //    "6 50" → $6.50   "104 59" → $104.59
  const spaced = lower.match(/(?<!\d)(\d+) +(\d{2})(?!\d)/);
  if (spaced) {
    return parseInt(spaced[1], 10) + parseInt(spaced[2], 10) / 100;
  }

  // 3. Bare 3-digit number without a $ sign — Apple SR merges "six fifty" → "650".
  //    Treat as X dollars + YY cents. Skip round hundreds ("500", "300") since those
  //    are unambiguous whole-dollar amounts.
  if (!/\$/.test(lower)) {
    const merged = lower.match(/(?<!\d)([1-9])(\d{2})(?!\d)/);
    if (merged && merged[2] !== '00') {
      return parseInt(merged[1], 10) + parseInt(merged[2], 10) / 100;
    }
  }

  // 4. Plain digit with optional $: "$650", "500", "20"
  const plain = lower.match(/\$?\s*(\d+)/);
  if (plain) return parseInt(plain[1], 10);

  // 5. Spoken number words
  const run: string[] = [];
  let started = false;
  for (const t of tokens(lower)) {
    if (isNumberWord(t)) {
      started = true;
      run.push(t);
    } else if (started && (t === 'and' || MONEY_WORDS.has(t))) {
      run.push(t);
    } else if (started) {
      break;
    }
  }
  if (run.length === 0) return 0;

  const numbers = run.filter(isNumberWord);
  const dollarAt = run.findIndex((t) => t === 'dollar' || t === 'dollars' || t === 'buck' || t === 'bucks');
  const centAt = run.findIndex((t) => t === 'cent' || t === 'cents');

  if (dollarAt !== -1) {
    const dollars = numericValue(run.slice(0, dollarAt).filter(isNumberWord));
    const cents = numericValue(run.slice(dollarAt + 1).filter(isNumberWord));
    return dollars + cents / 100;
  }
  if (centAt !== -1) {
    return numericValue(numbers) / 100;
  }
  // Colloquial: "ten ninety nine" → $10.99, "six fifty" → $6.50
  if (numbers.length === 3 && numbers[0] in ONES && numbers[1] in TENS && numbers[2] in ONES) {
    return ONES[numbers[0]] + (TENS[numbers[1]] + ONES[numbers[2]]) / 100;
  }
  if (numbers.length === 2 && numbers[0] in ONES && numbers[1] in TENS) {
    return ONES[numbers[0]] + TENS[numbers[1]] / 100;
  }
  return numericValue(numbers);
}

function parseCategory(lower: string): string {
  for (const t of tokens(lower)) {
    if (CAT_KEYWORDS[t]) return CAT_KEYWORDS[t];
  }
  return DEFAULT_CAT;
}

function parseMerchant(text: string): string {
  // Merchant follows "at" or "from"; stop once we reach the spoken amount.
  const match = text.match(/\b(?:at|from)\s+(.+)/i);
  if (!match) return '';
  const collected: string[] = [];
  for (const raw of match[1].split(/\s+/)) {
    const word = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (isNumberWord(word) || MONEY_WORDS.has(word) || /\d/.test(raw)) break;
    collected.push(raw);
  }
  return collected.join(' ').replace(/[.,!?;:]+$/, '').trim();
}

/**
 * Turns a free-form voice transcript into best-effort budget fields.
 * Examples:
 *   "Dinner at Nopa six fifty"     -> { amount: 6.5,   cat: 'dining',   merchant: 'Nopa' }
 *   "Groceries, twenty dollars"    -> { amount: 20,    cat: 'groceries', merchant: '' }
 *   "Transport from Lyft 14 80"    -> { amount: 14.8,  cat: 'transport', merchant: 'Lyft' }
 *   "Starbucks 650"                -> { amount: 6.5,   cat: 'dining',   merchant: '' }
 */
export function parseVoiceExpense(transcript: string): ParsedExpense {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  return {
    amount: parseAmount(lower),
    cat: parseCategory(lower),
    merchant: parseMerchant(text),
  };
}
