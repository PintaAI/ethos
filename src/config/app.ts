import Constants from "expo-constants";
import * as Updates from "expo-updates";

export const APP_NAME = "Ethos";
export const APP_VERSION = Updates.runtimeVersion ?? Constants.expoConfig?.version ?? "Unknown";
