import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { CreateEntryBody, EntriesListResponse, ServerEntry, UpdateEntryBody } from "./types";

export type ListEntriesParams = {
  managementId?: string;
  page_size?: number;
  skip?: number;
  io?: "Income" | "Expenses";
  date?: string;
  created_by_id?: string;
};

export async function listEntries(params: ListEntriesParams = {}): Promise<ServerEntry[]> {
  const query: string[] = [];
  if (params.managementId) query.push(`management_id=${encodeURIComponent(params.managementId)}`);
  if (params.page_size !== undefined) query.push(`page_size=${params.page_size}`);
  if (params.skip !== undefined) query.push(`skip=${params.skip}`);
  if (params.io) query.push(`io=${params.io}`);
  if (params.date) query.push(`date=${encodeURIComponent(params.date)}`);
  if (params.created_by_id) query.push(`created_by_id=${encodeURIComponent(params.created_by_id)}`);

  const qs = query.length > 0 ? `?${query.join("&")}` : "";
  const payload = await apiGet<EntriesListResponse | ServerEntry[]>(`/entries${qs}`);

  if (Array.isArray(payload)) return payload;
  return payload.entries ?? [];
}

export async function listAllEntries(
  params: Omit<ListEntriesParams, "page_size" | "skip"> = {},
  init: RequestInit = {},
): Promise<ServerEntry[]> {
  const pageSize = 200;
  const entries: ServerEntry[] = [];
  let skip = 0;

  while (true) {
    const query: string[] = [];
    if (params.managementId) query.push(`management_id=${encodeURIComponent(params.managementId)}`);
    query.push(`page_size=${pageSize}`, `skip=${skip}`);
    if (params.io) query.push(`io=${params.io}`);
    if (params.date) query.push(`date=${encodeURIComponent(params.date)}`);
    if (params.created_by_id) query.push(`created_by_id=${encodeURIComponent(params.created_by_id)}`);

    const payload = await apiGet<EntriesListResponse | ServerEntry[]>(`/entries?${query.join("&")}`, init);
    const page = Array.isArray(payload) ? payload : (payload.entries ?? []);
    entries.push(...page);

    const hasMore = Array.isArray(payload) ? page.length === pageSize : payload.hasMore;
    if (!hasMore || page.length === 0) return entries;
    skip += page.length;
  }
}

export function createEntry(body: CreateEntryBody, init: RequestInit = {}): Promise<ServerEntry> {
  return apiPost<ServerEntry>("/entries", body, init);
}

export function updateEntry(id: string, body: UpdateEntryBody, init: RequestInit = {}): Promise<ServerEntry> {
  return apiPatch<ServerEntry>(`/entries/${encodeURIComponent(id)}`, body, init);
}

export function deleteEntry(id: string, managementId?: string, init: RequestInit = {}): Promise<void> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiDelete(`/entries/${encodeURIComponent(id)}${qs}`, init);
}
