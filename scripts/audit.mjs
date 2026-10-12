import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, capture, run } from './lib.mjs';

const tracked=new Set(capture('git',['ls-files','--cached','-z'],{cwd:root}).split('\0').filter(Boolean));
const files=capture('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).split('\0').filter(Boolean);
const forbidden=/^(?:\.local|node_modules|\.pi)\/|(?:^|\/)(?:auth\.json|mcp-auth\.json|models-store\.json|\.env(?:\..*)?|__pycache__|sessions|\.pi-setup-backups|\.pi-setup-skills|\.pi-setup-stage-[^/]*)(?:\/|$)/;
const patterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\/Users\/[A-Za-z0-9_.-]+\//,
  /\/opt\/homebrew\//,
];
let failures=0;
function inspect(content,label) {
  if(content.includes(0)) { console.error('Binary content: '+label);failures++;return; }
  const text=content.toString('utf8');
  for(const [index,pattern] of patterns.entries()) {
    if(pattern.test(text)) { console.error('Sensitive/path pattern '+index+' in '+label+' (value suppressed)');failures++; }
  }
}
for(const file of [...new Set(files)]) {
  if(forbidden.test(file)) { console.error('Forbidden publication path: '+file);failures++;continue; }
  const path=join(root,file);
  if(!existsSync(path) || !lstatSync(path).isFile()) { console.error('Missing/non-regular working-tree file: '+file);failures++;continue; }
  inspect(readFileSync(path),'working tree: '+file);
  if(tracked.has(file)) {
    const blob=run('git',['show',':'+file],{cwd:root,stdio:'pipe',encoding:null}).stdout;
    inspect(blob,'staged blob: '+file);
  }
}
console.log('Audited '+new Set(files).size+' publishable paths (working tree and staged blobs). '+failures+' finding(s). This is a heuristic scan, not proof of absence of every possible secret; historical commits are not scanned.');
process.exitCode=failures?1:0;
