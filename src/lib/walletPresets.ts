import { Asset } from "expo-asset";
import { File } from "expo-file-system";

import type { PickedUploadImage } from "@/lib/imageUpload";

export const walletPresets = [
  { id: "01", source: require("@/assets/images/wallets/01.png") },
  { id: "02", source: require("@/assets/images/wallets/02.png") },
  { id: "03", source: require("@/assets/images/wallets/03.png") },
  { id: "04", source: require("@/assets/images/wallets/04.png") },
  { id: "05", source: require("@/assets/images/wallets/05.png") },
  { id: "06", source: require("@/assets/images/wallets/06.png") },
  { id: "07", source: require("@/assets/images/wallets/07.png") },
  { id: "08", source: require("@/assets/images/wallets/08.png") },
  { id: "09", source: require("@/assets/images/wallets/09.png") },
] as const;

export async function loadWalletPresetImage(preset: (typeof walletPresets)[number]): Promise<PickedUploadImage | null> {
  const [asset] = await Asset.loadAsync(preset.source);
  if (!asset.localUri) return null;

  return {
    uri: asset.localUri,
    name: `wallet-${preset.id}.png`,
    type: "image/png",
    size: new File(asset.localUri).size,
  };
}
