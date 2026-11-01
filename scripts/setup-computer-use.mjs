import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rename, rm, lstat, readdir, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, agentDirectory, readJson, run } from './lib.mjs';
import { prepareNativeTools, toolDirectory } from '../extensions/computer-use/runtime.mjs';

async function statIfPresent(path) {
  try { return await lstat(path); } catch(error) { if(error.code==='ENOENT')return;throw error; }
}
// Move only this installer's marked directories, never arbitrary legacy tools.
// Preflight every collision before moving; rename preserves dependencies/state.
export async function migrateLegacyComputerTools(agent,{dryRun=false}={}) {
  const legacy=join(agent,'tools'), parent=join(agent,'computer-use');
  const legacyInfo=await statIfPresent(legacy);
  if(!legacyInfo)return [];
  if(!legacyInfo.isDirectory())throw new Error('Refusing to migrate a symlink/non-directory tools path.');
  const parentInfo=await statIfPresent(parent);
  if(parentInfo && !parentInfo.isDirectory())throw new Error('Refusing to migrate into a symlink/non-directory computer-use path.');
  const managedName=readJson(join(root,'config/computer-use/package.json')).name;
  const moves=[];
  for(const name of (await readdir(legacy)).sort()) {
    if(name!=='vercel' && !/^vercel-backup-\d+$/.test(name))continue;
    const source=join(legacy,name), destination=join(parent,name);
    const info=await lstat(source), marker=join(source,'package.json');
    if(!info.isDirectory() || !(await statIfPresent(marker))?.isFile() || readJson(marker).name!==managedName)
      throw new Error('Refusing to move an unmanaged legacy Vercel directory: '+source);
    if(await statIfPresent(destination))throw new Error('Migration destination already exists; neither copy was changed: '+destination);
    moves.push({source,destination});
  }
  if(dryRun)return moves;
  const moved=[];
  try {
    if(moves.length)await mkdir(parent,{recursive:true,mode:0o700});
    for(const move of moves){await rename(move.source,move.destination);moved.push(move);}
  } catch(error) {
    for(const move of moved.reverse()) {
      try { await rename(move.destination,move.source); }
      catch { console.error('Migration rollback incomplete; preserved directory: '+move.destination); }
    }
    throw error;
  }
  // Empty directory only. Unrelated tools and Pi's fd/rg are never removed.
  try { await rmdir(legacy); } catch(error) { if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(error.code))throw error; }
  return moves;
}

export function parseComputerOptions(args) {
  const options = { dryRun: false, installBrowser: false, migrateOnly: false };
  for (let i=0; i<args.length; i++) {
    if (args[i] === '--dry-run') options.dryRun=true;
    else if (args[i] === '--install-browser') options.installBrowser=true;
    else if (args[i] === '--migrate-only') options.migrateOnly=true;
    else if (args[i] === '--agent-dir' && args[i+1] && !args[i+1].startsWith('--')) options.agentDir=args[++i];
    else throw new Error('Usage: node scripts/setup-computer-use.mjs [--dry-run] [--install-browser | --migrate-only] [--agent-dir PATH]');
  }
  if(options.migrateOnly && options.installBrowser)throw new Error('--migrate-only cannot install a browser.');
  return options;
}
export async function setupComputerUse(options) {
  if (!options.dryRun && !options.migrateOnly && Number(process.versions.node.split('.')[0]) < 24) throw new Error('Optional Agent Browser requires Node 24 or newer.');
  const agent=agentDirectory(options.agentDir);
  const parent=join(agent,'computer-use');
  const destination=toolDirectory(agent);
  const source=join(root,'config/computer-use');
  const manifest=readJson(join(source,'package.json'));
  if (existsSync(destination)) {
    const existing=join(destination,'package.json');
    if (!existsSync(existing) || readJson(existing).name !== manifest.name)
      throw new Error('Refusing to replace an unmanaged computer-use/vercel directory.');
  }
  console.log('Optional tools: '+JSON.stringify(manifest.dependencies));
  console.log('Destination: '+destination);
  const migrated=await migrateLegacyComputerTools(agent,{dryRun:options.dryRun});
  for(const move of migrated)console.log((options.dryRun?'Would move: ':'Moved: ')+move.source+' -> '+move.destination);
  if(options.migrateOnly) { console.log(options.dryRun?'Dry run: no paths changed.':'Migration checked; no downloads, browser launches or permission requests. Reload Pi after updating the extension.');return; }
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
