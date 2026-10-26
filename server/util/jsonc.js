// Bedrock JSON files may contain // and /* */ comments and trailing commas.
// This strips them (outside of strings) so JSON.parse can handle the rest.

function skipString(text, i) {
  let j = i + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
  return j + 1;
}

export function stripJsonc(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      const j = skipString(text, i);
      out += text.slice(i, j);
      i = j;
    } else if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      // Keep newlines so error positions still map to the right line.
      out += text.slice(i, end === -1 ? n : end + 2).replace(/[^\n]/g, ' ');
      i = end === -1 ? n : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // Second pass: drop trailing commas (a comma followed only by whitespace and } or ]).
  let result = '';
  i = 0;
  while (i < out.length) {
    const c = out[i];
    if (c === '"') {
      const j = skipString(out, i);
      result += out.slice(i, j);
      i = j;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === '}' || out[j] === ']') { result += ' '; i++; continue; }
    }
    result += c;
    i++;
  }
  return result;
}

/** Parse JSONC. Throws an Error with a line number on failure. */
export function parseJsonc(text) {
  const clean = stripJsonc(text.replace(/^﻿/, ''));
  try {
    return JSON.parse(clean);
  } catch (err) {
    const m = /position (\d+)/.exec(err.message);
    if (m && !/line \d+/.test(err.message)) {
      const line = clean.slice(0, Number(m[1])).split('\n').length;
      throw new Error(`${err.message} (line ${line})`);
    }
    throw err;
  }
}

export function tryParseJsonc(text) {
  try {
    return { ok: true, value: parseJsonc(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
