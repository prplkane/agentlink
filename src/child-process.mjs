import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { error } from './profiles.mjs';

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return Promise.resolve();
  return new Promise((resolveExit, reject) => {
    const finish = () => { clearTimeout(timer); child.off('exit', finish); resolveExit(); };
    const timer = setTimeout(() => { child.off('exit', finish); reject(error('PROCESS_STOP_FAILED', 'Child process did not exit.')); }, timeoutMs);
    child.once('exit', finish);
  });
}

async function stopTree(child) {
  if (child.pid) {
    if (process.platform === 'win32') {
      if (child.exitCode === null && child.signalCode === null) {
        const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
        await new Promise(resolveStop => {
          const finish = () => { clearTimeout(timer); resolveStop(); };
          // A busy Windows host can take several seconds to start taskkill.
          const timer = setTimeout(() => { killer.kill(); finish(); }, 5000);
          killer.once('error', finish); killer.once('exit', finish);
        });
      }
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
    }
  }
  await waitForExit(child, 1500);
}

export async function stopProcess(child) {
  try { await stopTree(child); }
  finally { child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); }
}

// Management commands have a result of their own. Keep it (including its
// error code) while reporting a separate failure to terminate the owned PID.
export async function finishCommand(child) {
  try { await stopProcess(child); }
  catch (cause) {
    child.unref();
    process.emitWarning('Could not confirm cleanup of child PID ' + child.pid + ': ' + cause.message,
      { code: 'PROCESS_STOP_FAILED' });
  }
}
