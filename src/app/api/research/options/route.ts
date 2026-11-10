import { discoverAgentOptions } from '@/server/agents/options';
import { apiError, bodyObject, json } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(request:Request){
  try {
    const body=await bodyObject(request);
    if(typeof body.agentId!=='string'||!body.agentId||body.agentId.length>64)throw new Error('Pilih agen terlebih dahulu.');
    if(body.modelId!==undefined&&(typeof body.modelId!=='string'||body.modelId.length>500))throw new Error('Model tidak valid.');
    return json(await discoverAgentOptions({agentId:body.agentId,modelId:body.modelId as string|undefined,episodeSlug:'research',workingDirectory:'research',signal:request.signal}));
  }catch(error){return apiError(error);}
}
