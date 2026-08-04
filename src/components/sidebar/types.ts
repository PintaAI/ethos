import type { Href } from "expo-router";
import type { SFSymbol } from "expo-symbols";

export type AppArea = "cashflow" | "lifeflow";

export type SidebarItem = {
  id: string;
  label: string;
  icon: SFSymbol;
  route: Href;
  activePaths?: string[];
  replace?: boolean;
  withAnchor?: boolean;
  noteId?: string;
  children?: SidebarItem[];
};

export type SidebarSection = {
  label: string;
  area: AppArea;
  items: SidebarItem[];
};
