import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImageSource } from "expo-image";
import { View } from "react-native";
import { Button, Form, Host, Image, Label, LabeledContent, Picker, RNHostView, Section, Text, Toggle } from "@expo/ui/swift-ui";
import {
  background,
  environment,
  font,
  frame,
  hidden,
  kerning,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  onTapGesture,
  pickerStyle,
  scrollContentBackground,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { APP_VERSION } from "@/config/app";
import { useAppTheme, type ThemeName } from "@/components/provider/AppTheme";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { alpha } from "@/lib/color";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useIslandToast } from "@/components/provider/IslandToast";

const SETTINGS_ICON_SIZE = 15;

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

export function ProfileContentBody({
  isAuthenticated,
  displayName,
  email,
  initials,
  avatarSource,
  syncStatus,
  syncActionLabel,
  syncDetail,
  updateStatus,
  isCheckingForUpdate,
  isUpdatingPhoto,
  notificationsEnabled,
  cloudStatusDetail,
  cloudSyncEnabled,
  onCloudSyncEnabledChange,
  onSignOut,
  onSyncNow,
  onCheckForUpdates,
  onUpdatePhoto,
  onOpenPrivacyPolicy,
  onContactSupport,
  onOpenAccount,
  onOpenFontSettings,
  onOpenNotificationSettings,
  onOpenAuth,
  onOpenOnboarding,
}: ProfileContentBodyProps) {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const [cloudToggleKey, setCloudToggleKey] = useState(0);
  const { theme, setTheme } = appTheme;
  const { compactAmountsEnabled, currency, setCompactAmountsEnabled, setCurrency } = useCurrency();
  const { showIslandToast } = useIslandToast();
  const rowBackground = alpha(appTheme.colors.muted, appTheme.isDark ? 0.18 : 0.1);
  const profileHeaderVerticalPadding = Math.max(16, Math.round(appTheme.textSize * 1.1));
  const rowModifiers = [listRowBackground(rowBackground)];

  return (
    <View
      collapsable={false}
      className="flex-1"
      style={{ backgroundColor: appTheme.colors.background }}
    >
      <Host
        useViewportSizeMeasurement
        style={{ flex: 1, backgroundColor: appTheme.colors.background }}
        modifiers={[
          environment("colorScheme", appTheme.resolvedScheme),
          ...(appTheme.usesSystemTextSettings ? [] : [font({ size: appTheme.textSize }), kerning(appTheme.textSpacing)]),
        ]}
      >
        <Form
          modifiers={[
            scrollContentBackground("hidden"),
            background(appTheme.colors.background),
          ]}
        >
          <Section
            header={
              <RNHostView matchContents>
                <View
                  className="px-4"
                  style={{
                    backgroundColor: appTheme.colors.background,
                    paddingBottom: Math.max(8, Math.round(appTheme.textSize * 0.55)),
                    paddingTop: profileHeaderVerticalPadding,
                  }}
                >
                    <ProfileHeader
                      avatarSource={avatarSource}
                      initials={initials}
                      isUpdatingPhoto={isUpdatingPhoto}
                      onUpdatePhoto={onUpdatePhoto}
                    />
                </View>
              </RNHostView>
            }
          >
            <Text
              modifiers={[
                hidden(),
                frame({ height: 0 }),
                listRowBackground(rowBackground),
                listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
                listRowSeparator("hidden"),
              ]}
            />
          </Section>

          <Section title={t("profile.account")}>
            {isAuthenticated ? (
              <LabeledContent
                label={
                  <Label
                    title={t("profile.accountDetails")}
                    icon={<Image systemName="person.crop.circle" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                  />
                }
                modifiers={[...rowModifiers, onTapGesture(() => onOpenAccount())]}
              >
                <Text>{email}</Text>
              </LabeledContent>
            ) : null}
            {isAuthenticated ? (
              <Button
                onPress={onOpenAccount}
                modifiers={[...rowModifiers, tint(appTheme.colors.negative)]}
              >
                <Label
                  title={t("profile.deleteAccount")}
                  icon={<Image systemName="trash" size={SETTINGS_ICON_SIZE} color={appTheme.colors.negative} />}
                />
              </Button>
            ) : null}
            {!isAuthenticated ? (
              <Button
                onPress={() => onOpenAuth()}
                modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
              >
                <Label
                  title={t("common.signIn")}
                  icon={<Image systemName="person.badge.key" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              </Button>
            ) : null}
            {isAuthenticated ? (
              <Button
                onPress={onSignOut}
                modifiers={[...rowModifiers, tint(appTheme.colors.negative)]}
              >
                <Label
                  title={t("common.signOut")}
                  icon={<Image systemName="rectangle.portrait.and.arrow.right" size={SETTINGS_ICON_SIZE} color={appTheme.colors.negative} />}
                />
              </Button>
            ) : null}
          </Section>

          <Section title={t("cloud.title")}>
            <Toggle
              key={cloudToggleKey}
              isOn={cloudSyncEnabled}
              onIsOnChange={(value) => {
                if (!isAuthenticated) setCloudToggleKey((k) => k + 1);
                onCloudSyncEnabledChange(value);
              }}
              modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
            >
              <Label
                title={t("cloud.title")}
                icon={<Image systemName="icloud" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
              />
              <Text>{cloudStatusDetail}</Text>
            </Toggle>
            {isAuthenticated && cloudSyncEnabled ? (
              <LabeledContent
                label={
                  <Label
                    title={syncActionLabel}
                    icon={<Image systemName="arrow.triangle.2.circlepath" size={SETTINGS_ICON_SIZE} color={syncStatus === "error" ? appTheme.colors.negative : appTheme.colors.primary} />}
                  />
                }
                modifiers={[
                  ...rowModifiers,
                  tint(syncStatus === "error" ? appTheme.colors.negative : appTheme.colors.primary),
                  ...(syncStatus === "syncing" ? [] : [onTapGesture(() => onSyncNow())]),
                ]}
              >
                <Text>{syncDetail}</Text>
              </LabeledContent>
            ) : null}
          </Section>

          <Section title={t("profile.appearance")}>
            <Toggle
              isOn={appTheme.isDark}
              onIsOnChange={(value: boolean) => appTheme.setColorScheme(value ? "dark" : "light")}
              modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
            >
              <Label
                title={t("profile.darkMode")}
                icon={<Image systemName="moon" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
              />
            </Toggle>
            <Picker
              label={
                <Label
                  title={t("profile.theme")}
                  icon={<Image systemName="paintpalette" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              }
              selection={theme}
              onSelectionChange={(value) => setTheme(value as ThemeName)}
              modifiers={[...rowModifiers, pickerStyle("menu"), tint(appTheme.colors.primary)]}
            >
              {appTheme.availableThemes.map((option) => (
                <Text key={option.slug} modifiers={[tag(option.slug)]}>
                  {option.name}
                </Text>
              ))}
            </Picker>
            <LabeledContent
              label={
                <Label
                  title="Font"
                  icon={<Image systemName="textformat.size" size={SETTINGS_ICON_SIZE} />}
                />
              }
              modifiers={[...rowModifiers, onTapGesture(() => onOpenFontSettings())]}
            >
              <Text />
            </LabeledContent>
          </Section>

          <Section title={t("profile.app")}>
            <Picker
              label={
                <Label
                  title={t("profile.currency")}
                  icon={<Image systemName="dollarsign.circle" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              }
              selection={currency}
              onSelectionChange={(value) => setCurrency(String(value))}
              modifiers={[...rowModifiers, pickerStyle("menu"), tint(appTheme.colors.primary)]}
            >
              {SUPPORTED_CURRENCIES.map((option) => (
                <Text key={option.code} modifiers={[tag(option.code)]}>
                  {`${option.flag} ${option.code}`}
                </Text>
              ))}
            </Picker>
            <Toggle
              isOn={compactAmountsEnabled}
              onIsOnChange={setCompactAmountsEnabled}
              modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
            >
              <Label
                title={t("profile.compactAmounts")}
                icon={<Image systemName="number.circle" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
              />
            </Toggle>
            <Picker
              label={
                <Label
                  title={t("language.label")}
                  icon={<Image systemName="globe" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              }
              selection={i18n.resolvedLanguage || "en"}
              onSelectionChange={(value) => i18n.changeLanguage(String(value))}
              modifiers={[...rowModifiers, pickerStyle("menu"), tint(appTheme.colors.primary)]}
            >
              <Text modifiers={[tag("en")]}>{t("language.english")}</Text>
              <Text modifiers={[tag("id")]}>{t("language.indonesia")}</Text>
            </Picker>
          </Section>

          <Section title={t("profile.notifications")}>
            <LabeledContent
              label={
                <Label
                  title={t("profile.remindersAndAlerts")}
                  icon={<Image systemName="bell.badge" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              }
              modifiers={[...rowModifiers, onTapGesture(() => onOpenNotificationSettings())]}
            >
              <Text>
                {notificationsEnabled === null
                  ? t("profile.notificationStatusChecking")
                  : notificationsEnabled
                    ? t("profile.notificationStatusOn")
                    : t("profile.notificationStatusOff")}
              </Text>
            </LabeledContent>
          </Section>

          {__DEV__ ? (
            <Section title={t("profile.development")}>
              <Button
                onPress={() => showIslandToast({
                  icon: "checkmark.circle.fill",
                  accessibilityLabel: t("entry.transactionSaved"),
                })}
                modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
              >
                <Label
                  title={t("profile.previewSaveFeedback")}
                  icon={<Image systemName="checkmark.circle.fill" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              </Button>
              <Button
                onPress={() => onOpenOnboarding()}
                modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
              >
                <Label
                  title={t("profile.openOnboarding")}
                  icon={<Image systemName="hand.wave" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              </Button>
            </Section>
          ) : null}

          <Section title={t("profile.updates")}>
            <LabeledContent
              label={
                <Label
                  title={isCheckingForUpdate ? t("profile.checkingForUpdates") : t("profile.checkForUpdates")}
                  icon={<Image systemName="arrow.clockwise.circle" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              }
              modifiers={[
                ...rowModifiers,
                tint(appTheme.colors.primary),
                ...(isCheckingForUpdate ? [] : [onTapGesture(() => onCheckForUpdates())]),
              ]}
            >
              <Text>{updateStatus}</Text>
            </LabeledContent>
            <LabeledContent
              label={
                <Label
                  title={t("profile.appVersion", { version: APP_VERSION })}
                  icon={<Image systemName="info.circle" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
                />
              }
              modifiers={rowModifiers}
            >
              <Text>{APP_VERSION}</Text>
            </LabeledContent>
          </Section>

          <Section title={t("profile.getHelp")}>
            <Button
              onPress={() => onOpenPrivacyPolicy ? void onOpenPrivacyPolicy() : undefined}
              modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
            >
              <Label
                title={t("profile.privacyPolicy")}
                icon={<Image systemName="hand.raised" size={SETTINGS_ICON_SIZE} color={appTheme.colors.primary} />}
              />
            </Button>
            <Button
              onPress={() => onContactSupport ? void onContactSupport() : undefined}
              modifiers={[...rowModifiers, tint(appTheme.colors.primary)]}
            >
              <Label
                title={t("profile.contactSupport")}
                icon={
                  <Image
                    systemName="bubble.left.and.bubble.right"
                    size={SETTINGS_ICON_SIZE}
                    color={appTheme.colors.primary}
                  />
                }
              />
            </Button>
          </Section>
        </Form>
      </Host>

    </View>
  );
}
