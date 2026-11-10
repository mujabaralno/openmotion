import { threadView } from '@/server/research/chat';
import { apiError, json } from '@/server/pipeline/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{return json(threadView((await context.params).id));}catch(error){return apiError(error);}}
