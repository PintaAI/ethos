import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { saveExpoPushToken } from "@/lib/api/notifications";

export const DEFAULT_NOTIFICATION_CHANNEL_ID = "default";

export async function prepareDefaultNotificationChannelAsync() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
    name: "General",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function requestNotificationPermissionsAsync() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;

  await prepareDefaultNotificationChannelAsync();
  let permissions = await Notifications.getPermissionsAsync();
  if (!allowsNotifications(permissions)) {
    permissions = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
  }

  return allowsNotifications(permissions);
}

export async function notificationsAreAllowedAsync() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  return allowsNotifications(await Notifications.getPermissionsAsync());
}

export function configureForegroundNotifications() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;

  if (!await requestNotificationPermissionsAsync()) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("EAS project ID is missing from the Expo configuration");

  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function enablePushNotificationsAsync(): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();
  if (!token || (Platform.OS !== "ios" && Platform.OS !== "android")) return null;

  await saveExpoPushToken(token, Platform.OS);
  return token;
}

function allowsNotifications(permissions: Notifications.NotificationPermissionsStatus) {
  if (Platform.OS !== "ios") return permissions.granted;

  return (
    permissions.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}
