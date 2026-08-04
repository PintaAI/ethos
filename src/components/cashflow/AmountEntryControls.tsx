import { Pressable, TextInput, View } from "react-native";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";

const DENOMINATION_COLORS = ["#6b7280", "#64748b", "#a16207", "#9333ea", "#2563eb", "#dc2626", "#16a34a"];

function formatShortAmount(amount: number) {
  return amount >= 1000 ? `${amount / 1000}k` : `${amount}`;
}

export function formatAmountDigits(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function CashflowAmountInput({
  amountText,
  currencySymbol,
  onAmountTextChange,
}: {
  amountText: string;
  currencySymbol: string;
  onAmountTextChange: (value: string) => void;
}) {
  const appTheme = useAppTheme();

  return (
    <TextInput
      className="w-full text-7xl font-bold tracking-tight"
      inputMode="numeric"
      keyboardType="number-pad"
      placeholder={`${currencySymbol} 0`}
      placeholderTextColor={appTheme.colors.muted}
      selectionColor={appTheme.colors.primary}
      style={{
        color: appTheme.colors.foreground,
        height: 96,
        includeFontPadding: false,
        lineHeight: 84,
        paddingVertical: 0,
        textAlign: "center",
        textAlignVertical: "center",
        transform: [{ translateY: -4 }],
      }}
      value={amountText ? `${currencySymbol} ${formatAmountDigits(amountText)}` : ""}
      onChangeText={(text) => onAmountTextChange(text.replace(/\D/g, ""))}
    />
  );
}

export function QuickAmountStrip({ denominations, onAmount, hidden }: { denominations: number[]; onAmount: (value: number) => void; hidden?: boolean }) {
  const appTheme = useAppTheme();
  if (hidden) return null;
  const neutralBg = appTheme.isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.78)";
  const neutralBorder = appTheme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)";

  return (
    <View className="w-full overflow-hidden rounded-2xl border" style={{ backgroundColor: neutralBg, borderColor: neutralBorder }}>
      <View className="flex-row">
        {denominations.map((value, index) => (
          <View key={value} className="flex-1 flex-row">
            <Pressable accessibilityRole="button" className="min-h-10 flex-1 items-center justify-center px-1" onPress={() => onAmount(value)}>
              <Text className="text-sm font-semibold" style={{ color: DENOMINATION_COLORS[index % DENOMINATION_COLORS.length] }}>
                +{formatShortAmount(value)}
              </Text>
            </Pressable>
            {index < denominations.length - 1 ? <View className="w-px" style={{ backgroundColor: neutralBorder }} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}
