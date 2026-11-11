export type AuthCallbackParams = {
  code: string | null;
  tokenHash: string | null;
  token: string | null;
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
};

function pick(query: URLSearchParams, hash: URLSearchParams, key: string): string | null {
  const value = query.get(key) || hash.get(key);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Read recovery / auth tokens from a full URL (query + hash). */
export function parseAuthCallbackParams(href: string): AuthCallbackParams {
  const url = new URL(href, "https://www.tijar.ng");
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const query = url.searchParams;
  return {
    code: pick(query, hash, "code"),
    tokenHash: pick(query, hash, "token_hash"),
    token: pick(query, hash, "token"),
    type: pick(query, hash, "type"),
    accessToken: pick(query, hash, "access_token"),
    refreshToken: pick(query, hash, "refresh_token"),
    error: pick(query, hash, "error"),
    errorDescription: pick(query, hash, "error_description") || pick(query, hash, "error_code"),
  };
}

export function isRecoveryCallback(params: AuthCallbackParams, pathname = ""): boolean {
  if (params.type === "recovery") return true;
  if (pathname === "/reset-password" || pathname.endsWith("/reset-password")) {
    return Boolean(params.code || params.tokenHash || params.accessToken);
  }
  return Boolean(params.tokenHash);
}

export function friendlyRecoveryError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("code verifier") || lower.includes("pkce")) {
    return "This reset link must be opened in the same browser. Request a new link and open it from this device.";
  }
  if (lower.includes("expired") || lower.includes("otp") || lower.includes("invalid")) {
    return "This reset link has expired or was already used. Request a new one.";
  }
  return message;
}

export function stripAuthParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const keys = [
    "code",
    "token_hash",
    "token",
    "type",
    "access_token",
    "refresh_token",
    "error",
    "error_description",
    "error_code",
  ];
  for (const key of keys) url.searchParams.delete(key);
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}
