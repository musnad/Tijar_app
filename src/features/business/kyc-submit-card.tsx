"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyShopCac, verifyShopIdentity } from "@/services/business-service";
import type { Business } from "@/types/database";

export function KycSubmitCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const already = business.verification_status === "verified" || Boolean(business.kyc_verified_at);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [dob, setDob] = useState("");
  const [selfie, setSelfie] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
  }

  async function onSelfie(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await compressSelfie(file);
      setSelfie(dataUrl);
    } catch {
      toast.error("Could not read that photo. Try another selfie.");
    }
  }

  async function verify() {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error("Enter the first and last name on your NIN.");
      return;
    }
    if (idNumber.replace(/\D/g, "").length !== 11) {
      toast.error("Enter an 11-digit NIN.");
      return;
    }
    if (!selfie) {
      toast.error("Take a selfie so we can match your face to the NIN.");
      return;
    }
    setSaving(true);
    const result = await verifyShopIdentity({
      businessId: business.id,
      idNumber,
      firstName,
      lastName,
      dob: dob || undefined,
      selfieImage: selfie,
      cacNumber: cacNumber.trim() || undefined,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "Shop verified.");
    setIdNumber("");
    setSelfie("");
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
        Verify with NIN + face
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Enter your NIN and take a selfie. If the name and face match, the shop is verified immediately. CAC is optional
        for registered companies.
      </p>
      {already ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-sm font-bold text-[#1F7A4D]">
            Auto-verified{business.kyc_full_name ? ` · ${business.kyc_full_name}` : ""}
            {business.kyc_id_last4 ? ` · NIN ****${business.kyc_id_last4}` : ""}
            {business.kyc_face_matched ? " · face matched" : ""}
          </p>
          {business.cac_legal_name || business.cac_number ? (
            <p className="text-xs font-semibold text-muted-foreground">
              CAC {business.cac_number}
              {business.cac_legal_name ? ` · ${business.cac_legal_name}` : ""}
            </p>
          ) : (
            <div className="space-y-2">
              <Input
                value={cacNumber}
                onChange={(e) => setCacNumber(e.target.value.toUpperCase())}
                placeholder="Optional CAC (RC123456)"
              />
              <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" disabled={saving} onClick={() => void saveCac()}>
                {saving ? "Saving…" : "Save CAC (optional)"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" />
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" />
          </div>
          <Input
            inputMode="numeric"
            maxLength={11}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11-digit NIN"
            autoComplete="off"
          />
          <label className="block text-xs font-bold text-muted-foreground">
            Date of birth (optional)
            <Input className="mt-1" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => void onSelfie(e.target.files?.[0])}
          />
          <button
            type="button"
            className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-muted/40"
            onClick={() => fileRef.current?.click()}
          >
            {selfie ? (
              <img src={selfie} alt="Selfie preview" className="size-20 rounded-full object-cover" />
            ) : (
              <>
                <Camera className="size-6 text-[#0B1F4D]" />
                <span className="text-sm font-bold">Take a selfie</span>
                <span className="text-[11px] text-muted-foreground">Face the camera in good light</span>
              </>
            )}
          </button>
          <Input
            value={cacNumber}
            onChange={(e) => setCacNumber(e.target.value.toUpperCase())}
            placeholder="CAC number (optional, e.g. RC123456)"
          />
          <Button
            type="button"
            className="min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            disabled={saving}
            onClick={() => void verify()}
          >
            {saving ? "Verifying…" : "Verify and auto-approve"}
          </Button>
        </div>
      )}
    </section>
  );
}

async function compressSelfie(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 720;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}
