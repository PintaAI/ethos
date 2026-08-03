import { Icon } from "@expo/ui";

export const toolbarIcons = {
  menu: Icon.select({
    ios: "sidebar.left",
    android: import("@expo/material-symbols/menu.xml"),
  }),
  close: Icon.select({
    ios: "xmark",
    android: import("@expo/material-symbols/close.xml"),
  }),
  check: Icon.select({
    ios: "checkmark",
    android: import("@expo/material-symbols/check.xml"),
  }),
  add: Icon.select({
    ios: "plus",
    android: import("@expo/material-symbols/add.xml"),
  }),
  preset: Icon.select({
    ios: "calendar.badge.plus",
    android: import("@expo/material-symbols/event_repeat.xml"),
  }),
  clear: Icon.select({
    ios: "eraser",
    android: import("@expo/material-symbols/ink_eraser.xml"),
  }),
  settings: Icon.select({
    ios: "gearshape",
    android: import("@expo/material-symbols/settings.xml"),
  }),
};
