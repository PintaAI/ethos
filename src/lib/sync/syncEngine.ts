import type { SQLiteDatabase } from "expo-sqlite";
import { ApiError } from "@/lib/api/client";
import { createEntry, deleteEntry, listEntries, updateEntry } from "@/lib/api/entries";
import { createManagement, deleteManagement, listManagements, updateManagement } from "@/lib/api/managements";
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

let activeSync: Promise<SyncSummary> | null = null;

export async function waitForSyncIdleAsync(): Promise<void> {
  if (!activeSync) return;
  await activeSync.catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Push phase
// ---------------------------------------------------------------------------

async function pushManagements(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  const dirty = await listDirty(db, "managements");
  if (dirty.length === 0) return;

  for (const row of dirty) {
    const local = row as unknown as ManagementRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          try {
            await deleteManagement(local.remote_id);
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
        const server = await createManagement(body);
        await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = localManagementToCreate(local);
          const server = await createManagement(body);
          await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = localManagementToUpdate(local);
          const server = await updateManagement(local.remote_id, body);
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

async function pushCategories(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  const dirty = await listDirty(db, "categories");
  if (dirty.length === 0) return;

  for (const row of dirty) {
    const local = row as unknown as CategoryRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteCategory(local.remote_id, mgmtRemote ?? undefined);
        }
        await hardDeleteById(db, "categories", local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localCategoryToCreate(db, local);
        if (!body) continue;
        const server = await createCategory(body);
        await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localCategoryToCreate(db, local);
          if (!body) continue;
          const server = await createCategory(body);
          await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localCategoryToUpdate(db, local);
          if (!body) continue;
          const server = await updateCategory(local.remote_id, body);
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

async function pushQuickFills(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  const dirty = await listDirty(db, "quick_fills");
  if (dirty.length === 0) return;

  for (const row of dirty) {
    const local = row as unknown as QuickFillRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteQuickFill(local.remote_id, mgmtRemote ?? undefined);
        }
        await hardDeleteById(db, "quick_fills", local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localQuickFillToCreate(db, local);
        if (!body) continue;
        const server = await createQuickFill(body);
        await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localQuickFillToCreate(db, local);
          if (!body) continue;
          const server = await createQuickFill(body);
          await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localQuickFillToUpdate(db, local);
          if (!body) continue;
          const server = await updateQuickFill(local.remote_id, body);
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

async function pushOverallBudgets(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  const dirty = await listDirty(db, "overall_budgets");
  if (dirty.length === 0) return;

  for (const row of dirty) {
    const local = row as unknown as OverallBudgetRow;
    try {
      if (local.sync_status === "deleted") {
        const mgmtRemote = await getManagementRemoteId(db, local.management_id);
        if (!mgmtRemote) continue;
        await deleteOverallBudget(local.period, mgmtRemote);
        await hardDeleteById(db, "overall_budgets", local.id);
        summary.pushed += 1;
        continue;
      }

      // Server upserts by (managementId, period), so pending and updated use the same PUT.
      const body = await localOverallBudgetToUpsert(db, local);
      if (!body) continue;
      const server = await saveOverallBudget(body);
      await markSynced(db, "overall_budgets", local.id, server.id, server.updatedAt ?? server.createdAt);
      summary.pushed += 1;
    } catch (error) {
      console.warn("[sync] push overall budget failed", local.id, error);
      summary.errors += 1;
    }
  }
}

async function pushRecurringEntries(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  const dirty = await listDirty(db, "recurring_entries");
  if (dirty.length === 0) return;

  for (const row of dirty) {
    const local = row as unknown as RecurringEntryRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteRecurringEntry(local.remote_id, mgmtRemote ?? undefined);
        }
        await hardDeleteById(db, "recurring_entries", local.id);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localRecurringToCreate(db, local);
        if (!body) continue;
        const server = await createRecurringEntry(body);
        await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localRecurringToCreate(db, local);
          if (!body) continue;
          const server = await createRecurringEntry(body);
          await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localRecurringToUpdate(db, local);
          if (!body) continue;
          const server = await updateRecurringEntry(local.remote_id, body);
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

async function pushEntries(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  const dirty = await listDirty(db, "entries");
  if (dirty.length === 0) return;

  for (const row of dirty) {
    const local = row as unknown as EntryRow;
    try {
      if (local.sync_status === "deleted") {
        if (local.remote_id) {
          const mgmtRemote = await getManagementRemoteId(db, local.management_id);
          await deleteEntry(local.remote_id, mgmtRemote ?? undefined);
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
        const server = await createEntry(body);
        await markSynced(db, "entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localEntryToCreate(db, local);
          if (!body) continue;
          const server = await createEntry(body);
          await markSynced(db, "entries", local.id, server.id, server.updatedAt ?? server.createdAt);
        } else {
          const body = await localEntryToUpdate(db, local);
          if (!body) continue;
          const server = await updateEntry(local.remote_id, body);
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
): Promise<void> {
  const localSynced = await db.getAllAsync<{ remote_id: string }>(
    `SELECT remote_id FROM ${table} WHERE remote_id IS NOT NULL AND sync_status = 'synced' AND management_id = ?`,
    localManagementId,
  );
  for (const row of localSynced) {
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

async function pullManagements(db: SQLiteDatabase, summary: SyncSummary): Promise<void> {
  let serverManagements: ServerManagement[];
  try {
    serverManagements = await listManagements();
  } catch (error) {
    console.warn("[sync] pull managements failed", error);
    summary.errors += 1;
    return;
  }

  const stamp = nowIso();
  for (const server of serverManagements) {
    try {
      const existing = await db.getFirstAsync<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM managements WHERE remote_id = ? LIMIT 1`,
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
        await upsertByRemoteId(db, "managements", server.id, fields);
        summary.pulled += 1;
      }
    } catch (error) {
      console.warn("[sync] pull management failed", server.id, error);
      summary.errors += 1;
    }
  }
}

async function pullCategories(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary): Promise<void> {
  let serverList: ServerCategory[];
  try {
    serverList = await listCategories(mgmt.remote_id);
  } catch (error) {
    console.warn("[sync] pull categories failed", mgmt.remote_id, error);
    summary.errors += 1;
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
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

  await deleteStaleChildren(db, "categories", mgmt.id, returnedIds, summary);
}

async function pullQuickFills(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary): Promise<void> {
  let serverList: ServerQuickFill[];
  try {
    serverList = await listQuickFills(mgmt.remote_id);
  } catch (error) {
    console.warn("[sync] pull quick fills failed", mgmt.remote_id, error);
    summary.errors += 1;
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
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

  await deleteStaleChildren(db, "quick_fills", mgmt.id, returnedIds, summary);
}

async function pullOverallBudgets(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary): Promise<void> {
  let serverList: ServerOverallBudget[];
  try {
    serverList = await listOverallBudgets(mgmt.remote_id);
  } catch (error) {
    console.warn("[sync] pull overall budgets failed", mgmt.remote_id, error);
    summary.errors += 1;
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
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

  await deleteStaleChildren(db, "overall_budgets", mgmt.id, returnedIds, summary);
}

async function pullRecurringEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary): Promise<void> {
  let serverList: ServerRecurringEntry[];
  try {
    serverList = await listRecurringEntries(mgmt.remote_id);
  } catch (error) {
    console.warn("[sync] pull recurring entries failed", mgmt.remote_id, error);
    summary.errors += 1;
    return;
  }

  const returnedIds = new Set<string>();
  const stamp = nowIso();
  for (const server of serverList) {
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

  await deleteStaleChildren(db, "recurring_entries", mgmt.id, returnedIds, summary);
}

async function pullEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary): Promise<void> {
  let serverEntries;
  try {
    serverEntries = await listEntries({ managementId: mgmt.remote_id, page_size: 1000 });
  } catch (error) {
    console.warn("[sync] pull entries failed", mgmt.remote_id, error);
    summary.errors += 1;
    return;
  }
  const returnedIds = new Set<string>();
  const stamp = nowIso();

  for (const server of serverEntries) {
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

export async function syncNow(db: SQLiteDatabase): Promise<SyncSummary> {
  if (activeSync) return activeSync;

  activeSync = (async () => {
    const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0, errors: 0 };

    await pushManagements(db, summary);
    await pushCategories(db, summary);
    await pushQuickFills(db, summary);
    await pushOverallBudgets(db, summary);
    await pushRecurringEntries(db, summary);
    await pushEntries(db, summary);

    await pullManagements(db, summary);

    const localManagements = await listLocalManagementsWithRemoteId(db);
    for (const mgmt of localManagements) {
      await pullCategories(db, mgmt, summary);
      await pullQuickFills(db, mgmt, summary);
      await pullOverallBudgets(db, mgmt, summary);
      await pullRecurringEntries(db, mgmt, summary);
    }

    for (const mgmt of localManagements) {
      await pullEntries(db, mgmt, summary);
    }

    await setLastPulledAt(db, nowIso());
    return summary;
  })();

  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}
