import { isNativeApp } from "@/utils/isMobile";

/** True inside the TIJAR Android WebView (Capacitor or user-agent TijarApp/). */
export function isTijarNativeApp(): boolean {
  return isNativeApp();
}
