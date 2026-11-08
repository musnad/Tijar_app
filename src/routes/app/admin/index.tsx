import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { AppShell } from "@/features/app/app-shell";
import { RequireAuth } from "@/features/app/require-auth";

const AdminConsoleScreen = lazy(() =>
  import("@/features/admin/admin-console-screen").then((m) => ({ default: m.AdminConsoleScreen })),
);

export const Route = createFileRoute("/app/admin/")({
  component: AdminPage,
});

function AdminPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading admin…</p>}>
          <AdminConsoleScreen />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
