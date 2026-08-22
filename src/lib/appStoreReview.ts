import { Alert, Linking, Platform } from "react-native";

import { getPreference, setPreference } from "@/lib/preferences";

const APP_STORE_REVIEW_URL = "https://apps.apple.com/app/id6787773622?action=write-review";
const MINIMUM_ENTRY_COUNT = 3;
const PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type ReviewPromptCopy = {
  title: string;
  message: string;
  later: string;
  review: string;
};

export async function maybePromptForAppStoreReview(copy: ReviewPromptCopy): Promise<void> {
  if (Platform.OS !== "ios") return;

  const [completed, entryCount, lastPromptAt] = await Promise.all([
    getPreference("appStoreReviewCompleted"),
    getPreference("appStoreReviewEntryCount"),
    getPreference("appStoreReviewLastPromptAt"),
  ]);
  if (completed) return;

  const nextEntryCount = entryCount + 1;
  await setPreference("appStoreReviewEntryCount", nextEntryCount);
  if (nextEntryCount < MINIMUM_ENTRY_COUNT) return;

  const lastPromptTime = lastPromptAt ? Date.parse(lastPromptAt) : 0;
  if (Number.isFinite(lastPromptTime) && Date.now() - lastPromptTime < PROMPT_COOLDOWN_MS) return;

  await setPreference("appStoreReviewLastPromptAt", new Date().toISOString());
  Alert.alert(copy.title, copy.message, [
    { text: copy.later, style: "cancel" },
    {
      text: copy.review,
      onPress: () => {
        void Linking.openURL(APP_STORE_REVIEW_URL)
          .then(() => setPreference("appStoreReviewCompleted", true))
          .catch((error) => console.warn("Failed to open App Store review", error));
      },
    },
  ]);
}
