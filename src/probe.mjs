import { version } from './version.mjs';
import { spawn } from 'node:child_process';
import { AcpFrames } from './wire.mjs';
import { stopProcess } from './process.mjs';
import { error } from './profiles.mjs';

// Initialization only. Unlike the legacy text client, this probe can negotiate
// both published protocol generations without implementing their prompt flows.
export async function probeAcp(launch, { cwd, env = process.env, timeoutMs = 3000, signal } = {}) {
  signal?.throwIfAborted();
  const child = spawn(launch.command, [...launch.prefixArgs, ...launch.acpArgs], {
    cwd, env: { ...env, ...launch.env }, shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']
  });
  let timer, abort;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(error('INITIALIZE_TIMEOUT', 'ACP initialization timed out.')), timeoutMs);
      abort = () => reject(error('CANCELLED', 'ACP initialization cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      const frames = new AcpFrames({ maxMessageBytes: 1024 * 1024, onMessage(message) {
        if (message.id !== 'agentlink-probe' || message.method) return;
        if (message.error) {
          reject(Object.assign(error('INITIALIZE_REJECTED', message.error.message || 'Agent rejected initialization.'), {
            remoteCode: message.error.code
          }));
          return;
        }
        const value = message.result;
        if (!value || ![1, 2].includes(value.protocolVersion) || !value.agentCapabilities ||
            typeof value.agentCapabilities !== 'object' || Array.isArray(value.agentCapabilities)) {
          reject(error('UNSUPPORTED_PROTOCOL', 'Agent did not negotiate ACP v1 or v2.'));
          return;
        }
        const agentInfo = {};
        for (const field of ['name', 'version', 'title']) {
          if (typeof value.agentInfo?.[field] === 'string') agentInfo[field] = value.agentInfo[field].slice(0, 256);
        }
        resolve({ status: 'initialize-passed', checkedAt: new Date().toISOString(),
          protocolVersion: value.protocolVersion, agentInfo, capabilities: value.agentCapabilities,
          authMethods: Array.isArray(value.authMethods) ? value.authMethods : [] });
      } });
      frames.resume();
      frames.on('error', reject);
      child.stdout.pipe(frames);
      child.stderr.resume();
      child.stdout.on('error', reject);
      child.stdin.on('error', cause => { if (cause.code !== 'EPIPE') reject(cause); });
      child.once('error', () => reject(error('SPAWN_FAILED', 'Could not start the configured ACP executable.')));
      child.once('exit', code => reject(error('PROCESS_EXIT', 'Agent exited during initialization (' + code + ').')));
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'agentlink-probe', method: 'initialize',
        params: { protocolVersion: 2, clientCapabilities: {}, clientInfo: { name: 'agentlink-discovery', version } } }) + '\n');
    });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); await stopProcess(child); }
}
