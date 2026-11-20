import { version } from './version.mjs';
import { spawn } from 'node:child_process';
import { AcpFrames } from './wire.mjs';
import { finishCommand } from './child-process.mjs';
import { error } from './profiles.mjs';
import { describeOptions, sessionSelections } from './session-options.mjs';

// Discovery stops after initialize. Explicit option inspection continues into
// one disposable session and never sends a prompt.
export async function probeAcp(launch, { cwd, env = process.env, defaults, timeoutMs = 3000, signal } = {}) {
  signal?.throwIfAborted();
  const child = spawn(launch.command, [...launch.prefixArgs, ...launch.acpArgs], {
    cwd, env: { ...env, ...launch.env }, shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']
  });
  let timer, abort;
  try {
    return await new Promise((resolve, reject) => {
      let pending, sessionId, selections, protocolVersion, sequence = 0;
      const request = (method, params) => {
        pending = method;
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }) + '\n');
      };
      timer = setTimeout(() => reject(defaults ? error('OPTIONS_TIMEOUT', 'ACP option inspection timed out.') :
        error('INITIALIZE_TIMEOUT', 'ACP initialization timed out.')), timeoutMs);
      abort = () => reject(error('CANCELLED', 'ACP probe cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      const frames = new AcpFrames({ maxMessageBytes: 1024 * 1024, onMessage(message) {
        if (message.method) {
          if (defaults && Object.hasOwn(message, 'id')) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id,
            error: { code: -32601, message: 'Client operations are unavailable during option inspection.' } }) + '\n');
          return;
        }
        if (message.id !== sequence) return;
        if (message.error) {
          reject(Object.assign(error(pending === 'initialize' ? 'INITIALIZE_REJECTED' : 'OPTIONS_REJECTED',
            message.error.message || 'Agent rejected ' + pending + '.'), {
            remoteCode: message.error.code
          }));
          return;
        }
        const value = message.result;
        if (pending !== 'initialize') {
          if (pending === 'session/new') {
            sessionId = value?.sessionId;
            if (typeof sessionId !== 'string' || !sessionId) throw error('PROTOCOL_ERROR', 'Agent did not return a session ID.');
            selections = sessionSelections(value.configOptions, defaults, protocolVersion);
          }
          const next = selections.next(value?.configOptions);
          if (next.done) resolve(describeOptions(next.value));
          else request('session/set_config_option', { sessionId, ...next.value });
          return;
        }
        const capabilities = value?.protocolVersion === 2 ? value.capabilities : value?.agentCapabilities;
        const info = value?.protocolVersion === 2 ? value.info : value?.agentInfo;
        if (!value || ![1, 2].includes(value.protocolVersion) || !capabilities ||
            typeof capabilities !== 'object' || Array.isArray(capabilities)) {
          reject(error('UNSUPPORTED_PROTOCOL', 'Agent did not negotiate ACP v1 or v2.'));
          return;
        }
        const agentInfo = {};
        for (const field of ['name', 'version', 'title']) {
          if (typeof info?.[field] === 'string') agentInfo[field] = info[field].slice(0, 256);
        }
        if (defaults) {
          protocolVersion = value.protocolVersion;
          return request('session/new', { cwd, mcpServers: [] });
        }
        resolve({ status: 'initialize-passed', checkedAt: new Date().toISOString(),
          protocolVersion: value.protocolVersion, agentInfo, capabilities,
          authMethods: Array.isArray(value.authMethods) ? value.authMethods : [] });
      } });
      frames.resume();
      frames.on('error', reject);
      child.stdout.pipe(frames);
      child.stderr.resume();
      child.stdout.on('error', reject);
      child.stdin.on('error', cause => { if (cause.code !== 'EPIPE') reject(cause); });
      child.once('error', () => reject(error('SPAWN_FAILED', 'Could not start the configured ACP executable.')));
      child.once('exit', code => reject(error('PROCESS_EXIT', 'Agent exited during the ACP probe (' + code + ').')));
      request('initialize', { protocolVersion: 2, capabilities: {}, info: { name: 'agentlink-discovery', version } });
    });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); await finishCommand(child); }
}
