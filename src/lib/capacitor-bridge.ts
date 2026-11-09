/** Capacitor injects this on the Android WebView. Absent on the public website. */
type CapHost = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, Record<string, (...args: never[]) => Promise<unknown>>>;
};

function host(): CapHost | undefined {
  return (globalThis as { Capacitor?: CapHost }).Capacitor;
}

export function capacitorPlugin<T extends object>(name: string): T | null {
  const plugin = host()?.Plugins?.[name];
  return (plugin as T | undefined) ?? null;
}

export async function hideNativeSplash(): Promise<void> {
  const splash = capacitorPlugin<{ hide: () => Promise<void> }>("SplashScreen");
  if (!splash) return;
  await splash.hide().catch(() => undefined);
}
