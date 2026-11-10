import { describe, expect, it } from "vitest";

import { previewQuote, quoteHasUnavailable } from "./quote";

describe("previewQuote", () => {
  it("groups sellers and adds delivery per seller, never a payment charge", () => {
    const q = previewQuote({
      fulfilment: "seller_delivery",
      paymentReady: false,
      sellers: [
        {
          business_id: "a",
          business_name: "Aisha",
          lines: [{ product_id: "1", product_name: "Rice", quantity: 2, live_unit_price: 1000, available: true }],
        },
        {
          business_id: "b",
          business_name: "Musa",
          lines: [{ product_id: "2", product_name: "Oil", quantity: 1, live_unit_price: 500, available: true }],
        },
      ],
    });
    expect(q.sellers).toHaveLength(2);
    expect(q.delivery_fee).toBe(0);
    expect(q.payment_fee).toBe(0);
    expect(q.total).toBe(2500);
    expect(q.is_order_request).toBe(true);
    expect(q.payment_ready).toBe(false);
  });

  it("flags unavailable or unpriced lines", () => {
    const q = previewQuote({
      fulfilment: "pickup",
      paymentReady: false,
      sellers: [
        {
          business_id: "a",
          business_name: "Aisha",
          lines: [{ product_id: "1", product_name: "Rice", quantity: 1, live_unit_price: null, available: true }],
        },
      ],
    });
    expect(quoteHasUnavailable(q)).toBe(true);
  });
});
