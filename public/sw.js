/*
 * TIJAR push service worker.
 *
 * Shows browser/OS notifications for marketplace + social activity (new posts,
 * likes, comments, orders, follows) even when the site is closed. There is no
 * fetch handler on purpose — the app is server-rendered and caching would break
 * Vite/SSR module loading.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "TIJAR", body: event.data ? event.data.text() : "" };
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "TIJAR";
  const target = typeof payload.url === "string" && payload.url ? payload.url : "/shop";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: typeof payload.icon === "string" && payload.icon ? payload.icon : "/tijar-logo.png",
    badge: "/tijar-logo.png",
    data: { url: target },
  };
  if (typeof payload.tag === "string" && payload.tag) options.tag = payload.tag;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = typeof data.url === "string" && data.url ? data.url : "/shop";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
