"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { readDeviceCoords, reverseAreaStreetLandmark } from "@/lib/maps/device-location";
import { getMapsProvider } from "@/lib/maps/provider";

export type ShopLocationValue = {
  label: string;
  lat: number | null;
  lng: number | null;
};

const NIGERIA_CENTRE = { lat: 9.082, lng: 8.675 };

export function ShopLocationPicker({
  value,
  onChange,
}: {
  value: ShopLocationValue;
  onChange: (next: ShopLocationValue) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapHostRef.current || mapRef.current) return;

      const start =
        valueRef.current.lat != null && valueRef.current.lng != null
          ? { lat: valueRef.current.lat, lng: valueRef.current.lng }
          : NIGERIA_CENTRE;
      const zoom = valueRef.current.lat != null ? 16 : 6;
      const map = L.map(mapHostRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([start.lat, start.lng], zoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        subdomains: "abc",
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const icon = L.divIcon({
        className: "tijar-shop-marker is-selected",
        html: `<div class="tijar-shop-pin is-selected"><div class="tijar-shop-pin-disc">●</div><span class="tijar-shop-pin-stem"></span></div>`,
        iconSize: [40, 48],
        iconAnchor: [20, 44],
      });

      if (valueRef.current.lat != null && valueRef.current.lng != null) {
        markerRef.current = L.marker([valueRef.current.lat, valueRef.current.lng], {
          icon,
          draggable: true,
        }).addTo(map);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current?.getLatLng();
          if (!pos) return;
          void applyPin(pos.lat, pos.lng, { keepLabel: true });
        });
      }

      map.on("click", (event) => {
        void applyPin(event.latlng.lat, event.latlng.lng, { keepLabel: Boolean(valueRef.current.label.trim()) });
      });

      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    }

    async function applyPin(lat: number, lng: number, opts: { keepLabel: boolean }) {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;
      const icon = L.divIcon({
        className: "tijar-shop-marker is-selected",
        html: `<div class="tijar-shop-pin is-selected"><div class="tijar-shop-pin-disc">●</div><span class="tijar-shop-pin-stem"></span></div>`,
        iconSize: [40, 48],
        iconAnchor: [20, 44],
      });
      if (!markerRef.current) {
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current?.getLatLng();
          if (!pos) return;
          void applyPin(pos.lat, pos.lng, { keepLabel: true });
        });
      } else {
        markerRef.current.setLatLng([lat, lng]);
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 16));
      let label = valueRef.current.label;
      if (!opts.keepLabel || !label.trim()) {
        const place = await reverseAreaStreetLandmark(lat, lng);
        label = place.label || label;
      }
      onChangeRef.current({ label, lat, lng });
    }

    void init();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function syncPin() {
      const map = mapRef.current;
      if (!map || value.lat == null || value.lng == null) return;
      const L = await import("leaflet");
      if (cancelled) return;
      const icon = L.divIcon({
        className: "tijar-shop-marker is-selected",
        html: `<div class="tijar-shop-pin is-selected"><div class="tijar-shop-pin-disc">●</div><span class="tijar-shop-pin-stem"></span></div>`,
        iconSize: [40, 48],
        iconAnchor: [20, 44],
      });
      if (!markerRef.current) {
        markerRef.current = L.marker([value.lat, value.lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current?.getLatLng();
          if (!pos) return;
          onChangeRef.current({ ...valueRef.current, lat: pos.lat, lng: pos.lng });
        });
      } else {
        markerRef.current.setLatLng([value.lat, value.lng]);
      }
      map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15));
    }
    void syncPin();
    return () => {
      cancelled = true;
    };
  }, [value.lat, value.lng]);

  async function findOnMap() {
    const query = value.label.trim();
    if (query.length < 2) {
      toast.error("Type an area, street, or landmark first.");
      return;
    }
    setSearching(true);
    const hits = await getMapsProvider().geocode(query);
    setSearching(false);
    if (!hits[0]) {
      toast.message("This place is not on the map. We will still save the address you typed.");
      onChange({ ...value, lat: value.lat, lng: value.lng });
      return;
    }
    onChange({
      label: value.label.trim() || hits[0].label,
      lat: hits[0].lat,
      lng: hits[0].lng,
    });
  }

  async function useMyLocation() {
    setLocating(true);
    const coords = await readDeviceCoords();
    setLocating(false);
    if (!coords) {
      toast.error("Could not read GPS. Type the address instead.");
      return;
    }
    const place = await reverseAreaStreetLandmark(coords.lat, coords.lng);
    onChange({
      label: value.label.trim() || place.label,
      lat: coords.lat,
      lng: coords.lng,
    });
  }

  function clearPin() {
    markerRef.current?.remove();
    markerRef.current = null;
    onChange({ label: value.label, lat: null, lng: null });
  }

  return (
    <div className="space-y-2">
      <Input
        className="min-h-12 rounded-xl"
        value={value.label}
        onChange={(e) => onChange({ ...value, label: e.target.value })}
        placeholder="Area, street, market, or landmark"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#0B1F4D] px-3 text-[12px] font-extrabold text-white"
          onClick={() => void findOnMap()}
          disabled={searching}
        >
          <Search className="size-3.5" />
          {searching ? "Searching…" : "Find on map"}
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-[12px] font-extrabold text-[#0B1F4D]"
          onClick={() => void useMyLocation()}
          disabled={locating}
        >
          <Crosshair className="size-3.5" />
          {locating ? "Locating…" : "Use GPS"}
        </button>
        {value.lat != null ? (
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-bold text-muted-foreground"
            onClick={clearPin}
          >
            Clear pin
          </button>
        ) : null}
      </div>
      <div
        ref={mapHostRef}
        className="h-52 w-full overflow-hidden rounded-2xl border border-border"
        role="application"
        aria-label="Drop a pin for your shop"
      />
      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        {value.lat != null && value.lng != null
          ? "Exact pin saved. Drag the marker or tap the map to move it."
          : "Tap the map for an exact pin. If the place is not on the map, save the typed address anyway."}
      </p>
    </div>
  );
}
