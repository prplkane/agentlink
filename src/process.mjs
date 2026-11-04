import { spawn } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { error, strings } from './profiles.mjs';
import { stopProcess } from './child-process.mjs';
export { stopProcess } from './child-process.mjs';

export async function resolveCommand(command, prefixArgs = [], env = process.env) {
  if (typeof command !== 'string' || !command || command.includes('\0') || !strings(prefixArgs)) {
    throw new TypeError('Supply a command and an array of prefix arguments.');
  }
  const explicit = isAbsolute(command) || command.includes('/') || command.includes('\\');
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  const extensions = process.platform === 'win32' && !extname(command) ? ['.exe', '.com', '.cmd', ''] : [''];
  const directories = explicit ? [''] : pathValue.split(delimiter).filter(Boolean).map(part => part.replace(/^"|"$/g, ''));
  let executable;
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = explicit ? resolve(command + extension) : resolve(directory, command + extension);
      try {
        if (!(await stat(candidate)).isFile()) continue;
        if (process.platform !== 'win32') await access(candidate, constants.X_OK);
        executable = candidate; break;
      } catch (cause) {
        if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(cause.code)) throw cause;
      }
    }
    if (executable) break;
  }
  if (!executable) throw error('COMMAND_NOT_FOUND', `Cannot find installed executable "${command}".`);
  if (process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(executable)) {
    // Recognize only the standard npm Node shim. Never run its shell body.
    const metadata = await stat(executable);
    const shim = metadata.size <= 32768 ? await readFile(executable, 'utf8') : '';
    const match = /"%_prog%"\s+"%dp0%\\([^"\r\n]+\.(?:js|cjs|mjs))"\s+%\*/i.exec(shim);
    if (extname(executable).toLowerCase() !== '.cmd' || !match || !/SET\s+"_prog=node"/i.test(shim)) {
      throw error('UNSUPPORTED_LAUNCHER', 'Use a native executable, a standard npm Node launcher, or node with --prefix-args pointing to the installed entry script.');
    }
    const script = resolve(dirname(executable), match[1]);
    if (!(await stat(script)).isFile()) throw error('COMMAND_NOT_FOUND', 'The npm launcher entry script is missing.');
    const localNode = join(dirname(executable), 'node.exe');
    let node;
    try { node = (await stat(localNode)).isFile() ? localNode : undefined; }
    catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    node ??= (await resolveCommand('node.exe', [], env)).command;
    return { command: node, prefixArgs: [script, ...prefixArgs], executableName: basename(executable, '.cmd') };
  }
  return { command: executable, prefixArgs: [...prefixArgs], executableName: basename(executable).replace(/\.(exe|com)$/i, '') };
}

export async function readHelp({ command, args, cwd, env = process.env, timeoutMs = 3000, maxBytes = 65536, signal }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('Help probe limits must be positive integers.');
  }
  signal?.throwIfAborted();
  const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  const buffers = [];
  let bytes = 0;
  let abort;
  try {
    const code = await new Promise((resolveCode, reject) => {
      const timer = setTimeout(() => fail(error('HELP_TIMEOUT', 'The CLI did not finish its help response.')), timeoutMs);
      const fail = cause => { clearTimeout(timer); reject(cause); };
      abort = () => fail(error('CANCELLED', 'Help discovery cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      const collect = chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { fail(error('HELP_LIMIT', 'CLI help exceeds the output limit.')); return; }
        buffers.push(chunk);
      };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.stdout.once('error', fail); child.stderr.once('error', fail);
      child.stdin.once('error', cause => { if (cause.code !== 'EPIPE') fail(cause); });
      child.once('error', () => fail(error('SPAWN_FAILED', 'Could not start the help process.')));
      child.once('close', exitCode => { clearTimeout(timer); resolveCode(exitCode); });
      child.stdin.end();
    });
    return { code, text: stripVTControlCharacters(Buffer.concat(buffers).toString('utf8')) };
  } finally { signal?.removeEventListener('abort', abort); await stopProcess(child); }
}

export async function runCommand(command, args, { cwd, env = process.env, timeoutMs = 180000, signal } = {}) {
  signal?.throwIfAborted();
  const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let timer, abort;
  const stdout = []; let bytes = 0, stderr = Buffer.alloc(0);
  try {
    return await new Promise((resolveRun, reject) => {
      timer = setTimeout(() => reject(error('INSTALL_TIMEOUT', 'Installer exceeded its deadline.')), timeoutMs);
      abort = () => reject(error('CANCELLED', 'Installation cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) reject(error('OUTPUT_LIMIT', 'Installer output exceeds its limit.'));
        else stdout.push(chunk);
      });
      child.stderr.on('data', chunk => { stderr = Buffer.concat([stderr, chunk]).subarray(-8192); });
      child.once('error', () => reject(error('SPAWN_FAILED', 'Could not start installer: ' + command)));
      child.once('close', code => {
        if (code !== 0) reject(error('INSTALL_FAILED', 'Installer exited with ' + code + ': ' + stderr.toString('utf8').trim()));
        else resolveRun(Buffer.concat(stdout).toString('utf8'));
      });
    });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    await stopProcess(child);
  }
}
