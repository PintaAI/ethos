import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { getLocales } from "expo-localization";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useIncomingShare, type ResolvedSharePayload } from "expo-sharing";

import { AppText } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { useAuth } from "@/components/AuthProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { alpha } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { extractInboundShare } from "@/lib/api/inboundShare";
import { useTranslation } from "react-i18next";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const MAX_TEXT_PREVIEW = 240;

const SCAN_STEPS = [
  "inboundShare.steps.reading",
  "inboundShare.steps.detecting",
  "inboundShare.steps.amount",
  "inboundShare.steps.category",
  "inboundShare.steps.finalizing",
] as const;

function inferImageType(payload: ResolvedSharePayload): string {
  if (payload.contentMimeType?.startsWith("image/")) return payload.contentMimeType;
  if (payload.mimeType?.startsWith("image/")) return payload.mimeType;

  const fileName = (payload.originalName ?? payload.contentUri ?? "").toLowerCase();
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".heic")) return "image/heic";
  if (fileName.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

function readSharedContent(payloads: ResolvedSharePayload[]) {
  const image = payloads.find(
    (payload) => payload.contentType === "image" && payload.contentUri,
  );
  const text = payloads
    .filter((payload) => payload.shareType === "text" || payload.shareType === "url")
    .map((payload) => payload.value.trim())
    .filter(Boolean)
    .join("\n\n");

  return {
    image: image?.contentUri
      ? { uri: image.contentUri, type: inferImageType(image), size: image.contentSize }
      : null,
    text: text || null,
  };
}

export default function InboundShareScreen() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const auth = useAuth();
  const currency = useCurrency();
  const { activeManagement, isReady } = useCashflowData();
  const {
    sharedPayloads,
    resolvedSharedPayloads,
    isResolving,
    error: shareError,
    clearSharedPayloads,
    refreshSharePayloads,
  } = useIncomingShare();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const processingKeyRef = useRef<string | null>(null);
  const [scanLine] = useState(() => new Animated.Value(0));
  const progressRef = useRef(0);

  const shared = readSharedContent(resolvedSharedPayloads);
  const previewImage = shared.image?.uri ?? null;
  const previewText = shared.text
    ? shared.text.length > MAX_TEXT_PREVIEW
      ? `${shared.text.slice(0, MAX_TEXT_PREVIEW)}…`
      : shared.text
    : null;

  const signedOut = !auth.isPending && !auth.isAuthenticated;
  const visibleError = shareError?.message ?? error;
  const scanning = !!previewImage && !signedOut && !visibleError && !completed;

  // Ornamental scanning sweep over the image, looped only while scanning.
  useEffect(() => {
    if (!scanning) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(scanLine, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [scanning, scanLine]);

  // Ornamental progress + step cycler. Runs while extraction is in flight.
  useEffect(() => {
    if (error || completed) return;
    progressRef.current = 0;
    queueMicrotask(() => {
      setProgress(0);
      setStepIndex(0);
    });
    const interval = setInterval(() => {
      progressRef.current = Math.min(progressRef.current + Math.random() * 4 + 1.5, 92);
      setProgress(progressRef.current);
      setStepIndex(Math.min(
        Math.floor((progressRef.current / 92) * SCAN_STEPS.length),
        SCAN_STEPS.length - 1,
      ));
    }, 220);
    return () => clearInterval(interval);
  }, [error, completed]);

  useEffect(() => {
    if (
      auth.isPending ||
      !auth.isAuthenticated ||
      !isReady ||
      isResolving ||
      shareError ||
      (sharedPayloads.length > 0 && resolvedSharedPayloads.length === 0)
    ) return;

    const currentShared = readSharedContent(resolvedSharedPayloads);
    const processingKey = JSON.stringify({
      image: currentShared.image?.uri,
      text: currentShared.text,
      attempt,
    });
    if (processingKeyRef.current === processingKey) return;
    processingKeyRef.current = processingKey;

    if (!currentShared.image && !currentShared.text) {
      queueMicrotask(() => setError(t("inboundShare.unsupported")));
      return;
    }
    if (currentShared.image?.size && currentShared.image.size > MAX_IMAGE_SIZE) {
      queueMicrotask(() => setError(t("inboundShare.imageTooLarge")));
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setError(null);
    });

    extractInboundShare({
      image: currentShared.image ? { uri: currentShared.image.uri, type: currentShared.image.type } : undefined,
      text: currentShared.text ?? undefined,
      managementId: activeManagement?.remoteId ?? undefined,
      locale: getLocales()[0]?.languageTag ?? "en",
      currency: currency.currency,
      currentDate: toDateKey(new Date()),
    })
      .then((result) => {
        if (cancelled) return;

        const sourceCurrency = result.draft.currency ?? currency.currency;
        const sourceRate = currency.rates[sourceCurrency];
        const displayAmount = result.draft.amount === null
          ? null
          : sourceCurrency === currency.currency
            ? result.draft.amount
            : sourceRate
              ? (result.draft.amount / sourceRate) * currency.rate
              : null;

        const entryRoute = {
          pathname: "/forms/entry-form",
          params: {
            sharedDraft: String(Date.now()),
            ...(result.draft.name ? { draftName: result.draft.name } : {}),
            ...(displayAmount !== null ? { draftAmount: String(Math.round(displayAmount)) } : {}),
            ...(result.draft.date ? { date: result.draft.date } : {}),
            ...(result.draft.category ? { draftCategory: result.draft.category } : {}),
            ...(result.draft.io ? { draftIo: result.draft.io } : {}),
          },
        } as const;

        // Finish the ornamental progress bar before navigating.
        queueMicrotask(() => {
          if (!cancelled) {
            setProgress(100);
            setCompleted(true);
          }
        });

        setTimeout(() => {
          if (cancelled) return;
          clearSharedPayloads();
          // Always land on cashflow home so the form sheet has a screen behind it.
          router.replace("/home");
          requestAnimationFrame(() => router.push(entryRoute));
        }, 480);
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : t("inboundShare.failed"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeManagement?.remoteId,
    attempt,
    auth.isAuthenticated,
    auth.isPending,
    clearSharedPayloads,
    currency.currency,
    currency.rate,
    currency.rates,
    isReady,
    isResolving,
    resolvedSharedPayloads,
    sharedPayloads.length,
    shareError,
    t,
  ]);

  const close = () => {
    clearSharedPayloads();
    router.replace("/");
  };
  const retry = () => {
    processingKeyRef.current = null;
    progressRef.current = 0;
    setError(null);
    setCompleted(false);
    setProgress(0);
    setStepIndex(0);
    setAttempt((value) => value + 1);
    refreshSharePayloads();
  };

  return (
    <View className="flex-1 bg-[--app-color-background]">
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />

      <View className="flex-1 items-center justify-center gap-6 px-6">
        {/* Preview */}
        {previewImage ? (
          <View
            className="relative overflow-hidden rounded-3xl border"
            style={{
              width: 220,
              height: 220,
              borderColor: appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
              backgroundColor: alpha(appTheme.colors.primary, 0.06),
            }}
          >
            <Image
              source={{ uri: previewImage }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={120}
            />
            {scanning ? (
              <Animated.View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 3,
                  transform: [{
                    translateY: scanLine.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 217],
                    }),
                  }],
                  shadowColor: appTheme.colors.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 10,
                  backgroundColor: appTheme.colors.primary,
                }}
              />
            ) : null}
            {completed ? (
              <View
                className="absolute inset-0 items-center justify-center"
                style={{ backgroundColor: `rgba(0,0,0,${completed ? 0.34 : 0})` }}
              >
                <AppText className="text-3xl">✓</AppText>
              </View>
            ) : null}
          </View>
        ) : previewText ? (
          <View
            className="rounded-3xl border px-5 py-4"
            style={{
              maxWidth: 360,
              borderColor: appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
              backgroundColor: alpha(appTheme.colors.primary, 0.05),
            }}
          >
            <AppText
              className="text-center text-base leading-6"
              style={{ color: appTheme.colors.foreground }}
            >
              {previewText}
            </AppText>
          </View>
        ) : null}

        {/* Title + status */}
        <View className="max-w-sm items-center gap-2">
          <AppText className="text-center text-2xl font-bold" style={{ color: appTheme.colors.foreground }}>
            {signedOut
              ? t("inboundShare.signInTitle")
              : visibleError
                ? t("inboundShare.failedTitle")
                : completed
                  ? t("inboundShare.doneTitle")
                  : t("inboundShare.title")}
          </AppText>
          <AppText className="text-center text-sm leading-5" style={{ color: appTheme.colors.muted }}>
            {signedOut
              ? t("inboundShare.signInDescription")
              : visibleError
                ? visibleError
                : completed
                  ? t("inboundShare.done")
                  : t(SCAN_STEPS[stepIndex] ?? "inboundShare.analyzing")}
          </AppText>
        </View>

        {/* Progress bar */}
        {scanning ? (
          <View
            className="h-1.5 w-full max-w-xs overflow-hidden rounded-full"
            style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12) }}
          >
            <Animated.View
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: 999,
                backgroundColor: appTheme.colors.primary,
              }}
            />
          </View>
        ) : null}

        {/* Actions */}
        <View className="w-full max-w-sm gap-3">
          {signedOut ? (
            <Pressable
              className="min-h-12 items-center justify-center rounded-2xl px-4"
              style={{ backgroundColor: appTheme.colors.primary }}
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "inbound-share" } })}
            >
              <AppText className="font-semibold" style={{ color: appTheme.colors.background }}>
                {t("common.signIn")}
              </AppText>
            </Pressable>
          ) : null}
          {visibleError ? (
            <Pressable
              className="min-h-12 items-center justify-center rounded-2xl border px-4"
              style={{
                backgroundColor: alpha(appTheme.colors.primary, 0.1),
                borderColor: alpha(appTheme.colors.primary, 0.3),
              }}
              onPress={retry}
            >
              <AppText className="font-semibold" style={{ color: appTheme.colors.primary }}>
                {t("inboundShare.retry")}
              </AppText>
            </Pressable>
          ) : null}
          {(signedOut || visibleError) ? (
            <Pressable className="min-h-11 items-center justify-center" onPress={close}>
              <AppText className="font-medium" style={{ color: appTheme.colors.muted }}>
                {t("common.cancel")}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}