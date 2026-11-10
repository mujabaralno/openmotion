import fs from 'node:fs';
import { getSettings, saveSettings } from '@/server/pipeline/settings';
import { seedProductionFiles } from '@/server/pipeline/prompts';
import { resolveWorkspaceDir } from '@/server/workspace/init';
import { resolveWorkspacePath } from '@/server/workspace/paths';
import { parseAgentsConfig } from '@/server/agents/config';
import { bodyObject, apiError, json } from '@/server/pipeline/http';
import { redactText } from '@/server/security/redact';
import { AGENT_PRESETS } from '@/lib/agent-presets';
export const dynamic='force-dynamic';
function configPath(name:string) {
  const area=name==='agents.json'?'root':name==='style-parallax.md'?'guide':'prompts';
  if(!['agents.json','script.md','tags.md','scenes.md','style-parallax.md'].includes(name)) throw new Error('Konfigurasi tidak diizinkan.');
  const result=resolveWorkspacePath({workspaceRoot:resolveWorkspaceDir(),area,fileName:name});
  if(!result.ok) throw new Error('Lokasi konfigurasi tidak aman.');
  return result.path;
}
export async function GET() {
  const files:Record<string,string>={}; let workspace=''; let workspaceError='';
  try { seedProductionFiles(); workspace=resolveWorkspaceDir(); for(const name of ['agents.json','script.md','tags.md','scenes.md','style-parallax.md']) files[name]=redactText(fs.readFileSync(configPath(name),'utf8')); }
  catch(error) {workspaceError=error instanceof Error?error.message:'Workspace belum siap.';}
  return json({settings:getSettings(),hasApiKey:Boolean(process.env.ELEVENLABS_API_KEY),workspace,workspaceError,files});
}
export async function PUT(request:Request) {
  try {
    const body=await bodyObject(request);
    const active=(globalThis as typeof globalThis & {__openMotionPipeline?:{tasks:Map<string,unknown>}}).__openMotionPipeline;
    if(active?.tasks.size) throw new Error('Tunggu seluruh pekerjaan selesai sebelum mengubah pengaturan.');
    if(body.preset!==undefined) {
      const preset=AGENT_PRESETS.find(preset=>preset.id===body.preset);
      if(!preset)throw new Error('Preset agen tidak dikenal.');
      const target=configPath('agents.json');
      // Append to the original server file so redacted credentials in the UI
      // cannot replace the creator's existing configuration.
      const config=JSON.parse(fs.readFileSync(target,'utf8'));
      const parsed=parseAgentsConfig(config);
      if(parsed.byId.has(preset.id))throw new Error('Agen ini sudah terdaftar.');
      const {id,name,command,args}=preset;
      config.agents.push({id,name,command,args});
      const content=JSON.stringify(config,null,2);
      fs.writeFileSync(target,content,{encoding:'utf8',mode:0o600});
      return json({saved:true,content:redactText(content)});
    }
    if(body.file!==undefined) {
      if(typeof body.file!=='string' || typeof body.content!=='string' || !body.content.trim() || body.content.length>200000) throw new Error('Isi konfigurasi tidak valid.');
      if(body.file==='agents.json') parseAgentsConfig(JSON.parse(body.content));
      const target=configPath(body.file);
      fs.writeFileSync(target,body.content,{encoding:'utf8',mode:0o600});
      return json({saved:true});
    }
    return json({settings:saveSettings(body)});
  } catch(error) {return apiError(error);}
}
