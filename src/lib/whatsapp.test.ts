import { describe, expect, it } from "vitest";

import { displayNgPhone, paymentReceiptMessage, whatsappChatUrl } from "@/lib/whatsapp";

describe("whatsapp receipt link", () => {
  it("opens WhatsApp with a Nigerian number and receipt text", () => {
    const url = whatsappChatUrl("08031234567", "TIJAR payment receipt");
    expect(url).toContain("https://wa.me/2348031234567");
    expect(url).toContain("TIJAR%20payment%20receipt");
  });

  it("shows a local phone for tapping", () => {
    expect(displayNgPhone("+2348031234567")).toBe("08031234567");
  });

  it("builds a receipt the shop can read", () => {
    const text = paymentReceiptMessage({
      shopName: "Aisha Foods",
      orderRef: "TJ-1001",
      items: "2 × Rice",
      amountLabel: "₦5,000",
    });
    expect(text).toContain("Aisha Foods");
    expect(text).toContain("TJ-1001");
    expect(text).toContain("₦5,000");
  });
});
