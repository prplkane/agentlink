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
