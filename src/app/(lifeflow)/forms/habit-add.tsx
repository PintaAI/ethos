import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ItemForm } from "@/components/lifeflow/ItemForm";
export default function HabitAddForm() { const { t } = useTranslation(); return <><Stack.Screen options={{ title: t("atomicHabits.addHabit") }} /><ItemForm kind="habit" /></>; }
