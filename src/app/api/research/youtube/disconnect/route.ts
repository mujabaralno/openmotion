import { disconnectYouTube } from '@/server/youtube/client';
import { apiError, json } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(){try{disconnectYouTube();return json({disconnected:true});}catch(error){return apiError(error);}}
