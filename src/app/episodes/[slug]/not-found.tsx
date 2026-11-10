import Link from 'next/link';
export default function NotFound(){return <section className="studio-empty"><h1>Episode tidak ditemukan</h1><p>Kembali ke daftar untuk melihat episode yang tersedia.</p><Link href="/episodes" className="text-link">Semua episode</Link></section>;}
