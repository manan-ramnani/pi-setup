import { spawn } from 'node:child_process';
import { mkdir, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolBinary, cleanEnvironment } from './runtime.mjs';

const [agentDir,session,kind,...args]=process.argv.slice(2);
if (!agentDir || !/^pi-[a-zA-Z0-9-]+$/.test(session ?? '') || !['browser','desktop'].includes(kind)) {
  console.error('Invalid computer-use launcher invocation.'); process.exit(2);
}
try {
  const env=cleanEnvironment(process.env,agentDir,session);
  if(kind==='browser' && env.AGENT_BROWSER_SOCKET_DIR) {
    try { await mkdir(env.AGENT_BROWSER_SOCKET_DIR,{mode:0o700}); } catch(error) { if(error.code!=='EEXIST')throw error; }
    const info=await lstat(env.AGENT_BROWSER_SOCKET_DIR);
    if(!info.isDirectory() || info.uid!==process.getuid() || (info.mode & 0o777)!==0o700)
      throw new Error('Browser socket directory must be a real, owner-only directory owned by this user.');
  }
  await mkdir(env.AGENT_DESKTOP_HOME,{recursive:true,mode:0o700});
  const binary=toolBinary(agentDir,kind==='browser'?'agent-browser':'agent-desktop');
  if(kind==='desktop' && process.platform==='darwin') {
    const helper=join(dirname(binary),'agent-desktop-macos-helper');
    if(!existsSync(helper))throw new Error('Managed desktop helper missing. Rerun scripts/setup-computer-use.mjs.');
    env.AGENT_DESKTOP_MACOS_HELPER_PATH=helper;
  }
  // Explicit config replaces user/project browser discovery. The managed native
  // binaries avoid npm shim/Node launcher latency and shell interpolation.
  const argv=kind==='browser'
    ? ['--config',join(dirname(fileURLToPath(import.meta.url)),'browser.json'),...args]
    : args;
  const child=spawn(binary,argv,{env,stdio:'inherit',windowsHide:true});
  let stopping;
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{
    child.kill(signal);
    stopping ??= setTimeout(()=>child.kill('SIGKILL'),1500);
  });
  child.on('error',error=>{ console.error(error.message);process.exitCode=1; });
  child.on('exit',(code,signal)=>{ clearTimeout(stopping);process.exitCode=code ?? (signal?1:0); });
} catch(error) { console.error(error.message);process.exitCode=1; }
