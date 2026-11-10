import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const send=value=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n');
let cwd='',pending=null;
for await(const line of readline.createInterface({input:process.stdin})){
  const message=JSON.parse(line),result=(value)=>send({id:message.id,result:value});
  if(message.method==='initialize')result({protocolVersion:1});
  else if(message.method==='session/new'){cwd=message.params.cwd;result({sessionId:'research-fixture',modes:{currentModeId:'default',availableModes:[{id:'read-only',name:'Read only'},{id:'default',name:'Default'}]}});}
  else if(message.method==='session/set_mode'){fs.writeFileSync(path.join(cwd,'mode.json'),JSON.stringify({mode:message.params.modeId,secretVisible:Boolean(process.env.YOUTUBE_CLIENT_SECRET)}));result({});}
  else if(message.method==='session/prompt'){
    fs.writeFileSync(path.join(cwd,'prompt.txt'),message.params.prompt[0].text);
    pending={id:message.id,hasSource:message.params.prompt[0].text.includes('\"label\":\"S1\"')};
    send({id:8000,method:'session/request_permission',params:{sessionId:'research-fixture',toolCall:{toolCallId:'do-not-write',title:'Try writing a file',kind:'edit'},options:[{optionId:'allow',name:'Allow',kind:'allow_once'},{optionId:'deny',name:'Deny',kind:'reject_once'}]}});
  }else if(message.id===8000&&pending){
    if(message.result?.outcome?.optionId==='allow')fs.writeFileSync(path.join(cwd,'should-not-exist.txt'),'unsafe');
    fs.writeFileSync(path.join(cwd,'permission.json'),JSON.stringify(message.result));
    const delay=process.argv.includes('--slow')?2500:20;
    for(const text of ['Coba bahas habitat orangutan ',pending.hasSource?'dengan sudut pandang baru [S1].':'dengan sudut pandang baru; statistik belum tersedia.']){send({method:'session/update',params:{sessionId:'research-fixture',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}});await new Promise(resolve=>setTimeout(resolve,delay));}
    send({id:pending.id,result:{stopReason:'end_turn'}});pending=null;
  }
}
