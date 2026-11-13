import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ng.tijar.app",
  appName: "Tijar",
  webDir: "dist",
  server: {
    url: "https://www.tijar.ng/shop",
    androidScheme: "https",
    allowNavigation: [
      "tijar.ng",
      "www.tijar.ng",
      "*.tijar.ng",
      "*.supabase.co",
      "*.vercel.app",
      "verify.elasto.ng",
      "*.elasto.ng",
      "api.bytid.com",
    ],
  },
  android: {
    appendUserAgent: " TijarApp/1.0.5",
    allowMixedContent: false,
    backgroundColor: "#F3F5F8",
    webContentsDebuggingEnabled: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: "#F3F5F8",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#F3F5F8",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
