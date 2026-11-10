'use client';
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from './ui/button';
import { parsePublishPack } from '@/lib/publish-pack';

export function PublishPackPreview({ content }: { content: string }) {
  const [notice, setNotice] = useState('');
  let pack;
  try { pack = parsePublishPack(content); }
  catch (error) { return <p className="studio-error">{error instanceof Error ? error.message : 'Paket publikasi belum siap.'}</p>; }
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} disalin.`); }
    catch { setNotice('Belum bisa menyalin. Pilih teks dan salin secara manual.'); }
  }
  return <div className="publish-pack-preview">
    {Object.entries({ Judul: pack.title, Deskripsi: pack.description, Hashtag: pack.hashtags }).map(([label, text]) => <section key={label}>
      <header><h3>{label}</h3><Button variant="ghost" size="sm" onClick={() => void copy(label, text)}><Copy size={14} />Salin {label.toLowerCase()}</Button></header>
      <p className={label === 'Judul' ? 'publish-title' : undefined}>{text}</p>
    </section>)}
    <p className="muted-copy" role="status">{notice || 'Siap disalin setelah ditinjau. Publikasi dilakukan oleh kamu.'}</p>
  </div>;
}
