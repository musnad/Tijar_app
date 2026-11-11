export const USSD_CATEGORIES = [
  { key: "1", slug: "street-food", label: "Food" },
  { key: "2", slug: "fashion", label: "Fashion" },
  { key: "3", slug: "phones", label: "Phones" },
  { key: "4", slug: "beauty", label: "Beauty" },
  { key: "5", slug: "transport", label: "Transport" },
  { key: "6", slug: "retail", label: "Other" },
] as const;

export function ussdCategoryByKey(key: string) {
  return USSD_CATEGORIES.find((row) => row.key === key) ?? null;
}

export function ussdCategoryMenu(): string {
  return USSD_CATEGORIES.map((row) => `${row.key}. ${row.label}`).join("\n");
}
