"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { enableWebPush, notificationsGranted, pushSupported } from "@/lib/web-push";
import { fetchNotificationPreferences, saveNotificationPreferences } from "@/services/marketplace-service";
import type { NotificationPreferences } from "@/types/database";

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span>
        <span className="block font-bold">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function NotificationPrefsScreen() {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const [pushOn, setPushOn] = useState(() => notificationsGranted());
  const [enabling, setEnabling] = useState(false);
  const query = useQuery({
    queryKey: ["notification-prefs", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const r = await fetchNotificationPreferences(profile!.id);
      if (r.error && r.error.toLowerCase().includes("does not exist")) return r.prefs;
      if (r.error) throw new Error(r.error);
      return r.prefs;
    },
  });

  const save = useMutation({
    mutationFn: (prefs: NotificationPreferences) => saveNotificationPreferences(prefs),
    onSuccess: async (r) => {
      if (r.error) toast.error(r.error);
      else {
        toast.success("Preferences saved");
        await queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
        await queryClient.invalidateQueries({ queryKey: ["activity-popup"] });
      }
    },
  });

  if (!session || !profile) {
    return (
      <MarketplaceShell>
        <p className="text-sm">
          <Link to="/login" className="font-bold text-primary">
            Sign in
          </Link>{" "}
          to set notification preferences.
        </p>
      </MarketplaceShell>
    );
  }

  const prefs = query.data;

  return (
    <MarketplaceShell>
      <h1 className="text-xl font-extrabold">Notification preferences</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        These control in-app reminders. Turn on push to get alerts on this device even when TIJAR is closed.
      </p>
      {pushSupported() ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <span>
            <span className="block font-bold">Push notifications on this device</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {pushOn ? "On — new posts, likes, comments and orders pop up here." : "Off — tap to allow alerts on this device."}
            </span>
          </span>
          <button
            type="button"
            disabled={enabling || pushOn}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            onClick={async () => {
              setEnabling(true);
              const r = await enableWebPush();
              setEnabling(false);
              if (r.error) toast.error(r.error);
              else {
                setPushOn(true);
                toast.success("Push notifications enabled");
              }
            }}
          >
            {pushOn ? "Enabled" : enabling ? "Enabling…" : "Enable"}
          </button>
        </div>
      ) : null}
      {prefs && (
        <div className="mt-4 space-y-2">
          <Toggle
            label="General notifications"
            hint="Master switch — when on you receive every notification type below."
            checked={prefs.general}
            onChange={(general) =>
              save.mutate(
                general
                  ? { ...prefs, general: true, likes: true, comments: true, order_updates: true }
                  : { ...prefs, general: false },
              )
            }
          />
          <Toggle
            label="Likes"
            hint={
              prefs.general
                ? "On — controlled by General notifications."
                : "When someone likes your product, post or video"
            }
            checked={prefs.general || prefs.likes}
            disabled={prefs.general}
            onChange={(likes) => save.mutate({ ...prefs, likes })}
          />
          <Toggle
            label="Comments"
            hint={
              prefs.general
                ? "On — controlled by General notifications."
                : "When someone comments or replies to you"
            }
            checked={prefs.general || prefs.comments}
            disabled={prefs.general}
            onChange={(comments) => save.mutate({ ...prefs, comments })}
          />
          <Toggle
            label="Purchases & orders"
            hint={
              prefs.general
                ? "On — controlled by General notifications."
                : "When a buyer places an order or a seller updates it"
            }
            checked={prefs.general || prefs.order_updates}
            disabled={prefs.general}
            onChange={(order_updates) => save.mutate({ ...prefs, order_updates })}
          />
          <Toggle
            label="Enquiry replies"
            hint="When a shop responds to a message you sent"
            checked={prefs.enquiry_replies}
            onChange={(enquiry_replies) => save.mutate({ ...prefs, enquiry_replies })}
          />
          <Toggle
            label="Followed shops"
            hint="New products or videos from shops you follow"
            checked={prefs.followed_shops}
            onChange={(followed_shops) => save.mutate({ ...prefs, followed_shops })}
          />
          <Toggle
            label="Marketing"
            hint="Optional platform news. Off by default."
            checked={prefs.marketing}
            onChange={(marketing) => save.mutate({ ...prefs, marketing })}
          />
        </div>
      )}
    </MarketplaceShell>
  );
}
