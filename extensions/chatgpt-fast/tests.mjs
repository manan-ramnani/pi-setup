#!/usr/bin/env node
// No live inference or credential access. Uses pi's actual extension loader and
// OpenAI transport with mocked fetch to verify the outgoing request field.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { piImport, piDependencyImport } from '../../scripts/lib.mjs';
const { loadExtensions } = await piImport('dist/core/extensions/loader.js');
const entries = [];
const notifications = [];
const statuses = new Map();
const runtimeModel = {
  provider: 'openai', api: 'openai-responses', baseUrl: 'https://api.openai.com/v1', id: 'test-model',
  name: 'Mock model', reasoning: false, input: ['text'],
  contextWindow: 16000, maxTokens: 512,
  cost: {input:0,output:0,cacheRead:0,cacheWrite:0},
};
let oauth = true;
let idle = true;
const ctx = {
  model: runtimeModel, hasUI: true,
  isIdle: () => idle,
  modelRegistry: {isUsingOAuth: () => oauth},
  sessionManager: {getBranch: () => entries},
  ui: {notify: (text,level) => notifications.push({text,level}),setStatus: (key,value) => statuses.set(key,value)},
};
async function load() {
  const r=await loadExtensions([join(dirname(fileURLToPath(import.meta.url)),'index.ts')],process.cwd());
  assert.deepEqual(r.errors,[]);
  r.runtime.appendEntry=(customType,data)=>entries.push({type:'custom',customType,data:{...data}});
  return r.extensions[0];
}
let ext=await load();
let command=ext.commands.get('fast').handler;
async function event(name, data={}, context=ctx) {
  let result;
  for(const handler of ext.handlers.get(name)||[]) {
    const value=await handler({type:name,...data},context);
    if(value!==undefined) result=value;
  }
  return result;
}
const payload = {model:'test-model',input:[],reasoning:{effort:'high'},tools:[{type:'function',name:'foo'}]};
await event('session_start');
assert.equal(await event('before_provider_request',{payload}),undefined);
assert.equal(entries.length,0);
await command('',ctx);
assert.equal(entries.at(-1).data.enabled,true);
const fast=await event('before_provider_request',{payload});
assert.equal(fast.service_tier,'priority');
assert.deepEqual(fast.reasoning,payload.reasoning);
assert.equal(fast.tools,payload.tools);
assert(!('service_tier' in payload),'Original payload not mutated');
console.log('PASS /fast toggle adds priority without changing model, reasoning, tools, or input');
await event('provider_stream_event',{provider:'openai',api:'openai-responses',model:'test-model',data:{type:'response.completed',response:{service_tier:'default'}}});
await command('status',ctx);
assert.match(notifications.at(-1).text,/server reported default/);
assert.equal(statuses.get('chatgpt-fast'),'fast: default');
console.log('PASS server tier reporting distinguishes requested fast from returned default');

// Real OpenAI request construction and serialization, but no real HTTP request.
const { stream } = await piDependencyImport('@earendil-works/pi-ai', 'dist/api/openai-responses.js');
let sent;
const context={messages:[{role:'user',content:'Test',timestamp:Date.now()}]};
const s=stream(runtimeModel,context,{
  apiKey:'fake-subscription-token',
  onPayload:async body=>event('before_provider_request',{payload:body}),
  fetch:async(_url,options)=>{
    sent=JSON.parse(options.body);
    const response={id:'mock_response',status:'completed',output:[],service_tier:'priority',usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0}}};
    return new Response('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response})+'\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}});
  },
});
const message=await s.result();
assert.notEqual(message.stopReason,'error',message.errorMessage);
assert.equal(sent.service_tier,'priority');
assert.equal(sent.model,'test-model');
console.log('PASS installed OpenAI transport serializes service_tier=priority (mocked HTTP only)');

await command('off',ctx);
assert.equal((await event('before_provider_request',{payload})).service_tier,'default');
await command('on',ctx);
ext=await load(); command=ext.commands.get('fast').handler;
await event('session_start');
assert.equal((await event('before_provider_request',{payload})).service_tier,'priority');
entries.push({type:'custom',customType:'chatgpt-fast-mode',data:{version:1,enabled:false}});
await event('session_tree');
assert.equal((await event('before_provider_request',{payload})).service_tier,'default');
entries.splice(0);
await event('session_start');
assert.equal(await event('before_provider_request',{payload}),undefined);
console.log('PASS off/default, reload/resume reconstruction, branch state, and new-session reset');

const before=entries.length;
oauth=false;
await command('on',ctx);
assert.equal(entries.length,before);
assert.equal(await event('before_provider_request',{payload}),undefined);
oauth=true;
const other={...ctx,model:{...runtimeModel,provider:'baseten'}};
await command('on',other);
assert.equal(entries.length,before);
assert.equal(await event('before_provider_request',{payload},other),undefined);
const proxy={...ctx,model:{...runtimeModel,baseUrl:'https://proxy.example/v1'}};
await command('on',proxy);
assert.equal(entries.length,before);
console.log('PASS API-key auth, proxies and other providers excluded without changing their state');

await command('on',ctx);
assert.equal(await event('before_provider_request',{payload:{...payload,model:'other-model'}}),undefined);
assert.equal(await event('before_provider_request',{payload:{model:'test-model',messages:[]}}),undefined);
assert.equal(await event('before_provider_request',{payload:null}),undefined);
assert.equal(await event('before_provider_request',{payload:[]}),undefined);
const legacy={...ctx,model:{...runtimeModel,provider:'openai-codex',api:'openai-codex-responses',baseUrl:'https://chatgpt.com/backend-api'}};
assert.equal((await event('before_provider_request',{payload},legacy)).service_tier,'priority');
const keyModel={...ctx,model:{...runtimeModel,provider:'openai',api:'openai-completions'}};
assert.equal(await event('before_provider_request',{payload},keyModel),undefined);
idle=false;
const unchanged=entries.length;
await command('off',ctx);
assert.equal(entries.length,unchanged);
idle=true;
await command('invalid',ctx);
assert.match(notifications.at(-1).text,/Usage/);
const noUi={...ctx,hasUI:false};
await event('session_start',{},noUi);
console.log('PASS selected-model/API matching, malformed payloads, legacy Codex route, busy guard and headless state');
console.log('All fast-mode tests passed. No live request or subscription quota used.');
