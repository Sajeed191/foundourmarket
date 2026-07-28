import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy Flash Deals admin — superseded by the Flash Deals Command Center. */
export const Route = createFileRoute("/admin-flash-deals")({
  beforeLoad: () => {
    throw redirect({ to: "/admin-merchandising-flash-deals" });
  },
});
