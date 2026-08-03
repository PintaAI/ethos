import { useRef, useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Share, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { AppSymbol } from "@/components/AppSymbol";
import { AppSegmentedControl } from "@/components/AppSegmentedControl";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { useAuth } from "@/components/AuthProvider";
import { useDrawer } from "@/components/DrawerContext";
import { GlassBox } from "@/components/GlassBox";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import type { CachedNote } from "@/data/notes/types";
import { createNoteInvitation } from "@/lib/api/notes";
import { authBaseURL } from "@/lib/auth-client";
import { NoteListRow, SelectionCheckbox } from "@/features/journal/list/NoteListRow";
import { useNoteSelection } from "@/features/journal/list/useNoteSelection";
import { alpha } from "@/lib/color";

export default function JournalScreen() {
  const { open } = useDrawer();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { isAuthenticated, isPending } = useAuth();
  const { notes, loading, refreshing, error, refresh, createNote, deleteNote, togglePin } = useNotesData();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState(0);
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  const sharedNotes = notes.filter((note) => note.role !== "owner");
  const visibleNotes = selectedSegment === 1 ? sharedNotes : notes;
  const collaborativeCount = notes.filter((note) => note.memberCount > 1).length;
  const { allVisibleSelected, clearSelection, isSelecting, selectedIds, selectedNotes, toggleNoteSelection, toggleVisibleNotes } = useNoteSelection(visibleNotes);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const note = await createNote("");
      if (note) router.push({ pathname: "/journal/detail", params: { id: note.id } } as unknown as Href);
    } catch (createError) {
      Alert.alert(t("notes.createFailed"), createError instanceof Error ? createError.message : t("notes.tryAgain"));
    } finally {
      setCreating(false);
    }
  };

  const shareNote = async (note: CachedNote) => {
    if (note.role !== "owner") {
      router.push({ pathname: "/forms/journal-settings", params: { id: note.id } } as unknown as Href);
      return;
    }
    try {
      const { code } = await createNoteInvitation(note.id);
      const inviteLink = `${authBaseURL}/notes?code=${encodeURIComponent(code)}`;
      await Share.share({
        title: t("notes.joinTitle", { name: note.title }),
        url: inviteLink,
        message: t("notes.joinMessage", { name: note.title, link: inviteLink }),
      });
    } catch (shareError) {
      Alert.alert(t("notes.inviteFailed"), shareError instanceof Error ? shareError.message : t("notes.tryAgain"));
    }
  };

  const toggleNotePin = (note: CachedNote) => {
    void togglePin(note.id).catch((pinError) => {
      Alert.alert(t("notes.saveFailed"), pinError instanceof Error ? pinError.message : t("notes.tryAgain"));
    });
  };

  const deleteSelectedNotes = async () => {
    if (deleting || selectedIds.length === 0) return;
    setDeleting(true);
    try {
      for (const id of selectedIds) await deleteNote(id);
      clearSelection();
    } catch (deleteError) {
      Alert.alert(t("notes.deleteFailed"), deleteError instanceof Error ? deleteError.message : t("notes.tryAgain"));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = (note: CachedNote) => {
    Alert.alert(t("notes.deleteTitle"), t("notes.deleteMessage", { name: note.title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void deleteNote(note.id).catch((deleteError) => {
            Alert.alert(t("notes.deleteFailed"), deleteError instanceof Error ? deleteError.message : t("notes.tryAgain"));
          });
        },
      },
    ]);
  };

  const confirmBulkDelete = () => {
    Alert.alert(t("notes.deleteSelectedTitle"), t("notes.deleteSelectedMessage", { count: selectedIds.length }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => void deleteSelectedNotes() },
    ]);
  };

  const handleSwipeOpen = (swipeable: SwipeableMethods) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== swipeable) {
      openSwipeableRef.current.close();
    }
    openSwipeableRef.current = swipeable;
  };

  const handleSwipeClose = (swipeable: SwipeableMethods) => {
    if (openSwipeableRef.current === swipeable) openSwipeableRef.current = null;
  };

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel="Open menu" onPress={open} />
      </Stack.Toolbar>
      {!isPending && isAuthenticated ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View hidesSharedBackground>
            {Platform.OS === "ios" ? (
              <GlassBox
                isInteractive
                tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 1 : 0.72)}
                glassEffectStyle="clear"
                style={{ borderRadius: 9999 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("notes.create")}
                  className="flex-row items-center gap-1.5 px-5 py-3"
                  onPress={() => void handleCreate()}
                  disabled={creating}
                  style={{ opacity: creating ? 0.55 : 1 }}
                >
                  <AppSymbol name="plus" size={16} tintColor={appTheme.colors.background} fallback={<Text style={{ color: appTheme.colors.background }}>+</Text>} />
                  <Text className="text-base font-bold" style={{ color: appTheme.colors.background }}>
                    {t("notes.create")}
                  </Text>
                </Pressable>
              </GlassBox>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("notes.create")}
                className="h-10 flex-row items-center justify-center gap-1.5 rounded-full px-4"
                onPress={() => void handleCreate()}
                disabled={creating}
                style={{ backgroundColor: appTheme.colors.primary, opacity: creating ? 0.55 : 1 }}
              >
                <AppSymbol name="plus" size={16} tintColor={appTheme.colors.inverseForeground} fallback={<Text>+</Text>} />
                <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                  {t("notes.create")}
                </Text>
              </Pressable>
            )}
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : null}

      {!isPending && !isAuthenticated ? (
        <View className="flex-1 items-center justify-center gap-4 px-8" style={{ backgroundColor: appTheme.colors.background }}>
          <AppSymbol name="note.text" size={38} tintColor={appTheme.colors.primary} fallback={<Text>N</Text>} />
          <Text className="text-center text-2xl font-black" style={{ color: appTheme.colors.foreground }}>{t("notes.signInTitle")}</Text>
          <Text className="text-center text-sm leading-5" style={{ color: appTheme.colors.muted }}>{t("notes.signInMessage")}</Text>
          <Pressable onPress={() => router.push("/auth")} className="rounded-full px-5 py-3" style={{ backgroundColor: appTheme.colors.primary }}>
            <Text className="font-bold" style={{ color: appTheme.colors.background }}>{t("notes.signIn")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-[--app-color-background]"
          contentContainerClassName="gap-5 px-5 pb-12 pt-4"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={appTheme.colors.primary} />}
        >
          <View className="flex-row items-end justify-between py-2">
            <View className="flex-row items-end gap-1.5">
              <Text className="text-4xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>{t("tabs.notes")}</Text>
              <Text className="pb-1 text-xs" style={{ color: appTheme.colors.muted }}>({visibleNotes.length})</Text>
            </View>
            <Text className="pb-1 text-xs" style={{ color: appTheme.colors.muted }}>
              {notes.length - collaborativeCount} {t("notes.private")} · {collaborativeCount} {t("notes.shared")}
            </Text>
          </View>

          <AppSegmentedControl
            values={[t("notes.filterAll"), t("notes.filterShared")]}
            selectedIndex={selectedSegment}
            onIndexChange={(index) => {
              clearSelection();
              setSelectedSegment(index);
            }}
            style={{ width: "100%", display: isSelecting ? "none" : "flex" }}
          />

          {isSelecting ? (
            <View
              className="flex-row items-center gap-3 rounded-full py-2 pl-3 pr-1"
              style={{ backgroundColor: appTheme.colors.background }}
            >
              <SelectionCheckbox checked={allVisibleSelected} onPress={toggleVisibleNotes} label={t("notes.selectAll")} />
              <Text className="min-w-0 flex-1 text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
                {t("notes.selected", { count: selectedIds.length })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.delete")}
                disabled={deleting}
                className="h-9 flex-row items-center gap-1.5 rounded-full px-3"
                style={{ backgroundColor: appTheme.colors.negative, opacity: deleting ? 0.55 : 1 }}
                onPress={confirmBulkDelete}
              >
                <AppSymbol name="trash.fill" size={12} tintColor={appTheme.colors.inverseForeground} fallback={null} />
                <Text className="text-xs font-bold" style={{ color: appTheme.colors.inverseForeground }}>{t("common.delete")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.cancel")}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }}
                onPress={clearSelection}
              >
                <AppSymbol name="xmark" size={12} tintColor={appTheme.colors.foreground} fallback={null} />
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: appTheme.colors.overlay }}>
              <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{t("notes.offlineCache")}</Text>
            </View>
          ) : null}

          <View className="gap-2">
            <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>
              {selectedSegment === 1 ? t("notes.sharedListTitle") : t("notes.listTitle")}
            </Text>
            {!loading && visibleNotes.length === 0 ? (
              <Text className="py-12 text-center text-sm" style={{ color: appTheme.colors.muted }}>
                {selectedSegment === 1 ? t("notes.emptyShared") : t("notes.empty")}
              </Text>
            ) : null}
            {visibleNotes.map((note) => (
              <NoteListRow
                key={note.id}
                note={note}
                selected={!!selectedNotes[note.id]}
                isSelecting={isSelecting}
                onShare={(item) => void shareNote(item)}
                onTogglePin={toggleNotePin}
                onToggleSelection={toggleNoteSelection}
                onDelete={confirmDelete}
                onSwipeOpen={handleSwipeOpen}
                onSwipeClose={handleSwipeClose}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </>
  );
}
