export type PublishPack = { title: string; description: string; hashtags: string };

export function parsePublishPack(content: string): PublishPack {
  const headings = [...content.matchAll(/^## (Judul|Deskripsi|Hashtag)\s*$/gm)];
  if (headings.length !== 3 || headings.map(match => match[1]).join(',') !== 'Judul,Deskripsi,Hashtag') throw new Error('Paket publikasi harus memiliki bagian ## Judul, ## Deskripsi, dan ## Hashtag secara berurutan.');
  const sections = headings.map((match, index) => content.slice(match.index! + match[0].length, headings[index + 1]?.index ?? content.length).trim());
  const [title, description, hashtags] = sections;
  if (!title || title.length > 100 || /[\r\n]/.test(title)) throw new Error('Judul publikasi wajib satu baris, maksimal 100 karakter.');
  if (!description || description.length > 5000) throw new Error('Deskripsi publikasi wajib diisi, maksimal 5000 karakter.');
  const tags = hashtags.split(/\s+/);
  if (tags.length > 15 || tags.some(tag => !/^#[\p{L}\p{N}_]+$/u.test(tag)) || new Set(tags.map(tag => tag.toLowerCase())).size !== tags.length) throw new Error('Isi 1–15 hashtag unik, diawali # dan dipisahkan spasi.');
  return { title, description, hashtags: tags.join(' ') };
}
