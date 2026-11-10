import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SecurityBootstrap } from "@/components/SecurityBootstrap";

export const metadata: Metadata = {
  title: "Workflow Studio",
  description: "Aplikasi lokal untuk mengelola produksi video.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <SecurityBootstrap />
        {children}
      </body>
    </html>
  );
}
