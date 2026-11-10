import { createResearchThread } from '@/server/research/chat';
import { apiError, json } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(){try{return json(createResearchThread(),201);}catch(error){return apiError(error);}}
