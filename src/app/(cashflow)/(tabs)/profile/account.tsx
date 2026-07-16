import { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import type { SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { useAuth } from "@/components/AuthProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { clearCashflowDatabase } from "@/data/cashflow/schema";
import { deleteAccount } from "@/lib/api/account";
import { alpha } from "@/lib/color";
import { clearPreferences } from "@/lib/preferences";
import { waitForSyncIdleAsync } from "@/lib/sync/syncEngine";
import { reconcileSyncBackgroundTaskAsync } from "@/tasks/syncBackground";

function FormSymbol({ name, color, size = 16 }: { name: SFSymbol; color: string; size?: number }) {
  return <AppSymbol name={name} size={size} tintColor={color} fallback={<Text style={{ color }}>•</Text>} />;
}

export default function ProfileAccountScreen() {
  const appTheme = useAppTheme();
  const auth = useAuth();
  const db = useSQLiteContext();
  const cashflowData = useCashflowData();
  const { t } = useTranslation();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const surface = appTheme.isDark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.72)";
  const mutedSurface = appTheme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)";

  const openDeleteConfirm = () => {
    setDeleteConfirmEmail("");
    setShowDeleteConfirm(true);
  };

  const deleteUserAccount = async () => {
    if (isDeletingAccount) return;

    setIsDeletingAccount(true);

    try {
      await deleteAccount();
      try {
        await reconcileSyncBackgroundTaskAsync(false);
        await waitForSyncIdleAsync();
      } catch (error) {
        console.warn("Failed to stop sync after account deletion", error);
      }
      await clearCashflowDatabase(db);
      await clearPreferences();
      await cashflowData.refresh();
      try {
        await auth.signOut();
      } catch (error) {
        console.warn("Failed to clear auth session after account deletion", error);
      }
      Alert.alert(t("profile.accountDeletedTitle"), t("profile.accountDeletedMessage"));
      router.replace("/");
    } catch (error) {
      Alert.alert(t("profile.deleteAccountFailedTitle"), error instanceof Error ? error.message : t("profile.deleteAccountFailedMessage"));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t("profile.account") }} />
      <ScrollView
        className="bg-[--app-color-background] flex-1"
        contentContainerClassName="gap-4 px-4 pb-12 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        <View className="gap-3 rounded-3xl border p-4" style={{ borderColor, backgroundColor: surface }}>
          <Text className="text-sm font-semibold uppercase tracking-widest" style={{ color: appTheme.colors.muted }}>
            {t("profile.accountDetails")}
          </Text>
          <View className="gap-2">
            <View className="min-h-12 flex-row items-center gap-3 rounded-2xl px-3" style={{ backgroundColor: mutedSurface }}>
              <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                <FormSymbol name="person.crop.circle" color={appTheme.colors.primary} />
              </View>
              <Text className="flex-1 text-base font-semibold" style={{ color: appTheme.colors.foreground }} numberOfLines={1}>
                {t("profile.nameLabel")}
              </Text>
              <Text className="max-w-[58%] text-right text-base" style={{ color: appTheme.colors.muted }} numberOfLines={1}>
                {auth.displayName}
              </Text>
            </View>
            <View className="min-h-12 flex-row items-center gap-3 rounded-2xl px-3" style={{ backgroundColor: mutedSurface }}>
              <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                <FormSymbol name="envelope" color={appTheme.colors.primary} />
              </View>
              <Text className="flex-1 text-base font-semibold" style={{ color: appTheme.colors.foreground }} numberOfLines={1}>
                {t("profile.emailLabel")}
              </Text>
              <Text className="max-w-[58%] text-right text-base" style={{ color: appTheme.colors.muted }} numberOfLines={1}>
                {auth.email}
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-3 rounded-3xl border p-4" style={{ borderColor, backgroundColor: surface }}>
          <Text className="text-sm font-semibold uppercase tracking-widest" style={{ color: appTheme.colors.muted }}>
            {t("profile.dangerZone")}
          </Text>
          <Text className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>
            {t("profile.deleteConfirmMessage")}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={isDeletingAccount}
            onPress={openDeleteConfirm}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4"
            style={{ backgroundColor: alpha(appTheme.colors.negative, appTheme.isDark ? 0.2 : 0.12), opacity: isDeletingAccount ? 0.55 : 1 }}
          >
            <FormSymbol name="exclamationmark.triangle" color={appTheme.colors.negative} />
            <Text className="text-base font-semibold" style={{ color: appTheme.colors.negative }}>
              {isDeletingAccount ? t("profile.deletingAccount") : t("profile.deleteAccount")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {showDeleteConfirm ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
          <Pressable className="flex-1 justify-center px-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onPress={() => setShowDeleteConfirm(false)}>
            <Pressable
              className="rounded-3xl border p-4"
              style={{
                backgroundColor: appTheme.colors.background,
                borderColor,
              }}
              onPress={() => {}}
            >
              <Text className="text-xl font-bold" style={{ color: appTheme.colors.negative }}>
                {t("profile.deleteEmailConfirmTitle")}
              </Text>
              <Text className="mt-3 text-sm leading-5" style={{ color: appTheme.colors.muted }}>
                {t("profile.deleteConfirmMessage")}
              </Text>
              <Text className="mt-4 text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
                {t("profile.deleteEmailConfirmMessage", { email: auth.email })}
              </Text>
              <TextInput
                className="mt-2 rounded-2xl border px-4 py-3 text-base"
                style={{
                  color: appTheme.colors.foreground,
                  backgroundColor: mutedSurface,
                  borderColor: deleteConfirmEmail && deleteConfirmEmail !== auth.email ? appTheme.colors.negative : borderColor,
                }}
                placeholder={t("profile.deleteEmailConfirmPlaceholder")}
                placeholderTextColor={appTheme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={deleteConfirmEmail}
                onChangeText={setDeleteConfirmEmail}
              />
              {deleteConfirmEmail && deleteConfirmEmail !== auth.email ? (
                <Text className="mt-1 text-xs" style={{ color: appTheme.colors.negative }}>
                  {t("profile.deleteEmailConfirmMismatch")}
                </Text>
              ) : null}
              <View className="mt-5 flex-row gap-3">
                <Pressable
                  className="flex-1 items-center rounded-2xl py-3"
                  style={{ backgroundColor: mutedSurface }}
                  onPress={() => setShowDeleteConfirm(false)}
                >
                  <Text className="text-base font-semibold" style={{ color: appTheme.colors.foreground }}>
                    {t("profile.deleteConfirmCancel")}
                  </Text>
                </Pressable>
                <Pressable
                  className="flex-1 items-center rounded-2xl py-3"
                  style={{
                    backgroundColor: deleteConfirmEmail === auth.email ? appTheme.colors.negative : appTheme.colors.muted,
                    opacity: deleteConfirmEmail === auth.email ? 1 : 0.4,
                  }}
                  disabled={deleteConfirmEmail !== auth.email}
                  onPress={() => {
                    setShowDeleteConfirm(false);
                    void deleteUserAccount();
                  }}
                >
                  <Text className="text-base font-semibold text-white">
                    {t("profile.deleteEmailConfirmDelete")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
