"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKycForReview } from "@/services/business-service";
import type { Business } from "@/types/database";

export function KycSubmitCard({ business }: { business: Business }) {
  const status = business.verification_status;
  const locked = status === "verified" || status === "under_review" || status === "submitted";
  const [legalName, setLegalName] = useState(business.business_name);
  const [idType, setIdType] = useState("NIN");
  const [idNumber, setIdNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!legalName.trim() || !idNumber.trim()) {
      toast.error("Enter the legal name and ID number.");
      return;
    }
    setSaving(true);
    const { error } = await submitKycForReview(business.id, { legalName, idType, idNumber, notes });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Submitted for TIJAR review. An admin will verify the shop.");
  }

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-extrabold">Shop approval (KYC)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Status: {status.replace(/_/g, " ")}. Admin can approve your shop without giving the blue tick. Request the
        verification icon separately below.
      </p>
      {locked ? null : (
        <div className="mt-3 space-y-2">
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal business name" />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
            >
              <option value="NIN">NIN</option>
              <option value="CAC">CAC</option>
              <option value="Passport">Passport</option>
              <option value="Driver licence">Driver licence</option>
            </select>
            <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID number" />
          </div>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
          <Button type="button" className="min-h-11 w-full rounded-xl" disabled={saving} onClick={() => void submit()}>
            {saving ? "Submitting…" : "Submit for review"}
          </Button>
        </div>
      )}
    </section>
  );
}
