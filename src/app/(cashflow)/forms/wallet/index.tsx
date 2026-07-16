import { Alert, Platform, Pressable, ScrollView, Share, View } from "react-native";
import { GlassBox } from "@/components/GlassBox";
import { Image } from "expo-image";
import { router, Stack, type Href } from "expo-router";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/AppTheme";
import { useCurrency } from "@/components/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { alpha } from "@/lib/color";
import { walletImageToIcon } from "@/lib/categoryMapping";
import { colorsToThemeSet, extractColors } from "@/lib/palette";
import { getManagementImageSource } from "@/lib/protectedImage";
import { createManagementInvite } from "@/lib/api/managements";
import { authBaseURL } from "@/lib/auth-client";

function isPicture(image: string | null): image is string {
  return !!image && !image.startsWith("symbol:");
}

export default function WalletFormSheet() {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { format } = useCurrency();
  const { activeManagementId, managements, setActiveManagementId, updateManagementImageTheme } = useCashflowData();
  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const rowSurface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);

  const handleSelectManagement = async (management: (typeof managements)[number]) => {
    try {
      await setActiveManagementId(management.id);

      const managementImage = management.image;
      if (!isPicture(managementImage)) return;

      if (management.imageTheme?.image === managementImage) {
        const hasSavedTheme = appTheme.availableThemes.some((theme) => theme.slug === management.imageTheme?.themeSlug);
        if (hasSavedTheme) {
          appTheme.setTheme(management.imageTheme.themeSlug);
          return;
        }

        const savedTheme = await appTheme.saveTheme(`${management.name} Wallet`, management.imageTheme.themeSet);
        await updateManagementImageTheme(management.id, {
          ...management.imageTheme,
          themeSlug: savedTheme.slug,
        });
        return;
      }

      const imageSource = getManagementImageSource(managementImage);
      if (!imageSource || typeof imageSource === "number" || Array.isArray(imageSource) || !imageSource.uri) return;

      const colors = await extractColors(imageSource.uri, imageSource.headers);
      const themeSet = colorsToThemeSet(colors);
      const savedTheme = await appTheme.saveTheme(`${management.name} Wallet`, themeSet);
      await updateManagementImageTheme(management.id, {
        version: 1,
        image: managementImage,
        themeSlug: savedTheme.slug,
        themeSet,
      });
    } catch (error) {
      console.error("Failed to set active management", error);
    }
  };

  const handleShareInvite = async (management: (typeof managements)[number]) => {
    if (!management.remoteId) {
      Alert.alert(t("wallet.syncRequiredTitle"), t("wallet.syncRequiredMessage"));
      return;
    }
    try {
      const { code } = await createManagementInvite(management.remoteId);
      const inviteLink = `${authBaseURL}/invite?code=${encodeURIComponent(code)}`;
      await Share.share({
        title: t("wallet.joinTitle", { name: management.name }),
        url: inviteLink,
        message: t("wallet.joinMessage", { name: management.name, link: inviteLink }),
      });
    } catch (error) {
      console.error("Failed to create wallet invite", error);
      Alert.alert(t("wallet.inviteUnavailableTitle"), t("wallet.inviteUnavailableMessage"));
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t("sidebar.wallet"),
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("wallet.addWalletLabel")} onPress={() => router.push("/forms/wallet/detail" as Href)} primary />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View hidesSharedBackground>
            <GlassBox
              isInteractive
              tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 1 : 0.72)}
              glassEffectStyle="clear"
              style={{ borderRadius: 9999 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("wallet.addWalletLabel")}
                className="flex-row items-center gap-1.5 px-5 py-3"
                onPress={() => router.push("/forms/wallet/detail" as Href)}
              >
                <AppSymbol name="plus" size={16} tintColor={appTheme.colors.background} fallback={<Text className="text-base" style={{ color: appTheme.colors.background }}>+</Text>} />
                <Text className="text-base font-bold" style={{ color: appTheme.colors.background }}>
                  {t("sidebar.wallet")}
                </Text>
              </Pressable>
            </GlassBox>
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : null}

      <ScrollView className="bg-[--app-color-background] flex-1" contentContainerClassName="gap-5 px-5 pb-10 pt-5" contentInsetAdjustmentBehavior="automatic" nestedScrollEnabled={Platform.OS === "android"}>
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
            {t("wallet.dataScope")}
          </Text>
          <Text className="text-3xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {t("wallet.chooseWallet")}
          </Text>
          <Text className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>
            {t("wallet.chooseWalletDescription")}
          </Text>
        </View>

        <View className="gap-3">
          {managements.map((management) => {
            const isActive = management.id === activeManagementId;
            const imageSource = getManagementImageSource(management.image);
            const tint = management.balance < 0 ? appTheme.colors.negative : appTheme.colors.primary;
            return (
              <Pressable
                key={management.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => handleSelectManagement(management)}
                className="rounded-3xl border p-4"
                style={{
                  backgroundColor: surface,
                  borderColor: isActive ? alpha(appTheme.colors.primary, 0.5) : borderColor,
                }}
              >
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: alpha(tint, 0.14) }}>
                    {imageSource ? (
                      <Image
                        source={imageSource}
                        contentFit="cover"
                        onError={(error) => console.warn("[management] image failed", management.id, error)}
                        onLoad={() => console.log("[management] image loaded", management.id)}
                        style={{ height: "100%", width: "100%" }}
                      />
                    ) : (
                      <AppSymbol name={walletImageToIcon(management.image)} size={20} tintColor={tint} fallback={<Text style={{ color: tint }}>•</Text>} />
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                      {management.name}
                    </Text>
                    <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {format(management.balance, { compact: true })} · {t("wallet.memberCount", { count: management.memberCount })}
                    </Text>
                  </View>
                  {isActive ? (
                    <View
                      className="h-7 w-7 items-center justify-center rounded-full"
                      style={{ backgroundColor: appTheme.colors.primary }}
                    >
                      <AppSymbol
                        name="checkmark"
                        size={13}
                        tintColor={appTheme.colors.background}
                        fallback={<Text className="text-xs font-black" style={{ color: appTheme.colors.background }}>✓</Text>}
                      />
                    </View>
                  ) : null}
                </View>
                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/forms/wallet/detail", params: { id: management.id } } as Href)}
                    className="min-h-10 flex-1 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: rowSurface }}
                  >
                    <Text className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
                      {t("wallet.manageWallet")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("wallet.inviteLabel")}
                    onPress={() => handleShareInvite(management)}
                    className="min-h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.16 : 0.1) }}
                  >
                    <AppSymbol name="square.and.arrow.up" size={16} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>↑</Text>} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}
