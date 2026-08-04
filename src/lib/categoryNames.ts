import i18n from "@/i18n";

const CATEGORY_NAME_TRANSLATIONS: Record<string, { id: string; en: string }> = {
  Gaji: { id: "Gaji", en: "Salary" },
  Freelance: { id: "Freelance", en: "Freelance" },
  Makanan: { id: "Makanan", en: "Food" },
  Transportasi: { id: "Transportasi", en: "Transportation" },
  Belanja: { id: "Belanja", en: "Shopping" },
  Tagihan: { id: "Tagihan", en: "Bills" },
  Hiburan: { id: "Hiburan", en: "Entertainment" },
  Transfer: { id: "Transfer", en: "Transfer" },
};

export function localizeCategoryName(name: string | null | undefined, language?: string | null): string | null | undefined {
  if (!name) return name;
  const translation = CATEGORY_NAME_TRANSLATIONS[name];
  if (!translation) return name;
  return (language ?? i18n.language) === "id" ? translation.id : translation.en;
}
