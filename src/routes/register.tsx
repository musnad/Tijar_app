import { createFileRoute } from "@tanstack/react-router";

import { RedirectIfAuthed } from "@/features/app/require-auth";
import { WebRegisterForm } from "@/features/auth/web-register-form";

type RegisterSearch = { intent?: "customer" | "business" };

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => {
    if (search.intent === "business") return { intent: "business" };
    if (search.intent === "customer") return { intent: "customer" };
    return {};
  },
  head: () => ({
    meta: [{ title: "Create account — TIJAR" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicRegisterPage,
});

function PublicRegisterPage() {
  const { intent } = Route.useSearch();
  return (
    <RedirectIfAuthed>
      <WebRegisterForm initialAccountMode={intent ?? "customer"} />
    </RedirectIfAuthed>
  );
}
