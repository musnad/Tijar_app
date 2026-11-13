"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveSellerTransferPin } from "@/services/marketplace-service";

export type WalletPinMode = "create" | "change" | "forget" | "withdraw";

export function PinBoxes({
  label,
  value,
  onChange,
  autoFocus,
  hidden,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  hidden: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold">{label}</span>
      <Input
        className="mt-1 min-h-12 rounded-xl text-center text-2xl font-extrabold tracking-[0.55em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        autoFocus={autoFocus}
        type={hidden ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
    </label>
  );
}

export function WalletPinDialog({
  open,
  onOpenChange,
  mode,
  businessId,
  onSaved,
  onWithdraw,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: WalletPinMode;
  businessId: string;
  onSaved?: (pin: string) => void | Promise<void>;
  onWithdraw?: (pin: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [password, setPassword] = useState("");
  const [hidePin, setHidePin] = useState(true);
  const [saving, setSaving] = useState(false);
  const working = busy || saving;

  function reset() {
    setPin("");
    setConfirmPin("");
    setCurrentPin("");
    setPassword("");
  }

  async function submit() {
    setSaving(true);
    try {
      if (mode === "withdraw") {
        await onWithdraw?.(pin);
        return;
      }
      const saved = await saveSellerTransferPin(businessId, {
        pin,
        confirmPin,
        currentPin: mode === "change" ? currentPin : undefined,
        forgot: mode === "forget",
        password: mode === "forget" ? password : undefined,
      });
      if (saved.error) {
        toast.error(saved.error);
        return;
      }
      toast.success(saved.message ?? "Wallet PIN saved.");
      const created = pin;
      reset();
      onOpenChange(false);
      await onSaved?.(created);
    } catch {
      toast.error(mode === "withdraw" ? "Could not confirm PIN." : "Could not save the PIN.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "change"
      ? "Change PIN"
      : mode === "forget"
        ? "Forgot PIN"
        : mode === "create"
          ? "Create PIN"
          : "Enter PIN";
  const copy =
    mode === "withdraw"
      ? "Enter your 4-digit wallet PIN to send this withdrawal."
      : mode === "forget"
        ? "Confirm your TIJAR password, then choose a new 4-digit wallet PIN."
        : "This PIN is required when money leaves this wallet. Do not use 1234 or the same digit four times.";

  const canSave =
    pin.length === 4 &&
    (mode === "withdraw" || confirmPin.length === 4) &&
    (mode !== "change" || currentPin.length === 4) &&
    (mode !== "forget" || password.length >= 6);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-sm rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{copy}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0B1F4D]"
            onClick={() => setHidePin((v) => !v)}
          >
            {hidePin ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {hidePin ? "Show PIN" : "Hide PIN"}
          </button>
          {mode === "forget" ? (
            <label className="block">
              <span className="text-xs font-bold">Account password</span>
              <Input
                className="mt-1 min-h-11 rounded-xl"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your TIJAR login password"
              />
            </label>
          ) : null}
          {mode === "change" ? (
            <PinBoxes label="Current PIN" value={currentPin} onChange={setCurrentPin} autoFocus hidden={hidePin} />
          ) : null}
          <PinBoxes
            label={mode === "withdraw" ? "Wallet PIN" : "New PIN"}
            value={pin}
            onChange={setPin}
            autoFocus={mode !== "change" && mode !== "forget"}
            hidden={hidePin}
          />
          {mode !== "withdraw" ? (
            <PinBoxes label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} hidden={hidePin} />
          ) : null}
          <Button
            type="button"
            className="min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            disabled={working || !canSave}
            onClick={() => void submit()}
          >
            {working
              ? mode === "withdraw"
                ? "Sending…"
                : "Saving…"
              : mode === "withdraw"
                ? "Confirm"
                : mode === "forget"
                  ? "Reset PIN"
                  : "Save PIN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
