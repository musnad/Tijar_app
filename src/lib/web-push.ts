import { readEnvString } from "@/lib/supabase/runtime-env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SW_URL = "/sw.js";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Public VAPID key (safe to expose). Empty until the server is configured. */
export function vapidPublicKey(): string | null {
  const key = readEnvString("VITE_VAPID_PUBLIC_KEY");
  return key && key.trim() ? key.trim() : null;
}

export function notificationsGranted(): boolean {
  return pushSupported() && window.Notification.permission === "granted";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_URL);
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    return null;
  }
}

async function authToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

async function saveSubscription(subscription: PushSubscription): Promise<{ ok: boolean; error: string | null }> {
  const token = await authToken();
  if (!token) return { ok: false, error: "Sign in to turn on notifications." };
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!res.ok) return { ok: false, error: "Could not save notification settings." };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Could not save notification settings." };
  }
}

/**
 * Ask for notification permission and register this device for Web Push.
 * Safe to call repeatedly — it reuses the existing subscription.
 */
export async function enableWebPush(): Promise<{ ok: boolean; error: string | null }> {
  if (!pushSupported()) return { ok: false, error: "This device does not support push notifications." };
  const key = vapidPublicKey();
  if (!key) return { ok: false, error: "Push notifications are not configured yet." };

  const permission =
    window.Notification.permission === "granted"
      ? "granted"
      : await window.Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Notifications are blocked on this device." };

  const registration = await registerPushWorker();
  if (!registration) return { ok: false, error: "Could not start the notification service." };

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    } catch {
      return { ok: false, error: "Could not subscribe this device." };
    }
  }
  return saveSubscription(subscription);
}

/** Re-save an existing subscription (e.g. after a new login on the same device). */
export async function syncWebPushSubscription(): Promise<void> {
  if (!pushSupported() || !notificationsGranted()) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await saveSubscription(subscription);
}
