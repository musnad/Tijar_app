import { createFileRoute } from "@tanstack/react-router";

import { RedirectIfAuthed } from "@/features/app/require-auth";
import { WebRegisterForm } from "@/features/auth/web-register-form";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [{ title: "Create account — TIJAR" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicRegisterPage,
});

function PublicRegisterPage() {
  return (
    <RedirectIfAuthed>
      <WebRegisterForm />
    </RedirectIfAuthed>
  );
}
