import { Directory, File, Paths } from "expo-file-system";
import type { PickedUploadImage } from "./imageUpload";

const walletImageDirectory = new Directory(Paths.document, "wallet-images");

export function isOwnedWalletImage(uri: string | null | undefined): uri is string {
  return !!uri && uri.startsWith(`${walletImageDirectory.uri}/`);
}

export function walletImageUploadMetadata(uri: string) {
  if (!isOwnedWalletImage(uri)) return null;
  const file = new File(uri);
  const extension = file.extension.toLowerCase();
  const type = extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".gif"
          ? "image/gif"
          : null;
  return type ? { uri, name: file.name, type, size: file.size } : null;
}

export async function persistWalletImage(image: PickedUploadImage) {
  walletImageDirectory.create({ idempotent: true, intermediates: true });
  const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const destination = new File(walletImageDirectory, `${uuid}.${extension}`);
  await new File(image.uri).copy(destination);
  return destination.uri;
}

export function deleteOwnedWalletImage(uri: string | null | undefined) {
  if (!isOwnedWalletImage(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn("Failed to delete wallet image", error);
  }
}
