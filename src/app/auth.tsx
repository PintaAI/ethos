import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import * as AppleAuthentication from "expo-apple-authentication";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { authClient } from "@/lib/auth-client";

type AuthProvider = "google" | "apple";

export default function Auth() {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const providers: { id: AuthProvider; label: string; icon: ImageSource }[] = [
    {
      id: "google",
      label: t("auth.continueWithGoogle"),
      icon: require("@/assets/images/sign-in-google-light.png"),
    },
    {
      id: "apple",
      label: t("auth.continueWithApple"),
      icon: appTheme.isDark
        ? require("@/assets/images/sign-in-apple-white.png")
        : require("@/assets/images/sign-in-apple-black.png"),
    },
  ];
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const surface = appTheme.isDark ? "rgba(255,255,255,0.055)" : "rgba(15,23,42,0.035)";

  async function handleSocialSignIn(provider: AuthProvider) {
    setLoadingProvider(provider);
    setError(null);

    try {
      console.log("[auth] Starting social sign-in", { provider });

      let result;

      if (provider === "apple" && Platform.OS === "ios") {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          throw new Error("Apple did not return an identity token");
        }

        result = await authClient.signIn.social({
          provider: "apple",
          idToken: {
            token: credential.identityToken,
            user: {
              email: credential.email ?? undefined,
              name: credential.fullName
                ? {
                    firstName: credential.fullName.givenName ?? undefined,
                    lastName: credential.fullName.familyName ?? undefined,
                  }
                : undefined,
            },
          },
        });
      } else {
        result = await authClient.signIn.social({
          provider,
          callbackURL: "/",
        });
      }
      const { error: authError } = result;

      console.log("[auth] Social sign-in result", result);

      if (authError) {
        console.error("[auth] Social sign-in error", authError);
        setError(authError.message || authError.statusText || t("auth.error"));
        return;
      }

      if (returnTo === "inbound-share") {
        router.back();
      } else {
        router.replace(returnTo === "cloud" ? "/profile" : "/");
      }
    } catch (caughtError) {
      if (
        caughtError &&
        typeof caughtError === "object" &&
        "code" in caughtError &&
        caughtError.code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }

      console.error("[auth] Social sign-in threw", caughtError);
      setError(t("auth.error"));
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          contentStyle: { backgroundColor: appTheme.colors.background },
          headerTransparent: Platform.OS === "ios",
          headerStyle: { backgroundColor: Platform.OS === "ios" ? "transparent" : appTheme.colors.background },
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.close")} onPress={() => router.back()} />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel="Close" onPress={() => router.back()} />
        </Stack.Toolbar>
      ) : null}

      <ScrollView
        className={Platform.OS === "android" ? "bg-[--app-color-background]" : "flex-1 bg-[--app-color-background]"}
        contentContainerClassName="gap-5 px-5 pb-10 mt-5 pt-5"
        nestedScrollEnabled={Platform.OS === "android"}
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: appTheme.colors.background }}
      >
        <View className="gap-2">
          <AppText className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
            {t("auth.account")}
          </AppText>
          <AppText className="text-3xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {t("auth.signIn")}
          </AppText>
          <AppText className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>
            {t("auth.description")}
          </AppText>
        </View>
        <View className="gap-3 rounded-3xl border p-4" style={{ borderColor, backgroundColor: surface }}>


          {providers.map((provider) => {
            const isLoading = loadingProvider === provider.id;
            const isDisabled = loadingProvider !== null;

            if (provider.id === "apple" && Platform.OS === "ios") {
              return (
                <View
                  key={provider.id}
                  pointerEvents={isDisabled ? "none" : "auto"}
                  style={{ opacity: isDisabled && !isLoading ? 0.56 : 1 }}
                >
                  <AppleAuthentication.AppleAuthenticationButton
                    accessibilityLabel={provider.label}
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={
                      appTheme.isDark
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    cornerRadius={24}
                    onPress={() => handleSocialSignIn("apple")}
                    style={{ height: 48, width: "100%" }}
                  />
                </View>
              );
            }

            return (
              <Pressable
                key={provider.id}
                accessibilityRole="button"
                disabled={isDisabled}
                onPress={() => handleSocialSignIn(provider.id)}
                className="min-h-12 flex-row items-center justify-center gap-3 border px-4"
                style={{
                  backgroundColor: provider.id === "google" && appTheme.isDark ? "#ffffff" : appTheme.colors.background,
                  borderColor: provider.id === "google" && appTheme.isDark ? "rgba(0,0,0,0.25)" : borderColor,
                  borderRadius: 24,
                  opacity: isDisabled && !isLoading ? 0.56 : 1,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color={appTheme.colors.foreground} />
                ) : provider.id === "google" ? (
                  <View style={{ height: 20, width: 20, overflow: "hidden" }}>
                    <Image
                      source={provider.icon}
                      contentFit="contain"
                      style={{ position: "absolute", left: -12, top: -12, height: 44, width: 44 }}
                    />
                  </View>
                ) : (
                  <Image source={provider.icon} contentFit="contain" style={{ height: 32, width: 32 }} />
                )}
                <AppText
                  style={{
                    color: provider.id === "google" && appTheme.isDark ? "#000000" : appTheme.colors.foreground,
                    fontSize: provider.id === "google" ? 19 : undefined,
                    fontWeight: provider.id === "google" ? "500" : "600",
                  }}
                >
                  {provider.label}
                </AppText>
              </Pressable>
            );
          })}

          {error ? <AppText className="text-sm" style={{ color: appTheme.colors.negative }}>{error}</AppText> : null}
        </View>
      </ScrollView>
    </>
  );
}
