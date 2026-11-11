const KEY = "tijar-from-ad";

type AdClick = { adId: string; businessId: string; at: number };

function read(): AdClick | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as AdClick;
    if (!row?.adId || !row.businessId) return null;
    return row;
  } catch {
    return null;
  }
}

export function rememberSponsoredAd(adId: string, businessId: string) {
  if (typeof window === "undefined" || !adId) return;
  sessionStorage.setItem(KEY, JSON.stringify({ adId, businessId, at: Date.now() }));
}

export function takeSponsoredAdForBusiness(businessId: string): string | null {
  const row = read();
  if (!row || row.businessId !== businessId) return null;
  sessionStorage.removeItem(KEY);
  return row.adId;
}
