import { shopDeliveryFee } from "@/lib/checkout/delivery-fee";

export { shopDeliveryFee as deliveryFeeFor } from "@/lib/checkout/delivery-fee";

export type QuotedLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  available: boolean;
  variant_label?: string | null;
};

export type QuotedSeller = {
  business_id: string;
  business_name: string;
  subtotal: number;
  delivery_fee: number;
  payment_fee: number;
  total: number;
  lines: QuotedLine[];
};

export type CheckoutQuote = {
  sellers: QuotedSeller[];
  subtotal: number;
  delivery_fee: number;
  payment_fee: number;
  total: number;
  currency: string;
  fulfilment: string;
  is_order_request: boolean;
  payment_ready: boolean;
};

/** Client-side preview only. Checkout RPC recalculates from live catalogue prices. */
export function previewQuote(input: {
  fulfilment: "pickup" | "seller_delivery" | "third_party";
  sellers: Array<{
    business_id: string;
    business_name: string;
    delivery_fee?: number | null;
    lines: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      live_unit_price: number | null;
      available: boolean;
      variant_label?: string | null;
    }>;
  }>;
  paymentReady: boolean;
}): CheckoutQuote {
  const payment_fee = 0;
  const sellers: QuotedSeller[] = input.sellers.map((s) => {
    const delivery = shopDeliveryFee(input.fulfilment, s.delivery_fee);
    const lines: QuotedLine[] = s.lines.map((l) => {
      const unit_price = l.live_unit_price ?? 0;
      return {
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_price,
        line_total: unit_price * l.quantity,
        available: l.available && l.live_unit_price != null,
        variant_label: l.variant_label,
      };
    });
    const subtotal = lines.reduce((n, l) => n + l.line_total, 0);
    return {
      business_id: s.business_id,
      business_name: s.business_name,
      subtotal,
      delivery_fee: delivery,
      payment_fee,
      total: subtotal + delivery + payment_fee,
      lines,
    };
  });
  return {
    sellers,
    subtotal: sellers.reduce((n, s) => n + s.subtotal, 0),
    delivery_fee: sellers.reduce((n, s) => n + s.delivery_fee, 0),
    payment_fee: sellers.reduce((n, s) => n + s.payment_fee, 0),
    total: sellers.reduce((n, s) => n + s.total, 0),
    currency: "NGN",
    fulfilment: input.fulfilment,
    is_order_request: !input.paymentReady,
    payment_ready: input.paymentReady,
  };
}

export function quoteHasUnavailable(quote: CheckoutQuote): boolean {
  return quote.sellers.some((s) => s.lines.some((l) => !l.available));
}
