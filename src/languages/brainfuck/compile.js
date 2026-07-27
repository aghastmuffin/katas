/**
 * Brainfuck → JS compiler, adapted from El Brainfuck (copy.sh/brainfuck).
 * Compiles BF source into a string that runs inside a dedicated worker.
 */

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function modInverse(a, m) {
  let c = 1;
  let e = 0;
  let f = a;
  let g = m;
  while (g !== 1) {
    const q = (f / g) | 0;
    const nextC = e;
    e = c - e * q;
    c = nextC;
    const nextF = g;
    g = f % g;
    f = nextF;
  }
  return e;
}

function indexOf(arr, value, from = 0) {
  for (let i = from; i < arr.length; i++) {
    if (arr[i] === value) return i;
  }
  return -1;
}

function posAt(chars, index) {
  const pos = { line: 1, col: 0 };
  for (let i = 0; i < index; i++) {
    if (chars[i] === '\n') {
      pos.line++;
      pos.col = 0;
    } else {
      pos.col++;
    }
  }
  return pos;
}

function unescapeInput(str, cellBits) {
  const mod = 2 ** cellBits;
  return String(str).replace(
    /\\(?:x[0-9a-f]{1,4}|\d{1,3}|[nrt\\])/gi,
    (match) => {
      switch (match[1].toLowerCase()) {
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case '\\':
          return '\\';
        case 'x':
          return String.fromCharCode(parseInt(match.substring(2), 16) % mod);
        default:
          return String.fromCharCode(parseInt(match.substring(1), 10) % mod);
      }
    },
  );
}

/**
 * @param {string} source
 * @param {string} [stdin]
 * @param {object} [options]
 * @returns {{ ok?: { H: string }, error?: { message: string, line: number, col: number } }}
 */
export function compileBrainfuck(source, stdin = '', options = {}) {
  const cellBits = options.cellBits ?? 8;
  const memorySize = options.memorySize ?? 30000;
  const dynamicMemory = options.dynamicMemory ?? false;
  const wrapOverflow = options.wrapOverflow ?? false;
  const undefOverflow = options.undefOverflow ?? true;
  const eofNoChange = options.eofNoChange ?? true;
  const eofChar = unescapeInput(options.eofChar ?? '\n', cellBits);
  const countInstructions = options.countInstructions ?? false;
  const dumpMemory = options.dumpMemory ?? false;
  const dumpChar = options.dumpChar ?? '#';

  const chars = String(source).split('');
  const input = unescapeInput(stdin, cellBits);
  const y = chars.length;
  const ptrStack = [0];
  let needsBounds = false;
  let body = '';
  const instrCounts = [0];
  const valid = '<>+-,.[]' + (dumpMemory ? dumpChar : '');
  const cellMax = 2 ** cellBits - 1;
  let dumpIndex = 0;
  let depth = 0;
  let openAt = 0;
  const useTyped =
    !dynamicMemory && typeof ArrayBuffer !== 'undefined';

  const ptrExpr = (offset) => {
    const n = ptrStack[ptrStack.length - 1] + offset;
    const p = n > 0 ? `p+${n}` : n === 0 ? 'p' : `p${n}`;
    return wrapOverflow ? `u(${p})` : p;
  };

  const movePtr = (delta) => {
    if (delta > 0) return `p+=${delta};`;
    if (delta < 0) return `p-=${-delta};`;
    return '';
  };

  const flushBounds = () => {
    if (!needsBounds) return;
    needsBounds = false;
    if (dynamicMemory) {
      body += `for(;${ptrExpr(0)}<0;p++)m.unshift(0);for(;${ptrExpr(0)}>=m.length;)m.push(0);`;
    } else if (!wrapOverflow && !undefOverflow) {
      body += `if(${ptrExpr(0)}>=${memorySize})return self.postMessage({s:3,o:o,m:m,p:${ptrExpr(0)},n:-1,k:${lastOp}});`;
      body += `if(${ptrExpr(0)}<0)return self.postMessage({s:4,o:o,m:m,p:${ptrExpr(0)},n:-1,k:${lastOp}});`;
    }
  };

  let lastOp = 0;

  for (let k = 0; k < y; k++) {
    lastOp = k;
    const ch = chars[k];

    if (ch === '+' || ch === '-') {
      let v = 1;
      for (; k < y; k++) {
        if (chars[k + 1] === ch) v++;
        else if (valid.includes(chars[k + 1])) break;
      }
      if (countInstructions) instrCounts[instrCounts.length - 1] += v;
      flushBounds();

      if (ch === '+') {
        if (useTyped) {
          body +=
            v === 1
              ? `m[${ptrExpr(0)}]++;`
              : `m[${ptrExpr(0)}]+=${v};`;
        } else if (v === 1) {
          body += `m[${ptrExpr(0)}]===${cellMax}?(m[${ptrExpr(0)}]=0):m[${ptrExpr(0)}]++;`;
        } else {
          body += `m[${ptrExpr(0)}]=m[${ptrExpr(0)}]>${cellMax - v}?(m[${ptrExpr(0)}]+${v})%${cellMax + 1}:m[${ptrExpr(0)}]+${v};`;
        }
      } else if (useTyped) {
        body +=
          v === 1
            ? `m[${ptrExpr(0)}]--;`
            : `m[${ptrExpr(0)}]-=${v};`;
      } else if (v === 1) {
        body += `m[${ptrExpr(0)}]===0?(m[${ptrExpr(0)}]=${cellMax}):m[${ptrExpr(0)}]--;`;
      } else {
        body += `m[${ptrExpr(0)}]=m[${ptrExpr(0)}]<${v}?${cellMax - v + 1}+m[${ptrExpr(0)}]:m[${ptrExpr(0)}]-${v};`;
      }
      continue;
    }

    if (ch === '>') {
      ptrStack[ptrStack.length - 1]++;
      instrCounts[instrCounts.length - 1]++;
      needsBounds = true;
      continue;
    }

    if (ch === '<') {
      ptrStack[ptrStack.length - 1]--;
      instrCounts[instrCounts.length - 1]++;
      needsBounds = true;
      continue;
    }

    if (ch === '[' || ch === ']' || ch === '.' || ch === ',') {
      flushBounds();
    }

    if (ch === '[') {
      const close = indexOf(chars, ']', k);
      let optimized = false;

      if (
        close !== -1 &&
        close < (indexOf(chars, '[', k + 1) + 1 || 1e9) &&
        close < (indexOf(chars, '.', k) + 1 || 1e9) &&
        close < (indexOf(chars, ',', k) + 1 || 1e9) &&
        (!dumpMemory || close < (indexOf(chars, dumpChar, k) + 1 || 1e9)) &&
        !dynamicMemory
      ) {
        const deltas = { 0: cellMax + 1 };
        let cost = 1;
        let ptr = 0;
        for (let u = 1; u < close - k; u++) {
          const d = chars[k + u];
          if (d === '+') {
            deltas[ptr]++;
            cost++;
          } else if (d === '-') {
            deltas[ptr]--;
            cost++;
          } else if (d === '<') {
            ptr--;
            cost++;
            if (!deltas[ptr]) deltas[ptr] = 0;
          } else if (d === '>') {
            ptr++;
            cost++;
            if (!deltas[ptr]) deltas[ptr] = 0;
          }
        }

        if (ptr === 0 && gcd(deltas[0], cellMax + 1) === 1) {
          body += `if((_=m[${ptrExpr(0)}])!==0){`;
          optimized = true;
          const inv = -modInverse(deltas[0], cellMax + 1) + cellMax + 1;
          for (const key of Object.keys(deltas)) {
            const off = Number(key);
            if (off === 0 || deltas[off] === 0) continue;
            const mul = (deltas[off] * inv) % (cellMax + 1);
            body += `m[${ptrExpr(off)}]+=_${mul === 1 ? '' : `*${mul}`}`;
            if (!useTyped) body += `%${cellMax + 1}`;
            body += ';';
          }
          if (countInstructions) body += `c+=m[${ptrExpr(0)}]*${cost};`;
          body += `m[${ptrExpr(0)}]=0;`;
          k = close;
          body += '}';
          if (countInstructions) body += 'c++;';
        }
      }

      if (!optimized) {
        body += `while(m[${ptrExpr(0)}]!==0){`;
        instrCounts[instrCounts.length - 1]++;
        instrCounts.push(0);
        ptrStack.push(ptrStack[ptrStack.length - 1]);
        depth++;
        openAt = k + 1;
      }
      continue;
    }

    if (ch === ']') {
      if (countInstructions) {
        body += `c+=${instrCounts.pop() + 1};`;
      } else {
        instrCounts.pop();
      }
      const prev = ptrStack.pop();
      body += movePtr(prev - ptrStack[ptrStack.length - 1]);
      body += '}';
      depth--;
      if (depth < 0) {
        const pos = posAt(chars, k);
        return {
          error: {
            message: `Syntax error: Unexpected closing bracket in line ${pos.line} char ${pos.col}.`,
            line: pos.line,
            col: pos.col,
          },
        };
      }
      continue;
    }

    if (ch === ',') {
      if (eofNoChange) body += `i.length&&(m[${ptrExpr(0)}]=i.pop());`;
      else
        body += `m[${ptrExpr(0)}]=i.length?i.pop():${eofChar.charCodeAt(0)};`;
      instrCounts[instrCounts.length - 1]++;
      continue;
    }

    if (ch === '.') {
      body += `q(m[${ptrExpr(0)}]);`;
      instrCounts[instrCounts.length - 1]++;
      continue;
    }

    if (dumpMemory && ch === dumpChar) {
      body += `self.postMessage({m:m,p:${ptrExpr(0)},k:${k},n:${dumpIndex++}});`;
    }
  }

  flushBounds();

  let trailing = 0;
  while (instrCounts.length) trailing += instrCounts.pop();
  if (countInstructions) body += `c+=${trailing};`;
  body += `return self.postMessage({s:-1,o:o,c:c,m:m,p:${ptrExpr(0)},n:-1});`;

  if (depth > 0) {
    const pos = posAt(chars, openAt);
    return {
      error: {
        message: `Syntax error: Unclosed bracket in line ${pos.line} char ${pos.col}.`,
        line: pos.line,
        col: pos.col,
      },
    };
  }

  const inputCodes = [];
  for (let i = input.length - 1; i >= 0; i--) {
    inputCodes.push(input.charCodeAt(i));
  }

  let preamble =
    "'use strict';var _,o=[],c=0,p=0,j=0,i=" +
    JSON.stringify(inputCodes) +
    ',';

  if (useTyped) {
    preamble += `m=new Uint${cellBits}Array(${memorySize});`;
  } else {
    preamble += 'm=[0];';
    if (!dynamicMemory) {
      preamble += `for(j=${memorySize};j>0;j--)m.push(0);`;
    }
  }

  // Stream each output byte immediately (matches our console UX)
  preamble += 'function q(i){self.postMessage({o:[i]})}';

  if (wrapOverflow) {
    preamble += `function u(n){n=n%${memorySize};return n<0?n+${memorySize}:n};`;
  }

  return { ok: { H: preamble + body } };
}
