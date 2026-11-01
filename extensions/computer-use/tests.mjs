import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { piImport } from '../../scripts/lib.mjs';
import { MODES, PREFIX, browserRisk, desktopRisk, decision, guidance, screenshotArgs, safeBrowserURL } from './policy.mjs';
import { TOOL_VERSIONS, cleanEnvironment, toolBinary, prepareNativeTools, toolDirectory, browserSession, browserWasUsed } from './runtime.mjs';
import { createHash } from 'node:crypto';
import { parseComputerOptions, setupComputerUse, migrateLegacyComputerTools } from '../../scripts/setup-computer-use.mjs';
const { loadExtensions }=await piImport('dist/core/extensions/loader.js');

for(const mode of MODES) assert.equal(decision(mode,{level:'read'}),'allow');
assert.equal(decision('read',{level:'browse'}),'block');
assert.equal(decision('browse',{level:'browse'}),'allow');
assert.equal(decision('browse',{level:'edit'}),'block');
assert.equal(decision('edit',{level:'edit'}),'allow');
assert.equal(decision('edit',{level:'critical'}),'confirm');
assert.equal(decision('full',{level:'critical'}),'allow');
assert.equal(decision('invalid',{level:'read'}),'block');
assert.match(guidance('full'),/save.*without extra tool-level approval/);
assert.match(guidance('full'),/no autonomous real-money orders/);
for(const command of ['click','type','set-value']) assert.equal(desktopRisk([command,'@s123:e1','hello']).level,'edit');
for(const args of [['launch','TextEdit'],['clipboard-get'],['press','return'],['press','ctrl+v'],['permissions','--guide'],['snapshot','--trace','out.jsonl'],['click','@s123:e1','--headed'],['batch','[]']]) assert.equal(desktopRisk(args).level,'critical');
assert.equal(desktopRisk(['type','@s123:e1','--','--help']).level,'edit','Text cannot masquerade as a help flag');
assert.equal(desktopRisk(['click','--help']).level,'read');
assert.equal(desktopRisk(['permissions']).level,'read');
assert.throws(()=>desktopRisk(['--headed','click']),/first argument/);
assert.throws(()=>desktopRisk(['unknown']),/Unsupported/);
assert.throws(()=>desktopRisk(['type','\0']),/NUL/);
assert.equal(browserRisk(PREFIX+'agent_browser_eval',{}).level,'critical');
assert.equal(browserRisk(PREFIX+'agent_browser_click',{}).level,'edit');
assert.equal(browserRisk(PREFIX+'agent_browser_open',{}).level,'browse');
assert.equal(browserRisk(PREFIX+'agent_browser_screenshot',{}).level,'read');
assert.equal(browserRisk(PREFIX+'agent_browser_screenshot',{path:'file.png'}).level,'critical');
assert.equal(safeBrowserURL('javascript:alert(1)'),false);
assert.equal(safeBrowserURL('file:///private/file'),false);
assert.equal(safeBrowserURL('https://user:pass@example.com'),false);
assert(safeBrowserURL('https://example.com'));
assert(safeBrowserURL('about:blank'));
assert.deepEqual(screenshotArgs(['screenshot','--app','TextEdit'],'out.png'),['screenshot','--app','TextEdit','out.png']);
assert.throws(()=>screenshotArgs(['screenshot','arbitrary.png'],'out.png'),/managed/);
assert.throws(()=>screenshotArgs(['screenshot','--out','arbitrary.png'],'out.png'),/managed/);
const env=cleanEnvironment({PATH:'path',HOME:'home',OPENAI_API_KEY:'fake',DHAN_ACCESS_TOKEN:'fake',AGENT_BROWSER_CDP:'9222',AGENT_BROWSER_PROFILE:'personal',AGENT_BROWSER_PLUGINS:'bad',AGENT_DESKTOP_SESSION:'other'},'agent','pi-test');
assert.equal(env.PATH,'path');
for(const key of ['OPENAI_API_KEY','DHAN_ACCESS_TOKEN','AGENT_BROWSER_CDP','AGENT_BROWSER_PROFILE','AGENT_BROWSER_PLUGINS','AGENT_DESKTOP_SESSION']) assert(!(key in env));
assert.equal(env.AGENT_BROWSER_SESSION,'pi-test');
assert.equal(env.AGENT_BROWSER_NAMESPACE,'pi-setup');
assert.equal(env.AGENT_DESKTOP_HOME,join('agent','computer-use','desktop'));
console.log('PASS four-level policy matrix, conservative risk classification, no help/trace bypass, managed screenshot paths and credential-free environment');

const temp=await mkdtemp(join(tmpdir(),'pi-computer-tests-'));
const previous=process.env.PI_CODING_AGENT_DIR;
const screenshots=[];
try {
  const agent=join(temp,'agent'), extensionPath=join(temp,'computer-use');
  await mkdir(agent);
  const legacyAgent=join(temp,'legacy-agent'), oldTools=join(legacyAgent,'tools');
  const oldInstall=join(oldTools,'vercel'), oldBackup=join(oldTools,'vercel-backup-123');
  for(const dir of [oldInstall,oldBackup]) {
    await mkdir(join(dir,'node_modules'),{recursive:true});
    await writeFile(join(dir,'package.json'),JSON.stringify({name:'pi-setup-computer-use-tools'}));
    await writeFile(join(dir,'node_modules','preserved.txt'),'installed data');
  }
  process.env.PI_CODING_AGENT_DIR=legacyAgent;
  const {getAgentDir}=await piImport('dist/config.js');
  assert.equal(getAgentDir(),legacyAgent,'Never run migration detection against the real profile');
  const {runMigrations}=await piImport('dist/migrations.js');
  assert(runMigrations(temp).deprecationWarnings.some(x=>x.includes('Global tools/')));
  assert.equal((await migrateLegacyComputerTools(legacyAgent,{dryRun:true})).length,2);
  assert.equal(await readFile(join(oldInstall,'node_modules','preserved.txt'),'utf8'),'installed data');
  assert.equal((await migrateLegacyComputerTools(legacyAgent)).length,2);
  assert.equal(await readFile(join(toolDirectory(legacyAgent),'node_modules','preserved.txt'),'utf8'),'installed data');
  assert.equal(await readFile(join(legacyAgent,'computer-use','vercel-backup-123','node_modules','preserved.txt'),'utf8'),'installed data');
  assert(!runMigrations(temp).deprecationWarnings.some(x=>x.includes('Global tools/')),'Actual Pi startup no longer sees deprecated tools');
  assert.deepEqual(await migrateLegacyComputerTools(legacyAgent),[],'Migration is idempotent');
  await mkdir(oldInstall,{recursive:true});
  await writeFile(join(oldInstall,'package.json'),JSON.stringify({name:'unrelated'}));
  await assert.rejects(migrateLegacyComputerTools(legacyAgent),/unmanaged/);
  await writeFile(join(oldInstall,'package.json'),JSON.stringify({name:'pi-setup-computer-use-tools'}));
  await assert.rejects(migrateLegacyComputerTools(legacyAgent),/already exists/);
  await rm(oldInstall,{recursive:true});
  await writeFile(join(oldTools,'unrelated-tool.ts'),'preserve unrelated code');
  await migrateLegacyComputerTools(legacyAgent);
  assert.equal(await readFile(join(oldTools,'unrelated-tool.ts'),'utf8'),'preserve unrelated code');
  assert(runMigrations(temp).deprecationWarnings.some(x=>x.includes('Global tools/')),'Do not suppress legitimate unrelated-tool warnings');
  console.log('PASS real Pi migration warning detection, lossless managed-directory migration, dry-run, backups, collision refusal and unrelated-tool preservation');
  process.env.PI_CODING_AGENT_DIR=agent;
  await cp(dirname(fileURLToPath(import.meta.url)),extensionPath,{recursive:true});
  // Replace only the disposable fixture launcher. Never execute real GUI tools.
  await writeFile(join(extensionPath,'launch.mjs'),`
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const args=process.argv.slice(2),command=args[3];
writeFileSync(join(args[0],'argv.json'),JSON.stringify(args));
if(args.includes('--hang'))setTimeout(()=>{},5000);
else if(args.includes('--fail')){console.log(JSON.stringify({ok:false,error:{code:'TEST_ERROR',disposition:{delivery:'not_delivered',retry:'safe'}}}));process.exitCode=2;}
else{
 if(command==='screenshot')writeFileSync(args.at(-1),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'));
 console.log(JSON.stringify({ok:true,data:{args,content:args.includes('--large')?'x'.repeat(40000):'mock'}}));
}
`);
  for(const [name,version] of Object.entries(TOOL_VERSIONS)) {
    const packageDir=join(toolDirectory(agent),'node_modules',name);
    await mkdir(join(packageDir,'bin'),{recursive:true});
    await writeFile(join(packageDir,'package.json'),JSON.stringify({name,version}));
    const filename=`${name}-${process.platform}-${process.arch}${process.platform==='win32'?'.exe':''}`;
    await writeFile(join(packageDir,'bin',filename),'not executed');
    assert.equal(toolBinary(agent,name),join(packageDir,'bin',filename));
    if(name==='agent-desktop' && ['darwin','linux'].includes(process.platform)) {
      const helper=process.platform==='darwin'?'agent-desktop-macos-helper':'agent-desktop-linux-clipboard-owner';
      const file=join(packageDir,'bin',`${helper}-${process.platform}-${process.arch}`);
      await writeFile(file,'fake helper');
      await writeFile(file+'.sha256',createHash('sha256').update('fake helper').digest('hex'));
    }
  }
  await prepareNativeTools(toolDirectory(agent));
  assert.throws(()=>toolBinary(agent,'unknown'),/Unknown/);
  const entries=[],notices=[],statuses=new Map();
  let idle=true,confirm=false,confirmations=0;
  const ctx={hasUI:true,mode:'tui',cwd:temp,isIdle:()=>idle,
    sessionManager:{getBranch:()=>entries},
    ui:{notify:(text,level)=>notices.push({text,level}),setStatus:(key,value)=>statuses.set(key,value),confirm:async()=>{confirmations++;return confirm;}},
  };
  let loaded,extension,command;
  async function load(){
    loaded=await loadExtensions([join(extensionPath,'index.ts')],temp);
    assert.deepEqual(loaded.errors,[]);
    loaded.runtime.appendEntry=(customType,data)=>entries.push({type:'custom',customType,data:{...data}});
    extension=loaded.extensions[0];command=extension.commands.get('computer-use').handler;
  }
  async function emit(type,data={},context=ctx){let result;for(const handler of extension.handlers.get(type)||[]){const value=await handler({type,...data},context);if(value!==undefined)result=value;}return result;}
  const call=(name,params={},context=ctx,signal)=>extension.tools.get(name).definition.execute('test',params,signal,undefined,context);
  const browser=(short,input={})=>emit('tool_call',{toolName:PREFIX+'agent_browser_'+short,input});
  await load();
  const browserSupported=Number(process.versions.node.split('.')[0])>=24;
  assert.equal(loaded.runtime.mcpServers.list().length,browserSupported?1:0,'Optional browser registration requires Node 24; base Pi/tests support Node 22');
  if(browserSupported)assert.equal(loaded.runtime.mcpServers.list()[0].config.exposure,'codemode');
  await emit('session_start');
  assert.equal((await call('computer_use_status')).details.mode,'edit');
  assert.match((await emit('before_agent_start')).message.content,/EDIT/);
  await call('agent_desktop',{args:['click','@s123:e1']});
  assert.equal(confirmations,0,'Basic edits run without approval prompts');
  await assert.rejects(call('agent_desktop',{args:['clipboard-get']}),/not approved/);
  confirm=true;
  await call('agent_desktop',{args:['clipboard-get']});
  assert.equal(confirmations,2);
  confirm=false;
  await assert.rejects(call('agent_desktop',{args:['press','ctrl+v']}),/not approved/);
  assert.equal((await browser('eval',{script:'1+1'})).block,true);
  await command('read',ctx);
  assert.equal((await browser('open',{url:'https://example.com'})).block,true);
  assert.equal((await browser('click',{selector:'@e1'})).block,true);
  assert.equal(await browser('snapshot',{}),undefined);
  await assert.rejects(call('agent_desktop',{args:['type','@s123:e1','--','--help']}),/Blocked/);
  await assert.rejects(call('agent_desktop',{args:['snapshot','--trace','private.txt']}),/Blocked/);
  await call('agent_desktop',{args:['status']});
  await command('browse',ctx);
  assert.equal(await browser('open',{url:'https://example.com'}),undefined);
  assert.equal((await browser('fill',{selector:'@e1',text:'hello'})).block,true);
  await assert.rejects(call('agent_desktop',{args:['click','@s123:e1']}),/Blocked/);
  await command('full',ctx);
  const before=confirmations;
  const noUi={...ctx,hasUI:false,ui:{...ctx.ui,confirm:()=>{throw Error('Full must not prompt');}}};
  await call('agent_desktop',{args:['launch','Example','--headed']},noUi);
  assert.equal(await emit('tool_call',{toolName:PREFIX+'agent_browser_eval',input:{script:'1+1'}},noUi),undefined);
  assert.equal(confirmations,before);
  assert.match((await emit('before_agent_start')).message.content,/FULL.*without extra tool-level approval/);
  assert.equal((await browser('close',{all:true})).block,true,'Even Full cannot close unrelated sessions');
  for(const input of [{session:'personal'},{extraArgs:['--profile','personal']},{restore:true},{restoreCheckFn:'sideEffect()'},{namespace:'other'},{caCert:'file'}]) assert.equal((await browser('snapshot',input)).block,true,'Host/session overrides stay excluded in every mode');
  assert.equal((await browser('open',{url:'javascript:sideEffect()'})).block,true);
  const isolated={};await browser('snapshot',isolated);assert.match(isolated.session,/^pi-/);
  assert.equal(await emit('tool_call',{toolName:'mcp__codex_chrome__js',input:{}}),undefined,'Existing bridges are unchanged');
  idle=false;await command('read',ctx);assert.equal((await call('computer_use_status')).details.mode,'full');idle=true;
  const ownedSession=(await call('computer_use_status')).details.browser_session;
  await emit('session_shutdown',{reason:'reload'});
  assert.equal(browserSession(),ownedSession,'Reload preserves only this task browser');
  assert(browserWasUsed(ownedSession));
  await load();await emit('session_start');
  assert.equal((await call('computer_use_status')).details.mode,'full','Reload restores the branch policy');
  entries.splice(-1);await emit('session_tree');
  assert.equal((await call('computer_use_status')).details.mode,'browse','Tree follows the active branch');
  entries.splice(0);await emit('session_start');
  assert.equal((await call('computer_use_status')).details.mode,'edit','New session never inherits Full implicitly');
  await assert.rejects(call('agent_desktop',{args:['clipboard-get']},noUi),/not approved/);
  console.log('PASS actual Pi loader/MCP registration, branch-persisted user-only modes, model guidance, normal edits, critical confirmation, headless fail-closed and Full zero-prompt behaviour');

  const shot=await call('agent_desktop',{args:['screenshot','--app','Test app']});
  screenshots.push(dirname(shot.details.screenshot_path));
  assert(shot.content.some(x=>x.type==='image' && x.mimeType==='image/png'));
  assert(!JSON.parse(shot.content[0].text).data.args.includes('--out'),'Installed screenshot syntax is positional');
  assert.equal(JSON.parse(shot.content[0].text).data.args.at(-1),shot.details.screenshot_path);
  await assert.rejects(call('agent_desktop',{args:['screenshot','overwrite.png']}),/managed/);
  const failed=await call('agent_desktop',{args:['status','--fail']});assert(failed.isError);
  const large=await call('agent_desktop',{args:['status','--large']});
  screenshots.push(dirname(large.details.artifact_path));
  assert(large.details.truncated);assert((await readFile(large.details.artifact_path,'utf8')).length>40000);
  await assert.rejects(call('agent_desktop',{args:['status','--hang'],timeout_ms:1000}),/Delivery may be uncertain/);
  await call('computer_use_docs',{tool:'desktop',topics:['platform']});
  await emit('session_shutdown',{reason:'new'});assert.equal(statuses.get('computer-use'),undefined);
  assert.deepEqual(JSON.parse(await readFile(join(agent,'argv.json'),'utf8')),[agent,ownedSession,'browser','close'],'Lifecycle closes only the owned browser, never all sessions');
  assert.notEqual(browserSession(),ownedSession,'New/resumed/forked task gets a fresh browser after owned cleanup');
  assert(!browserWasUsed(ownedSession));
  assert.equal(parseComputerOptions(['--dry-run']).dryRun,true);
  assert.equal(parseComputerOptions(['--migrate-only']).migrateOnly,true);
  assert.throws(()=>parseComputerOptions(['--migrate-only','--install-browser']),/cannot install/);
  assert.throws(()=>parseComputerOptions(['--unknown']),/Usage/);
  const oldLog=console.log;console.log=()=>{};
  try{await setupComputerUse({dryRun:true,agentDir:join(temp,'dry')});}finally{console.log=oldLog;}
  assert.throws(()=>toolBinary(join(temp,'dry'),'agent-browser'),/Install/);
  console.log('PASS actual argv execution with a disposable fake launcher, PNG forwarding, CLI errors/timeout, private truncation artifacts and non-writing installer dry run');
}finally{
  if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;
  for(const directory of screenshots)await rm(directory,{recursive:true,force:true});
  await rm(temp,{recursive:true,force:true});
}
console.log('All computer-use tests passed. No real app/browser action, credentials, network or OS permission change.');
