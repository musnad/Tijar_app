"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ScanFace } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NinRecord } from "@/lib/kyc/bytid";
import { absoluteAuthUrl } from "@/lib/site-url";
import { kycRequest, verifyShopCac } from "@/services/business-service";
import type { Business } from "@/types/database";

const RECORD_ROWS: { key: keyof NinRecord; label: string }[] = [
  { key: "id_number", label: "ID number" },
  { key: "id_type", label: "ID type" },
  { key: "first_name", label: "First name" },
  { key: "middle_name", label: "Middle name" },
  { key: "last_name", label: "Last name" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "gender", label: "Gender" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "state_of_residence", label: "State of residence" },
];

function ninStorageKey(businessId: string) {
  return `tijar-kyc-nin-${businessId}`;
}

function recordFromDetails(details: Record<string, unknown> | null | undefined, typedNin?: string): NinRecord | null {
  if (!details) return null;
  const str = (key: string) => (typeof details[key] === "string" ? details[key] : null);
  const first = str("first_name");
  const middle = str("middle_name");
  const last = str("last_name");
  const phone = str("phone") ?? str("phone_number");
  const full = str("full_name") || [first, middle, last].filter(Boolean).join(" ") || null;
  if (!first && !full && !str("id_number")) return null;
  return {
    id_number: typedNin && typedNin.length === 11 ? typedNin : str("id_number") ?? "",
    id_type: str("id_type") ?? "NIN",
    first_name: first,
    middle_name: middle,
    last_name: last,
    date_of_birth: str("date_of_birth"),
    gender: str("gender"),
    phone,
    address: str("address"),
    state_of_residence: str("state_of_residence") ?? str("state"),
    state_of_origin: str("state_of_origin"),
    nationality: str("nationality"),
    full_name: full,
  };
}

export function KycSubmitCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const already = business.verification_status === "verified" || Boolean(business.kyc_verified_at);
  const savedStep = String((business.kyc_details as Record<string, unknown> | null)?.step ?? "");
  const [idNumber, setIdNumber] = useState("");
  const [record, setRecord] = useState<NinRecord | null>(
    recordFromDetails(business.kyc_details as Record<string, unknown> | null),
  );
  const [savedOnAccount, setSavedOnAccount] = useState(
    savedStep === "nin_saved" || savedStep === "verified" || business.verification_status === "in_progress",
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

  const displayRecord = useMemo(() => {
    if (!record) return null;
    const typed = digitsOnly(idNumber) || sessionStorage.getItem(ninStorageKey(business.id)) || "";
    if (typed.length === 11) return { ...record, id_number: typed, id_type: "NIN" };
    return record;
  }, [record, idNumber, business.id]);

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
    const next = (result.record as NinRecord | undefined) ?? recordFromDetails(result.person, nin);
    setRecord(next);
    setSavedOnAccount(false);
    toast.success("NIN found. Check the record, then save it on your business account.");
  }

  async function saveRecord() {
    const nin = sessionStorage.getItem(ninStorageKey(business.id)) ?? digitsOnly(idNumber);
    if (digitsOnly(nin).length !== 11) {
      toast.error("Look up your NIN first.");
      return;
    }
    setSaving(true);
    const result = await kycRequest({ action: "save-nin", businessId: business.id, idNumber: nin });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSavedOnAccount(true);
    if (result.record) setRecord(result.record as NinRecord);
    toast.success(result.message ?? "Saved on your business account.");
    await refresh();
  }

  async function startLive() {
    const nin = sessionStorage.getItem(ninStorageKey(business.id)) ?? digitsOnly(idNumber);
    if (digitsOnly(nin).length !== 11) {
      toast.error("Enter your NIN first.");
      return;
    }
    if (!savedOnAccount) {
      toast.error("Save the NIN record on your business account first.");
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
        Enter your NIN to load the official registry record. Save it on this shop, then complete a live camera check.
        You cannot post until this is done. CAC is optional.
      </p>
      {already ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-sm font-bold text-[#1F7A4D]">
            Auto-verified{business.kyc_full_name ? ` · ${business.kyc_full_name}` : ""}
            {business.kyc_id_last4 ? ` · NIN ****${business.kyc_id_last4}` : ""}
            {business.kyc_face_matched ? " · live face matched" : ""}
          </p>
          {record ? <NinRecordCard record={record} /> : null}
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
            {saving && !record ? "Looking up NIN…" : "Fetch NIN record"}
          </Button>
          {displayRecord ? (
            <div className="space-y-3">
              <NinRecordCard record={displayRecord} />
              {savedOnAccount ? (
                <p className="rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-xs font-bold text-[#1F7A4D]">
                  Saved on this business account. Continue to live face verification.
                </p>
              ) : (
                <Button
                  type="button"
                  className="min-h-11 w-full rounded-xl bg-[#0B1F4D] font-extrabold text-white hover:bg-[#0B1F4D]/90"
                  disabled={saving}
                  onClick={() => void saveRecord()}
                >
                  {saving ? "Saving…" : "Save on my business account"}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Next is NIN + face verification. This is a live liveness check — printed photos will not pass.
              </p>
              <Button
                type="button"
                className="min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
                disabled={saving || !savedOnAccount}
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

function NinRecordCard({ record }: { record: NinRecord }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-3">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Record</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">Returned by the registry. Stored encrypted.</p>
      <dl className="mt-3 space-y-2">
        {RECORD_ROWS.map((row) => {
          const value = record[row.key];
          if (!value) return null;
          return (
            <div key={row.key} className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
              <dt className="text-xs font-semibold text-muted-foreground">{row.label}</dt>
              <dd className="font-bold text-[#0B1F4D]">{value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}
