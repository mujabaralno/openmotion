import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SecurityBootstrap } from "@/components/SecurityBootstrap";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Workflow Studio",
  description: "Aplikasi lokal untuk mengelola produksi video.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <SecurityBootstrap />
        {children}
      </body>
    </html>
  );
}
