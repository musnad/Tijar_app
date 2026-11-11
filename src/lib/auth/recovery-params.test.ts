import { describe, expect, it } from "vitest";

import { friendlyRecoveryError, isRecoveryCallback, parseAuthCallbackParams } from "./recovery-params";

describe("parseAuthCallbackParams", () => {
  it("reads a PKCE code from the query", () => {
    const params = parseAuthCallbackParams("https://www.tijar.ng/reset-password?code=abc123");
    expect(params.code).toBe("abc123");
    expect(isRecoveryCallback(params, "/reset-password")).toBe(true);
  });

  it("reads token_hash recovery links", () => {
    const params = parseAuthCallbackParams(
      "https://www.tijar.ng/reset-password?token_hash=hash1&type=recovery",
    );
    expect(params.tokenHash).toBe("hash1");
    expect(params.type).toBe("recovery");
    expect(isRecoveryCallback(params)).toBe(true);
  });

  it("reads implicit tokens from the hash", () => {
    const params = parseAuthCallbackParams(
      "https://www.tijar.ng/reset-password#access_token=at&refresh_token=rt&type=recovery",
    );
    expect(params.accessToken).toBe("at");
    expect(params.refreshToken).toBe("rt");
    expect(params.type).toBe("recovery");
    expect(isRecoveryCallback(params)).toBe(true);
  });

  it("reads expired-link errors", () => {
    const params = parseAuthCallbackParams(
      "https://www.tijar.ng/reset-password?error=access_denied&error_description=expired",
    );
    expect(params.error).toBe("access_denied");
    expect(params.errorDescription).toBe("expired");
  });
});

describe("friendlyRecoveryError", () => {
  it("explains PKCE mismatches", () => {
    expect(friendlyRecoveryError("both auth code and code verifier should be non-empty")).toMatch(
      /same browser/i,
    );
  });
});
