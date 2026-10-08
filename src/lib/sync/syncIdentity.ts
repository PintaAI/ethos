import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function canonicalSyncValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSyncValue).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((name) => record[name] !== undefined).sort().map((name) => `${JSON.stringify(name)}:${canonicalSyncValue(record[name])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Include the payload, not just the timestamp: two edits in the same millisecond
// must not retrieve each other's stored server receipt. Hashing keeps financial
// payloads out of operation identifiers.
export function syncMutationId(localId: string, updatedAt: string, payload: unknown): string {
  return `${localId}:${updatedAt}:v2:${bytesToHex(sha256(utf8ToBytes(canonicalSyncValue(payload))))}`;
}
