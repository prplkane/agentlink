import { strings } from './profiles.mjs';

export const authMarker = '--agentlink-terminal-auth';

// The wire layer has already validated JSON. Locate spans instead of
// reserializing the response: JSON.parse/stringify would round large numeric
// IDs and opaque extension values. Nesting is scanned iteratively.
const whitespace = (text, at) => { while (/\s/.test(text[at] || '') && at < text.length) at++; return at; };
function valueEnd(text, start) {
  let depth = 0, quoted = false;
  for (let at = start; at < text.length; at++) {
    const char = text[at];
    if (quoted) {
      if (char === '\\') at++;
      else if (char === '"') { quoted = false; if (!depth) return at + 1; }
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') { if (!depth) return at; if (!--depth) return at + 1; }
    else if (!depth && (char === ',' || /\s/.test(char))) return at;
  }
  return text.length;
}
function member(text, start, name) {
  if (text[start] !== '{') return;
  let found, at = whitespace(text, start + 1);
  while (text[at] !== '}') {
    const end = valueEnd(text, at), key = JSON.parse(text.slice(at, end));
    const value = whitespace(text, whitespace(text, end) + 1);
    const finish = valueEnd(text, value);
    if (key === name) found = [value, finish]; // JSON's last duplicate key wins.
    at = whitespace(text, finish);
    if (text[at] === ',') at = whitespace(text, at + 1);
  }
  return found;
}

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
