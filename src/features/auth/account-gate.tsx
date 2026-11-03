"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/auth-context";

export type GateReason = "like" | "comment" | "buy" | "cart" | "profile" | "follow" | "sell" | "generic";

const REASON_COPY: Record<GateReason, string> = {
  like: "Create a free account to like posts.",
  comment: "Create a free account to join the conversation.",
  buy: "Create a free account to buy this item.",
  cart: "Create a free account to add items to your cart.",
  profile: "Create a free account to open your profile.",
  follow: "Create a free account to follow shops.",
  sell: "Create a free account to post and sell.",
  generic: "Create a free account to continue.",
};

const WELCOME_SEEN_KEY = "tijar-welcome-seen";

type AccountGateValue = {
  /** Returns true when signed in; otherwise opens the register/sign-in prompt. */
  requireAccount: (reason?: GateReason) => boolean;
};

const AccountGateContext = createContext<AccountGateValue | undefined>(undefined);

export function useAccountGate(): AccountGateValue {
  const ctx = useContext(AccountGateContext);
  if (!ctx) throw new Error("useAccountGate must be used within AccountGateProvider");
  return ctx;
}

function AuthChoiceDialog({
  open,
  onOpenChange,
  title,
  description,
  exitLabel = "Not now",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  exitLabel?: string;
}) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-xl font-extrabold text-[#001B3A]">{title}</DialogTitle>
          <DialogDescription className="text-sm text-[#5a6578]">{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 pt-1">
          <Button asChild className="h-12 rounded-2xl text-sm font-bold">
            <Link to="/register" search={{ intent: "customer" } as never} onClick={close}>
              Register as a customer
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 rounded-2xl text-sm font-bold">
            <Link to="/register" search={{ intent: "business" } as never} onClick={close}>
              Register as a business
            </Link>
          </Button>
        </div>
        <p className="text-center text-xs text-[#5a6578]">
          Already have an account?{" "}
          <Link to="/login" onClick={close} className="font-bold text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full rounded-full text-xs font-semibold text-muted-foreground"
          onClick={close}
        >
          {exitLabel}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function AccountGateProvider({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [reason, setReason] = useState<GateReason | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const requireAccount = useCallback(
    (r: GateReason = "generic") => {
      if (session) return true;
      setReason(r);
      return false;
    },
    [session],
  );

  // First-visit welcome: guests landing on the shop feed or explore, once per browser.
  useEffect(() => {
    if (loading || !configured || session) return;
    const entryPaths = ["/shop", "/shop/", "/shop/discover", "/shop/browse"];
    if (!entryPaths.includes(pathname)) return;
    let seen = false;
    try {
      seen = Boolean(window.localStorage.getItem(WELCOME_SEEN_KEY));
    } catch {
      seen = false;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setWelcomeOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, [loading, configured, session, pathname]);

  const dismissWelcome = useCallback((open: boolean) => {
    if (!open) {
      try {
        window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setWelcomeOpen(open);
  }, []);

  const value = useMemo(() => ({ requireAccount }), [requireAccount]);

  return (
    <AccountGateContext.Provider value={value}>
      {children}
      <AuthChoiceDialog
        open={welcomeOpen}
        onOpenChange={dismissWelcome}
        title="Welcome to TIJAR"
        description="Buy from trusted shops across Nigeria or open your own. Create a free account to get started — or keep browsing the marketplace."
        exitLabel="Just browsing — exit"
      />
      <AuthChoiceDialog
        open={reason !== null}
        onOpenChange={(open) => {
          if (!open) setReason(null);
        }}
        title="Create your account"
        description={reason ? REASON_COPY[reason] : REASON_COPY.generic}
      />
    </AccountGateContext.Provider>
  );
}
