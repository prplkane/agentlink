import { version } from './version.mjs';
import { spawn } from 'node:child_process';
import { AcpFrames } from './wire.mjs';
import { finishCommand } from './child-process.mjs';
import { error } from './profiles.mjs';
import { describeOptions, sessionSelections } from './session-options.mjs';
import { codexKey, historyKey, SessionHistory } from './session-history.mjs';

const maxMessageBytes = 1024 * 1024;

// Discovery stops after initialize. Inspection reads options directly when the
// peer supports it. Checking a different model or effort needs a disposable session.
export async function probeAcp(launch, { cwd, env = process.env, defaults, timeoutMs = 3000, signal } = {}) {
  signal?.throwIfAborted();
  const child = spawn(launch.command, [...launch.prefixArgs, ...launch.acpArgs], {
    cwd, env: { ...env, ...launch.env }, shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']
  });
  let timer, abort, history, finishing = false;
  const send = frame => {
    if (child.stdin.destroyed || child.stdin.writableEnded) return false;
    child.stdin.write(frame);
    return true;
  };
  try {
    return await new Promise((resolve, reject) => {
      let pending, sessionId, selections, protocolVersion, sequence = 0;
      const request = (method, params) => {
        pending = method;
        const message = { jsonrpc: '2.0', id: ++sequence, method, params };
        const source = JSON.stringify(message);
        send((method === 'session/new' ? history.prepare(message, source).toString() : source) + '\n');
      };
      timer = setTimeout(() => reject(defaults ? error('OPTIONS_TIMEOUT', 'ACP option inspection timed out.') :
        error('INITIALIZE_TIMEOUT', 'ACP initialization timed out.')), timeoutMs);
      abort = () => reject(error('CANCELLED', 'ACP probe cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      const frames = new AcpFrames({ maxMessageBytes, onMessage(message, source) {
        if (message.method) {
          if (defaults && Object.hasOwn(message, 'id')) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id,
            error: { code: -32601, message: 'Client operations are unavailable during option inspection.' } }) + '\n');
          return;
        }
        const annotated = history?.agentMessage(message, source);
        if (finishing || annotated === null || message.id !== sequence) return;
        if (annotated) message = JSON.parse(annotated.toString());
        if (message.error) {
          if (annotated) return reject(error(message.error.data.code, message.error.message));
          reject(Object.assign(error(pending === 'initialize' ? 'INITIALIZE_REJECTED' : 'OPTIONS_REJECTED',
            message.error.message || 'Agent rejected ' + pending + '.'), {
            remoteCode: message.error.code
          }));
          return;
        }
        const value = message.result;
        if (pending !== 'initialize') {
          if (pending === 'session/options') return resolve(describeOptions(value?.configOptions));
          if (pending === 'session/new') {
            sessionId = value?.sessionId;
            if (typeof sessionId !== 'string' || !sessionId) throw error('PROTOCOL_ERROR', 'Agent did not return a session ID.');
            selections = sessionSelections(value.configOptions, defaults, protocolVersion);
          }
          // Keep consuming the pipe after a rejected choice so an owned archive
          // can still receive its acknowledgement during teardown.
          try {
            const next = selections.next(value?.configOptions);
            if (next.done) resolve(describeOptions(next.value));
            else request('session/set_config_option', { sessionId, ...next.value });
          } catch (cause) { reject(cause); }
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
          const sessionCaps = protocolVersion === 2 ? capabilities.session : capabilities.sessionCapabilities;
          if (sessionCaps?.options && !Object.keys(defaults).length) return request('session/options', { cwd });
          history = new SessionHistory(value, send, () => {}, maxMessageBytes,
            { warn: detail => process.emitWarning(detail, { code: 'SESSION_HISTORY_UNCONFIRMED' }) });
          return request('session/new', { cwd, mcpServers: [], _meta: { [historyKey]: { mode: 'prefer-ephemeral' } } });
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
      const info = { name: 'agentlink-discovery', version };
      const capabilities = defaults ? { _meta: { [codexKey]: { version: 1 } } } : {};
      request('initialize', defaults && launch.protocolVersion === 1
        ? { protocolVersion: 1, clientCapabilities: capabilities, clientInfo: info }
        : { protocolVersion: 2, capabilities, info });
    });
  } finally {
    finishing = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await history?.disconnect();
    history?.dispose();
    await finishCommand(child);
  }
}
