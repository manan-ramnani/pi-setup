import { existsSync, readFileSync } from 'node:fs';
import { chmod, copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

// Stable across reloads only. New/resumed/forked tasks close the owned browser
// and rotate this record; process IDs cannot attach to an old, reused PID.
const sessionKey=Symbol.for('pi-setup.computer-use.browser-session');
function newSession() { return 'pi-'+randomUUID().replaceAll('-','').slice(0,24); }
function browserRecord() { return globalThis[sessionKey] ??= {session:newSession(),used:false}; }
export function browserSession() { return browserRecord().session; }
export function markBrowserUsed(session) { if(browserRecord().session===session)browserRecord().used=true; }
export function browserWasUsed(session) { return browserRecord().session===session && browserRecord().used; }
export function rotateBrowserSession(session) {
  if(browserRecord().session===session)globalThis[sessionKey]={session:newSession(),used:false};
}

// Lifecycle scripts are disabled. Prepare only the downloaded package's own
// native executables/helpers, preserving the same-release side-by-side contract.
export async function prepareNativeTools(toolsDir,platform=process.platform,arch=process.arch) {
  for(const name of Object.keys(TOOL_VERSIONS)) {
    const bin=join(toolsDir,'node_modules',name,'bin');
    if(platform!=='win32') {
      const os=name==='agent-browser' && platform==='linux' && (existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1'))?'linux-musl':platform;
      await chmod(join(bin,`${name}-${os}-${arch}`),0o755);
    }
    if(name==='agent-desktop' && ['darwin','linux'].includes(platform)) {
      const helper=platform==='darwin'?'agent-desktop-macos-helper':'agent-desktop-linux-clipboard-owner';
      const source=join(bin,`${helper}-${platform}-${arch}`);
      const expected=(await readFile(source+'.sha256','utf8')).trim();
      const actual=createHash('sha256').update(await readFile(source)).digest('hex');
      if(!/^[a-f0-9]{64}$/i.test(expected) || actual!==expected.toLowerCase())throw new Error('Bundled desktop helper checksum mismatch.');
      await copyFile(source,join(bin,helper));
      await chmod(join(bin,helper),0o755);
      await chmod(bin,0o755);
    }
  }
}

export const TOOL_VERSIONS = { 'agent-browser': '0.41.1', 'agent-desktop': '1.0.2' };
export function toolBinary(agentDir, name, platform=process.platform, arch=process.arch) {
  if (!(name in TOOL_VERSIONS)) throw new Error('Unknown managed tool.');
  const root=join(agentDir,'tools','vercel','node_modules',name);
  const manifest=join(root,'package.json');
  if (!existsSync(manifest) || JSON.parse(readFileSync(manifest,'utf8')).version!==TOOL_VERSIONS[name])
    throw new Error('Install the pinned computer-use tools: node scripts/setup-computer-use.mjs --install-browser');
  let os=platform, cpu=arch;
  if (name==='agent-browser' && platform==='linux' &&
      (existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1'))) os='linux-musl';
  if (name==='agent-browser' && platform==='win32' && arch==='arm64' && !existsSync(join(root,'bin','agent-browser-win32-arm64.exe'))) cpu='x64';
  const binary=join(root,'bin',`${name}-${os}-${cpu}${platform==='win32'?'.exe':''}`);
  if (!existsSync(binary)) throw new Error('Managed native binary unavailable for '+platform+'-'+arch+'.');
  return binary;
}
// Preserve only OS/session plumbing. Never pass model/broker credentials,
// inherited browser profiles/CDP endpoints/plugins, or desktop session overrides.
export function cleanEnvironment(source, agentDir, session) {
  const env={};
  for (const [key,value] of Object.entries(source)) {
    if (/^(PATH|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|XDG_[A-Z_]+|DISPLAY|WAYLAND_DISPLAY|DBUS_SESSION_BUS_ADDRESS|XAUTHORITY|__CF_USER_TEXT_ENCODING)$/i.test(key)) env[key]=value;
  }
  env.AGENT_BROWSER_SESSION=session;
  env.AGENT_BROWSER_NAMESPACE='pi-setup';
  // macOS Unix sockets have a 103-byte path limit; a long HOME/TMPDIR must
  // not make the isolated browser unusable. Launcher verifies ownership/mode.
  if(process.platform!=='win32')env.AGENT_BROWSER_SOCKET_DIR=join('/tmp','pi-setup-browser-'+process.getuid());
  env.AGENT_DESKTOP_HOME=join(agentDir,'computer-use','desktop');
  return env;
}
