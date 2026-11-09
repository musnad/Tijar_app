"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { absoluteAuthUrl } from "@/lib/site-url";
import { kycRequest, verifyShopCac } from "@/services/business-service";
import type { Business } from "@/types/database";

type NinPerson = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  phone_number?: string | null;
  state_of_origin?: string | null;
  nationality?: string | null;
  masked_id?: string | null;
  last4?: string | null;
};

function ninStorageKey(businessId: string) {
  return `tijar-kyc-nin-${businessId}`;
}

export function KycSubmitCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const already = business.verification_status === "verified" || Boolean(business.kyc_verified_at);
  const savedPerson = (business.kyc_details ?? null) as NinPerson | null;
  const [idNumber, setIdNumber] = useState("");
  const [person, setPerson] = useState<NinPerson | null>(
    business.verification_status === "in_progress" ? savedPerson : null,
  );
  const [cacNumber, setCacNumber] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
  }

  useEffect(() => {
    if (already) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("liveness_session_id")?.trim();
    const liveStatus = params.get("status")?.trim();
    if (!sessionId) return;
    const storedNin = sessionStorage.getItem(ninStorageKey(business.id)) ?? "";
    if (digitsOnly(storedNin).length !== 11) {
      toast.error("Enter your NIN again to finish live face verification.");
      return;
    }
    if (liveStatus && liveStatus !== "passed") {
      toast.error("Live face check did not pass. Try again.");
      return;
    }
    void finishLive(sessionId, storedNin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  async function lookupNin() {
    const nin = digitsOnly(idNumber);
    if (nin.length !== 11) {
      toast.error("Enter your 11-digit NIN.");
      return;
    }
    setSaving(true);
    const result = await kycRequest({ action: "nin-lookup", businessId: business.id, idNumber: nin });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    sessionStorage.setItem(ninStorageKey(business.id), nin);
    setPerson((result.person as NinPerson | undefined) ?? null);
    toast.success("NIN found. Check that the name is yours, then start live face verification.");
    await refresh();
  }

  async function startLive() {
    const nin = sessionStorage.getItem(ninStorageKey(business.id)) ?? digitsOnly(idNumber);
    if (digitsOnly(nin).length !== 11) {
      toast.error("Enter your NIN first.");
      return;
    }
    sessionStorage.setItem(ninStorageKey(business.id), digitsOnly(nin));
    setSaving(true);
    const result = await kycRequest({
      action: "liveness-start",
      businessId: business.id,
      redirectUrl: absoluteAuthUrl("/app/business"),
    });
    setSaving(false);
    if (result.error || !result.url) {
      toast.error(result.error ?? "Could not start live face check.");
      return;
    }
    window.location.assign(result.url);
  }

  async function finishLive(sessionId: string, nin: string) {
    setSaving(true);
    const result = await kycRequest({
      action: "nin-liveness",
      businessId: business.id,
      idNumber: nin,
      livenessSessionId: sessionId,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    sessionStorage.removeItem(ninStorageKey(business.id));
    toast.success(result.message ?? "Shop verified.");
    const clean = new URL(window.location.href);
    clean.searchParams.delete("liveness_session_id");
    clean.searchParams.delete("status");
    clean.searchParams.delete("reference");
    window.history.replaceState({}, "", clean.pathname + clean.search);
    await refresh();
  }

  async function saveCac() {
    if (!cacNumber.trim()) {
      toast.error("Enter a CAC number such as RC123456.");
      return;
    }
    setSaving(true);
    const result = await verifyShopCac(business.id, cacNumber);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "CAC saved.");
    await refresh();
  }

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
        <BadgeCheck className="size-4 text-[#1F7A4D]" />
        Verify with NIN + live face
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Enter your NIN. We fetch the official name from Bytid. If it is you, complete a live camera check. CAC is
        optional.
      </p>
      {already ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-sm font-bold text-[#1F7A4D]">
            Auto-verified{business.kyc_full_name ? ` · ${business.kyc_full_name}` : ""}
            {business.kyc_id_last4 ? ` · NIN ****${business.kyc_id_last4}` : ""}
            {business.kyc_face_matched ? " · live face matched" : ""}
          </p>
          {business.cac_legal_name || business.cac_number ? (
            <p className="text-xs font-semibold text-muted-foreground">
              CAC {business.cac_number}
              {business.cac_legal_name ? ` · ${business.cac_legal_name}` : ""}
            </p>
          ) : (
            <div className="space-y-2">
              <Input value={cacNumber} onChange={(e) => setCacNumber(e.target.value.toUpperCase())} placeholder="Optional CAC (RC123456)" />
              <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" disabled={saving} onClick={() => void saveCac()}>
                {saving ? "Saving…" : "Save CAC (optional)"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <Input
            inputMode="numeric"
            maxLength={11}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11-digit NIN"
            autoComplete="off"
          />
          <Button
            type="button"
            className="min-h-11 w-full rounded-xl bg-[#0B1F4D] font-extrabold text-white hover:bg-[#0B1F4D]/90"
            disabled={saving}
            onClick={() => void lookupNin()}
          >
            {saving && !person ? "Looking up NIN…" : "Fetch NIN details"}
          </Button>
          {person?.full_name ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Name on NIN</p>
              <p className="mt-1 text-base font-extrabold text-[#0B1F4D]">{person.full_name}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {person.date_of_birth ? <li>DOB · {person.date_of_birth}</li> : null}
                {person.gender ? <li>Gender · {person.gender}</li> : null}
                {person.phone_number ? <li>Phone · {person.phone_number}</li> : null}
                {person.state_of_origin ? <li>State · {person.state_of_origin}</li> : null}
                {person.masked_id ? <li>NIN · {person.masked_id}</li> : null}
              </ul>
              <p className="mt-2 text-xs">If this is you, continue to the live face check. Printed photos will not pass.</p>
              <Button
                type="button"
                className="mt-3 min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
                disabled={saving}
                onClick={() => void startLive()}
              >
                <ScanFace className="size-4" />
                {saving ? "Opening camera…" : "Start live face verification"}
              </Button>
            </div>
          ) : null}
          <Input
            value={cacNumber}
            onChange={(e) => setCacNumber(e.target.value.toUpperCase())}
            placeholder="CAC number (optional, e.g. RC123456)"
          />
        </div>
      )}
    </section>
  );
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}
