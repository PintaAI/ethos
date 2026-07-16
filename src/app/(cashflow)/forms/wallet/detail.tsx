import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/AppTheme";
import { IconSelector } from "@/components/IconSelector";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import type { CashflowManagementMember } from "@/data/cashflow/types";
import { alpha } from "@/lib/color";
import { createManagementInvite, updateManagementImage } from "@/lib/api/managements";
import { authBaseURL } from "@/lib/auth-client";
import { WALLET_ICON_OPTIONS, walletImageToIcon } from "@/lib/categoryMapping";
import { pickUploadImage, type PickedUploadImage } from "@/lib/imageUpload";
import { colorsToThemeSet, extractColors } from "@/lib/palette";
import { getManagementImageSource, getProfileImageSource } from "@/lib/protectedImage";

function isPicture(image: string | null) {
  return !!image && !image.startsWith("symbol:");
}

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { managements, createManagement, updateManagement, deleteManagement, listManagementMembers, setManagementImage } = useCashflowData();
  const isNewWallet = !id;
  const management = managements.find((item) => item.id === id) ?? null;
  const walletStateKey = management?.id ?? (isNewWallet ? "new" : "missing");
  const [loadedWalletKey, setLoadedWalletKey] = useState(walletStateKey);
  const [name, setName] = useState(management?.name ?? "");
  const [image, setImage] = useState(management?.image ?? "symbol:wallet.pass.fill");
  const [members, setMembers] = useState<CashflowManagementMember[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharingInvite, setIsSharingInvite] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [pendingUploadImage, setPendingUploadImage] = useState<PickedUploadImage | null>(null);
  const serverManagementId = management?.remoteId ?? null;
  const displayImage = previewImageUri ?? image;
  const managementImageSource = previewImageUri ? { uri: previewImageUri } : getManagementImageSource(image);
  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);

  if (loadedWalletKey !== walletStateKey) {
    setLoadedWalletKey(walletStateKey);
    setName(management?.name ?? "");
    setImage(management?.image ?? "symbol:wallet.pass.fill");
    setPreviewImageUri(null);
    setPendingUploadImage(null);
  }

  useEffect(() => {
    let isMounted = true;
    if (!id) return;

    listManagementMembers(id)
      .then((nextMembers) => {
        if (isMounted) setMembers(nextMembers);
      })
      .catch((error) => console.error("Failed to load wallet members", error));

    return () => {
      isMounted = false;
    };
  }, [id, listManagementMembers]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      let savedImage = image.trim() || null;

      if (!isNewWallet && management && pendingUploadImage) {
        if (!serverManagementId) {
          Alert.alert(t("wallet.syncRequiredTitle"), t("wallet.syncRequiredMessage"));
          return;
        }

        setIsUploadingImage(true);
        const result = await updateManagementImage(serverManagementId, pendingUploadImage);
        const uploadedImage = result.management.image;
        if (!uploadedImage) throw new Error("The server did not return an uploaded wallet image.");

        savedImage = uploadedImage;
        setImage(uploadedImage);

        let imageTheme = null;
        try {
          const colors = await extractColors(pendingUploadImage.uri);
          const themeSet = colorsToThemeSet(colors);
          const savedTheme = await appTheme.saveTheme(`${management.name} Wallet`, themeSet);
          imageTheme = {
            version: 1 as const,
            image: uploadedImage,
            themeSlug: savedTheme.slug,
            themeSet,
          };
        } catch (error) {
          console.warn("Failed to create wallet theme from uploaded image", error);
        }

        await setManagementImage(management.id, uploadedImage, imageTheme);
        setPreviewImageUri(null);
        setPendingUploadImage(null);
      }

      if (isNewWallet) {
        await createManagement({ name, image: savedImage });
      } else if (id) {
        await updateManagement(id, { name, image: savedImage });
      }
      router.back();
    } catch (error) {
      Alert.alert(
        t("wallet.saveFailedTitle"),
        error instanceof Error ? error.message : t("wallet.saveFailedMessage"),
      );
    } finally {
      setIsSaving(false);
      setIsUploadingImage(false);
    }
  };

  const handleShareInvite = async () => {
    if (!management || isSharingInvite) return;
    if (!serverManagementId) {
      Alert.alert(t("wallet.syncRequiredTitle"), t("wallet.syncRequiredMessage"));
      return;
    }
    setIsSharingInvite(true);
    try {
      const { code } = await createManagementInvite(serverManagementId);
      const inviteLink = `${authBaseURL}/invite?code=${encodeURIComponent(code)}`;
      await Share.share({
        title: t("wallet.joinTitle", { name: management.name }),
        url: inviteLink,
        message: t("wallet.joinMessage", { name: management.name, link: inviteLink }),
      });
    } catch (error) {
      console.error("Failed to create wallet invite", error);
      Alert.alert(t("wallet.inviteUnavailableTitle"), t("wallet.inviteUnavailableMessage"));
    } finally {
      setIsSharingInvite(false);
    }
  };

  const handleDelete = () => {
    if (!management || isDeleting) return;

    Alert.alert(t("wallet.deleteWalletTitle"), t("wallet.deleteWalletMessage", { name: management.name }), [
      { text: t("wallet.deleteWalletCancel"), style: "cancel" },
      {
        text: t("wallet.deleteWalletConfirm"),
        style: "destructive",
        onPress: () => {
          setIsDeleting(true);
          deleteManagement(management.id)
            .then(() => router.back())
            .catch((error) => {
              console.error("Failed to delete wallet", error);
              Alert.alert(t("wallet.deleteWalletFailedTitle"), error instanceof Error ? error.message : t("wallet.deleteWalletFailedMessage"));
            })
            .finally(() => setIsDeleting(false));
        },
      },
    ]);
  };

  const handleChooseImage = async () => {
    if (!management || isSaving) return;
    if (!serverManagementId) {
      Alert.alert(t("wallet.syncRequiredTitle"), t("wallet.syncRequiredMessage"));
      return;
    }

    try {
      const pickedImage = await pickUploadImage([1, 1]);
      if (!pickedImage) return;

      setPreviewImageUri(pickedImage.uri);
      setPendingUploadImage(pickedImage);
    } catch (error) {
      setPreviewImageUri(null);
      setPendingUploadImage(null);
      console.error("Failed to choose wallet image", error);
      Alert.alert(t("wallet.photoUploadFailedTitle"), error instanceof Error ? error.message : t("wallet.photoUploadFailedMessage"));
    }
  };

  if (!isNewWallet && !management) {
    return (
      <View className="flex-1 items-center justify-center bg-[--app-color-background] px-6">
        <Stack.Screen options={{ title: t("wallet.walletDetail") }} />
        <Text className="text-center text-base font-semibold" style={{ color: appTheme.colors.foreground }}>
          {t("wallet.walletNotFound")}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: isNewWallet ? t("wallet.newWallet") : management?.name,
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={isSaving ? t("wallet.saving") : t("wallet.save")} onPress={handleSave} primary disabled={isSaving} />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={toolbarIcons.check} onPress={handleSave} variant="done">
            {isSaving ? t("wallet.saving") : t("wallet.save")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      <ScrollView
        className="bg-[--app-color-background] flex-1"
        contentContainerClassName="gap-4 px-4 pb-12 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        <View className="gap-4 rounded-[32px] border p-4" style={{ borderColor, backgroundColor: surface }}>
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={management ? t("wallet.uploadPhotoLabel") : t("wallet.walletImageLabel")}
              disabled={!management || isSaving}
              onPress={handleChooseImage}
              className="h-24 w-24 items-center justify-center overflow-hidden rounded-[30px]"
              style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14), opacity: isSaving ? 0.72 : 1 }}
            >
              {isPicture(displayImage) && managementImageSource ? (
                <Image
                  source={managementImageSource}
                  contentFit="cover"
                  onError={(error) => console.warn("[management] image failed", management?.id ?? "draft", error)}
                  style={{ height: "100%", width: "100%" }}
                />
              ) : (
                <AppSymbol name={walletImageToIcon(displayImage)} size={38} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>•</Text>} />
              )}
              {isUploadingImage ? (
                <View className="absolute inset-0 items-center justify-center gap-1" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.32) }}>
                  <ActivityIndicator color={appTheme.colors.inverseForeground} size="small" />
                  <Text className="text-xs font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                    {t("wallet.uploading")}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
                {isNewWallet ? t("wallet.newWallet") : t("wallet.walletProfile")}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("wallet.walletNamePlaceholder")}
                placeholderTextColor={appTheme.colors.muted}
                selectionColor={appTheme.colors.primary}
                className="text-4xl font-bold tracking-tight"
                style={{ color: appTheme.colors.foreground, minHeight: 48, padding: 0 }}
              />
              {management ? (
                <Text selectable numberOfLines={1} className="text-xs" style={{ color: appTheme.colors.muted }}>
                  {serverManagementId ?? management.id}
                </Text>
              ) : null}
            </View>
          </View>

          {management ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("wallet.uploadPhotoLabel")}
              disabled={isSaving}
              onPress={handleChooseImage}
              className="min-h-11 flex-row items-center justify-between rounded-2xl px-4"
              style={{ backgroundColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.16 : 0.1), opacity: isSaving ? 0.6 : 1 }}
            >
              <View className="flex-row items-center gap-2">
                <AppSymbol name={pendingUploadImage ? "checkmark.circle.fill" : "photo"} size={17} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>+</Text>} />
                <Text className="text-sm font-bold" style={{ color: appTheme.colors.primary }}>
                  {isUploadingImage ? t("wallet.uploadingPhoto") : pendingUploadImage ? t("wallet.photoSelected") : t("wallet.uploadPhoto")}
                </Text>
              </View>
              {isUploadingImage ? <ActivityIndicator color={appTheme.colors.primary} size="small" /> : null}
            </Pressable>
          ) : null}
        </View>

        <View className="gap-3">
          <Text className="px-1 text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
            {t("wallet.walletImageLabel")}
          </Text>
          <IconSelector
            options={WALLET_ICON_OPTIONS}
            value={walletImageToIcon(image)}
            onChange={(nextIcon) => {
              setImage(`symbol:${nextIcon}`);
              setPreviewImageUri(null);
              setPendingUploadImage(null);
            }}
          />
        </View>

        {management ? (
          <View className="gap-3 rounded-[28px] border p-4" style={{ borderColor, backgroundColor: surface }}>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
                {t("wallet.members")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("wallet.inviteLabel")}
                onPress={handleShareInvite}
                disabled={isSharingInvite}
                className="flex-row items-center gap-2 rounded-full px-3 py-2"
                style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14), opacity: isSharingInvite ? 0.6 : 1 }}
              >
                <AppSymbol name="square.and.arrow.up" size={15} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>+</Text>} />
                <Text className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>
                  {isSharingInvite ? t("wallet.creating") : t("wallet.invite")}
                </Text>
              </Pressable>
            </View>
            {members.map((member) => {
              const memberImageSource = getProfileImageSource(member.image);
              return (
                <View key={member.id} className="flex-row items-center gap-3 rounded-2xl py-1.5">
                  <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                    {memberImageSource ? (
                      <Image
                        source={memberImageSource}
                        contentFit="cover"
                        onError={(error) => console.warn("[management] member image failed", member.id, error)}
                        style={{ height: "100%", width: "100%" }}
                      />
                    ) : (
                      <Text className="font-black" style={{ color: appTheme.colors.primary }}>
                        {member.name.slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-semibold" style={{ color: appTheme.colors.foreground }}>
                      {member.name}
                    </Text>
                    <Text numberOfLines={1} className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {member.email ?? t("wallet.noEmail")}
                    </Text>
                  </View>
                  <Text className="text-xs font-bold uppercase" style={{ color: appTheme.colors.primary }}>
                    {member.role}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {management ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("wallet.deleteWalletLabel")}
            disabled={isDeleting}
            onPress={handleDelete}
            className="min-h-12 items-center justify-center rounded-2xl border"
            style={{ borderColor: alpha(appTheme.colors.negative, 0.4), backgroundColor: alpha(appTheme.colors.negative, appTheme.isDark ? 0.16 : 0.08), opacity: isDeleting ? 0.6 : 1 }}
          >
            <Text className="text-sm font-bold" style={{ color: appTheme.colors.negative }}>
              {isDeleting ? t("wallet.deletingWallet") : t("wallet.deleteWallet")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}
