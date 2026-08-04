import { useDeferredValue, useEffect, useRef, useState, type ReactElement } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Modal, Pressable, ScrollView, TextInput, View, type RefreshControlProps } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { type SFSymbol } from "expo-symbols";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { AppText as RNText } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { alpha, mix } from "@/lib/color";
import { localizeCategoryName } from "@/lib/categoryNames";
import { formatEntryAmount } from "@/lib/currency";
import { addDaysToDateKey, formatDateKey, localeFromLanguage, parseDateKey } from "@/lib/date";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { useSyncStatus } from "@/components/provider/SyncProvider";

export type IOType = "Income" | "Expenses";

export type CashflowEntry = {
  id: string;
  name: string;
  nominal: number;
  originalNominal: number | null;
  originalCurrency: string | null;
  exchangeRateToIdr: number | null;
  exchangeRateAt: string | null;
  category: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  createdBy: string | null;
  date: string;
  io: IOType;
};

type CashflowTableProps = {
  entries: CashflowEntry[];
  dateFilter?: string;
  onDateFilterChange?: (date: string) => void;
  hideTanggal?: boolean;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  refreshControl?: ReactElement<RefreshControlProps>;
};

type SortField = "name" | "nominal" | "category" | "createdBy" | "date" | "io";
type SortDirection = "asc" | "desc";
type FilterValue = string | "all";

const PAGE_SIZE = 20;

const CATEGORY_COLORS: Record<string, { background: string; text: string; symbol: SFSymbol }> = {
  Salary: { background: "rgba(22,163,74,0.12)", text: "#16a34a", symbol: "banknote.fill" },
  Freelance: { background: "rgba(22,163,74,0.12)", text: "#16a34a", symbol: "briefcase.fill" },
  Groceries: { background: "rgba(220,38,38,0.11)", text: "#dc2626", symbol: "basket.fill" },
  Transport: { background: "rgba(234,88,12,0.12)", text: "#ea580c", symbol: "car.fill" },
  "Coffee & meals": { background: "rgba(202,138,4,0.14)", text: "#ca8a04", symbol: "cup.and.saucer.fill" },
  Utilities: { background: "rgba(37,99,235,0.12)", text: "#2563eb", symbol: "bolt.fill" },
  Subscriptions: { background: "rgba(147,51,234,0.12)", text: "#9333ea", symbol: "play.rectangle.fill" },
};

function formatDayName(dateKey: string) {
  const locale = i18n.language === "id" ? "id-ID" : "en-US";
  return parseDateKey(dateKey).toLocaleDateString(locale, { weekday: "long" });
}

function TableSymbol({ name, color, size = 15 }: { name: SFSymbol; color: string; size?: number }) {
  return <AppSymbol name={name} size={size} tintColor={color} fallback={<RNText style={{ color }}>•</RNText>} />;
}

function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const appTheme = useAppTheme();
  const borderColor = checked ? appTheme.colors.primary : appTheme.isDark ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.18)";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      className="h-5 w-5 items-center justify-center rounded-[5px]"
      style={{ backgroundColor: checked ? appTheme.colors.primary : "transparent", borderColor, borderWidth: 1 }}
    >
      {checked ? <TableSymbol name="checkmark" color={appTheme.colors.inverseForeground} size={11} /> : null}
    </Pressable>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = active ? "transparent" : appTheme.isDark ? "rgba(255,255,255,0.13)" : "rgba(15,23,42,0.1)";

  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-3 py-1.5"
      style={{ backgroundColor: active ? appTheme.colors.primary : "transparent", borderColor, borderWidth: 1 }}
    >
      <RNText className="text-xs font-semibold" style={{ color: active ? appTheme.colors.inverseForeground : appTheme.colors.muted }}>
        {label}
      </RNText>
    </Pressable>
  );
}

function SortChip({ label, field, sortField, sortDirection, onSort }: { label: string; field: SortField; sortField: SortField; sortDirection: SortDirection; onSort: (field: SortField) => void }) {
  const active = sortField === field;

  return <FilterChip label={`${label}${active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}`} active={active} onPress={() => onSort(field)} />;
}

function CategoryBadge({ category, categoryColor, categoryIcon }: { category: string | null; categoryColor: string | null; categoryIcon: string | null }) {
  const appTheme = useAppTheme();

  if (!category) {
    return <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>-</RNText>;
  }

  const config = CATEGORY_COLORS[category];
  const color = categoryColor || config?.text || appTheme.colors.primary;
  const bg = categoryColor ? alpha(categoryColor, 0.12) : (config?.background || alpha(appTheme.colors.primary, 0.12));
  const symbol = (categoryIcon || config?.symbol || "tag.fill") as SFSymbol;

  return (
    <View className="self-start flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: bg }}>
      <TableSymbol name={symbol} color={color} size={12} />
      <RNText numberOfLines={1} className="text-xs font-medium" style={{ color }}>
        {localizeCategoryName(category)}
      </RNText>
    </View>
  );
}

function TransactionGlyph({ category, categoryColor, categoryIcon, selected }: { category: string | null; categoryColor: string | null; categoryIcon: string | null; selected: boolean }) {
  const appTheme = useAppTheme();
  const fallbackSymbol = CATEGORY_COLORS[category ?? ""]?.symbol ?? "tag.fill";
  const color = selected ? appTheme.colors.inverseForeground : (categoryColor || appTheme.colors.muted);
  const symbol = selected ? "checkmark" : (categoryIcon || fallbackSymbol);
  const backgroundColor = selected ? appTheme.colors.primary : appTheme.isDark ? "rgba(255,255,255,0.065)" : "rgba(15,23,42,0.055)";

  return (
    <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor }}>
      <TableSymbol name={symbol as SFSymbol} color={color} size={17} />
    </View>
  );
}

function DayFilterNavigator({ dateFilter, onDateFilterChange }: { dateFilter: string; onDateFilterChange: (date: string) => void }) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();

  return (
    <View className="mt-3 flex-row items-center gap-2">
      <Pressable
        onPress={() => onDateFilterChange(addDaysToDateKey(dateFilter, -1))}
        accessibilityRole="button"
        accessibilityLabel={t('cashflow.prevDay')}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <TableSymbol name="arrow.left" color={appTheme.colors.foreground} />
      </Pressable>
      <RNText numberOfLines={1} className="flex-1 text-center text-sm font-semibold capitalize" style={{ color: appTheme.colors.foreground }}>
        {formatDayName(dateFilter)}
      </RNText>
      <Pressable
        onPress={() => onDateFilterChange(addDaysToDateKey(dateFilter, 1))}
        accessibilityRole="button"
        accessibilityLabel={t('cashflow.nextDay')}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <TableSymbol name="arrow.right" color={appTheme.colors.foreground} />
      </Pressable>
    </View>
  );
}

function compareText(a: string | null, b: string | null) {
  return (a ?? "").localeCompare(b ?? "");
}

function entryKeyExtractor(item: CashflowEntry) {
  return item.id;
}

function CashflowTableRow({ item, isSelecting, selected, toggleRow, onMove, onDelete, onSwipeOpen, onSwipeClose, hideTanggal }: {
  item: CashflowEntry;
  isSelecting: boolean;
  selected: boolean;
  toggleRow: (id: string) => void;
  onMove: (id: string) => void;
  onDelete: (id: string) => void;
  onSwipeOpen: (swipeable: SwipeableMethods) => void;
  onSwipeClose: (swipeable: SwipeableMethods) => void;
  hideTanggal: boolean;
}) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { compactAmountsEnabled, currency, format } = useCurrency();
  const isIncome = item.io === "Income";
  const amountColor = isIncome ? appTheme.colors.positive : appTheme.colors.negative;
  const typeLabel = isIncome ? t('cashflow.incomeLabel') : t('cashflow.expenseLabel');
  const rowBackground = selected
    ? mix(appTheme.colors.background, appTheme.colors.primary, appTheme.isDark ? 0.24 : 0.12)
    : mix(appTheme.colors.background, appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035);
  const [pressScale] = useState(() => new Animated.Value(1));
  const swipeableRef = useRef<SwipeableMethods>(null);

  function handlePressIn() {
    Animated.timing(pressScale, {
      toValue: 0.96,
      duration: 60,
      useNativeDriver: true,
    }).start();
  }

  function handlePressOut() {
    Animated.timing(pressScale, {
      toValue: 1,
      duration: 80,
      useNativeDriver: true,
    }).start();
  }

  function renderRightActions() {
    return (
      <View className="h-full flex-row overflow-hidden rounded-[28px]">
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onMove(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("cashflow.move")}
          className="w-20 items-center justify-center gap-1"
          style={{ backgroundColor: appTheme.colors.primary }}
        >
          <TableSymbol name="arrow.right" color={appTheme.colors.inverseForeground} size={16} />
          <RNText className="text-xs font-bold" style={{ color: appTheme.colors.inverseForeground }}>{t("cashflow.move")}</RNText>
        </Pressable>
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onDelete(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("cashflow.delete")}
          className="w-20 items-center justify-center gap-1"
          style={{ backgroundColor: appTheme.colors.negative }}
        >
          <TableSymbol name="trash.fill" color="#ffffff" size={16} />
          <RNText className="text-xs font-bold text-white">{t("cashflow.delete")}</RNText>
        </Pressable>
      </View>
    );
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      enabled={!isSelecting}
      friction={2}
      rightThreshold={80}
      overshootRight={false}
      containerStyle={{ overflow: "visible" }}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onSwipeOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onSwipeClose(swipeableRef.current);
      }}
      renderRightActions={renderRightActions}
    >
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <Pressable
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
            toggleRow(item.id);
          }}
          onPress={() => {
            if (isSelecting) {
              toggleRow(item.id);
              return;
            }
            router.push(`/forms/entry-form?id=${item.id}`);
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          className="flex-row items-center gap-3 rounded-[28px] px-3 py-3"
          style={{
            backgroundColor: rowBackground,
            borderColor: selected ? alpha(appTheme.colors.primary, 0.5) : "transparent",
            borderWidth: 1,
          }}
        >
          <TransactionGlyph category={item.category} categoryColor={item.categoryColor} categoryIcon={item.categoryIcon} selected={selected} />
          <View className="min-w-0 flex-1 gap-1.5">
            <RNText numberOfLines={1} className="text-base font-semibold" style={{ color: appTheme.colors.foreground }}>{item.name}</RNText>
            <View className="flex-row items-center gap-2 overflow-hidden">
              {!hideTanggal ? <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{formatDateKey(item.date, { day: "2-digit", month: "short", year: "numeric" }, localeFromLanguage(i18n.language))}</RNText> : null}
              <CategoryBadge category={item.category} categoryColor={item.categoryColor} categoryIcon={item.categoryIcon} />
            </View>
          </View>
          <View className="items-end gap-1.5">
            <RNText numberOfLines={1} className="text-right text-base font-bold" style={{ color: amountColor }}>
              {isIncome ? "+" : "-"}{formatEntryAmount(item, currency, format, { compact: compactAmountsEnabled })}
            </RNText>
            <View className="flex-row items-center gap-1">
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: amountColor }} />
              <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{typeLabel}</RNText>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </ReanimatedSwipeable>
  );
}

export function CashflowTable({ entries, dateFilter, onDateFilterChange, hideTanggal = false, ListHeaderComponent: injectedHeader, ListFooterComponent: injectedFooter, ListEmptyComponent: injectedEmpty, refreshControl }: CashflowTableProps) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { currency, format } = useCurrency();
  const { activeManagementId, managements, deleteEntries, moveEntries } = useCashflowData();
  const sync = useSyncStatus();
  const [globalFilter, setGlobalFilter] = useState("");
  const [ioFilter, setIoFilter] = useState<FilterValue>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterValue>("all");
  const [creatorFilter, setCreatorFilter] = useState<FilterValue>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const mutedSurface = appTheme.isDark ? "rgba(255,255,255,0.045)" : "rgba(15,23,42,0.035)";
  const search = useDeferredValue(globalFilter.trim().toLowerCase());
  const categoryOptions = Array.from(new Set(entries.map((entry) => entry.category).filter((category): category is string => !!category)));
  const creatorOptions = Array.from(new Set(entries.map((entry) => entry.createdBy ?? "Unknown")));
  const filteredEntries = entries
    .filter((entry) => (
      (!dateFilter || entry.date === dateFilter)
      && (!search || entry.name.toLowerCase().includes(search))
      && (ioFilter === "all" || entry.io === ioFilter)
      && (categoryFilter === "all" || entry.category === categoryFilter)
      && (creatorFilter === "all" || (entry.createdBy ?? "Unknown") === creatorFilter)
    ))
    .sort((a, b) => {
      let result = 0;

      if (sortField === "nominal") result = a.nominal - b.nominal;
      if (sortField === "date") result = compareText(a.date, b.date);
      if (sortField === "name") result = compareText(a.name, b.name);
      if (sortField === "category") result = compareText(a.category, b.category);
      if (sortField === "createdBy") result = compareText(a.createdBy, b.createdBy);
      if (sortField === "io") result = compareText(a.io, b.io);

      return sortDirection === "asc" ? result : -result;
    });
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const hasMore = filteredEntries.length > visibleEntries.length;
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every((entry) => rowSelection[entry.id]);
  const isSelecting = selectedCount > 0;
  const destinationWallets = managements.filter((management) => management.id !== activeManagementId);

  useEffect(() => () => {
    if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
  }, []);

  function handleLoadMore() {
    if (!hasMore || loadMoreTimerRef.current) return;

    setIsLoadingMore(true);
    loadMoreTimerRef.current = setTimeout(() => {
      setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredEntries.length));
      setIsLoadingMore(false);
      loadMoreTimerRef.current = null;
    }, 150);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortField(field);
    setSortDirection(field === "date" ? "desc" : "asc");
  }

  function toggleVisibleRows() {
    setRowSelection((current) => {
      const next = { ...current };
      visibleEntries.forEach((entry) => {
        next[entry.id] = !allVisibleSelected;
      });
      return next;
    });
  }

  function toggleRow(id: string) {
    setRowSelection((current) => ({ ...current, [id]: !current[id] }));
  }

  async function handleBulkDelete() {
    if (isDeleting) return;
    const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    if (selectedIds.length === 0) return;

    setIsDeleting(true);
    try {
      await deleteEntries(selectedIds);
      await sync.syncNow();
      setRowSelection({});
    } catch (error) {
      console.warn("Failed to delete cashflow entries", error);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRowDelete(id: string) {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteEntries([id]);
      await sync.syncNow();
    } catch (error) {
      console.warn("Failed to delete cashflow entry", error);
    } finally {
      setIsDeleting(false);
    }
  }

  function handleRowMove(id: string) {
    if (destinationWallets.length === 0) {
      Alert.alert(t("cashflow.noDestinationTitle"), t("cashflow.noDestinationMessage"));
      return;
    }

    setRowSelection({ [id]: true });
    setShowMovePicker(true);
  }

  async function handleBulkMove(targetManagementId: string) {
    if (isMoving) return;
    const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    if (selectedIds.length === 0) return;

    setIsMoving(true);
    try {
      await moveEntries(selectedIds, targetManagementId);
      await sync.syncNow();
      setShowMovePicker(false);
      setRowSelection({});
    } catch (error) {
      console.warn("Failed to move cashflow entries", error);
      Alert.alert(t("cashflow.moveFailedTitle"), t("cashflow.moveFailedMessage"));
    } finally {
      setIsMoving(false);
    }
  }

  function clearSelection() {
    setRowSelection({});
  }

  function handleSwipeOpen(swipeable: SwipeableMethods) {
    if (openSwipeableRef.current && openSwipeableRef.current !== swipeable) {
      openSwipeableRef.current.close();
    }

    openSwipeableRef.current = swipeable;
  }

  function handleSwipeClose(swipeable: SwipeableMethods) {
    if (openSwipeableRef.current === swipeable) openSwipeableRef.current = null;
  }

  const headerContent = (
    <View className="gap-4 p-0">
      {injectedHeader}

      <View className="relative">
        {isSelecting ? (
          <View className="absolute inset-0 z-10 flex-row items-center gap-3 rounded-full pl-3 pr-1 py-2" style={{ backgroundColor: appTheme.colors.background }}>
            <Checkbox checked={allVisibleSelected} onPress={toggleVisibleRows} label={t('cashflow.selectAll')} />
            <RNText className="flex-1 text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
              {t('cashflow.selected', { count: selectedCount })}
            </RNText>
            <Pressable
              onPress={() => {
                if (destinationWallets.length === 0) {
                  Alert.alert(t("cashflow.noDestinationTitle"), t("cashflow.noDestinationMessage"));
                  return;
                }
                setShowMovePicker(true);
              }}
              disabled={isDeleting || isMoving}
              accessibilityRole="button"
              accessibilityLabel={t("cashflow.move")}
              className="h-9 flex-row items-center gap-1.5 rounded-full px-3"
              style={{ backgroundColor: mutedSurface }}
            >
              <TableSymbol name="arrow.right" color={appTheme.colors.foreground} size={12} />
              <RNText className="text-xs font-bold" style={{ color: appTheme.colors.foreground }}>{t("cashflow.move")}</RNText>
            </Pressable>
            <Pressable onPress={handleBulkDelete} disabled={isDeleting} className="h-9 flex-row items-center gap-1.5 rounded-full px-3" style={{ backgroundColor: alpha(negative, isDeleting ? 0.55 : 0.95) }}>
              <TableSymbol name="trash.fill" color="#ffffff" size={12} />
              <RNText className="text-xs font-bold text-white">{t('cashflow.delete')}</RNText>
            </Pressable>
            <Pressable onPress={clearSelection} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: mutedSurface }}>
              <TableSymbol name="xmark" color={appTheme.colors.foreground} size={12} />
            </Pressable>
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          <TextInput
            value={globalFilter}
            onChangeText={(value) => {
              setGlobalFilter(value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder={t('cashflow.searchPlaceholder')}
            placeholderTextColor={appTheme.colors.muted}
            className="min-w-0 flex-1 rounded-2xl px-3 py-2 text-sm"
            style={{ backgroundColor: mutedSurface, color: appTheme.colors.foreground }}
          />
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            accessibilityRole="button"
            accessibilityLabel={t('cashflow.filterEntries')}
            className="h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: mutedSurface, borderColor, borderWidth: 1 }}
          >
            <TableSymbol name="line.3.horizontal.decrease" color={appTheme.colors.foreground} />
          </Pressable>
        </View>

        {dateFilter && onDateFilterChange && !hideTanggal ? (
          <DayFilterNavigator dateFilter={dateFilter} onDateFilterChange={onDateFilterChange} />
        ) : null}

      </View>

      {showFilters ? (
        <View className="gap-3 rounded-[28px] p-3" style={{ backgroundColor: mutedSurface }}>
          <View className="gap-1.5">
            <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{t('cashflow.sort')}</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <SortChip label={t('cashflow.tanggal')} field="date" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortChip label={t('cashflow.nama')} field="name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortChip label={t('cashflow.nominal')} field="nominal" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
            </ScrollView>
          </View>
          <View className="gap-1.5">
            <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{t('cashflow.type')}</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <FilterChip label={t('cashflow.all')} active={ioFilter === "all"} onPress={() => setIoFilter("all")} />
              <FilterChip label={t('cashflow.incomeLabel')} active={ioFilter === "Income"} onPress={() => setIoFilter("Income")} />
              <FilterChip label={t('cashflow.expenseLabel')} active={ioFilter === "Expenses"} onPress={() => setIoFilter("Expenses")} />
            </ScrollView>
          </View>
          <View className="gap-1.5">
            <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{t('cashflow.category')}</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <FilterChip label={t('cashflow.all')} active={categoryFilter === "all"} onPress={() => setCategoryFilter("all")} />
              {categoryOptions.map((option) => (
                <FilterChip key={option} label={localizeCategoryName(option) ?? option} active={categoryFilter === option} onPress={() => setCategoryFilter(option)} />
              ))}
            </ScrollView>
          </View>
          <View className="gap-1.5">
            <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{t('cashflow.ditambahOleh')}</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <FilterChip label={t('cashflow.all')} active={creatorFilter === "all"} onPress={() => setCreatorFilter("all")} />
              {creatorOptions.map((option) => (
                <FilterChip key={option} label={option === "Unknown" ? t('common.unknown') : option} active={creatorFilter === option} onPress={() => setCreatorFilter(option)} />
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );

  const footerContent = (
    <View className="items-center justify-center py-4">
      {isLoadingMore ? (
        <ActivityIndicator color={appTheme.colors.primary} accessibilityLabel={t('cashflow.loadMore')} />
      ) : !hasMore ? (
        <RNText className="text-sm" style={{ color: appTheme.colors.muted }}>{t('cashflow.showing', { count: filteredEntries.length })}</RNText>
      ) : null}
      {injectedFooter}
    </View>
  );

  const emptyContent = injectedEmpty ?? (
    <View className="items-center justify-center gap-2 py-16">
      <TableSymbol name="doc.text" color={appTheme.colors.muted} size={40} />
      <RNText className="text-sm font-medium" style={{ color: appTheme.colors.muted }}>
        {dateFilter ? t('cashflow.empty.withDate') : t('cashflow.empty.withoutDate')}
      </RNText>
      <RNText className="max-w-[280px] text-center text-xs" style={{ color: appTheme.colors.muted }}>
        {dateFilter
          ? t('cashflow.empty.withDateHint')
          : t('cashflow.empty.withoutDateHint')}
      </RNText>
    </View>
  );

  const renderEntry = ({ item }: { item: CashflowEntry }) => (
    <CashflowTableRow
      item={item}
      isSelecting={isSelecting}
      selected={!!rowSelection[item.id]}
      toggleRow={toggleRow}
      onMove={handleRowMove}
      onDelete={handleRowDelete}
      onSwipeOpen={handleSwipeOpen}
      onSwipeClose={handleSwipeClose}
      hideTanggal={hideTanggal}
    />
  );

  return (
    <>
      <FlatList
        data={visibleEntries}
        keyExtractor={entryKeyExtractor}
        renderItem={renderEntry}
        ListHeaderComponent={headerContent}
        ListFooterComponent={footerContent}
        ListEmptyComponent={emptyContent}
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        initialNumToRender={10}
        contentContainerStyle={{ gap: 8, overflow: "visible", paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        style={{ flex: 1, overflow: "visible", backgroundColor: appTheme.colors.background }}
      />
      <Modal transparent animationType="fade" visible={showMovePicker} onRequestClose={() => !isMoving && setShowMovePicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40 px-4 pb-8" onPress={() => !isMoving && setShowMovePicker(false)}>
          <Pressable
            accessibilityRole="none"
            onPress={(event) => event.stopPropagation()}
            className="max-h-[70%] gap-4 rounded-[28px] p-4"
            style={{ backgroundColor: appTheme.colors.background }}
          >
            <View className="gap-1 px-1">
              <RNText className="text-lg font-bold" style={{ color: appTheme.colors.foreground }}>{t("cashflow.moveTitle")}</RNText>
              <RNText className="text-sm" style={{ color: appTheme.colors.muted }}>{t("cashflow.moveDescription", { count: selectedCount })}</RNText>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-2">
              {destinationWallets.map((management) => (
                <Pressable
                  key={management.id}
                  accessibilityRole="button"
                  disabled={isMoving}
                  onPress={() => handleBulkMove(management.id)}
                  className="flex-row items-center gap-3 rounded-2xl p-3"
                  style={{ backgroundColor: mutedSurface, opacity: isMoving ? 0.55 : 1 }}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12) }}>
                    <TableSymbol name="wallet.bifold.fill" color={appTheme.colors.primary} size={17} />
                  </View>
                  <RNText numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>{management.name}</RNText>
                  <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{format(management.balance, { compact: true })}</RNText>
                  <TableSymbol name="chevron.right" color={appTheme.colors.muted} size={12} />
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
