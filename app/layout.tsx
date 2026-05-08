import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Meridian — Deal Intelligence Platform",
  description: "AI-powered acquisition signals, investor matching, and mandate briefs for bankers, investors, and founders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-text-primary min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
