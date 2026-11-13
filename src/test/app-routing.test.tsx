import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches Record Sales at /app/sales", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/app/sales");
    expect(matches.some((m) => m.routeId.includes("/sales"))).toBe(true);
  });

  it("matches new sale form at /app/record", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/app/record");
    expect(matches.at(-1)?.routeId).toBe("/app/record");
  });

  it("matches Record Expense at /app/expenses", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/app/expenses");
    expect(matches.some((m) => m.routeId.includes("/expenses"))).toBe(true);
  });

  it("matches public Nigeria directory routes", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/nigeria").at(-1)?.routeId).toBe("/nigeria/");
    expect(router.matchRoutes("/nigeria/kano").some((m) => m.routeId.includes("/nigeria/$state"))).toBe(true);
    expect(router.matchRoutes("/nigeria/kano/dan-wake").some((m) => m.routeId.includes("$category"))).toBe(true);
    expect(router.matchRoutes("/vendor/amina-danwake-kano").at(-1)?.routeId).toBe("/vendor/$slug");
  });

  it("matches add customer at /app/customers/new", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/app/customers/new");
    expect(matches.at(-1)?.routeId).toBe("/app/customers/new");
  });

  it("matches new credit at /app/customers/credit/new", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/app/customers/credit/new");
    expect(matches.at(-1)?.routeId).toBe("/app/customers/credit/new");
  });
});
