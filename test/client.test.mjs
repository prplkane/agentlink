import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { AcpClient, planProvider } from '../src/client.mjs';

const cwd = dirname(fileURLToPath(import.meta.url));
const fixture = join(cwd, 'fixture.mjs');
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup(t, mode = 'reply', extra = {}) {
  const dir = await mkdtemp(join(cwd, 'fixture-run-'));
  const log = join(dir, 'wire.jsonl');
  const client = new AcpClient({ command: process.execPath, args: [fixture, mode, log], cwd,
    cancelGraceMs: 100, ...extra });
  t.after(async () => {
    await client.close();
    assert.ok(resolve(dir).startsWith(resolve(cwd) + sep + 'fixture-run-'));
    await rm(dir, { recursive: true, force: true });
  });
  return { client, transcript: async () => (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
}
async function ready(client) { await client.initialize(); await client.newSession(); }

test('initializes, advertises minimal capabilities, streams split UTF-8, correlates request IDs', async t => {
  const updates = [];
  const { client, transcript } = await setup(t, 'reply', { onUpdate: update => updates.push(update) });
  await ready(client);
  assert.deepEqual(await client.prompt('Synthetic prompt'), { stopReason: 'end_turn' });
  assert.equal(updates[0].content.text, 'Synthetic reply 🪶');
  const wire = (await transcript()).filter(message => message.method);
  assert.deepEqual(wire.map(message => message.method), ['initialize', 'session/new', 'session/prompt']);
  assert.deepEqual(wire.map(message => message.id), [1, 2, 3]);
  assert.deepEqual(wire[0].params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
  assert.equal(wire[1].params.cwd, cwd);
  assert.deepEqual(wire[1].params.mcpServers, []);
});

test('permission requests are cancelled; no tool permission is silently granted', async t => {
  const { client, transcript } = await setup(t, 'permissions');
  await ready(client); await client.prompt('Synthetic prompt');
  assert.deepEqual((await transcript()).find(message => message.id === 'permission-1').result,
    { outcome: { outcome: 'cancelled' } });
});

test('accepts session updates coalesced with the new-session response', async t => {
  const updates = [];
  const { client } = await setup(t, 'early-update', { onUpdate: update => updates.push(update) });
  await ready(client); await client.prompt('Synthetic prompt');
  assert.equal(updates[0].sessionUpdate, 'available_commands_update');
});

test('allows only one initialization and session creation at a time', async t => {
  const { client } = await setup(t);
  const init = client.initialize();
  await assert.rejects(client.initialize(), { code: 'INVALID_STATE' });
  await init;
  const session = client.newSession();
  await assert.rejects(client.newSession(), { code: 'INVALID_STATE' });
  await session;
});

test('unsupported client requests receive method-not-found', async t => {
  const { client, transcript } = await setup(t, 'unsupported');
  await ready(client); await client.prompt('Synthetic prompt');
  assert.equal((await transcript()).find(message => message.id === 'tool-1').error.code, -32601);
});

test('manual cancellation sends exactly one notification and observes cancelled completion', async t => {
  const { client, transcript } = await setup(t, 'stall');
  await ready(client);
  const prompt = client.prompt('Synthetic prompt');
  assert.equal(client.cancel(), true); assert.equal(client.cancel(), true);
  assert.equal((await prompt).stopReason, 'cancelled');
  assert.equal((await transcript()).filter(message => message.method === 'session/cancel').length, 1);
});

test('prompt deadline sends cancellation and reports the deadline without retrying', async t => {
  const { client, transcript } = await setup(t, 'stall');
  await ready(client);
  await assert.rejects(client.prompt('Synthetic prompt', { timeoutMs: 40 }), { code: 'DEADLINE' });
  const methods = (await transcript()).map(message => message.method);
  assert.equal(methods.filter(method => method === 'session/prompt').length, 1);
  assert.equal(methods.filter(method => method === 'session/cancel').length, 1);
});

test('AbortSignal cancels the active prompt', async t => {
  const { client } = await setup(t, 'stall'); await ready(client);
  const abort = new AbortController();
  const prompt = client.prompt('Synthetic prompt', { signal: abort.signal });
  abort.abort();
  await assert.rejects(prompt, { code: 'CANCELLED' });
});

test('a pre-aborted request sends no prompt', async t => {
  const { client, transcript } = await setup(t); await ready(client);
  await assert.rejects(client.prompt('Synthetic prompt', { signal: AbortSignal.abort() }), { code: 'CANCELLED' });
  assert.equal((await transcript()).some(message => message.method === 'session/prompt'), false);
});

for (const [mode, code, options] of [
  ['malformed', 'PROTOCOL_ERROR'], ['invalid-utf8', 'PROTOCOL_ERROR'],
  ['wrong-id', 'PROTOCOL_ERROR'], ['wrong-session', 'PROTOCOL_ERROR'],
  ['oversize', 'MESSAGE_LIMIT', { maxMessageBytes: 1024 }],
  ['output-limit', 'OUTPUT_LIMIT', { maxOutputBytes: 1024 }],
  ['crash', 'PROCESS_EXIT']
]) test(`fails explicitly for ${mode}`, async t => {
  const { client } = await setup(t, mode, options); await ready(client);
  await assert.rejects(client.prompt('Synthetic prompt'), { code });
  await client.close();
  assert.equal(alive(client.pid), false);
});

test('initialization deadline terminates the owned process', async t => {
  const { client } = await setup(t, 'init-stall');
  await assert.rejects(client.initialize({ timeoutMs: 100 }), { code: 'DEADLINE' });
  await client.close(); assert.equal(alive(client.pid), false);
});

test('agent ignoring cancellation is terminated after bounded grace', async t => {
  const { client } = await setup(t, 'ignore-cancel'); await ready(client);
  const start = Date.now();
  await assert.rejects(client.prompt('Synthetic prompt', { timeoutMs: 30 }), { code: 'DEADLINE' });
  await client.close(); assert.equal(alive(client.pid), false);
  assert.ok(Date.now() - start < 5000);
});

test('close owns its child tree and leaves an unrelated fixture process alive', async t => {
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  t.after(() => unrelated.kill());
  const { client, transcript } = await setup(t, 'tree'); await ready(client);
  const descendant = (await transcript()).find(message => message.descendantPid).descendantPid;
  assert.ok(alive(descendant));
  await client.close(); await pause(30);
  assert.equal(alive(client.pid), false); assert.equal(alive(descendant), false);
  assert.equal(alive(unrelated.pid), true);
});

test('remote errors preserve their protocol code', async t => {
  const { client } = await setup(t, 'session-error'); await client.initialize();
  await assert.rejects(client.newSession(), { code: 'REMOTE_ERROR', rpcCode: -32000 });
});

test('rejects unsupported protocol negotiation', async t => {
  const { client } = await setup(t, 'v2-only');
  await assert.rejects(client.initialize(), { code: 'UNSUPPORTED_PROTOCOL' });
});

test('stderr capture is bounded and never mixed into the reply', async t => {
  const { client } = await setup(t, 'stderr', { stderrBytes: 100 }); await ready(client);
  await client.prompt('Synthetic prompt');
  assert.equal(Buffer.byteLength(client.stderrTail), 100);
});

test('missing executable is a launch error, not a silent stall', async t => {
  const client = new AcpClient({ command: join(cwd, 'no-such-agent.exe'), cwd });
  t.after(() => client.close());
  await assert.rejects(client.initialize(), { code: 'SPAWN_FAILED' });
});

test('registry uses explicit argv, has no auto-install or unsupported AGY fallback', () => {
  assert.deepEqual(planProvider('kimi', { executable: process.execPath, prefixArgs: ['entry.mjs'] }),
    { command: process.execPath, args: ['entry.mjs', 'acp'] });
  assert.throws(() => planProvider('antigravity', { executable: process.execPath }), /No supported/);
  assert.throws(() => planProvider('unrecognized'), /Unknown provider/);
  assert.throws(() => new AcpClient({ command: 'node', cwd }), /absolute/);
});

test('rejects concurrent prompts instead of cross-routing their output', async t => {
  const { client } = await setup(t, 'stall'); await ready(client);
  const first = client.prompt('Synthetic prompt');
  await assert.rejects(client.prompt('Second prompt'), { code: 'INVALID_STATE' });
  client.cancel(); await first;
});
