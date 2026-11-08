const CLEARED_KEY = "tijar-sw-cleared";

function scriptUrl(registration: ServiceWorkerRegistration): string {
  return registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? "";
}

/** Leftover PWA workers on localhost intercept Vite. Keep the push worker. */
export async function clearServiceWorkers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const stale = registrations.filter((registration) => !scriptUrl(registration).includes("push-sw.js"));
  if (stale.length === 0) return;
  await Promise.all(stale.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocal && !sessionStorage.getItem(CLEARED_KEY)) {
    sessionStorage.setItem(CLEARED_KEY, "1");
    window.location.reload();
  }
}
