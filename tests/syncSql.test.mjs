import { describe, expect, test } from "bun:test";

import { sqlitePlaceholders, uniqueSyncIds } from "../src/lib/sync/syncSql.ts";

describe("entry sync SQL helpers", () => {
  test("deduplicates IDs and removes empty values", () => {
    expect(uniqueSyncIds(["entry-a", null, "", "entry-a", "entry-b"])).toEqual(["entry-a", "entry-b"]);
  });

  test("builds bounded parameter placeholders", () => {
    expect(sqlitePlaceholders(3)).toBe("?, ?, ?");
    expect(() => sqlitePlaceholders(0)).toThrow();
    expect(() => sqlitePlaceholders(201)).toThrow();
  });
});
