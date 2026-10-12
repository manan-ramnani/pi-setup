#!/usr/bin/env node
// No network and no credential access: loads the real pi extension loader and
// runs tool handlers against a fake CLI. Optional --live runs two small public
// web requests plus a no-API research preview using the real logged-in CLI.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { piImport } from '../../scripts/lib.mjs';
const { loadExtensions } = await piImport('dist/core/extensions/loader.js');
const { extensions, errors } = await loadExtensions([join(dirname(fileURLToPath(import.meta.url)), 'index.ts')], process.cwd());
assert.deepEqual(errors, []);
const extension = extensions[0];
assert.equal(extension.tools.size, 6);
assert(extension.commands.has('parallel'));
assert.equal(extension.handlers.size, 0, 'No startup network/process side effects');
console.log('PASS pi loads 6 native tools and /parallel with no extension errors');

const tools = new Map([...extension.tools].map(([name, registered]) => [name, registered.definition]));
const context = {
  cwd: process.cwd(), hasUI: false,
  sessionManager: { getSessionId: () => 'pi-test-session' }, model: { id: 'test-model' },
  ui: { confirm: async () => false, notify: () => {} },
};
const call = (name, params, ctx = context, signal) => tools.get(name).execute('test-call', params, signal, undefined, ctx);
const temp = await mkdtemp(join(tmpdir(), 'pi-parallel-unit-'));
const cli = join(temp, 'fake-cli.mjs');
const log = join(temp, 'args.jsonl');
const original = process.env.PI_PARALLEL_CLI;
const originalArgs = process.env.PI_PARALLEL_CLI_ARGS;
const artifacts = new Set();
async function check(name, params, ctx = context, signal) {
  const r = await call(name, params, ctx, signal);
  if (r.structuredContent?.artifact_path) artifacts.add(dirname(r.structuredContent.artifact_path));
  return r;
}
async function argsLog() {
  try { return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
try {
  await writeFile(cli, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n');
if(process.env.PARALLEL_TEST_MODE==='fail'){console.error('not authenticated');process.exit(7);}
if(process.env.PARALLEL_TEST_MODE==='invalid'){console.log('not json');process.exit(0);}
if(process.env.PARALLEL_TEST_MODE==='sleep'){setTimeout(()=>console.log('{}'),10000);}
else console.log(JSON.stringify({args:process.argv.slice(2),data:process.env.PARALLEL_TEST_MODE==='large'?'x'.repeat(60000):'ok'}));
`, { mode: 0o700 });
  process.env.PI_PARALLEL_CLI = process.execPath;
  process.env.PI_PARALLEL_CLI_ARGS = JSON.stringify([cli]);
  const search = await check('parallel_search', { objective: '--version; echo injected', queries: ['official docs'], include_domains: ['parallel.ai'] });
  const args = search.structuredContent.result.args;
  assert.equal(args.at(-1), '--version; echo injected');
  assert.equal(args.at(-2), '--');
  assert.equal(args[args.indexOf('--session-id') + 1], 'pi-test-session');
  assert.equal(args[args.indexOf('--client-model') + 1], 'test-model');
  assert(args.includes('--query'));
  await assert.rejects(call('parallel_search', {}), /objective or queries/);
  await assert.rejects(call('parallel_search', {objective:'x',include_domains:['--help']}), /hostnames/);
  console.log('PASS typed search wrapper, CLI argv isolation, metadata, input checks');

  const fetched = await check('parallel_fetch', {urls:['https://example.com']});
  assert(fetched.structuredContent.result.args.includes('--full-content'));
  const extracted = await check('parallel_extract', {urls:['https://example.com'],objective:'Find one fact'});
  assert(!extracted.structuredContent.result.args.includes('--full-content'));
  await assert.rejects(call('parallel_fetch', {urls:['file:///etc/passwd']}), /HTTP\(S\)/);
  await assert.rejects(call('parallel_fetch', {urls:['http://localhost:3000']}), /local or private/);
  await assert.rejects(call('parallel_fetch', {urls:['https://user:secret@example.com']}), /credentials/);
  console.log('PASS fetch full-content default, extract excerpt default, public URL checks');

  let count = (await argsLog()).length;
  await assert.rejects(call('parallel_research_start', {query:'question'}), /interactive confirmation/);
  assert.equal((await argsLog()).length, count);
  await assert.rejects(call('parallel_research_start', {query:'question'}, {...context,hasUI:true}), /declined/);
  assert.equal((await argsLog()).length, count);
  const preview = await check('parallel_research_start', {query:'question',dry_run:true});
  assert(preview.structuredContent.result.args.includes('--dry-run'));
  let prompt = '';
  const allowed = {...context,hasUI:true,ui:{...context.ui,confirm:async(title,body)=>{prompt=body;return true;}}};
  const start = await check('parallel_research_start', {query:'user-approved question',processor:'lite-fast'},allowed);
  assert(prompt.includes('user-approved question') && prompt.includes('lite-fast'));
  assert(start.structuredContent.result.args.includes('--no-wait'));
  console.log('PASS paid submission confirmation/denial; noninteractive dry-run; async no-wait');

  await check('parallel_research_status', {run_id:'trun_test'});
  const result = await check('parallel_research_result', {run_id:'trun_test',wait_seconds:5});
  const pollArgs = result.structuredContent.result.args;
  assert.equal(pollArgs[pollArgs.indexOf('--timeout')+1],'5');
  assert(!pollArgs.includes('--force'));
  assert(pollArgs[pollArgs.indexOf('--output')+1].startsWith(tmpdir()));
  console.log('PASS existing-run status/poll and unique non-project output paths');

  process.env.PARALLEL_TEST_MODE = 'large';
  const large = await check('parallel_search', {queries:['x']});
  assert(large.structuredContent.truncated);
  assert.equal(large.structuredContent.result.data.length,60000);
  assert((await readFile(large.structuredContent.artifact_path,'utf8')).length>60000);
  assert(large.content[0].text.length<26000);
  process.env.PARALLEL_TEST_MODE = 'fail';
  await assert.rejects(call('parallel_search',{queries:['x']}),/exited 7.*not authenticated/s);
  process.env.PARALLEL_TEST_MODE = 'invalid';
  await assert.rejects(call('parallel_search',{queries:['x']}),/non-JSON/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(call('parallel_search',{queries:['x']},context,cancelled.signal),/cancelled/);
  process.env.PARALLEL_TEST_MODE = 'sleep';
  const during = new AbortController();
  const pending = call('parallel_search',{queries:['x']},context,during.signal);
  const timer = setTimeout(()=>during.abort(),150);
  await assert.rejects(pending,/cancelled or timed out/); clearTimeout(timer);
  console.log('PASS full-result artifacts, truncation, CLI errors, invalid JSON, cancellation');

  if (process.argv.includes('--live')) {
    if(original===undefined) delete process.env.PI_PARALLEL_CLI;
    else process.env.PI_PARALLEL_CLI=original;
    if(originalArgs===undefined) delete process.env.PI_PARALLEL_CLI_ARGS;
    else process.env.PI_PARALLEL_CLI_ARGS=originalArgs;
    delete process.env.PARALLEL_TEST_MODE;
    const search = await check('parallel_search',{objective:'Find the official Parallel Search API documentation',include_domains:['docs.parallel.ai'],max_results:1,mode:'basic'});
    assert(search.structuredContent.result);
    console.log('PASS live public web search (one result requested)');
    const page = await check('parallel_fetch',{urls:['https://example.com/'],max_chars_per_page:1000});
    assert(/Example Domain/i.test(JSON.stringify(page.structuredContent.result)));
    console.log('PASS live public URL fetch with page content');
    const preview = await check('parallel_research_start',{query:'Research preview test; do not submit',dry_run:true,processor:'lite-fast'});
    assert.equal(preview.structuredContent.result.dry_run,true);
    console.log('PASS real CLI research dry-run; no paid job created');
  }
} finally {
  if(original===undefined) delete process.env.PI_PARALLEL_CLI;
  else process.env.PI_PARALLEL_CLI=original;
  if(originalArgs===undefined) delete process.env.PI_PARALLEL_CLI_ARGS;
  else process.env.PI_PARALLEL_CLI_ARGS=originalArgs;
  delete process.env.PARALLEL_TEST_MODE;
  await rm(temp,{recursive:true,force:true});
  for(const dir of artifacts) await rm(dir,{recursive:true,force:true});
}
