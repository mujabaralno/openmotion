'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Download, ImageIcon } from 'lucide-react';

export function ThumbnailPreview({ slug, version, available }: { slug: string; version: string | null; available: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = `/api/media/${encodeURIComponent(slug)}/05-thumbnail.svg?v=${encodeURIComponent(version ?? '')}`;
  return <section className="studio-panel thumbnail-panel">
    <header><div><span className="studio-kicker">Cover episode</span><h3>Thumbnail</h3></div><span className="muted-copy">SVG · 1080 × 1920</span></header>
    {available ? <>
      <div className="thumbnail-canvas">{failed ? <p className="studio-error" role="alert">Thumbnail belum bisa ditampilkan. Periksa keluaran agen dan coba lagi setelah diperbaiki.</p> : <Image src={source} alt="Thumbnail episode untuk ditinjau" width={1080} height={1920} unoptimized onError={() => setFailed(true)} />}</div>
      {!failed ? <a className="studio-link-button" href={`${source}&download=1`}><Download size={16} />Unduh thumbnail SVG</a> : null}
      <p className="muted-copy">Visual mengikuti episode. Periksa keterbacaan teks dan subjek sebelum menyetujui.</p>
    </> : <div className="editor-empty"><ImageIcon size={30} /><p>Jalankan agen untuk membuat cover dari visual video yang sudah disetujui.</p></div>}
  </section>;
}
