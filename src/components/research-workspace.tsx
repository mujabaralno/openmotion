'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, BookOpen, ChevronDown, ExternalLink, MessageSquare, Plus, RefreshCw, Square, Film } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { StudioModal } from './studio-modal';
import { DocumentMarkdown } from './document-markdown';
import { LogoIntro } from './lottie';
import { studioRequest } from '@/lib/studio-api';
import type { AgentExecutionOptions, AgentSelector } from '@/server/acp/configuration';
import type { threadView, listResearchThreads } from '@/server/research/chat';
import type { youtubeStatus } from '@/server/youtube/client';

type View=ReturnType<typeof threadView>;
type Status={threads:ReturnType<typeof listResearchThreads>;youtube:ReturnType<typeof youtubeStatus>;archiveCount:number;callbackUrl:string};
type Execution={agentId:string;modelId:string;effort:string};
const suggestions=['Dari konten yang sudah dibuat, sarankan 5 topik lanjutan dengan sudut pandang baru.','Video mana yang berkinerja baik? Apa hipotesis topik lanjutan yang layak dicoba?','Apakah ide ini terlalu mirip episode lama? Bantu cari angle yang berbeda.'];
const number=(value:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value);
function Options({selector}:{selector:AgentSelector}){return selector.options.map(option=><option key={option.value} value={option.value}>{option.name}</option>);}
function AgentPicker({agents,value,onChange,disabled,onReady}:{agents:{id:string;name:string}[];value:Execution;onChange:(value:Execution)=>void;disabled:boolean;onReady:(ready:boolean)=>void}){
  const [catalog,setCatalog]=useState<AgentExecutionOptions|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!value.agentId)return;
    let active=true;const controller=new AbortController();
    void studioRequest<AgentExecutionOptions>('/api/research/options','POST',{agentId:value.agentId,...(value.modelId?{modelId:value.modelId}:{})},controller.signal)
      .then(data=>{if(active){setCatalog(data);onReady(true);}}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;controller.abort();};
  },[value.agentId,value.modelId,retry,onReady]);
  return <div className="research-agent-picker">
    <label>Agen<select aria-label="Agen riset" disabled={disabled||!agents.length} value={value.agentId} onChange={event=>onChange({agentId:event.target.value,modelId:'',effort:''})}>{!agents.length?<option value="">Tambahkan agen di Pengaturan</option>:agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
    {catalog?.model?<label>Model<select aria-label="Model riset" disabled={disabled} value={value.modelId||catalog.model.currentValue} onChange={event=>onChange({...value,modelId:event.target.value,effort:''})}><Options selector={catalog.model}/></select></label>:null}
    {catalog?.effort?<label>Effort<select aria-label="Effort riset" disabled={disabled} value={value.effort||catalog.effort.currentValue} onChange={event=>onChange({...value,effort:event.target.value})}><Options selector={catalog.effort}/></select></label>:null}
    {!catalog&&!error&&value.agentId?<span className="muted-copy" role="status">Memuat pilihan model…</span>:null}
    {catalog&&!catalog.model?<span className="muted-copy">Memakai model default agen.</span>:null}
    {error?<div className="research-picker-error"><p className="studio-error" role="alert">{error}</p><Button size="sm" variant="ghost" disabled={disabled} onClick={()=>{setCatalog(null);setError('');onReady(false);setRetry(value=>value+1);}}>Coba muat lagi</Button></div>:null}
  </div>;
}
function ResearchConversation({threadId,execution,ready,onCreated,onRefresh,onUseTopic}:{threadId:string|null;execution:Execution;ready:boolean;onCreated:(id:string)=>void;onRefresh:()=>void;onUseTopic:()=>void}){
  const [view,setView]=useState<View|null>(null),[text,setText]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
  const scrolling=useRef<HTMLDivElement>(null),nearBottom=useRef(true);
  const running=Boolean(view?.running);
  useEffect(()=>{
    if(!threadId)return;
    let active=true,inFlight=false;
    const load=async()=>{if(inFlight)return;inFlight=true;try{const next=await studioRequest<View>(`/api/research/threads/${threadId}`);if(active){setView(next);setError('');}}catch(error){if(active)setError(error instanceof Error?error.message:'Riwayat belum tersambung.');}finally{inFlight=false;}};
    void load();const timer=setInterval(()=>void load(),running?1000:5000);
    return()=>{active=false;clearInterval(timer);};
  },[threadId,running]);
  const last=view?.messages.at(-1);
  useEffect(()=>{if(nearBottom.current&&scrolling.current)scrolling.current.scrollTop=scrolling.current.scrollHeight;},[last?.content,last?.status,pending]);
  async function send(message=text){
    if(!message.trim()||pending||running||!ready)return;
    setPending(true);setError('');nearBottom.current=true;
    try{
      let id=threadId;
      if(!id){const created=await studioRequest<View>('/api/research/threads','POST');id=created.thread.id;}
      const next=await studioRequest<View>(`/api/research/threads/${id}/messages`,'POST',{...execution,content:message});
      setView(next);setText('');if(!threadId)onCreated(id);onRefresh();
    }catch(error){setError(error instanceof Error?error.message:'Pesan belum terkirim.');}
    finally{setPending(false);}
  }
  async function cancel(){if(!threadId||pending)return;setPending(true);try{setView(await studioRequest<View>(`/api/research/threads/${threadId}/cancel`,'POST'));}catch(error){setError(error instanceof Error?error.message:'Belum bisa menghentikan riset.');}finally{setPending(false);}}
  return <section className="research-conversation" aria-label="Percakapan riset">
    <header><div><MessageSquare size={17}/><h2>{view?.thread.title??'Mulai dari rasa ingin tahu'}</h2></div><Button size="sm" variant="ghost" onClick={onUseTopic}><Plus size={14}/>Buat episode</Button></header>
    <div className="research-messages" ref={scrolling} onScroll={()=>{const el=scrolling.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
      {!view?.messages.length?<div className="research-empty"><BookOpen size={30}/><h3>Ide baru, berakar dari channel kamu.</h3><p>Diskusikan topik, cari hubungan dengan episode sebelumnya, atau lihat pola dari statistik YouTube.</p><div>{suggestions.map(prompt=><button key={prompt} disabled={pending||!ready} onClick={()=>setText(prompt)}>{prompt}</button>)}</div></div>:null}
      {view?.messages.map(message=><article key={message.id} className={`research-message research-${message.role}`}>
        <header><strong>{message.role==='user'?'Kamu':'Riset OpenMotion'}</strong><small>{message.role==='assistant'?[message.modelId,message.effort].filter(Boolean).join(' · '):''}</small></header>
        {message.content?<DocumentMarkdown content={message.content} fileName="jawaban riset"/>:null}
        {message.status==='running'?<div className="research-thinking" role="status"><LogoIntro size={28}/><span>{message.content?'Menyusun jawaban…':'Membaca konteks dan menyiapkan jawaban…'}</span></div>:null}
        {message.error?<p className="studio-error" role="alert">{message.error}</p>:null}
        {message.role==='assistant'&&message.sources.length?<details className="research-sources"><summary><BookOpen size={13}/>{message.sources.length} sumber untuk jawaban ini<ChevronDown size={13}/></summary><div>{message.sources.map(source=><section key={source.label}><a href={source.href} target={source.kind==='youtube'?'_blank':undefined} rel={source.kind==='youtube'?'noopener noreferrer':undefined}>[{source.label}] {source.title} {source.kind==='youtube'?<ExternalLink size={12}/>:null}</a><small>{source.kind==='youtube'?'Statistik YouTube':'Arsip episode'}</small><p>{source.excerpt}</p></section>)}</div></details>:null}
      </article>)}
      {pending&&!running?<p className="muted-copy" role="status">Mengirim permintaan…</p>:null}
    </div>
    <form className="research-composer" onSubmit={event=>{event.preventDefault();void send();}}>
      {error?<p className="studio-error" role="alert">{error}</p>:null}
      <Textarea aria-label="Pesan riset topik" placeholder="Misalnya: carikan topik lanjutan tentang satwa Indonesia…" value={text} onChange={event=>setText(event.target.value)} maxLength={4000} rows={3} disabled={pending}/>
      <div><small>Jawaban memakai arsip yang ditemukan dan statistik terakhir yang disinkronkan.</small>{running?<Button type="button" variant="outline" onClick={()=>void cancel()} disabled={pending}><Square size={15}/>Hentikan</Button>:<Button type="submit" disabled={pending||!text.trim()||!ready}><ArrowUp size={16}/>Kirim</Button>}</div>
    </form>
  </section>;
}
function YouTubeResearch({status,onRefresh}:{status:Status;onRefresh:()=>Promise<void>}){
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const youtube=status.youtube;
  async function action(name:'connect'|'sync'|'disconnect'){
    if(pending)return;
    if(name==='disconnect'&&!window.confirm('Putuskan koneksi YouTube dan hapus statistik tersimpan? Kutipan di riwayat chat tetap ada.'))return;
    setPending(true);setError('');
    try{const result=await studioRequest<{url?:string}>(`/api/research/youtube/${name}`,'POST');if(name==='connect'&&result.url)window.location.assign(result.url);else await onRefresh();}
    catch(error){setError(error instanceof Error?error.message:'Koneksi belum tersedia.');}finally{setPending(false);}
  }
  return <aside className="research-context">
    <section className="research-context-section"><span className="studio-kicker">Dasar riset</span><h2><BookOpen size={17}/>Arsip channel</h2><strong className="research-archive-count">{status.archiveCount} <small>episode dengan naskah disetujui</small></strong><p className="muted-copy">Naskah dan paket episode dicari ulang saat pesan dikirim. Draft yang belum disetujui tidak dijadikan rujukan.</p></section>
    <section className="research-context-section"><h2><Film size={18}/>YouTube Analytics</h2><p className="muted-copy">{youtube.connected?youtube.channelTitle:'Hubungkan channel untuk mencari pola dari video yang sudah ditonton audiens.'}</p>
      {error?<p className="studio-error" role="alert">{error}</p>:null}
      {youtube.connected?<div className="research-context-actions"><Button size="sm" variant="secondary" disabled={pending||youtube.syncing} onClick={()=>void action('sync')}><RefreshCw size={14}/>{pending||youtube.syncing?'Menyinkronkan…':'Sinkronkan statistik'}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={()=>void action('disconnect')}>Putuskan</Button></div>:<Button variant="outline" size="sm" disabled={pending||!youtube.configured} onClick={()=>void action('connect')}>Hubungkan YouTube</Button>}
      <p className="muted-copy">Izin baca saja. Tidak mengunggah atau memublikasikan video.</p>
      {youtube.syncedAt?<p className="research-period">Periode {youtube.periodStart} — {youtube.periodEnd}<br/>Sinkron {new Date(youtube.syncedAt).toLocaleString('id-ID')}<br/>Maksimal 50 video teratas menurut views periode ini; data dapat tertunda.</p>:youtube.connected?<p className="muted-copy">Belum ada statistik. Tekan Sinkronkan statistik untuk mengambil data 90 hari terakhir.</p>:null}
      {youtube.videos.length?<ol className="research-top-videos">{youtube.videos.slice(0,5).map(video=><li key={video.id}><a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">{video.title}<ExternalLink size={12}/></a><dl><div><dt>Views</dt><dd>{number(video.views)}</dd></div><div><dt>Rata-rata ditonton</dt><dd>{number(video.average_percentage)}%</dd></div><div><dt>Watch time</dt><dd>{number(video.watch_minutes)} mnt</dd></div></dl></li>)}</ol>:null}
      <details className="research-setup"><summary>Setup koneksi Google</summary><ol><li>Buat OAuth client bertipe Web application di Google Cloud.</li><li>Aktifkan YouTube Data API v3 dan YouTube Analytics API.</li><li>Tambahkan akun channel sebagai test user jika aplikasi masih dalam mode Testing.</li><li>Daftarkan redirect URI ini: <code>{status.callbackUrl}</code></li><li>Isi <code>YOUTUBE_CLIENT_ID</code> dan <code>YOUTUBE_CLIENT_SECRET</code> di <code>.env.local</code>, lalu restart OpenMotion.</li></ol><p>Izin statistik memerlukan persetujuan pemilik channel. Jangan menaruh Client Secret di chat. Koneksi mungkin perlu diulang saat token dicabut atau kedaluwarsa.</p></details>
    </section>
  </aside>;
}
export function ResearchWorkspace(){
  const router=useRouter();
  const [status,setStatus]=useState<Status|null>(null),[threadId,setThreadId]=useState<string|null>(null),[agents,setAgents]=useState<{id:string;name:string}[]>([]),[execution,setExecution]=useState<Execution>({agentId:'',modelId:'',effort:''}),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [topicOpen,setTopicOpen]=useState(false),[topic,setTopic]=useState(''),[creating,setCreating]=useState(false),[topicError,setTopicError]=useState('');
  const selectThread=useCallback((id:string|null)=>{setThreadId(id);const url=new URL(window.location.href);if(id)url.searchParams.set('thread',id);else url.searchParams.delete('thread');window.history.replaceState(null,'',url.pathname+url.search);},[]);
  const refresh=useCallback(async()=>{setStatus(await studioRequest<Status>('/api/research'));},[]);
  useEffect(()=>{
    let active=true;
    void Promise.all([studioRequest<Status>('/api/research'),studioRequest<{agents:{id:string;name:string}[]}>('/api/agents'),studioRequest<{settings:{agentId:string}}>('/api/settings')]).then(([data,a,s])=>{if(active){setStatus(data);const requested=new URLSearchParams(window.location.search).get('thread');setThreadId(data.threads.find(thread=>thread.id===requested)?.id??data.threads[0]?.id??null);setAgents(a.agents);setExecution({agentId:s.settings.agentId||a.agents[0]?.id||'',modelId:'',effort:''});const result=new URLSearchParams(window.location.search).get('youtube');if(result)setNotice(result==='connected'?'YouTube terhubung. Sinkronkan statistik untuk mulai memakainya dalam riset.':'YouTube belum berhasil dihubungkan. Periksa redirect URI, izin kedua API, dan test user, lalu coba lagi.');}}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[]);
  async function createEpisode(){
    if(!topic.trim()||creating)return;setCreating(true);setTopicError('');
    try{const result=await studioRequest<{episode:{slug:string}}>('/api/episodes','POST',{title:'',topic:topic.trim()});router.push(`/episodes/${result.episode.slug}`);}catch(error){setTopicError(error instanceof Error?error.message:'Episode belum dibuat.');}finally{setCreating(false);}
  }
  return <>
    <div className="page-heading"><div><p className="studio-kicker">Sebelum produksi</p><h1>Riset topik</h1><p>Temukan ide berikutnya dari cerita yang sudah dibuat dan respons audiens.</p></div></div>
    {error?<p className="studio-error" role="alert">{error}</p>:null}{notice?<p className="studio-notice" role="status">{notice}</p>:null}
    <div className="research-layout"><div className="research-primary">
      <div className="research-toolbar"><label>Percakapan<select aria-label="Pilih percakapan riset" value={threadId??''} onChange={event=>selectThread(event.target.value||null)}><option value="">Riset baru</option>{status?.threads.map(thread=><option key={thread.id} value={thread.id}>{thread.title}</option>)}</select></label><Button size="sm" variant="outline" onClick={()=>selectThread(null)}><Plus size={14}/>Riset baru</Button></div>
      <AgentPicker key={`${execution.agentId}:${execution.modelId}`} agents={agents} value={execution} onChange={next=>{setReady(false);setExecution(next);}} disabled={false} onReady={setReady}/>
      {!agents.length&&status?<p className="muted-copy">Tambahkan agen melalui <Link href="/settings">Pengaturan</Link> untuk mulai berdiskusi.</p>:null}
      <ResearchConversation key={threadId??'new'} threadId={threadId} execution={execution} ready={ready} onCreated={selectThread} onRefresh={()=>void refresh().catch(()=>{})} onUseTopic={()=>{setTopic('');setTopicError('');setTopicOpen(true);}}/>
    </div>{status?<YouTubeResearch status={status} onRefresh={refresh}/>:<aside className="research-context"><p className="muted-copy" role="status">Memuat arsip dan koneksi…</p></aside>}</div>
    <StudioModal open={topicOpen} title="Jadikan ide sebagai episode" onClose={()=>{if(!creating)setTopicOpen(false);}}><form className="studio-form" onSubmit={event=>{event.preventDefault();void createEpisode();}}><p className="form-intro">Pilih satu ide dari percakapan dan rumuskan topiknya. Produksi dimulai setelah episode dibuat.</p>{topicError?<p className="studio-error" role="alert">{topicError}</p>:null}<label>Topik episode<Textarea required maxLength={500} rows={4} value={topic} onChange={event=>setTopic(event.target.value)} placeholder="Kenapa orangutan hanya ada di Sumatra dan Kalimantan?"/></label><div className="modal-actions"><Button type="button" variant="ghost" onClick={()=>setTopicOpen(false)} disabled={creating}>Batal</Button><Button type="submit" disabled={creating||!topic.trim()}>{creating?'Membuat…':'Buat episode'}</Button></div></form></StudioModal>
  </>;
}
