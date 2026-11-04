import type { Metadata } from "next";
import "./globals.css";
import "./cartoon.css";
import "./workspace.css";
import "./near.css";
import "./near-theme.css";

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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
