import { File, UploadType } from "expo-file-system";

import { authBaseURL, authClient } from "@/lib/auth-client";

export const apiBaseURL = `${authBaseURL}/api/v1`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const API_TIMEOUT = 30000;

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookie = authClient.getCookie();
  const isMultipart = typeof FormData !== "undefined" && init.body instanceof FormData;

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, API_TIMEOUT);

  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeoutId);
      abortFromCaller();
    } else {
      callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  try {
    const res = await fetch(`${apiBaseURL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(init.headers ?? {}),
      },
      credentials: "omit",
    });
    const text = await res.text();
    let json: { data?: T; error?: string } = {};
    if (text) {
      try {
        json = JSON.parse(text) as { data?: T; error?: string };
      } catch {
        json = {};
      }
    }
    if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText);
    return json.data as T;
  } catch (error) {
    if (didTimeout) {
      throw new ApiError(408, "Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export function apiGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiUploadFile<T>(
  path: string,
  file: { uri: string; type: string },
  init: { fieldName: string; method?: "POST" | "PUT" | "PATCH"; parameters?: Record<string, string>; signal?: AbortSignal },
): Promise<T> {
  const cookie = authClient.getCookie();
  const upload = new File(file.uri).createUploadTask(`${apiBaseURL}${path}`, {
    httpMethod: init.method ?? "POST",
    uploadType: UploadType.MULTIPART,
    fieldName: init.fieldName,
    mimeType: file.type,
    parameters: init.parameters,
    headers: cookie ? { Cookie: cookie } : undefined,
    signal: init.signal,
  });
  const result = await upload.uploadAsync();
  let json: { data?: T; error?: string } = {};
  if (result.body) {
    try {
      json = JSON.parse(result.body) as { data?: T; error?: string };
    } catch {
      json = {};
    }
  }
  if (result.status < 200 || result.status >= 300) throw new ApiError(result.status, json.error ?? "Upload failed");
  return json.data as T;
}

export function apiDelete(path: string, init: RequestInit = {}): Promise<void> {
  return apiFetch<void>(path, { ...init, method: "DELETE" });
}
