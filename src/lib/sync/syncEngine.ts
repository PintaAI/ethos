import type { SQLiteDatabase } from "expo-sqlite";
import { ApiError } from "@/lib/api/client";
import { createEntry, deleteEntry, getEntrySyncPage, listAllEntries, pushEntrySyncBatch, updateEntry } from "@/lib/api/entries";
import { createManagement, deleteManagement, listManagements, updateManagement, updateManagementImage } from "@/lib/api/managements";
import { deleteOwnedWalletImage, isOwnedWalletImage, walletImageUploadMetadata } from "@/lib/walletImages";
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/api/categories";
import { createQuickFill, deleteQuickFill, listQuickFills, updateQuickFill } from "@/lib/api/quick-fills";
import { deleteOverallBudget, listOverallBudgets, saveOverallBudget } from "@/lib/api/budgets";
import {
  createRecurringEntry,
  deleteRecurringEntry,
  listRecurringEntries,
  updateRecurringEntry,
} from "@/lib/api/recurring";
import type {
  ServerCategory,
  ServerManagement,
  ServerOverallBudget,
  ServerQuickFill,
  ServerRecurringEntry,
  EntrySyncMutation,
  EntrySyncRecord,
} from "@/lib/api/types";
import {
  hardDeleteById,
  hardDeleteByRemoteId,
  listDirty,
  markSynced,
  setLastPulledAt,
  getEntrySyncCursor,
  isEntrySyncBootstrapped,
  resetEntrySyncCursor,
  upsertByRemoteId,
} from "./syncStatus";
import {
  adoptLocalCategoryByMgmtAndName,
  adoptLocalOverallBudgetByMgmtAndPeriod,
  getLocalCategoryIdByRemoteId,
  getManagementRemoteId,
  listLocalManagementsWithRemoteId,
  lwwNewer,
  localCategoryToCreate,
  localCategoryToUpdate,
  localEntryToCreate,
  localManagementToCreate,
  localManagementToUpdate,
  localOverallBudgetToUpsert,
  localQuickFillToCreate,
  localQuickFillToUpdate,
  localRecurringToCreate,
  localRecurringToUpdate,
  resolveCategoryIdByName,
  serverCategoryToLocal,
  serverEntryToLocal,
  serverManagementToLocal,
  serverOverallBudgetToLocal,
  serverQuickFillToLocal,
  serverRecurringToLocal,
  type CategoryRow,
  type CategoryUpsertFields,
  type EntryRow,
  type ManagementLite,
  type ManagementRow,
  type ManagementUpsertFields,
  type OverallBudgetRow,
  type OverallBudgetUpsertFields,
  type QuickFillRow,
  type QuickFillUpsertFields,
  type RecurringEntryRow,
  type RecurringEntryUpsertFields,
} from "./reconcile";
import { reconcileLifeFlow } from "./lifeflowSync";
import { getDbLockGeneration, withDbLock } from "./dbLock";
import { sqlitePlaceholders, uniqueSyncIds } from "./syncSql";

export type SyncSummary = {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: number;
  cashflowChanged: number;
  lifeFlowChanged: number;
  pages: number;
};

type SyncScope = {
  localManagementIds: Set<string>;
  remoteManagementIds: Set<string>;
};

export type SyncOptions = {
  signal?: AbortSignal;
  generation?: number;
};

const LOCKED_DB_METHODS = new Set([
  "execAsync", "getAllAsync", "getEachAsync", "getFirstAsync", "prepareAsync", "runAsync",
  "withExclusiveTransactionAsync", "withTransactionAsync",
]);

export function createGenerationScopedDatabase(db: SQLiteDatabase, generation: number): SQLiteDatabase {
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !LOCKED_DB_METHODS.has(property) || typeof value !== "function") return value;
      return (...args: unknown[]) => withDbLock(
        () => Reflect.apply(value, target, args) as Promise<unknown>,
        generation,
      );
    },
  }) as SQLiteDatabase;
}

function throwIfCancelled(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("Sync cancelled");
}

async function buildSyncScope(db: SQLiteDatabase): Promise<SyncScope> {
  const managements = await db.getAllAsync<{ id: string; remote_id: string | null; deleted_at: string | null }>(
    "SELECT id, remote_id, deleted_at FROM managements",
  );

  return {
    localManagementIds: new Set(managements.map((management) => management.id)),
    remoteManagementIds: new Set(
      managements
        .filter((management) => management.deleted_at === null)
        .map((management) => management.remote_id)
        .filter((remoteId): remoteId is string => remoteId !== null),
    ),
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function hardDeleteManagementTree(db: SQLiteDatabase, managementId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM entries WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM recurring_entries WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM quick_fills WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM overall_budgets WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM categories WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM audit_snapshots WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM management_members WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM managements WHERE id = ?", managementId);
  });
}

// ---------------------------------------------------------------------------
// Serialized execution — coalesce concurrent callers
// ---------------------------------------------------------------------------
// Foreground and background handles point at the same database file. Coalesce
// them process-wide so only the first caller performs network and DB work.

let activeSync: Promise<SyncSummary> | null = null;

export async function waitForSyncIdleAsync(db: SQLiteDatabase): Promise<void> {
  void db;
  const existing = activeSync;
  if (existing) await existing.catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Push phase
// ---------------------------------------------------------------------------

async function pushManagements(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  const dirty = (await listDirty(db, "managements")).filter((row) =>
    scope.localManagementIds.has(String(row.id)),
  );
  if (dirty.length === 0) return;

  for (const row of dirty) {
    throwIfCancelled(signal);
    const local = row as unknown as ManagementRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          try {
            await deleteManagement(local.remote_id, { signal });
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 0;
            if (status === 404 || status === 405) {
              // Already gone on the server, or server doesn't support wallet DELETE yet — drop locally.
            } else {
              throw error;
            }
          }
        }
        await hardDeleteManagementTree(db, local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = localManagementToCreate(local);
        const server = await createManagement(body, { signal });
        await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = localManagementToCreate(local);
          const server = await createManagement(body, { signal });
          await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = localManagementToUpdate(local);
          const server = await updateManagement(local.remote_id, body, { signal });
          await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push management failed", local.id, error);
      summary.errors += 1;
    }
  }
}

async function pushPendingManagementImages(db: SQLiteDatabase, summary: SyncSummary, signal?: AbortSignal) {
  const pending = await db.getAllAsync<{ id: string; remote_id: string; image: string; image_theme_json: string | null }>(
    "SELECT id, remote_id, image, image_theme_json FROM managements WHERE deleted_at IS NULL AND remote_id IS NOT NULL AND image IS NOT NULL",
  );
  for (const management of pending) {
    throwIfCancelled(signal);
    const upload = walletImageUploadMetadata(management.image);
    if (!upload) continue;
    try {
      const result = await updateManagementImage(management.remote_id, upload, signal);
      const serverImage = result.management.image;
      if (!serverImage) throw new Error("Wallet image upload returned no path");
      let imageThemeJson = management.image_theme_json;
      if (imageThemeJson) {
        const imageTheme = JSON.parse(imageThemeJson) as { image?: string };
        imageTheme.image = serverImage;
        imageThemeJson = JSON.stringify(imageTheme);
      }
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync(
          "UPDATE managements SET image = ?, image_theme_json = ? WHERE id = ? AND image = ?",
          serverImage,
          imageThemeJson,
          management.id,
          management.image,
        );
      });
      deleteOwnedWalletImage(management.image);
      summary.pushed += 1;
    } catch (error) {
      console.warn("[sync] push wallet image failed", management.id, error);
      summary.errors += 1;
    }
  }
}

async function pushCategories(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  const dirty = (await listDirty(db, "categories")).filter((row) =>
    scope.localManagementIds.has(String(row.management_id)),
  );
  if (dirty.length === 0) return;

  for (const row of dirty) {
    throwIfCancelled(signal);
    const local = row as unknown as CategoryRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteCategory(local.remote_id, mgmtRemote ?? undefined, { signal });
        }
        await hardDeleteById(db, "categories", local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localCategoryToCreate(db, local);
        if (!body) continue;
        const server = await createCategory(body, { signal });
        await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localCategoryToCreate(db, local);
          if (!body) continue;
          const server = await createCategory(body, { signal });
          await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localCategoryToUpdate(db, local);
          if (!body) continue;
          const server = await updateCategory(local.remote_id, body, { signal });
          await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push category failed", local.id, error);
      summary.errors += 1;
    }
  }
}

async function pushQuickFills(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  const dirty = (await listDirty(db, "quick_fills")).filter((row) =>
    scope.localManagementIds.has(String(row.management_id)),
  );
  if (dirty.length === 0) return;

  for (const row of dirty) {
    throwIfCancelled(signal);
    const local = row as unknown as QuickFillRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteQuickFill(local.remote_id, mgmtRemote ?? undefined, { signal });
        }
        await hardDeleteById(db, "quick_fills", local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localQuickFillToCreate(db, local);
        if (!body) continue;
        const server = await createQuickFill(body, { signal });
        await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localQuickFillToCreate(db, local);
          if (!body) continue;
          const server = await createQuickFill(body, { signal });
          await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localQuickFillToUpdate(db, local);
          if (!body) continue;
          const server = await updateQuickFill(local.remote_id, body, { signal });
          await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push quick fill failed", local.id, error);
      summary.errors += 1;
    }
  }
}

async function pushOverallBudgets(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  const dirty = (await listDirty(db, "overall_budgets")).filter((row) =>
    scope.localManagementIds.has(String(row.management_id)),
  );
  if (dirty.length === 0) return;

  for (const row of dirty) {
    throwIfCancelled(signal);
    const local = row as unknown as OverallBudgetRow;
    try {
      if (local.sync_status === "deleted") {
        const mgmtRemote = await getManagementRemoteId(db, local.management_id);
        if (!mgmtRemote) continue;
        await deleteOverallBudget(local.period, mgmtRemote, { signal });
        await hardDeleteById(db, "overall_budgets", local.id);
        summary.pushed += 1;
        continue;
      }

      // Server upserts by (managementId, period), so pending and updated use the same PUT.
      const body = await localOverallBudgetToUpsert(db, local);
      if (!body) continue;
      const server = await saveOverallBudget(body, { signal });
      await markSynced(db, "overall_budgets", local.id, server.id, server.updatedAt ?? server.createdAt);
      summary.pushed += 1;
    } catch (error) {
      console.warn("[sync] push overall budget failed", local.id, error);
      summary.errors += 1;
    }
  }
}

async function pushRecurringEntries(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  const dirty = (await listDirty(db, "recurring_entries")).filter((row) =>
    scope.localManagementIds.has(String(row.management_id)),
  );
  if (dirty.length === 0) return;

  for (const row of dirty) {
    throwIfCancelled(signal);
    const local = row as unknown as RecurringEntryRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteRecurringEntry(local.remote_id, mgmtRemote ?? undefined, { signal });
        }
        await hardDeleteById(db, "recurring_entries", local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localRecurringToCreate(db, local);
        if (!body) continue;
        const server = await createRecurringEntry(body, { signal });
        await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localRecurringToCreate(db, local);
          if (!body) continue;
          const server = await createRecurringEntry(body, { signal });
          await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localRecurringToUpdate(db, local);
          if (!body) continue;
          const server = await updateRecurringEntry(local.remote_id, body, { signal });
          await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push recurring entry failed", local.id, error);
      summary.errors += 1;
    }
  }
}

async function pushEntries(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  const dirty = (await listDirty(db, "entries")).filter((row) =>
    scope.localManagementIds.has(String(row.management_id)),
  );
  if (dirty.length === 0) return;

  const prepared: { local: EntryRow; managementId: string; mutation: EntrySyncMutation }[] = [];
  for (const row of dirty) {
    const local = row as unknown as EntryRow;
    const managementId = await getManagementRemoteId(db, local.management_id);
    if (!managementId) continue;
    if (local.sync_status === "deleted") {
      if (!local.remote_id) {
        await hardDeleteById(db, "entries", local.id);
        summary.pushed += 1;
      } else {
        prepared.push({ local, managementId, mutation: { mutationId: `${local.id}:${local.updated_at}:deleted`, operation: "delete", entryId: local.remote_id } });
      }
      continue;
    }
    const body = await localEntryToCreate(db, local);
    if (!body) continue;
    const category = local.category_id
      ? await db.getFirstAsync<{ remote_id: string | null }>("SELECT remote_id FROM categories WHERE id = ?", local.category_id)
      : null;
    const { category: _category, managementId: _managementId, clientId: _clientId, ...syncData } = body;
    prepared.push({
      local,
      managementId,
      mutation: {
        mutationId: `${local.id}:${local.updated_at}:${local.sync_status}`,
        operation: local.remote_id ? "update" : "create",
        entryId: local.remote_id ?? undefined,
        clientId: local.remote_id ? undefined : local.id,
        data: { ...syncData, categoryId: category?.remote_id ?? null },
      },
    });
  }

  const byManagement = new Map<string, typeof prepared>();
  for (const item of prepared) {
    const items = byManagement.get(item.managementId) ?? [];
    items.push(item);
    byManagement.set(item.managementId, items);
  }
  for (const managementItems of byManagement.values()) {
    for (let offset = 0; offset < managementItems.length; offset += 75) {
      throwIfCancelled(signal);
      const chunk = managementItems.slice(offset, offset + 75);
      const batchStarted = performance.now();
      try {
        const response = await pushEntrySyncBatch(chunk[0].managementId, chunk.map((item) => item.mutation), { signal });
        const byMutation = new Map(response.results.map((result) => [result.mutationId, result]));
        await db.withExclusiveTransactionAsync(async (txn) => {
          for (const item of chunk) {
            const result = byMutation.get(item.mutation.mutationId);
            if (!result?.ok) {
              summary.errors += 1;
              continue;
            }
            if (item.local.sync_status === "deleted") {
              const deleted = await txn.runAsync("DELETE FROM entries WHERE id = ? AND updated_at = ? AND sync_status = 'deleted'", item.local.id, item.local.updated_at);
              if (deleted.changes > 0) summary.pushed += 1;
            } else {
              const acknowledged = await txn.runAsync(
                "UPDATE entries SET sync_status = 'synced', remote_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND sync_status = ?",
                result.entry.id, result.entry.updatedAt, result.entry.updatedAt, item.local.id, item.local.updated_at, item.local.sync_status,
              );
              if (acknowledged.changes > 0) summary.pushed += 1;
            }
          }
        });
        console.info("[sync] entry push batch", { count: chunk.length, durationMs: Math.round(performance.now() - batchStarted) });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        if (status !== 404 && status !== 405) throw error;
        // Controlled compatibility fallback for servers that predate the batch endpoint.
        for (const item of chunk) {
          const { local } = item;
          try {
            if (local.sync_status === "deleted") {
              if (local.remote_id) await deleteEntry(local.remote_id, item.managementId, { signal });
              await hardDeleteById(db, "entries", local.id);
            } else {
              const body = await localEntryToCreate(db, local);
              if (!body) continue;
              const server = local.remote_id ? await updateEntry(local.remote_id, body, { signal }) : await createEntry(body, { signal });
              await db.runAsync("UPDATE entries SET sync_status = 'synced', remote_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND sync_status = ?", server.id, server.updatedAt ?? server.createdAt, server.updatedAt ?? server.createdAt, local.id, local.updated_at, local.sync_status);
            }
            summary.pushed += 1;
          } catch (legacyError) {
            console.warn("[sync] legacy push entry failed", local.id, legacyError);
            summary.errors += 1;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pull phase
// ---------------------------------------------------------------------------

async function deleteStaleChildren(
  db: SQLiteDatabase,
  table: "categories" | "quick_fills" | "overall_budgets" | "recurring_entries",
  localManagementId: string,
  returnedIds: Set<string>,
  summary: SyncSummary,
  signal?: AbortSignal,
): Promise<void> {
  const localSynced = await db.getAllAsync<{ remote_id: string }>(
    `SELECT remote_id FROM ${table} WHERE remote_id IS NOT NULL AND sync_status = 'synced' AND management_id = ?`,
    localManagementId,
  );
  for (const row of localSynced) {
    throwIfCancelled(signal);
    if (!row.remote_id || returnedIds.has(row.remote_id)) continue;
    try {
      await hardDeleteByRemoteId(db, table, row.remote_id);
      summary.pulled += 1;
    } catch (error) {
      console.warn(`[sync] delete stale local ${table} failed`, row.remote_id, error);
      summary.errors += 1;
    }
  }
}

async function pullManagements(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  let serverManagements: ServerManagement[];
  try {
    serverManagements = await listManagements({ signal });
  } catch (error) {
    console.warn("[sync] pull managements failed", error);
    summary.errors += 1;
    return;
  }

  const stamp = nowIso();
  for (const server of serverManagements) {
    throwIfCancelled(signal);
    scope.remoteManagementIds.add(server.id);
    try {
      const existing = await db.getFirstAsync<{ id: string; updated_at: string; image: string | null; image_theme_json: string | null }>(
        `SELECT id, updated_at, image, image_theme_json FROM managements WHERE remote_id = ? LIMIT 1`,
        server.id,
      );
      if (!existing) {
        const fields = serverManagementToLocal(server, stamp);
        await upsertByRemoteId(db, "managements", server.id, fields);
        summary.pulled += 1;
        continue;
      }
      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverManagementToLocal(server, stamp);
        const mutable = fields as Partial<ManagementUpsertFields>;
        delete mutable.id;
        if (isOwnedWalletImage(existing.image)) {
          delete mutable.image;
        }
        await upsertByRemoteId(db, "managements", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull management failed", server.id, error);
      summary.errors += 1;
    }
  }
}

async function pullCategories(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerCategory[] | null): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listCategories(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull categories failed", mgmt.remote_id, error);
      summary.errors += 1;
      return;
    }
  } else if (serverList === null) {
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
    throwIfCancelled(signal);
    returnedIds.add(server.id);
    try {
      const existing = await db.getFirstAsync<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM categories WHERE remote_id = ? LIMIT 1`,
        server.id,
      );
      if (!existing) {
        // Merge into a locally-created row with the same name+management if one exists
        // so the UNIQUE(management_id, name) constraint is not violated on insert.
        await adoptLocalCategoryByMgmtAndName(db, server.id, mgmt.id, server.name);
        const fields = serverCategoryToLocal(server, mgmt.id, stamp);
        await upsertByRemoteId(db, "categories", server.id, fields);
        summary.pulled += 1;
        continue;
      }
      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverCategoryToLocal(server, mgmt.id, stamp);
        const mutable = fields as Partial<CategoryUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        await upsertByRemoteId(db, "categories", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull category failed", server.id, error);
      summary.errors += 1;
    }
  }

  await deleteStaleChildren(db, "categories", mgmt.id, returnedIds, summary, signal);
}

async function pullQuickFills(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerQuickFill[] | null): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listQuickFills(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull quick fills failed", mgmt.remote_id, error);
      summary.errors += 1;
      return;
    }
  } else if (serverList === null) {
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
    throwIfCancelled(signal);
    returnedIds.add(server.id);
    try {
      const localCategoryId = await getLocalCategoryIdByRemoteId(db, server.categoryId);
      const existing = await db.getFirstAsync<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM quick_fills WHERE remote_id = ? LIMIT 1`,
        server.id,
      );
      if (!existing) {
        const fields = serverQuickFillToLocal(server, mgmt.id, localCategoryId, stamp);
        await upsertByRemoteId(db, "quick_fills", server.id, fields);
        summary.pulled += 1;
        continue;
      }
      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverQuickFillToLocal(server, mgmt.id, localCategoryId, stamp);
        const mutable = fields as Partial<QuickFillUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        await upsertByRemoteId(db, "quick_fills", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull quick fill failed", server.id, error);
      summary.errors += 1;
    }
  }

  await deleteStaleChildren(db, "quick_fills", mgmt.id, returnedIds, summary, signal);
}

async function pullOverallBudgets(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerOverallBudget[] | null): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listOverallBudgets(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull overall budgets failed", mgmt.remote_id, error);
      summary.errors += 1;
      return;
    }
  } else if (serverList === null) {
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
    throwIfCancelled(signal);
    returnedIds.add(server.id);
    try {
      const existing = await db.getFirstAsync<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM overall_budgets WHERE remote_id = ? LIMIT 1`,
        server.id,
      );
      if (!existing) {
        // Merge into a locally-created row with the same (management_id, period).
        await adoptLocalOverallBudgetByMgmtAndPeriod(db, server.id, mgmt.id, server.period);
        const fields = serverOverallBudgetToLocal(server, mgmt.id, stamp);
        await upsertByRemoteId(db, "overall_budgets", server.id, fields);
        summary.pulled += 1;
        continue;
      }
      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverOverallBudgetToLocal(server, mgmt.id, stamp);
        const mutable = fields as Partial<OverallBudgetUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        await upsertByRemoteId(db, "overall_budgets", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull overall budget failed", server.id, error);
      summary.errors += 1;
    }
  }

  await deleteStaleChildren(db, "overall_budgets", mgmt.id, returnedIds, summary, signal);
}

async function pullRecurringEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerRecurringEntry[] | null): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listRecurringEntries(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull recurring entries failed", mgmt.remote_id, error);
      summary.errors += 1;
      return;
    }
  } else if (serverList === null) {
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
    throwIfCancelled(signal);
    returnedIds.add(server.id);
    try {
      const localCategoryId = await getLocalCategoryIdByRemoteId(db, server.categoryId);
      const existing = await db.getFirstAsync<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM recurring_entries WHERE remote_id = ? LIMIT 1`,
        server.id,
      );
      if (!existing) {
        const fields = serverRecurringToLocal(server, mgmt.id, localCategoryId, stamp);
        await upsertByRemoteId(db, "recurring_entries", server.id, fields);
        summary.pulled += 1;
        continue;
      }
      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverRecurringToLocal(server, mgmt.id, localCategoryId, stamp);
        const mutable = fields as Partial<RecurringEntryUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        await upsertByRemoteId(db, "recurring_entries", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull recurring entry failed", server.id, error);
      summary.errors += 1;
    }
  }

  await deleteStaleChildren(db, "recurring_entries", mgmt.id, returnedIds, summary, signal);
}

async function pullEntriesLegacy(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal): Promise<void> {
  let serverEntries;
  try {
    serverEntries = await listAllEntries({ managementId: mgmt.remote_id }, { signal });
  } catch (error) {
    console.warn("[sync] pull entries failed", mgmt.remote_id, error);
    summary.errors += 1;
    return;
  }
  const returnedIds = new Set<string>();
  const stamp = nowIso();

  for (const server of serverEntries) {
    throwIfCancelled(signal);
    returnedIds.add(server.id);
    try {
      const existing = await db.getFirstAsync<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM entries WHERE remote_id = ? LIMIT 1`,
        server.id,
      );

      if (!existing) {
        const fields = serverEntryToLocal(server, mgmt.id, stamp);
        if (server.category) {
          fields.category_id = await resolveCategoryIdByName(db, mgmt.id, server.category);
        }
        await upsertByRemoteId(db, "entries", server.id, fields);
        summary.pulled += 1;
        continue;
      }

      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverEntryToLocal(server, mgmt.id, stamp);
        delete (fields as { id?: string }).id;
        delete (fields as { management_id?: string }).management_id;
        if (server.category) {
          fields.category_id = await resolveCategoryIdByName(db, mgmt.id, server.category);
        }
        await upsertByRemoteId(db, "entries", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull entry failed", server.id, error);
      summary.errors += 1;
    }
  }

  const localSynced = await db.getAllAsync<{ remote_id: string }>(
    `SELECT remote_id FROM entries WHERE remote_id IS NOT NULL AND sync_status = 'synced' AND management_id = ?`,
    mgmt.id,
  );
  for (const row of localSynced) {
    throwIfCancelled(signal);
    if (!row.remote_id || returnedIds.has(row.remote_id)) continue;
    try {
      await hardDeleteByRemoteId(db, "entries", row.remote_id);
      summary.pulled += 1;
    } catch (error) {
      console.warn("[sync] delete stale local entry failed", row.remote_id, error);
      summary.errors += 1;
    }
  }
}

async function applyEntrySyncPage(
  db: SQLiteDatabase,
  mgmt: ManagementLite,
  records: EntrySyncRecord[],
  nextCursor: string,
  bootstrapping: boolean,
  isFinalPage: boolean,
  summary: SyncSummary,
) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const pageRemoteIds = uniqueSyncIds(records.map((record) => record.id));
    const localRows = pageRemoteIds.length === 0
      ? []
      : await txn.getAllAsync<{ id: string; remote_id: string; updated_at: string; sync_status: string }>(
          `SELECT id, remote_id, updated_at, sync_status FROM entries
           WHERE management_id = ? AND remote_id IN (${sqlitePlaceholders(pageRemoteIds.length)})`,
          mgmt.id,
          ...pageRemoteIds,
        );
    const localByRemote = new Map(localRows.map((row) => [row.remote_id, row]));
    const categoryRemoteIds = uniqueSyncIds(
      records.filter((record) => !record.deletedAt).map((record) => record.categoryId),
    );
    const categories = categoryRemoteIds.length === 0
      ? []
      : await txn.getAllAsync<{ id: string; remote_id: string }>(
          `SELECT id, remote_id FROM categories
           WHERE management_id = ? AND deleted_at IS NULL AND remote_id IN (${sqlitePlaceholders(categoryRemoteIds.length)})`,
          mgmt.id,
          ...categoryRemoteIds,
        );
    const categoryByRemote = new Map(categories.map((row) => [row.remote_id, row.id]));

    for (const server of records) {
      if (bootstrapping) await txn.runAsync("INSERT OR IGNORE INTO entry_sync_seen (management_id, remote_id) VALUES (?, ?)", mgmt.id, server.id);
      const local = localByRemote.get(server.id);
      const serverTime = Date.parse(server.updatedAt);
      const localTime = local ? Date.parse(local.updated_at) : 0;
      if (local && local.sync_status !== "synced" && localTime >= serverTime) {
        summary.conflicts += 1;
        continue;
      }
      if (server.deletedAt) {
        if (local?.sync_status === "synced" || (local && serverTime > localTime)) {
          const deleted = await txn.runAsync("DELETE FROM entries WHERE id = ?", local.id);
          summary.pulled += deleted.changes;
        }
        continue;
      }
      if (!server.io) continue;
      const values = [
        server.name, server.nominal, server.originalNominal, server.originalCurrency, server.exchangeRateToIdr,
        server.exchangeRateAt, server.categoryId ? categoryByRemote.get(server.categoryId) ?? null : null,
        server.date ?? "", server.io, server.updatedAt, server.updatedAt, server.id,
      ];
      if (local) {
        if (serverTime <= localTime && local.sync_status === "synced") continue;
        const updated = await txn.runAsync(
          `UPDATE entries SET name = ?, nominal = ?, original_nominal = ?, original_currency = ?, exchange_rate_to_idr = ?,
           exchange_rate_at = ?, category_id = ?, date = ?, io = ?, created_by_id = NULL, deleted_at = NULL,
           sync_status = 'synced', updated_at = ?, last_synced_at = ? WHERE remote_id = ?`,
          ...values,
        );
        summary.pulled += updated.changes;
      } else {
        await txn.runAsync(
          `INSERT INTO entries (id, remote_id, name, nominal, original_nominal, original_currency, exchange_rate_to_idr,
           exchange_rate_at, category_id, date, io, management_id, created_by_id, is_reconciliation, created_at, updated_at,
           deleted_at, sync_status, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, 'synced', ?)`,
          `entry-${server.id}`, server.id, server.name, server.nominal, server.originalNominal, server.originalCurrency,
          server.exchangeRateToIdr, server.exchangeRateAt, server.categoryId ? categoryByRemote.get(server.categoryId) ?? null : null,
          server.date ?? "", server.io, mgmt.id, server.createdAt, server.updatedAt, server.updatedAt,
        );
        summary.pulled += 1;
      }
    }

    await txn.runAsync(
      "INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      `entry_sync_v1:${mgmt.remote_id}:cursor`, nextCursor,
    );
    if (bootstrapping && isFinalPage) {
      const removed = await txn.runAsync(
        `DELETE FROM entries WHERE management_id = ? AND remote_id IS NOT NULL AND sync_status = 'synced'
         AND NOT EXISTS (SELECT 1 FROM entry_sync_seen s WHERE s.management_id = ? AND s.remote_id = entries.remote_id)`,
        mgmt.id, mgmt.id,
      );
      summary.pulled += removed.changes;
      await txn.runAsync("DELETE FROM entry_sync_seen WHERE management_id = ?", mgmt.id);
      await txn.runAsync(
        "INSERT INTO app_preferences (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
        `entry_sync_v1:${mgmt.remote_id}:bootstrapped`,
      );
    }
  });
}

async function pullEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, resetAttempted = false): Promise<void> {
  let cursor = await getEntrySyncCursor(db, mgmt.remote_id);
  const bootstrapped = await isEntrySyncBootstrapped(db, mgmt.remote_id);
  const bootstrapping = !bootstrapped;
  if (bootstrapping && !cursor) await db.runAsync("DELETE FROM entry_sync_seen WHERE management_id = ?", mgmt.id);

  while (true) {
    throwIfCancelled(signal);
    const started = performance.now();
    try {
      const page = await getEntrySyncPage(mgmt.remote_id, cursor, { signal });
      if (!page.nextCursor) return;
      await applyEntrySyncPage(db, mgmt, page.entries, page.nextCursor, bootstrapping, !page.hasMore, summary);
      cursor = page.nextCursor;
      summary.pages += 1;
      console.info("[sync] entry pull page", { count: page.entries.length, durationMs: Math.round(performance.now() - started) });
      if (!page.hasMore) return;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 404 || status === 405) {
        await pullEntriesLegacy(db, mgmt, summary, signal);
        return;
      }
      if (status === 400 && cursor && !resetAttempted) {
        await resetEntrySyncCursor(db, mgmt.remote_id);
        await db.runAsync("DELETE FROM entry_sync_seen WHERE management_id = ?", mgmt.id);
        return pullEntries(db, mgmt, summary, signal, true);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function syncNow(db: SQLiteDatabase, options: SyncOptions = {}): Promise<SyncSummary> {
  const existing = activeSync;
  if (existing) return existing;

  const sync = (async () => {
    const { signal } = options;
    const generation = options.generation ?? getDbLockGeneration();
    const syncDb = createGenerationScopedDatabase(db, generation);
    const started = performance.now();
    const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0, errors: 0, cashflowChanged: 0, lifeFlowChanged: 0, pages: 0 };
    throwIfCancelled(signal);
    const scope = await buildSyncScope(syncDb);

    await pushManagements(syncDb, summary, scope, signal);
    throwIfCancelled(signal);
    await pushPendingManagementImages(syncDb, summary, signal);
    throwIfCancelled(signal);
    await pushCategories(syncDb, summary, scope, signal);
    throwIfCancelled(signal);
    await pushQuickFills(syncDb, summary, scope, signal);
    throwIfCancelled(signal);
    await pushOverallBudgets(syncDb, summary, scope, signal);
    throwIfCancelled(signal);
    await pushRecurringEntries(syncDb, summary, scope, signal);
    throwIfCancelled(signal);
    await pushEntries(syncDb, summary, scope, signal);
    throwIfCancelled(signal);

    await pullManagements(syncDb, summary, scope, signal);
    throwIfCancelled(signal);

    const localManagements = (await listLocalManagementsWithRemoteId(syncDb)).filter((management) =>
      scope.remoteManagementIds.has(management.remote_id),
    );
    throwIfCancelled(signal);

    const lifeFlowTask = (async () => {
      try {
        const lifeFlow = await reconcileLifeFlow(syncDb, signal);
        summary.pushed += lifeFlow.pushed;
        summary.pulled += lifeFlow.pulled;
        summary.lifeFlowChanged = lifeFlow.pushed + lifeFlow.pulled;
      } catch (error) {
        console.warn("[sync] lifeflow failed", error);
        summary.errors += 1;
      }
    })();

    const prefetchFailed = (label: string, error: unknown) => {
      console.warn(`[sync] prefetch ${label} failed`, error);
      summary.errors += 1;
    };

    const preFetched = await Promise.all(
      localManagements.map(async (mgmt) => {
        const [categories, quickFills, overallBudgets, recurring] = await Promise.all([
          listCategories(mgmt.remote_id, { signal }).catch((error) => {
            if (signal?.aborted) throw error;
            prefetchFailed("categories", error);
            return null;
          }),
          listQuickFills(mgmt.remote_id, { signal }).catch((error) => {
            if (signal?.aborted) throw error;
            prefetchFailed("quick-fills", error);
            return null;
          }),
          listOverallBudgets(mgmt.remote_id, { signal }).catch((error) => {
            if (signal?.aborted) throw error;
            prefetchFailed("overall budgets", error);
            return null;
          }),
          listRecurringEntries(mgmt.remote_id, { signal }).catch((error) => {
            if (signal?.aborted) throw error;
            prefetchFailed("recurring entries", error);
            return null;
          }),
        ]);
        return { mgmt, categories, quickFills, overallBudgets, recurring };
      }),
    );
    await lifeFlowTask;
    throwIfCancelled(signal);

    for (const { mgmt, categories, quickFills, overallBudgets, recurring } of preFetched) {
      throwIfCancelled(signal);
      await pullCategories(syncDb, mgmt, summary, signal, categories);
      throwIfCancelled(signal);
      await pullQuickFills(syncDb, mgmt, summary, signal, quickFills);
      throwIfCancelled(signal);
      await pullOverallBudgets(syncDb, mgmt, summary, signal, overallBudgets);
      throwIfCancelled(signal);
      await pullRecurringEntries(syncDb, mgmt, summary, signal, recurring);
    }

    for (const mgmt of localManagements) {
      throwIfCancelled(signal);
      await pullEntries(syncDb, mgmt, summary, signal);
    }

    throwIfCancelled(signal);
    if (summary.errors === 0) await setLastPulledAt(syncDb, nowIso());
    summary.cashflowChanged = Math.max(0, summary.pulled - summary.lifeFlowChanged);
    console.info("[sync] complete", { pushed: summary.pushed, pulled: summary.pulled, conflicts: summary.conflicts, errors: summary.errors, pages: summary.pages, durationMs: Math.round(performance.now() - started) });
    return summary;
  })();

  activeSync = sync;
  try {
    return await sync;
  } finally {
    if (activeSync === sync) activeSync = null;
  }
}
