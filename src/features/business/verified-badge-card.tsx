"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchVerifiedBadgeRequest, requestVerifiedBadge } from "@/services/business-service";
import type { Business } from "@/types/database";

export function VerifiedBadgeCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const hasTick = Boolean(business.verified_badge);
  const reqQuery = useQuery({
    queryKey: ["verified-badge-request", business.id],
    enabled: !hasTick,
    queryFn: async () => fetchVerifiedBadgeRequest(business.id),
  });
  const pending = reqQuery.data?.status === "pending";

  const ask = useMutation({
    mutationFn: () => requestVerifiedBadge(business.id),
    onSuccess: ({ error }) => {
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Request sent. An admin can grant the verification icon from the dashboard.");
      void queryClient.invalidateQueries({ queryKey: ["verified-badge-request", business.id] });
    },
  });

  return (
    <section className="mt-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
        <BadgeCheck className="size-4 text-primary" />
        Verification icon
      </h2>
      {hasTick ? (
        <p className="mt-1 text-xs text-muted-foreground">
          This shop has the blue tick. Only TIJAR admin can add or remove it.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            The tick is not added when your shop is approved. Ask admin to assign it, or send a request from here.
          </p>
          <Button
            type="button"
            className="mt-3 min-h-11 w-full rounded-xl"
            disabled={pending || ask.isPending}
            onClick={() => ask.mutate()}
          >
            {pending ? "Request pending" : ask.isPending ? "Sending…" : "Request verification icon"}
          </Button>
        </>
      )}
    </section>
  );
}
