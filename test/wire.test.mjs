import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AcpFrames } from '../src/wire.mjs';
import { authMarker, terminalAuthReply } from '../src/terminal-auth.mjs';

async function relay(chunks, options) {
  const received = [];
  await pipeline(Readable.from(chunks), new AcpFrames(options), new Writable({
    write(chunk, encoding, done) { received.push(chunk); done(); }
  }));
  return Buffer.concat(received);
}

test('relay preserves exact JSON bytes through split UTF-8, CRLF and coalesced messages', async () => {
  const bytes = Buffer.from('{"jsonrpc":"2.0", "id":"x","method":"_custom","params":{"text":"世界"}}\r\n{"jsonrpc":"2.0","id":"x","result":null}\n');
  const pieces = Array.from(bytes, byte => Buffer.from([byte]));
  assert.deepEqual(await relay(pieces), bytes);
});
test('relay rejects oversized, truncated, non-UTF8 and non-protocol frames', async () => {
  await assert.rejects(relay([Buffer.from('x'.repeat(65))], { maxMessageBytes: 64 }), { code: 'MESSAGE_LIMIT' });
  await assert.rejects(relay([Buffer.from('{"jsonrpc":"2.0"')]), { code: 'PROTOCOL_ERROR' });
  await assert.rejects(relay([Buffer.from([0xff, 10])]));
  await assert.rejects(relay([Buffer.from('{"hello":"world"}\n')]), { code: 'PROTOCOL_ERROR' });
});

test('terminal auth edits only argument spans, preserving numeric IDs and opaque JSON', async () => {
  const original = '{ "jsonrpc":"2.0", "id":9007199254740993, "result":{ "protocolVersion":2,' +
    '"_meta":{"precise":123456789012345678901234567890,"float":1.0000000000000001,"text":"世界"},' +
    '"authMethods":[null,{"type":"other","args":["keep"]},{"type":"terminal","args":["old"],' +
    '"args":["--login","世界"],"_meta":{"precise":9007199254740993}},{"type":"terminal","env":{"LOGIN":"1"}},' +
    '{"type":"terminal","args":42}]}}\r\n';
  const expected = original.replace('"args":["--login","世界"]', '"args":' + JSON.stringify([authMarker, '--login', '世界']))
    .replace('{"type":"terminal","env"', '{"args":' + JSON.stringify([authMarker]) + ',"type":"terminal","env"');
  assert.equal((await relay([Buffer.from(original)], { mapMessage: terminalAuthReply })).toString(), expected);
});

test('terminal auth span scanner handles escaped keys, nested strings and duplicate results', async () => {
  const original = String.raw`{"jsonrpc":"2.0","id":"x","result":{"ignore":true},"res\u0075lt":{"authMethods":[{"type":"terminal","_meta":{"nested":[{"braces":"[\\\"}]"}]},"ar\u0067s":null}]}}` + '\n';
  const expected = original.replace('null', JSON.stringify([authMarker]));
  assert.equal((await relay(Array.from(Buffer.from(original), byte => Buffer.from([byte])),
    { mapMessage: terminalAuthReply })).toString(), expected);
});
