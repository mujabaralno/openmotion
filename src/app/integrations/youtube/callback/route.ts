import { NextRequest, NextResponse } from 'next/server';
import { completeYouTubeConnection, YOUTUBE_CALLBACK } from '@/server/youtube/client';
import { createSecurityPolicy } from '@/server/security/policy';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  const url=new URL(request.url);
  if(!createSecurityPolicy().allowedOrigins.has(url.origin)||!createSecurityPolicy().allowedHosts.has(request.headers.get('host')??''))return new Response('Forbidden',{status:403});
  let status='error';
  try{if(!url.searchParams.has('error')){await completeYouTubeConnection(url.searchParams.get('state')??'',request.cookies.get('openmotion_youtube_state')?.value,url.searchParams.get('code')??'');status='connected';}}catch{/* Show a generic result; authorization codes and tokens never enter chat or logs. */}
  const response=NextResponse.redirect(new URL(`/research?youtube=${status}`,url.origin));
  response.cookies.set('openmotion_youtube_state','',{httpOnly:true,sameSite:'lax',path:YOUTUBE_CALLBACK,maxAge:0});
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');
  return response;
}
