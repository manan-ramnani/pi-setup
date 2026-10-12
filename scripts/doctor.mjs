import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { agentDirectory, versions, readJson, capture, commandPath, nodeSupported, root } from './lib.mjs';

const args=process.argv.slice(2);
let agent;
if(args.length===0) agent=agentDirectory();
else if(args.length===2 && args[0]==='--agent-dir') agent=agentDirectory(args[1]);
else throw new Error('Usage: node scripts/doctor.mjs [--agent-dir PATH]');
let failures=0;
function check(ok,message,required=true) {
  console.log((ok?'OK   ':required?'FAIL ':'WARN ')+message);
  if(!ok && required) failures++;
}
check(nodeSupported(),'Node '+process.versions.node+' (minimum '+versions.minimumNode+')');
try { check(capture('pi',['--version'])===versions.pi,'Pi '+versions.pi); } catch(error) { check(false,error.message); }
const settingsPath=join(agent,'settings.json');
check(existsSync(settingsPath),'Settings: '+settingsPath);
const settings=existsSync(settingsPath)?readJson(settingsPath):{};
for(const [name,version] of Object.entries(versions.packages)) {
  const manifest=join(agent,'npm/node_modules',name,'package.json');
  check(existsSync(manifest) && readJson(manifest).version===version,name+'@'+version);
  check((settings.packages || []).some(entry=>(typeof entry==='string'?entry:entry.source)==='npm:'+name+'@'+version),'Pinned declaration: '+name);
}
check((settings.packages || []).some(entry=>(typeof entry==='string'?entry:entry.source)===root),'Custom package registration');
for(const name of ['chatgpt-fast','latency-throughput','parallel']) {
  check(!existsSync(join(agent,'extensions',name)) && !['.ts','.js'].some(suffix=>existsSync(join(agent,'extensions',name+suffix))),'No duplicate auto-discovered '+name);
}
for(const item of readJson(join(root,'skills.lock.json')).skills) {
  const path=join(agent,'.pi-setup-skills',item.name,'SKILL.md');
  check(existsSync(path),'Optional downloaded skill: '+item.name,false);
}
for(const command of ['pandoc','xelatex','uv','git']) check(!!commandPath(command),'Optional executable: '+command,false);
const parallel=process.env.PI_PARALLEL_CLI || commandPath(process.platform==='win32'?'parallel-cli.exe':'parallel-cli') || join(process.env.HOME || process.env.USERPROFILE || '', '.local/bin',process.platform==='win32'?'parallel-cli.exe':'parallel-cli');
check(existsSync(parallel),'Parallel executable (set PI_PARALLEL_CLI if needed)',false);
console.log('\nNo credentials read, OAuth refreshes, MCP connections, provider calls, or paid jobs. Run /login, /model, /parallel status, /fast status and /latency status interactively.');
process.exitCode=failures?1:0;
