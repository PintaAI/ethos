import { useRef, useState } from "react";
import { type FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host, RNHostView } from "@expo/ui";
import { router, Stack, type Href } from "expo-router";
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
import { useAuth } from "@/components/AuthProvider";
import { alpha } from "@/lib/color";
import { ActivityHeatmap } from "@/components/cashflow/ActivityHeatmap";
import { CashflowStatsCard } from "@/components/cashflow/CashflowStatsCard";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { AppSymbol } from "@/components/AppSymbol";
import { PersonalGrowthHomeContent } from "@/components/selfImprovement/PersonalGrowthHomeContent";
import {
  sampleActivity,
  sampleDayEntries,
  sampleManagement,
  sampleSelectedDate,
  sampleStats,
} from "@/data/cashflow/sampleData";
import {
  samplePersonalGrowthDate,
  samplePersonalGrowthHabitLogs,
  samplePersonalGrowthHabits,
  samplePersonalGrowthNotes,
  samplePersonalGrowthTimeBoxes,
} from "@/data/selfImprovement/sampleData";

type PreviewTabKey = "system" | "cashflow" | "growth";

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

function SystemPreviewBody() {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const spaces = [
    {
      label: t("onboarding.preview.cashflow"),
      detail: t("onboarding.preview.cashflowDetail"),
      icon: "banknote.fill" as const,
    },
    {
      label: t("onboarding.preview.personalGrowth"),
      detail: t("onboarding.preview.personalGrowthDetail"),
      icon: "sparkles" as const,
    },
  ];

  return (
    <View className="flex-1 justify-center bg-[--app-color-background] p-5">
      <Text className="mb-2 text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.primary }}>
        {t("onboarding.preview.systemLabel")}
      </Text>
      <Text className="mb-5 text-2xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
        {t("onboarding.preview.systemTitle")}
      </Text>

      <View className="overflow-hidden rounded-3xl border" style={{ borderColor: alpha(appTheme.colors.primary, 0.18) }}>
        {spaces.map((space, index) => (
          <View
            key={space.label}
            className="flex-row items-center gap-3 p-4"
            style={{
              backgroundColor: alpha(appTheme.colors.primary, index === 0 ? 0.08 : 0.04),
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: alpha(appTheme.colors.primary, 0.14),
            }}
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}
            >
              <AppSymbol name={space.icon} size={21} tintColor={appTheme.colors.primary} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                {space.label}
              </Text>
              <Text className="mt-1 text-sm leading-5" style={{ color: appTheme.colors.muted }}>
                {space.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-6 flex-row items-center justify-between">
        {["plan", "act", "reflect"].map((step) => (
          <View key={step} className="flex-1 items-center">
            <View className="rounded-full px-2 py-2" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.1) }}>
              <Text className="text-xs font-bold uppercase tracking-[1px]" style={{ color: appTheme.colors.primary }}>
                {t(`onboarding.preview.${step}`)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function CashflowPreviewBody() {
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

function GrowthPreviewBody() {
  return (
    <PersonalGrowthHomeContent
      notes={samplePersonalGrowthNotes}
      habits={samplePersonalGrowthHabits}
      habitLogs={samplePersonalGrowthHabitLogs}
      timeBoxes={samplePersonalGrowthTimeBoxes}
      referenceDate={samplePersonalGrowthDate}
      onOpenJournal={() => {}}
      onOpenHabits={() => {}}
      onOpenSchedule={() => {}}
      onOpenTimeBox={() => {}}
      onCompleteHabit={() => Promise.resolve()}
      onCompleteTimeBox={() => Promise.resolve()}
    />
  );
}

function SlidePreview({ body }: { body: PreviewTabKey }) {
  return (
    <View style={{ flex: 1 }} pointerEvents="none">
      {body === "system" ? <SystemPreviewBody /> : body === "cashflow" ? <CashflowPreviewBody /> : <GrowthPreviewBody />}
    </View>
  );
}

export default function OnboardingScreen() {
  const appTheme = useAppTheme();
  const auth = useAuth();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const pagerRef = useRef<FlatList<OnboardingSlide>>(null);
  const [page, setPage] = useState(0);
  const [showAccountOptions, setShowAccountOptions] = useState(false);
  const scrollX = useSharedValue(0);

  const slides: OnboardingSlide[] = [
    {
      body: "system",
      eyebrow: t("onboarding.slides.system.eyebrow"),
      title: t("onboarding.slides.system.title"),
      description: t("onboarding.slides.system.description"),
    },
    {
      body: "cashflow",
      eyebrow: t("onboarding.slides.cashflow.eyebrow"),
      title: t("onboarding.slides.cashflow.title"),
      description: t("onboarding.slides.cashflow.description"),
    },
    {
      body: "growth",
      eyebrow: t("onboarding.slides.growth.eyebrow"),
      title: t("onboarding.slides.growth.title"),
      description: t("onboarding.slides.growth.description"),
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

  const chooseMode = (mode: "cloud" | "offline") => {
    setShowAccountOptions(false);
    if (mode === "cloud" && !auth.isAuthenticated) {
      router.push({ pathname: "/auth", params: { returnTo: "onboarding-wallet" } });
      return;
    }
    router.push({ pathname: "/(onboarding)/wallet-setup", params: { mode } } as unknown as Href);
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
              <View className="gap-5 px-6 pb-8 pt-5" style={{ width: Math.min(width, 560) }}>
                <View className="gap-2">
                  <Text className="text-2xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
                    {t("onboarding.accountTitle")}
                  </Text>
                  <Text className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>
                    {t("onboarding.accountPrompt")}
                  </Text>
                </View>
                <View className="gap-2 px-1">
                  {(["backup", "devices", "restore", "neverLose", "share"] as const).map((benefit) => (
                    <View key={benefit} className="flex-row items-center gap-2.5">
                      <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12) }}>
                        <AppSymbol name="checkmark" size={11} tintColor={appTheme.colors.primary} />
                      </View>
                      <Text className="text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
                        {t(`onboarding.storage.benefits.${benefit}`)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("onboarding.storage.cloudAction")}
                  className="flex-row items-center justify-center gap-2 rounded-full px-6 py-4"
                  style={{ backgroundColor: appTheme.colors.primary }}
                  onPress={() => chooseMode("cloud")}
                >
                  <AppSymbol name="arrow.triangle.2.circlepath" size={18} tintColor={appTheme.colors.inverseForeground} />
                  <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                    {t("onboarding.storage.cloudAction")}
                  </Text>
                </Pressable>
                <View className="items-center gap-1">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("onboarding.storage.offlineAction")}
                    className="rounded-full px-5 py-2.5"
                    onPress={() => chooseMode("offline")}
                  >
                    <Text className="font-bold" style={{ color: appTheme.colors.primary }}>
                      {t("onboarding.storage.offlineAction")}
                    </Text>
                  </Pressable>
                  <Text className="text-center text-xs" style={{ color: appTheme.colors.muted }}>
                    {t("onboarding.storage.offlineDescription")}
                  </Text>
                </View>
              </View>
            </RNHostView>
          </BottomSheet>
        </Host>
      </View>
    </>
  );
}
