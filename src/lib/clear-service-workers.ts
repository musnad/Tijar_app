const CLEARED_KEY = "tijar-sw-cleared";

/** Leftover service workers on localhost:3000 intercept Vite modules and break login. */
export async function clearServiceWorkers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const hadWorker = registrations.length > 0;
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if (hadWorker && !sessionStorage.getItem(CLEARED_KEY)) {
    sessionStorage.setItem(CLEARED_KEY, "1");
    window.location.reload();
  }
}
