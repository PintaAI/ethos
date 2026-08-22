import { useState } from "react";
import { Modal, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { AppSymbol } from "@/components/AppSymbol";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { getCurrencyOption, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatIdrPerUnit, selectedRowStyle } from "./currencySelectorShared";

function CurrencySheet({ onSelect, onClose }: { onSelect: (code: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { currency, rates } = useCurrency();

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end px-4 pb-8" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose}>
        <Pressable
          className="rounded-3xl border p-2"
          style={{
            backgroundColor: appTheme.colors.background,
            borderColor: appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
          }}
        >
          <ScrollView contentContainerClassName="gap-1 py-1" style={{ maxHeight: 420 }}>
            <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
              <Text className="text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
                {t("currencyPicker.title")}
              </Text>
              <AppSymbol
                name="xmark"
                size={14}
                tintColor={appTheme.colors.muted}
                fallback={<Text style={{ color: appTheme.colors.muted }}>✕</Text>}
              />
            </View>
            {SUPPORTED_CURRENCIES.map((option) => {
              const selected = option.code === currency;
              const idrPerUnit = formatIdrPerUnit(rates[option.code] ?? 0);
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="button"
                  onPress={() => {
                    onSelect(option.code);
                    onClose();
                  }}
                  className="flex-row items-center gap-3 rounded-2xl px-3 py-3"
                  style={selected ? selectedRowStyle(appTheme.isDark, appTheme.colors.primary) : undefined}
                >
                  <Text className="w-8 text-center text-xl">{option.flag}</Text>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-base font-semibold" style={{ color: appTheme.colors.foreground }}>
                      {option.code} · {option.name}
                    </Text>
                    <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {option.code === "IDR" || !idrPerUnit
                        ? t("currencyPicker.base")
                        : `1 ${option.code} ≈ Rp${idrPerUnit}`}
                    </Text>
                  </View>
                  {selected ? (
                    <AppSymbol
                      name="checkmark"
                      size={16}
                      tintColor={appTheme.colors.primary}
                      fallback={<Text style={{ color: appTheme.colors.primary }}>✓</Text>}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function CurrencySelector({ amountPrefix = false, amountEmpty = false }: { amountPrefix?: boolean; amountEmpty?: boolean }) {
  const [open, setOpen] = useState(false);
  const appTheme = useAppTheme();
  const { currency, setCurrency } = useCurrency();
  const option = getCurrencyOption(currency);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${option.name} ${option.code}`}
        hitSlop={12}
        onPress={() => setOpen(true)}
        className={amountPrefix
          ? "h-24 flex-row items-center gap-1 pr-2"
          : "h-9 flex-row items-center gap-1.5 self-center rounded-full border px-3.5"}
        style={amountPrefix ? undefined : {
          backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.78)",
          borderColor: appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
        }}
      >
        {amountPrefix ? (
          <RNText
            style={{
              color: amountEmpty ? appTheme.colors.muted : appTheme.colors.foreground,
              fontSize: 72,
              fontWeight: "700",
              letterSpacing: -1.8,
              lineHeight: 84,
              transform: [{ translateY: -4 }],
            }}
          >
            {option.symbol}
          </RNText>
        ) : (
          <Text className="text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
            {option.flag} {option.code}
          </Text>
        )}
        <AppSymbol
          name="chevron.down"
          size={amountPrefix ? 14 : 11}
          tintColor={amountPrefix && !amountEmpty ? appTheme.colors.foreground : appTheme.colors.muted}
          fallback={<Text style={{ color: appTheme.colors.muted }}>▾</Text>}
        />
      </Pressable>
      {open ? <CurrencySheet onSelect={setCurrency} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
