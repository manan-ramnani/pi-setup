#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Telemetry, ENTRY, WINDOW, summarize, formatMetrics, isContentEvent, validSample } from './metrics.mjs';
import { sessionFacade, makeFooter, fastLabel } from './footer.mjs';
import { piImport, piDependencyImport } from '../../scripts/lib.mjs';
const { loadExtensions, discoverAndLoadExtensions }=await piImport('dist/core/extensions/loader.js');
const { FooterComponent, AgentSession, initTheme }=await piImport('dist/index.js');
const { ExtensionRunner }=await piImport('dist/core/extensions/runner.js');
const { theme }=await piImport('dist/modes/interactive/theme/theme.js');
const { visibleWidth, truncateToWidth }=await piDependencyImport('@earendil-works/pi-tui', 'dist/index.js');
initTheme('dark',false);

const id={provider:'openai',api:'openai-responses',model:'test-model'};
const assistant=(stopReason='stop',output=120)=>({role:'assistant',...id,content:[],stopReason,usage:{output}});
let now=0;
const t=new Telemetry(()=>now);
function call({first=1200,duration=1000,output=120,stopReason='stop',identity=id}={}) {
  const msg={...assistant(stopReason,output),...identity};
  now=0; t.arm(); t.begin(); t.started(msg);
  now=first; t.update(msg,{type:'text_delta',delta:'hello'});
  now=first+duration;
  return t.finish(msg,1700000000000);
}
assert.equal(formatMetrics(t.stats(id)),'— / — | — / — TPS');
let sample=call();
assert.deepEqual(sample,{...id,ttftMs:1200,generationMs:1000,outputTokens:120,at:1700000000000});
assert.equal(formatMetrics(t.stats(id)),'1.2s / 1.2s | 120 / 120 TPS');
assert.equal(isContentEvent({type:'start'}),false);
assert.equal(isContentEvent({type:'thinking_start'}),false);
assert.equal(isContentEvent({type:'text_delta',delta:''}),false);
assert.equal(isContentEvent({type:'thinking_delta',delta:'thinking'}),true);
assert.equal(isContentEvent({type:'toolcall_delta',delta:'{}'}),true);
assert.equal(isContentEvent({type:'toolcall_start',contentIndex:0,partial:{content:[{type:'toolCall',name:'foo'}]}}),true);
assert.equal(isContentEvent({type:'toolcall_start',contentIndex:0,partial:{content:[{type:'toolCall',name:''}]}}),false);
assert.equal(isContentEvent({type:'toolcall_delta',delta:'',contentIndex:0,partial:{content:[{type:'toolCall',name:'foo'}]}}),true);
now=0; t.arm(); t.begin(); t.started(assistant('toolUse'));
now=500; t.update(assistant('toolUse'),{type:'toolcall_start',contentIndex:0,partial:{content:[{type:'toolCall',name:''}]}});
now=900; t.update(assistant('toolUse'),{type:'toolcall_delta',delta:'',contentIndex:0,partial:{content:[{type:'toolCall',name:'no_args_tool'}]}});
now=1900; assert.equal(t.finish(assistant('toolUse')).ttftMs,900);
console.log('PASS monotonic TTFT, generation-only TPS, placeholders, non-empty text/thinking/tool content');

const count=t.stats(id).count;
assert.equal(call({stopReason:'error'}),undefined);
assert.equal(call({stopReason:'aborted'}),undefined);
assert.equal(t.stats(id).count,count);
now=0; t.arm(); t.begin(); t.started(assistant()); now=500;
t.update(assistant(),{type:'start'}); now=2000;
assert.equal(t.finish(assistant()),undefined);
t.begin(); t.started(assistant());
assert.equal(t.finish(assistant()),undefined,'Idle/unarmed calls cannot produce samples');
now=0; t.arm(); t.begin(); now=1000; t.begin(); t.started(assistant());
now=1500; t.update({...assistant(),provider:'other'},{type:'text_delta',delta:'ignored'});
now=1800; t.update(assistant(),{type:'text_delta',delta:'x'});
now=2800; assert.equal(t.finish(assistant()),undefined,'Ambiguous pre-start hooks (e.g. cache warming) must not shorten TTFT');
now=0; t.arm(); t.begin(); t.started(assistant());
now=1200; t.update(assistant(),{type:'text_delta',delta:'x'});
now=1500; t.begin(); // Warming after foreground message_start is ignored.
now=2200; assert.equal(t.finish(assistant()).ttftMs,1200);
const noUsage=call({output:0});
assert.equal(summarize([noUsage]).tpsP50,undefined);
assert.equal(summarize([noUsage]).tpsP95,undefined);
const zeroDuration=call({duration:0});
assert.equal(summarize([zeroDuration]).tpsCount,0);
const mixed=summarize([sample,noUsage,zeroDuration,{...sample,outputTokens:Number.MAX_VALUE,generationMs:Number.MIN_VALUE}]);
assert.equal(mixed.count,4);
assert.equal(mixed.tpsCount,1);
assert.equal(mixed.tpsP50,120);
assert.equal(mixed.tpsP95,120);
assert.equal(call({first:-1}),undefined);
console.log('PASS failed/aborted/no-content calls excluded, ambiguous warming omitted, identity isolation, unavailable usage/interval');

t.history.clear();
for(let i=1;i<=60;i++) call({first:i*100,output:i*10});
assert.equal(t.stats(id).count,WINDOW);
assert.equal(t.stats(id).p50,3500); // retained samples 11..60, rank 25 = 35
assert.equal(t.stats(id).p95,5800); // rank 48 = 58
assert.equal(t.stats(id).tpsCount,50);
assert.equal(t.stats(id).tpsP50,350);
assert.equal(t.stats(id).tpsP95,580);
call({first:9000,identity:{...id,model:'other-model'}});
call({first:8000,identity:{...id,provider:'other-provider'}});
call({first:7000,identity:{...id,api:'other-api'}});
assert.equal(t.stats({...id,api:'other-api'}).p50,7000);
assert.equal(t.stats(id).count,50);
assert.equal(t.stats({...id,model:'other-model'}).p50,9000);
const entry=s=>({type:'custom',customType:ENTRY,data:{version:1,kind:'sample',sample:s}});
const noRateWindow=new Telemetry();
noRateWindow.restore([entry(sample),...Array.from({length:50},()=>entry(noUsage))]);
assert.equal(noRateWindow.stats(id).count,50);
assert.equal(noRateWindow.stats(id).tpsCount,0,'TPS uses the same retained call window, not the last 50 valid rates');
assert.equal(formatMetrics(noRateWindow.stats(id)),'1.2s / 1.2s | — / — TPS');
t.restore([entry(sample),entry({...sample,ttftMs:3500}),{type:'custom',customType:ENTRY,data:{version:1,kind:'sample',sample:{...sample,ttftMs:Infinity}}}]);
assert.equal(formatMetrics(t.stats(id)),'1.2s / 3.5s | 120 / 120 TPS');
t.restore([entry(sample),{type:'custom',customType:ENTRY,data:{version:1,kind:'reset'}},entry({...sample,ttftMs:3500})]);
assert.equal(t.stats(id).count,1);
assert.equal(t.stats(id).p50,3500);
assert.equal(validSample({...sample,outputTokens:NaN}),false);
assert.equal(validSample({...sample,model:42}),false);
console.log('PASS rolling nearest-rank p50/p95, per-provider/API/model buckets, restore/branch/reset, validation');

// Native footer comparison, including every existing token/cache/cost/context
// field, right-side model/thinking, cwd/git/session name, and /fast status.
const usage=(input,output,cacheRead,cost)=>({input,output,cacheRead,cacheWrite:0,totalTokens:input+output+cacheRead,cost:{input:cost,output:0,cacheRead:0,cacheWrite:0,total:cost}});
const entries=[
  {type:'message',message:{...assistant(),usage:usage(702000,97880,20890000,3.5)}},
  {type:'message',message:{...assistant(),usage:usage(1000,120,110000,.121)}},
];
let leaf='leaf-1', sessionId='session-1', idle=true, trusted=false;
let reads=0, renderCount=0, unsubscribeCount=0;
const model={provider:id.provider,api:id.api,id:id.model,name:'Mock',baseUrl:'https://api.openai.com/v1',reasoning:true,contextWindow:272000};
const ctx={
  mode:'tui',hasUI:true,cwd:process.cwd(),model,thinkingLevel:'high',
  isIdle:()=>idle,isProjectTrusted:()=>trusted,
  getContextUsage:()=>({tokens:28288,percent:10.4,contextWindow:272000}),
  modelRegistry:{isUsingOAuth:m=>m.provider==='openai',getProvider:()=>({auth:{oauth:{isSubscription:true}}}),find:(provider,id)=>provider===model.provider && id===model.id ? model : undefined},
  sessionManager:{
    getBranch:()=>entries,getEntries:()=>{reads++;return [...entries];},getSessionId:()=>sessionId,
    buildSessionProjection:()=>({messages:entries.filter(e=>e.type==='message').map(e=>e.message)}),
    getLeafId:()=>leaf,getSessionName:()=> 'session name',getCwd:()=>process.cwd(),
  },
};
const footerStatuses=new Map([['chatgpt-fast','fast: on (requested)'],['other-status','other extension OK']]);
const footerData={getGitBranch:()=> 'main',getAvailableProviderCount:()=>2,
  getExtensionStatuses:()=>footerStatuses,
  onBranchChange:()=>()=>{unsubscribeCount++;},
};
let autoCompact=true;
const pi={getThinkingLevel:()=> 'high',getSettings:()=>({compaction:{enabled:autoCompact}})};
const fTelemetry=new Telemetry();
fTelemetry.restore([entry({...sample,outputTokens:70}),entry({...sample,ttftMs:3500})]);
const nativeData={...footerData,getExtensionStatuses:()=>new Map([...footerStatuses].filter(([key])=>key!=='chatgpt-fast'))};
const native=new FooterComponent(sessionFacade(ctx,pi.getThinkingLevel,()=>undefined),nativeData);
const temp=mkdtempSync(join(tmpdir(),'pi-latency-tests-'));
try {
  const footer=makeFooter({ctx,pi,tui:{requestRender:()=>renderCount++},theme,footerData,telemetry:fTelemetry,
    getRoute:()=>undefined,FooterComponent,visibleWidth,truncateToWidth});
  const baseline=native.render(300);
  const actual=footer.render(300);
  const suffix=' | 1.2s / 3.5s | 70 / 120 TPS | Fast on';
  assert.equal(actual[1].replace(suffix,' '.repeat(visibleWidth(suffix))),baseline[1]);
  assert.equal(actual[0],baseline[0]);
  assert.equal(actual[2],baseline[2]);
  const plain=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
  assert.match(plain(actual[1]),/↑703k ↓98k R21M CH99\.1% \$3\.621 \(sub\) 10\.4%\/272k \(auto\) \| 1\.2s \/ 3\.5s \| 70 \/ 120 TPS \| Fast on/);
  assert.match(plain(actual[1]),/test-model.*high/);
  assert.equal(plain(actual[2]),'other extension OK');
  assert(!actual.some(line=>plain(line).includes('fast:')),'No duplicate fast status row');
  assert.equal(footerStatuses.get('chatgpt-fast'),'fast: on (requested)','Source status map is not mutated');
  footerStatuses.delete('chatgpt-fast');
  assert.equal(fastLabel(footerData),'Fast off');
  assert.match(plain(footer.render(300)[1]),/\| Fast off/);
  footerStatuses.set('chatgpt-fast','fast: default');
  assert.equal(fastLabel(footerData),'Fast on','Toggle ON is not a claim that priority service was delivered');
  footerStatuses.set('chatgpt-fast','fast: inactive');
  assert.match(plain(footer.render(300)[1]),/\| Fast on \(inactive\)/);
  footerStatuses.set('chatgpt-fast','fast: on (requested)');
  footerStatuses.delete('other-status');
  assert.equal(footer.render(300).length,2,'No empty secondary status row when Fast is the only status');
  footerStatuses.set('other-status','other extension OK');
  for(const width of [1,8,20,60,90,120,180,300]) {
    const base=native.render(width);
    const result=footer.render(width);
    for(const line of result) assert(visibleWidth(line)<=width,`overflow at width ${width}: ${plain(line)}`);
    if(result.length>base.length) assert.equal(result[1],base[1],'Narrow layout must retain native stats');
  }
  const before=reads; for(let i=0;i<20;i++) footer.render(300);
  assert.equal(reads,before,'No repeated history scans per frame');
  autoCompact=false;
  assert(!plain(footer.render(300)[1]).includes('(auto)'));
  autoCompact=true;
  assert(plain(footer.render(300)[1]).includes('(auto)'));
  footer.dispose(); footer.dispose(); assert.equal(unsubscribeCount,1);
  console.log('PASS exact requested footer, native metrics/model/status preservation, ANSI, resizing, caching, cleanup');

  console.log('PASS auto-compaction indicator reads effective runtime settings without file IO');

  // Real extension registration/event dispatch with a deterministic local clock.
  const descriptor=Object.getOwnPropertyDescriptor(performance,'now');
  let clock=0;
  Object.defineProperty(performance,'now',{value:()=>clock,configurable:true});
  try {
    const loaded=await loadExtensions([
      join(dirname(fileURLToPath(import.meta.url)),'index.ts'),
      join(dirname(fileURLToPath(import.meta.url)),'../chatgpt-fast/index.ts'),
    ],process.cwd());
    assert.deepEqual(loaded.errors,[]);
    loaded.runtime.appendEntry=(customType,data)=>{entries.push({type:'custom',customType,data});leaf+='x';};
    loaded.runtime.getSettings=pi.getSettings;
    loaded.runtime.getThinkingLevel=pi.getThinkingLevel;
    const ext=loaded.extensions[0];
    async function emit(name,data={},context=ctx) {
      let result;
      for(const extension of loaded.extensions) for(const handler of extension.handlers.get(name)||[]) {
        const value=await handler({type:name,entries:[],...data},context);
        if(value!==undefined) result=value;
      }
      return result;
    }
    let component;
    ctx.ui={
      notify:(text,level)=>notices.push({text,level}),
      setStatus:(key,value)=>{if(value===undefined)footerStatuses.delete(key);else footerStatuses.set(key,value);renderCount++;},
      setFooter:factory=>{component?.dispose();component=undefined;if(factory)component=factory({requestRender:()=>renderCount++},theme,footerData);},
    };
    const notices=[];
    const command=ext.commands.get('latency').handler;
    await emit('session_start');
    assert(component);
    assert.match(plain(component.render(300)[1]),/— \/ — \| — \/ — TPS \| Fast off/);
    await emit('turn_start'); clock=100;
    const payload={model:'test-model',input:[],service_tier:'priority'};
    const original=JSON.stringify(payload);
    assert.equal(await emit('before_provider_request',{payload}),undefined);
    assert.equal(JSON.stringify(payload),original,'Telemetry cannot mutate requests');
    clock=500; await emit('message_start',{message:assistant()});
    clock=1300; await emit('message_update',{message:assistant(),assistantMessageEvent:{type:'thinking_delta',delta:'thinking'}});
    const final={...assistant(),thinkingLevel:'medium',usage:usage(0,120,0,0)};
    clock=2300; await emit('message_end',{message:final});
    entries.push({type:'message',message:final}); leaf+='x';
    // Use the real boundary runner to catch replacement-vs-append behavior.
    const earlier={type:'custom',customType:'another-extension',data:{keep:true}};
    const previous={...ext,path:'test-prior-extension',handlers:new Map([['turn_end',[event=>({entries:[...event.entries,earlier],continue:true})]]])};
    const runner=new ExtensionRunner([previous,ext],loaded.runtime,ctx.cwd,ctx.sessionManager,ctx.modelRegistry);
    runner.createContext=()=>ctx;
    const boundary=await runner.emitBoundary({type:'turn_end',message:final,outcome:'completed'},()=>({contextEntries:[],contextMessages:[],llmMessages:[],pendingMessages:[],canContinue:true}));
    assert.equal(boundary.valid,true);
    assert.equal(boundary.continue,true);
    assert.deepEqual(boundary.entries[0],earlier,'Other extensions boundary drafts must survive');
    assert.equal(boundary.entries[1].data.sample.ttftMs,1200);
    assert.equal(boundary.entries[1].data.sample.generationMs,1000);
    entries.push(...boundary.entries); leaf+='x';
    assert.match(plain(component.render(300)[1]),/1\.2s \/ 1\.2s \| 120 \/ 120 TPS/);
    await emit('agent_end');
    await emit('session_start'); // reload/resume reconstruction
    assert.match(plain(component.render(300)[1]),/1\.2s \/ 1\.2s \| 120 \/ 120 TPS/);
    await command('status',ctx); assert.match(notices.at(-1).text,/1\/50/);
    assert.match(notices.at(-1).text,/TPS p50\/p95: 1 valid/);
    const fastCommand=loaded.extensions[1].commands.get('fast').handler;
    await fastCommand('on',ctx);
    assert.match(plain(component.render(300)[1]),/\| Fast on/);
    await emit('session_start');
    assert.match(plain(component.render(300)[1]),/\| Fast on/);
    await fastCommand('off',ctx);
    assert.match(plain(component.render(300)[1]),/\| Fast off/);
    await fastCommand('on',ctx);
    console.log('PASS actual /fast toggle updates inline on/off state and survives reload without duplicate status');
    const physical=ctx.model;
    ctx.model={...physical,provider:'router',api:'pi-virtual',id:'auto'};
    await emit('model_select');
    let routeLine=plain(component.render(300)[1]);
    assert.match(routeLine,/auto.*high → test-model.*medium/);
    assert.match(routeLine,/1\.2s \/ 1\.2s \| 120 \/ 120 TPS \| Fast on \(inactive\)/);
    const nativeRoute=Object.getOwnPropertyDescriptor(AgentSession.prototype,'routedModel').get.call({
      model:ctx.model,agent:{state:{messages:ctx.sessionManager.buildSessionProjection().messages}},
      _modelRuntime:{getPhysicalModel:ctx.modelRegistry.find},
    });
    assert.equal(nativeRoute.thinkingLevel,'medium');
    assert.equal(nativeRoute.model.id,'test-model');
    await emit('turn_start'); clock=3000;
    await emit('before_provider_request',{payload});
    const failed={...final,model:'failed-model',thinkingLevel:'high',stopReason:'error'};
    await emit('message_start',{message:failed});
    clock=4000; await emit('message_update',{message:failed,assistantMessageEvent:{type:'text_delta',delta:'x'}});
    clock=5000; await emit('message_end',{message:failed});
    entries.push({type:'message',message:failed});leaf+='x';
    assert.equal(await emit('turn_end'),undefined);
    routeLine=plain(component.render(300)[1]);
    assert.match(routeLine,/→ test-model.*medium/); assert(!routeLine.includes('failed-model'));
    await emit('session_start');
    assert.match(plain(component.render(300)[1]),/auto.*high → test-model.*medium/);
    assert.match(plain(component.render(300)[1]),/1\.2s \/ 1\.2s \| 120 \/ 120 TPS/);
    await emit('session_tree');
    assert.match(plain(component.render(300)[1]),/→ test-model.*medium/);
    ctx.model=physical; await emit('model_select');
    assert(!plain(component.render(300)[1]).includes('→'));
    console.log('PASS actual boundary composition and native virtual-route thinking/failure/reload/branch behavior');
    await command('off',ctx); assert.equal(component,undefined);
    await emit('session_start'); assert.equal(component,undefined,'Visibility persists');
    await command('on',ctx); assert(component);
    idle=false; const length=entries.length;
    await command('reset',ctx); assert.equal(entries.length,length);
    idle=true;
    await command('reset',ctx);
    assert.match(plain(component.render(300)[1]),/— \/ — \| — \/ — TPS/);
    await emit('session_tree');
    await command('status',ctx); assert.match(notices.at(-1).text,/0\/50/);
    const savedModel=ctx.model;
    ctx.model={...model,id:'other-model'};
    await emit('model_select');
    assert.match(plain(component.render(300)[1]),/— \/ — \| — \/ — TPS/);
    ctx.model=savedModel;
    await emit('session_shutdown'); assert.equal(component,undefined);
    const noTui={...ctx,mode:'rpc',ui:{notify:()=>{},setStatus:()=>{},setFooter:()=>{throw Error('RPC cannot set terminal footer');}}};
    await emit('session_start',{},noTui);
    const noUi={...noTui,mode:'print',hasUI:false};
    await emit('session_start',{},noUi);
    console.log('PASS real extension hooks, non-mutating requests, turn-boundary persistence, resume/reset/model/visibility, RPC/headless');
  } finally {
    if(descriptor) Object.defineProperty(performance,'now',descriptor);
    else delete performance.now;
  }
} finally { rmSync(temp,{recursive:true,force:true}); }

const discovery=mkdtempSync(join(tmpdir(),'pi-discovery-'));
try {
  const extensionsDir=join(discovery,'extensions');
  mkdirSync(extensionsDir);
  const sourceDir=dirname(fileURLToPath(import.meta.url));
  for(const name of ['latency-throughput','chatgpt-fast']) {
    cpSync(join(sourceDir,'..',name),join(extensionsDir,name),{recursive:true});
  }
  const discovered=await discoverAndLoadExtensions([],discovery,discovery);
  assert.deepEqual(discovered.errors,[]);
  assert.equal(discovered.extensions.filter(e=>e.commands.has('latency')).length,1);
  assert.equal(discovered.extensions.filter(e=>e.commands.has('fast')).length,1);
} finally { rmSync(discovery,{recursive:true,force:true}); }
console.log('PASS global auto-discovery alongside /fast and existing extensions');
console.log('All telemetry tests passed. No live inference, credentials, or subscription quota used.');
