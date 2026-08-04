import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import i18n from "@/i18n";

export type PickedUploadImage = {
  uri: string;
  name: string;
  type: string;
  size: number;
};

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const IMAGE_TYPES_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
} as const;
const ALLOWED_IMAGE_TYPES = new Set(Object.values(IMAGE_TYPES_BY_EXTENSION));

export function getSupportedImageType(fileName: string | null | undefined, mimeType: string | null | undefined) {
  const normalizedMime = mimeType?.toLowerCase();
  if (normalizedMime && ALLOWED_IMAGE_TYPES.has(normalizedMime as (typeof IMAGE_TYPES_BY_EXTENSION)[keyof typeof IMAGE_TYPES_BY_EXTENSION])) return normalizedMime;
  if (normalizedMime) return null;
  const extension = fileName?.toLowerCase().match(/\.([^.]+)$/)?.[1];
  return extension ? IMAGE_TYPES_BY_EXTENSION[extension as keyof typeof IMAGE_TYPES_BY_EXTENSION] ?? null : null;
}

export function validateUploadImage(input: Pick<PickedUploadImage, "uri" | "name"> & { type?: string | null; size: number }) {
  const type = getSupportedImageType(input.name, input.type);
  if (!type) throw new Error(i18n.t("imageUpload.unsupportedType"));
  if (input.size > MAX_IMAGE_SIZE) throw new Error(i18n.t("imageUpload.tooLarge"));
  return { uri: input.uri, name: input.name, type, size: input.size } satisfies PickedUploadImage;
}

export async function pickUploadImage(aspect: [number, number] = [1, 1]): Promise<PickedUploadImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  const fileSize = asset.fileSize ?? new File(asset.uri).size;
  const fileName = asset.fileName ?? new File(asset.uri).name;
  return validateUploadImage({ uri: asset.uri, name: fileName, type: asset.mimeType, size: fileSize });
}
