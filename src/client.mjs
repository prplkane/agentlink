import { version } from './version.mjs';
import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
export { providers, planProvider } from './providers.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const fault = (code, message) => Object.assign(new Error(message), { name: 'AcpError', code });
const stops = new Set(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled']);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Deliberately narrow evaluation client: one process, one session, one prompt at a time.
// This is not a full ACP implementation or a process sandbox.
export class AcpClient {
  #child; #pending = new Map(); #nextId = 1; #parts = []; #lineBytes = 0;
  #bytes = 0; #stderr = Buffer.alloc(0); #failure; #closing; #exit; #exited = false;
  #initialized = false; #sessionId; #promptId; #onUpdate; #limits; #cwd; #setupMethod;
  #onPermission; #permissions = new Map(); #initialization;

  constructor({ command, args = [], cwd, env = process.env, onUpdate = () => {}, onPermission,
    maxMessageBytes = 1024 * 1024, maxOutputBytes = 8 * 1024 * 1024,
    stderrBytes = 8192, cancelGraceMs = 500, exitGraceMs = 1500, permissionTimeoutMs = 60000 } = {}) {
    if (!isAbsolute(command ?? '') || !isAbsolute(cwd ?? '') ||
        !Array.isArray(args) || args.some(value => typeof value !== 'string')) {
      throw new TypeError('Use absolute executable/cwd paths and an argument array.');
    }
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
      throw new TypeError('Use the executable or node + script, not a Windows shell shim.');
    }
    if (typeof onUpdate !== 'function') throw new TypeError('onUpdate must be a function.');
    if (onPermission !== undefined && typeof onPermission !== 'function') throw new TypeError('onPermission must be a function.');
    for (const value of [maxMessageBytes, maxOutputBytes, stderrBytes, cancelGraceMs, exitGraceMs, permissionTimeoutMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Limits must be positive integers.');
    }
    this.#limits = { maxMessageBytes, maxOutputBytes, stderrBytes, cancelGraceMs, exitGraceMs, permissionTimeoutMs };
    this.#onUpdate = onUpdate;
    this.#onPermission = onPermission;
    this.#cwd = cwd;
    this.#child = spawn(command, args, {
      cwd, env, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']
    });
    this.#exit = new Promise(resolve => {
      this.#child.once('exit', (code, signal) => {
        this.#exited = true;
        resolve({ code, signal });
        if (!this.#closing) this.#fail(fault('PROCESS_EXIT', `Agent exited (${code ?? signal}).`));
      });
      this.#child.once('error', () => {
        this.#exited = true;
        resolve({ spawnFailed: true });
        this.#fail(fault('SPAWN_FAILED', 'Could not start the configured agent executable.'));
      });
    });
    this.#child.stdin.on('error', () => this.#fail(fault('PIPE_ERROR', 'Agent input pipe failed.')));
    this.#child.stdout.on('data', chunk => this.#read(chunk));
    this.#child.stdout.on('error', () => this.#fail(fault('PIPE_ERROR', 'Agent output pipe failed.')));
    this.#child.stderr.on('data', chunk => {
      this.#stderr = Buffer.concat([this.#stderr, chunk]).subarray(-stderrBytes);
    });
  }

  get pid() { return this.#child.pid; }
  get stderrTail() { return this.#stderr.toString('utf8'); }
  get sessionId() { return this.#sessionId; }
  get initialization() { return structuredClone(this.#initialization); }

  async initialize(options) {
    if (this.#initialized || this.#setupMethod) throw fault('INVALID_STATE', 'Initialization is already started.');
    this.#setupMethod = 'initialize';
    let result;
    try { result = await this.#request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'agentlink', version }
    }, options); } finally { this.#setupMethod = undefined; }
    if (!object(result) || result.protocolVersion !== 1 || !object(result.agentCapabilities)) {
      const error = fault('UNSUPPORTED_PROTOCOL', 'Agent did not negotiate the supported ACP v1 profile.');
      this.#fail(error); throw error;
    }
    this.#initialized = true;
    this.#initialization = structuredClone(result);
    return result;
  }

  async authenticate(methodId, options) {
    if (!this.#initialized || this.#sessionId || this.#setupMethod) throw fault('INVALID_STATE', 'Authenticate after initialization and before creating a session.');
    if (typeof methodId !== 'string' || !methodId) throw new TypeError('Provide an advertised authentication method ID.');
    if (!this.#initialization.authMethods?.some(method => method.id === methodId)) throw fault('UNSUPPORTED_AUTH', 'The agent did not advertise this authentication method.');
    this.#setupMethod = 'authenticate';
    try { return await this.#request('authenticate', { methodId }, options); }
    finally { this.#setupMethod = undefined; }
  }

  async newSession(options) {
    if (!this.#initialized || this.#sessionId || this.#setupMethod) throw fault('INVALID_STATE', 'Initialize before creating one session.');
    this.#setupMethod = 'session/new';
    let result;
    try { result = await this.#request('session/new', { cwd: this.#cwd, mcpServers: [] }, options); }
    finally { this.#setupMethod = undefined; }
    if (!object(result) || typeof result.sessionId !== 'string' || !result.sessionId) {
      const error = fault('PROTOCOL_ERROR', 'Missing session ID.'); this.#fail(error); throw error;
    }
    this.#sessionId = result.sessionId;
    return result;
  }

  async prompt(text, options) {
    if (!this.#sessionId || this.#promptId !== undefined) throw fault('INVALID_STATE', 'Create a session and wait for its active prompt.');
    if (typeof text !== 'string') throw new TypeError('This prototype supports text prompts only.');
    try {
      const result = await this.#request('session/prompt', {
        sessionId: this.#sessionId, prompt: [{ type: 'text', text }]
      }, options);
      if (!object(result) || !stops.has(result.stopReason)) {
        const error = fault('PROTOCOL_ERROR', 'Missing or unsupported stop reason.'); this.#fail(error); throw error;
      }
      return result;
    } finally { this.#promptId = undefined; }
  }

  cancel() {
    if (this.#promptId === undefined) return false;
    this.#cancel(this.#promptId);
    return true;
  }

  async close() {
    if (this.#closing) return this.#closing;
    this.#failure ??= fault('CLOSED', 'Connection closed.');
    this.#cancelPermissions();
    this.#rejectAll(this.#failure);
    this.#closing = this.#stopOwnedProcess();
    return this.#closing;
  }

  #request(method, params, { timeoutMs = 30000, signal } = {}) {
    if (this.#failure) return Promise.reject(this.#failure);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) return Promise.reject(new TypeError('timeoutMs must be positive.'));
    if (signal?.aborted) return Promise.reject(fault('CANCELLED', 'Request cancelled before it was sent.'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const abort = () => method === 'session/prompt'
        ? this.#cancel(id, fault('CANCELLED', 'Prompt cancelled.'))
        : this.#fail(fault('CANCELLED', `${method} cancelled.`));
      const timer = setTimeout(() => method === 'session/prompt'
        ? this.#cancel(id, fault('DEADLINE', 'Prompt deadline reached.'))
        : this.#fail(fault('DEADLINE', `${method} deadline reached.`)), timeoutMs);
      const entry = { resolve, reject, timer, signal, abort, method };
      this.#pending.set(id, entry);
      if (method === 'session/prompt') this.#promptId = id;
      signal?.addEventListener('abort', abort, { once: true });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  #cancel(id, error) {
    const entry = this.#pending.get(id);
    if (!entry || entry.cancelSent) return;
    entry.cancelSent = true;
    entry.cancelError = error;
    clearTimeout(entry.timer);
    this.#cancelPermissions();
    this.#send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.#sessionId } });
    entry.grace = setTimeout(() => this.#fail(error ?? fault('CANCEL_TIMEOUT', 'Agent did not complete cancellation.')), this.#limits.cancelGraceMs);
  }

  #send(message) {
    if (this.#failure) return;
    const wire = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(wire) > this.#limits.maxMessageBytes) {
      this.#fail(fault('MESSAGE_LIMIT', 'Outgoing message exceeds the configured limit.')); return;
    }
    this.#child.stdin.write(wire, error => {
      if (error) this.#fail(fault('PIPE_ERROR', 'Agent input pipe failed.'));
    });
  }

  #read(chunk) {
    if (this.#failure) return;
    this.#bytes += chunk.length;
    if (this.#bytes > this.#limits.maxOutputBytes) {
      this.#fail(fault('OUTPUT_LIMIT', 'Agent output exceeds the connection limit.')); return;
    }
    let start = 0;
    for (let i = 0; i <= chunk.length; i++) {
      if (i !== chunk.length && chunk[i] !== 10) continue;
      const part = chunk.subarray(start, i);
      this.#lineBytes += part.length;
      if (this.#lineBytes > this.#limits.maxMessageBytes) {
        this.#fail(fault('MESSAGE_LIMIT', 'Agent message exceeds the configured limit.')); return;
      }
      if (part.length) this.#parts.push(part);
      if (i < chunk.length) {
        const bytes = Buffer.concat(this.#parts, this.#lineBytes);
        this.#parts = []; this.#lineBytes = 0;
        try {
          const line = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          this.#message(JSON.parse(line));
        } catch (error) {
          this.#fail(error.name === 'AcpError' ? error : fault('PROTOCOL_ERROR', 'Agent sent invalid UTF-8, JSON, or ACP data.'));
        }
        if (this.#failure) return;
      }
      start = i + 1;
    }
  }

  #message(message) {
    if (!object(message) || message.jsonrpc !== '2.0') throw fault('PROTOCOL_ERROR', 'Invalid JSON-RPC envelope.');
    if (own(message, 'method')) {
      if (own(message, 'result') || own(message, 'error')) throw fault('PROTOCOL_ERROR', 'Invalid JSON-RPC method envelope.');
      if (typeof message.method !== 'string' || !object(message.params)) throw fault('PROTOCOL_ERROR', 'Invalid method or params.');
      if (own(message, 'id')) {
        if (typeof message.id !== 'string' && !Number.isSafeInteger(message.id)) throw fault('PROTOCOL_ERROR', 'Invalid request ID.');
        if (message.method === 'session/request_permission') this.#permission(message);
        else this.#send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'This client does not support this method.' } });
      } else if (message.method === 'session/update') {
        const { sessionId, update } = message.params;
        if (sessionId !== this.#sessionId || !object(update) || typeof update.sessionUpdate !== 'string') {
          throw fault('PROTOCOL_ERROR', 'Invalid update or unexpected session.');
        }
        try { this.#onUpdate(update); }
        catch { throw fault('HANDLER_ERROR', 'The update callback failed.'); }
      }
      return;
    }
    const entry = this.#pending.get(message.id);
    if (!entry || own(message, 'result') === own(message, 'error')) throw fault('PROTOCOL_ERROR', 'Unexpected or invalid response.');
    if (own(message, 'error') && (!object(message.error) || !Number.isInteger(message.error.code) || typeof message.error.message !== 'string')) {
      throw fault('PROTOCOL_ERROR', 'Invalid remote error.');
    }
    if (entry.method === 'session/prompt') this.#cancelPermissions();
    this.#finish(message.id);
    // An update can follow this response in the same stdout chunk, before the
    // newSession() promise resumes. Establish the ID at the receive boundary.
    if (entry.method === 'session/new' && object(message.result) && typeof message.result.sessionId === 'string') {
      this.#sessionId = message.result.sessionId;
    }
    if (entry.cancelError) entry.reject(entry.cancelError);
    else if (message.error) entry.reject(Object.assign(fault('REMOTE_ERROR', message.error.message), { rpcCode: message.error.code }));
    else entry.resolve(message.result);
  }

  #permission({ id, params }) {
    if (!this.#sessionId || params.sessionId !== this.#sessionId || !Array.isArray(params.options) ||
        !params.options.every(option => object(option) && typeof option.optionId === 'string') || this.#permissions.has(id)) {
      throw fault('PROTOCOL_ERROR', 'Invalid permission request or session.');
    }
    const options = new Set(params.options.map(option => option.optionId));
    const controller = new AbortController();
    let finished = false;
    const finish = optionId => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      this.#permissions.delete(id);
      const outcome = typeof optionId === 'string' && options.has(optionId)
        ? { outcome: 'selected', optionId } : { outcome: 'cancelled' };
      this.#send({ jsonrpc: '2.0', id, result: { outcome } });
    };
    const cancel = () => { controller.abort(); finish(null); };
    const timer = setTimeout(cancel, this.#limits.permissionTimeoutMs);
    this.#permissions.set(id, { cancel });
    Promise.resolve().then(() => controller.signal.aborted ? null : this.#onPermission?.(structuredClone(params), { signal: controller.signal }))
      .then(finish, () => finish(null));
  }

  #cancelPermissions() {
    for (const request of [...this.#permissions.values()]) request.cancel();
  }

  #finish(id) {
    const entry = this.#pending.get(id);
    clearTimeout(entry.timer); clearTimeout(entry.grace);
    entry.signal?.removeEventListener('abort', entry.abort);
    this.#pending.delete(id);
  }

  #rejectAll(error) {
    for (const [id, entry] of this.#pending) { this.#finish(id); entry.reject(error); }
  }

  #fail(error) {
    if (this.#failure) return;
    this.#failure = error;
    void this.close().catch(() => {});
  }

  async #stopOwnedProcess() {
    // Target only the process spawned here. Never search/kill by executable name.
    if (this.#child.pid && !this.#exited) {
      if (process.platform === 'win32') {
        const taskkill = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(this.#child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        await Promise.race([
          new Promise(resolve => { taskkill.once('exit', resolve); taskkill.once('error', resolve); }),
          wait(this.#limits.exitGraceMs).then(() => { if (taskkill.exitCode === null) taskkill.kill(); })
        ]);
      } else {
        try { process.kill(-this.#child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
    const exited = await Promise.race([this.#exit.then(() => true), wait(this.#limits.exitGraceMs).then(() => false)]);
    this.#child.stdin.destroy(); this.#child.stdout.destroy(); this.#child.stderr.destroy();
    if (!exited) throw fault('PROCESS_STOP_FAILED', 'Owned agent did not exit.');
  }
}
