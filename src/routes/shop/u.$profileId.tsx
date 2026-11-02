import { createFileRoute } from "@tanstack/react-router";

import { BidderProfileScreen } from "@/features/marketplace/bidder-profile-screen";

export const Route = createFileRoute("/shop/u/$profileId")({
  validateSearch: (s: Record<string, unknown>) => ({
    post: typeof s["post"] === "string" ? (s["post"] as string) : undefined,
  }),
  component: Page,
});

function Page() {
  const { profileId } = Route.useParams();
  const { post } = Route.useSearch();
  return <BidderProfileScreen profileId={profileId} postId={post ?? null} />;
}
