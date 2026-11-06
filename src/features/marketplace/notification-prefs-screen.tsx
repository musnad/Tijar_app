"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { fetchNotificationPreferences, saveNotificationPreferences } from "@/services/marketplace-service";
import type { NotificationPreferences } from "@/types/database";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <span>
        <span className="block font-bold">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <input type="checkbox" className="mt-1 size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function NotificationPrefsScreen() {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
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
        These control in-app reminders. Push notifications are not enabled until a provider is configured.
      </p>
      {prefs && (
        <div className="mt-4 space-y-2">
          <Toggle
            label="Order updates"
            hint="When a seller accepts or updates an order request"
            checked={prefs.order_updates}
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
