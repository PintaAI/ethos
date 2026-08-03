import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  convertFromIdr,
  convertToIdr,
  formatCurrencyAmount,
  getCurrencyOption,
  getDenominations,
  type CurrencyOption,
} from "@/lib/currency";
import { getExchangeRates, getUserCurrency, updateUserCurrency } from "@/lib/api/preferences";
import { getPreference, setPreference, type CashflowStatsPeriod } from "@/lib/preferences";

type CurrencyContextValue = {
  currency: string;
  option: CurrencyOption;
  rates: Record<string, number>;
  rate: number;
  isIdr: boolean;
  compactAmountsEnabled: boolean;
  cashflowAmountsVisible: boolean;
  cashflowStatsPeriod: CashflowStatsPeriod;
  format: (amountIdr: number, options?: { compact?: boolean }) => string;
  toIdr: (displayAmount: number) => number;
  toDisplay: (amountIdr: number) => number;
  setCurrency: (code: string) => void;
  setCompactAmountsEnabled: (enabled: boolean) => void;
  setCashflowAmountsVisible: (visible: boolean) => void;
  setCashflowStatsPeriod: (period: CashflowStatsPeriod) => void;
  denominations: number[];
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const DEFAULT_RATES_FROM_IDR: Record<string, number> = {
  IDR: 1,
  KRW: 0.087,
  JPY: 0.0094,
  VND: 1.6,
  USD: 0.000061,
  EUR: 0.000052,
  GBP: 0.000045,
  SGD: 0.000078,
  AUD: 0.000092,
  MYR: 0.00026,
  CNY: 0.00044,
  THB: 0.002,
  PHP: 0.0035,
};

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState("IDR");
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES_FROM_IDR);
  const [compactAmountsEnabled, setCompactAmountsEnabled] = useState(true);
  const [cashflowAmountsVisible, setCashflowAmountsVisible] = useState(true);
  const [cashflowStatsPeriod, setCashflowStatsPeriod] = useState<CashflowStatsPeriod>("allTime");
  const rate = rates[currency] ?? DEFAULT_RATES_FROM_IDR[currency] ?? 1;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [storedCurrency, storedRates, storedCompactAmounts, storedAmountsVisible, storedStatsPeriod] = await Promise.all([
        getPreference("currency"),
        getPreference("exchangeRates"),
        getPreference("cashflowCompactAmounts"),
        getPreference("cashflowAmountsVisible"),
        getPreference("cashflowStatsPeriod"),
      ]);
      if (cancelled) return;
      setCurrency(storedCurrency);
      setCompactAmountsEnabled(storedCompactAmounts);
      setCashflowAmountsVisible(storedAmountsVisible);
      setCashflowStatsPeriod(storedStatsPeriod);
      if (storedRates) setRates({ ...DEFAULT_RATES_FROM_IDR, ...storedRates });

      try {
        const [serverCurrency, serverRates] = await Promise.all([
          getUserCurrency(),
          getExchangeRates(),
        ]);
        if (cancelled) return;
        setCurrency(serverCurrency);
        setRates({ ...DEFAULT_RATES_FROM_IDR, ...serverRates });
        await Promise.all([
          setPreference("currency", serverCurrency),
          setPreference("exchangeRates", serverRates),
        ]);
      } catch {
        // Offline mode keeps the last cached preference/rates.
      }
    }

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CurrencyContextValue>(() => {
    const option = getCurrencyOption(currency);

    return {
      currency,
      option,
      rates,
      rate,
      isIdr: currency === "IDR",
      compactAmountsEnabled,
      cashflowAmountsVisible,
      cashflowStatsPeriod,
      format: (amountIdr, options) => {
        const converted = convertFromIdr(amountIdr, currency, rate);
        return formatCurrencyAmount(converted, currency, {
          ...options,
          compact: compactAmountsEnabled && options?.compact,
        });
      },
      toIdr: (displayAmount) => convertToIdr(displayAmount, currency, rate),
      toDisplay: (amountIdr) => convertFromIdr(amountIdr, currency, rate),
      setCurrency: (code) => {
        setCurrency(code);
        setPreference("currency", code).catch(() => {});
        updateUserCurrency(code).catch(() => {});
      },
      setCompactAmountsEnabled: (enabled) => {
        setCompactAmountsEnabled(enabled);
        setPreference("cashflowCompactAmounts", enabled).catch(() => {});
      },
      setCashflowAmountsVisible: (visible) => {
        setCashflowAmountsVisible(visible);
        setPreference("cashflowAmountsVisible", visible).catch(() => {});
      },
      setCashflowStatsPeriod: (period) => {
        setCashflowStatsPeriod(period);
        setPreference("cashflowStatsPeriod", period).catch(() => {});
      },
      denominations: getDenominations(currency),
    };
  }, [cashflowAmountsVisible, cashflowStatsPeriod, compactAmountsEnabled, currency, rate, rates]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
