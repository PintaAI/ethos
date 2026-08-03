export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, "ethos://app");
    return url.hostname === "expo-sharing" ? "/inbound-share" : path;
  } catch {
    return "/";
  }
}
