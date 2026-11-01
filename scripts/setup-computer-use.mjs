import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, agentDirectory, readJson, run } from './lib.mjs';
import { prepareNativeTools } from '../extensions/computer-use/runtime.mjs';

export function parseComputerOptions(args) {
  const options = { dryRun: false, installBrowser: false };
  for (let i=0; i<args.length; i++) {
    if (args[i] === '--dry-run') options.dryRun=true;
    else if (args[i] === '--install-browser') options.installBrowser=true;
    else if (args[i] === '--agent-dir' && args[i+1] && !args[i+1].startsWith('--')) options.agentDir=args[++i];
    else throw new Error('Usage: node scripts/setup-computer-use.mjs [--dry-run] [--install-browser] [--agent-dir PATH]');
  }
  return options;
}
export async function setupComputerUse(options) {
  if (!options.dryRun && Number(process.versions.node.split('.')[0]) < 24) throw new Error('Optional Agent Browser requires Node 24 or newer.');
  const agent=agentDirectory(options.agentDir);
  const parent=join(agent,'tools');
  const destination=join(parent,'vercel');
  const source=join(root,'config/computer-use');
  const manifest=readJson(join(source,'package.json'));
  if (existsSync(destination)) {
    const existing=join(destination,'package.json');
    if (!existsSync(existing) || readJson(existing).name !== manifest.name)
      throw new Error('Refusing to replace an unmanaged tools/vercel directory.');
  }
  console.log('Optional tools: '+JSON.stringify(manifest.dependencies));
  console.log('Destination: '+destination);
  if (options.dryRun) { console.log('Dry run: no writes, installs, browser launches or permission requests.'); return; }
  await mkdir(parent,{recursive:true,mode:0o700});
  const stage=await mkdtemp(join(parent,'.vercel-stage-'));
  let backup;
  try {
    for (const file of ['package.json','package-lock.json']) await cp(join(source,file),join(stage,file));
    run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage});
    await prepareNativeTools(stage);
    if (existsSync(destination)) {
      backup=join(parent,'vercel-backup-'+Date.now());
      await rename(destination,backup);
    }
    try { await rename(stage,destination); }
    catch (error) { if (backup) await rename(backup,destination); throw error; }
    if (backup) console.log('Previous managed tools preserved: '+backup);
    if (options.installBrowser) {
      // Chrome for Testing download only. No --with-deps/sudo or OS permission changes.
      run(process.execPath,[join(destination,'node_modules/agent-browser/bin/agent-browser.js'),'install'],{cwd:destination});
    }
    console.log('Installed pinned CLIs with lifecycle scripts disabled; global commands and Pi dependencies unchanged.');
    console.log('No desktop permissions granted, apps inspected, personal browser profiles attached or credentials read.');
    console.log('Load the computer-use extension, /reload, then /computer-use status.');
  } finally { await rm(stage,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { await setupComputerUse(parseComputerOptions(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
