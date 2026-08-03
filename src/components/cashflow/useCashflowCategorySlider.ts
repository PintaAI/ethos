import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SFSymbol } from "expo-symbols";

import i18n from "@/i18n";
import { type CategoryOption, type CategorySliderHandle } from "@/components/cashflow/CategorySlider";
import { getPreference, setPreference, type Preferences } from "@/lib/preferences";

type SourceCategory = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
};

type SelectOptions = {
  animated?: boolean;
  persist?: boolean;
};

export function useCashflowCategorySlider({
  categories,
  primaryColor,
  preferenceKey,
  restoreEnabled = true,
  initialIndex = undefined,
}: {
  categories: SourceCategory[];
  primaryColor: string;
  preferenceKey: Extract<keyof Preferences, "cashflowCategoryIndex" | "cashflowQuickFillCategoryIndex">;
  restoreEnabled?: boolean;
  initialIndex?: number;
}) {
  const sliderRef = useRef<CategorySliderHandle>(null);
  const fallbackCategories = useMemo(() => {
    const names = i18n.language === "id"
      ? ["Makanan", "Transport", "Belanja", "Tagihan"]
      : ["Food", "Transport", "Shopping", "Bills"];

    return names.map((name, i) => ({
      id: null,
      name,
      symbol: (["fork.knife", "car.fill", "basket.fill", "bolt.fill"] as SFSymbol[])[i],
      color: (["#ca8a04", "#ea580c", "#dc2626", "#2563eb"] as const)[i],
    })) satisfies CategoryOption[];
  }, [i18n.language]);
  const categoryOptions: CategoryOption[] = useMemo(
    () => categories.length > 0
      ? categories.map((category) => ({
          id: category.id,
          name: category.name,
          symbol: (category.icon ?? "tag.fill") as SFSymbol,
          color: category.color ?? primaryColor,
        }))
      : fallbackCategories,
    [categories, fallbackCategories, primaryColor],
  );
  const initialCategoryIndex = initialIndex ?? Math.floor((categoryOptions.length - 1) / 2);
  const [categoryIndex, setCategoryIndex] = useState(initialCategoryIndex);

  const setCategoryIndexAndScroll = useCallback((index: number, { animated = true, persist = false }: SelectOptions = {}) => {
    if (categoryOptions.length === 0) return;

    const nextIndex = Math.min(Math.max(index, 0), categoryOptions.length - 1);
    setCategoryIndex(nextIndex);
    if (persist) setPreference(preferenceKey, categoryOptions[nextIndex]?.id ?? null).catch(() => {});
    sliderRef.current?.scrollToIndex(nextIndex, animated);
  }, [categoryOptions, preferenceKey]);

  const handleCategoryChange = useCallback((index: number) => {
    if (index < 0 || index >= categoryOptions.length) return;

    setCategoryIndex(index);
    setPreference(preferenceKey, categoryOptions[index]?.id ?? null).catch(() => {});
  }, [categoryOptions, preferenceKey]);

  const selectCategoryIndex = useCallback((index: number, animated = true) => {
    setCategoryIndexAndScroll(index, { animated, persist: true });
  }, [setCategoryIndexAndScroll]);

  const restoreCategoryIndex = useCallback((index: number, animated = false) => {
    setCategoryIndexAndScroll(index, { animated, persist: false });
  }, [setCategoryIndexAndScroll]);

  const resetCategoryIndex = useCallback((animated = true) => {
    restoreCategoryIndex(initialCategoryIndex, animated);
  }, [initialCategoryIndex, restoreCategoryIndex]);

  useEffect(() => {
    if (!restoreEnabled || categoryOptions.length === 0) return;

    let cancelled = false;
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;

    getPreference(preferenceKey).then((savedCategoryId) => {
      if (cancelled) return;

      const savedIndex = typeof savedCategoryId === "string"
        ? categoryOptions.findIndex((category) => category.id === savedCategoryId)
        : typeof savedCategoryId === "number" ? savedCategoryId : -1;
      const nextIndex = savedIndex < 0 ? initialCategoryIndex : Math.min(savedIndex, categoryOptions.length - 1);
      if (typeof savedCategoryId === "number") {
        setPreference(preferenceKey, categoryOptions[nextIndex]?.id ?? null).catch(() => {});
      }

      frame = requestAnimationFrame(() => {
        if (!cancelled) restoreCategoryIndex(nextIndex, false);
      });
    }).catch((error) => console.warn("Failed to restore category selection", error));

    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [categoryOptions, initialCategoryIndex, preferenceKey, restoreCategoryIndex, restoreEnabled]);

  return {
    categoryIndex,
    categoryOptions,
    handleCategoryChange,
    initialCategoryIndex,
    resetCategoryIndex,
    restoreCategoryIndex,
    selectCategoryIndex,
    selectedCategory: categoryOptions[categoryIndex] ?? categoryOptions[0] ?? null,
    sliderRef,
  };
}
