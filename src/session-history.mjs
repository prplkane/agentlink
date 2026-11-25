import { randomUUID } from 'node:crypto';
import { member, requestKey, setField, whitespace } from './json-spans.mjs';
import { error } from './profiles.mjs';

export const historyKey = 'agentlink.dev/session-history';
export const codexKey = 'codex.dev/session-history';
export const codexAgentName = '@agentclientprotocol/codex-acp';
const claude = '@agentclientprotocol/claude-agent-acp';
// Unadvertised vendor semantics were checked against these published packages.
const claudeSdkOptions = new Set(['0.109.0', '0.109.1', '0.110.0', '0.110.1', '0.111.0', '0.112.0']);
const codexSoftDelete = new Set(['2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const versionOne = value => object(value) && value.version === 1;
const maxSessions = 256;
const metadataTimeoutMs = 1000;

export function clientWantsHistory(params) {
  return params?.protocolVersion === 1 && versionOne(params.clientCapabilities?._meta?.[historyKey]);
}

function rawId(source) {
  return source.slice(...member(source, whitespace(source, 0), 'id'));
}

function refuse(source, code, message) {
  const detail = { code: -32602, message, data: { code } };
  return Buffer.from('{"jsonrpc":"2.0","id":' + rawId(source) + ',"error":' + JSON.stringify(detail) + '}');
}

function responseStatus(source, status) {
  try { return Buffer.from(setField(source, ['result', '_meta', historyKey], { status })); }
  catch { return refuse(source, 'SESSION_HISTORY_UNCONFIRMED', 'The provider returned invalid session metadata.'); }
}

export function historySupport(result, requestedAirIndex = false) {
  const v2 = result.protocolVersion === 2; // Internal option inspection also negotiates v2.
  const info = v2 ? result.info : result.agentInfo;
  const caps = (v2 ? result.capabilities : result.agentCapabilities) ?? {};
  const sessions = (v2 ? caps.session : caps.sessionCapabilities) || {};
  const isCodex = info?.name === codexAgentName;
  const nativeCodex = isCodex && versionOne(caps._meta?.[codexKey]) && caps._meta[codexKey].ephemeral === true;
  const nativeClaude = info?.name === claude && claudeSdkOptions.has(info.version);
  const air = result._meta?.jetbrains?.air?.capabilities;
  const airIndex = Array.isArray(air) && air.includes('sessionIndex');
  // In AIR session-index mode, session/delete permanently erases a thread.
  // The ordinary Codex ACP session/delete archives. Use the explicit archive
  // extension when AIR actually advertises it.
  let archiveMethod;
  if (isCodex && airIndex && air.includes('sessionArchive')) archiveMethod = '_session/archive';
  else if (isCodex && !airIndex && !requestedAirIndex && codexSoftDelete.has(info.version) && object(sessions.delete)) {
    archiveMethod = 'session/delete';
  }
  const canClose = v2 || object(sessions.close);
  const strategy = nativeCodex || nativeClaude ? 'ephemeral'
    : archiveMethod && canClose ? 'archive-on-close' : 'provider-managed';
  return { nativeCodex, nativeClaude, archiveMethod, canClose, canTitle: object(sessions.title), strategy };
}

// The caller opted in at initialize. State belongs to this one upstream connection.
// Never discover chats by enumerating history or use an ID supplied by a different caller.
export class SessionHistory {
  constructor(result, send, publish, limit, { requestedAirIndex = false, warn = () => {} } = {}) {
    this.warn = warn;
    this.finalReplies = new Set();
    this.limit = limit;
    this.heldBytes = 0;
    this.send = send;
    this.publish = publish;
    this.opening = new Set();
    this.closing = new Map();
    this.owned = new Map();
    this.metadata = new Map();
    this.prefix = 'agentlink-history-' + randomUUID() + '-';
    this.sequence = 0;
    Object.assign(this, historySupport(result, requestedAirIndex));
  }

  capability(source) {
    return Buffer.from(setField(source, ['result', 'agentCapabilities', '_meta', historyKey], { version: 1, strategy: this.strategy }));
  }

  prepare(message, source) {
    const key = requestKey(message.id, source);
    const params = message.params;
    if (Object.hasOwn(params, 'sessionId')) throw error('INVALID_SESSION_HISTORY', 'A temporary session must start fresh.');
    const mode = params?._meta?.[historyKey]?.mode;
    if (!['prefer-ephemeral', 'require-ephemeral'].includes(mode)) throw error('INVALID_SESSION_HISTORY', 'Unknown per-session history mode.');
    if (mode === 'require-ephemeral' && this.strategy !== 'ephemeral') {
      throw error('SESSION_HISTORY_UNSUPPORTED', 'This provider cannot confirm a session without local chat persistence.');
    }
    if (this.opening.size + this.owned.size >= maxSessions) throw error('MESSAGE_LIMIT', 'Too many managed sessions on this connection.');
    let outgoing = setField(source, ['params', '_meta', historyKey], undefined);
    if (this.nativeClaude) {
      const options = params._meta?.claudeCode?.options;
      const extra = options?.extraArgs ?? {};
      if (options?.resume || options?.continue || options?.forkSession || options?.sessionId || options?.resumeSessionAt ||
          ['resume', 'continue', 'session-id', 'fork-session', 'resume-session-at'].some(key => Object.hasOwn(extra, key))) {
        throw error('INVALID_SESSION_HISTORY', 'A temporary session must start fresh.');
      }
      outgoing = setField(outgoing, ['params', '_meta', 'claudeCode', 'options', 'persistSession'], false);
    } else if (this.nativeCodex) {
      outgoing = setField(outgoing, ['params', '_meta', codexKey, 'ephemeral'], true);
    }
    this.opening.add(key);
    return Buffer.from(outgoing);
  }

  forgetRequest(message, source) { this.opening.delete(requestKey(message.id, source)); }

  // Use a per-connection private namespace for internal metadata requests. Replies
  // arriving after their deadline are consumed too. No user prompt is replayed.
  reserved(id) { return typeof id === 'string' && id.startsWith(this.prefix); }

  metadataCall(method, sessionId, fields = {}) {
    if (this.disposed) return Promise.resolve(false);
    const id = this.prefix + ++this.sequence;
    return new Promise(resolve => {
      const finish = (ok, reason) => {
        if (!this.metadata.delete(id)) return;
        clearTimeout(timer);
        if (!ok && !this.disposed) this.warn(method + ' was unconfirmed (' + reason + ').');
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false, 'timeout'), metadataTimeoutMs);
      this.metadata.set(id, finish);
      const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params: { sessionId, ...fields } });
      if (Buffer.byteLength(frame) > this.limit || !this.send(frame + '\n')) finish(false, 'unavailable transport');
    });
  }

  async beforeClient(message, source) {
    if (typeof message.method !== 'string') return;
    const state = this.owned.get(message.params?.sessionId);
    if (!state) return;
    if (message.method === 'session/prompt' && state.status === 'archive-on-close' && this.canTitle) {
      state.naming ??= this.metadataCall('session/set_title', state.sessionId, { title: 'AgentLink session' });
      await state.naming;
    }
    const directRemoval = message.method === 'session/delete' || message.method === this.archiveMethod;
    if ((message.method === 'session/close' || directRemoval) && Object.hasOwn(message, 'id')) {
      if (this.closing.size >= maxSessions) throw error('MESSAGE_LIMIT', 'Too many pending session closes.');
      state.pendingCloses++;
      this.closing.set(requestKey(message.id, source), { state, directRemoval });
    }
  }

  archive(state) {
    if (!state.archive) {
      state.attempts = (state.attempts ?? 0) + 1;
      state.archive = this.metadataCall(this.archiveMethod, state.sessionId).then(ok => {
        if (ok || this.ending || this.disposed || state.attempts >= 2) this.owned.delete(state.sessionId);
        else state.archive = undefined; // Give a failed explicit cleanup one bounded retry at EOF.
        this.checkDrain();
        return ok;
      });
    }
    return state.archive;
  }

  failedSetup(sessionId) {
    const state = this.owned.get(sessionId);
    if (!state) return;
    if (state.status === 'archive-on-close') void this.archive(state);
    else {
      if (this.canClose) void this.metadataCall('session/close', sessionId);
      this.owned.delete(sessionId);
    }
  }

  agentMessage(message, source) {
    if (message.method || !Object.hasOwn(message, 'id')) return;
    if (this.reserved(message.id)) {
      this.metadata.get(message.id)?.(!message.error && object(message.result), message.error?.code ?? 'invalid response');
      return null;
    }
    const key = requestKey(message.id, source);
    if (this.opening.delete(key)) {
      const sessionId = message.result?.sessionId;
      if (message.error) { this.checkDrain(); return; }
      if (typeof sessionId !== 'string' || !sessionId || this.owned.has(sessionId)) {
        this.checkDrain();
        return refuse(source, 'SESSION_HISTORY_UNCONFIRMED', 'The provider did not return a distinct session ID.');
      }
      const state = { sessionId, status: this.strategy, pendingCloses: 0 };
      if (this.canClose || state.status === 'archive-on-close') this.owned.set(sessionId, state);
      if (message.result._meta != null && !object(message.result._meta)) {
        this.failedSetup(sessionId);
        this.checkDrain();
        return refuse(source, 'SESSION_HISTORY_UNCONFIRMED', 'The provider returned invalid session metadata.');
      }
      if (this.nativeCodex && message.result._meta?.[codexKey]?.ephemeral !== true) {
        if (this.archiveMethod) { state.status = 'archive-on-close'; void this.archive(state); }
        else this.failedSetup(sessionId);
        this.checkDrain();
        return refuse(source, 'SESSION_HISTORY_UNCONFIRMED', 'The provider did not confirm an ephemeral thread.');
      }
      if (this.ending && state.status === 'archive-on-close') void this.archive(state);
      this.checkDrain();
      return responseStatus(source, state.status);
    }
    const pending = this.closing.get(key);
    if (!pending) return;
    this.closing.delete(key);
    const { state, directRemoval } = pending;
    state.pendingCloses--;
    const owned = this.owned.get(state.sessionId) === state;
    const canArchive = owned && state.status === 'archive-on-close' && !state.pendingCloses;
    if (message.error) {
      // A live client can continue after a refused close. At EOF the gateway
      // still owns cleanup once the client's outstanding operations have settled.
      if (this.ending && canArchive) void this.archive(state);
      this.checkDrain();
      return;
    }
    if (directRemoval) {
      if (owned) this.owned.delete(state.sessionId);
      this.checkDrain();
      return; // The client performed its own cleanup. Preserve the original reply.
    }
    if (state.status === 'archive-on-close') {
      if (!canArchive) {
        this.checkDrain();
        return responseStatus(source, 'unconfirmed');
      }
      const archived = this.archive(state);
      const bytes = Buffer.byteLength(source) + 1;
      if (this.finalReplies.size >= maxSessions || this.heldBytes + bytes > 4 * this.limit) return responseStatus(source, 'unconfirmed');
      this.heldBytes += bytes;
      const reply = archived.then(ok => {
        this.heldBytes -= bytes;
        this.finalReplies.delete(reply);
        this.publish(responseStatus(source, ok ? 'archived' : 'unconfirmed'));
      });
      this.finalReplies.add(reply);
      return null;
    }
    if (owned) this.owned.delete(state.sessionId);
    this.checkDrain();
    return responseStatus(source, state.status);
  }

  cleanupPending() {
    return this.opening.size > 0 || this.closing.size > 0 || [...this.owned.values()].some(state => state.status === 'archive-on-close');
  }

  checkDrain() { if (this.ending && !this.cleanupPending()) this.drained?.(); }

  // EOF can race the session/new reply. Keep stdin available briefly to archive
  // just-created IDs, including when the application disappears before closing.
  disconnect() { return this.teardown ??= this.drain(); }

  async drain() {
    if (this.disposed) return;
    this.ending = true;
    for (const state of this.owned.values()) {
      if (state.status === 'archive-on-close' && !state.pendingCloses) void this.archive(state);
    }
    if (!this.cleanupPending()) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        if (this.closing.size) this.warn('Client close or removal was unconfirmed at disconnect.');
        resolve();
      }, metadataTimeoutMs);
      this.drained = () => { clearTimeout(timer); resolve(); };
    });
    this.drained = undefined;
  }

  async endOutput() {
    this.dispose();
    await Promise.all(this.finalReplies);
  }

  dispose() {
    this.disposed = true;
    for (const finish of this.metadata.values()) finish(false, 'connection closed');
    this.drained?.();
  }
}
