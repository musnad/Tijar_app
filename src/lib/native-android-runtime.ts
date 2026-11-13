import { capacitorPlugin, hideNativeSplash } from "@/lib/capacitor-bridge";
import { initNativePush } from "@/lib/native-push";
import { isNativeApp } from "@/utils/isMobile";

const KEYBOARD_VAR = "--keyboard-inset";

function isExternalHref(href: string): boolean {
  if (/^(tel:|mailto:|sms:|geo:|intent:)/i.test(href)) return true;
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return false;
    const host = url.hostname.replace(/^www\./, "");
    if (host === "tijar.ng" || host.endsWith(".tijar.ng") || host.endsWith(".supabase.co")) return false;
    return true;
  } catch {
    return false;
  }
}

async function openNative(href: string) {
  const app = capacitorPlugin<{ openUrl?: (opts: { url: string }) => Promise<void> }>("App");
  if (app?.openUrl) {
    await app.openUrl({ url: href }).catch(() => {
      window.open(href, "_blank", "noopener,noreferrer");
    });
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function bindExternalLinks() {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("/")) return;
    const abs = anchor.href;
    if (!isExternalHref(abs)) return;
    event.preventDefault();
    event.stopPropagation();
    void openNative(abs);
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

function bindKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  const sync = () => {
    const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    document.documentElement.style.setProperty(KEYBOARD_VAR, `${inset}px`);
    document.documentElement.classList.toggle("tijar-keyboard-open", inset > 80);
  };
  sync();
  viewport.addEventListener("resize", sync);
  viewport.addEventListener("scroll", sync);
  return () => {
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    document.documentElement.style.removeProperty(KEYBOARD_VAR);
    document.documentElement.classList.remove("tijar-keyboard-open");
  };
}

function bindNetworkClass() {
  const sync = () => {
    document.documentElement.classList.toggle("tijar-offline", !navigator.onLine);
  };
  sync();
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  return () => {
    window.removeEventListener("online", sync);
    window.removeEventListener("offline", sync);
  };
}

export async function shareNative(input: { title: string; text: string; url: string }): Promise<boolean> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: input.title, text: input.text, url: input.url });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Capacitor chrome, back, keyboard, and links — no full-page reload to tijar.ng. */
export function bootNativeAndroidRuntime(): () => void {
  if (!isNativeApp()) return () => undefined;
  document.documentElement.classList.add("tijar-android-webview");

  const splashTimer = window.setTimeout(() => {
    void hideNativeSplash();
  }, 160);

  const status = capacitorPlugin<{
    setStyle: (opts: { style: string }) => Promise<void>;
    setBackgroundColor: (opts: { color: string }) => Promise<void>;
    setOverlaysWebView?: (opts: { overlay: boolean }) => Promise<void>;
  }>("StatusBar");
  void status?.setStyle({ style: "LIGHT" }).catch(() => undefined);
  void status?.setBackgroundColor({ color: "#F3F5F8" }).catch(() => undefined);
  void status?.setOverlaysWebView?.({ overlay: false }).catch(() => undefined);

  void initNativePush({ requestPermission: false });

  const app = capacitorPlugin<{
    addListener: (
      event: string,
      cb: (info: { canGoBack?: boolean; isActive?: boolean }) => void,
    ) => Promise<{ remove: () => Promise<void> }>;
    exitApp: () => Promise<void>;
  }>("App");
  const handles: Array<{ remove: () => Promise<void> }> = [];
  let lastBack = 0;
  void app
    ?.addListener("backButton", ({ canGoBack }) => {
      const path = window.location.pathname;
      const atHome = path === "/shop" || path === "/shop/";
      if (canGoBack && !atHome) {
        window.history.back();
        return;
      }
      const now = Date.now();
      if (now - lastBack < 1600) {
        void app.exitApp();
        return;
      }
      lastBack = now;
    })
    .then((handle) => handles.push(handle))
    .catch(() => undefined);
  void app
    ?.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void initNativePush({ requestPermission: false });
    })
    .then((handle) => handles.push(handle))
    .catch(() => undefined);

  const unbindLinks = bindExternalLinks();
  const unbindKeyboard = bindKeyboardInset();
  const unbindNetwork = bindNetworkClass();

  return () => {
    window.clearTimeout(splashTimer);
    unbindLinks();
    unbindKeyboard();
    unbindNetwork();
    for (const handle of handles) void handle.remove();
  };
}
