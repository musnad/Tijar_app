"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKycForReview, verifyShopIdentity } from "@/services/business-service";
import type { Business } from "@/types/database";

export function KycSubmitCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const status = business.verification_status;
  const already = status === "verified" || Boolean(business.kyc_verified_at);
  const [idType, setIdType] = useState<"bvn" | "nin">("bvn");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [legalName, setLegalName] = useState(business.business_name);
  const [otherIdType, setOtherIdType] = useState("CAC");
  const [otherIdNumber, setOtherIdNumber] = useState("");

  async function verify() {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error("Enter the first and last name on the ID.");
      return;
    }
    if (idNumber.replace(/\D/g, "").length !== 11) {
      toast.error(`Enter an 11-digit ${idType.toUpperCase()}.`);
      return;
    }
    setSaving(true);
    const result = await verifyShopIdentity({
      businessId: business.id,
      idType,
      idNumber,
      firstName,
      lastName,
      dob: dob || undefined,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "Shop identity verified.");
    setIdNumber("");
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
  }

  async function submitOther() {
    if (!legalName.trim() || !otherIdNumber.trim()) {
      toast.error("Enter the legal name and ID number.");
      return;
    }
    setSaving(true);
    const { error } = await submitKycForReview(business.id, {
      legalName,
      idType: otherIdType,
      idNumber: otherIdNumber,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Submitted for TIJAR review. An admin will check this document.");
  }

  const verifiedName = business.kyc_full_name;

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
        <BadgeCheck className="size-4 text-[#1F7A4D]" />
        Shop identity (BVN / NIN)
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        We check the number with Bytid. Matching name verifies the shop. The blue tick is still a separate admin
        request.
      </p>
      {already ? (
        <p className="mt-3 rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-sm font-bold text-[#1F7A4D]">
          Verified{verifiedName ? ` · ${verifiedName}` : ""}
          {business.kyc_id_last4
            ? ` · ${(business.kyc_id_type || "ID").toUpperCase()} ****${business.kyc_id_last4}`
            : ""}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`min-h-11 rounded-xl border text-sm font-bold ${
                idType === "bvn" ? "border-[#0B1F4D] bg-[#0B1F4D] text-white" : "border-input bg-background"
              }`}
              onClick={() => setIdType("bvn")}
            >
              BVN
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-xl border text-sm font-bold ${
                idType === "nin" ? "border-[#0B1F4D] bg-[#0B1F4D] text-white" : "border-input bg-background"
              }`}
              onClick={() => setIdType("nin")}
            >
              NIN
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" />
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" />
          </div>
          <Input
            inputMode="numeric"
            maxLength={11}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={`11-digit ${idType.toUpperCase()}`}
            autoComplete="off"
          />
          <label className="block text-xs font-bold text-muted-foreground">
            Date of birth (optional)
            <Input className="mt-1" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <Button
            type="button"
            className="min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            disabled={saving}
            onClick={() => void verify()}
          >
            {saving ? "Checking…" : `Verify ${idType.toUpperCase()}`}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs font-semibold text-muted-foreground underline"
            onClick={() => setOtherOpen((v) => !v)}
          >
            {otherOpen ? "Hide other documents" : "I have CAC or another ID instead"}
          </button>
          {otherOpen ? (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Admin review only. This does not auto-approve the shop.</p>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal business name" />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
                  value={otherIdType}
                  onChange={(e) => setOtherIdType(e.target.value)}
                >
                  <option value="CAC">CAC</option>
                  <option value="Passport">Passport</option>
                  <option value="Driver licence">Driver licence</option>
                </select>
                <Input value={otherIdNumber} onChange={(e) => setOtherIdNumber(e.target.value)} placeholder="ID number" />
              </div>
              <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" disabled={saving} onClick={() => void submitOther()}>
                Submit for review
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
