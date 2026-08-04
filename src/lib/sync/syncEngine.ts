import type { SQLiteDatabase } from "expo-sqlite";
import { ApiError } from "@/lib/api/client";
import { createEntry, deleteEntry, listAllEntries, updateEntry } from "@/lib/api/entries";
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
} from "@/lib/api/types";
import {
  hardDeleteById,
  hardDeleteByRemoteId,
  listDirty,
  markSynced,
  setLastPulledAt,
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
  localEntryToUpdate,
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

export type SyncSummary = {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: number;
};

type SyncScope = {
  localManagementIds: Set<string>;
  remoteManagementIds: Set<string>;
};

export type SyncOptions = {
  signal?: AbortSignal;
};

function throwIfCancelled(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("Sync cancelled");
}

async function buildSyncScope(db: SQLiteDatabase): Promise<SyncScope> {
  const managements = await db.getAllAsync<{ id: string; remote_id: string | null }>(
    "SELECT id, remote_id FROM managements WHERE deleted_at IS NULL",
  );

  return {
    localManagementIds: new Set(managements.map((management) => management.id)),
    remoteManagementIds: new Set(
      managements
        .map((management) => management.remote_id)
        .filter((remoteId): remoteId is string => remoteId !== null),
    ),
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function hardDeleteManagementTree(db: SQLiteDatabase, managementId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM entries WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM recurring_entries WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM quick_fills WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM overall_budgets WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM categories WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM audit_snapshots WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM management_members WHERE management_id = ?", managementId);
    await db.runAsync("DELETE FROM managements WHERE id = ?", managementId);
  });
}

// ---------------------------------------------------------------------------
// Serialized execution — coalesce concurrent callers
// ---------------------------------------------------------------------------
// Per-DB-instance coalescing. Foreground sync (via SQLiteProvider) and
// background sync (via openDatabaseAsync) use distinct DB handles; keeping a
// single module-level promise would let one DB "borrow" the other's in-flight
// sync, operating on the wrong connection. Key on the handle instead.

const activeSyncs = new WeakMap<SQLiteDatabase, Promise<SyncSummary>>();

export async function waitForSyncIdleAsync(db: SQLiteDatabase): Promise<void> {
  const existing = activeSyncs.get(db);
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

  for (const row of dirty) {
    throwIfCancelled(signal);
    const local = row as unknown as EntryRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteEntry(local.remote_id, mgmtRemote ?? undefined, { signal });
          await hardDeleteById(db, "entries", local.id);
        } else {
          await hardDeleteById(db, "entries", local.id);
        }
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localEntryToCreate(db, local);
        if (!body) continue;
        const server = await createEntry(body, { signal });
        await markSynced(db, "entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localEntryToCreate(db, local);
          if (!body) continue;
          const server = await createEntry(body, { signal });
          await markSynced(db, "entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localEntryToUpdate(db, local);
          if (!body) continue;
          const server = await updateEntry(local.remote_id, body, { signal });
          await markSynced(db, "entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push entry failed", local.id, error);
      summary.errors += 1;
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

async function pullCategories(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal): Promise<void> {
  let serverList: ServerCategory[];
  try {
    serverList = await listCategories(mgmt.remote_id, { signal });
  } catch (error) {
    console.warn("[sync] pull categories failed", mgmt.remote_id, error);
    summary.errors += 1;
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

async function pullQuickFills(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal): Promise<void> {
  let serverList: ServerQuickFill[];
  try {
    serverList = await listQuickFills(mgmt.remote_id, { signal });
  } catch (error) {
    console.warn("[sync] pull quick fills failed", mgmt.remote_id, error);
    summary.errors += 1;
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

async function pullOverallBudgets(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal): Promise<void> {
  let serverList: ServerOverallBudget[];
  try {
    serverList = await listOverallBudgets(mgmt.remote_id, { signal });
  } catch (error) {
    console.warn("[sync] pull overall budgets failed", mgmt.remote_id, error);
    summary.errors += 1;
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

async function pullRecurringEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal): Promise<void> {
  let serverList: ServerRecurringEntry[];
  try {
    serverList = await listRecurringEntries(mgmt.remote_id, { signal });
  } catch (error) {
    console.warn("[sync] pull recurring entries failed", mgmt.remote_id, error);
    summary.errors += 1;
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

async function pullEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal): Promise<void> {
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

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function syncNow(db: SQLiteDatabase, options: SyncOptions = {}): Promise<SyncSummary> {
  const existing = activeSyncs.get(db);
  if (existing) return existing;

  const sync = (async () => {
    const { signal } = options;
    const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0, errors: 0 };
    throwIfCancelled(signal);
    const scope = await buildSyncScope(db);

    await pushManagements(db, summary, scope, signal);
    throwIfCancelled(signal);
    await pushPendingManagementImages(db, summary, signal);
    throwIfCancelled(signal);
    await pushCategories(db, summary, scope, signal);
    throwIfCancelled(signal);
    await pushQuickFills(db, summary, scope, signal);
    throwIfCancelled(signal);
    await pushOverallBudgets(db, summary, scope, signal);
    throwIfCancelled(signal);
    await pushRecurringEntries(db, summary, scope, signal);
    throwIfCancelled(signal);
    await pushEntries(db, summary, scope, signal);
    throwIfCancelled(signal);

    await pullManagements(db, summary, scope, signal);
    throwIfCancelled(signal);

    const localManagements = (await listLocalManagementsWithRemoteId(db)).filter((management) =>
      scope.remoteManagementIds.has(management.remote_id),
    );
    for (const mgmt of localManagements) {
      throwIfCancelled(signal);
      await pullCategories(db, mgmt, summary, signal);
      throwIfCancelled(signal);
      await pullQuickFills(db, mgmt, summary, signal);
      throwIfCancelled(signal);
      await pullOverallBudgets(db, mgmt, summary, signal);
      throwIfCancelled(signal);
      await pullRecurringEntries(db, mgmt, summary, signal);
    }

    for (const mgmt of localManagements) {
      throwIfCancelled(signal);
      await pullEntries(db, mgmt, summary, signal);
    }

    throwIfCancelled(signal);
    await setLastPulledAt(db, nowIso());
    return summary;
  })();

  activeSyncs.set(db, sync);
  try {
    return await sync;
  } finally {
    activeSyncs.delete(db);
  }
}
