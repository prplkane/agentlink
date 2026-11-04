import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { AgentLink } from '../src/index.mjs';

export const directory = dirname(fileURLToPath(import.meta.url));
export const fixture = join(directory, 'gateway-fixture.mjs');
export const cli = join(directory, '../src/cli.mjs');
export const execute = promisify(execFile);
export const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

export async function setup(t) {
  const root = await mkdtemp(join(directory, 'integration-run-'));
  const home = join(root, 'user-home');
  const manager = new AgentLink({ home });
  const clients = [];
  t.after(async () => {
    await Promise.allSettled(clients.map(client => client.close()));
    assert.equal(dirname(resolve(root)), resolve(directory));
    assert.ok(root.includes('integration-run-'));
    await rm(root, { recursive: true, force: true });
  });
  return { root, home, manager, clients,
    async profile(name = 'agent', env = {}) {
      return manager.add(name, { command: process.execPath, prefixArgs: [fixture], acpArgs: [], launchEnv: env });
    },
    async client(name = 'agent', options = {}) {
      const cwd = options.cwd || join(root, 'project');
      await mkdir(cwd, { recursive: true });
      const client = rpcClient(home, name, { ...options, cwd });
      clients.push(client);
      return client;
    },
    command(args, options = {}) {
      return execute(process.execPath, [cli, ...args], { env: { ...process.env, AGENTLINK_HOME: home },
        cwd: root, timeout: 30000, windowsHide: true, ...options });
    }
  };
}

// Independent ACP caller: no AgentLink client library on the application side.
export function rpcClient(home, name, { cwd, onRequest, env, launch } = {}) {
  const child = spawn(launch?.command || process.execPath, launch?.args || [cli, '--home', home, 'acp', name], {
    cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  let next = 0, stderr = '', ended = false;
  const pending = new Map(), messages = [];
  const exit = new Promise(resolveExit => {
    child.once('close', (code, signal) => {
      ended = true;
      for (const value of pending.values()) { clearTimeout(value.timer); value.reject(new Error('Gateway exited: ' + code + ' ' + stderr)); }
      pending.clear(); resolveExit({ code, signal, stderr });
    });
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {});
  child.on('error', () => {});
  const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  const reader = createInterface({ input: child.stdout });
  reader.on('line', async line => {
    let message;
    try { message = JSON.parse(line); } catch { stderr += 'Non-JSON stdout: ' + line; child.kill(); return; }
    messages.push(message);
    if (message.method && Object.hasOwn(message, 'id')) {
      try {
        if (onRequest) send({ id: message.id, result: await onRequest(message) });
        else send({ id: message.id, error: { code: -32601, message: 'No client handler' } });
      } catch (cause) { send({ id: message.id, error: { code: -32603, message: cause.message } }); }
    } else if (pending.has(message.id)) {
      const value = pending.get(message.id); pending.delete(message.id); clearTimeout(value.timer);
      if (message.error) value.reject(Object.assign(new Error(message.error.message), { remote: message.error }));
      else value.resolve(message.result);
    }
  });
  return { child, exit, messages, send,
    request(method, params = {}, id = ++next) {
      if (ended) return Promise.reject(new Error('Gateway is closed: ' + stderr));
      return new Promise((resolveReply, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('RPC timed out: ' + method + ' ' + stderr)); }, 8000);
        pending.set(id, { resolve: resolveReply, reject, timer }); send({ id, method, params });
      });
    },
    initialize(version = 1, capabilities = {}) { return this.request('initialize', { protocolVersion: version, clientCapabilities: capabilities,
      clientInfo: { name: 'independent-offline-client', version: '1' }, _meta: { caller: 'kept' } }); },
    async session(cwd) { return this.request('session/new', { cwd, mcpServers: [] }); },
    prompt(sessionId, text) { return this.request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }); },
    async close() {
      if (!ended) child.stdin.end();
      let timer;
      const result = await Promise.race([exit, new Promise(resolveExit => { timer = setTimeout(() => { child.kill(); resolveExit(); }, 5000); })]);
      clearTimeout(timer);
      return result;
    }
  };
}

export async function npmFixture(root, version, { broken = false } = {}) {
  const path = join(root, 'package-' + version);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'agentlink-offline-fixture', version,
    type: 'module', bin: { 'fixture-agent': 'agent.mjs' }, files: ['agent.mjs'] }));
  const source = await readFile(fixture, 'utf8');
  await writeFile(join(path, 'agent.mjs'), '#!/usr/bin/env node\n' + (broken ? 'process.stdout.write("broken protocol\\n");\n' : source));
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const result = await execute(process.platform === 'win32' ? process.execPath : 'npm',
    [...(process.platform === 'win32' ? [npm] : []), 'pack', '--offline', '--ignore-scripts', '--json'], {
    cwd: path, timeout: 30000, windowsHide: true
  });
  return { kind: 'npm', package: 'agentlink-offline-fixture', version, source: join(path, JSON.parse(result.stdout)[0].filename) };
}
