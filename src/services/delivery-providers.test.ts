import { describe, expect, it } from "vitest";

import { isDeliveryCompanyText } from "./delivery-providers";

describe("isDeliveryCompanyText", () => {
  it("matches delivery, dispatch, and rider shop names", () => {
    expect(isDeliveryCompanyText("Kano Dispatch")).toBe(true);
    expect(isDeliveryCompanyText("Musa Delivery")).toBe(true);
    expect(isDeliveryCompanyText("Kaduna Bike Rider")).toBe(true);
    expect(isDeliveryCompanyText("GIG Logistics")).toBe(true);
    expect(isDeliveryCompanyText("Okada Express")).toBe(true);
  });

  it("does not treat ordinary shops as couriers", () => {
    expect(isDeliveryCompanyText("Mama Rice Kano")).toBe(false);
    expect(isDeliveryCompanyText("Phone Repair Hub")).toBe(false);
  });
});
