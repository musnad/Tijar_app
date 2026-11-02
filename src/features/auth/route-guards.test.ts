import { describe, expect, it } from "vitest";

import { resolveAppEntry } from "./route-guards";
import type { Profile } from "@/types/database";

function profile(patch: Partial<Profile>): Profile {
  return {
    id: "p1",
    auth_id: "a1",
    email: "user@tijar.ng",
    full_name: "Test",
    phone: null,
    preferred_language: "en",
    onboarding_status: "completed",
    created_at: "",
    ...patch,
  } as Profile;
}

describe("resolveAppEntry", () => {
  it("sends unauthenticated users to login", () => {
    expect(resolveAppEntry(null, false)).toBe("/login");
  });

  it("sends authenticated users without a profile to the shop", () => {
    expect(resolveAppEntry(null, true)).toBe("/shop");
  });

  it("sends customers to the shop", () => {
    expect(resolveAppEntry(profile({ account_mode: "customer", active_mode: "customer" }), true)).toBe(
      "/shop",
    );
  });

  it("sends businesses that finished onboarding to the recent-posts feed", () => {
    expect(
      resolveAppEntry(
        profile({ account_mode: "business", active_mode: "business", onboarding_status: "completed" }),
        true,
      ),
    ).toBe("/shop");
  });

  it("sends businesses that still need onboarding there", () => {
    expect(
      resolveAppEntry(
        profile({ account_mode: "business", active_mode: "business", onboarding_status: "in_progress" }),
        true,
      ),
    ).toBe("/app/onboarding");
  });
});
