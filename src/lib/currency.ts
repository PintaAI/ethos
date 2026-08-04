export interface CurrencyOption {
  code: string;
  name: string;
  locale: string;
  symbol: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: "IDR", name: "Rupiah", locale: "id-ID", symbol: "Rp", flag: "🇮🇩" },
  { code: "KRW", name: "Won", locale: "ko-KR", symbol: "₩", flag: "🇰🇷" },
  { code: "JPY", name: "Yen", locale: "ja-JP", symbol: "¥", flag: "🇯🇵" },
  { code: "VND", name: "Dong", locale: "vi-VN", symbol: "₫", flag: "🇻🇳" },
  { code: "USD", name: "US Dollar", locale: "en-US", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", locale: "de-DE", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "Pound Sterling", locale: "en-GB", symbol: "£", flag: "🇬🇧" },
  { code: "SGD", name: "Singapore Dollar", locale: "en-SG", symbol: "S$", flag: "🇸🇬" },
  { code: "AUD", name: "Australian Dollar", locale: "en-AU", symbol: "A$", flag: "🇦🇺" },
  { code: "MYR", name: "Ringgit", locale: "ms-MY", symbol: "RM", flag: "🇲🇾" },
  { code: "CNY", name: "Yuan", locale: "zh-CN", symbol: "¥", flag: "🇨🇳" },
  { code: "THB", name: "Baht", locale: "th-TH", symbol: "฿", flag: "🇹🇭" },
  { code: "PHP", name: "Peso", locale: "en-PH", symbol: "₱", flag: "🇵🇭" },
];

export const CURRENCY_DENOMINATIONS: Record<string, number[]> = {
  IDR: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
  KRW: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
  JPY: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
  VND: [10000, 20000, 50000, 100000, 200000, 500000],
  USD: [1, 2, 5, 10, 20, 50, 100],
  EUR: [1, 2, 5, 10, 20, 50, 100],
  GBP: [1, 2, 5, 10, 20, 50, 100],
  SGD: [1, 2, 5, 10, 20, 50, 100],
  AUD: [1, 2, 5, 10, 20, 50, 100],
  MYR: [1, 5, 10, 20, 50, 100],
  THB: [20, 50, 100, 500, 1000],
  PHP: [20, 50, 100, 200, 500, 1000],
  CNY: [1, 5, 10, 20, 50, 100],
};

const NO_DECIMAL_CURRENCIES = new Set(["IDR", "KRW", "JPY", "VND"]);
const CUSTOM_COMPACT_CURRENCIES = new Set(["IDR", "KRW", "JPY", "VND"]);

export function getCurrencyOption(code: string): CurrencyOption {
  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code) ?? SUPPORTED_CURRENCIES[0];
}

export function getCurrencyDecimals(code: string): number {
  return NO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
}

export function getDenominations(currencyCode: string): number[] {
  return CURRENCY_DENOMINATIONS[currencyCode] ?? CURRENCY_DENOMINATIONS.IDR;
}

export function convertFromIdr(amountIdr: number, targetCurrency: string, rate: number): number {
  if (targetCurrency === "IDR") return amountIdr;
  return amountIdr * rate;
}

export function convertToIdr(displayAmount: number, sourceCurrency: string, rate: number): number {
  if (sourceCurrency === "IDR") return displayAmount;
  if (rate === 0) return displayAmount;
  return displayAmount / rate;
}

export function formatCurrencyAmount(
  amount: number,
  currencyCode = "IDR",
  options?: { compact?: boolean; locale?: string },
): string {
  const currency = getCurrencyOption(currencyCode);
  const locale = options?.locale ?? currency.locale;
  const compact = options?.compact ?? false;
  const fractionDigits = getCurrencyDecimals(currencyCode);

  if (compact && CUSTOM_COMPACT_CURRENCIES.has(currencyCode)) {
    const absolute = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    const formatShort = (value: number) => {
      const fractionDigits = Number.isInteger(value) ? 0 : 1;
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value);
    };

    if (currencyCode === "IDR") {
      if (absolute >= 1_000_000_000) return `${sign}${currency.symbol}${formatShort(absolute / 1_000_000_000)} M`;
      if (absolute >= 1_000_000) return `${sign}${currency.symbol}${formatShort(absolute / 1_000_000)} jt`;
      if (absolute >= 1_000) return `${sign}${currency.symbol}${formatShort(absolute / 1_000)} rb`;
      return `${sign}${currency.symbol}${Math.round(absolute).toLocaleString(locale)}`;
    }

    if (absolute >= 1_000_000) {
      const value = absolute / 1_000_000;
      const formatted = formatShort(value);
      return `${sign}${currency.symbol}${formatted}jt`;
    }

    if (absolute >= 1_000) {
      const value = absolute / 1_000;
      const formatted = formatShort(value);
      return `${sign}${currency.symbol}${formatted}k`;
    }

    return `${sign}${currency.symbol}${Math.round(absolute).toLocaleString(locale)}`;
  }

  if (compact) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      notation: "compact",
      compactDisplay: "short",
    }).format(amount);
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function formatIdr(amount: number, options?: { compact?: boolean }): string {
  return formatCurrencyAmount(amount, "IDR", options);
}

export function formatEntryAmount(
  entry: { nominal: number; originalNominal?: number | null; originalCurrency?: string | null },
  currency: string,
  formatBase: (amountIdr: number, options?: { compact?: boolean }) => string,
  options?: { compact?: boolean },
): string {
  if (entry.originalNominal !== null && entry.originalNominal !== undefined && entry.originalCurrency === currency) {
    return formatCurrencyAmount(entry.originalNominal, entry.originalCurrency, options);
  }

  return formatBase(entry.nominal, options);
}
