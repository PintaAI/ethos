import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { ServerCategory } from "./types";

export function listCategories(managementId?: string, init: RequestInit = {}): Promise<ServerCategory[]> {
  const qs = managementId ? `?detailed=true&management_id=${encodeURIComponent(managementId)}` : "?detailed=true";
  return apiGet<ServerCategory[]>(`/categories${qs}`, init);
}

export function createCategory(body: {
  clientId?: string;
  name: string;
  color?: string;
  icon?: string;
  budgets?: Record<string, number>;
  managementId?: string;
}, init: RequestInit = {}): Promise<ServerCategory> {
  return apiPost<ServerCategory>("/categories", body, init);
}

export function updateCategory(
  id: string,
  body: Partial<{ name: string; color: string; icon: string; budgets: Record<string, number>; managementId: string }>,
  init: RequestInit = {},
): Promise<ServerCategory> {
  return apiPatch<ServerCategory>(`/categories/${encodeURIComponent(id)}`, body, init);
}

export function deleteCategory(id: string, managementId?: string, init: RequestInit = {}): Promise<void> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiDelete(`/categories/${encodeURIComponent(id)}${qs}`, init);
}
