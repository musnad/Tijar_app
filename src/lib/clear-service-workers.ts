const CLEARED_KEY = "tijar-sw-cleared";
const PUSH_SW_URL = "/sw.js";

/**
 * Leftover PWA service workers on localhost:3000 intercept Vite modules and
 * break login. We removed them, but the TIJAR push worker lives at /sw.js and
 * must survive — otherwise notifications never arrive.
 */
export async function clearServiceWorkers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const legacy = registrations.filter((registration) => {
    const url = registration.active?.scriptURL ?? registration.installing?.scriptURL ?? registration.waiting?.scriptURL ?? "";
    return !url.endsWith(PUSH_SW_URL);
  });
  if (legacy.length === 0) return;

  await Promise.all(legacy.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if (!sessionStorage.getItem(CLEARED_KEY)) {
    sessionStorage.setItem(CLEARED_KEY, "1");
    window.location.reload();
  }
}
