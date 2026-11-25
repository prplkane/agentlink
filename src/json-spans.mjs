// The wire layer has already validated JSON. Locate spans instead of
// reserializing the response: JSON.parse/stringify would round large numeric
// IDs and opaque extension values. Nesting is scanned iteratively.
export const whitespace = (text, at) => { while (/\s/.test(text[at] || '') && at < text.length) at++; return at; };
export function valueEnd(text, start) {
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
// Match requests without rounding JSON integers beyond JavaScript's safe range.
export function requestKey(id, source) {
  if (typeof id === 'number' && !Number.isSafeInteger(id)) return 'number:' + source.slice(...member(source, whitespace(source, 0), 'id'));
  return JSON.stringify(id);
}

function withoutMember(source, at, name) {
  const parts = [];
  let start = at + 1, key = whitespace(source, start);
  while (source[key] !== '}') {
    const keyEnd = valueEnd(source, key);
    const value = whitespace(source, whitespace(source, keyEnd) + 1);
    const end = whitespace(source, valueEnd(source, value));
    if (JSON.parse(source.slice(key, keyEnd)) !== name) parts.push(source.slice(start, end));
    if (source[end] === '}') return source.slice(0, at + 1) + parts.join(',') + source.slice(end);
    start = end + 1;
    key = whitespace(source, start);
  }
  return source;
}

// Set a nested metadata field without reserializing its siblings, which may
// contain opaque identifiers or large integers. Missing ancestors are objects.
export function setField(source, path, value) {
  let at = whitespace(source, 0);
  for (const [index, name] of path.entries()) {
    if (source[at] !== '{') throw new TypeError('Expected an ACP metadata object.');
    const span = member(source, at, name);
    if (!span || (index < path.length - 1 && source.startsWith('null', span[0]))) {
      if (value === undefined) return source;
      let tree = value;
      for (let i = path.length - 1; i > index; i--) tree = { [path[i]]: tree };
      if (span) return source.slice(0, span[0]) + JSON.stringify(tree) + source.slice(span[1]);
      const comma = source[whitespace(source, at + 1)] === '}' ? '' : ',';
      return source.slice(0, at + 1) + JSON.stringify(name) + ':' + JSON.stringify(tree) + comma + source.slice(at + 1);
    }
    if (index === path.length - 1) return value === undefined ? withoutMember(source, at, name)
      : source.slice(0, span[0]) + JSON.stringify(value) + source.slice(span[1]);
    at = span[0];
  }
}

export function member(text, start, name) {
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
