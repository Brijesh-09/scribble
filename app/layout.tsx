import type { Metadata, Viewport } from "next";
import "@fontsource/reenie-beanie/400.css";
import "@fontsource-variable/shantell-sans";
import "./globals.css";
import { RegisterSW } from "@/app/components/RegisterSW";

export const metadata: Metadata = {
  title: "Scribble",
  description: "Drop it. Find it later.",
  applicationName: "Scribble",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Scribble", statusBarStyle: "black-translucent" },
  icons: { icon: "/pwa-icon?size=192", apple: "/pwa-icon?size=180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f0f10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}