import fs from 'node:fs';
import path from 'node:path';

export function getRemotionProjectRoot(): string {
  const root = path.join(process.cwd(), 'remotion');
  try {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !fs.existsSync(path.join(root, 'package.json'))) throw new Error();
  } catch {
    throw new Error('Proyek Remotion utama tidak ditemukan. Gunakan folder openmotion/remotion yang memiliki package.json dan dependensi bersama.');
  }
  return root;
}
