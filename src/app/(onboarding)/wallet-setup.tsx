import { useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme, type ThemeSet } from "@/components/AppTheme";
import { GlassBox } from "@/components/GlassBox";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { walletImageToIcon } from "@/lib/categoryMapping";
import type { PickedUploadImage } from "@/lib/imageUpload";
import { pickUploadImage } from "@/lib/imageUpload";
import { colorsToThemeSet, extractColors } from "@/lib/palette";
import { alpha } from "@/lib/color";
import { deleteOwnedWalletImage, persistWalletImage } from "@/lib/walletImages";
import { getManagementImageSource } from "@/lib/protectedImage";
import { canDeleteUnreferencedWalletTheme, walletThemeSlug } from "@/lib/onboardingWallet";
import { loadWalletPresetImage, walletPresets } from "@/lib/walletPresets";

type Mode = "cloud" | "offline";

export default function WalletSetup() {
  const { mode } = useLocalSearchParams<{ mode?: Mode }>();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const insets = useSafeAreaInsets();
  const cashflow = useCashflowData();
  const [creatingAnother, setCreatingAnother] = useState(false);
  const [newWalletIndex, setNewWalletIndex] = useState(0);
  const existing = creatingAnother ? null : cashflow.activeManagement;
  const stateKey = existing?.id ?? `new-${newWalletIndex}`;
  const [loadedKey, setLoadedKey] = useState(stateKey);
  const [name, setName] = useState(existing?.name ?? "");
  const [picked, setPicked] = useState<PickedUploadImage | null>(null);
  const [previewTheme, setPreviewTheme] = useState<ThemeSet | null>(existing?.imageTheme?.themeSet ?? null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "continue" | null>(null);
  const saving = savingAction !== null;

  if (loadedKey !== stateKey) {
    setLoadedKey(stateKey);
    setName(existing?.name ?? "");
    setPicked(null);
    setPreviewTheme(existing?.imageTheme?.themeSet ?? null);
    setSelectedPreset(null);
    setRemoveImage(false);
  }

  const currentUri = picked?.uri ?? (!removeImage && existing?.image && !existing.image.startsWith("symbol:") ? existing.image : null);
  const imageSource = picked ? { uri: picked.uri } : getManagementImageSource(currentUri);
  const colors = previewTheme?.[appTheme.resolvedScheme];
  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);
  const canRemoveImage = !!picked || (!!currentUri && existing?.remoteId === null);
  const hasChanges = !!existing && (
    name.trim() !== existing.name.trim()
    || picked !== null
    || removeImage
  );
  const walletAction = existing
    ? (hasChanges ? "saveChanges" : "add")
    : (name.trim() ? "saveWallet" : null);
  const canContinue = !!name.trim() || (!existing && cashflow.managements.length > 0);

  async function chooseImage() {
    try {
      const image = await pickUploadImage([1, 1]);
      if (!image) return;
      const themeSet = colorsToThemeSet(await extractColors(image.uri));
      setPicked(image);
      setPreviewTheme(themeSet);
      setSelectedPreset(null);
      setRemoveImage(false);
    } catch (error) {
      Alert.alert(t("walletSetup.imageErrorTitle"), error instanceof Error ? error.message : t("walletSetup.saveError"));
    }
  }

  async function choosePreset(preset: (typeof walletPresets)[number]) {
    if (saving || loadingPreset) return;
    setLoadingPreset(preset.id);
    try {
      const image = await loadWalletPresetImage(preset);
      if (!image) throw new Error(t("walletSetup.saveError"));
      const themeSet = colorsToThemeSet(await extractColors(image.uri));
      setPicked(image);
      setPreviewTheme(themeSet);
      setSelectedPreset(preset.id);
      setRemoveImage(false);
    } catch (error) {
      Alert.alert(t("walletSetup.imageErrorTitle"), error instanceof Error ? error.message : t("walletSetup.saveError"));
    } finally {
      setLoadingPreset(null);
    }
  }

  function clearImage() {
    if (picked) {
      setPicked(null);
      setPreviewTheme(existing?.imageTheme?.themeSet ?? null);
      setSelectedPreset(null);
      setRemoveImage(false);
    } else {
      setPreviewTheme(null);
      setRemoveImage(true);
    }
  }

  function openImageActions() {
    if (!currentUri) {
      void chooseImage();
      return;
    }

    const replaceLabel = t("walletSetup.replace");
    const removeLabel = t("walletSetup.removeImage");
    const cancelLabel = t("common.cancel");

    if (Platform.OS === "ios") {
      const options = canRemoveImage
        ? [replaceLabel, removeLabel, cancelLabel]
        : [replaceLabel, cancelLabel];
      ActionSheetIOS.showActionSheetWithOptions({
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: canRemoveImage ? 1 : undefined,
        tintColor: appTheme.colors.primary,
        userInterfaceStyle: appTheme.isDark ? "dark" : "light",
      }, (buttonIndex) => {
        if (buttonIndex === 0) void chooseImage();
        if (canRemoveImage && buttonIndex === 1) clearImage();
      });
      return;
    }

    Alert.alert(t("walletSetup.image"), undefined, [
      { text: replaceLabel, onPress: () => { void chooseImage(); } },
      ...(canRemoveImage ? [{ text: removeLabel, style: "destructive" as const, onPress: clearImage }] : []),
      { text: cancelLabel, style: "cancel" },
    ]);
  }

  async function selectWallet(management: (typeof cashflow.managements)[number]) {
    if (saving || switchingWalletId) return;
    if (!creatingAnother && management.id === cashflow.activeManagementId) return;

    setSwitchingWalletId(management.id);
    try {
      await cashflow.setActiveManagementId(management.id);
      setCreatingAnother(false);

      if (management.imageTheme) {
        let themeSlug = management.imageTheme.themeSlug;
        const hasTheme = appTheme.availableThemes.some((theme) => theme.slug === themeSlug);
        if (!hasTheme) {
          const stored = await appTheme.upsertWalletTheme(management.id, `${management.name} Wallet`, management.imageTheme.themeSet);
          themeSlug = stored.slug;
          await cashflow.updateManagementImageTheme(management.id, { ...management.imageTheme, themeSlug });
        }
        appTheme.setTheme(themeSlug);
      }
    } catch (error) {
      Alert.alert(t("walletSetup.switchErrorTitle"), error instanceof Error ? error.message : t("walletSetup.switchError"));
    } finally {
      setSwitchingWalletId(null);
    }
  }

  function startNewWallet() {
    if (saving || switchingWalletId) return;
    setCreatingAnother(true);
    setNewWalletIndex((index) => index + 1);
  }

  function continueSetup() {
    if (saving || (mode !== "cloud" && mode !== "offline")) return;
    if ((existing && !hasChanges) || (!existing && !name.trim() && cashflow.managements.length > 0)) {
      router.push({ pathname: "/(onboarding)/growth-setup", params: { mode } } as unknown as Href);
      return;
    }
    void commit("continue");
  }

  async function commit(action: "save" | "continue") {
    if (!name.trim() || saving || !cashflow.isReady || (mode !== "cloud" && mode !== "offline")) return;
    setSavingAction(action);
    let persistedUri: string | null = null;
    let committedManagementId: string | null = null;
    let createdManagement = false;
    let mutatedExisting = false;
    let changedStableTheme = false;
    const previousSelectedTheme = appTheme.theme;
    const previousImageTheme = existing?.imageTheme ?? null;
    const previousThemeSlug = previousImageTheme?.themeSlug;
    const customThemeSlugs = appTheme.customThemes.map((theme) => theme.slug);
    try {
      if (picked) persistedUri = await persistWalletImage(picked);

      const managementId = existing?.id ?? await cashflow.createManagement({ name, image: null });
      if (!managementId) throw new Error(t("walletSetup.saveError"));
      committedManagementId = managementId;
      createdManagement = !existing;

      let storedTheme = null;
      if (picked && previewTheme) {
        storedTheme = await appTheme.upsertWalletTheme(managementId, `${name.trim()} Wallet`, previewTheme);
        changedStableTheme = true;
      }
      const selectedThemeSlug = storedTheme?.slug ?? (!removeImage ? previousThemeSlug : undefined);

      if (existing) {
        mutatedExisting = true;
        await cashflow.updateManagement(managementId, { name, image: existing.image });
      }

      if (picked && previewTheme && persistedUri && storedTheme) {
        await cashflow.setManagementImage(managementId, persistedUri, {
          version: 1,
          image: persistedUri,
          themeSlug: storedTheme.slug,
          themeSet: previewTheme,
        });
      } else if (removeImage && existing?.remoteId === null) {
        await cashflow.setManagementImage(managementId, null, null);
      }

      if ((picked || removeImage) && previousThemeSlug && previousThemeSlug !== selectedThemeSlug && canDeleteUnreferencedWalletTheme(
        previousThemeSlug,
        managementId,
        cashflow.managements,
        customThemeSlugs,
      )) {
        if (removeImage) {
          await appTheme.deleteTheme(previousThemeSlug);
        } else {
          try {
            await appTheme.deleteTheme(previousThemeSlug);
          } catch (error) {
            console.warn("Failed to clean previous wallet theme", error);
          }
        }
      }

      if (selectedThemeSlug) appTheme.setTheme(selectedThemeSlug);
      if ((persistedUri || removeImage) && existing?.image !== persistedUri) deleteOwnedWalletImage(existing?.image);
      if (action === "continue") {
        router.push({ pathname: "/(onboarding)/growth-setup", params: { mode } } as unknown as Href);
      } else {
        setCreatingAnother(false);
        setName(name.trim());
        setPicked(null);
        setSelectedPreset(null);
        setRemoveImage(false);
      }
    } catch (error) {
      try {
        if (createdManagement && committedManagementId) {
          await cashflow.deleteManagement(committedManagementId);
        } else if (existing && mutatedExisting) {
          await cashflow.updateManagement(existing.id, { name: existing.name, image: existing.image });
          await cashflow.setManagementImage(existing.id, existing.image, previousImageTheme);
        }

        if (changedStableTheme && committedManagementId) {
          const stableSlug = walletThemeSlug(committedManagementId);
          const previousStableTheme = appTheme.customThemes.find((theme) => theme.slug === stableSlug) ?? null;
          if (previousStableTheme) {
            await appTheme.upsertWalletTheme(committedManagementId, previousStableTheme.name, previousStableTheme);
          } else {
            await appTheme.deleteTheme(stableSlug);
          }
        }
        appTheme.setTheme(previousSelectedTheme);
      } catch (rollbackError) {
        console.warn("Failed to fully roll back wallet setup", rollbackError);
      }
      if (persistedUri) deleteOwnedWalletImage(persistedUri);
      Alert.alert(t("walletSetup.saveErrorTitle"), error instanceof Error ? error.message : t("walletSetup.saveError"));
    } finally {
      setSavingAction(null);
    }
  }

  if (!cashflow.isReady) {
    return <View className="flex-1 items-center justify-center bg-[--app-color-background]"><ActivityIndicator color={appTheme.colors.primary} /></View>;
  }

  return (
    <>
      <Stack.Screen options={{ title: "" }}>
        <Stack.Screen.BackButton displayMode="minimal" />
      </Stack.Screen>
      <ScrollView className="flex-1 bg-[--app-color-background]" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 px-4 pb-6 pt-4" keyboardShouldPersistTaps="handled">
        <View className="gap-3 px-2 pb-2">
          <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.primary }}>
            {t("walletSetup.title")}
          </Text>
          <Text className="max-w-md text-4xl font-black leading-tight tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {t("walletSetup.heading")}
          </Text>
          <Text className="max-w-md text-base leading-6" style={{ color: appTheme.colors.muted }}>
            {t("walletSetup.description")}
          </Text>
        </View>

        <View className="gap-4 rounded-[32px] border p-4" style={{ borderColor, backgroundColor: surface }}>
          <View className="flex-row items-center gap-4">
            <View className="relative h-24 w-24">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={currentUri ? t("walletSetup.manageImage") : t("walletSetup.choose")}
                disabled={saving}
                onPress={openImageActions}
                className="h-24 w-24 items-center justify-center"
                style={{ opacity: saving ? 0.72 : 1 }}
              >
                <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-[30px]" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                  {imageSource ? (
                    <Image source={imageSource} contentFit="cover" style={{ height: "100%", width: "100%" }} accessibilityLabel={t("walletSetup.imagePreview")} />
                  ) : (
                    <AppSymbol name={walletImageToIcon(existing?.image ?? "symbol:wallet.pass.fill")} size={38} tintColor={appTheme.colors.primary} />
                  )}
                </View>
              </Pressable>
              <View pointerEvents="none" className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2" style={{ backgroundColor: appTheme.colors.background, borderColor: appTheme.colors.background }}>
                <AppSymbol name="pencil.circle.fill" size={28} tintColor={appTheme.colors.primary} />
              </View>
            </View>

            <View className="min-w-0 flex-1 gap-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
                  {existing ? t("wallet.walletProfile") : t("wallet.newWallet")}
                </Text>
                {colors ? (
                  <View accessibilityLabel={t("walletSetup.palettePreview")} className="flex-row gap-1.5">
                    {["--color-primary", "--color-secondary", "--color-muted"].map((key) => (
                      <View key={key} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[key] }} />
                    ))}
                  </View>
                ) : null}
              </View>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Primary Wallet"
                placeholderTextColor={appTheme.colors.muted}
                selectionColor={appTheme.colors.primary}
                accessibilityLabel={t("walletSetup.name")}
                className="text-4xl font-bold tracking-tight"
                style={{ color: appTheme.colors.foreground, minHeight: 48, padding: 0 }}
              />
            </View>
          </View>

          <View className="gap-3">
            <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
              {t("walletSetup.presets")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {walletPresets.map((preset, index) => {
                const selected = selectedPreset === preset.id;
                const loading = loadingPreset === preset.id;
                return (
                  <GlassBox
                    key={preset.id}
                    isInteractive
                    tintColor={alpha(appTheme.colors.primary, selected ? (appTheme.isDark ? 0.3 : 0.18) : (appTheme.isDark ? 0.16 : 0.08))}
                    glassEffectStyle="clear"
                    style={{
                      borderColor: selected ? appTheme.colors.primary : borderColor,
                      borderRadius: 16,
                      borderWidth: selected ? 3 : 1,
                      height: 64,
                      opacity: loadingPreset !== null && !loading ? 0.5 : 1,
                      overflow: "hidden",
                      width: 64,
                    }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: saving || loadingPreset !== null }}
                      accessibilityLabel={t("walletSetup.presetLabel", { number: index + 1 })}
                      disabled={saving || loadingPreset !== null}
                      onPress={() => choosePreset(preset)}
                      className="items-center justify-center rounded-2xl"
                      style={{ height: "100%", width: "100%" }}
                    >
                      <Image source={preset.source} contentFit="contain" style={{ height: 54, width: 54 }} />
                      {loading ? <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: alpha(appTheme.colors.background, 0.72) }}><ActivityIndicator color={appTheme.colors.primary} size="small" /></View> : null}
                    </Pressable>
                  </GlassBox>
                );
              })}
            </ScrollView>
          </View>

          {!currentUri ? <View className="flex-row">
            <GlassBox
              isInteractive
              tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.1)}
              glassEffectStyle="clear"
              style={{ borderRadius: 16, flex: 1, opacity: saving ? 0.6 : 1 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("walletSetup.choose")}
                disabled={saving}
                onPress={chooseImage}
                className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl px-4"
              >
                <AppSymbol name="photo" size={17} tintColor={appTheme.colors.primary} />
                <Text className="text-sm font-bold" style={{ color: appTheme.colors.primary }}>{t("walletSetup.choose")}</Text>
              </Pressable>
            </GlassBox>
          </View> : null}
        </View>

        {walletAction ? (
          <GlassBox
            isInteractive
            tintColor={appTheme.colors.primary}
            glassEffectStyle="clear"
            style={{ borderRadius: 9999, opacity: !name.trim() || saving ? 0.45 : 1 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saving || (walletAction !== "add" && !name.trim()) }}
              disabled={saving || (walletAction !== "add" && !name.trim())}
              onPress={walletAction === "add" ? startNewWallet : () => { void commit("save"); }}
              className="flex-row items-center justify-center gap-2 rounded-full px-6 py-4"
            >
              {savingAction === "save" ? <ActivityIndicator color={appTheme.colors.inverseForeground} /> : <>
                <AppSymbol name={walletAction === "add" ? "plus" : "checkmark"} size={16} tintColor={appTheme.colors.inverseForeground} />
                <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                  {walletAction === "add"
                    ? t("walletSetup.addAnother")
                    : walletAction === "saveChanges"
                      ? t("walletSetup.saveChanges")
                      : t("walletSetup.saveWallet")}
                </Text>
              </>}
            </Pressable>
          </GlassBox>
        ) : null}

        {cashflow.managements.length > 0 ? (
          <View className="gap-3 px-1">
            <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
              {t("walletSetup.availableWallets")}
            </Text>
            <View className="gap-2">
              {cashflow.managements.map((management) => {
                const savedImageSource = getManagementImageSource(management.image);
                const isActive = management.id === cashflow.activeManagementId;
                return (
                  <GlassBox
                    key={management.id}
                    isInteractive
                    tintColor={alpha(appTheme.colors.primary, isActive ? (appTheme.isDark ? 0.24 : 0.14) : (appTheme.isDark ? 0.14 : 0.06))}
                    glassEffectStyle="clear"
                    style={{
                      borderRadius: 20,
                      opacity: switchingWalletId !== null && switchingWalletId !== management.id ? 0.5 : 1,
                    }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive, disabled: saving || switchingWalletId !== null }}
                      accessibilityLabel={t("walletSetup.activateWallet", { name: management.name })}
                      disabled={saving || switchingWalletId !== null}
                      onPress={() => selectWallet(management)}
                      className="flex-row items-center gap-3 rounded-[20px] px-4 py-3"
                    >
                      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                        {savedImageSource ? (
                          <Image source={savedImageSource} contentFit="cover" style={{ height: "100%", width: "100%" }} />
                        ) : (
                          <AppSymbol name={walletImageToIcon(management.image)} size={20} tintColor={appTheme.colors.primary} />
                        )}
                      </View>
                      <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                        {management.name}
                      </Text>
                      {switchingWalletId === management.id ? (
                        <ActivityIndicator color={appTheme.colors.primary} size="small" />
                      ) : isActive ? (
                        <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                          <AppSymbol name="checkmark" size={11} tintColor={appTheme.colors.primary} />
                          <Text className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>{t("walletSetup.active")}</Text>
                        </View>
                      ) : (
                        <Text className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>{t("walletSetup.makeActive")}</Text>
                      )}
                    </Pressable>
                  </GlassBox>
                );
              })}
            </View>
          </View>
        ) : null}

      </ScrollView>
      <View
        className="border-t px-4 pt-3"
        style={{
          backgroundColor: appTheme.colors.background,
          borderColor,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <GlassBox
          isInteractive
          tintColor={appTheme.colors.primary}
          glassEffectStyle="clear"
          style={{ borderRadius: 9999, opacity: !canContinue || saving ? 0.45 : 1 }}
        >
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canContinue || saving }} disabled={!canContinue || saving} onPress={continueSetup} className="items-center rounded-full px-6 py-4">
            {savingAction === "continue" ? <ActivityIndicator color={appTheme.colors.inverseForeground} /> : <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>{t("common.continue")}</Text>}
          </Pressable>
        </GlassBox>
      </View>
    </>
  );
}
