import { createFileRoute } from "@tanstack/react-router";

import { PublicProfileScreen } from "@/features/marketplace/public-profile-screen";

export const Route = createFileRoute("/shop/u/$profileId")({
  validateSearch: (s: Record<string, unknown>) => ({
    post: typeof s["post"] === "string" ? (s["post"] as string) : undefined,
  }),
  component: Page,
});

function Page() {
  const { profileId } = Route.useParams();
  const { post } = Route.useSearch();
  return <PublicProfileScreen profileId={profileId} postId={post ?? null} />;
}
