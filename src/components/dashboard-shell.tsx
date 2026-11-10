'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelsTopLeft, Settings2, FolderOpen, ChevronRight, Clapperboard } from 'lucide-react';
import type { ReactNode } from 'react';
export function DashboardShell({children}:{children:ReactNode}) {
  const pathname=usePathname();
  const settings=pathname.startsWith('/settings');
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <Link href="/episodes" className="studio-brand" aria-label="OpenMotion, semua episode"><span className="studio-mark"><Clapperboard size={18}/></span><span>OpenMotion</span></Link>
      <div className="sidebar-label">Workspace</div>
      <nav aria-label="Navigasi utama">
        <Link href="/episodes" aria-current={!settings?'page':undefined}><PanelsTopLeft size={17}/>Episode</Link>
        <Link href="/settings" aria-current={settings?'page':undefined}><Settings2 size={17}/>Pengaturan</Link>
      </nav>
      <div className="sidebar-bottom"><FolderOpen size={17}/><div>Workspace lokal<small>127.0.0.1</small></div></div>
    </aside>
    <div className="dashboard-body"><header className="dashboard-topbar"><span>{settings?'Pengaturan':'Episode'}</span>{pathname.startsWith('/episodes/')?<><ChevronRight size={13}/><span className="truncate">{decodeURIComponent(pathname.split('/')[2]??'')}</span></>:null}<span className="topbar-note">OpenMotion Studio</span></header><main className="dashboard-main">{children}</main></div>
  </div>;
}
