import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/features/mobile/AppShell";
import { TijarLogo } from "@/components/brand-logo";
import { isTijarNativeApp } from "@/lib/tijar-native-app";

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
  const home = isTijarNativeApp() ? "/shop" : "/";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F7FB] px-6">
      <TijarLogo compact className="mb-8 max-w-[140px]" />
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold tracking-tight text-[#001B3A]">{copy.errorTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#5a6578]">{copy.errorDesc}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isTijarNativeApp()) {
                window.location.replace("/shop");
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
            {isTijarNativeApp() ? "Open shop" : copy.goHome}
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
  head: () => ({
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/tijar-logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/tijar-logo.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const NATIVE_APP_BOOT = `(function(){if(!/TijarApp\\//i.test(navigator.userAgent))return;document.documentElement.classList.add('tijar-android-webview');var p=location.pathname;if(p==='/'||p===''||p==='/index.html')location.replace('/shop');})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_APP_BOOT }} />
        <HeadContent />
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

  useEffect(() => {
    void clearServiceWorkers();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SitePreferencesProvider>
        <AuthProvider>
          <AccountGateProvider>
            <RootLayout />
            <Toaster richColors position="top-center" />
            <SpeedInsights />
          </AccountGateProvider>
        </AuthProvider>
      </SitePreferencesProvider>
    </QueryClientProvider>
  );
}
