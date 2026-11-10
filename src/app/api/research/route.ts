import { getDb } from '@/server/db';
import { listResearchThreads } from '@/server/research/chat';
import { youtubeStatus, YOUTUBE_CALLBACK } from '@/server/youtube/client';
import { apiError, json } from '@/server/pipeline/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request: Request) {
  try {
    const archive=getDb().prepare("SELECT count(DISTINCT episode_id) AS count FROM steps WHERE kind='script' AND status='approved'").get() as {count:number};
    return json({threads:listResearchThreads(),youtube:youtubeStatus(),archiveCount:archive.count,callbackUrl:new URL(YOUTUBE_CALLBACK,request.url).href});
  } catch(error){return apiError(error);}
}
