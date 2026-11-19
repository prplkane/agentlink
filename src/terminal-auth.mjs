import { member, valueEnd, whitespace } from './json-spans.mjs';
import { strings } from './profiles.mjs';

export const authMarker = '--agentlink-terminal-auth';

export function terminalAuthReply(message, source) {
  const methods = message.result?.authMethods;
  const eligible = method => method?.type === 'terminal' && strings(method.args ?? []);
  if (!Array.isArray(methods) || !methods.some(eligible)) return;
  const result = member(source, whitespace(source, 0), 'result');
  const auth = member(source, result[0], 'authMethods');
  const edits = [];
  let at = whitespace(source, auth[0] + 1);
  for (const method of methods) {
    const end = valueEnd(source, at);
    if (eligible(method)) {
      const args = member(source, at, 'args');
      const replacement = JSON.stringify([authMarker, ...(method.args ?? [])]);
      edits.push(args ? [...args, replacement] : [at + 1, at + 1, '"args":' + replacement + ',']);
    }
    at = whitespace(source, end);
    if (source[at] === ',') at = whitespace(source, at + 1);
  }
  const parts = [];
  let cursor = 0;
  for (const [start, end, replacement] of edits) {
    parts.push(source.slice(cursor, start), replacement); cursor = end;
  }
  parts.push(source.slice(cursor));
  return Buffer.from(parts.join(''));
}
