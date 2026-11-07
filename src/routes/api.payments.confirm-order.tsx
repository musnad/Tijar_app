import { createFileRoute } from "@tanstack/react-router";

import {
  applyPlatformFee,
  findRecentShopCredit,
  loadReceivingAccount,
  notifyShopBuyerEvent,
  signedInAdmin,
  syncCorvWallet,
} from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/payments/confirm-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          businessId?: string;
          amount?: number;
          orderId?: string;
          kind?: "place_order" | "marketplace" | "bid";
          itemLabel?: string;
          watchedFrom?: string;
        };
        const businessId = body.businessId?.trim();
        const orderId = body.orderId?.trim();
        const amount = Number(body.amount);
        const kind = body.kind ?? "marketplace";
        if (!businessId || !orderId || !Number.isFinite(amount) || amount <= 0) {
          return Response.json({ error: "Missing order details." }, { status: 400 });
        }
        const ctx = await signedInAdmin(request);
        if ("error" in ctx) return ctx.error;
        const account = await loadReceivingAccount(ctx.admin, businessId);
        if (!account) {
          return Response.json({ error: "This shop has no virtual account yet." }, { status: 400 });
        }
        await syncCorvWallet(ctx.admin, businessId, [
          { accountNumber: account.accountNumber, reference: null },
        ]);
        const credit = await findRecentShopCredit(businessId, amount, body.watchedFrom);
        if (!credit) {
          return Response.json({
            paid: false,
            error: "No matching transfer on this shop account yet. Send the money, wait a moment, then tap I’ve made the payment again.",
          });
        }

        const buyerName = ctx.profile.full_name?.trim() || "A customer";
        const item = body.itemLabel?.trim() || "an order";
        const money = `₦${amount.toLocaleString("en-NG")}`;

        if (kind === "place_order") {
          await ctx.admin
            .from("place_order_requests")
            .update({ status: "paid", buyer_marked_paid_at: new Date().toISOString() })
            .eq("id", orderId)
            .eq("buyer_id", ctx.profile.id);
        } else if (kind === "bid") {
          await ctx.admin
            .from("video_posts")
            .update({ bid_buyer_marked_paid_at: new Date().toISOString() })
            .eq("id", orderId);
        } else {
          const paid = await ctx.admin.rpc("buyer_mark_transfer_paid", { p_order_id: orderId });
          if (paid.error) {
            await ctx.admin
              .from("orders")
              .update({
                buyer_marked_paid_at: new Date().toISOString(),
                payment_method: "transfer",
                payment_destination: "seller",
              })
              .eq("id", orderId)
              .eq("buyer_profile_id", ctx.profile.id);
          }
          await ctx.admin
            .from("orders")
            .update({ status: "paid" })
            .eq("id", orderId)
            .eq("buyer_profile_id", ctx.profile.id);
        }

        const fee = await applyPlatformFee(ctx.admin, {
          source: kind === "place_order" ? "place_order" : kind === "bid" ? "bid" : "marketplace",
          sourceId: orderId,
          businessId,
          gross: amount,
        });
        const notifyKind =
          kind === "place_order" ? "place_order_paid" : kind === "bid" ? "bid_paid" : "purchase";
        await notifyShopBuyerEvent(ctx.admin, {
          businessId,
          buyerId: ctx.profile.id,
          kind: notifyKind,
          title: `${buyerName} paid ${money}`,
          body: `${buyerName} paid ${money} for ${item} into ${account.accountNumber}. You keep ₦${fee.net.toLocaleString("en-NG")} after the 3% TIJAR fee of ₦${fee.fee.toLocaleString("en-NG")}.`,
        });

        return Response.json({ paid: true, reference: credit.reference, platformFee: fee.fee, sellerNet: fee.net });
      },
    },
  },
});
