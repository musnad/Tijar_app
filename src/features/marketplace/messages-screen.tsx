"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { useStartShopChat } from "@/features/marketplace/use-start-shop-chat";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { fetchDirectMessages, sendDirectMessage } from "@/services/direct-chat-service";
import {
  fetchMyBusinessIds,
  fetchShopInbox,
  fetchShopMessages,
  sendShopMessage,
  type ShopChatMessage,
} from "@/services/shop-chat-service";

function MessagesFrame({ children }: { children: ReactNode }) {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">{children}</div>
    </MarketplaceShell>
  );
}

export function EnquiriesScreen() {
  const { profile, session, loading } = useAuth();
  const startChat = useStartShopChat();
  const shops = useMemo(() => [] as { id: string; name: string; logo: string | null; slug: string | null }[], []);

  const inboxQuery = useQuery({
    queryKey: ["shop-inbox", profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 8_000,
    queryFn: async () => {
      const ids = await fetchMyBusinessIds(profile!.id);
      const r = await fetchShopInbox(profile!.id, ids);
      if (r.error) throw new Error(r.error);
      return r.rows;
    },
  });

  if (loading) {
    return (
      <MessagesFrame>
        <Header title="Messages" subtitle="Chat with shops on TIJAR" />
        <p className="px-4 pt-6 text-sm text-muted-foreground">Loading…</p>
      </MessagesFrame>
    );
  }

  if (!session || !profile) {
    return (
      <MessagesFrame>
        <Header title="Messages" />
        <div className="px-4 py-10 text-center">
          <Mail className="mx-auto size-10 text-primary" />
          <p className="mt-3 font-extrabold">Sign in to message shops</p>
          <p className="mt-1 text-sm text-muted-foreground">Talk to a business about a product, order, or custom request.</p>
          <Button className="mt-4 min-h-11 rounded-full font-bold" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </MessagesFrame>
    );
  }

  const rows = inboxQuery.data ?? [];

  return (
    <MessagesFrame>
      <Header title="Messages" subtitle="Chat with shops on TIJAR" />
      <div
        className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {inboxQuery.isLoading && <p className="px-4 pt-6 text-sm text-muted-foreground">Loading chats…</p>}
        {!inboxQuery.isLoading && rows.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Mail className="mx-auto size-10 text-primary" />
            <p className="mt-3 font-extrabold">No chats yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Message a shop from a product, or start one below.</p>
          </div>
        )}
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to="/shop/enquiries/$conversationId"
                params={{ conversationId: row.id }}
                className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3"
              >
                <Avatar name={row.as_seller ? row.customer_name : row.business_name} src={row.as_seller ? null : row.logo_url} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate font-extrabold">
                      {row.as_seller ? row.customer_name : row.business_name}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(row.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                  <p className={cn("truncate text-[13px]", row.unread ? "font-bold text-foreground" : "text-muted-foreground")}>
                    {row.as_seller ? "Shop chat · " : ""}
                    {row.last_preview || "No messages yet"}
                  </p>
                </div>
                {row.unread ? <span className="size-2.5 shrink-0 rounded-full bg-primary" /> : null}
              </Link>
            </li>
          ))}
        </ul>
        <section className="px-4 py-5">
          <h2 className="text-[13px] font-extrabold">Message a shop</h2>
          <ul className="mt-2 space-y-2">
            {shops.map((shop) => (
              <li key={shop.id}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 text-left"
                  onClick={() =>
                    void startChat({
                      businessId: shop.id,
                      businessName: shop.name,
                      logoUrl: shop.logo,
                      businessSlug: shop.slug,
                    })
                  }
                >
                  <Avatar name={shop.name} src={shop.logo} />
                  <span className="min-w-0 flex-1 font-bold">{shop.name}</span>
                  <span className="text-[12px] font-bold text-primary">Chat</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </MessagesFrame>
  );
}

export function ShopChatThreadScreen({ conversationId }: { conversationId: string }) {
  const { profile, session, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ["shop-thread", conversationId, profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 4_000,
    queryFn: async () => {
      if (conversationId.startsWith("dm:")) {
        const r = await fetchDirectMessages(conversationId, profile!.id);
        if (r.error) throw new Error(r.error);
        return {
          inbox: {
            id: conversationId,
            business_id: "",
            customer_id: profile!.id,
            last_preview: "",
            last_message_at: new Date().toISOString(),
            business_name: r.otherName,
            logo_url: r.otherAvatar,
            business_slug: null,
            customer_name: r.otherName,
            as_seller: false,
            unread: false,
            threadKind: "direct" as const,
          },
          messages: r.messages.map((m) => ({
            id: m.id,
            conversation_id: conversationId,
            sender_id: m.sender_id,
            body: m.body,
            created_at: m.created_at,
            role: (m.sender_id === profile!.id ? "customer" : "business") as ShopChatMessage["role"],
          })),
        };
      }
      const r = await fetchShopMessages(conversationId, profile!.id);
      if (r.error) throw new Error(r.error);
      return r;
    },
  });

  useEffect(() => {
    function onMock() {
      void query.refetch();
      void queryClient.invalidateQueries({ queryKey: ["shop-inbox"] });
    }
    window.addEventListener("tijar-shop-chat", onMock);
    return () => window.removeEventListener("tijar-shop-chat", onMock);
  }, [query, queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [query.data?.messages.length]);

  if (loading) {
    return (
      <MessagesFrame>
        <Header title="Messages" />
        <p className="px-4 pt-6 text-sm text-muted-foreground">Loading…</p>
      </MessagesFrame>
    );
  }

  if (!session || !profile) {
    return (
      <MessagesFrame>
        <Header title="Messages" />
        <p className="px-4 pt-6 text-sm">
          <Link to="/login" className="font-bold text-primary">
            Sign in
          </Link>{" "}
          to continue this chat.
        </p>
      </MessagesFrame>
    );
  }

  const inbox = query.data?.inbox ?? null;
  const messages = query.data?.messages ?? [];
  const asSeller = inbox?.as_seller ?? false;
  const title = asSeller ? (inbox?.customer_name ?? "Customer") : (inbox?.business_name ?? "Shop");

  async function send() {
    const body = text.trim();
    if (!body || !profile) return;
    haptic();
    setBusy(true);
    const r = conversationId.startsWith("dm:")
      ? await sendDirectMessage({ threadId: conversationId.replace(/^dm:/, ""), senderId: profile.id, body })
      : await sendShopMessage({
          conversationId,
          senderId: profile.id,
          body,
          asSeller,
        });
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setText("");
    await query.refetch();
    await queryClient.invalidateQueries({ queryKey: ["shop-inbox"] });
  }

  return (
    <MessagesFrame>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-full"
          aria-label="Back to messages"
          onClick={() => void navigate({ to: "/shop/enquiries" })}
        >
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={title} src={asSeller ? null : inbox?.logo_url ?? null} />
        <div className="min-w-0">
          <p className="truncate font-extrabold leading-tight">{title}</p>
          <p className="text-[11px] text-muted-foreground">{asSeller ? "Customer on TIJAR" : "Usually replies here"}</p>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {query.isLoading && <p className="text-center text-sm text-muted-foreground">Loading chat…</p>}
        {query.isError && (
          <p className="text-center text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Could not load chat."}</p>
        )}
        {messages.length === 0 && !query.isLoading && (
          <p className="px-6 pt-8 text-center text-sm text-muted-foreground">Say hello. Ask about stock, size, delivery, or a custom order.</p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} mine={isMine(m, profile.id, asSeller)} body={m.body} at={m.created_at} />
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t border-border px-3 py-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          rows={1}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-muted/50 px-3 py-2.5 text-[15px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="submit" size="icon" className="size-11 rounded-full" disabled={busy || !text.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </MessagesFrame>
  );
}

function isMine(message: ShopChatMessage, profileId: string, asSeller: boolean): boolean {
  if (message.sender_id === profileId) return true;
  if (asSeller) return message.role === "business";
  return message.role === "customer" && message.sender_id === profileId;
}

function Bubble({ mine, body, at }: { mine: boolean; body: string; at: string }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-[15px] leading-snug",
          mine ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{body}</p>
        <p className={cn("mt-1 text-[10px]", mine ? "text-white/70" : "text-muted-foreground")}>
          {new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="shrink-0 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return <img src={src} alt="" className="size-12 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
      {name.slice(0, 1)}
    </span>
  );
}
