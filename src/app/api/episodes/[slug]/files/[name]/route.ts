import { readArtifact } from '@/server/pipeline/files';
import { saveTextArtifact } from '@/server/pipeline/service';
import { apiError, bodyObject, json, stepParams } from '@/server/pipeline/http';
export const dynamic = 'force-dynamic';
const editable = ['01-episode.md', '01-naskah.md', '02-naskah-tagged.md', '06-publish.md'];
export async function GET(_request: Request, context: {params: Promise<{slug:string;name:string}>}) {
  try { const {slug,name} = await context.params; stepParams(slug, 'script'); if (!editable.includes(name)) throw new Error('File tidak diizinkan.'); return json({content:readArtifact(slug,name)}); } catch(error) {return apiError(error);}
}
export async function PUT(request: Request, context: {params: Promise<{slug:string;name:string}>}) {
  try { const {slug,name} = await context.params; stepParams(slug, 'script'); const body=await bodyObject(request); saveTextArtifact(slug,name,body.content); return json({saved:true}); } catch(error) {return apiError(error);}
}
