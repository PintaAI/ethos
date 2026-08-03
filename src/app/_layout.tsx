import "../global.css";
import "@/i18n";
import "@/tasks/automaticEntries";
import "@/tasks/syncBackground";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Notifications from "expo-notifications";
import { ThemeProvider, DefaultTheme, DarkTheme, Stack, router, type Href } from "expo-router";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { SQLiteProvider } from "expo-sqlite";
import { AppThemeProvider, useAppTheme } from "@/components/AppTheme";
import { AuthProvider } from "@/components/AuthProvider";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { DrawerProvider } from "@/components/DrawerContext";
import { SyncProvider } from "@/components/SyncProvider";
import { CashflowDataProvider } from "@/data/cashflow/CashflowDataProvider";
import { CashflowStatsWidgetSync } from "@/components/CashflowStatsWidgetSync";
import { NotesDataProvider } from "@/data/notes/NotesDataProvider";
import { SelfImprovementProvider } from "@/data/selfImprovement/SelfImprovementProvider";
import { TimeMapWidgetSync } from "@/components/TimeMapWidgetSync";
import { migrateCashflowDatabase } from "@/data/cashflow/schema";
import { AppText as Text } from "@/components/AppText";
import { configureForegroundNotifications, requestNotificationPermissionsAsync } from "@/lib/notifications";
import { toDateKey } from "@/lib/date";
import { withDbLock } from "@/lib/sync/dbLock";
import { Platform, Pressable, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

configureForegroundNotifications();

function useNotificationNavigation() {
  useEffect(() => {
    const redirect = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

      const data = response.notification.request.content.data;
      if (data?.url === "/summary" && data.period === "lastMonth") {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        router.push({
          pathname: "/summary",
          params: {
            from: toDateKey(start),
            to: toDateKey(end),
            month: toDateKey(start).slice(0, 7),
            review: String(Date.now()),
          },
        });
      } else if (typeof data?.url === "string" && data.url.startsWith("/")) {
        router.push(data.url as Href);
      }

      void Notifications.clearLastNotificationResponseAsync()
        .catch((error) => console.warn("Failed to clear notification response", error));
    };

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) redirect(initialResponse);

    const subscription = Notifications.addNotificationResponseReceivedListener(redirect);
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  useEffect(() => {
    requestNotificationPermissionsAsync().catch((error) => {
      console.warn("Failed to request notification permission on launch", error);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <RootNavigator />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const [databaseError, setDatabaseError] = useState<Error | null>(null);
  const [databaseKey, setDatabaseKey] = useState(0);
  const navigationTheme = appTheme.isDark ? DarkTheme : DefaultTheme;
  const themedNavigation = {
    ...navigationTheme,
    colors: {
      ...navigationTheme.colors,
      primary: appTheme.colors.primary,
      background: appTheme.colors.background,
      card: appTheme.colors.background,
      text: appTheme.colors.foreground,
      border: appTheme.colors.overlay,
      notification: appTheme.colors.secondary,
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
      <ThemeProvider value={themedNavigation}>
        <AuthProvider>
          <CurrencyProvider>
            {databaseError ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
                  <Text style={{ color: appTheme.colors.foreground, fontSize: 20, fontWeight: "600", textAlign: "center" }}>
                    Unable to open your local data
                  </Text>
                  <Text style={{ color: appTheme.colors.muted, textAlign: "center" }}>
                    Your data was not deleted. Retry after restarting the app if this continues.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setDatabaseError(null);
                      setDatabaseKey((key) => key + 1);
                    }}
                    style={{ backgroundColor: appTheme.colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 }}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>Retry</Text>
                  </Pressable>
                </View>
            ) : (
              <SQLiteProvider
                key={databaseKey}
                databaseName="ethos-cashflow.db"
                onInit={(db) => withDbLock(() => migrateCashflowDatabase(db))}
                onError={setDatabaseError}
              >
                  <DatabaseReadyRouting language={i18n.resolvedLanguage} quickActionTitle={t("quickActions.newEntry")} />
                  <CashflowDataProvider>
                    <CashflowStatsWidgetSync />
                    <SelfImprovementProvider>
                      <TimeMapWidgetSync />
                      <NotesDataProvider>
                        <SyncProvider>
                          <DrawerProvider>
                        <Stack
                    screenOptions={{
                      contentStyle: { backgroundColor: appTheme.colors.background },
                      headerStyle: { backgroundColor: appTheme.colors.background },
                      headerTintColor: appTheme.colors.foreground,
                      headerShadowVisible: false,
                    }}
                  >
                    <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                    <Stack.Screen name="inbound-share" options={{ headerShown: false }} />
                    <Stack.Screen
                      name="auth"
                      options={Platform.select({
                        ios: {
                          presentation: "formSheet" as const,
                          sheetAllowedDetents: "fitToContents" as const,
                          sheetExpandsWhenScrolledToEdge: false,
                          headerLargeTitle: false,
                          headerTransparent: true,
                          headerStyle: { backgroundColor: "transparent" },
                          sheetGrabberVisible: true,
                        },
                        default: {
                          presentation: "formSheet" as const,
                          headerLargeTitle: false,
                          headerTransparent: false,
                          sheetAllowedDetents: "fitToContents" as const,
                          sheetInitialDetentIndex: 0,
                          sheetCornerRadius: 28,
                          sheetElevation: 24,
                          sheetShouldOverflowTopInset: false,
                          sheetLargestUndimmedDetentIndex: "none" as const,
                          sheetResizeAnimationEnabled: true,
                        },
                      })}
                    />
                    <Stack.Screen
                      name="profile"
                      options={{
                        presentation: "modal",
                        headerLargeTitle: false,
                        headerTransparent: true,
                      }}
                    />
                        </Stack>
                          </DrawerProvider>
                        </SyncProvider>
                      </NotesDataProvider>
                    </SelfImprovementProvider>
                  </CashflowDataProvider>
              </SQLiteProvider>
            )}
          </CurrencyProvider>
        </AuthProvider>
      </ThemeProvider>
    </View>
  );
}

function DatabaseReadyRouting({ language, quickActionTitle }: { language?: string; quickActionTitle: string }) {
  useNotificationNavigation();
  useQuickActionRouting();

  useEffect(() => {
    void QuickActions.setItems([
      {
        id: "new-entry",
        title: quickActionTitle,
        icon: Platform.OS === "ios" ? "symbol:plus.circle" : "entry",
        params: { href: "/(cashflow)/forms/entry-form" },
      },
    ]).catch((error) => console.warn("Failed to register quick actions", error));
  }, [language, quickActionTitle]);

  return null;
}
