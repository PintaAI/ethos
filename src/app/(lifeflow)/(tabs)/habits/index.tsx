import { RefreshControl, ScrollView } from "react-native";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useDrawer } from "@/components/provider/DrawerContext";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { HabitList, HabitProgressSummary } from "@/features/lifeflow/HabitList";
import { toDateKey } from "@/lib/date";
import { useLifeFlowRefresh } from "@/lib/sync/useLifeFlowRefresh";

export default function HabitsScreen() { const { t } = useTranslation(); const { open } = useDrawer(); const theme = useAppTheme(); const flow = useLifeFlow(); const { refreshing, onRefresh } = useLifeFlowRefresh(); const date = toDateKey(new Date()); const items = flow.items.filter((item) => item.kind === "habit"); const occurrences = flow.getOccurrencesForDate(date).filter((item) => item.kind === "habit" && items.some((habit) => habit.id === item.itemId)); return <><Stack.Screen options={{ title: t("atomicHabits.title") }} /><Stack.Toolbar placement="left"><Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} /></Stack.Toolbar><Stack.Toolbar placement="right"><Stack.Toolbar.Button icon={toolbarIcons.add} accessibilityLabel={t("atomicHabits.addHabit")} onPress={() => router.push("/forms/habit-add")} /></Stack.Toolbar><ScrollView className="flex-1 bg-[--app-color-background]" contentContainerClassName="gap-6 px-5 pb-14 pt-4" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.primary} />}><HabitProgressSummary habits={occurrences} /><HabitList items={items} occurrences={occurrences} logs={flow.habitLogs} date={date} onDelete={flow.deleteItem} onComplete={(id, completed) => flow.setHabitCompleted(id, date, completed)} /></ScrollView></>; }
