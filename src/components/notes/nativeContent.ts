import type { BlockType, PartialBlock } from "blocknote-native-editor/core";

const SUPPORTED_BLOCK_TYPES = new Set<BlockType>([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "toggleListItem",
  "file",
  "image",
  "video",
  "audio",
]);

export function parseNativeNoteContent(contentJson: string | null): PartialBlock[] {
  if (!contentJson) return [{ type: "paragraph" }];
  const parsed = JSON.parse(contentJson) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Invalid note document");
  return parsed as PartialBlock[];
}

export function isNativeNoteContentSupported(contentJson: string | null): boolean {
  try {
    const blocks = parseNativeNoteContent(contentJson);
    const supported = (items: PartialBlock[]): boolean =>
      items.every(
        (block) =>
          SUPPORTED_BLOCK_TYPES.has(block.type ?? "paragraph") &&
          (!block.children || supported(block.children)),
      );
    return supported(blocks);
  } catch {
    return false;
  }
}

export function getFirstBlockText(contentJson: string): string {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return "";
    const content = (parsed[0] as { content?: unknown })?.content;
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .join("")
      .trim();
  } catch {
    return "";
  }
}
