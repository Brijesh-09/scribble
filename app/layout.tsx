import type { Metadata, Viewport } from "next";
import "@fontsource/reenie-beanie/400.css";
// import "@fontsource-variable/shantell-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scribble",
  description: "Drop it. Find it later.",
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
      <body>{children}</body>
    </html>
  );
}