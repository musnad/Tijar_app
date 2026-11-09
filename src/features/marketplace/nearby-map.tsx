"use client";

import { useEffect, useRef } from "react";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
  logoUrl?: string | null;
  estimated?: boolean;
};

type NearbyMapProps = {
  centre: { lat: number; lng: number };
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  followUser?: boolean;
  accuracyM?: number | null;
  onUserDrag?: () => void;
  className?: string;
};

const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Client-only Leaflet map — Bolt-style live user dot + shop pins. */
export function NearbyMap({
  centre,
  pins,
  selectedId,
  onSelect,
  followUser = true,
  accuracyM,
  onUserDrag,
  className,
}: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const accuracyRef = useRef<import("leaflet").Circle | null>(null);
  const onSelectRef = useRef(onSelect);
  const onUserDragRef = useRef(onUserDrag);
  const followRef = useRef(followUser);
  onSelectRef.current = onSelect;
  onUserDragRef.current = onUserDrag;
  followRef.current = followUser;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        zoomSnap: 0.5,
      }).setView([centre.lat, centre.lng], 14);

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      map.on("dragstart", () => onUserDragRef.current?.());

      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    }

    void init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      accuracyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; later effects move the view
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followUser) return;
    map.panTo([centre.lat, centre.lng], { animate: true, duration: 0.4 });
  }, [centre.lat, centre.lng, followUser]);

  useEffect(() => {
    let cancelled = false;

    async function syncMarkers() {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (cancelled || !map) return;

      const youIcon = L.divIcon({
        className: "tijar-you-marker",
        html: `<div class="tijar-you-pulse" aria-hidden="true"></div><div class="tijar-you-core"></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const existing = markersRef.current;
      const keep = new Set(pins.map((p) => p.id));
      keep.add("__you__");

      for (const [id, marker] of existing) {
        if (!keep.has(id)) {
          marker.remove();
          existing.delete(id);
        }
      }

      if (!existing.has("__you__")) {
        const you = L.marker([centre.lat, centre.lng], {
          icon: youIcon,
          zIndexOffset: 1200,
          keyboard: false,
        }).addTo(map);
        you.bindTooltip("You", { direction: "top", offset: [0, -12], className: "tijar-map-tip" });
        existing.set("__you__", you);
      } else {
        existing.get("__you__")!.setLatLng([centre.lat, centre.lng]);
        existing.get("__you__")!.setIcon(youIcon);
      }

      const radius = typeof accuracyM === "number" && accuracyM > 12 && accuracyM < 400 ? accuracyM : 0;
      if (radius) {
        if (!accuracyRef.current) {
          accuracyRef.current = L.circle([centre.lat, centre.lng], {
            radius,
            color: "#2563eb",
            weight: 1,
            fillColor: "#3b82f6",
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
        } else {
          accuracyRef.current.setLatLng([centre.lat, centre.lng]);
          accuracyRef.current.setRadius(radius);
        }
      } else if (accuracyRef.current) {
        accuracyRef.current.remove();
        accuracyRef.current = null;
      }

      for (const pin of pins) {
        const active = pin.id === selectedId;
        const icon = L.divIcon({
          className: active ? "tijar-shop-marker is-selected" : "tijar-shop-marker",
          html: shopPinHtml(pin, active),
          iconSize: [40, 48],
          iconAnchor: [20, 44],
        });

        const existingMarker = existing.get(pin.id);
        if (existingMarker) {
          existingMarker.setLatLng([pin.lat, pin.lng]);
          existingMarker.setIcon(icon);
          existingMarker.setZIndexOffset(active ? 900 : 0);
          existingMarker.off("click");
          existingMarker.on("click", () => onSelectRef.current?.(pin.id));
        } else {
          const marker = L.marker([pin.lat, pin.lng], { icon, riseOnHover: true }).addTo(map);
          marker.bindTooltip(escapeHtml(pin.label), {
            direction: "top",
            offset: [0, -40],
            className: "tijar-map-tip",
          });
          marker.on("click", () => onSelectRef.current?.(pin.id));
          existing.set(pin.id, marker);
        }
      }

      if (selectedId) {
        const chosen = pins.find((p) => p.id === selectedId);
        if (chosen) {
          map.panTo([chosen.lat, chosen.lng], { animate: true, duration: 0.35 });
        }
      }

      requestAnimationFrame(() => map.invalidateSize());
    }

    void syncMarkers();
    return () => {
      cancelled = true;
    };
  }, [pins, selectedId, centre.lat, centre.lng, accuracyM]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="application"
      aria-label="Map of nearby businesses"
    />
  );
}

function shopPinHtml(pin: MapPin, active: boolean): string {
  const logo = pin.logoUrl
    ? `<img src="${escapeAttr(pin.logoUrl)}" alt="" />`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  return `<div class="tijar-shop-pin${active ? " is-selected" : ""}">
    <div class="tijar-shop-pin-disc">${logo}</div>
    <span class="tijar-shop-pin-stem"></span>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
