import { existsSync } from 'node:fs';
import { mkdir, cp, mkdtemp, rm, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { root, versions, readJson, agentDirectory, nodeSupported, run, capture, commandPath } from './lib.mjs';
import { installSkills } from './install-skills.mjs';

export function parseOptions(args) {
  const options={ dryRun:false, installPi:false, withSkills:false, withParallel:false };
  for(let i=0;i<args.length;i++) {
    const value=args[i];
    if(value==='--dry-run') options.dryRun=true;
    else if(value==='--install-pi') options.installPi=true;
    else if(value==='--with-skills') options.withSkills=true;
    else if(value==='--with-parallel') options.withParallel=true;
    else if(value==='--help' || value==='-h') options.help=true;
    else if(value==='--agent-dir') {
      if(!args[i+1] || args[i+1].startsWith('--')) throw new Error('--agent-dir needs a path.');
      options.agentDir=args[++i];
    } else throw new Error('Unknown option: '+value);
  }
  return options;
}
export function npmIdentity(source) {
  return source?.startsWith('npm:') ? source.slice(4).match(/^(@[^/]+\/[^@]+|[^@]+)/)?.[1] : undefined;
}
export function mergeSettings(existing, agent, skillPaths=[]) {
  const base=readJson(join(root,'config/settings.base.json'));
  const sourcePath=resolve(root);
  const managed=new Map();
  let custom;
  const packages=(existing.packages || []).filter(entry=>{
    const source=typeof entry==='string' ? entry : entry.source;
    const identity=npmIdentity(source);
    if(identity in versions.packages) { managed.set(identity,entry); return false; }
    if(source && !source.startsWith('npm:') && !source.startsWith('git:') && !/^https?:/.test(source)) {
      const path=source.startsWith('~/') ? join(homedir(),source.slice(2)) : resolve(agent,source);
      if(resolve(path)===sourcePath) { custom=entry; return false; }
    }
    return true;
  });
  for(const [name,version] of Object.entries(versions.packages)) {
    const source='npm:'+name+'@'+version;
    const previous=managed.get(name);
    packages.push(previous && typeof previous==='object' ? {...previous,source} : source);
  }
  packages.push(custom && typeof custom==='object' ? {...custom,source:sourcePath} : sourcePath);
  const settings={...base,...existing,packages};
  if(skillPaths.length) settings.skills=[...new Set([...(existing.skills || []),...skillPaths])];
  return settings;
}
export function preflight(agent, existing, options) {
  if(!nodeSupported()) throw new Error('Node '+versions.minimumNode+' or newer is required.');
  if(!commandPath('npm')) throw new Error('npm is required.');
  if(options.withSkills && !commandPath('git')) throw new Error('Git is required to install pinned skills.');
  if(options.withParallel && !commandPath('uv')) throw new Error('--with-parallel requires uv. Alternatively install Parallel separately.');
  for(const entry of existing.packages || []) {
    const source=typeof entry==='string' ? entry : entry.source;
    const identity=npmIdentity(source);
    if(identity && !(identity in versions.packages)) throw new Error('Unrelated npm package found: '+identity+'. Use a separate --agent-dir to avoid replacing its dependency tree.');
  }
  const manifest=join(agent,'npm/package.json');
  if(existsSync(join(agent,'npm')) && !existsSync(manifest)) throw new Error('Existing npm directory has no manifest; ownership is unknown. Use a separate --agent-dir.');
  if(existsSync(manifest)) {
    const data=readJson(manifest);
    for(const section of ['dependencies','devDependencies','optionalDependencies']) {
      for(const name of Object.keys(data[section] || {})) {
        if(!(name in versions.packages)) throw new Error('Unrelated installed dependency in '+section+': '+name+'. Use a separate --agent-dir.');
      }
    }
  }
  for(const name of ['chatgpt-fast','latency-throughput','parallel','computer-use']) {
    if(existsSync(join(agent,'extensions',name)) || ['.ts','.js'].some(suffix=>existsSync(join(agent,'extensions',name+suffix)))) {
      throw new Error('Existing auto-discovered custom extension '+name+'. Use a separate --agent-dir or back up/remove the old copy first to prevent duplicate registrations.');
    }
  }
  if(options.withSkills) {
    for(const item of readJson(join(root,'skills.lock.json')).skills) {
      for(const directory of [join(agent,'skills'),join(homedir(),'.agents/skills')]) {
        if(existsSync(join(directory,item.name,'SKILL.md'))) throw new Error('Existing skill '+item.name+' at '+directory+'. Omit --with-skills or resolve duplicates before installing.');
      }
    }
  }
}
export async function bootstrap(options) {
  const agent=agentDirectory(options.agentDir);
  const settingsPath=join(agent,'settings.json');
  const existing=existsSync(settingsPath) ? readJson(settingsPath) : {};
  preflight(agent,existing,options);
  console.log('Agent directory: '+agent);
  console.log('Pi '+versions.pi+'; '+Object.keys(versions.packages).length+' locked third-party packages; custom package: '+root);
  if(options.dryRun) {
    console.log('Dry run: no writes, installations, authentication, or network requests.');
    console.log('Plan: preserve existing preferences/resource filters; register the custom package and eight pinned packages.');
    console.log('Optional skills: '+options.withSkills+'; global Pi install: '+options.installPi+'; optional Parallel install: '+options.withParallel+'.');
    return;
  }
  const env={...process.env,PI_CODING_AGENT_DIR:agent,PI_TELEMETRY:'0',PI_SKIP_VERSION_CHECK:'1'};
  if(options.installPi) run('npm',['install','-g','--ignore-scripts','@earendil-works/pi-coding-agent@'+versions.pi],{env});
  const installed=capture('pi',['--version'],{env});
  if(installed!==versions.pi) throw new Error('Expected Pi '+versions.pi+', found '+installed+'. Rerun with --install-pi or select the correct executable.');
  await mkdir(agent,{recursive:true});
  const stage=await mkdtemp(join(agent,'.pi-setup-stage-'));
  const backup=join(agent,'.pi-setup-backups',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
  let npmInstalled=false;
  let swapped=false;
  try {
    await cp(join(root,'config/npm'),join(stage,'npm'),{recursive:true});
    run('npm',['ci','--ignore-scripts','--legacy-peer-deps'],{cwd:join(stage,'npm'),env});
    npmInstalled=true;
    let skillPaths=[];
    if(options.withSkills) skillPaths=await installSkills(join(agent,'.pi-setup-skills'));
    if(options.withParallel) run('uv',['tool','install','parallel-web-tools=='+versions.parallelCli],{env});
    await mkdir(backup,{recursive:true});
    if(existsSync(settingsPath)) await cp(settingsPath,join(backup,'settings.json'));
    if(existsSync(join(agent,'npm'))) await rename(join(agent,'npm'),join(backup,'npm'));
    try {
      await rename(join(stage,'npm'),join(agent,'npm'));
      swapped=true;
      await writeFile(join(stage,'settings.json'),JSON.stringify(mergeSettings(existing,agent,skillPaths),null,2)+'\n',{mode:0o600});
      await rename(join(stage,'settings.json'),settingsPath);
    } catch(error) {
      if(swapped) await rm(join(agent,'npm'),{recursive:true,force:true});
      if(existsSync(join(backup,'npm'))) await rename(join(backup,'npm'),join(agent,'npm'));
      if(existsSync(join(backup,'settings.json'))) await cp(join(backup,'settings.json'),settingsPath);
      throw error;
    }
    await mkdir(join(agent,'extensions'),{recursive:true});
    const recap=join(agent,'extensions/pi-recap.json');
    if(!existsSync(recap)) await cp(join(root,'config/extension-config/pi-recap.json'),recap);
    const mcp=join(agent,'mcp.json');
    if(!existsSync(mcp)) await cp(join(root,'config/mcp.portable.json'),mcp);
    console.log('Installed. Configuration/dependency backup: '+backup);
    console.log('Credentials were not read or copied. Start pi, run /login, then /model as needed.');
    console.log('Run: node scripts/doctor.mjs --agent-dir "'+agent+'"');
    if(options.withParallel) console.log('Run parallel-cli login separately; ensure its bin directory is on PATH or set PI_PARALLEL_CLI.');
  } finally {
    await rm(stage,{recursive:true,force:true});
    if(!npmInstalled) console.log('Dependency installation failed before replacing the existing npm directory.');
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options=parseOptions(process.argv.slice(2));
    if(options.help) console.log('Usage: node scripts/bootstrap.mjs [--dry-run] [--install-pi] [--with-skills] [--with-parallel] [--agent-dir PATH]\nThird-party skills are optional upstream downloads. Pi/Parallel installation flags explicitly install global tools. Existing credentials and MCP servers are left untouched.');
    else await bootstrap(options);
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
