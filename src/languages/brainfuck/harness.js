/**
 * Kata I/O for Brainfuck: each test case is stdin → program → stdout.
 *
 * Encoding (programmatic stand-in for El Brainfuck's input field):
 * - string arg(s) → raw stdin text
 * - numbers / number arrays → whitespace-separated decimal text
 *   e.g. input [[1,8,6], 9] → "1 8 6\n9\n"
 */

/** Convert a kata `input` (args list or raw string) into BF stdin. */
export function encodeStdin(input) {
  if (input == null) return '';
  if (typeof input === 'string') return input;

  const args = Array.isArray(input) ? input : [input];
  if (!args.length) return '';

  // Single string argument → exact stdin (escape sequences handled by compiler)
  if (args.length === 1 && typeof args[0] === 'string') return args[0];
  if (args.every((a) => typeof a === 'string')) return args.join('');

  return args.map(encodeValueForStdin).join('') ;
}

function encodeValueForStdin(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}\n`;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number' || typeof v === 'boolean')) {
      return `${value.join(' ')}\n`;
    }
    return value.map(encodeValueForStdin).join('');
  }
  return `${JSON.stringify(value)}\n`;
}

/** Canonical stdout text we expect for a kata `expected` value. */
export function encodeExpectedStdout(expected) {
  if (expected == null) return '';
  if (typeof expected === 'string') return expected;
  if (typeof expected === 'number' || typeof expected === 'boolean') {
    return String(expected);
  }
  if (Array.isArray(expected)) {
    if (expected.every((v) => typeof v === 'number' || typeof v === 'boolean')) {
      return expected.join(' ');
    }
    return expected.map(encodeExpectedStdout).join('\n');
  }
  return JSON.stringify(expected);
}

export function normalizeStdout(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/u, '');
}

export function outputsMatch(actual, expected) {
  const a = normalizeStdout(actual);
  const e = normalizeStdout(
    typeof expected === 'string' ? expected : encodeExpectedStdout(expected),
  );
  if (a === e) return true;

  // Also accept token-wise equality (spacing / newline differences)
  const at = a.trim().split(/\s+/).filter(Boolean);
  const et = e.trim().split(/\s+/).filter(Boolean);
  return at.length > 0 && at.length === et.length && at.every((t, i) => t === et[i]);
}
