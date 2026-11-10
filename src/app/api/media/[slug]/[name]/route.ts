import fs from 'node:fs';
import { Readable } from 'node:stream';
import { artifactPath } from '@/server/pipeline/files';
import { apiError, json, stepParams } from '@/server/pipeline/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function serve(request:Request, context:{params:Promise<{slug:string;name:string}>}, head=false) {
  try {
    const {slug,name}=await context.params; stepParams(slug,'script');
    const audio=name==='03-voiceover.mp3';
    if(!audio && name!=='preview.mp4' && name!==`${slug}.mp4`) throw new Error('Media tidak diizinkan.');
    const target=artifactPath(slug,name,audio?'episode':'out');
    if(!fs.existsSync(target)) return json({error:'Media belum tersedia.'},404);
    const size=fs.statSync(target).size;
    const headers=new Headers({'Content-Type':audio?'audio/mpeg':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${new URL(request.url).searchParams.has('download')?'attachment':'inline'}; filename="${name}"`});
    let start=0; let end=size-1; let status=200;
    const range=request.headers.get('range');
    if(range) {
      const match=range.match(/^bytes=(\d*)-(\d*)$/);
      if(!match || (!match[1]&&!match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      if(!match[1]) { const count=Number(match[2]); if(count<=0) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}}); start=Math.max(0,size-count); }
      else {start=Number(match[1]); if(match[2]) end=Math.min(end,Number(match[2]));}
      if(start>end || start>=size) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      headers.set('Content-Range',`bytes ${start}-${end}/${size}`); status=206;
    }
    headers.set('Content-Length',String(end-start+1));
    if(head) return new Response(null,{status,headers});
    const stream=fs.createReadStream(target,{start,end});
    request.signal.addEventListener('abort',()=>stream.destroy(),{once:true});
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status,headers});
  } catch(error) {return apiError(error);}
}
export async function GET(request:Request, context:{params:Promise<{slug:string;name:string}>}) {return serve(request,context);}
export async function HEAD(request:Request, context:{params:Promise<{slug:string;name:string}>}) {return serve(request,context,true);}
