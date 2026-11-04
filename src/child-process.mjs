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

export async function stopProcess(child) {
  if (child.pid) {
    if (process.platform === 'win32') {
      if (child.exitCode === null && child.signalCode === null) {
        const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
        await new Promise(resolveStop => {
          const finish = () => { clearTimeout(timer); resolveStop(); };
          const timer = setTimeout(() => { killer.kill(); finish(); }, 1500);
          killer.once('error', finish); killer.once('exit', finish);
        });
      }
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
    }
  }
  try { await waitForExit(child, 1500); }
  finally { child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); }
}
