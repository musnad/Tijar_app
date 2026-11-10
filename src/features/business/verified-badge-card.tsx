"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, CircleCheck, Circle } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchBadgeEligibility, fetchVerifiedBadgeRequest, requestVerifiedBadge } from "@/services/business-service";
import type { Business } from "@/types/database";

function CheckRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {ok ? (
        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-[#1F7A4D]" />
      ) : (
        <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

export function VerifiedBadgeCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const hasTick = Boolean(business.verified_badge);
  const reqQuery = useQuery({
    queryKey: ["verified-badge-request", business.id],
    enabled: !hasTick,
    queryFn: async () => fetchVerifiedBadgeRequest(business.id),
  });
  const eligQuery = useQuery({
    queryKey: ["verified-badge-eligibility", business.id],
    enabled: !hasTick,
    queryFn: async () => {
      const r = await fetchBadgeEligibility(business.id);
      return r.eligibility;
    },
  });
  const pending = reqQuery.data?.status === "pending" || Boolean(eligQuery.data?.pending);
  const elig = eligQuery.data;
  const canAsk = Boolean(elig?.ok) && !pending && !hasTick;

  const ask = useMutation({
    mutationFn: () => requestVerifiedBadge(business.id),
    onSuccess: ({ error }) => {
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Request sent. An admin will review the verification icon.");
      void queryClient.invalidateQueries({ queryKey: ["verified-badge-request", business.id] });
      void queryClient.invalidateQueries({ queryKey: ["verified-badge-eligibility", business.id] });
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
            Sync eligibility first. Complete NIN verification, fill in your shop details, stay on TIJAR for 1 month, and
            post more than 10 times. Then request — an admin approves the icon.
          </p>
          <ul className="mt-3 space-y-1.5">
            <CheckRow ok={Boolean(elig?.nin_verified)}>
              NIN + live face verified
              {!elig?.nin_verified ? (
                <>
                  {" · "}
                  <Link to="/app/business" className="font-bold text-primary">
                    Verify now
                  </Link>
                </>
              ) : null}
            </CheckRow>
            <CheckRow ok={Boolean(elig?.profile_complete)}>
              Shop information complete
              {elig?.missing?.length ? ` · add ${elig.missing.join(", ")}` : null}
            </CheckRow>
            <CheckRow ok={(elig?.account_days ?? 0) >= (elig?.min_account_days ?? 30)}>
              On TIJAR for {elig?.account_days ?? 0} / {elig?.min_account_days ?? 30} days
            </CheckRow>
            <CheckRow ok={(elig?.post_count ?? 0) > 10}>
              {elig?.post_count ?? 0} / 11 posts
              {(elig?.post_count ?? 0) <= 10 ? (
                <>
                  {" · "}
                  <Link to="/shop/create" className="font-bold text-primary">
                    Post
                  </Link>
                </>
              ) : null}
            </CheckRow>
          </ul>
          <Button
            type="button"
            className="mt-3 min-h-11 w-full rounded-xl"
            disabled={!canAsk || ask.isPending}
            onClick={() => ask.mutate()}
          >
            {pending ? "Request pending" : ask.isPending ? "Sending…" : "Request verification icon"}
          </Button>
          {!elig?.nin_verified && eligQuery.isSuccess ? (
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Finish NIN + live face verification before you can apply.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
