import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AppState, Linking } from "react-native";
import { router, type Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import * as Updates from "expo-updates";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@/components/AuthProvider";
import { useSyncStatus } from "@/components/SyncProvider";
import { ProfileContentBody } from "@/components/profile/ProfileContentBody";
import { clearCashflowDatabase } from "@/data/cashflow/schema";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { updateProfile } from "@/lib/api/profile";
import { clearPreferences } from "@/lib/preferences";
import { notificationsAreAllowedAsync } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/relativeTime";
import { waitForSyncIdleAsync } from "@/lib/sync/syncEngine";
import { reconcileSyncBackgroundTaskAsync } from "@/tasks/syncBackground";
import { clearCashflowStatsWidget } from "@/widgets/publishCashflowStatsWidget";

const ACCOUNT_ROUTE = "/(cashflow)/(tabs)/profile/account" as Href;
const FONT_SETTINGS_ROUTE = "/(cashflow)/(tabs)/profile/font-settings" as Href;
const REMINDER_SETTINGS_ROUTE = "/forms/reminder" as Href;
const ONBOARDING_ROUTE = "/onboarding" as Href;
const PRIVACY_POLICY_URL = "https://cashflow-notion.vercel.app/privacy";
const SUPPORT_EMAIL = "rorezxez@gmail.com";

export function ProfileContent() {
  const auth = useAuth();
  const db = useSQLiteContext();
  const cashflowData = useCashflowData();
  const { t } = useTranslation();
  const sync = useSyncStatus();
  const updates = Updates.useUpdates();
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const refreshNotificationStatus = () => {
      notificationsAreAllowedAsync()
        .then(setNotificationsEnabled)
        .catch((error) => console.warn("Failed to read notification permission", error));
    };

    refreshNotificationStatus();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshNotificationStatus();
    });
    return () => subscription.remove();
  }, []);

  const updateProfilePhoto = async () => {
    if (!auth.isAuthenticated || isUpdatingPhoto) return;

    setIsUpdatingPhoto(true);
    try {
      const { pickUploadImage } = await import("@/lib/imageUpload");
      const pickedImage = await pickUploadImage([1, 1]);
      if (!pickedImage) return;

      await updateProfile(auth.displayName, pickedImage);
      await auth.refresh();
    } catch (error) {
      Alert.alert(t("profile.photoUploadFailedTitle"), error instanceof Error ? error.message : t("profile.photoUploadFailedMessage"));
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const checkForUpdates = async () => {
    if (!Updates.isEnabled) {
      Alert.alert(t("profile.updatesUnavailableTitle"), t("profile.updatesUnavailableMessage"));
      return;
    }

    setIsCheckingForUpdate(true);

    try {
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable || update.isRollBackToEmbedded) {
        await Updates.fetchUpdateAsync();
        Alert.alert(t("profile.updateReadyTitle"), t("profile.updateReadyMessage"), [
          { text: t("profile.updateReadyLater"), style: "cancel" },
          { text: t("profile.updateReadyRestart"), onPress: () => void Updates.reloadAsync() },
        ]);
        return;
      }

      Alert.alert(t("profile.upToDateTitle"), t("profile.upToDateMessage"));
    } catch (error) {
      Alert.alert(t("profile.updateCheckFailedTitle"), error instanceof Error ? error.message : t("profile.updateCheckFailedMessage"));
    } finally {
      setIsCheckingForUpdate(false);
    }
  };

  const openPrivacyPolicy = async () => {
    try {
      await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL, {
        dismissButtonStyle: "done",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (error) {
      Alert.alert(t("profile.privacyPolicyErrorTitle"), error instanceof Error ? error.message : t("profile.privacyPolicyErrorMessage"));
    }
  };

  const contactSupport = async () => {
    const subject = encodeURIComponent("Ethos Support");
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;

    try {
      const canOpenMail = await Linking.canOpenURL(url);
      if (!canOpenMail) {
        Alert.alert(t("profile.contactSupport"), SUPPORT_EMAIL);
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(t("profile.contactSupport"), error instanceof Error ? error.message : SUPPORT_EMAIL);
    }
  };

  const handleSignOut = async () => {
    try {
      await reconcileSyncBackgroundTaskAsync(false);
      await waitForSyncIdleAsync(db);
    } catch (error) {
      console.warn("Failed to disable background sync on sign out", error);
    }
    try {
      await clearCashflowStatsWidget({
        period: t("analytics.allTime"),
        balance: t("analytics.balance"),
        income: t("analytics.income"),
        expenses: t("analytics.expenses"),
        empty: t("cashflow.empty.withoutDateHint"),
      });
      await clearCashflowDatabase(db);
      await clearPreferences({ preserveOnboarding: true });
      await cashflowData.refresh();
    } catch (error) {
      console.warn("Failed to clear local data on sign out", error);
    }
    try {
      await auth.signOut();
    } catch (error) {
      console.warn("Failed to sign out", error);
    }
    router.replace("/");
  };

  const updateStatus = !Updates.isEnabled
    ? t("profile.updateStatusIncluded")
    : updates.isUpdatePending
      ? t("profile.updateStatusPending")
      : updates.isUpdateAvailable
        ? t("profile.updateStatusAvailable")
        : updates.isChecking || isCheckingForUpdate
          ? t("profile.updateStatusChecking")
          : t("profile.updateStatusUpToDate");
  const syncActionLabel = sync.status === "syncing"
    ? t("profile.syncStatusSyncing")
    : sync.status === "error"
      ? t("profile.syncActionRetry")
      : t("profile.syncActionNow");
  const syncDetail = sync.status === "error"
    ? t("profile.syncStatusError")
    : sync.status === "syncing"
      ? ""
      : t("profile.syncStatusLastSync", { time: formatRelativeTime(sync.lastSync) });

  let cloudStatusDetail: string;

  if (!auth.isAuthenticated) {
    cloudStatusDetail = t("cloud.signInToSync");
  } else if (!sync.cloudSyncEnabled) {
    cloudStatusDetail = t("cloud.localOnly");
  } else {
    cloudStatusDetail = t("cloud.lastSynced", { time: formatRelativeTime(sync.lastSync) });
  }

  const handleCloudSyncEnabledChange = (enabled: boolean) => {
    if (!auth.isAuthenticated) {
      router.push({ pathname: "/auth", params: { returnTo: "cloud" } });
      return;
    }
    sync.setCloudSyncEnabled(enabled).catch((error) =>
      console.warn("Failed to update cloud sync preference", error),
    );
  };

  return (
    <ProfileContentBody
      isAuthenticated={auth.isAuthenticated}
      displayName={auth.displayName}
      email={auth.email}
      initials={auth.initials}
      avatarSource={auth.avatarSource}
      syncStatus={sync.status}
      syncActionLabel={syncActionLabel}
      syncDetail={syncDetail}
      updateStatus={updateStatus}
      isCheckingForUpdate={isCheckingForUpdate}
      isUpdatingPhoto={isUpdatingPhoto}
      notificationsEnabled={notificationsEnabled}
      cloudStatusDetail={cloudStatusDetail}
      cloudSyncEnabled={auth.isAuthenticated && sync.cloudSyncEnabled}
      onCloudSyncEnabledChange={handleCloudSyncEnabledChange}
      onSignOut={handleSignOut}
      onSyncNow={() => void sync.syncNow()}
      onCheckForUpdates={() => void checkForUpdates()}
      onUpdatePhoto={updateProfilePhoto}
      onOpenPrivacyPolicy={openPrivacyPolicy}
      onContactSupport={contactSupport}
      onOpenAccount={() => router.push(ACCOUNT_ROUTE)}
      onOpenFontSettings={() => router.push(FONT_SETTINGS_ROUTE)}
      onOpenNotificationSettings={() => router.push(REMINDER_SETTINGS_ROUTE)}
      onOpenAuth={() => router.push("/auth")}
      onOpenOnboarding={() => router.push(ONBOARDING_ROUTE)}
    />
  );
}
