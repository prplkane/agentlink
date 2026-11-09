import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setup, fixture, npmFixture } from './support.mjs';
import { manifestSpec } from '../src/bridges.mjs';
import { AgentRuntime } from '../src/runtime.mjs';

test('failed profile validation, saving and bridge publication preserve shared state', async t => {
  const c = await setup(t);
  const spec = { kind: 'binary', version: '1.0.0', url: fixture, bin: 'agent.mjs' };
  await c.manager.installBridge('engine', spec, { offline: true });
  await c.manager.add('work', { bridge: 'engine' });
  const original = await c.manager.bridges.get('engine'), profile = await c.manager.get('work');
  const replacement = { ...spec, version: '2.0.0' };
  for (const invalid of [{ helpArgs: [] }, { acpArgs: [1] }, { prefixArgs: ['\0'] }, { timeoutMs: 0 }, { provider: 'unknown' }]) {
    await assert.rejects(c.manager.add('new', { bridge: 'engine', spec: replacement, offline: true, ...invalid }));
    assert.deepEqual(await c.manager.bridges.get('engine'), original);
    await assert.rejects(c.manager.get('new'), { code: 'PROFILE_NOT_FOUND' });
  }
  const saved = c.manager.store.save.bind(c.manager.store);
  c.manager.store.save = async () => { throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); };
  try {
    await assert.rejects(c.manager.update('work', { bridge: 'engine', spec: replacement, offline: true }), { code: 'ENOSPC' });
  } finally { c.manager.store.save = saved; }
  assert.deepEqual(await c.manager.get('work'), profile);
  assert.deepEqual(await c.manager.bridges.get('engine'), original);

  const publish = c.manager.bridges.publish.bind(c.manager.bridges);
  let entered, allow;
  const publicationEntered = new Promise(resolve => { entered = resolve; });
  const allowPublication = new Promise(resolve => { allow = resolve; });
  c.manager.bridges.publish = async () => {
    entered(); await allowPublication;
    throw Object.assign(new Error('Publication failed'), { code: 'EIO' });
  };
  try {
    const updating = assert.rejects(c.manager.update('work', { bridge: 'engine', spec: replacement, offline: true }), { code: 'EIO' });
    await publicationEntered;
    const connection = new AgentRuntime({ home: c.home }).acquire('work');
    allow();
    await updating;
    const { launch, release } = await connection;
    assert.deepEqual(launch.prefixArgs, original.launch.prefixArgs);
    await release();
    await assert.rejects(c.manager.add('new', { bridge: 'engine', spec: replacement, offline: true }), { code: 'EIO' });
  } finally { allow(); c.manager.bridges.publish = publish; }
  assert.deepEqual(await c.manager.get('work'), profile);
  assert.deepEqual(await c.manager.bridges.get('engine'), original);
  await assert.rejects(c.manager.get('new'), { code: 'PROFILE_NOT_FOUND' });
  assert.deepEqual(await readdir(c.manager.bridges.installations), [original.installKey]);
  assert.equal((await c.manager.check('work')).status, 'initialize-passed');
});

test('external runtime does not create or wait for a lease lock', async t => {
  const c = await setup(t); await c.profile();
  await writeFile(join(c.home, 'leases.lock'), JSON.stringify({ pid: process.pid }));
  const client = await c.client();
  assert.equal((await client.initialize()).agentInfo.name, 'offline-agent');
  await assert.rejects(access(c.manager.bridges.leases), { code: 'ENOENT' });
});

test('an external launch inside a managed installation keeps its running version leased', async t => {
  const c = await setup(t);
  const record = await c.manager.installBridge('engine', { kind: 'binary', version: '1', url: fixture, bin: 'agent.mjs' }, { offline: true });
  await c.manager.add('external', { ...record.launch, external: true });
  const { release } = await c.manager.acquire('external');
  try {
    await c.manager.remove('external'); await c.manager.removeBridge('engine');
    assert.deepEqual((await c.manager.pruneBridges()).removed, []);
  } finally { await release(); }
  assert.deepEqual((await c.manager.pruneBridges()).removed, [record.installKey]);
});

test('Windows external references retain installations and leases across path casing', { skip: process.platform !== 'win32' }, async t => {
  const c = await setup(t);
  const record = await c.manager.installBridge('engine', { kind: 'binary', version: '1', url: fixture, bin: 'agent.mjs' }, { offline: true });
  const launch = { ...record.launch, prefixArgs: record.launch.prefixArgs.map(argument =>
    argument.replace(record.installKey, record.installKey.toUpperCase())) };
  await c.manager.add('external', { ...launch, external: true });
  await c.manager.removeBridge('engine');
  assert.deepEqual((await c.manager.pruneBridges()).removed, [], 'the saved external profile retains its installation');
  await access(launch.prefixArgs[0]);
  const { release } = await c.manager.acquire('external');
  try {
    await c.manager.remove('external');
    assert.deepEqual((await c.manager.pruneBridges()).removed, [], 'the acquired launch retains a canonical installation lease');
  } finally { await release(); }
  assert.deepEqual((await c.manager.pruneBridges()).removed, [record.installKey]);
});

test('offline managed npm bridge is shared, updated centrally and retains a live old version', async t => {
  const c = await setup(t);
  const one = await npmFixture(c.root, '1.0.0');
  const two = await npmFixture(c.root, '2.0.0');
  const original = await c.manager.installBridge('engine', one, { offline: true });
  await c.manager.add('first', { bridge: 'engine' });
  await c.manager.add('second', { bridge: 'engine' });
  const repeated = await c.manager.installBridge('another-name', one, { offline: true });
  assert.equal(repeated.installKey, original.installKey);
  assert.equal((await readdir(c.manager.bridges.installations)).length, 1);
  await c.manager.removeBridge('another-name');
  const old = await c.client('first'); await old.initialize();
  const session = await old.session('old-project');
  const updated = await c.manager.updateBridge('engine', { spec: two, offline: true });
  assert.notEqual(updated.installKey, original.installKey);
  assert.deepEqual((await c.manager.pruneBridges()).removed, []);
  const fresh = await c.client('second');
  assert.equal((await fresh.initialize()).agentInfo.version, '2.0.0');
  assert.equal((await old.prompt(session.sessionId, 'still running')).version, '1.0.0');
  await old.close();
  assert.deepEqual((await c.manager.pruneBridges()).removed, [original.installKey]);
  assert.equal((await c.manager.get('first')).bridge.id, 'engine');
  await c.manager.updateBridge('engine', { spec: one, offline: true });
  const rolledBack = await c.client('first');
  assert.equal((await rolledBack.initialize()).agentInfo.version, '1.0.0');
  assert.equal((await fresh.request('_fixture/echo', { alive: true })).alive, true);
});

test('failed installation and failed ACP validation preserve the working bridge and profiles', async t => {
  const c = await setup(t);
  const good = await npmFixture(c.root, '1.0.0');
  await c.manager.installBridge('engine', good, { offline: true });
  await c.manager.add('work', { bridge: 'engine' });
  const before = await readFile(c.manager.bridges.path('engine'), 'utf8');
  const profile = await readFile(c.manager.store.path('work'), 'utf8');
  const broken = await npmFixture(c.root, '2.0.0', { broken: true });
  await assert.rejects(c.manager.updateBridge('engine', { spec: broken, offline: true }));
  assert.equal(await readFile(c.manager.bridges.path('engine'), 'utf8'), before);
  assert.equal(await readFile(c.manager.store.path('work'), 'utf8'), profile);
  await assert.rejects(c.manager.updateBridge('engine', { spec: { ...good, version: '3.0.0' }, offline: true }), { code: 'PACKAGE_MISMATCH' });
  assert.equal((await readdir(c.manager.bridges.installations)).length, 1);
  assert.equal((await c.manager.check('work')).status, 'initialize-passed');
  const replacement = await npmFixture(c.root, '3.0.0');
  await assert.rejects(c.manager.update('work', { bridge: 'engine', spec: replacement, offline: true, launchEnv: { FIXTURE_MODE: 'bad-install' } }));
  assert.equal(await readFile(c.manager.bridges.path('engine'), 'utf8'), before);
  assert.equal(await readFile(c.manager.store.path('work'), 'utf8'), profile);
});

test('managed bridge cannot be removed while referenced; explicit pruning frees unused installs', async t => {
  const c = await setup(t);
  const spec = await npmFixture(c.root, '1.0.0');
  await c.manager.installBridge('engine', spec, { offline: true });
  await c.manager.add('work', { bridge: 'engine' });
  await assert.rejects(c.manager.removeBridge('engine'), { code: 'BRIDGE_IN_USE' });
  await c.manager.remove('work');
  await c.manager.removeBridge('engine');
  const pruned = await c.manager.pruneBridges({ cache: true });
  assert.equal(pruned.removed.length, 1);
  assert.equal(pruned.cacheCleared, true);
  await assert.rejects(access(join(c.home, 'cache')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(c.manager.bridges.installations), []);
});

test('installation through CLI, local manifest import and configuration reuse require no SDK', async t => {
  const c = await setup(t);
  const spec = await npmFixture(c.root, '1.0.0');
  const installed = JSON.parse((await c.command(['bridge', 'install', 'engine', '--package', spec.package,
    '--version', spec.version, '--source', spec.source, '--offline', '--json'])).stdout);
  assert.equal(installed.verification.status, 'initialize-passed');
  await c.command(['add', 'work', '--bridge', 'engine', '--json']);
  await assert.rejects(c.command(['add', 'wrong-version', '--bridge', 'engine', '--version', '2.0.0']), cause => /VERSION_MISMATCH/.test(cause.stderr));
  await assert.rejects(c.command(['bridge', 'list', '--version', '2.0.0']), cause => /not supported/.test(cause.stderr));
  await assert.rejects(c.manager.get('wrong-version'), { code: 'PROFILE_NOT_FOUND' });
  const caller = await c.client('work');
  assert.equal((await caller.initialize()).agentInfo.version, '1.0.0');
  const source = join(c.root, 'entry.json');
  await writeFile(source, JSON.stringify({ id: 'example', version: '1.0.0',
    distribution: { npx: { package: 'some-bridge@1.0.0', args: ['acp'] } } }));
  const mapped = await manifestSpec(source, { offline: true });
  assert.deepEqual({ kind: mapped.kind, package: mapped.package, version: mapped.version, args: mapped.args },
    { kind: 'npm', package: 'some-bridge', version: '1.0.0', args: ['acp'] });
  await assert.rejects(manifestSpec(source, { offline: true, version: '2.0.0' }), { code: 'INVALID_MANIFEST' });
  assert.equal(JSON.parse((await c.command(['bridge', 'list', '--json'])).stdout).length, 1);
});

test('an external bridge is never installed or placed under managed ownership', async t => {
  const c = await setup(t);
  await c.manager.add('external', { provider: 'claude', command: process.execPath, prefixArgs: [fixture], external: true });
  const client = await c.client('external');
  await client.initialize();
  assert.deepEqual(await c.manager.bridges.list(), []);
  await assert.rejects(access(c.manager.bridges.installations), { code: 'ENOENT' });
});

test('runtime connection does not wait for an unrelated management operation', async t => {
  const c = await setup(t); await c.profile();
  const lock = join(c.home, 'management.lock');
  await writeFile(lock, JSON.stringify({ pid: process.pid }));
  try {
    const client = await c.client();
    assert.equal((await client.initialize()).agentInfo.name, 'offline-agent');
  } finally { const { unlink } = await import('node:fs/promises'); await unlink(lock); }
});

test('pending or missing version cannot silently fetch a package in offline mode', async t => {
  const c = await setup(t);
  await assert.rejects(c.manager.installBridge('unknown', { kind: 'npm', package: 'agentlink-not-installed', version: 'latest' },
    { offline: true }), { code: 'OFFLINE' });
  assert.deepEqual(await c.manager.bridges.list(), []);
});
