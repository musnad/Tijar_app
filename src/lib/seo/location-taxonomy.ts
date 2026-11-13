import { NIGERIA_STATES, parseNigerianLocation, type NigerianState } from "@/lib/nigeria-locations";
import { slugifyBusinessName } from "@/utils/discover";

export function placeSlug(name: string): string {
  return slugifyBusinessName(name);
}

export function resolveNigeriaState(slug: string): NigerianState | null {
  const want = placeSlug(decodeURIComponent(slug));
  if (!want) return null;
  return NIGERIA_STATES.find((state) => placeSlug(state.name) === want) ?? null;
}

export function resolveStateLga(state: NigerianState, slug: string): string | null {
  const want = placeSlug(decodeURIComponent(slug));
  if (!want) return null;
  return state.lgas.find((lga) => placeSlug(lga) === want) ?? null;
}

export function locationMatchesState(locationText: string, stateName: string): boolean {
  const parsed = parseNigerianLocation(locationText);
  if (parsed.state && parsed.state.toLowerCase() === stateName.toLowerCase()) return true;
  const hay = locationText.toLowerCase();
  return hay.includes(stateName.toLowerCase());
}

export function locationMatchesArea(locationText: string, areaName: string): boolean {
  const parsed = parseNigerianLocation(locationText);
  if (parsed.lga && parsed.lga.toLowerCase() === areaName.toLowerCase()) return true;
  return locationText.toLowerCase().includes(areaName.toLowerCase());
}

export function formatPlaceHeading(stateName: string, areaName?: string | null): string {
  if (areaName?.trim()) return `${areaName.trim()}, ${stateName}`;
  return stateName;
}
