import type { SQLiteDatabase } from "expo-sqlite";
import type { LifeFlowKind, LifeFlowSyncEntity } from "@/lib/api/lifeflow";
import { lifeFlowTables, lifeFlowColumns } from "./lifeflowApply";

export function serializeLifeFlowRow(kind: LifeFlowKind, row: Record<string, unknown>) {
  const data = Object.fromEntries([...lifeFlowColumns[kind], "updated_at"].map((column) => [column, row[column]]));
  if (kind === "item") {
    const { updated_at: _updatedAt, notify_start, notify_end, ...item } = data;
    return {
      ...item,
      notify_start: notify_start !== 0 && notify_start !== false,
      notify_end: notify_end !== 0 && notify_end !== false,
    };
  }
  if (kind === "item_exception") {
    const { replacement_json, ...exception } = data;
    const replacement = replacement_json == null
      ? null
      : JSON.parse(String(replacement_json)) as Record<string, unknown>;
    return {
      ...exception,
      cancelled: exception.cancelled === 1 || exception.cancelled === true,
      replacement: replacement && {
        name: replacement.name,
        color: replacement.color,
        start_time: replacement.start_time ?? replacement.startTime ?? null,
        end_time: replacement.end_time ?? replacement.endTime ?? null,
        notify_start: replacement.notify_start !== false && replacement.notify_start !== 0 && replacement.notifyStart !== false,
        notify_end: replacement.notify_end !== false && replacement.notify_end !== 0 && replacement.notifyEnd !== false,
        break_durations_json: replacement.break_durations_json ?? JSON.stringify(replacement.breakDurations ?? []),
      },
    };
  }
  return data;
}

export async function collectLifeFlowEntities(db: SQLiteDatabase): Promise<LifeFlowSyncEntity[]> {
  const entities: LifeFlowSyncEntity[] = [];
  for (const definition of lifeFlowTables) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${definition.table}`,
    );
    for (const row of rows) {
      const updatedAt = String(row.updated_at);
      entities.push({
        kind: definition.kind,
        id: definition.id(row),
        updatedAt,
        data: serializeLifeFlowRow(definition.kind, row),
      });
    }
  }
  const tombstones = await db.getAllAsync<{ kind: LifeFlowKind; entity_id: string; updated_at: string }>(
    "SELECT kind, entity_id, updated_at FROM lifeflow_tombstones",
  );
  entities.push(...tombstones.map((row) => ({
    kind: row.kind,
    id: row.entity_id,
    updatedAt: row.updated_at,
    deleted: true as const,
  })));
  return entities;
}
