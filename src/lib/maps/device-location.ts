import { capacitorPlugin } from "@/lib/capacitor-bridge";

export type PlaceParts = {
  area: string;
  street: string;
  landmark: string;
  label: string;
};

export async function readDeviceCoords(): Promise<{ lat: number; lng: number } | null> {
  const native = capacitorPlugin<{
    getCurrentPosition: (opts?: { enableHighAccuracy?: boolean }) => Promise<{
      coords: { latitude: number; longitude: number };
    }>;
  }>("Geolocation");
  if (native?.getCurrentPosition) {
    try {
      const pos = await native.getCurrentPosition({ enableHighAccuracy: true });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      /* fall through to browser GPS */
    }
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 14_000, maximumAge: 8_000 },
    );
  });
}

export async function reverseAreaStreetLandmark(lat: number, lng: number): Promise<PlaceParts> {
  const empty: PlaceParts = { area: "", street: "", landmark: "", label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = json.address ?? {};
    const area = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city || a.county || "";
    const street = [a.road, a.house_number].filter(Boolean).join(" ");
    const landmark = a.amenity || a.shop || a.building || a.leisure || "";
    const label = [street, landmark, area, a.state].filter(Boolean).join(", ") || json.display_name || empty.label;
    return { area, street, landmark, label };
  } catch {
    return empty;
  }
}
