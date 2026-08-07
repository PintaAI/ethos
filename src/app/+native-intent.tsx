import { Platform } from "react-native";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, "ethos://app");
    if (url.hostname === "expo-sharing") return "/inbound-share";
    // iOS widget "New Entry" deep link: land on cashflow home first so the
    // entry-form form sheet has a rendered screen behind it.
    if (Platform.OS === "ios" && url.hostname === "forms" && url.pathname === "/entry-form") {
      return "/home?openEntry=1";
    }
    return path;
  } catch {
    return "/";
  }
}
