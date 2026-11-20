import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { AcpFrames } from './wire.mjs';
import { stopProcess } from './child-process.mjs';
import { error, strings } from './profiles.mjs';
import { authMarker, terminalAuthReply } from './terminal-auth.mjs';
import { member, whitespace } from './json-spans.mjs';

// The reply to a session/new that AgentLink could not prepare, for example
// because the profile file was unreadable at that moment. The request ID is
// copied as raw text so large numeric IDs keep their exact bytes.
function sessionSetupError(source, cause) {
  const id = source.slice(...member(source, whitespace(source, 0), 'id'));
  // The request itself was valid, so this is an internal error (-32603), not
  // invalid params. data.code carries the stable AgentLink or OS error code.
  const detail = { code: -32603, message: 'AgentLink could not prepare this session: ' + cause.message,
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
  let failure, inputTimer, closing = false;
  const pumps = new AbortController();
  let stopPromise;
  const stop = () => stopPromise ??= stopProcess(child).catch(cause => { failure ??= cause; });
  const fail = cause => {
    failure ??= cause;
    pumps.abort();
    if (!terminal) output.destroy(); // end:false may have settled before its last write callback.
    void stop();
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
    let defaultsRelay, protocolVersion, refusal;
    async function prepareSession(message, source) {
      try {
        const defaults = readDefaults ? await readDefaults() : launch.defaults;
        if (!defaults || !Object.keys(defaults).length) return;
        if (!defaultsRelay) {
          const { SessionDefaults } = await import('./session-defaults.mjs');
          defaultsRelay = new SessionDefaults(frame => child.stdin.write(frame), maxMessageBytes);
        }
        defaultsRelay.expectSession(message, source, defaults, protocolVersion);
      } catch (cause) {
        // Only this creation fails. The bridge never sees it, and the other
        // sessions on this connection keep running.
        refusal = sessionSetupError(source, cause);
        // The client may not show error details, so the reason also goes to the log.
        diagnostics.write((cause.code || 'SESSION_SETUP_FAILED') + ': ' + cause.message + '\n');
      }
    }
    const initializeIds = new Set();
    inputPump = pipeline(input, new AcpFrames({ maxMessageBytes, onMessage(message, source) {
      if (message.method === 'session/new' && Object.hasOwn(message, 'id')) return prepareSession(message, source);
      if (message.method === 'initialize' && Object.hasOwn(message, 'id')) initializeIds.add(message.id);
    }, mapMessage() {
      if (!refusal) return;
      // Reply through the output pump so the frame keeps its place in the stream.
      if (!outputFrames.writableEnded && !outputFrames.destroyed) outputFrames.push(refusal);
      refusal = undefined;
      return null;
    } }), child.stdin, { signal: pumps.signal }).then(() => {
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
    outputFrames = new AcpFrames({ maxMessageBytes, mapMessage(message, source) {
      if (message.method || !initializeIds.delete(message.id)) return defaultsRelay?.agentMessage(message, source);
      protocolVersion = message.result?.protocolVersion;
      if (!Array.isArray(message.result?.authMethods)) return;
      // The client relaunches AgentLink, not the underlying executable. A marker
      // identifies terminal auth even when the upstream method has only env.
      return terminalAuthReply(message, source);
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
