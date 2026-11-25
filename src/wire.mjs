import { Transform } from 'node:stream';
import { error } from './profiles.mjs';

// Validate framing, not the evolving ACP method schema. Preserve the original
// bytes, IDs, extensions and field order. Stream backpressure bounds queued data.
export class AcpFrames extends Transform {
  constructor({ maxMessageBytes = 16 * 1024 * 1024, onMessage, mapMessage, onEnd } = {}) {
    super();
    if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes < 1) throw new TypeError('Invalid ACP frame limit.');
    this.limit = maxMessageBytes;
    this.parts = [];
    this.bytes = 0;
    this.onMessage = onMessage;
    this.mapMessage = mapMessage;
    this.onEnd = onEnd;
  }
  async _transform(chunk, encoding, done) {
    try {
      let start = 0;
      for (let index = 0; index < chunk.length; index++) {
        if (chunk[index] !== 10) continue;
        this.append(chunk.subarray(start, index));
        this.parts.push(chunk.subarray(index, index + 1));
        const frame = Buffer.concat(this.parts, this.bytes + 1);
        this.parts = []; this.bytes = 0;
        const source = new TextDecoder('utf-8', { fatal: true }).decode(frame.subarray(0, -1));
        const message = JSON.parse(source);
        if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' ||
            !(typeof message.method === 'string' || Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
          throw error('PROTOCOL_ERROR', 'Expected an ACP JSON-RPC message.');
        }
        const ready = this.onMessage?.(message, source);
        if (ready?.then) await ready;
        const mapped = this.mapMessage?.(message, source);
        if (mapped === undefined) this.push(frame);
        else if (mapped !== null) this.push(Buffer.concat([Buffer.isBuffer(mapped) ? mapped : Buffer.from(JSON.stringify(mapped)), Buffer.from('\n')]));
        start = index + 1;
      }
      this.append(chunk.subarray(start));
      done();
    } catch (cause) {
      done(cause.code ? cause : error('PROTOCOL_ERROR', 'Invalid JSON or UTF-8 in the ACP stream.'));
    }
  }
  append(part) {
    this.bytes += part.length;
    if (this.bytes > this.limit) throw error('MESSAGE_LIMIT', 'ACP message exceeds the configured frame limit.');
    if (part.length) this.parts.push(part);
  }
  _flush(done) {
    if (this.bytes) return done(error('PROTOCOL_ERROR', 'ACP stream ended inside a message.'));
    const final = this.onEnd?.();
    if (final?.then) final.then(() => done(), done);
    else done();
  }
}
