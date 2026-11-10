import { slugifyBusinessName } from "@/utils/discover";

export function shopUsernameFromName(name: string): string {
  return slugifyBusinessName(name) || "shop";
}

export function tijarShopEmail(username: string): string {
  const local = username.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 40) || "shop";
  return `${local}@tijar.ng`;
}
