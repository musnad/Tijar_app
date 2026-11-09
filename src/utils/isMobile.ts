/** Native Capacitor shell vs mobile browser vs desktop. */

export function isNativeApp(): boolean {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("tijar-android-webview")) {
    return true;
  }
  if (typeof navigator !== "undefined" && /TijarApp\//i.test(navigator.userAgent)) {
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
