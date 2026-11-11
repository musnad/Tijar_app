declare global {
  interface Window {
    __TIJAR_HYDRATED?: boolean;
  }
}

/** Native Capacitor shell vs mobile browser vs desktop. */

export function markNativeDetectionReady(): void {
  if (typeof window === "undefined") return;
  window.__TIJAR_HYDRATED = true;
}

export function isNativeApp(): boolean {
  // SSR and the first client render must match. The Android WebView UA would
  // otherwise hydrate a different tree than Vercel HTML and crash the shop.
  if (typeof window === "undefined") return false;
  if (!window.__TIJAR_HYDRATED) return false;
  if (document.documentElement.classList.contains("tijar-android-webview")) {
    return true;
  }
  if (/TijarApp\//i.test(navigator.userAgent)) {
    return true;
  }
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function isMobile(): boolean {
  if (isNativeApp()) return true;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}
