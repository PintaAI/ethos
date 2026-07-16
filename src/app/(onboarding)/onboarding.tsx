import { useRef, useState } from "react";
import { type FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host, RNHostView } from "@expo/ui";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { setPreference } from "@/lib/preferences";
import { alpha } from "@/lib/color";
import { ActivityHeatmap } from "@/components/cashflow/ActivityHeatmap";
import { AnalyticsCharts } from "@/components/cashflow/AnalyticsCharts";
import { CashflowStatsCard } from "@/components/cashflow/CashflowStatsCard";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { ProfileContentBody } from "@/components/profile/ProfileContentBody";
import {
  sampleActivity,
  sampleAnalytics,
  sampleDayEntries,
  sampleManagement,
  sampleSelectedDate,
  sampleStats,
} from "@/data/cashflow/sampleData";

type PreviewTabKey = "home" | "cashflow" | "summary" | "profile";

type OnboardingSlide = {
  body: PreviewTabKey;
  eyebrow: string;
  title: string;
  description: string;
};

function ProgressLine({
  scrollX,
  index,
  itemWidth,
  activeColor,
  inactiveColor,
}: {
  scrollX: SharedValue<number>;
  index: number;
  itemWidth: number;
  activeColor: string;
  inactiveColor: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const rel = scrollX.value / itemWidth - index;
    const active = interpolate(rel, [-1, 0, 1], [0, 1, 0], "clamp");
    return {
      width: 8 + active * 20,
      backgroundColor: interpolateColor(active, [0, 1], [inactiveColor, activeColor]),
    };
  });

  return <Animated.View className="h-1.5 rounded-full" style={animatedStyle} />;
}

function HomePreviewBody() {
  return (
    <View className="bg-[--app-color-background] flex-1">
      <CashflowTable
        entries={sampleDayEntries}
        hideTanggal
        ListHeaderComponent={
          <View>
            <CashflowStatsCard stats={sampleStats} managementName={sampleManagement.name} />
            <ActivityHeatmap
              activity={sampleActivity}
              selectedDate={sampleSelectedDate}
              onDateSelect={() => {}}
            />
            <View className="mt-5" />
          </View>
        }
      />
    </View>
  );
}

function SummaryPreviewBody() {
  return (
    <AnalyticsCharts
      data={sampleAnalytics}
      monthlyTrendData={sampleAnalytics.byMonth}
      hideStats
      header={
        <CashflowStatsCard
          stats={sampleStats}
          hideMoreButton
          managementName={sampleManagement.name}
        />
      }
    />
  );
}

function ProfilePreviewBody() {
  return (
    <ProfileContentBody
      isAuthenticated
      displayName="namakamu"
      email="yourname@example.com"
      initials="YO"
      avatarSource={null}
      syncStatus="idle"
      syncActionLabel="Sync now"
      syncDetail="Just now"
      updateStatus="Up to date"
      isCheckingForUpdate={false}
      isUpdatingPhoto={false}
      notificationsEnabled
      onSignOut={() => {}}
      onSyncNow={() => {}}
      onCheckForUpdates={() => {}}
      onUpdatePhoto={() => {}}
      onOpenPrivacyPolicy={() => {}}
      onContactSupport={() => {}}
      onOpenAccount={() => {}}
      onOpenFontSettings={() => {}}
      onOpenNotificationSettings={() => {}}
      onOpenAuth={() => {}}
      onOpenOnboarding={() => {}}
    />
  );
}

function SlidePreview({ body }: { body: PreviewTabKey }) {
  return (
    <View style={{ flex: 1 }} pointerEvents="none">
      {body === "home" ? (
        <HomePreviewBody />
      ) : body === "summary" ? (
        <SummaryPreviewBody />
      ) : body === "profile" ? (
        <ProfilePreviewBody />
      ) : null}
    </View>
  );
}

export default function OnboardingScreen() {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const pagerRef = useRef<FlatList<OnboardingSlide>>(null);
  const [page, setPage] = useState(0);
  const [showAccountOptions, setShowAccountOptions] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const scrollX = useSharedValue(0);

  const slides: OnboardingSlide[] = [
    {
      body: "home",
      eyebrow: t("onboarding.slides.track.eyebrow"),
      title: t("onboarding.slides.track.title"),
      description: t("onboarding.slides.track.description"),
    },
    {
      body: "summary",
      eyebrow: t("onboarding.slides.plan.eyebrow"),
      title: t("onboarding.slides.plan.title"),
      description: t("onboarding.slides.plan.description"),
    },
    {
      body: "profile",
      eyebrow: t("onboarding.slides.share.eyebrow"),
      title: t("onboarding.slides.share.title"),
      description: t("onboarding.slides.share.description"),
    },
  ];
  const slideCount = slides.length;
  const isLastPage = page === slideCount - 1;

  const advance = () => {
    const nextPage = Math.min(page + 1, slideCount - 1);
    pagerRef.current?.scrollToIndex({ index: nextPage, animated: true });
  };

  const handlePageSettle = (nextPage: number) => {
    setPage(nextPage);
  };

  const completeOnboarding = async (destination: "/auth" | "/home") => {
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      await setPreference("hasSkippedOnboarding", true);
      setShowAccountOptions(false);

      if (destination === "/auth") {
        router.push(destination);
      } else {
        router.replace(destination);
      }
    } catch (error) {
      console.warn("Failed to save onboarding preference", error);
      setIsCompleting(false);
    }
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      runOnJS(handlePageSettle)(Math.round(event.contentOffset.x / event.layoutMeasurement.width));
    },
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-[--app-color-background] pb-8 pt-16">
        <View className="flex-row items-center px-6">
          <Text className="text-xs font-bold tracking-[3px]" style={{ color: appTheme.colors.primary }}>
            ETHOS
          </Text>
          <View className="flex-1 flex-row items-center justify-center gap-2" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: slides.length, now: page + 1 }}>
            {slides.map((slide, index) => (
              <ProgressLine
                key={slide.eyebrow}
                scrollX={scrollX}
                index={index}
                itemWidth={width}
                activeColor={appTheme.colors.primary}
                inactiveColor={alpha(appTheme.colors.primary, 0.18)}
              />
            ))}
          </View>
          <Text className="text-xs font-semibold" style={{ color: appTheme.colors.muted }}>
            {t("onboarding.progress", { current: page + 1, total: slides.length })}
          </Text>
        </View>

        <Animated.FlatList
          ref={pagerRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          className="flex-1"
          keyExtractor={(slide) => slide.eyebrow}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item: slide }) => (
            <View className="flex-1 px-6 pb-6 pt-10" style={{ width }}>
              <View className="gap-3">
                <Text className="text-xs font-bold tracking-[2px]" style={{ color: appTheme.colors.primary }}>
                  {slide.eyebrow}
                </Text>
                <Text className="max-w-md text-4xl font-black leading-tight tracking-tight" style={{ color: appTheme.colors.foreground }}>
                  {slide.title}
                </Text>
                <Text className="max-w-md text-base leading-6" style={{ color: appTheme.colors.muted }}>
                  {slide.description}
                </Text>
              </View>

              <View
                className="flex-1 overflow-hidden rounded-[32px] border"
                style={{ borderColor: alpha(appTheme.colors.primary, 0.18), transform: [{ scale: 0.85 }] }}
              >
                <SlidePreview body={slide.body} />
              </View>
            </View>
          )}
        />

        {!isLastPage ? (
          <View className="px-6">
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-full px-6 py-4"
              style={{ backgroundColor: appTheme.colors.primary }}
              onPress={advance}
            >
              <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                {t("onboarding.next")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="px-6">
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-full px-6 py-4"
              style={{ backgroundColor: appTheme.colors.primary }}
              onPress={() => setShowAccountOptions(true)}
            >
              <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                {t("onboarding.getStarted")}
              </Text>
            </Pressable>
          </View>
        )}

        <Host matchContents colorScheme={appTheme.colorScheme}>
          <BottomSheet isPresented={showAccountOptions} onDismiss={() => setShowAccountOptions(false)}>
            <RNHostView matchContents>
              <View className="gap-3 px-6 pb-8 pt-5" style={{ width: Math.min(width, 560) }}>
              <Text className="text-2xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
                {t("onboarding.accountTitle")}
              </Text>
              <Text className="mb-3 text-sm leading-5" style={{ color: appTheme.colors.muted }}>
                {t("onboarding.accountPrompt")}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={isCompleting}
                className="items-center rounded-full px-6 py-4"
                style={{ backgroundColor: appTheme.colors.primary }}
                onPress={() => completeOnboarding("/auth")}
              >
                <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                  {t("onboarding.signIn")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isCompleting}
                className="items-center rounded-full px-6 py-4"
                style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12) }}
                onPress={() => completeOnboarding("/home")}
              >
                <Text className="font-bold" style={{ color: appTheme.colors.primary }}>
                  {t("onboarding.continueWithoutAccount")}
                </Text>
              </Pressable>
              </View>
            </RNHostView>
          </BottomSheet>
        </Host>
      </View>
    </>
  );
}
