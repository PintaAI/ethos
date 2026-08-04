import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Drawer } from "react-native-drawer-layout";
import Sidebar from "@/components/sidebar/Sidebar";
import { useAppTheme } from "@/components/provider/AppTheme";

type DrawerContextType = {
  open: () => void;
  close: () => void;
};

const DrawerContext = createContext<DrawerContextType | null>(null);

export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}

export function DrawerProvider({ children }: { children: ReactNode }) {
  const appTheme = useAppTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screenCornerRadius = 58;
  const open = useCallback(() => setDrawerOpen(true), []);
  const close = useCallback(() => setDrawerOpen(false), []);
  const openProfile = useCallback(() => {
    setDrawerOpen(false);
    router.push("/profile");
  }, []);

  return (
    <DrawerContext.Provider value={{ open, close }}>
      <Drawer
        open={drawerOpen}
        onOpen={open}
        onClose={close}
        renderDrawerContent={() => <Sidebar onClose={close} onOpenProfile={openProfile} />}
        drawerType="back"
        overlayStyle={{ backgroundColor: "rgba(255, 255, 255, 0)" }}
        style={{ backgroundColor: appTheme.colors.background }}
        drawerStyle={{ width: 300, backgroundColor: appTheme.colors.background }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: appTheme.colors.background,
            borderTopLeftRadius: screenCornerRadius,
            borderBottomLeftRadius: screenCornerRadius,
            shadowColor: "#000",
            shadowOffset: { width: -5, height: 0 },
            shadowOpacity: appTheme.isDark ? 0.35 : 0.18,
            shadowRadius: 22,
            elevation: 18,
          }}
        >
          <View
            style={{
              flex: 1,
              overflow: "hidden",
              backgroundColor: appTheme.colors.background,
              borderTopLeftRadius: screenCornerRadius,
              borderBottomLeftRadius: screenCornerRadius,
            }}
            renderToHardwareTextureAndroid={drawerOpen}
          >
            {children}
          </View>
        </View>
      </Drawer>
    </DrawerContext.Provider>
  );
}
