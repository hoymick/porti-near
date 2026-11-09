import type { Metadata } from "next";
import "./globals.css";
import "./cartoon.css";
import "./workspace.css";
import "./near.css";
import "./near-theme.css";
import "./appearance.css";

export const metadata: Metadata = {
  title: "Porti — Your NEAR Companion",
  description: "A movable AI companion for NEAR. Research tokens, follow wallets, link your username, and review transfers before signing.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before first paint to apply the saved theme without a light/dark flash. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/porti-theme.js" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
