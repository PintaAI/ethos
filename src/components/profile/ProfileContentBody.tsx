/* eslint-disable react-hooks/static-components -- Rows close over the current theme and expanded setting state. */
import type { ImageSource } from "expo-image";
import type { SFSymbol } from "expo-symbols";
import { useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { useCurrency } from "@/components/CurrencyProvider";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { APP_VERSION } from "@/config/app";
import { alpha } from "@/lib/color";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useIslandToast } from "@/components/IslandToast";

export type ProfileContentBodyProps = {
  isAuthenticated: boolean;
  displayName: string;
  email: string;
  initials: string;
  avatarSource: ImageSource | null;
  syncStatus: string;
  syncActionLabel: string;
  syncDetail: string;
  updateStatus: string;
  isCheckingForUpdate: boolean;
  isUpdatingPhoto: boolean;
  notificationsEnabled: boolean | null;
  cloudStatusDetail: string;
  cloudSyncEnabled: boolean;
  onCloudSyncEnabledChange: (enabled: boolean) => void;
  onSignOut: () => void;
  onSyncNow: () => void;
  onCheckForUpdates: () => void;
  onUpdatePhoto: () => void;
  onOpenPrivacyPolicy: () => void;
  onContactSupport: () => void;
  onOpenAccount: () => void;
  onOpenFontSettings: () => void;
  onOpenNotificationSettings: () => void;
  onOpenAuth: () => void;
  onOpenOnboarding: () => void;
};

export function ProfileContentBody(props: ProfileContentBodyProps) {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const { compactAmountsEnabled, currency, setCompactAmountsEnabled, setCurrency } = useCurrency();
  const { showIslandToast } = useIslandToast();
  const [expandedSetting, setExpandedSetting] = useState<"theme" | "currency" | "language" | null>(null);
  const [cloudSwitchKey, setCloudSwitchKey] = useState(0);
  const rowColor = alpha(appTheme.colors.muted, appTheme.isDark ? 0.18 : 0.1);

  const Row = ({ label, detail, icon, onPress, destructive = false }: {
    label: string;
    detail?: string;
    icon: SFSymbol;
    onPress: () => void;
    destructive?: boolean;
  }) => (
    <Pressable
      accessibilityRole="button"
      className="min-h-14 flex-row items-center justify-between px-4 py-3"
      onPress={onPress}
      style={{ backgroundColor: rowColor }}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <AppSymbol
          name={icon}
          size={20}
          tintColor={destructive ? appTheme.colors.negative : appTheme.colors.primary}
          fallback={<Text style={{ color: destructive ? appTheme.colors.negative : appTheme.colors.primary }}>?</Text>}
        />
        <Text className="font-semibold" style={{ color: destructive ? appTheme.colors.negative : appTheme.colors.foreground }}>
          {label}
        </Text>
      </View>
      {detail ? <Text className="ml-4 flex-1 text-right text-sm" style={{ color: appTheme.colors.muted }}>{detail}</Text> : null}
    </Pressable>
  );

  const Options = ({ options, selected, onSelect }: {
    options: { label: string; value: string }[];
    selected: string;
    onSelect: (value: string) => void;
  }) => (
    <View className="gap-px">
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: option.value === selected }}
          className="min-h-12 flex-row items-center justify-between pl-12 pr-4 py-2"
          onPress={() => {
            onSelect(option.value);
            setExpandedSetting(null);
          }}
          style={{ backgroundColor: rowColor }}
        >
          <Text style={{ color: appTheme.colors.foreground }}>{option.label}</Text>
          {option.value === selected ? (
            <AppSymbol name="checkmark" size={18} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>✓</Text>} />
          ) : null}
        </Pressable>
      ))}
    </View>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="gap-px">
      <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>{title}</Text>
      <View className="overflow-hidden rounded-2xl">{children}</View>
    </View>
  );

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-5 pb-12 pt-5"
      style={{ backgroundColor: appTheme.colors.background }}
    >
      <ProfileHeader
        avatarSource={props.avatarSource}
        initials={props.initials}
        isUpdatingPhoto={props.isUpdatingPhoto}
        onUpdatePhoto={props.onUpdatePhoto}
      />

      <Section title={t("profile.account")}>
        {props.isAuthenticated ? (
          <>
            <Row label={t("profile.accountDetails")} detail={props.email} icon="person.crop.circle" onPress={props.onOpenAccount} />
            <Row label={t("profile.deleteAccount")} icon="trash" onPress={props.onOpenAccount} destructive />
            <Row label={t("common.signOut")} icon="rectangle.portrait.and.arrow.right" onPress={props.onSignOut} destructive />
          </>
        ) : <Row label={t("common.signIn")} icon="person.badge.key" onPress={props.onOpenAuth} />}
      </Section>

      <Section title={t("profile.appearance")}>
        <View className="min-h-14 flex-row items-center justify-between px-4" style={{ backgroundColor: rowColor }}>
          <View className="flex-row items-center gap-3">
            <AppSymbol name="moon" size={20} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>?</Text>} />
            <Text className="font-semibold" style={{ color: appTheme.colors.foreground }}>{t("profile.darkMode")}</Text>
          </View>
          <Switch
            value={appTheme.isDark}
            onValueChange={(value) => appTheme.setColorScheme(value ? "dark" : "light")}
            trackColor={{ true: appTheme.colors.primary }}
          />
        </View>
        <Row label={t("profile.theme")} detail={appTheme.availableThemes.find((option) => option.slug === appTheme.theme)?.name} icon="paintpalette" onPress={() => setExpandedSetting(expandedSetting === "theme" ? null : "theme")} />
        {expandedSetting === "theme" ? <Options options={appTheme.availableThemes.map((option) => ({ label: option.name, value: option.slug }))} selected={appTheme.theme} onSelect={appTheme.setTheme} /> : null}
        <Row label="Font" icon="textformat.size" onPress={props.onOpenFontSettings} />
      </Section>

      <Section title={t("cloud.title")}>
        <View className="min-h-14 flex-row items-center justify-between px-4" style={{ backgroundColor: rowColor }}>
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            <AppSymbol name="icloud" size={20} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>?</Text>} />
            <View className="min-w-0 flex-1">
              <Text className="font-semibold" style={{ color: appTheme.colors.foreground }}>{t("cloud.title")}</Text>
              <Text className="text-sm" style={{ color: appTheme.colors.muted }}>{props.cloudStatusDetail}</Text>
            </View>
          </View>
          <Switch
            key={cloudSwitchKey}
            value={props.cloudSyncEnabled}
            onValueChange={(value) => {
              if (!props.isAuthenticated) setCloudSwitchKey((k) => k + 1);
              props.onCloudSyncEnabledChange(value);
            }}
            trackColor={{ true: appTheme.colors.primary }}
          />
        </View>
        {props.isAuthenticated && props.cloudSyncEnabled ? (
          <Row label={props.syncActionLabel} detail={props.syncDetail} icon="arrow.triangle.2.circlepath" onPress={props.onSyncNow} />
        ) : null}
      </Section>

      <Section title={t("profile.app")}>
        <Row label={t("profile.currency")} detail={currency} icon="dollarsign.circle" onPress={() => setExpandedSetting(expandedSetting === "currency" ? null : "currency")} />
        {expandedSetting === "currency" ? <Options options={SUPPORTED_CURRENCIES.map((option) => ({ label: `${option.flag} ${option.code} - ${option.name}`, value: option.code }))} selected={currency} onSelect={setCurrency} /> : null}
        <View className="min-h-14 flex-row items-center justify-between px-4" style={{ backgroundColor: rowColor }}>
          <View className="flex-row items-center gap-3">
            <AppSymbol name="number.circle" size={20} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>?</Text>} />
            <Text className="font-semibold" style={{ color: appTheme.colors.foreground }}>{t("profile.compactAmounts")}</Text>
          </View>
          <Switch
            value={compactAmountsEnabled}
            onValueChange={setCompactAmountsEnabled}
            trackColor={{ true: appTheme.colors.primary }}
          />
        </View>
        <Row label={t("language.label")} detail={i18n.resolvedLanguage === "id" ? t("language.indonesia") : t("language.english")} icon="globe" onPress={() => setExpandedSetting(expandedSetting === "language" ? null : "language")} />
        {expandedSetting === "language" ? <Options options={[{ label: t("language.english"), value: "en" }, { label: t("language.indonesia"), value: "id" }]} selected={i18n.resolvedLanguage || "en"} onSelect={(value) => void i18n.changeLanguage(value)} /> : null}
      </Section>

      <Section title={t("profile.notifications")}>
        <Row
          label={t("profile.remindersAndAlerts")}
          detail={props.notificationsEnabled === null
            ? t("profile.notificationStatusChecking")
            : props.notificationsEnabled
              ? t("profile.notificationStatusOn")
              : t("profile.notificationStatusOff")}
          icon="bell.badge"
          onPress={props.onOpenNotificationSettings}
        />
      </Section>

      <Section title={t("profile.updates")}>
        <Row
          label={props.isCheckingForUpdate ? t("profile.checkingForUpdates") : t("profile.checkForUpdates")}
          detail={props.updateStatus}
          icon="arrow.clockwise.circle"
          onPress={props.onCheckForUpdates}
        />
        <Row label={t("profile.appVersion", { version: APP_VERSION })} icon="info.circle" onPress={() => {}} />
      </Section>

      <Section title={t("profile.support")}>
        <Row label={t("profile.privacyPolicy")} icon="hand.raised" onPress={props.onOpenPrivacyPolicy} />
        <Row label={t("profile.contactSupport")} icon="bubble.left.and.bubble.right" onPress={props.onContactSupport} />
      </Section>

      {__DEV__ ? (
        <Section title={t("profile.development")}>
          <Row
            label={t("profile.previewSaveFeedback")}
            icon="checkmark.circle.fill"
            onPress={() => showIslandToast({
              icon: "checkmark.circle.fill",
              accessibilityLabel: t("entry.transactionSaved"),
            })}
          />
          <Row label={t("profile.openOnboarding")} icon="hand.wave" onPress={props.onOpenOnboarding} />
        </Section>
      ) : null}
    </ScrollView>
  );
}
