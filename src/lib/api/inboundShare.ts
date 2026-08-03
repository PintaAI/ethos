import { apiFetch, apiUploadFile } from "@/lib/api/client";
import type { Io } from "@/lib/api/types";

export type InboundShareExtraction = {
  draft: {
    name: string | null;
    amount: number | null;
    currency: string | null;
    date: string | null;
    categoryId: string | null;
    category: string | null;
    io: Io | null;
  };
  managementId: string;
  source: {
    documentType: "receipt" | "invoice" | "transfer" | "statement" | "message" | "other";
    fileName: string | null;
    mediaType: string | null;
    hasSharedText: boolean;
  };
};

type ExtractInboundShareInput = {
  image?: { uri: string; type: string };
  text?: string;
  managementId?: string;
  locale: string;
  currency: string;
  currentDate: string;
};

export function extractInboundShare(input: ExtractInboundShareInput): Promise<InboundShareExtraction> {
  const parameters: Record<string, string> = {
    locale: input.locale,
    currency: input.currency,
    current_date: input.currentDate,
  };
  if (input.text) parameters.text = input.text;
  if (input.managementId) parameters.management_id = input.managementId;

  if (input.image) {
    return apiUploadFile<InboundShareExtraction>(
      "/inbound-share/extract",
      input.image,
      { fieldName: "file", parameters },
    );
  }

  const formData = new FormData();
  Object.entries(parameters).forEach(([key, value]) => formData.append(key, value));
  return apiFetch<InboundShareExtraction>("/inbound-share/extract", {
    method: "POST",
    body: formData,
  });
}
