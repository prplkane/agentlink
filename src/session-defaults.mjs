import { member, whitespace } from './json-spans.mjs';
import { error } from './profiles.mjs';
import { sessionSelections } from './session-options.mjs';

function field(source, name) {
  return member(source, whitespace(source, 0), name);
}

function requestKey(id, source) {
  if (typeof id === 'number' && !Number.isSafeInteger(id)) return 'number:' + source.slice(...field(source, 'id'));
  return JSON.stringify(id);
}

function optionsSpan(source) {
  return member(source, field(source, 'result')[0], 'configOptions');
}

// An upstream session/new is complete before we reuse its request ID for a
// setter. The downstream request stays outstanding until all setters finish.
export class SessionDefaults {
  constructor(send, limit) {
    this.send = send;
    this.limit = limit;
    this.requests = new Map();
    this.configuring = new Map();
    this.heldBytes = 0;
  }

  expectSession(message, source, defaults, protocolVersion) {
    if (this.requests.size >= 256) throw error('MESSAGE_LIMIT', 'Too many pending session creations.');
    this.requests.set(requestKey(message.id, source), { defaults, protocolVersion, bytes: 0 });
  }

  hold(state, source) {
    const bytes = Buffer.byteLength(source) + 1;
    if (this.heldBytes + bytes > 4 * this.limit) throw error('MESSAGE_LIMIT', 'Pending session setup exceeds the gateway buffer limit.');
    this.heldBytes += bytes;
    state.bytes += bytes;
  }

  finish(key, state) {
    this.requests.delete(key);
    this.configuring.delete(state.sessionId);
    this.heldBytes -= state.bytes;
  }

  agentMessage(message, source) {
    if (message.method) {
      const state = this.configuring.get(message.params?.sessionId);
      if (state && message.method === 'session/update' && !Object.hasOwn(message, 'id')) {
        // Setter responses contain the complete, newer configuration. Other
        // updates must follow the reply that introduces this session ID.
        if (message.params.update?.sessionUpdate !== 'config_option_update') {
          this.hold(state, source);
          state.updates.push(source);
        }
        return null;
      }
      return;
    }
    if (!this.requests.size) return;
    const key = requestKey(message.id, source);
    const state = this.requests.get(key);
    if (!state) return;
    const first = !state.selections;
    if (message.error) {
      this.finish(key, state);
      return; // The upstream error already carries the original caller's ID.
    }
    if (first) {
      if (typeof message.result?.sessionId !== 'string' || !message.result.sessionId) {
        throw error('PROTOCOL_ERROR', 'Cannot apply profile defaults without a session ID.');
      }
      state.sessionId = message.result.sessionId;
      state.source = source;
      state.id = source.slice(...field(source, 'id'));
      state.selections = sessionSelections(message.result.configOptions, state.defaults, state.protocolVersion);
      state.updates = [];
    }
    let next;
    try { next = state.selections.next(message.result?.configOptions); }
    catch (cause) {
      this.finish(key, state);
      return Buffer.from('{"jsonrpc":"2.0","id":' + state.id + ',"error":' +
        JSON.stringify({ code: -32602, message: cause.message, data: { code: cause.code } }) + '}');
    }
    if (next.done) {
      this.finish(key, state);
      if (first) return; // Both choices already match. Preserve the original bytes.
      const [start, end] = optionsSpan(state.source);
      const options = source.slice(...optionsSpan(source));
      const reply = state.source.slice(0, start) + options + state.source.slice(end);
      if (Buffer.byteLength(reply) > this.limit) throw error('MESSAGE_LIMIT', 'Configured session reply exceeds the frame limit.');
      return Buffer.from([reply, ...state.updates].join('\n'));
    }
    if (first) {
      this.hold(state, source);
      this.configuring.set(state.sessionId, state);
    }
    const frame = '{"jsonrpc":"2.0","id":' + state.id + ',"method":"session/set_config_option","params":' +
      JSON.stringify({ sessionId: state.sessionId, ...next.value }) + '}';
    if (Buffer.byteLength(frame) > this.limit) throw error('MESSAGE_LIMIT', 'Profile selection exceeds the frame limit.');
    this.send(frame + '\n');
    return null;
  }
}
