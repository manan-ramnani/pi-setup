// Explicit opt-in local smoke test. Creates only its own HTTP fixture/browser
// session; never attaches to personal Chrome or inspects desktop app content.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { agentDirectory, root } from './lib.mjs';

const agent=agentDirectory();
const launcher=join(root,'extensions/computer-use/launch.mjs');
const session='pi-smoke-'+randomUUID().replaceAll('-','').slice(0,16);
const server=createServer((_req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end('<!doctype html><title>Pi computer-use fixture</title><label>Name <input id="name"></label><button id="save" onclick="document.getElementById(\'result\').textContent=\'Saved: \'+document.getElementById(\'name\').value">Save fixture</button><p id="result">Not saved</p>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const child=spawn(process.execPath,[launcher,agent,session,'browser','mcp','--tools','core,tabs'],{stdio:['pipe','pipe','pipe']});
const stopped=new Promise(resolve=>child.once('exit',resolve));
const pending=new Map();let sequence=0,buffer='',stderr='';
function failAll(error){for(const value of pending.values()){clearTimeout(value.timer);value.reject(error);}pending.clear();}
child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
child.on('error',failAll);
child.on('exit',()=>failAll(new Error('MCP exited before response. '+stderr)));
child.stdout.on('data',chunk=>{
  buffer+=chunk;
  while(buffer.includes('\n')){
    const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);
    if(!line)continue;
    try{
      const reply=JSON.parse(line),request=pending.get(reply.id);
      if(!request)continue;
      clearTimeout(request.timer);pending.delete(reply.id);
      if(reply.error)request.reject(new Error(JSON.stringify(reply.error)));else request.resolve(reply.result);
    }catch(error){failAll(error);}
  }
});
function rpc(method,params={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP timeout; do not blindly retry an action: '+method));},45000);
    pending.set(id,{resolve,reject,timer});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
}
async function call(name,args={}){
  const result=await rpc('tools/call',{name:'agent_browser_'+name,arguments:{session,...args}});
  assert(!result.isError,JSON.stringify(result));return result;
}
try{
  await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'pi-setup-local-smoke',version:'1'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  let cursor,count=0;
  do{const page=await rpc('tools/list',cursor?{cursor}:{});count+=page.tools.length;cursor=page.nextCursor;}while(cursor);
  assert(count>=20);
  console.log('PASS official MCP handshake and typed tool discovery ('+count+' tools)');
  await call('open',{url:`http://127.0.0.1:${server.address().port}`});
  const snapshot=await call('snapshot',{interactive:true});
  assert(JSON.stringify(snapshot).includes('Save fixture'));
  await call('fill',{selector:'#name',text:'Pi smoke'});
  await call('click',{selector:'#save'});
  const result=await call('get_text',{selector:'#result'});
  assert(JSON.stringify(result).includes('Saved: Pi smoke'));
  const screenshot=await call('screenshot',{});
  assert(screenshot.content?.some(block=>block.type==='image' && block.mimeType?.startsWith('image/')),'Screenshot must be delivered as an MCP image, not merely a path');
  console.log('PASS isolated Chrome local fixture: open, snapshot, fill, click, verify and screenshot image forwarding');
}finally{
  try{await call('close');}catch(error){console.error('Owned browser cleanup needs attention: '+error.message);process.exitCode=1;}
  child.stdin.end();child.kill('SIGTERM');
  const force=setTimeout(()=>child.kill('SIGKILL'),4000);
  await stopped;clearTimeout(force);
  await new Promise(resolve=>server.close(resolve));
}
// Status only: no list-apps, snapshots, screen capture or permission prompts.
const desktop=spawn(process.execPath,[launcher,agent,session,'desktop','status'],{stdio:['ignore','pipe','pipe']});
let output='';desktop.stdout.on('data',chunk=>output+=chunk);
const desktopTimeout=setTimeout(()=>desktop.kill('SIGTERM'),20000);
const code=await new Promise((resolve,reject)=>{desktop.on('error',reject);desktop.on('exit',resolve);}).finally(()=>clearTimeout(desktopTimeout));
assert.equal(code,0);
const status=JSON.parse(output);assert(status.ok);
console.log('Desktop '+status.data.version+' permissions: '+JSON.stringify(Object.fromEntries(Object.entries(status.data.permissions).map(([name,value])=>[name,value.state]))));
console.log('No desktop app contents inspected; denied grants are a user setup gate, not bypassed.');
