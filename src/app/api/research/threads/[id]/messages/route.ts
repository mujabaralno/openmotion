import { sendResearchMessage } from '@/server/research/chat';
import { apiError, bodyObject, json } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{return json(await sendResearchMessage((await context.params).id,await bodyObject(request)),202);}catch(error){return apiError(error);}}
