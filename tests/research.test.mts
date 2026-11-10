import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),original=process.cwd();
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'openmotion-research-')));
process.chdir(temp);process.env.WORKSPACE_DIR=path.join(temp,'workspace');process.env.WORKFLOW_TOKEN_PATH=path.join(temp,'token');
process.env.YOUTUBE_CLIENT_ID='test-client-id';process.env.YOUTUBE_CLIENT_SECRET='test-youtube-secret-not-for-the-agent';
const {getDb}=await import('../src/server/db/index.ts');
const {initializeWorkspace}=await import('../src/server/workspace/init.ts');
const {createEpisode}=await import('../src/server/episodes/service.ts');
const {writeArtifact}=await import('../src/server/pipeline/files.ts');
const {retrieveKnowledge,rebuildKnowledge}=await import('../src/server/research/knowledge.ts');
const {createResearchThread,sendResearchMessage,threadView,cancelResearch,buildResearchPrompt}=await import('../src/server/research/chat.ts');
const {beginYouTubeConnection,completeYouTubeConnection,syncYouTube,youtubeStatus,disconnectYouTube,YOUTUBE_SCOPES}=await import('../src/server/youtube/client.ts');
const {stopAllAgentSessions}=await import('../src/server/agents/registry.ts');
initializeWorkspace();
function agents(slow=false){fs.writeFileSync(path.join(process.env.WORKSPACE_DIR!,'agents.json'),JSON.stringify({agents:[{id:'research-test',name:'Research fixture',command:process.execPath,args:[path.join(root,'tests/fixtures/research-acp-agent.mjs'),...(slow?['--slow']:[])]}]}));}
agents();
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(read:()=>boolean){for(let i=0;i<200;i++){if(read())return;await pause(25);}throw new Error('Timed out');}
after(()=>{stopAllAgentSessions({force:true});getDb().close();process.chdir(original);fs.rmSync(temp,{recursive:true,force:true});});

test('RAG searches approved episode chunks, excludes drafts, and drops stale documents after revision',()=>{
  const episode=createEpisode({title:'Habitat orangutan',topic:'Orangutan Sumatra Kalimantan'});
  writeArtifact(episode.slug,'01-naskah.md','Orangutan hidup di hutan Sumatra dan Kalimantan. Habitat menentukan sumber makanan.');
  getDb().prepare("UPDATE steps SET status='approved' WHERE episode_id=? AND kind='script'").run(episode.id);
  const draft=createEpisode({title:'Rahasia draft',topic:'Draft belum disetujui'});
  writeArtifact(draft.slug,'01-naskah.md','Rahasia tidak boleh diindeks.');
  const sources=retrieveKnowledge('orangutan habitat');
  assert.ok(sources.some(source=>source.href===`/episodes/${episode.slug}`&&source.excerpt.includes('Kalimantan')));
  assert.ok(!sources.some(source=>source.href===`/episodes/${draft.slug}`));
  assert.doesNotThrow(()=>retrieveKnowledge('" OR * - NEAR( ../ ???'));
  getDb().prepare("UPDATE steps SET status='idle' WHERE episode_id=? AND kind='script'").run(episode.id);
  assert.ok(!retrieveKnowledge('orangutan').some(source=>source.href===`/episodes/${episode.slug}`));
  getDb().prepare("UPDATE steps SET status='approved' WHERE episode_id=? AND kind='script'").run(episode.id);
  const prompt=buildResearchPrompt('Cari ide baru',retrieveKnowledge('orangutan'),[]);
  assert.match(prompt,/UNTRUSTED_SOURCE_DATA/);assert.match(prompt,/Do not invent statistics/);assert.match(prompt,/Kalimantan/);
});
test('research chat streams into persistent history, rejects tool permissions, and uses a separate workspace',async()=>{
  const created=createResearchThread();
  const started=await sendResearchMessage(created.thread.id,{content:'Apa topik lanjutan tentang habitat orangutan?',agentId:'research-test'});
  assert.equal(started.messages[1].status,'running');
  await assert.rejects(sendResearchMessage(created.thread.id,{content:'Duplicate',agentId:'research-test'}),/Tunggu/);
  await wait(()=>!threadView(created.thread.id).running);
  const done=threadView(created.thread.id);
  assert.equal(done.messages.length,2);assert.equal(done.messages[1].status,'completed');assert.match(done.messages[1].content,/\[S1\]/);
  assert.ok(done.messages[1].sources.length);
  const research=path.join(process.env.WORKSPACE_DIR!,'research');
  assert.equal(fs.existsSync(path.join(research,'should-not-exist.txt')),false);
  const mode=JSON.parse(fs.readFileSync(path.join(research,'mode.json'),'utf8'));
  assert.equal(mode.mode,'read-only');assert.equal(mode.secretVisible,false);
  const prompt=fs.readFileSync(path.join(research,'prompt.txt'),'utf8');
  assert.match(prompt,/Orangutan/);assert.ok(!prompt.includes(process.env.YOUTUBE_CLIENT_SECRET!));
  assert.throws(()=>threadView('../outside'),/ID/);
  agents(true);const other=createResearchThread();await sendResearchMessage(other.thread.id,{content:'Riset lambat',agentId:'research-test'});
  await wait(()=>threadView(other.thread.id).messages[1].content.length>0);
  await cancelResearch(other.thread.id);await wait(()=>!threadView(other.thread.id).running);
  assert.equal(threadView(other.thread.id).messages[1].status,'cancelled');agents();
});
test('YouTube OAuth is browser-bound, one-use, read-only, encrypted, and analytics become retrievable context',async()=>{
  const realFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async(input,init)=>{
    requests++;const url=new URL(String(input));
    if(url.hostname==='oauth2.googleapis.com'){
      const body=new URLSearchParams(String(init?.body));assert.equal(body.get('client_secret'),process.env.YOUTUBE_CLIENT_SECRET);
      return Response.json({access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600,scope:YOUTUBE_SCOPES.join(' ')});
    }
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-access-token');
    if(url.pathname.endsWith('/channels'))return Response.json({items:[{id:'UCtest',snippet:{title:'Channel lokal'}}]});
    if(url.hostname==='youtubeanalytics.googleapis.com'){
      assert.equal(url.searchParams.get('ids'),'channel==UCtest');assert.equal(url.searchParams.get('dimensions'),'video');assert.equal(url.searchParams.get('sort'),'-views');
      return Response.json({columnHeaders:['video','views','estimatedMinutesWatched','averageViewPercentage','likes','comments','subscribersGained'].map(name=>({name})),rows:[['abcdefghijk',5000,2500,84,210,20,11]]});
    }
    if(url.pathname.endsWith('/videos'))return Response.json({items:[{id:'abcdefghijk',snippet:{title:'Kenapa orangutan hidup di hutan?',description:'Habitat dan makanan orangutan.',publishedAt:'2026-10-01T00:00:00Z'}}]});
    throw new Error('Unexpected external request');
  };
  try{
    const flow=beginYouTubeConnection('http://127.0.0.1:3000');const url=new URL(flow.url);
    assert.equal(url.searchParams.get('scope'),YOUTUBE_SCOPES.join(' '));assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(!flow.url.includes(process.env.YOUTUBE_CLIENT_SECRET!));
    await assert.rejects(completeYouTubeConnection(flow.state,'wrong-cookie','code'),/Sesi/);assert.equal(requests,0);
    await completeYouTubeConnection(flow.state,flow.state,'code');
    await assert.rejects(completeYouTubeConnection(flow.state,flow.state,'code'),/digunakan/);
    const raw=getDb().prepare('SELECT credentials FROM youtube_connection').get() as {credentials:string};
    assert.ok(!raw.credentials.includes('test-access-token'));assert.ok(!raw.credentials.includes('test-refresh-token'));
    const status=await syncYouTube();assert.equal(status.channelTitle,'Channel lokal');assert.equal(status.videos[0].views,5000);assert.ok(status.periodStart&&status.periodEnd);
    assert.ok(!JSON.stringify(status).includes('test-access-token'));
    const source=retrieveKnowledge('ide video laku orangutan').find(source=>source.kind==='youtube');assert.ok(source);assert.match(source.excerpt,/Views in period: 5000/);assert.match(source.excerpt,/84%/);
    const old=youtubeStatus();globalThis.fetch=async()=>new Response('{}',{status:403});await assert.rejects(syncYouTube(),/menolak akses/);
    assert.deepEqual(youtubeStatus().videos,old.videos);
    disconnectYouTube();assert.equal(youtubeStatus().connected,false);assert.equal(rebuildKnowledge().videos,0);
  }finally{globalThis.fetch=realFetch;}
});
