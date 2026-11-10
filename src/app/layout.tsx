import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { DashboardShell } from "@/components/dashboard-shell";
import { SecurityBootstrap } from "@/components/SecurityBootstrap";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "OpenMotion",
  description: "Ruang kerja lokal untuk produksi video edukasi.",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="id"
      className={cn(geist.variable, geistMono.variable)}
    >
      <body className="min-h-[100dvh] bg-background text-foreground antialiased">
        <SecurityBootstrap />
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
