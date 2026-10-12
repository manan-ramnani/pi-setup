import { cp, mkdtemp, mkdir, readFile, readdir, rm, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { root, readJson, run } from './lib.mjs';

const excluded = new Set(['.git', '__pycache__', 'node_modules']);
export async function snapshotHash(directory) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error('Unexpected symlink/special file in skill: ' + path);
    }
  }
  await visit(directory);
  files.sort((a,b) => relative(directory,a).replaceAll('\\','/') < relative(directory,b).replaceAll('\\','/') ? -1 : 1);
  const hash = createHash('sha256');
  for (const path of files) {
    hash.update(relative(directory,path).replaceAll('\\','/'));
    hash.update('\0'); hash.update(await readFile(path)); hash.update('\0');
  }
  return hash.digest('hex');
}
export async function applyCustomization(item, destination) {
  const skill = join(destination, 'SKILL.md');
  if (item.override) await cp(join(root,item.override), skill);
  if (item.customization) {
    let text = await readFile(skill,'utf8');
    text = text.replace(/^description:.*$/m, 'description: ' + JSON.stringify(item.customization.description));
    text = text.replace(/(## When to use\r?\n\r?\n)[^\r\n]+/, '$1' + item.customization.whenToUse);
    await writeFile(skill,text);
  }
}
export async function installSkills(destination, { sourceRoot } = {}) {
  const lock = readJson(join(root,'skills.lock.json'));
  const scratch = await mkdtemp(join(tmpdir(),'pi-setup-skills-'));
  const staged = join(scratch,'skills');
  await mkdir(staged);
  try {
    for (const item of lock.skills) {
      const checkout = join(scratch,item.name);
      const source = sourceRoot ? join(sourceRoot,item.name) : item.repository;
      run('git',['-c','core.autocrlf=false','clone','--quiet','--no-checkout',source,checkout]);
      run('git',['-C',checkout,'-c','core.autocrlf=false','checkout','--quiet',item.commit]);
      const target = join(staged,item.name);
      await cp(join(checkout,item.path),target,{
        recursive:true,
        filter: path => {
          const rel=relative(join(checkout,item.path),path).replaceAll('\\','/');
          return !(item.exclude || []).includes(rel) && !rel.split('/').some(part=>excluded.has(part));
        },
      });
      await applyCustomization(item,target);
      const hash = await snapshotHash(target);
      if (hash !== item.snapshotSha256) throw new Error('Skill snapshot mismatch: ' + item.name + '. No installed skills were replaced.');
      // Remove a Claude-specific path assumption after verifying the original snapshot.
      if (item.name === 'nanobanana-skill') {
        const path=join(target,'SKILL.md');
        let text=await readFile(path,'utf8');
        text=text.replaceAll('${CLAUDE_PLUGIN_ROOT}/skills/nanobanana-skill','<skill-directory>');
        const end=text.indexOf('\n---',4);
        const note='\n\nPortability: replace `<skill-directory>` below with the absolute directory containing this SKILL.md, and quote paths containing spaces. Use `python` on Windows if `python3` is unavailable. No Claude plugin environment variable is required.\n';
        if(end>=0) text=text.slice(0,end+4)+note+text.slice(end+4);
        await writeFile(path,text);
      }
    }
    await mkdir(destination,{recursive:true});
    // Prepare sibling copies before moving any live skill, then roll back failed swaps.
    const prepared=await mkdtemp(join(destination,'.pi-setup-stage-skills-'));
    const backup = join(destination,'.backups',Date.now().toString());
    const changed=[];
    try {
      for(const item of lock.skills) await cp(join(staged,item.name),join(prepared,item.name),{recursive:true});
      for(const item of lock.skills) {
        const target=join(destination,item.name);
        const saved=join(backup,item.name);
        const hadOriginal=existsSync(target);
        if(hadOriginal) { await mkdir(backup,{recursive:true}); await rename(target,saved); }
        changed.push({target,saved,hadOriginal});
        await rename(join(prepared,item.name),target);
      }
    } catch(error) {
      for(const entry of changed.reverse()) {
        await rm(entry.target,{recursive:true,force:true});
        if(entry.hadOriginal) await rename(entry.saved,entry.target);
      }
      throw error;
    } finally { await rm(prepared,{recursive:true,force:true}); }
    if(existsSync(backup)) console.log('Skill backup: '+backup);
    return lock.skills.map(item=>join(destination,item.name));
  } finally { await rm(scratch,{recursive:true,force:true}); }
}
