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
import { syncRetryDecision } from "./syncPolicy";
import { mapConcurrent } from "./concurrent";
import { syncMutationId } from "./syncIdentity";
import { getSyncCapabilities, getSyncManifest, type SyncManifest, type MetadataArea } from "@/lib/api/sync";
import { bindSyncOwner } from "./syncStorage";

export type SyncSummary = {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: number;
  cashflowChanged: number;
  lifeFlowChanged: number;
  pages: number;
  issueAreas: SyncIssueArea[];
  retryable?: boolean;
  retryAfterMs?: number;
  automaticRetryBlocked?: boolean;
};

export type SyncIssueArea =
  | "connection"
  | "wallets"
  | "walletImages"
  | "categories"
  | "quickFills"
  | "budgets"
  | "recurringEntries"
  | "entries"
  | "lifeFlow";

function recordSyncIssue(summary: SyncSummary, area: SyncIssueArea, error?: unknown, retrySafe = true) {
  if (error instanceof Error && error.name === "DbOperationInvalidatedError") throw error;
  summary.errors += 1;
  if (!summary.issueAreas.includes(area)) summary.issueAreas.push(area);
  const decision = syncRetryDecision(error);
  if (!retrySafe) summary.automaticRetryBlocked = true;
  if (decision.retry) summary.retryable = true;
  summary.retryAfterMs = Math.max(summary.retryAfterMs ?? 0, decision.retryAfterMs ?? 0);
}

function recordCashflowPull(summary: SyncSummary, changes: number) {
  summary.pulled += changes;
  summary.cashflowChanged += changes;
}

type SyncScope = {
  localManagementIds: Set<string>;
  remoteManagementIds: Set<string>;
};

export type SyncOptions = {
  accountId?: string;
  signal?: AbortSignal;
  generation?: number;
};

const LOCKED_DB_METHODS = new Set([
  "execAsync", "getAllAsync", "getEachAsync", "getFirstAsync", "prepareAsync", "runAsync",
  "withExclusiveTransactionAsync", "withTransactionAsync",
]);

export function createGenerationScopedDatabase(db: SQLiteDatabase, generation: number, signal?: AbortSignal): SQLiteDatabase {
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !LOCKED_DB_METHODS.has(property) || typeof value !== "function") return value;
      return (...args: unknown[]) => withDbLock(
        () => { throwIfCancelled(signal); return Reflect.apply(value, target, args) as Promise<unknown>; },
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

async function deleteRemote(remove: () => Promise<void>) {
  try { await remove(); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }
}

async function hardDeleteManagementTree(db: SQLiteDatabase, sent: ManagementRow): Promise<number> {
  let changes = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const current = await txn.getFirstAsync<Record<string, unknown>>("SELECT * FROM managements WHERE id = ?", sent.id);
    if (!current || Object.entries(sent).some(([column, value]) => current[column] !== value)) return;
    const managementId = sent.id;
    await txn.runAsync("DELETE FROM entries WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM recurring_entries WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM quick_fills WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM overall_budgets WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM categories WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM audit_snapshots WHERE management_id = ?", managementId);
    await txn.runAsync("DELETE FROM management_members WHERE management_id = ?", managementId);
    changes = (await txn.runAsync("DELETE FROM managements WHERE id = ? AND sync_status = 'deleted'", managementId)).changes;
  });
  return changes;
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
            if (status === 404) {
              // Already gone on the server.
            } else {
              throw error;
            }
          }
        }
        summary.cashflowChanged += await hardDeleteManagementTree(db, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = localManagementToCreate(local);
        const server = await createManagement(body, { signal });
        summary.cashflowChanged += await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = localManagementToCreate(local);
          const server = await createManagement(body, { signal });
          summary.cashflowChanged += await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        } else {
          const body = localManagementToUpdate(local);
          const server = await updateManagement(local.remote_id, body, { signal });
          summary.cashflowChanged += await markSynced(db, "managements", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push management failed", local.id, error);
      recordSyncIssue(summary, "wallets", error, !!local.remote_id || local.sync_status === "deleted");
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
      let changed = 0;
      await db.withExclusiveTransactionAsync(async (txn) => {
        changed = (await txn.runAsync(
          "UPDATE managements SET image = ?, image_theme_json = ? WHERE id = ? AND image = ? AND deleted_at IS NULL",
          serverImage,
          imageThemeJson,
          management.id,
          management.image,
        )).changes;
      });
      if (changed > 0) deleteOwnedWalletImage(management.image);
      summary.cashflowChanged += changed;
      summary.pushed += 1;
    } catch (error) {
      console.warn("[sync] push wallet image failed", management.id, error);
      recordSyncIssue(summary, "walletImages", error);
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
          await deleteRemote(() => deleteCategory(local.remote_id!, mgmtRemote ?? undefined, { signal }));
        }
        summary.cashflowChanged += await hardDeleteById(db, "categories", local.id, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localCategoryToCreate(db, local);
        if (!body) continue;
        const server = await createCategory(body, { signal });
        summary.cashflowChanged += await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localCategoryToCreate(db, local);
          if (!body) continue;
          const server = await createCategory(body, { signal });
          summary.cashflowChanged += await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        } else {
          const body = await localCategoryToUpdate(db, local);
          if (!body) continue;
          const server = await updateCategory(local.remote_id, body, { signal });
          summary.cashflowChanged += await markSynced(db, "categories", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push category failed", local.id, error);
      recordSyncIssue(summary, "categories", error, !!local.remote_id || local.sync_status === "deleted");
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
          await deleteRemote(() => deleteQuickFill(local.remote_id!, mgmtRemote ?? undefined, { signal }));
        }
        summary.cashflowChanged += await hardDeleteById(db, "quick_fills", local.id, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localQuickFillToCreate(db, local);
        if (!body) continue;
        const server = await createQuickFill(body, { signal });
        summary.cashflowChanged += await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localQuickFillToCreate(db, local);
          if (!body) continue;
          const server = await createQuickFill(body, { signal });
          summary.cashflowChanged += await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        } else {
          const body = await localQuickFillToUpdate(db, local);
          if (!body) continue;
          const server = await updateQuickFill(local.remote_id, body, { signal });
          summary.cashflowChanged += await markSynced(db, "quick_fills", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push quick fill failed", local.id, error);
      recordSyncIssue(summary, "quickFills", error, !!local.remote_id || local.sync_status === "deleted");
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
        await deleteRemote(() => deleteOverallBudget(local.period, mgmtRemote, { signal }));
        summary.cashflowChanged += await hardDeleteById(db, "overall_budgets", local.id, local);
        summary.pushed += 1;
        continue;
      }

      // Server upserts by (managementId, period), so pending and updated use the same PUT.
      const body = await localOverallBudgetToUpsert(db, local);
      if (!body) continue;
      const server = await saveOverallBudget(body, { signal });
      summary.cashflowChanged += await markSynced(db, "overall_budgets", local.id, server.id, server.updatedAt ?? server.createdAt, local);
      summary.pushed += 1;
    } catch (error) {
      console.warn("[sync] push overall budget failed", local.id, error);
      recordSyncIssue(summary, "budgets", error);
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
          await deleteRemote(() => deleteRecurringEntry(local.remote_id!, mgmtRemote ?? undefined, { signal }));
        }
        summary.cashflowChanged += await hardDeleteById(db, "recurring_entries", local.id, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "pending") {
        const body = await localRecurringToCreate(db, local);
        if (!body) continue;
        const server = await createRecurringEntry(body, { signal });
        summary.cashflowChanged += await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        summary.pushed += 1;
        continue;
      }

      if (local.sync_status === "updated") {
        if (!local.remote_id) {
          const body = await localRecurringToCreate(db, local);
          if (!body) continue;
          const server = await createRecurringEntry(body, { signal });
          summary.cashflowChanged += await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        } else {
          const body = await localRecurringToUpdate(db, local);
          if (!body) continue;
          const server = await updateRecurringEntry(local.remote_id, body, { signal });
          summary.cashflowChanged += await markSynced(db, "recurring_entries", local.id, server.id, server.updatedAt ?? server.createdAt, local);
        }
        summary.pushed += 1;
        continue;
      }
    } catch (error) {
      console.warn("[sync] push recurring entry failed", local.id, error);
      recordSyncIssue(summary, "recurringEntries", error, !!local.remote_id || local.sync_status === "deleted");
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
        summary.cashflowChanged += await hardDeleteById(db, "entries", local.id, local);
        summary.pushed += 1;
      } else {
        const mutation = { operation: "delete" as const, entryId: local.remote_id };
        prepared.push({ local, managementId, mutation: { ...mutation, mutationId: syncMutationId(local.id, local.updated_at, mutation) } });
      }
      continue;
    }
    const body = await localEntryToCreate(db, local);
    if (!body) continue;
    const category = local.category_id
      ? await db.getFirstAsync<{ remote_id: string | null }>("SELECT remote_id FROM categories WHERE id = ?", local.category_id)
      : null;
    const { category: _category, managementId: _managementId, clientId: _clientId, ...syncData } = body;
    const mutation = {
      operation: local.remote_id ? "update" as const : "create" as const,
      entryId: local.remote_id ?? undefined,
      clientId: local.remote_id ? undefined : local.id,
      data: { ...syncData, categoryId: category?.remote_id ?? null },
    };
    prepared.push({
      local,
      managementId,
      mutation: {
        ...mutation,
        mutationId: syncMutationId(local.id, local.updated_at, mutation),
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
              recordSyncIssue(summary, "entries");
              continue;
            }
            if (item.local.sync_status === "deleted") {
              summary.cashflowChanged += await hardDeleteById(txn, "entries", item.local.id, item.local);
            } else {
              summary.cashflowChanged += await markSynced(txn, "entries", item.local.id, result.entry.id, result.entry.updatedAt, item.local);
            }
            summary.pushed += 1;
          }
        });
        console.info("[sync] entry push batch", { count: chunk.length, durationMs: Math.round(performance.now() - batchStarted) });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        if (status !== 404 && status !== 405) {
          throwIfCancelled(signal);
          recordSyncIssue(summary, "entries", error);
          return;
        }
        // Controlled compatibility fallback for servers that predate the batch endpoint.
        for (const item of chunk) {
          const { local } = item;
          try {
            if (local.sync_status === "deleted") {
              if (local.remote_id) await deleteRemote(() => deleteEntry(local.remote_id!, item.managementId, { signal }));
              summary.cashflowChanged += await hardDeleteById(db, "entries", local.id, local);
            } else {
              const body = await localEntryToCreate(db, local);
              if (!body) continue;
              const server = local.remote_id ? await updateEntry(local.remote_id, body, { signal }) : await createEntry(body, { signal });
              summary.cashflowChanged += await markSynced(db, "entries", local.id, server.id, server.updatedAt ?? server.createdAt, local);
            }
            summary.pushed += 1;
          } catch (legacyError) {
            console.warn("[sync] legacy push entry failed", local.id, legacyError);
            recordSyncIssue(summary, "entries", legacyError, !!local.remote_id || local.sync_status === "deleted");
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
      recordCashflowPull(summary, await hardDeleteByRemoteId(db, table, row.remote_id));
    } catch (error) {
      console.warn(`[sync] delete stale local ${table} failed`, row.remote_id, error);
      recordSyncIssue(summary, table === "categories" ? "categories" : table === "quick_fills" ? "quickFills" : table === "overall_budgets" ? "budgets" : "recurringEntries", error);
    }
  }
}

async function pullManagements(db: SQLiteDatabase, summary: SyncSummary, scope: SyncScope, signal?: AbortSignal): Promise<void> {
  let serverManagements: ServerManagement[];
  try {
    serverManagements = await listManagements({ signal });
  } catch (error) {
    console.warn("[sync] pull managements failed", error);
    recordSyncIssue(summary, "wallets", error);
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
        recordCashflowPull(summary, await upsertByRemoteId(db, "managements", server.id, fields));
        continue;
      }
      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverManagementToLocal(server, stamp);
        const mutable = fields as Partial<ManagementUpsertFields>;
        delete mutable.id;
        if (isOwnedWalletImage(existing.image)) {
          delete mutable.image;
        }
        recordCashflowPull(summary, await upsertByRemoteId(db, "managements", server.id, fields));
      }
    } catch (error) {
      console.warn("[sync] pull management failed", server.id, error);
      recordSyncIssue(summary, "wallets", error);
    }
  }
}

async function pullCategories(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerCategory[] | null, authoritative = false): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listCategories(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull categories failed", mgmt.remote_id, error);
      recordSyncIssue(summary, "categories", error);
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
        recordCashflowPull(summary, await upsertByRemoteId(db, "categories", server.id, fields, authoritative));
        continue;
      }
      if (authoritative || lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverCategoryToLocal(server, mgmt.id, stamp);
        const mutable = fields as Partial<CategoryUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        recordCashflowPull(summary, await upsertByRemoteId(db, "categories", server.id, fields, authoritative));
      }
    } catch (error) {
      console.warn("[sync] pull category failed", server.id, error);
      recordSyncIssue(summary, "categories", error);
    }
  }

  await deleteStaleChildren(db, "categories", mgmt.id, returnedIds, summary, signal);
}

async function pullQuickFills(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerQuickFill[] | null, authoritative = false): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listQuickFills(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull quick fills failed", mgmt.remote_id, error);
      recordSyncIssue(summary, "quickFills", error);
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
        recordCashflowPull(summary, await upsertByRemoteId(db, "quick_fills", server.id, fields, authoritative));
        continue;
      }
      if (authoritative || lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverQuickFillToLocal(server, mgmt.id, localCategoryId, stamp);
        const mutable = fields as Partial<QuickFillUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        recordCashflowPull(summary, await upsertByRemoteId(db, "quick_fills", server.id, fields, authoritative));
      }
    } catch (error) {
      console.warn("[sync] pull quick fill failed", server.id, error);
      recordSyncIssue(summary, "quickFills", error);
    }
  }

  await deleteStaleChildren(db, "quick_fills", mgmt.id, returnedIds, summary, signal);
}

async function pullOverallBudgets(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerOverallBudget[] | null, authoritative = false): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listOverallBudgets(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull overall budgets failed", mgmt.remote_id, error);
      recordSyncIssue(summary, "budgets", error);
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
        recordCashflowPull(summary, await upsertByRemoteId(db, "overall_budgets", server.id, fields, authoritative));
        continue;
      }
      if (authoritative || lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverOverallBudgetToLocal(server, mgmt.id, stamp);
        const mutable = fields as Partial<OverallBudgetUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        recordCashflowPull(summary, await upsertByRemoteId(db, "overall_budgets", server.id, fields, authoritative));
      }
    } catch (error) {
      console.warn("[sync] pull overall budget failed", server.id, error);
      recordSyncIssue(summary, "budgets", error);
    }
  }

  await deleteStaleChildren(db, "overall_budgets", mgmt.id, returnedIds, summary, signal);
}

async function pullRecurringEntries(db: SQLiteDatabase, mgmt: ManagementLite, summary: SyncSummary, signal?: AbortSignal, serverList?: ServerRecurringEntry[] | null, authoritative = false): Promise<void> {
  if (serverList === undefined) {
    try {
      serverList = await listRecurringEntries(mgmt.remote_id, { signal });
    } catch (error) {
      console.warn("[sync] pull recurring entries failed", mgmt.remote_id, error);
      recordSyncIssue(summary, "recurringEntries", error);
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
        recordCashflowPull(summary, await upsertByRemoteId(db, "recurring_entries", server.id, fields, authoritative));
        continue;
      }
      if (authoritative || lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverRecurringToLocal(server, mgmt.id, localCategoryId, stamp);
        const mutable = fields as Partial<RecurringEntryUpsertFields>;
        delete mutable.id;
        delete mutable.management_id;
        recordCashflowPull(summary, await upsertByRemoteId(db, "recurring_entries", server.id, fields, authoritative));
      }
    } catch (error) {
      console.warn("[sync] pull recurring entry failed", server.id, error);
      recordSyncIssue(summary, "recurringEntries", error);
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
    recordSyncIssue(summary, "entries", error);
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
        recordCashflowPull(summary, await upsertByRemoteId(db, "entries", server.id, fields));
        continue;
      }

      if (lwwNewer(server.updatedAt, existing.updated_at)) {
        const fields = serverEntryToLocal(server, mgmt.id, stamp);
        delete (fields as { id?: string }).id;
        delete (fields as { management_id?: string }).management_id;
        if (server.category) {
          fields.category_id = await resolveCategoryIdByName(db, mgmt.id, server.category);
        }
        recordCashflowPull(summary, await upsertByRemoteId(db, "entries", server.id, fields));
      }
    } catch (error) {
      console.warn("[sync] pull entry failed", server.id, error);
      recordSyncIssue(summary, "entries", error);
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
      recordCashflowPull(summary, await hardDeleteByRemoteId(db, "entries", row.remote_id));
    } catch (error) {
      console.warn("[sync] delete stale local entry failed", row.remote_id, error);
      recordSyncIssue(summary, "entries", error);
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
      if (local && local.sync_status !== "synced") {
        summary.conflicts += 1;
        continue;
      }
      if (server.deletedAt) {
        if (local?.sync_status === "synced" || (local && serverTime > localTime)) {
          const deleted = await txn.runAsync("DELETE FROM entries WHERE id = ?", local.id);
          recordCashflowPull(summary, deleted.changes);
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
        recordCashflowPull(summary, updated.changes);
      } else {
        await txn.runAsync(
          `INSERT INTO entries (id, remote_id, name, nominal, original_nominal, original_currency, exchange_rate_to_idr,
           exchange_rate_at, category_id, date, io, management_id, created_by_id, is_reconciliation, created_at, updated_at,
           deleted_at, sync_status, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, 'synced', ?)`,
          `entry-${server.id}`, server.id, server.name, server.nominal, server.originalNominal, server.originalCurrency,
          server.exchangeRateToIdr, server.exchangeRateAt, server.categoryId ? categoryByRemote.get(server.categoryId) ?? null : null,
          server.date ?? "", server.io, mgmt.id, server.createdAt, server.updatedAt, server.updatedAt,
        );
        recordCashflowPull(summary, 1);
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
      recordCashflowPull(summary, removed.changes);
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
      throwIfCancelled(signal);
      recordSyncIssue(summary, "entries", error);
      return;
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
    const syncDb = createGenerationScopedDatabase(db, generation, signal);
    const started = performance.now();
    const summary: SyncSummary = {
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: 0,
      cashflowChanged: 0,
      lifeFlowChanged: 0,
      pages: 0,
      issueAreas: [],
    };
    throwIfCancelled(signal);
    const capabilities = await getSyncCapabilities(signal);
    if (options.accountId && capabilities.accountId && capabilities.accountId !== options.accountId) throw new ApiError(401, "Sync account changed");
    const accountId = capabilities.accountId ?? options.accountId;
    if (accountId) await bindSyncOwner(syncDb, accountId);
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
        const lifeFlow = await reconcileLifeFlow(syncDb, signal, capabilities.lifeFlow === 2);
        summary.pushed += lifeFlow.pushed;
        summary.pulled += lifeFlow.pulled;
        summary.lifeFlowChanged = lifeFlow.changed;
      } catch (error) {
        console.warn("[sync] lifeflow failed", error);
        recordSyncIssue(summary, "lifeFlow", error);
      }
    })();

    const prefetchFailed = (label: string, area: SyncIssueArea, error: unknown) => {
      console.warn(`[sync] prefetch ${label} failed`, error);
      recordSyncIssue(summary, area, error);
    };

    const metadata: {
      mgmt: ManagementLite;
      categories: ServerCategory[] | null;
      quickFills: ServerQuickFill[] | null;
      overallBudgets: ServerOverallBudget[] | null;
      recurring: ServerRecurringEntry[] | null;
      manifest: SyncManifest | null;
      skipped: Set<MetadataArea>;
    }[] = localManagements.map((mgmt) => ({ mgmt, categories: null, quickFills: null, overallBudgets: null, recurring: null, manifest: null, skipped: new Set<MetadataArea>() }));
    const fetchMetadata = async <T>(label: string, area: SyncIssueArea, fetcher: () => Promise<T>): Promise<T | null> => {
      throwIfCancelled(signal);
      try { return await fetcher(); }
      catch (error) {
        throwIfCancelled(signal);
        prefetchFailed(label, area, error);
        return null;
      }
    };
    // Three metadata requests across all wallets, plus independent LifeFlow.
    // A single wallet still fetches its independent lists concurrently.
    const prefetchTask = (async () => {
    if (capabilities.metadata === 1) {
      await mapConcurrent(metadata, 3, async (record) => {
        record.manifest = await fetchMetadata("manifest", "wallets", () => getSyncManifest(record.mgmt.remote_id, signal));
        if (!record.manifest) return;
        const versions = await syncDb.getAllAsync<{ area: MetadataArea; token: string }>("SELECT area, token FROM sync_metadata_versions WHERE management_id = ?", record.mgmt.id);
        for (const version of versions) if (record.manifest[version.area] === version.token) record.skipped.add(version.area);
      });
    }
    const jobs = metadata.flatMap((record) => [
      async () => { if (!record.skipped.has("categories")) record.categories = await fetchMetadata("categories", "categories", () => listCategories(record.mgmt.remote_id, { signal })); },
      async () => { if (!record.skipped.has("quickFills")) record.quickFills = await fetchMetadata("quick-fills", "quickFills", () => listQuickFills(record.mgmt.remote_id, { signal })); },
      async () => { if (!record.skipped.has("budgets")) record.overallBudgets = await fetchMetadata("overall budgets", "budgets", () => listOverallBudgets(record.mgmt.remote_id, { signal })); },
      async () => { if (!record.skipped.has("recurring")) record.recurring = await fetchMetadata("recurring entries", "recurringEntries", () => listRecurringEntries(record.mgmt.remote_id, { signal })); },
    ]);
    await mapConcurrent(jobs, 3, (job) => job());
    return metadata;
    })();
    const [metadataResult, lifeFlowResult] = await Promise.allSettled([prefetchTask, lifeFlowTask]);
    if (metadataResult.status === "rejected") throw metadataResult.reason;
    if (lifeFlowResult.status === "rejected") throw lifeFlowResult.reason;
    const preFetched = metadataResult.value;
    throwIfCancelled(signal);

    for (const record of preFetched) {
      const { mgmt, categories, quickFills, overallBudgets, recurring, manifest, skipped } = record;
      const applyMetadata = async (area: MetadataArea, list: unknown[] | null, apply: () => Promise<void>) => {
        throwIfCancelled(signal);
        if (skipped.has(area) || list === null) return;
        const errors = summary.errors;
        await apply();
        if (manifest && summary.errors === errors) await syncDb.runAsync("INSERT INTO sync_metadata_versions VALUES (?, ?, ?) ON CONFLICT(management_id, area) DO UPDATE SET token = excluded.token", mgmt.id, area, manifest[area]);
      };
      await applyMetadata("categories", categories, () => pullCategories(syncDb, mgmt, summary, signal, categories, !!manifest));
      await applyMetadata("quickFills", quickFills, () => pullQuickFills(syncDb, mgmt, summary, signal, quickFills, !!manifest));
      await applyMetadata("budgets", overallBudgets, () => pullOverallBudgets(syncDb, mgmt, summary, signal, overallBudgets, !!manifest));
      await applyMetadata("recurring", recurring, () => pullRecurringEntries(syncDb, mgmt, summary, signal, recurring, !!manifest));
    }

    for (const mgmt of localManagements) {
      throwIfCancelled(signal);
      await pullEntries(syncDb, mgmt, summary, signal);
    }

    throwIfCancelled(signal);
    if (summary.errors === 0) await setLastPulledAt(syncDb, nowIso());
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
