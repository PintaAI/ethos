export const ENTRY_SYNC_PAGE_ID_LIMIT = 200;

export function uniqueSyncIds(values: Iterable<string | null | undefined>): string[] {
  const ids = [...new Set([...values].filter((value): value is string => typeof value === "string" && value.length > 0))];
  if (ids.length > ENTRY_SYNC_PAGE_ID_LIMIT) throw new Error(`Entry sync page exceeds ${ENTRY_SYNC_PAGE_ID_LIMIT} IDs`);
  return ids;
}

export function sqlitePlaceholders(count: number): string {
  if (!Number.isInteger(count) || count < 1 || count > ENTRY_SYNC_PAGE_ID_LIMIT) {
    throw new Error(`SQLite placeholder count must be between 1 and ${ENTRY_SYNC_PAGE_ID_LIMIT}`);
  }
  return new Array(count).fill("?").join(", ");
}
