"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "tijar-viewer-geo";

export type ViewerCoords = { lat: number; lng: number };

export type ViewerLocationState = {
  status: "idle" | "prompting" | "granted" | "denied";
  coords: ViewerCoords | null;
  request: () => void;
};

function readStored(): ViewerCoords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewerCoords;
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStored(coords: ViewerCoords) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(coords));
  } catch {
    /* ignore */
  }
}

export function useViewerLocation(auto = true): ViewerLocationState {
  const stored = readStored();
  const [status, setStatus] = useState<ViewerLocationState["status"]>(stored ? "granted" : "idle");
  const [coords, setCoords] = useState<ViewerCoords | null>(stored);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("denied");
      return;
    }
    setStatus("prompting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeStored(next);
        setCoords(next);
        setStatus("granted");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 120_000 },
    );
  }, []);

  useEffect(() => {
    if (!auto || stored || status !== "idle") return;
    request();
  }, [auto, request, status, stored]);

  return { status, coords, request };
}
