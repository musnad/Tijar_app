"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { cn } from "@/lib/utils";
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
      <MarketplaceShell hideTopBar variant="feed">
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
          <NativePageHeader title="Notifications" showBack />
          <p className="px-4 pt-2 text-sm">
            <Link to="/login" className="font-bold text-primary">
              Sign in
            </Link>{" "}
            to set notification preferences.
          </p>
        </div>
      </MarketplaceShell>
    );
  }

  const prefs = query.data;

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader
          title="Notification preferences"
          subtitle="These control in-app reminders. Push is off until a provider is configured."
          showBack
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
      {prefs && (
        <div className="mt-2 space-y-2">
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
        </div>
      </div>
    </MarketplaceShell>
  );
}
