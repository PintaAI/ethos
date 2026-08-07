// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LifeFlowSyncEntity } from "@/lib/api/lifeflow";
import { orderLifeFlowSnapshot } from "./lifeflowOrder";

describe("LifeFlow sync protocol", () => {
  test("applies parents before children and deletes children before parents", () => {
    const entity = (kind: LifeFlowSyncEntity["kind"], deleted = false): LifeFlowSyncEntity => ({
      kind,
      id: `${kind}-id`,
      updatedAt: "2026-08-05T00:00:00.000Z",
      deleted,
      data: {},
    });
    const ordered = orderLifeFlowSnapshot([
      entity("time_box"),
      entity("habit"),
      entity("day_preset", true),
      entity("day_preset_block"),
      entity("day_preset_block", true),
    ]);

    assert.deepEqual(ordered.map((item) => `${item.deleted ? "delete" : "upsert"}:${item.kind}`), [
      "upsert:habit",
      "upsert:day_preset_block",
      "upsert:time_box",
      "delete:day_preset_block",
      "delete:day_preset",
    ]);
  });
});
