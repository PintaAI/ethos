import { useEffect, useState } from "react";
import { Alert, InteractionManager, Pressable, ScrollView, Share, View } from "react-native";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { NoteIcon, NOTE_ICON_OPTIONS } from "@/components/notes/NoteIcon";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import type { CachedNote, ServerNoteInvitation } from "@/data/notes/types";
import {
  createNoteInvitation,
  deleteNoteInvitation,
  listNoteInvitations,
} from "@/lib/api/notes";
import { authBaseURL } from "@/lib/auth-client";
import { alpha } from "@/lib/color";

export default function JournalSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { notes, loadNote, updateIcon, togglePin, deleteNote } = useNotesData();
  const [note, setNote] = useState<CachedNote | null>(() => notes.find((item) => item.id === id) ?? null);
  const [invitations, setInvitations] = useState<ServerNoteInvitation[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const loaded = await loadNote(id);
    setNote(loaded);
    if (loaded?.role === "owner") {
      try {
        setInvitations(await listNoteInvitations(id));
      } catch {
        setInvitations([]);
      }
    }
  };

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void load().catch((error) => {
        console.warn("[notes] failed to load journal settings", error);
      });
    });
    return () => task.cancel();
    // Reloading is keyed by the route id; mutations call load explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const shareCode = async (code: string) => {
    if (!note) return;
    const inviteLink = `${authBaseURL}/notes?code=${encodeURIComponent(code)}`;
    await Share.share({
      title: t("notes.joinTitle", { name: note.title }),
      url: inviteLink,
      message: t("notes.joinMessage", { name: note.title, link: inviteLink }),
    });
  };

  const createInvite = async () => {
    if (!note || busy) return;
    setBusy(true);
    try {
      const { code } = await createNoteInvitation(note.id);
      setInvitations(await listNoteInvitations(note.id));
      await shareCode(code);
    } catch (error) {
      Alert.alert(t("notes.inviteFailed"), error instanceof Error ? error.message : t("notes.tryAgain"));
    } finally {
      setBusy(false);
    }
  };

  const removeInvite = async (invitationId: string) => {
    if (!note) return;
    try {
      await deleteNoteInvitation(note.id, invitationId);
      setInvitations((current) => current.filter((item) => item.id !== invitationId));
    } catch (error) {
      Alert.alert(t("notes.inviteFailed"), error instanceof Error ? error.message : t("notes.tryAgain"));
    }
  };

  const confirmDelete = () => {
    if (!note) return;
    Alert.alert(t("notes.deleteTitle"), t("notes.deleteMessage", { name: note.title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void deleteNote(note.id)
            .then(() => router.replace("/journal" as Href))
            .catch((error) => {
              Alert.alert(t("notes.deleteFailed"), error instanceof Error ? error.message : t("notes.tryAgain"));
            });
        },
      },
    ]);
  };

  if (!note) return <View className="min-h-40" style={{ backgroundColor: appTheme.colors.background }} />;

  return (
    <>
      <Stack.Screen options={{ title: t("notes.settings") }} />
      <ScrollView
        className="bg-[--app-color-background]"
        contentContainerClassName="gap-6 px-5 pb-10 pt-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>{t("notes.appearance")}</Text>
          <View className="flex-row flex-wrap gap-3">
            {NOTE_ICON_OPTIONS.map((option) => {
              const selected = note.icon === option.icon && note.iconType === option.iconType;
              return (
                <Pressable
                  key={`${option.iconType}:${option.icon}`}
                  onPress={() => {
                    void updateIcon(note.id, option)
                      .then((updated) => updated && setNote(updated))
                      .catch((error) => {
                        Alert.alert(t("notes.saveFailed"), error instanceof Error ? error.message : t("notes.tryAgain"));
                      });
                  }}
                  className="rounded-2xl p-1"
                  style={{ borderWidth: 2, borderColor: selected ? appTheme.colors.primary : "transparent" }}
                >
                  <NoteIcon icon={option.icon} iconType={option.iconType} iconColor={option.iconColor} size={42} />
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => {
              void togglePin(note.id).then(load).catch((error) => {
                Alert.alert(t("notes.saveFailed"), error instanceof Error ? error.message : t("notes.tryAgain"));
              });
            }}
            className="flex-row items-center justify-between rounded-2xl px-4 py-3"
            style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.08 : 0.045) }}
          >
            <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{note.pinned ? t("notes.unpin") : t("notes.pin")}</Text>
            <AppSymbol name={note.pinned ? "pin.slash" : "pin.fill"} size={17} tintColor={appTheme.colors.primary} fallback={null} />
          </Pressable>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>{t("notes.members")}</Text>
            <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{note.memberCount}</Text>
          </View>
          {note.members.map((member) => (
            <View key={member.id} className="flex-row items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.08 : 0.045) }}>
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: appTheme.colors.overlay }}>
                <AppSymbol name="person.fill" size={16} tintColor={appTheme.colors.muted} fallback={<Text>U</Text>} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-bold" style={{ color: appTheme.colors.foreground }}>{member.user.name ?? member.user.email ?? t("notes.member")}</Text>
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{member.role === "owner" ? t("notes.owner") : t("notes.editor")}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>{t("notes.inviteLinks")}</Text>
            {note.role === "owner" ? (
              <Pressable onPress={() => void createInvite()} disabled={busy} className="rounded-full px-3 py-2" style={{ backgroundColor: appTheme.colors.primary, opacity: busy ? 0.5 : 1 }}>
                <Text className="text-xs font-bold" style={{ color: appTheme.colors.background }}>{busy ? t("notes.creating") : t("notes.createInvite")}</Text>
              </Pressable>
            ) : null}
          </View>
          {note.role !== "owner" ? (
            <Text className="text-sm" style={{ color: appTheme.colors.muted }}>{t("notes.ownerInviteOnly")}</Text>
          ) : invitations.length === 0 ? (
            <Text className="text-sm" style={{ color: appTheme.colors.muted }}>{t("notes.noInvites")}</Text>
          ) : invitations.map((invitation) => {
            const expired = new Date(invitation.expiresAt) < new Date();
            return (
              <View key={invitation.id} className="gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.08 : 0.045) }}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold" style={{ color: expired || invitation.status !== "pending" ? appTheme.colors.muted : appTheme.colors.primary }}>
                    {expired ? t("notes.expired") : invitation.status === "pending" ? t("notes.active") : t("notes.used")}
                  </Text>
                  <Pressable onPress={() => void removeInvite(invitation.id)}><Text className="text-xs font-bold" style={{ color: appTheme.colors.negative }}>{t("common.delete")}</Text></Pressable>
                </View>
                <Pressable onPress={() => void shareCode(invitation.code)} className="flex-row items-center justify-between">
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-xs" style={{ color: appTheme.colors.muted }}>.../notes?code={invitation.code}</Text>
                  <AppSymbol name="square.and.arrow.up" size={15} tintColor={appTheme.colors.primary} fallback={null} />
                </Pressable>
              </View>
            );
          })}
        </View>

        {note.role === "owner" ? (
          <View className="gap-2 rounded-2xl border px-4 py-4" style={{ borderColor: alpha(appTheme.colors.negative, 0.3), backgroundColor: alpha(appTheme.colors.negative, 0.06) }}>
            <Text className="font-black" style={{ color: appTheme.colors.negative }}>{t("notes.deleteTitle")}</Text>
            <Text className="text-xs leading-5" style={{ color: appTheme.colors.muted }}>{t("notes.deleteForEveryone")}</Text>
            <Pressable onPress={confirmDelete} className="mt-1 items-center rounded-full py-3" style={{ backgroundColor: appTheme.colors.negative }}>
              <Text className="font-bold" style={{ color: appTheme.colors.background }}>{t("common.delete")}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
