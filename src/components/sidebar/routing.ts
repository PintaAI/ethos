import type { AppArea, SidebarItem } from "@/components/sidebar/types";

export function getCurrentAppArea(segments: string[]): AppArea {
  if (segments.includes("(self-improvement)")) return "self-improvement";
  return "cashflow";
}

export function isSidebarItemActive(
  pathname: string,
  item: SidebarItem,
  sectionArea: AppArea,
  currentArea: AppArea,
  activeNoteId?: string,
): boolean {
  if (sectionArea !== currentArea) return false;
  if (item.noteId) return pathname === "/journal/detail" && item.noteId === activeNoteId;
  if (item.activePaths) {
    return item.activePaths.some((path) => {
      if (path.endsWith("/*")) {
        const base = path.slice(0, -2);
        return pathname === base || pathname.startsWith(`${base}/`);
      }
      return pathname === path;
    });
  }

  const route = typeof item.route === "string" ? item.route : String(item.route);
  return pathname === route || pathname.startsWith(`${route}/`);
}
