import { createFileRoute } from "@tanstack/react-router";

import { CreateStoryScreen } from "@/features/marketplace/create-story-screen";

export const Route = createFileRoute("/shop/create-story")({
  component: CreateStoryScreen,
});
