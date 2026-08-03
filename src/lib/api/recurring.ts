import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { RecurringFrequency, ServerRecurringEntry } from "./types";

export function listRecurringEntries(managementId?: string, init: RequestInit = {}): Promise<ServerRecurringEntry[]> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiGet<ServerRecurringEntry[]>(`/recurring${qs}`, init);
}

export function createRecurringEntry(body: {
  clientId?: string;
  name: string;
  nominal: number;
  io: "Income" | "Expenses";
  frequency: RecurringFrequency;
  startDate: string;
  categoryId?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: string;
  managementId?: string;
}, init: RequestInit = {}): Promise<ServerRecurringEntry> {
  return apiPost<ServerRecurringEntry>("/recurring", body, init);
}

export function updateRecurringEntry(id: string, body: Partial<{
  name: string;
  nominal: number;
  io: "Income" | "Expenses";
    frequency: RecurringFrequency;
    startDate: string;
  categoryId: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  endDate: string | null;
}>, init: RequestInit = {}): Promise<ServerRecurringEntry> {
  return apiPatch<ServerRecurringEntry>(`/recurring/${encodeURIComponent(id)}`, body, init);
}

export function deleteRecurringEntry(id: string, managementId?: string, init: RequestInit = {}): Promise<void> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiDelete(`/recurring/${encodeURIComponent(id)}${qs}`, init);
}
