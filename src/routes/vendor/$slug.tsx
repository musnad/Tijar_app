import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor/$slug")({
  loader: async ({ params }) => {
    throw redirect({
      to: "/b/$slug",
      params: { slug: params.slug },
    });
  },
  component: () => null,
});
