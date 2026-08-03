import { View, Pressable, ScrollView } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { useGlobalSearchParams, usePathname, useSegments, router } from "expo-router";
import Animated, { useAnimatedStyle, interpolate } from "react-native-reanimated";
import { useDrawerProgress } from "react-native-drawer-layout";
import { GlassBox } from "@/components/GlassBox";
import { Image } from "expo-image";
import { AppSymbol } from "@/components/AppSymbol";
import { useAuth } from "@/components/AuthProvider";
import { useAppTheme } from "@/components/AppTheme";
import { useTranslation } from "react-i18next";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import { buildSidebarSections } from "@/components/sidebar/config";
import { getCurrentAppArea, isSidebarItemActive } from "@/components/sidebar/routing";
import type { AppArea, SidebarItem } from "@/components/sidebar/types";

type SidebarProps = {
  onClose: () => void;
  onOpenProfile: () => void;
};

function hasActiveChild(
  pathname: string,
  children: SidebarItem[],
  sectionArea: AppArea,
  currentArea: AppArea,
  activeNoteId?: string,
): boolean {
  return children.some((child) =>
    isSidebarItemActive(pathname, child, sectionArea, currentArea, activeNoteId),
  );
}

function SidebarNavRow({
  item,
  isActive,
  isSubItem = false,
  onPress,
}: {
  item: SidebarItem;
  isActive: boolean;
  isSubItem?: boolean;
  onPress: () => void;
}) {
  const appTheme = useAppTheme();
  const iconSize = isSubItem ? 14 : 16;
  const surface = appTheme.isDark ? "rgba(255,255,255,0.035)" : "rgba(15,23,42,0.028)";
  const separatorLine = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const rowBackground = isActive ? surface : "transparent";

  return (
    <Pressable
      className="overflow-hidden rounded-xl px-2.5 py-2"
      style={[
        {
          backgroundColor: rowBackground,
          borderWidth: isActive ? 1 : 0,
          borderColor: separatorLine,
        },
        isSubItem && { marginLeft: 28, paddingLeft: 8 },
      ]}
      onPress={onPress}
    >
      {isActive ? (
        <View
          className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full"
          style={{ backgroundColor: appTheme.colors.primary }}
        />
      ) : null}
      <View className="flex-row items-center gap-2.5">
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{
            backgroundColor: isActive ? "transparent" : surface,
          }}
        >
          <AppSymbol
            name={item.icon}
            size={iconSize}
            tintColor={appTheme.colors.primary}
            fallback={
              <Text
                style={{ color: isActive ? appTheme.colors.primary : appTheme.colors.foreground, fontSize: iconSize }}
              >
                •
              </Text>
            }
          />
        </View>
        <Text
          numberOfLines={1}
          style={{
            color: appTheme.colors.foreground,
            fontSize: isSubItem ? appTheme.textSize - 4 : appTheme.textSize - 3,
            fontWeight: isActive ? "700" : "600",
            letterSpacing: appTheme.textSpacing,
          }}
        >
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Sidebar({ onClose, onOpenProfile }: SidebarProps) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const auth = useAuth();
  const { notes } = useNotesData();
  const pathname = usePathname();
  const { id: routeNoteId } = useGlobalSearchParams<{ id?: string | string[] }>();
  const activeNoteId = Array.isArray(routeNoteId) ? routeNoteId[0] : routeNoteId;
  const segments = useSegments();
  const currentArea = getCurrentAppArea(segments.map(String));
  const progress = useDrawerProgress();

  const sections = buildSidebarSections(notes, t);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.85, 1]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-20, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.95, 1]) },
    ],
  }));

  const handlePress = (item: SidebarItem) => {
    onClose();
    const shouldReplace = item.replace || (item.noteId && pathname === "/journal/detail");
    if (shouldReplace) {
      router.replace(item.route, { withAnchor: item.withAnchor });
    } else {
      router.push(item.route, { withAnchor: item.withAnchor });
    }
  };

  return (
    <Animated.View
      style={[
        animatedStyle,
        { flex: 1, padding: 16, paddingTop: 54, backgroundColor: appTheme.colors.background },
      ]}
    >
      <View className="mb-5 flex-row items-center justify-between px-1">
        <Text className="text-xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
          {t('sidebar.menu')}
        </Text>
        <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
          Ethos
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 12 }}
      >
        {sections.map((section) => (
          <View
            key={section.area}
            className="rounded-2xl px-1 py-2"
            style={{
              marginBottom: 10,
            }}
          >
            <View className="mb-1.5 flex-row items-center justify-between px-2">
              <Text
                className="text-xs font-semibold uppercase tracking-[1.6px]"
                style={{ color: appTheme.colors.muted }}
              >
                {section.label}
              </Text>
              <Text className="text-xs font-bold" style={{ color: appTheme.colors.muted }}>
                {section.items.length}
              </Text>
            </View>
            <View style={{ gap: 1 }}>
              {section.items.map((item) => {
                const active = isSidebarItemActive(pathname, item, section.area, currentArea, activeNoteId);
                const childActive = item.children
                  ? hasActiveChild(pathname, item.children, section.area, currentArea, activeNoteId)
                  : false;

                return (
                  <View key={item.id}>
                    <SidebarNavRow
                      item={item}
                      isActive={active && !childActive}
                      onPress={() => handlePress(item)}
                    />
                    {item.children ? (
                      <View>
                        <View
                          style={{
                            position: "absolute",
                            left: 20,
                            top: 0,
                            bottom: 0,
                            width: 2,
                            backgroundColor: appTheme.colors.primary,
                            opacity: 0.25,
                            borderRadius: 1,
                          }}
                        />
                        {item.children.map((child) => (
                          <SidebarNavRow
                            key={child.id}
                            item={child}
                            isSubItem
                            isActive={isSidebarItemActive(
                              pathname,
                              child,
                              section.area,
                              currentArea,
                              activeNoteId,
                            )}
                            onPress={() => handlePress(child)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable
        className="overflow-hidden rounded-3xl"
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={t('sidebar.openProfile')}
      >
        <GlassBox
          isInteractive
          glassEffectStyle="regular"
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: appTheme.colors.overlay,
            backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.62)",
            padding: 12,
          }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: appTheme.colors.primary }}
            >
              {auth.avatarSource ? (
                <Image source={auth.avatarSource} contentFit="cover" style={{ height: "100%", width: "100%" }} />
              ) : (
                <Text
                  style={{
                    color: appTheme.colors.inverseForeground,
                    fontSize: appTheme.textSize - 1,
                    fontWeight: "800",
                    letterSpacing: appTheme.textSpacing,
                  }}
                >
                  {auth.initials}
                </Text>
              )}
            </View>

            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                style={{ color: appTheme.colors.foreground, fontSize: appTheme.textSize - 1, fontWeight: "700", letterSpacing: appTheme.textSpacing }}
              >
                {auth.displayName}
              </Text>
              <Text numberOfLines={1} style={appTheme.text.caption}>
                {auth.email || (auth.isPending ? t('sidebar.loading') : t('sidebar.notSignedIn'))}
              </Text>
            </View>

            <Text className="text-2xl" style={{ color: appTheme.colors.muted }}>›</Text>
          </View>
        </GlassBox>
      </Pressable>
    </Animated.View>
  );
}
