import { ussdCategoryByKey, ussdCategoryMenu } from "@/lib/ussd/categories";

export type UssdDraft = {
  shopName: string;
  categoryKey: string;
  categoryLabel: string;
  categorySlug: string;
  location: string;
};

export type UssdScreen = {
  continue: boolean;
  message: string;
  hop: string;
  create?: UssdDraft;
};

function hops(text: string): string[] {
  if (!text.trim()) return [];
  return text.split("*").map((part) => part.trim());
}

function con(message: string, hop: string): UssdScreen {
  return { continue: true, message, hop };
}

function end(message: string, hop: string, create?: UssdDraft): UssdScreen {
  return { continue: false, message, hop, create };
}

export function ussdMenu(input: {
  text: string;
  existingShopUrl?: string | null;
  ussdCode?: string;
}): UssdScreen {
  const parts = hops(input.text);
  const code = input.ussdCode?.trim() || "*384*100#";

  if (parts.length === 0) {
    return con("TIJAR shop\n1. Open a shop\n2. Find my shop\n3. Help", "home");
  }

  const choice = parts[0] ?? "";
  if (choice === "3") {
    return end(
      `Dial ${code} then pick Open a shop.\nAdd photos later at tijar.ng`,
      "help",
    );
  }

  if (choice === "2") {
    if (input.existingShopUrl) {
      return end(`Your shop:\n${input.existingShopUrl}`, "myshop");
    }
    return end("No shop on this number yet. Dial again and pick 1.", "myshop-none");
  }

  if (choice !== "1") {
    return con("Pick 1, 2 or 3\n1. Open a shop\n2. Find my shop\n3. Help", "home-retry");
  }

  if (parts.length === 1) {
    return con("Type your shop name.\nDo not use star.", "name");
  }

  const shopName = parts[1] ?? "";
  if (shopName.replace(/\s+/g, "").length < 2) {
    return con("Name must be 2 letters or more.\nType your shop name.", "name-retry");
  }

  if (parts.length === 2) {
    return con(`What do you sell?\n${ussdCategoryMenu()}`, "category");
  }

  const category = ussdCategoryByKey(parts[2] ?? "");
  if (!category) {
    return con(`Pick 1 to 6\n${ussdCategoryMenu()}`, "category-retry");
  }

  if (parts.length === 3) {
    return con("Type your area.\nExample: Sabon Gari Kano", "location");
  }

  const location = parts[3] ?? "";
  if (location.replace(/\s+/g, "").length < 2) {
    return con("Type your area.\nExample: Sabon Gari Kano", "location-retry");
  }

  if (parts.length === 4) {
    return con(
      `Create ${shopName} in ${location} as ${category.label} shop?\n1. Yes\n2. No`,
      "confirm",
    );
  }

  if ((parts[4] ?? "") === "2") {
    return end("Cancelled. Dial again to start over.", "cancel");
  }

  if ((parts[4] ?? "") !== "1") {
    return con("Reply 1 for Yes or 2 for No", "confirm-retry");
  }

  return end("Saving your shop...", "create", {
    shopName,
    categoryKey: category.key,
    categoryLabel: category.label,
    categorySlug: category.slug,
    location,
  });
}

export function formatUssdBody(screen: UssdScreen): string {
  const prefix = screen.continue ? "CON" : "END";
  return `${prefix} ${screen.message}`;
}
