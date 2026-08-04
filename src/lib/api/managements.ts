import { apiDelete, apiGet, apiPatch, apiPost, apiUploadFile } from "./client";
import type { ServerCurrentManagement, ServerManagement, ServerManagementImageUpdate, ServerManagementInvite } from "./types";
import type { PickedUploadImage } from "../imageUpload";

export function listManagements(init: RequestInit = {}): Promise<ServerManagement[]> {
  return apiGet<ServerManagement[]>("/managements", init);
}

export function createManagement(body: { name: string; clientId?: string }, init: RequestInit = {}): Promise<ServerManagement> {
  return apiPost<ServerManagement>("/managements", body, init);
}

export function getActiveManagement(managementId?: string): Promise<ServerCurrentManagement | null> {
  const qs = managementId ? `?management_id=${encodeURIComponent(managementId)}` : "";
  return apiGet<ServerCurrentManagement | null>(`/managements/current${qs}`);
}

export function updateManagement(id: string, body: { name: string }, init: RequestInit = {}): Promise<ServerManagement> {
  return apiPatch<ServerManagement>(`/managements/${encodeURIComponent(id)}`, body, init);
}

export function deleteManagement(id: string, init: RequestInit = {}): Promise<void> {
  return apiDelete(`/managements/${encodeURIComponent(id)}`, init);
}

export function createManagementInvite(managementId: string): Promise<ServerManagementInvite> {
  return apiPost<ServerManagementInvite>(`/managements/${encodeURIComponent(managementId)}/invites`);
}

export function updateManagementImage(managementId: string, image: PickedUploadImage, signal?: AbortSignal): Promise<ServerManagementImageUpdate> {
  return apiUploadFile<ServerManagementImageUpdate>(`/managements/${encodeURIComponent(managementId)}/image`, image, {
    method: "PUT",
    fieldName: "image",
    signal,
  });
}

export function deleteManagementMember(managementId: string, memberId: string): Promise<void> {
  return apiDelete(`/managements/${encodeURIComponent(managementId)}/members/${encodeURIComponent(memberId)}`);
}
