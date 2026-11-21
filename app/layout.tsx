import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aureus AI - BTC Scalping Radar",
  description: "Minimalist AI-Powered BTC Scalping Copilot & Risk Guardian for Exness Real Standard Account",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#09090b] text-zinc-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
