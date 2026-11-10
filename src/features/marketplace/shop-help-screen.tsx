"use client";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { cn } from "@/lib/utils";

const TOPICS = [
  {
    title: "Your profile",
    body: "Name, photo, and bio help shops know who they are talking to. You can hide location until you add an address.",
  },
  {
    title: "Privacy",
    body: "Chats are only between you and the shop. TIJAR does not sell your personal data. Turn alerts off in Settings anytime.",
  },
  {
    title: "Orders and saved items",
    body: "My Orders tracks purchases. Saved Products keeps listings you add to cart or heart. Following is shops and people you follow. Followers is who follows you or your shop.",
  },
  {
    title: "Selling",
    body: "Sell is for approved business accounts. If you do not have one, send a request from Sell. An admin must approve it first.",
  },
  {
    title: "Safety",
    body: "Never pay outside TIJAR checkout if you do not know the seller. Report a shop from their storefront if something is wrong.",
  },
];

export function ShopHelpScreen() {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader title="Help" subtitle="How TIJAR works for shoppers and sellers." showBack />
        <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-8"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <ul className="mt-5 space-y-3">
          {TOPICS.map((topic) => (
            <li key={topic.title} className="rounded-2xl border border-border bg-white p-4">
              <p className="font-extrabold text-[color:var(--brand-navy,#001B3A)]">{topic.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{topic.body}</p>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </MarketplaceShell>
  );
}
