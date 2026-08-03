import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

import en from "./locales/en";
import id from "./locales/id";

const STORAGE_KEY = "app-language";

const resources = { en: { translation: en }, id: { translation: id } } as const;

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
  if (stored === "id" || stored === "en") return stored;
  const locale = getLocales()[0]?.languageCode;
  return locale === "id" ? "id" : "en";
}).then((lng) => {
  if (lng !== i18n.resolvedLanguage) {
    return i18n.changeLanguage(lng);
  }
  return undefined;
}).catch((error) => console.warn("Failed to restore language", error));

i18n.on("languageChanged", (lng) => {
  void AsyncStorage.setItem(STORAGE_KEY, lng)
    .catch((error) => console.warn("Failed to persist language", error));
});

export default i18n;
