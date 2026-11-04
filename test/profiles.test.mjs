import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentLink, AcpClient, ProfileStore, inspectHelp } from '../src/index.mjs';
import { resolveCommand } from '../src/process.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = join(directory, 'agent-fixture.mjs');
const cli = join(directory, '..', 'src', 'cli.mjs');
const execute = promisify(execFile);
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function context(t) {
  const root = await mkdtemp(join(directory, 'profile-run-'));
  const log = join(root, 'events.jsonl');
  await writeFile(log, '');
  const home = join(root, 'user-home');
  const manager = new AgentLink({ home });
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.close()));
    assert.equal(dirname(resolve(root)), resolve(directory));
    assert.ok(root.includes('profile-run-'));
    await rm(root, { recursive: true, force: true });
  });
  return { root, home, manager, log, clients,
    launch: mode => ({ command: process.execPath, prefixArgs: [fixture, mode, log] }),
    events: async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
    cli: async args => execute(process.execPath, [cli, ...args], { env: { ...process.env, AGENTLINK_HOME: home }, timeout: 15000, windowsHide: true })
  };
}

test('unknown CLI help is matched, initialized without a task, and persisted for this user', async t => {
  const c = await context(t);
  const profile = await c.manager.add('mine', c.launch('flag'));
  assert.equal(profile.discovery.method, 'help');
  assert.match(profile.discovery.helpSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(profile.acpArgs, ['--acp']);
  assert.equal(profile.verification.status, 'initialize-passed');
  assert.equal(profile.verification.agentInfo.name, 'fixture-flag');
  assert.deepEqual(await new AgentLink({ home: c.home }).get('mine'), profile);
  const events = await c.events();
  assert.deepEqual(events.filter(e => e.type === 'rpc').map(e => e.message.method), ['initialize']);
  assert.ok(events.filter(e => e.type === 'launch').every(e => !alive(e.pid)));
});

for (const mode of ['subcommand', 'nested', 'short-help']) test(`discovers ${mode} help without a provider-specific adapter`, async t => {
  const c = await context(t);
  const profile = await c.manager.add('custom', c.launch(mode));
  assert.equal(profile.verification.status, 'initialize-passed');
  assert.deepEqual((await c.events()).filter(e => e.type === 'rpc').map(e => e.message.method), ['initialize']);
});

test('an outdated known recipe falls back to help and saves the working argv', async t => {
  const c = await context(t);
  const profile = await c.manager.add('custom', { ...c.launch('flag'), provider: 'kimi' });
  assert.equal(profile.discovery.method, 'help');
  assert.deepEqual(profile.acpArgs, ['--acp']);
  const launches = (await c.events()).filter(e => e.type === 'launch');
  assert.deepEqual(launches[0].args, ['acp']);
});

test('a known installed bridge is initialized directly, without help or model requests', async t => {
  const c = await context(t);
  const profile = await c.manager.add('bridge', { ...c.launch('direct'), provider: 'claude' });
  assert.equal(profile.discovery.method, 'known');
  assert.deepEqual(profile.acpArgs, []);
  assert.deepEqual((await c.events()).filter(e => e.type === 'launch').map(e => e.args), [[]]);
});

test('two projects share one profile and the next connection observes a central update', async t => {
  const c = await context(t);
  await c.manager.add('shared', c.launch('flag'));
  const other = new AgentLink({ home: c.home });
  const firstProject = join(c.root, 'first-project');
  const secondProject = join(c.root, 'second-project');
  await mkdir(firstProject); await mkdir(secondProject);
  const updates = [];
  const first = await c.manager.connect('shared', { cwd: firstProject, onUpdate: update => updates.push(update.content.text) });
  c.clients.push(first);
  await first.prompt('first');
  await other.update('shared', { prefixArgs: c.launch('subcommand').prefixArgs });
  const second = await c.manager.connect('shared', { cwd: secondProject, onUpdate: update => updates.push(update.content.text) });
  c.clients.push(second);
  await second.prompt('second');
  await first.prompt('still-running');
  assert.deepEqual(updates, ['flag:first', 'subcommand:second', 'flag:still-running']);
  assert.equal(first.sessionId, 'first-project');
  assert.equal(second.sessionId, 'second-project');
  assert.equal((await c.events()).filter(e => e.type === 'launch' && e.args.includes('--help')).length, 2);
});

test('failed update leaves the previously working profile intact', async t => {
  const c = await context(t);
  await c.manager.add('keep', c.launch('flag'));
  const before = await readFile(c.manager.store.path('keep'), 'utf8');
  await assert.rejects(c.manager.update('keep', { acpArgs: ['not-acp'] }), { code: 'ACP_VERIFICATION_FAILED' });
  assert.equal(await readFile(c.manager.store.path('keep'), 'utf8'), before);
});

test('a changed CLI is inspected rather than receiving the old agent arguments', async t => {
  const c = await context(t);
  await c.manager.add('keep', c.launch('subcommand'));
  const before = await readFile(c.manager.store.path('keep'), 'utf8');
  await writeFile(c.log, '');
  await assert.rejects(c.manager.update('keep', { prefixArgs: c.launch('unsupported').prefixArgs }), { code: 'DISCOVERY_INCONCLUSIVE' });
  assert.equal(await readFile(c.manager.store.path('keep'), 'utf8'), before);
  assert.ok((await c.events()).filter(e => e.type === 'launch').every(e => ['--help', '-h'].includes(e.args[0])));
});

test('refresh repairs stale arguments, while check does not rewrite profiles', async t => {
  const c = await context(t);
  await c.manager.add('refreshable', { ...c.launch('flag'), acpArgs: ['old-mode'], verify: false });
  assert.equal((await c.events()).length, 0);
  const updated = await c.manager.refresh('refreshable');
  assert.deepEqual(updated.acpArgs, ['--acp']);
  const before = await readFile(c.manager.store.path('refreshable'), 'utf8');
  assert.equal((await c.manager.check('refreshable')).status, 'initialize-passed');
  assert.equal(await readFile(c.manager.store.path('refreshable'), 'utf8'), before);
});

for (const mode of ['unsupported', 'fake']) test(`${mode} is not saved as a usable ACP agent`, async t => {
  const c = await context(t);
  await assert.rejects(c.manager.add('bad', c.launch(mode)), { code: 'DISCOVERY_INCONCLUSIVE' });
  assert.deepEqual(await c.manager.list(), []);
  const events = await c.events();
  assert.ok(events.filter(e => e.type === 'rpc').every(e => e.message.method === 'initialize'));
  if (mode === 'unsupported') assert.ok(events.filter(e => e.type === 'launch').every(e => ['--help', '-h'].includes(e.args[0])));
});

test('help parsing ignores prose, examples, required ACP values and prompt commands', () => {
  assert.deepEqual(inspectHelp('Read ACP docs.\nExample: tool --acp\n  --acp <file>  Write ACP config\n  prompt <text>  Ask about ACP'), { candidates: [], subcommands: [] });
  assert.deepEqual(inspectHelp('  --acp  Use ACP\n  --stdio  Use stdio').candidates, [['--acp', '--stdio']]);
});

test('profile names cannot escape the user directory or use Windows device names', async t => {
  const c = await context(t);
  for (const name of ['../escape', 'CON', 'con', 'nul', 'a/b', 'a\\b', 'bad name', '']) {
    assert.throws(() => c.manager.store.path(name), { code: 'INVALID_PROFILE' });
  }
  await assert.rejects(c.manager.add('../escape', c.launch('flag')), { code: 'INVALID_PROFILE' });
  assert.equal((await c.events()).length, 0);
});

test('user stores are isolated and a damaged profile does not hide healthy entries', async t => {
  const c = await context(t);
  const second = new AgentLink({ home: join(c.root, 'another-user') });
  await c.manager.add('same-name', { ...c.launch('flag'), acpArgs: ['--acp'], verify: false });
  assert.deepEqual(await second.list(), []);
  await second.add('same-name', { ...c.launch('direct'), acpArgs: [], verify: false });
  assert.deepEqual((await c.manager.get('same-name')).acpArgs, ['--acp']);
  assert.deepEqual((await second.get('same-name')).acpArgs, []);
  await writeFile(c.manager.store.path('broken'), '{invalid');
  assert.equal((await c.manager.list()).length, 2);
  assert.equal((await c.manager.list()).find(p => p.name === 'broken').error.code, 'INVALID_PROFILE');
  await assert.rejects(c.manager.connect('broken'), { code: 'INVALID_PROFILE' });
});

test('concurrent adds cannot silently replace an existing named profile', async t => {
  const c = await context(t);
  const options = { ...c.launch('flag'), acpArgs: ['--acp'], verify: false };
  const results = await Promise.allSettled([c.manager.add('unique', options), c.manager.add('unique', options)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PROFILE_EXISTS');
  assert.equal((await c.manager.get('unique')).schemaVersion, 1);
});

for (const mode of ['stall-help', 'huge-help']) test(`${mode} is bounded and its probe processes are stopped`, async t => {
  const c = await context(t);
  const start = Date.now();
  await assert.rejects(c.manager.add('bounded', { ...c.launch(mode), timeoutMs: 250, maxHelpBytes: 256 }), cause => {
    assert.equal(cause.code, 'DISCOVERY_INCONCLUSIVE');
    assert.ok(cause.diagnostics.some(item => item.code === (mode === 'stall-help' ? 'HELP_TIMEOUT' : 'HELP_LIMIT')));
    return true;
  });
  assert.ok(Date.now() - start < 6000);
  assert.ok((await c.events()).filter(e => e.type === 'launch').every(e => !alive(e.pid)));
});

test('Windows npm shims are resolved to Node without a shell', { skip: process.platform !== 'win32' }, async t => {
  const c = await context(t);
  const shim = join(c.root, 'mystery.cmd');
  const script = join(c.root, 'entry.mjs');
  await copyFile(fixture, script);
  await writeFile(shim, '@ECHO off\r\nSET "_prog=node"\r\n"%_prog%" "%dp0%\\entry.mjs" %*\r\n');
  const resolved = await resolveCommand(shim, ['flag', c.log]);
  assert.equal(resolved.command.toLowerCase(), process.execPath.toLowerCase());
  assert.deepEqual(resolved.prefixArgs, [script, 'flag', c.log]);
  await c.manager.add('npm-agent', { command: shim, prefixArgs: ['flag', c.log] });
  const unsupported = join(c.root, 'other.cmd');
  await writeFile(unsupported, '@ECHO off\r\nECHO unsafe launcher\r\n');
  await assert.rejects(resolveCommand(unsupported), { code: 'UNSUPPORTED_LAUNCHER' });
});

test('CLI manages the same user profiles used by the library', async t => {
  const c = await context(t);
  const args = ['add', 'terminal', '--command', process.execPath, '--prefix-args', JSON.stringify(c.launch('flag').prefixArgs), '--json'];
  assert.equal(JSON.parse((await c.cli(args)).stdout).name, 'terminal');
  assert.equal((await c.manager.get('terminal')).verification.status, 'initialize-passed');
  assert.equal(JSON.parse((await c.cli(['list', '--json'])).stdout)[0].name, 'terminal');
  assert.equal(JSON.parse((await c.cli(['check', 'terminal', '--json'])).stdout).verification.status, 'initialize-passed');
  await c.cli(['remove', 'terminal']);
  assert.deepEqual(await c.manager.list(), []);
  await assert.rejects(c.cli(['show', 'terminal', '--json']), cause => {
    assert.equal(JSON.parse(cause.stderr).error.code, 'PROFILE_NOT_FOUND'); return true;
  });
});

test('a host can select only an offered permission option', async t => {
  const c = await context(t);
  await c.manager.add('permissions', { ...c.launch('flag'), acpArgs: ['--acp'], verify: false });
  for (const choice of ['yes', 'invented', null]) {
    const client = await c.manager.connect('permissions', { cwd: c.root, onPermission: async () => choice });
    c.clients.push(client);
    await client.prompt('permission');
    await client.close();
  }
  const replies = (await c.events()).filter(e => e.message?.id === 'approval').map(e => e.message.result.outcome);
  assert.deepEqual(replies, [{ outcome: 'selected', optionId: 'yes' }, { outcome: 'cancelled' }, { outcome: 'cancelled' }]);
});

test('closing a connection aborts its pending host permission request', async t => {
  const c = await context(t);
  await c.manager.add('permissions', { ...c.launch('flag'), acpArgs: ['--acp'], verify: false });
  let notify;
  const requested = new Promise(resolveRequest => { notify = resolveRequest; });
  let signal;
  const client = await c.manager.connect('permissions', { cwd: c.root, onPermission: (_, options) => {
    signal = options.signal; notify(); return new Promise(() => {});
  } });
  c.clients.push(client);
  const prompt = client.prompt('permission');
  const rejection = assert.rejects(prompt, { code: 'CLOSED' });
  await requested;
  await client.close();
  await rejection;
  assert.equal(signal.aborted, true);
});

test('explicit advertised authentication works, and discovery never authenticates', async t => {
  const c = await context(t);
  await c.manager.add('login', c.launch('auth'));
  assert.deepEqual((await c.events()).filter(e => e.type === 'rpc').map(e => e.message.method), ['initialize']);
  await assert.rejects(c.manager.connect('login', { cwd: c.root }), { code: 'REMOTE_ERROR' });
  const client = await c.manager.connect('login', { cwd: c.root, authMethodId: 'login' });
  c.clients.push(client);
  assert.equal(client.initialization.authMethods[0].id, 'login');
  assert.equal((await client.prompt('test')).stopReason, 'end_turn');
});
