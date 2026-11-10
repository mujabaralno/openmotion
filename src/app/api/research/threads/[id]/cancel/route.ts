import { cancelResearch } from '@/server/research/chat';
import { apiError, json } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){try{return json(await cancelResearch((await context.params).id));}catch(error){return apiError(error);}}
