import { NextResponse } from 'next/server';
import { beginYouTubeConnection, YOUTUBE_CALLBACK } from '@/server/youtube/client';
import { apiError } from '@/server/pipeline/http';
export const runtime='nodejs';
export async function POST(request:Request){
  try {
    const result=beginYouTubeConnection(new URL(request.url).origin);
    const response=NextResponse.json({url:result.url},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set('openmotion_youtube_state',result.state,{httpOnly:true,sameSite:'lax',secure:false,path:YOUTUBE_CALLBACK,maxAge:600});
    return response;
  }catch(error){return apiError(error);}
}
