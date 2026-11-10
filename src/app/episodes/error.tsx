'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function EpisodesError({reset}:{reset:()=>void}){return <section className="studio-empty"><h1>Episode belum dapat dimuat</h1><p>Periksa konfigurasi workspace dan database di log server, lalu coba lagi.</p><div className="inline-meta"><Button onClick={reset}>Coba lagi</Button><Link href="/settings" className="text-link">Buka pengaturan</Link></div></section>;}
