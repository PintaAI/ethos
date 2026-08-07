import type { Href } from "expo-router";
import type { TFunction } from "i18next";

import type { CachedNote } from "@/data/notes/types";
import type { SidebarSection } from "@/components/sidebar/types";

function buildCashflowSection(t: TFunction): SidebarSection {
  return {
    label: t("sidebar.cashflow"),
    area: "cashflow",
    items: [
      {
        id: "home",
        label: t("tabs.home"),
        icon: "house.fill",
        route: "/(cashflow)/(tabs)/home" as Href,
        activePaths: ["/home"],
        replace: true,
        children: [
          {
            id: "cashflow-transfer",
            label: t("sidebar.transfer"),
            icon: "arrow.left.arrow.right",
            route: "/forms/transfer" as Href,
          },
          {
            id: "cashflow-categories-budget",
            label: t("sidebar.categoriesBudget"),
            icon: "chart.pie.fill",
            route: "/forms/categories" as Href,
          },
          {
            id: "cashflow-automatic-entry",
            label: t("sidebar.catatOtomatis"),
            icon: "repeat.circle.fill",
            route: "/forms/automatic-entry" as Href,
          },
        ],
      },
      {
        id: "cashflow-audit",
        label: t("audit.title"),
        icon: "checkmark.seal.fill",
        route: "/forms/audit" as Href,
      },
    ],
  };
}

function buildLifeFlowSection(notes: CachedNote[], t: TFunction): SidebarSection {
  return {
    label: t("sidebar.lifeFlow"),
    area: "lifeflow",
    items: [
      {
        id: "lifeflow-journal",
        label: t("sidebar.journal"),
        icon: "book.pages.fill",
        route: "/(lifeflow)/(tabs)/journal" as Href,
        activePaths: ["/journal/*"],
        replace: true,
        children: notes
          .filter((note) => note.pinned)
          .map((note) => ({
            id: `journal-note-${note.id}`,
            label: note.title || t("sidebar.journal"),
            icon: "pin.fill",
            route: {
              pathname: "/(lifeflow)/(tabs)/journal/detail",
              params: { id: note.id },
            } as Href,
            withAnchor: true,
            noteId: note.id,
          })),
      },
      {
        id: "lifeflow-habits",
        label: t("sidebar.habits"),
        icon: "checkmark.circle.fill",
        route: "/(lifeflow)/(tabs)/habits" as Href,
        activePaths: ["/habits"],
        replace: true,
      },
      {
        id: "lifeflow-schedule",
        label: t("sidebar.schedule"),
        icon: "calendar.circle.fill",
        route: "/(lifeflow)/(tabs)/schedule" as Href,
        activePaths: ["/schedule"],
        replace: true,
      },
    ],
  };
}

export function buildSidebarSections(notes: CachedNote[], t: TFunction): SidebarSection[] {
  return [buildCashflowSection(t), buildLifeFlowSection(notes, t)];
}
