import { Pressable, View } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { alpha } from "@/lib/color";
import { getCurrencyOption } from "@/lib/currency";

export function formatIdrPerUnit(rate: number) {
  if (!rate) return null;
  return Math.round(1 / rate).toLocaleString("id-ID");
}

function CurrencyChip({ code, onPress }: { code: string; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const option = getCurrencyOption(code);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-8 flex-row items-center gap-1 rounded-full border px-2.5"
      style={{
        backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.45)",
        borderColor,
      }}
    >
      <Text className="text-xs font-semibold" style={{ color: appTheme.colors.foreground }}>
        {option.flag} {option.code}
      </Text>
    </Pressable>
  );
}

export function RecentCurrenciesRow({
  currency,
  recentCurrencies,
  onSelect,
}: {
  currency: string;
  recentCurrencies: string[];
  onSelect: (code: string) => void;
}) {
  const recents = recentCurrencies.filter((code) => code !== currency).slice(0, 3);
  if (recents.length === 0) return null;

  return (
    <View className="flex-row justify-center gap-2">
      {recents.map((code) => (
        <CurrencyChip key={code} code={code} onPress={() => onSelect(code)} />
      ))}
    </View>
  );
}

export function selectedRowStyle(isDark: boolean, primary: string) {
  return {
    backgroundColor: alpha(primary, isDark ? 0.16 : 0.1),
  };
}
