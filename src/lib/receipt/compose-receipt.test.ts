import { describe, expect, it } from "vitest";

import { receiptShareCaption } from "@/lib/receipt/compose-receipt";

describe("receipt caption", () => {
  it("brands tijar.ng and includes shop plus order details", () => {
    const text = receiptShareCaption({
      shopName: "Aisha Foods",
      shopAddress: "Sabon Gari, Kano",
      orderRef: "TJ-1001",
      items: "2 × Rice",
      amountLabel: "₦5,000",
    });
    expect(text).toContain("tijar.ng");
    expect(text).toContain("Aisha Foods");
    expect(text).toContain("Sabon Gari, Kano");
    expect(text).toContain("TJ-1001");
    expect(text).toContain("2 × Rice");
    expect(text).toContain("₦5,000");
  });
});
