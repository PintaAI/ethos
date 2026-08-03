import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { ServerQuickFill } from "./types";

export function listQuickFills(managementId?: string, init: RequestInit = {}): Promise<ServerQuickFill[]> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiGet<ServerQuickFill[]>(`/quick-fills${qs}`, init);
}

export function createQuickFill(body: {
  clientId?: string;
  name: string;
  nominal: number;
  categoryId?: string;
  managementId?: string;
}, init: RequestInit = {}): Promise<ServerQuickFill> {
  return apiPost<ServerQuickFill>("/quick-fills", body, init);
}

export function updateQuickFill(id: string, body: Partial<{ name: string; nominal: number; categoryId: string }>, init: RequestInit = {}): Promise<ServerQuickFill> {
  return apiPatch<ServerQuickFill>(`/quick-fills/${encodeURIComponent(id)}`, body, init);
}

export function deleteQuickFill(id: string, managementId?: string, init: RequestInit = {}): Promise<void> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiDelete(`/quick-fills/${encodeURIComponent(id)}${qs}`, init);
}
