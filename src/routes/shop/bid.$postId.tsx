import { createFileRoute } from "@tanstack/react-router";

import { BidDetailScreen } from "@/features/marketplace/bid-detail-screen";

export const Route = createFileRoute("/shop/bid/$postId")({
  component: BidDetailPage,
});

function BidDetailPage() {
  const { postId } = Route.useParams();
  return <BidDetailScreen postId={postId} />;
}
