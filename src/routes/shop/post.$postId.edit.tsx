import { createFileRoute } from "@tanstack/react-router";

import { EditPostScreen } from "@/features/videos/edit-post-screen";

export const Route = createFileRoute("/shop/post/$postId/edit")({
  component: EditPostPage,
});

function EditPostPage() {
  const { postId } = Route.useParams();
  return <EditPostScreen postId={postId} />;
}
