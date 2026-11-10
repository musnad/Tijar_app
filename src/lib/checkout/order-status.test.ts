import { describe, expect, it } from "vitest";

import {
  canBuyerTransition,
  canSellerTransition,
  isClientPaidStatus,
  orderPaidFromProvider,
} from "./order-status";

describe("order transitions", () => {
  it("lets a buyer cancel a request or mark received", () => {
    expect(canBuyerTransition("pending_payment", "cancelled")).toBe(true);
    expect(canBuyerTransition("pending_payment", "paid")).toBe(false);
    expect(canBuyerTransition("confirmed", "cancelled")).toBe(false);
    expect(canBuyerTransition("shipped", "delivered")).toBe(true);
  });

  it("lets a seller move a request forward without marking paid", () => {
    expect(canSellerTransition("pending_payment", "confirmed")).toBe(true);
    expect(canSellerTransition("pending_payment", "paid")).toBe(false);
    expect(canSellerTransition("processing", "shipped")).toBe(true);
    expect(canSellerTransition("shipped", "delivered")).toBe(false);
  });
});

describe("paid status", () => {
  it("never trusts a client-side success message", () => {
    expect(isClientPaidStatus("paid")).toBe(true);
    expect(
      orderPaidFromProvider({
        orderStatus: "pending_payment",
        paymentStatus: "initiated",
        clientSaidPaid: true,
      }),
    ).toBe(false);
    expect(
      orderPaidFromProvider({
        orderStatus: "paid",
        paymentStatus: "success",
        clientSaidPaid: false,
      }),
    ).toBe(true);
  });
});
