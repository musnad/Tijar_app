import { createSign } from "node:crypto";

import { readEnvString } from "@/lib/supabase/runtime-env";

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type FcmSendInput = {
  token: string;
  title: string;
  body: string;
  url: string;
  kind: string;
  channel: string;
  tag: string;
};

type CachedToken = { access: string; exp: number };
let cached: CachedToken | null = null;

function readServiceAccount(): ServiceAccount | null {
  const raw =
    readEnvString("FCM_SERVICE_ACCOUNT_JSON") ||
    readEnvString("FIREBASE_SERVICE_ACCOUNT") ||
    readEnvString("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  const maybeKey = readEnvString("FCM_SERVER_KEY");
  const jsonText = raw?.trim() || (maybeKey?.trim().startsWith("{") ? maybeKey.trim() : "");
  if (jsonText) {
    try {
      return JSON.parse(jsonText) as ServiceAccount;
    } catch {
      return null;
    }
  }
  const email = readEnvString("FIREBASE_CLIENT_EMAIL");
  const key = readEnvString("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (email && key) {
    return {
      project_id: readEnvString("FIREBASE_PROJECT_ID") || readEnvString("FCM_PROJECT_ID") || "tijar-6b616",
      client_email: email,
      private_key: key,
    };
  }
  return null;
}

function projectId(sa: ServiceAccount | null): string {
  return (
    sa?.project_id ||
    readEnvString("FIREBASE_PROJECT_ID") ||
    readEnvString("FCM_PROJECT_ID") ||
    "tijar-6b616"
  );
}

async function googleAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (!sa.client_email || !sa.private_key) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.access;
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${sign.sign(sa.private_key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) return null;
  cached = { access: json.access_token, exp: now + Math.min(json.expires_in ?? 3600, 3500) };
  return json.access_token;
}

export async function sendFcm(input: FcmSendInput): Promise<{ ok: boolean; stale: boolean }> {
  const sa = readServiceAccount();
  const access = sa ? await googleAccessToken(sa) : null;
  if (access) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId(sa)}/messages:send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: { title: input.title, body: input.body },
          data: {
            url: input.url,
            kind: input.kind,
            title: input.title,
            body: input.body,
          },
          android: {
            priority: "HIGH",
            ttl: "86400s",
            notification: {
              title: input.title,
              body: input.body,
              channel_id: input.channel,
              icon: "ic_stat_notify",
              color: "#1F7A4D",
              sound: "default",
              notification_priority: "PRIORITY_MAX",
              visibility: "PUBLIC",
              default_vibrate_timings: true,
              tag: input.tag,
            },
          },
        },
      }),
    });
    if (res.status === 404 || res.status === 410) return { ok: false, stale: true };
    const json = (await res.json().catch(() => ({}))) as { error?: { details?: Array<{ errorCode?: string }> } };
    const code = json.error?.details?.[0]?.errorCode ?? "";
    if (code === "UNREGISTERED" || code === "INVALID_ARGUMENT") return { ok: false, stale: code === "UNREGISTERED" };
    return { ok: res.ok, stale: false };
  }

  const legacy = readEnvString("FCM_SERVER_KEY");
  if (!legacy || legacy.trim().startsWith("{")) return { ok: false, stale: false };
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      authorization: `key=${legacy}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: input.token,
      priority: "high",
      time_to_live: 86400,
      content_available: true,
      notification: {
        title: input.title,
        body: input.body,
        sound: "default",
        android_channel_id: input.channel,
        icon: "ic_stat_notify",
        color: "#1F7A4D",
        tag: input.tag,
      },
      data: { url: input.url, kind: input.kind, title: input.title, body: input.body },
    }),
  });
  if (res.status === 404 || res.status === 410) return { ok: false, stale: true };
  return { ok: res.ok, stale: false };
}
