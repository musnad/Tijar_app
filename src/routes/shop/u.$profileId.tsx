import { createFileRoute } from "@tanstack/react-router";

import { PublicProfileScreen } from "@/features/marketplace/public-profile-screen";

export const Route = createFileRoute("/shop/u/$profileId")({
  validateSearch: (s: Record<string, unknown>) => ({
    post: typeof s["post"] === "string" ? (s["post"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Profile on TIJAR" },
      { name: "description", content: "See this person on TIJAR." },
      { property: "og:type", content: "profile" },
      { property: "og:title", content: "Profile on TIJAR" },
      { property: "og:description", content: "Open this profile on tijar.ng" },
      { property: "og:image", content: "https://www.tijar.ng/tijar-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.tijar.ng/tijar-logo.png" },
    ],
  }),
  component: Page,
});

function Page() {
  const { profileId } = Route.useParams();
  const { post } = Route.useSearch();
  return <PublicProfileScreen profileId={profileId} postId={post ?? null} />;
}
