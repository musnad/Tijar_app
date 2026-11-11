/** Plain-language order tracking for marketplace buyers. */

export type OrderTrackStep = {
  key: string;
  label: string;
};

const PICKUP_STEPS: OrderTrackStep[] = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "ready", label: "Ready" },
  { key: "received", label: "Received" },
];

const DELIVERY_STEPS: OrderTrackStep[] = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "on_the_way", label: "On the way" },
  { key: "received", label: "Received" },
];

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  placed: "Placed",
  paid: "Paid — shop has it",
  confirmed: "Confirmed",
  processing: "Shop is packing it",
  preparing: "Shop is packing it",
  shipped: "On the way",
  ready: "Ready for pickup",
  ready_for_pickup: "Ready for pickup",
  delivered: "Received",
  completed: "Received",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_HINTS: Record<string, string> = {
  pending_payment: "Pay to lock in this order.",
  placed: "The shop has your request.",
  paid: "Payment received. The shop is next.",
  confirmed: "The shop accepted your order.",
  processing: "Your items are being packed.",
  preparing: "Your items are being packed.",
  shipped: "A rider is bringing it to you.",
  ready: "It is waiting for you at the shop.",
  ready_for_pickup: "It is waiting for you at the shop.",
  delivered: "You have this order.",
  completed: "You have this order.",
  cancelled: "This order was cancelled.",
  refunded: "This order was refunded.",
};

const ACTIVE_STATUSES = new Set([
  "pending_payment",
  "placed",
  "paid",
  "confirmed",
  "processing",
  "preparing",
  "shipped",
  "ready",
  "ready_for_pickup",
]);

const DONE_STATUSES = new Set(["delivered", "completed", "cancelled", "refunded"]);

export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function orderStatusHint(status: string): string {
  return STATUS_HINTS[status] ?? "Open this order to see the next step.";
}

/** Map a “place your order” request onto the same 4-step tracker. */
export function placeOrderTrackStatus(status: string): string {
  if (status === "placed") return "pending_payment";
  if (status === "paid") return "paid";
  if (status === "preparing") return "processing";
  if (status === "ready") return "ready_for_pickup";
  if (status === "completed") return "delivered";
  return status;
}

export function isActiveOrder(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isDoneOrder(status: string): boolean {
  return DONE_STATUSES.has(status);
}

export function orderTrackSteps(fulfilment: string): OrderTrackStep[] {
  return fulfilment === "pickup" ? PICKUP_STEPS : DELIVERY_STEPS;
}

/** Index of the current step in the track; -1 if cancelled/refunded. */
export function orderTrackIndex(status: string, fulfilment: string): number {
  if (status === "cancelled" || status === "refunded") return -1;
  const mapped = placeOrderTrackStatus(status);
  if (mapped === "pending_payment") return 0;
  if (mapped === "paid" || mapped === "confirmed" || mapped === "processing") return 1;
  if (mapped === "shipped" || mapped === "ready_for_pickup") return 2;
  if (mapped === "delivered") return 3;
  const steps = orderTrackSteps(fulfilment);
  const exact = steps.findIndex((s) => s.key === mapped);
  return exact >= 0 ? exact : 1;
}

export function orderStatusTone(status: string): "active" | "done" | "warn" | "muted" {
  if (status === "cancelled" || status === "refunded") return "warn";
  if (status === "delivered") return "done";
  if (isActiveOrder(status)) return "active";
  return "muted";
}

export function formatOrderWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
