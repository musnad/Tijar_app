import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/features/mobile/AppShell";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { markNativeDetectionReady } from "@/utils/isMobile";
import { supabaseStorageOrigin } from "@/lib/media/optimize";

import appCss from "../styles.css?url";
import { AccountGateProvider } from "@/features/auth/account-gate";
import { AuthProvider } from "@/features/auth/auth-context";
import { SitePreferencesProvider, useTranslation } from "../lib/i18n/context";
import { enMessages } from "../lib/i18n/messages/en";
import { clearServiceWorkers } from "../lib/clear-service-workers";

function NotFoundContent() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">{t("errors.notFoundCode")}</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("errors.notFoundTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.notFoundDesc")}</p>
        <div className="mt-6">
          <Link
            to="/shop"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-extrabold text-primary-foreground"
          >
            {t("errors.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <SitePreferencesProvider>
      <NotFoundContent />
    </SitePreferencesProvider>
  );
}

function ErrorContent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const copy = enMessages.errors;
  const nativeShell =
    typeof window !== "undefined" && /TijarApp\//i.test(navigator.userAgent);
  const home = nativeShell || isTijarNativeApp() ? "https://www.tijar.ng/shop" : "/";

  useEffect(() => {
    if (!nativeShell) return;
    const key = "tijar-native-error-retry";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    const timer = window.setTimeout(() => {
      window.location.replace("https://www.tijar.ng/shop");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [nativeShell]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F7FB] px-6">
      <p className="mb-8 text-center text-[22px] font-extrabold tracking-[0.18em] text-[#001B3A]">TIJAR</p>
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold tracking-tight text-[#001B3A]">{copy.errorTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#5a6578]">{copy.errorDesc}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (nativeShell) {
                window.location.replace("https://www.tijar.ng/shop");
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-extrabold text-primary-foreground"
          >
            {copy.tryAgain}
          </button>
          <a
            href={home}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-white px-5 text-sm font-extrabold text-[#001B3A]"
          >
            {nativeShell ? "Open shop" : copy.goHome}
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent(props: ErrorComponentProps) {
  return (
    <SitePreferencesProvider>
      <ErrorContent {...props} />
    </SitePreferencesProvider>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const storage = supabaseStorageOrigin();
    return {
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5",
      },
      { title: enMessages.meta.siteName },
      { name: "description", content: enMessages.meta.defaultDescription },
      { name: "author", content: enMessages.meta.author },
      { name: "theme-color", content: "#0B1F4D" },
      { name: "geo.region", content: "NG" },
      ...(typeof import.meta.env.VITE_GOOGLE_SITE_VERIFICATION === "string" &&
      import.meta.env.VITE_GOOGLE_SITE_VERIFICATION.trim()
        ? [{ name: "google-site-verification", content: import.meta.env.VITE_GOOGLE_SITE_VERIFICATION.trim() }]
        : []),
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "TIJAR" },
      { property: "og:image", content: "https://www.tijar.ng/tijar-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.tijar.ng/tijar-logo.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/tijar-logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/tijar-logo.png" },
      ...(storage
        ? [
            { rel: "preconnect" as const, href: storage },
            { rel: "dns-prefetch" as const, href: storage },
          ]
        : []),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&display=swap",
      },
    ],
  };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const NATIVE_APP_BOOT = `(function(){if(!/TijarApp\\//i.test(navigator.userAgent))return;document.documentElement.classList.add('tijar-android-webview');var p=location.pathname;if(/^\\/(reset-password|forgot-password|auth\\/)/.test(p))return;if(location.hostname==='localhost'||p==='/'||p===''||p==='/index.html'){location.replace('https://www.tijar.ng/shop');return;}document.querySelectorAll('link[rel=preload][as=image],link[rel=modulepreload]').forEach(function(el){var h=el.getAttribute('href')||'';if(el.rel==='preload'||/charts|pdf-|jspdf|leaflet|maps-|tijar-logo/.test(h))el.remove();});})();`

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: NATIVE_APP_BOOT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return <AppShell />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    markNativeDetectionReady();
    setHydrated(true);
    try {
      sessionStorage.removeItem("tijar-native-error-retry");
    } catch {
      // ignore private-mode storage
    }
    void clearServiceWorkers();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SitePreferencesProvider>
        <AuthProvider>
          <AccountGateProvider>
            <RootLayout />
            <Toaster richColors position="top-center" />
            {hydrated && typeof navigator !== "undefined" && !/TijarApp\//i.test(navigator.userAgent) ? (
              <SpeedInsights />
            ) : null}
          </AccountGateProvider>
        </AuthProvider>
      </SitePreferencesProvider>
    </QueryClientProvider>
  );
}
