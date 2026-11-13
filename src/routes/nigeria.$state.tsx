import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/nigeria/$state")({
  component: () => <Outlet />,
});
