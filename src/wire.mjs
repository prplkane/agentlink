import { Transform } from 'node:stream';
import { error } from './profiles.mjs';

// Validate framing, not the evolving ACP method schema. Preserve the original
// bytes, IDs, extensions and field order. Stream backpressure bounds queued data.
export class AcpFrames extends Transform {
  constructor({ maxMessageBytes = 16 * 1024 * 1024, onMessage, mapMessage } = {}) {
    super();
    if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes < 1) throw new TypeError('Invalid ACP frame limit.');
    this.limit = maxMessageBytes;
    this.parts = [];
    this.bytes = 0;
    this.onMessage = onMessage;
    this.mapMessage = mapMessage;
  }
  _transform(chunk, encoding, done) {
    try {
      let start = 0;
      for (let index = 0; index < chunk.length; index++) {
        if (chunk[index] !== 10) continue;
        this.append(chunk.subarray(start, index));
        const line = Buffer.concat(this.parts, this.bytes);
        this.parts = []; this.bytes = 0;
        const source = new TextDecoder('utf-8', { fatal: true }).decode(line);
        const message = JSON.parse(source);
        if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' ||
            !(typeof message.method === 'string' || Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
          throw error('PROTOCOL_ERROR', 'Expected an ACP JSON-RPC message.');
        }
        this.onMessage?.(message);
        const mapped = this.mapMessage?.(message, source);
        this.push(mapped === undefined ? line : Buffer.isBuffer(mapped) ? mapped : Buffer.from(JSON.stringify(mapped)));
        this.push(Buffer.from('\n'));
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
    done(this.bytes ? error('PROTOCOL_ERROR', 'ACP stream ended inside a message.') : undefined);
  }
}
