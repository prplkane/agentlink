import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import { basename } from 'node:path';
import { probeAcp } from '../src/probe.mjs';
import { fixture } from './support.mjs';

// Substitute the termination step only for the single fixture spawned by
// this probe. Always reap the real child, even if the old behavior throws.
function controlStop(t, delay) {
  const spawn = childProcess.spawn, kill = process.kill.bind(process);
  let child;
  t.mock.method(childProcess, 'spawn', (command, args, options) => {
    if (args[0] === fixture) {
      child = spawn(command, args, options);
      return child;
    }
    if (basename(command).toLowerCase() === 'taskkill.exe' && args[1] === String(child?.pid)) {
      const script = delay ? 'setTimeout(() => { const [command, ...args] = process.argv.slice(2); ' +
        'process.exit(require("node:child_process").spawnSync(command, args, {windowsHide:true}).status ?? 1); ' +
        '}, Number(process.argv[1]));' : 'process.exit(1)';
      return spawn(process.execPath, ['-e', script, String(delay), command, ...args], options);
    }
    return spawn(command, args, options);
  });
  if (process.platform !== 'win32') t.mock.method(process, 'kill', (pid, signal) =>
    pid === -child?.pid && signal === 'SIGKILL' ? true : kill(pid, signal));
  syncBuiltinESMExports();
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      // The command released its handle after the simulated stop failure.
      // The test owns the final reap and must keep Node alive until exit.
      child.ref();
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
  });
  return () => child.pid;
}

const launch = { command: process.execPath, prefixArgs: [fixture], acpArgs: [] };

test('a completed initialize survives a stop timeout and reports the owned PID', async t => {
  const pid = controlStop(t, 0);
  const warnings = t.mock.method(process, 'emitWarning', () => {});
  const result = await probeAcp(launch);
  assert.equal(result.status, 'initialize-passed');
  const [message, options] = warnings.mock.calls[0].arguments;
  assert.equal(options.code, 'PROCESS_STOP_FAILED');
  assert.ok(message.includes('PID ' + pid() + ':'));
});

test('a slow Windows tree stop is allowed to finish after the old cutoff',
  { skip: process.platform !== 'win32' }, async t => {
    controlStop(t, 1800);
    const warnings = t.mock.method(process, 'emitWarning', () => {});
    assert.equal((await probeAcp(launch)).status, 'initialize-passed');
    assert.equal(warnings.mock.callCount(), 0);
  });
