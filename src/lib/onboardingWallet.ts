import type { CashflowManagement } from "@/data/cashflow/types";

export function walletThemeSlug(walletId: string) {
  return `wallet-${walletId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

export function canDeleteUnreferencedWalletTheme(
  slug: string | null | undefined,
  currentWalletId: string,
  managements: Pick<CashflowManagement, "id" | "imageTheme">[],
  customThemeSlugs: string[],
) {
  if (!slug || !customThemeSlugs.includes(slug)) return false;
  return !managements.some((management) =>
    management.id !== currentWalletId && management.imageTheme?.themeSlug === slug,
  );
}
