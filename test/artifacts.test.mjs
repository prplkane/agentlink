import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setup, fixture } from './support.mjs';
import { tarGz, zip } from './archive-helpers.mjs';
import { extractArtifact, readArtifact } from '../src/artifacts.mjs';
import { resolveCommand } from '../src/process.mjs';

for (const format of ['file', 'tar.gz', 'zip']) test('managed binary ' + format + ' installs and verifies entirely offline', async t => {
  const c = await setup(t);
  const source = await readFile(fixture);
  const bytes = format === 'file' ? source : (format === 'zip' ? zip : tarGz)([['bin/agent.mjs', source]]);
  const artifact = join(c.root, 'bridge.' + (format === 'file' ? 'mjs' : format));
  await writeFile(artifact, bytes);
  const target = (process.platform === 'win32' ? 'windows' : process.platform) + '-' +
    ({ x64: 'x86_64', arm64: 'aarch64' }[process.arch] || process.arch);
  const manifest = join(c.root, 'agent.json');
  await writeFile(manifest, JSON.stringify({ id: 'fixture', version: '1.0.0', distribution: { binary: {
    [target]: { archive: pathToFileURL(artifact).href, sha256: createHash('sha256').update(bytes).digest('hex'),
      cmd: format === 'file' ? './agent.mjs' : './bin/agent.mjs', args: [] }
  } } }));
  await c.command(['add', 'binary', '--manifest', manifest, '--offline', '--json']);
  const client = await c.client('binary');
  assert.equal((await client.initialize()).agentInfo.name, 'offline-agent');
  const record = await c.manager.bridges.get('binary');
  assert.equal(record.spec.kind, 'binary');
  const original = await readFile(c.manager.bridges.path('binary'), 'utf8');
  await assert.rejects(c.manager.updateBridge('binary', { spec: { ...record.spec, version: '2.0.0', sha256: '0'.repeat(64) },
    offline: true }), { code: 'INTEGRITY_MISMATCH' });
  assert.equal(await readFile(c.manager.bridges.path('binary'), 'utf8'), original);
});

test('archive traversal, links, duplicate files, corruption and expansion limits are rejected', async t => {
  const c = await setup(t);
  const samples = [
    ['tar.gz', tarGz([['../escaped.txt', 'bad']])],
    ['tar.gz', tarGz([['linked', '', '2']])],
    ['zip', zip([['../escaped.txt', 'bad']])],
    ['zip', zip([['linked', 'target', 0o120777]])],
    ['zip', zip([['same.txt', 'one'], ['same.txt', 'two']])],
    ['zip', zip([['a.txt', 'corruption']]).subarray(0, 50)],
    ['zip', zip([['big.txt', 'x'.repeat(100)]])]
  ];
  for (let index = 0; index < samples.length; index++) {
    const [format, bytes] = samples[index], root = join(c.root, 'extract-' + index);
    await mkdir(root);
    await assert.rejects(extractArtifact(bytes, root, format, { maxBytes: 50 }));
  }
  await assert.rejects(access(join(c.root, 'escaped.txt')), { code: 'ENOENT' });
});

test('offline mode and file size limits prevent unintended artifact downloads', async t => {
  const c = await setup(t), path = join(c.root, 'oversized');
  await writeFile(path, 'larger than limit');
  await assert.rejects(readArtifact(pathToFileURL(path).href, { maxBytes: 2 }), { code: 'DOWNLOAD_LIMIT' });
  await assert.rejects(readArtifact('https://example.invalid/bridge', { offline: true }), { code: 'OFFLINE' });
  await assert.rejects(readArtifact('http://example.invalid/bridge'), { code: 'INVALID_SOURCE' });
});

test('root entries cannot bypass expanded archive byte or entry limits', async t => {
  const c = await setup(t);
  for (const format of ['zip', 'tar.gz']) {
    const archive = format === 'zip' ? zip : tarGz;
    const root = join(c.root, format); await mkdir(root);
    await assert.rejects(extractArtifact(archive([['.', '123456'], ['./', '123456'], ['kept.txt', 'ab']]),
      root, format, { maxBytes: 8 }), { code: 'INVALID_ARCHIVE' });
    const directory = format === 'zip' ? 0o40755 : '5';
    await assert.rejects(extractArtifact(archive([['./', '', directory], ['./', '', directory]]),
      root, format, { maxFiles: 1 }));
    await extractArtifact(archive([['./', '', directory], ['kept.txt', 'ab']]), root, format, { maxBytes: 2 });
    assert.equal(await readFile(join(root, 'kept.txt'), 'utf8'), 'ab');
  }
});

test('artifact redirects are bounded and cannot downgrade to HTTP', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url.href); assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'http://example.invalid/unsafe' } });
  });
  await assert.rejects(readArtifact('https://example.invalid/start'), { code: 'INVALID_SOURCE' });
  assert.deepEqual(requests, ['https://example.invalid/start']);
  t.mock.restoreAll(); requests.length = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url.href);
    return new Response(null, { status: 302, headers: { location: '/loop' } });
  });
  await assert.rejects(readArtifact('https://example.invalid/start'), { code: 'DOWNLOAD_FAILED' });
  assert.equal(requests.length, 6);
  t.mock.restoreAll(); requests.length = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url.href);
    return requests.length === 1 ? new Response(null, { status: 307, headers: { location: '/release' } }) : new Response('verified');
  });
  assert.equal((await readArtifact('https://example.invalid/start')).toString(), 'verified');
  assert.deepEqual(requests, ['https://example.invalid/start', 'https://example.invalid/release']);
});

test('Python bridge installs from a local wheel into a shared pinned environment', async t => {
  try { await resolveCommand(process.platform === 'win32' ? 'python' : 'python3'); }
  catch { t.skip('Python is optional and is not installed on this host.'); return; }
  const c = await setup(t);
  const meta = 'agentlink_offline_py-1.0.0.dist-info/';
  const code = 'import json,sys\n' +
    'def main():\n' +
    ' for line in sys.stdin:\n' +
    '  m=json.loads(line)\n' +
    '  if m.get("method")=="initialize":\n' +
    '   v=m["params"]["protocolVersion"]\n' +
    '   print(json.dumps({"jsonrpc":"2.0","id":m["id"],"result":{"protocolVersion":v,("capabilities" if v==2 else "agentCapabilities"):{},("info" if v==2 else "agentInfo"):{"name":"python-fixture","version":"1.0.0"}}}),flush=True)\n';
  const entries = [
    ['agentlink_offline_py/__init__.py', code],
    [meta + 'METADATA', 'Metadata-Version: 2.1\nName: agentlink-offline-py\nVersion: 1.0.0\n'],
    [meta + 'WHEEL', 'Wheel-Version: 1.0\nGenerator: offline-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n'],
    [meta + 'entry_points.txt', '[console_scripts]\nfixture-python = agentlink_offline_py:main\n']
  ];
  entries.push([meta + 'RECORD', [...entries.map(([name]) => name + ',,'), meta + 'RECORD,,'].join('\n') + '\n']);
  const wheel = join(c.root, 'agentlink_offline_py-1.0.0-py3-none-any.whl');
  await writeFile(wheel, zip(entries));
  await c.manager.installBridge('python', { kind: 'python', package: 'agentlink-offline-py', version: '1.0.0', source: wheel }, { offline: true });
  await c.manager.add('python', { bridge: 'python' });
  const client = await c.client('python');
  assert.equal((await client.initialize()).agentInfo.name, 'python-fixture');
});
