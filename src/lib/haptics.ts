import { capacitorPlugin } from "@/lib/capacitor-bridge";
import { isNativeApp } from "@/utils/isMobile";

function vibrate(kind: "light" | "success" | "warning") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (kind === "success") navigator.vibrate([8, 20, 12]);
  else if (kind === "warning") navigator.vibrate([16, 30, 16]);
  else navigator.vibrate(10);
}

/** Native Capacitor haptics in the app; Vibration API on the website. */
export function haptic(kind: "light" | "success" | "warning" = "light"): void {
  if (isNativeApp()) {
    const haptics = capacitorPlugin<{
      impact: (opts: { style: string }) => Promise<void>;
      notification: (opts: { type: string }) => Promise<void>;
    }>("Haptics");
    if (haptics) {
      if (kind === "success") void haptics.notification({ type: "SUCCESS" }).catch(() => vibrate(kind));
      else if (kind === "warning") void haptics.notification({ type: "WARNING" }).catch(() => vibrate(kind));
      else void haptics.impact({ style: "LIGHT" }).catch(() => vibrate(kind));
      return;
    }
  }
  vibrate(kind);
}
