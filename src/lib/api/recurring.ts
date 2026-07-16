import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { RecurringFrequency, ServerRecurringEntry } from "./types";

export function listRecurringEntries(managementId?: string): Promise<ServerRecurringEntry[]> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiGet<ServerRecurringEntry[]>(`/recurring${qs}`);
}

export function createRecurringEntry(body: {
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
}): Promise<ServerRecurringEntry> {
  return apiPost<ServerRecurringEntry>("/recurring", body);
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
}>): Promise<ServerRecurringEntry> {
  return apiPatch<ServerRecurringEntry>(`/recurring/${encodeURIComponent(id)}`, body);
}

export function deleteRecurringEntry(id: string, managementId?: string): Promise<void> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiDelete(`/recurring/${encodeURIComponent(id)}${qs}`);
}
