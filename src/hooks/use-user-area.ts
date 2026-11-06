import { useCallback, useMemo, useState } from "react";

import {
  coordinatesForState,
  formatNigerianLocation,
  parseNigerianLocation,
} from "@/lib/nigeria-locations";
import type { Profile } from "@/types/database";

const KEY = "tijar-user-area";

export type UserArea = { state: string; lga: string };

function readStored(): UserArea | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserArea;
    if (parsed.state) return { state: parsed.state, lga: parsed.lga ?? "" };
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredUserArea(area: UserArea) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(area));
  } catch {
    /* ignore */
  }
}

function areaFromProfile(profile?: Profile | null): UserArea | null {
  if (!profile) return null;
  if (profile.state?.trim()) {
    return { state: profile.state.trim(), lga: profile.lga?.trim() ?? "" };
  }
  const parsed = parseNigerianLocation(profile.location_text);
  return parsed.state ? parsed : null;
}

export function useUserArea(profile?: Profile | null) {
  const [stored, setStored] = useState<UserArea | null>(readStored);
  const area = useMemo(() => areaFromProfile(profile) ?? stored, [profile, stored]);
  const label = formatNigerianLocation(area?.state, area?.lga);
  const coords = coordinatesForState(area?.state);

  const save = useCallback((next: UserArea) => {
    writeStoredUserArea(next);
    setStored(next);
  }, []);

  return { area, label, coords, save };
}
