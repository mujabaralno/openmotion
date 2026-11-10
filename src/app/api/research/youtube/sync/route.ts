import { syncYouTube } from '@/server/youtube/client';
import { apiError, json } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(){try{return json(await syncYouTube());}catch(error){return apiError(error);}}
