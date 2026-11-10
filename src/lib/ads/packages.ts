export const AD_OBJECTIVES = [
  { id: "sales", label: "More sales", hint: "Push people to buy the product." },
  { id: "views", label: "More views", hint: "Show the post to more people on For You." },
  { id: "calls", label: "More phone calls", hint: "Put Call first so buyers can ring the shop." },
  { id: "followers", label: "More followers", hint: "Ask people to follow the shop." },
] as const;

export type AdObjective = (typeof AD_OBJECTIVES)[number]["id"];
export type AdSourceKind = "flyer" | "post" | "product";

/** Same prices for every shop category. Shortest run is 24 hours. */
export const AD_PACKAGES = [
  { hours: 24, label: "24 hours", amount: 2_000, blurb: "One full day on the feed" },
  { hours: 72, label: "3 days", amount: 5_000, blurb: "Weekend push" },
  { hours: 168, label: "7 days", amount: 10_000, blurb: "A full week" },
  { hours: 336, label: "14 days", amount: 18_000, blurb: "Two-week campaign" },
  { hours: 720, label: "30 days", amount: 30_000, blurb: "Month of visibility" },
] as const;

export type AdPackage = (typeof AD_PACKAGES)[number];

export function packageForHours(hours: number): AdPackage | null {
  return AD_PACKAGES.find((row) => row.hours === hours) ?? null;
}

export function adCtaLabel(objective: AdObjective | string | null | undefined): string {
  if (objective === "sales") return "Shop now";
  if (objective === "calls") return "Call shop";
  if (objective === "followers") return "Follow shop";
  return "See more";
}
