import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { AcpFrames } from './wire.mjs';
import { stopProcess } from './child-process.mjs';
import { error, strings } from './profiles.mjs';
import { authMarker, terminalAuthReply } from './terminal-auth.mjs';
import { member, requestKey, setField, whitespace } from './json-spans.mjs';
import { clientWantsHistory, codexKey, historyKey, SessionHistory } from './session-history.mjs';

// The reply to a session/new that AgentLink could not prepare, for example
// because the profile file was unreadable at that moment. The request ID is
// copied as raw text so large numeric IDs keep their exact bytes.
function sessionSetupError(source, cause) {
  const id = source.slice(...member(source, whitespace(source, 0), 'id'));
  const historyError = ['INVALID_SESSION_HISTORY', 'SESSION_HISTORY_UNSUPPORTED', 'INVALID_REQUEST_ID'].includes(cause.code);
  const detail = { code: historyError ? -32602 : -32603, message: 'AgentLink could not prepare this session: ' + cause.message,
    data: { code: cause.code || 'SESSION_SETUP_FAILED' } };
  return Buffer.from('{"jsonrpc":"2.0","id":' + id + ',"error":' + JSON.stringify(detail) + '}\n');
}

// One process/connection per caller; installed bridges and profiles are shared.
// No initialize, session/new, task, approval, download or discovery is injected.
export async function runGateway(launch, { cwd = process.cwd(), env = process.env,
  input = process.stdin, output = process.stdout, diagnostics = process.stderr,
  signal, readDefaults, extraArgs = [], interactive = Boolean(process.stdin.isTTY),
  maxMessageBytes = 16 * 1024 * 1024, shutdownGraceMs } = {}) {
  if (!strings(extraArgs) || (shutdownGraceMs !== undefined && (!Number.isSafeInteger(shutdownGraceMs) || shutdownGraceMs < 1))) {
    throw new TypeError('Invalid gateway arguments.');
  }
  // A healthy bridge can spend several seconds cleaning up after EOF.
  const eofGraceMs = shutdownGraceMs ?? 5000;
  const pipeGraceMs = shutdownGraceMs ?? 750;
  signal?.throwIfAborted();
  // ACP terminal-auth methods append argv to the configured launch command.
  // Append those bytes to the bridge's base argv, not to management option parsing.
  const terminal = interactive || extraArgs.length > 0;
  const forwardedArgs = extraArgs[0] === authMarker ? extraArgs.slice(1) : extraArgs;
  const child = spawn(launch.command, [...launch.prefixArgs, ...launch.acpArgs, ...forwardedArgs], {
    cwd, env: terminal ? { ...launch.env, ...env } : { ...env, ...launch.env }, shell: false, windowsHide: !terminal,
    detached: process.platform !== 'win32', stdio: terminal ? 'inherit' : ['pipe', 'pipe', 'pipe']
  });
  let failure, inputTimer, history, closing = false;
  const pumps = new AbortController();
  let stopPromise;
  const stop = () => stopPromise ??= stopProcess(child).catch(cause => { failure ??= cause; });
  const fail = cause => {
    if (failure) return;
    failure = cause;
    const halt = () => {
      pumps.abort();
      if (!terminal) output.destroy(); // Interrupt blocked final writes.
      void stop();
    };
    if (!history) return halt();
    input.pause();
    void history.disconnect().finally(halt);
  };
  const aborted = () => fail(error('CANCELLED', 'AgentLink connection was terminated.'));
  signal?.addEventListener('abort', aborted, { once: true });
  const exited = new Promise(resolve => {
    child.once('error', () => { failure ??= error('SPAWN_FAILED', 'Could not start the configured bridge.'); resolve(1); });
    child.once('exit', code => resolve(code ?? 1));
  });
  let outputPump = Promise.resolve();
  let inputPump = Promise.resolve();
  let outputFrames;
  if (!terminal) {
    let defaultsRelay, protocolVersion, refusal, prepared, awaitingHistory = false, outputClosed = false;
    const send = frame => {
      if (closing || child.stdin.destroyed || child.stdin.writableEnded) return false;
      child.stdin.write(frame);
      return true;
    };
    const publish = frame => {
      if (!closing && !outputClosed && !outputFrames.destroyed) outputFrames.push(frame);
    };
    function rejectRequest(source, cause) {
      refusal = sessionSetupError(source, cause);
      diagnostics.write((cause.code || 'SESSION_SETUP_FAILED') + ': ' + cause.message + '\n');
    }
    async function prepareSession(message, source) {
      try {
        if (Object.hasOwn(message.params?._meta ?? {}, historyKey)) {
          if (!history) throw error('SESSION_HISTORY_UNSUPPORTED', 'Per-session history requires ACP v1 negotiation.');
          prepared = history.prepare(message, source);
        }
        const defaults = readDefaults ? await readDefaults() : launch.defaults;
        if (!defaults || !Object.keys(defaults).length) return;
        if (!defaultsRelay) {
          const { SessionDefaults } = await import('./session-defaults.mjs');
          defaultsRelay = new SessionDefaults(send, maxMessageBytes, sessionId => history?.failedSetup(sessionId));
        }
        defaultsRelay.expectSession(message, source, defaults, protocolVersion);
      } catch (cause) {
        // Only this creation fails. The bridge never sees it, and the other
        // sessions on this connection keep running.
        history?.forgetRequest(message, source);
        rejectRequest(source, cause);
      }
    }
    const initializeIds = new Map();
    inputPump = pipeline(input, new AcpFrames({ maxMessageBytes, onMessage(message, source) {
      if (failure) return;
      if (message.method && history?.reserved(message.id)) {
        return rejectRequest(source, error('INVALID_REQUEST_ID', 'This request ID is reserved by the gateway.'));
      }
      if (message.method === 'initialize' && Object.hasOwn(message, 'id')) {
        const wants = clientWantsHistory(message.params);
        // Changing upstream AIR capabilities on a live connection can turn an
        // archive into permanent deletion. A negotiated client initializes once.
        if (history || awaitingHistory || (wants && (protocolVersion || initializeIds.size))) {
          return rejectRequest(source, error('INVALID_SESSION_HISTORY', 'History negotiation requires a fresh connection.'));
        }
        awaitingHistory = wants;
        const air = message.params?.clientCapabilities?._meta?.jetbrains?.air?.capabilities;
        initializeIds.set(requestKey(message.id, source), { wants, airIndex: Array.isArray(air) && air.includes('sessionIndex') });
        if (wants) {
          const upstream = setField(source, ['params', 'clientCapabilities', '_meta', historyKey], undefined);
          prepared = Buffer.from(setField(upstream, ['params', 'clientCapabilities', '_meta', codexKey], { version: 1 }));
        }
      } else if (message.method === 'session/new' && Object.hasOwn(message, 'id')) {
        return prepareSession(message, source);
      } else if (history && message.method) {
        return history.beforeClient(message, source).catch(cause => rejectRequest(source, cause));
      }
    }, mapMessage() {
      const frame = prepared;
      prepared = undefined;
      if (failure) return null;
      if (!refusal) return frame;
      publish(refusal);
      refusal = undefined;
      return null;
    } }), child.stdin, { end: false, signal: pumps.signal }).then(async () => {
      await history?.disconnect();
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      if (!closing && child.exitCode === null && child.signalCode === null) {
        inputTimer = setTimeout(() => { void stop(); }, eofGraceMs);
      }
    }, cause => {
      if (closing) return;
      // A normally exiting bridge can close its stdin before the exit event.
      // Give it time to finish and drain stdout instead of destroying its reply.
      if (['EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_DESTROYED'].includes(cause.code)) {
        if (child.exitCode === null && child.signalCode === null) inputTimer = setTimeout(() => fail(cause), pipeGraceMs);
      } else fail(cause);
    });
    outputFrames = new AcpFrames({ maxMessageBytes, async onEnd() {
      await history?.endOutput();
      outputClosed = true;
    }, mapMessage(message, source) {
      const key = !message.method && initializeIds.size ? requestKey(message.id, source) : undefined;
      if (initializeIds.has(key)) {
        const { wants, airIndex } = initializeIds.get(key);
        initializeIds.delete(key);
        if (wants) awaitingHistory = false;
        protocolVersion = message.result?.protocolVersion;
        const auth = terminalAuthReply(message, source);
        const caps = message.result?.agentCapabilities;
        if (wants && protocolVersion === 1 && (caps == null || typeof caps === 'object' && !Array.isArray(caps))) {
          history ??= new SessionHistory(message.result, send, body => publish(Buffer.concat([body, Buffer.from('\n')])), maxMessageBytes,
            { requestedAirIndex: airIndex, warn: detail => diagnostics.write('SESSION_HISTORY_UNCONFIRMED: ' + detail + '\n') });
          return history.capability(auth?.toString() ?? source);
        }
        return auth;
      }
      const annotated = history?.agentMessage(message, source);
      if (annotated === null || !defaultsRelay) return annotated;
      if (annotated) { source = annotated.toString(); message = JSON.parse(source); }
      const configured = defaultsRelay.agentMessage(message, source);
      return configured === undefined ? annotated : configured;
    } });
    outputPump = pipeline(child.stdout, outputFrames, output, { end: false, signal: pumps.signal })
      .catch(cause => { if (!closing) fail(cause); });
    child.stderr.pipe(diagnostics, { end: false });
    child.stderr.on('error', fail);
    diagnostics.on('error', fail);
  }
  let flushTimer;
  try {
    const exitCode = await exited;
    clearTimeout(inputTimer);
    // Drain final responses even when the client reads slowly. The grace period
    // only limits idle pipes retained by a descendant after its parent exited.
    await new Promise(resolve => {
      let done = false;
      const finish = () => { done = true; clearTimeout(flushTimer); resolve(); };
      const idle = () => {
        if (done) return;
        if (!failure && !output.destroyed && (output.writableLength || output.writableNeedDrain || child.stdout?.readableLength ||
            outputFrames?.readableLength || outputFrames?.writableLength)) {
          flushTimer = setTimeout(idle, pipeGraceMs);
        } else finish();
      };
      // end:false leaves the caller's stream open and may resolve before its
      // final write callback; also wait for that queued output to drain.
      outputPump.then(() => { if (failure || !output.writableLength || output.destroyed) finish(); });
      flushTimer = setTimeout(idle, pipeGraceMs);
    });
    if (failure) throw failure;
    return { exitCode };
  } finally {
    closing = true;
    history?.dispose();
    clearTimeout(inputTimer); clearTimeout(flushTimer);
    signal?.removeEventListener('abort', aborted);
    diagnostics.off('error', fail);
    await stop();
    if (!terminal) {
      pumps.abort();
      input.destroy();
      await Promise.allSettled([inputPump, outputPump]);
    }
  }
}
