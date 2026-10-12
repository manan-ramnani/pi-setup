import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, delimiter, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export const versions = readJson(join(root, 'versions.json'));
export function agentDirectory(value) {
  const path = value || process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
  return resolve(path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
}
export function nodeSupported(value = process.versions.node) {
  const [major, minor] = value.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 19);
}
export function commandPath(command, env = process.env, platform = process.platform) {
  if (command.includes('/') || command.includes('\\')) return existsSync(command) ? command : undefined;
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (env[pathKey] || '').split(platform === 'win32' ? ';' : delimiter)) {
    if (!dir) continue;
    for (const suffix of extensions) {
      const candidate = join(dir.replace(/^"|"$/g, ''), command + suffix);
      if (existsSync(candidate)) return candidate;
    }
  }
}
export function invocation(command, args = [], env = process.env, platform = process.platform) {
  const executable = commandPath(command, env, platform);
  if (!executable) throw new Error(`Executable not found: ${command}. Install it and reopen your terminal.`);
  if (platform === 'win32' && ['.cmd', '.bat'].includes(extname(executable).toLowerCase())) {
    // Resolve both global shims and node_modules/.bin without cmd.exe interpolation.
    const packageName = command === 'npm' ? 'npm' : command === 'pi' ? '@earendil-works/pi-coding-agent' : undefined;
    const packageRoot = packageName && findPackageRoot(dirname(executable), packageName);
    const bin = packageRoot && readJson(join(packageRoot, 'package.json')).bin;
    const entry = typeof bin === 'string' ? bin : bin?.[command];
    const script = entry && join(packageRoot, entry);
    if (!script || !existsSync(script)) throw new Error(`Cannot safely run ${executable}; use the standard Node/npm installation or an actual executable.`);
    return { command: process.execPath, args: [script, ...args] };
  }
  return { command: executable, args };
}
export function run(command, args = [], options = {}) {
  const call = invocation(command, args, options.env || process.env);
  const result = spawnSync(call.command, call.args, { cwd: root, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? result.signal}`);
  return result;
}
export function capture(command, args = [], options = {}) {
  return run(command, args, { stdio: 'pipe', ...options }).stdout.trim();
}
function findPackageRoot(start, name) {
  let dir = resolve(start);
  while (true) {
    const candidate = join(dir, 'node_modules', name);
    const manifest = join(candidate, 'package.json');
    if (existsSync(manifest) && readJson(manifest).name === name) return candidate;
    if (dirname(dir) === dir) return undefined;
    dir = dirname(dir);
  }
}
export function resolvePiRoot() {
  if (process.env.PI_MODULE_ROOT) return resolve(process.env.PI_MODULE_ROOT);
  const local = findPackageRoot(root, '@earendil-works/pi-coding-agent');
  if (local) return local;
  const require = createRequire(join(root, 'package.json'));
  try {
    let dir = dirname(require.resolve('@earendil-works/pi-coding-agent'));
    while (dirname(dir) !== dir) {
      const manifest = join(dir, 'package.json');
      if (existsSync(manifest) && readJson(manifest).name === '@earendil-works/pi-coding-agent') return dir;
      dir = dirname(dir);
    }
  } catch {}
  const global = join(capture('npm', ['root', '-g']), '@earendil-works/pi-coding-agent');
  if (existsSync(join(global, 'dist/index.js'))) return global;
  throw new Error('Pi modules not found. Run npm ci --ignore-scripts --legacy-peer-deps, or set PI_MODULE_ROOT.');
}
export async function piDependencyImport(name, relative) {
  const dir = findPackageRoot(resolvePiRoot(), name);
  if (!dir) throw new Error(`Dependency not found: ${name}`);
  const { pathToFileURL } = await import('node:url');
  return import(pathToFileURL(join(dir, relative)).href);
}
export async function piImport(relative) {
  const { pathToFileURL } = await import('node:url');
  return import(pathToFileURL(join(resolvePiRoot(), relative)).href);
}
