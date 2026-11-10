/** Plain-language order tracking for marketplace buyers. */

export type OrderTrackStep = {
  key: string;
  label: string;
};

const PICKUP_STEPS: OrderTrackStep[] = [
  { key: "pending_payment", label: "Payment" },
  { key: "paid", label: "Paid" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Preparing" },
  { key: "ready_for_pickup", label: "Ready" },
  { key: "delivered", label: "Received" },
];

const DELIVERY_STEPS: OrderTrackStep[] = [
  { key: "pending_payment", label: "Payment" },
  { key: "paid", label: "Paid" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Preparing" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Received" },
];

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Order request",
  paid: "Paid",
  confirmed: "Confirmed by seller",
  processing: "Being prepared",
  shipped: "On the way",
  ready_for_pickup: "Ready for pickup",
  delivered: "Received",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const ACTIVE_STATUSES = new Set([
  "pending_payment",
  "paid",
  "confirmed",
  "processing",
  "shipped",
  "ready_for_pickup",
]);

const DONE_STATUSES = new Set(["delivered", "cancelled", "refunded"]);

export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
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
  const steps = orderTrackSteps(fulfilment);
  const exact = steps.findIndex((s) => s.key === status);
  if (exact >= 0) return exact;
  // Map intermediate statuses onto nearest step
  if (status === "ready_for_pickup" && fulfilment !== "pickup") {
    return steps.findIndex((s) => s.key === "shipped");
  }
  return Math.max(0, steps.findIndex((s) => s.key === "paid"));
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
