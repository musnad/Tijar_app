"use client";

import { AuthSelectField, authIcons } from "@/features/auth/auth-ui";
import { WebAuthSelect } from "@/features/auth/web-auth-fields";
import { NIGERIA_STATE_NAMES, lgasForState } from "@/lib/nigeria-locations";

export function NigeriaAreaFields({
  state,
  lga,
  onState,
  onLga,
  variant = "plain",
}: {
  state: string;
  lga: string;
  onState: (value: string) => void;
  onLga: (value: string) => void;
  variant?: "web" | "app" | "plain";
}) {
  const stateOptions = NIGERIA_STATE_NAMES.map((name) => ({ value: name, label: name }));
  const lgaOptions = lgasForState(state).map((name) => ({ value: name, label: name }));

  function changeState(value: string) {
    onState(value);
    onLga("");
  }

  if (variant === "web") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <WebAuthSelect
          id="reg-state"
          label="State"
          icon={authIcons.map}
          value={state}
          onChange={changeState}
          placeholder="Select state"
          options={stateOptions}
        />
        <WebAuthSelect
          id="reg-lga"
          label="Local government"
          icon={authIcons.map}
          value={lga}
          onChange={onLga}
          placeholder={state ? "Select LGA" : "Pick a state first"}
          options={lgaOptions}
        />
      </div>
    );
  }

  if (variant === "app") {
    return (
      <div className="space-y-4">
        <AuthSelectField
          id="reg-state"
          label="State"
          icon={authIcons.map}
          value={state}
          onChange={changeState}
          placeholder="Select state"
          options={stateOptions}
        />
        <AuthSelectField
          id="reg-lga"
          label="Local government"
          icon={authIcons.map}
          value={lga}
          onChange={onLga}
          placeholder={state ? "Select LGA" : "Pick a state first"}
          options={lgaOptions}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-semibold">
        State
        <select
          className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
          value={state}
          onChange={(e) => changeState(e.target.value)}
          aria-label="State"
        >
          <option value="">Select state</option>
          {NIGERIA_STATE_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Local government
        <select
          className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
          value={lga}
          onChange={(e) => onLga(e.target.value)}
          disabled={!state}
          aria-label="Local government area"
        >
          <option value="">{state ? "Select LGA" : "Pick a state first"}</option>
          {lgasForState(state).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
