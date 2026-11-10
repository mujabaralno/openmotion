"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelsTopLeft,
  MessageSquare,
  Settings2,
  FolderOpen,
  ChevronRight,
} from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const settings = pathname.startsWith("/settings");
  const research = pathname.startsWith("/research");
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link
          href="/episodes"
          className="studio-brand"
          aria-label="OpenMotion, semua episode"
        >
          <Image
          src={`/openmotion-horizontal-dark.svg`}
          alt="logo openmotion"
          width={200}
          height={100}
          />
        </Link>
        <div className="sidebar-label">Workspace</div>
        <nav aria-label="Navigasi utama">
          <Link href="/episodes" aria-current={pathname.startsWith("/episodes") ? "page" : undefined}>
            <PanelsTopLeft size={17} />
            Episode
          </Link>
          <Link href="/research" aria-current={research ? "page" : undefined}><MessageSquare size={17} />Riset topik</Link>
          <Link href="/settings" aria-current={settings ? "page" : undefined}>
            <Settings2 size={17} />
            Pengaturan
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <FolderOpen size={17} />
          <div>
            Workspace lokal<small>127.0.0.1</small>
          </div>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <span>{settings ? "Pengaturan" : research ? "Riset topik" : "Episode"}</span>
          {pathname.startsWith("/episodes/") ? (
            <>
              <ChevronRight size={13} />
              <span className="truncate">
                {decodeURIComponent(pathname.split("/")[2] ?? "")}
              </span>
            </>
          ) : null}
          <span className="topbar-note">OpenMotion Studio</span>
        </header>
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
