import { useRef } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { NoteIcon } from "@/components/notes/NoteIcon";
import type { CachedNote } from "@/data/notes/types";
import { alpha, mix } from "@/lib/color";

export function SelectionCheckbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const appTheme = useAppTheme();
  const borderColor = checked ? appTheme.colors.primary : alpha(appTheme.colors.foreground, 0.18);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      className="h-5 w-5 items-center justify-center rounded-[5px]"
      style={{ backgroundColor: checked ? appTheme.colors.primary : "transparent", borderColor, borderWidth: 1 }}
      onPress={onPress}
    >
      {checked ? <AppSymbol name="checkmark" size={11} tintColor={appTheme.colors.inverseForeground} fallback={null} /> : null}
    </Pressable>
  );
}

export function NoteListRow({
  note,
  selected,
  isSelecting,
  onShare,
  onTogglePin,
  onToggleSelection,
  onDelete,
  onSwipeOpen,
  onSwipeClose,
}: {
  note: CachedNote;
  selected: boolean;
  isSelecting: boolean;
  onShare: (note: CachedNote) => void;
  onTogglePin: (note: CachedNote) => void;
  onToggleSelection: (note: CachedNote) => void;
  onDelete: (note: CachedNote) => void;
  onSwipeOpen: (swipeable: SwipeableMethods) => void;
  onSwipeClose: (swipeable: SwipeableMethods) => void;
}) {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const actionForeground = appTheme.colors.inverseForeground;
  const rowBackground = selected
    ? mix(appTheme.colors.background, appTheme.colors.primary, appTheme.isDark ? 0.24 : 0.12)
    : mix(appTheme.colors.background, appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035);

  const renderRightActions = () => (
    <View className="h-full flex-row overflow-hidden rounded-2xl">
      <Pressable accessibilityRole="button" accessibilityLabel={t("notes.share")} className="w-20 items-center justify-center gap-1" style={{ backgroundColor: appTheme.colors.primary }} onPress={() => { swipeableRef.current?.close(); onShare(note); }}>
        <AppSymbol name="square.and.arrow.up" size={16} tintColor={actionForeground} fallback={null} />
        <Text className="text-xs font-bold" style={{ color: actionForeground }}>{t("notes.share")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={note.pinned ? t("notes.unpin") : t("notes.pin")}
        className="w-20 items-center justify-center gap-1"
        style={{ backgroundColor: appTheme.colors.primary, borderLeftWidth: 1, borderLeftColor: alpha(actionForeground, 0.24) }}
        onPress={() => { swipeableRef.current?.close(); onTogglePin(note); }}
      >
        <AppSymbol name={note.pinned ? "pin.slash.fill" : "pin.fill"} size={16} tintColor={actionForeground} fallback={null} style={{ transform: [{ rotate: "28deg" }] }} />
        <Text className="text-xs font-bold" style={{ color: actionForeground }}>{note.pinned ? t("notes.unpin") : t("notes.pin")}</Text>
      </Pressable>
      {note.role === "owner" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.delete")}
          className="w-20 items-center justify-center gap-1"
          style={{ backgroundColor: appTheme.colors.negative, borderLeftWidth: 1, borderLeftColor: alpha(actionForeground, 0.24) }}
          onPress={() => { swipeableRef.current?.close(); onDelete(note); }}
        >
          <AppSymbol name="trash.fill" size={16} tintColor={actionForeground} fallback={null} />
          <Text className="text-xs font-bold" style={{ color: actionForeground }}>{t("common.delete")}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      enabled={!isSelecting}
      friction={2}
      rightThreshold={80}
      overshootRight={false}
      containerStyle={{ overflow: "visible", borderRadius: 16, backgroundColor: rowBackground }}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => { if (swipeableRef.current) onSwipeOpen(swipeableRef.current); }}
      onSwipeableClose={() => { if (swipeableRef.current) onSwipeClose(swipeableRef.current); }}
    >
      <Pressable
        onLongPress={() => {
          if (note.role !== "owner") return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          onToggleSelection(note);
        }}
        onPress={() => {
          if (isSelecting) {
            if (note.role === "owner") onToggleSelection(note);
            return;
          }
          router.push({ pathname: "/journal/detail", params: { id: note.id } } as unknown as Href);
        }}
        className="flex-row items-center gap-3 rounded-2xl px-3 py-3"
        style={{ backgroundColor: rowBackground, borderColor: selected ? alpha(appTheme.colors.primary, 0.5) : "transparent", borderWidth: 1 }}
      >
        {isSelecting && note.role === "owner" ? <SelectionCheckbox checked={selected} onPress={() => onToggleSelection(note)} label={t("notes.selectNote")} /> : null}
        <NoteIcon icon={note.icon} iconType={note.iconType} iconColor={note.iconColor} />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-bold" style={{ color: appTheme.colors.foreground }}>{note.title}</Text>
            {note.pinned ? <AppSymbol name="pin.fill" size={16} tintColor={appTheme.colors.primary} fallback={null} style={{ width: 18, height: 18, transform: [{ rotate: "28deg" }] }} /> : null}
          </View>
          <Text numberOfLines={2} className="text-xs leading-4" style={{ color: appTheme.colors.muted }}>
            {note.draft ? t("notes.unsyncedDraft") : note.contentMarkdown?.trim() || t("notes.startWriting")}
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}
