import { isNativeApp } from "@/utils/isMobile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function authToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

const FCM_TOKEN_KEY = "tijar-fcm-token";

async function saveFcmToken(token: string): Promise<void> {
  try {
    window.localStorage.setItem(FCM_TOKEN_KEY, token);
  } catch {
    // Ignore.
  }
  const access = await authToken();
  if (!access) return;
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${access}` },
    body: JSON.stringify({ fcmToken: token }),
  }).catch(() => undefined);
}

async function flushStoredFcmToken(): Promise<void> {
  try {
    const token = window.localStorage.getItem(FCM_TOKEN_KEY);
    if (token) await saveFcmToken(token);
  } catch {
    // Ignore.
  }
}

export function isSaleNotification(kind: string | undefined): boolean {
  return kind === "purchase" || kind === "place_order" || kind === "place_order_paid";
}

export async function initNativePush(opts?: { requestPermission?: boolean }): Promise<void> {
  if (!isNativeApp()) return;
  await flushStoredFcmToken();
  const ask = opts?.requestPermission !== false;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    if (ask) await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({
      id: "tijar-sales",
      name: "Sales",
      description: "You made a sale",
      importance: 5,
      sound: "sale",
      vibration: true,
      visibility: 1,
    });
    await LocalNotifications.createChannel({
      id: "tijar-general",
      name: "Tijar",
      description: "Tijar activity",
      importance: 5,
      vibration: true,
      visibility: 1,
    });
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const url = (event.notification.extra as { url?: string } | undefined)?.url;
      if (typeof url === "string" && url) window.location.assign(url);
    });
  } catch {
    // Plugin missing in browser.
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const current = await PushNotifications.checkPermissions();
    const perm = ask || current.receive === "granted" ? await PushNotifications.requestPermissions() : current;
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
    await PushNotifications.addListener("registration", (event) => {
      if (event.value) void saveFcmToken(event.value);
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const url = event.notification?.data?.url;
      if (typeof url === "string" && url) window.location.assign(url);
    });
  } catch {
    // FCM needs google-services.json; local notifications still work.
  }
}

export async function showNativeNotification(input: {
  title: string;
  body: string;
  url: string;
  id: string;
  sale: boolean;
}): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const numericId = Math.abs(Array.from(input.id).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7)) % 2_000_000_000;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericId || Date.now() % 1_000_000,
          title: input.title,
          body: input.body,
          sound: input.sale ? "sale" : undefined,
          channelId: input.sale ? "tijar-sales" : "tijar-general",
          extra: { url: input.url },
        },
      ],
    });
  } catch {
    // Ignore if the OS blocks the notification.
  }
}
