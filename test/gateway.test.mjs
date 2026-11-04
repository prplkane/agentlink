import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { runGateway } from '../src/gateway.mjs';
import { setup, alive, execute, directory, fixture } from './support.mjs';
import { version } from '../src/version.mjs';

test('abort interrupts blocked final output and releases the installation lease', async t => {
  const c = await setup(t);
  await c.manager.add('managed', { spec: { kind: 'binary', version: '1', url: fixture, bin: 'agent.mjs' }, offline: true });
  const { launch, release } = await c.manager.acquire('managed');
  const input = new PassThrough(), diagnostics = new PassThrough(), abort = new AbortController();
  let received;
  const writing = new Promise(resolve => { received = resolve; });
  const output = new Writable({ write(chunk, encoding, done) { received(); } });
  const connection = runGateway(launch, { input, output, diagnostics, signal: abort.signal,
    interactive: false, shutdownGraceMs: 20 }).finally(release);
  const rejected = assert.rejects(connection, { code: 'CANCELLED' });
  t.after(() => { abort.abort(); output.destroy(); diagnostics.destroy(); });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 'last', method: '_fixture/final', params: {} }) + '\n');
  await writing;
  // Let the bridge exit so this exercises the final drain, not just a live kill.
  await new Promise(resolve => setTimeout(resolve, 100));
  abort.abort();
  let timer;
  try {
    await Promise.race([rejected, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Cancellation remained blocked')), 2000);
    })]);
  } finally { clearTimeout(timer); }
  assert.deepEqual(await readdir(c.manager.bridges.leases), []);
  assert.equal(output.destroyed, true);
});

for (const version of [1, 2]) test('standard ACP v' + version + ' negotiation and extension data pass unchanged', async t => {
  const c = await setup(t);
  await c.profile();
  const client = await c.client();
  const capabilities = { fs: { readTextFile: true, writeTextFile: true }, terminal: true, auth: { terminal: true }, _meta: { custom: 'yes' } };
  const init = await client.initialize(version, capabilities);
  assert.equal(init.protocolVersion, version);
  assert.deepEqual(init._meta.receivedClient.clientCapabilities, capabilities);
  assert.deepEqual(init.agentCapabilities._meta, { 'fixture/custom': { enabled: true } });
  assert.equal(init.authMethods[0].type, 'terminal');
  const session = await client.session(c.root);
  assert.equal(session.configOptions[0].id, 'fixture-style');
  const result = await client.prompt(session.sessionId, 'hello 世界');
  assert.equal(result.text, 'hello 世界');
  assert.equal(result.cwd, c.root);
  assert.deepEqual(await client.request('_fixture/echo', { newField: [1, { x: '✓' }], _meta: { untouched: true } }, 'opaque-id'),
    { newField: [1, { x: '✓' }], _meta: { untouched: true } });
  await assert.rejects(client.request('future/unsupported', {}), cause => cause.remote.code === -32601 && cause.remote.data.method === 'future/unsupported');
});

test('gateway forwards permission choices and reverse filesystem calls to the actual client', async t => {
  const c = await setup(t); await c.profile();
  const seen = [];
  const client = await c.client('agent', { onRequest: request => {
    seen.push(request);
    return request.method === 'session/request_permission' ? { outcome: { outcome: 'selected', optionId: 'deny' } } : { content: 'client-owned content' };
  } });
  await client.initialize(1, { fs: { readTextFile: true } });
  const { sessionId } = await client.session(c.root);
  assert.deepEqual((await client.prompt(sessionId, 'permission')).clientReply, { outcome: { outcome: 'selected', optionId: 'deny' } });
  assert.deepEqual((await client.prompt(sessionId, 'client-tool')).clientReply, { content: 'client-owned content' });
  assert.deepEqual(seen.map(request => request.method), ['session/request_permission', 'fs/read_text_file']);
});

test('multiple projects and sessions stay isolated and no setup requests are injected', async t => {
  const c = await setup(t), log = join(c.root, 'rpc.jsonl');
  await c.profile('shared', { FIXTURE_LOG: log });
  await writeFile(log, '');
  const a = await c.client('shared'), b = await c.client('shared');
  await Promise.all([a.initialize(), b.initialize()]);
  const [first, second] = await Promise.all([a.session('project-a'), b.session('project-b')]);
  const results = await Promise.all([a.prompt(first.sessionId, 'A'), b.prompt(second.sessionId, 'B')]);
  assert.deepEqual(results.map(result => result.cwd), ['project-a', 'project-b']);
  await Promise.all([a.close(), b.close()]);
  const events = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(event => event.rpc?.method === 'initialize').length, 2);
  assert.equal(events.filter(event => event.rpc?.method === 'session/new').length, 2);
  assert.equal(events.filter(event => event.launch).length, 2);
  assert.ok(events.filter(event => event.launch).every(event => !alive(event.pid)));
});

test('cancellation is forwarded and does not terminate other sessions', async t => {
  const c = await setup(t); await c.profile();
  const client = await c.client(); await client.initialize();
  const { sessionId } = await client.session(c.root);
  const prompt = client.prompt(sessionId, 'wait');
  client.send({ method: 'session/cancel', params: { sessionId } });
  assert.equal((await prompt).stopReason, 'cancelled');
  assert.equal((await client.prompt(sessionId, 'next')).text, 'next');
});

test('different centrally configured profiles can run concurrently', async t => {
  const c = await setup(t);
  await c.profile('first', { FIXTURE_NAME: 'first-agent' });
  await c.profile('second', { FIXTURE_NAME: 'second-agent' });
  const a = await c.client('first'), b = await c.client('second');
  const agents = await Promise.all([a.initialize(), b.initialize()]);
  assert.deepEqual(agents.map(agent => agent.agentInfo.name), ['first-agent', 'second-agent']);
  const sessions = await Promise.all([a.session('project-a'), b.session('project-b')]);
  const replies = await Promise.all([a.prompt(sessions[0].sessionId, 'one'), b.prompt(sessions[1].sessionId, 'two')]);
  assert.deepEqual(replies.map(reply => [reply.cwd, reply.text]), [['project-a', 'one'], ['project-b', 'two']]);
});

test('final response drains completely to a slow client after the bridge exits', async () => {
  const input = new PassThrough(), diagnostics = new PassThrough(), chunks = [];
  const output = new Writable({ write(chunk, encoding, done) {
    setTimeout(() => { chunks.push(Buffer.from(chunk)); done(); }, 150);
  } });
  const connection = runGateway({ command: process.execPath, prefixArgs: [fixture], acpArgs: [] },
    { input, output, diagnostics, interactive: false, shutdownGraceMs: 20 });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 'last', method: '_fixture/final', params: {} }) + '\n');
  assert.equal((await connection).exitCode, 0);
  const received = Buffer.concat(chunks).toString();
  assert.equal(received.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(received), { jsonrpc: '2.0', id: 'last', result: { text: 'x'.repeat(1024 * 1024) } });
  output.destroy(); diagnostics.destroy();
});

test('terminal authentication arguments are forwarded without management parsing', async t => {
  const c = await setup(t); await c.profile();
  const result = await c.command(['acp', 'agent', '--login', '--home', 'must-go-to-agent', '--json'], {
    env: { ...process.env, AGENTLINK_HOME: c.home, FIXTURE_LOGIN: 'yes' }
  });
  assert.deepEqual(JSON.parse(result.stdout), { login: ['--login', '--home', 'must-go-to-agent', '--json'], env: 'yes' });
});

test('standard terminal-auth descriptor works with environment-only authentication', async t => {
  const c = await setup(t); await c.profile('agent', { FIXTURE_MODE: 'env-auth', FIXTURE_LOGIN: 'base' });
  const client = await c.client();
  const method = (await client.initialize(1, { auth: { terminal: true } })).authMethods[0];
  assert.deepEqual(method.args, ['--agentlink-terminal-auth']);
  const login = await c.command(['acp', 'agent', ...method.args], {
    env: { ...process.env, AGENTLINK_HOME: c.home, ...method.env }
  });
  assert.deepEqual(JSON.parse(login.stdout), { login: [], env: 'env-only' });
});

test('crashes and malformed output fail promptly without corrupting protocol stdout', async t => {
  const c = await setup(t); await c.profile();
  for (const text of ['crash', 'malformed']) {
    const client = await c.client(); await client.initialize();
    const { sessionId } = await client.session(c.root);
    await assert.rejects(client.prompt(sessionId, text), /Gateway exited/);
    const exit = await client.exit;
    assert.notEqual(exit.code, 0);
    if (text === 'malformed') assert.match(exit.stderr, /PROTOCOL_ERROR/);
  }
});

test('client disconnect stops a bridge that ignores EOF, including its child', async t => {
  const c = await setup(t); await c.profile('agent', { FIXTURE_MODE: 'ignore-eof' });
  const client = await c.client(); await client.initialize();
  const { sessionId } = await client.session(c.root);
  const { descendant } = await client.prompt(sessionId, 'spawn');
  assert.equal(alive(descendant), true);
  await client.close();
  assert.equal(alive(descendant), false);
});

test('unknown profile errors stay on stderr with no protocol pollution', async t => {
  const c = await setup(t);
  await assert.rejects(c.command(['acp', 'missing']), cause => cause.stdout === '' && /PROFILE_NOT_FOUND/.test(cause.stderr));
});

test('exported launch config and the independent check example use the actual gateway', async t => {
  const c = await setup(t); await c.profile();
  const config = JSON.parse((await c.command(['config', 'agent'])).stdout);
  assert.equal(config.command, process.execPath);
  const client = await c.client('agent', { launch: config });
  assert.equal((await client.initialize()).agentInfo.name, 'offline-agent');
  const example = await execute(process.execPath, [join(directory, '../examples/acp-check.mjs'), 'agent'], {
    cwd: c.root, env: { ...process.env, AGENTLINK_HOME: c.home }, timeout: 10000, windowsHide: true
  });
  assert.equal(JSON.parse(example.stdout).agentInfo.name, 'offline-agent');
  assert.equal((await c.command(['--version'])).stdout.trim(), version);
});
