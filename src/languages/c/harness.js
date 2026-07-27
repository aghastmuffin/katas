export const KATA_RESULTS_PREFIX = '__KATA_RESULTS__';

const SKIP_FNS = new Set(['main', '__kata_run']);

/**
 * Extract the first user C function name from source.
 */
export function extractCFnName(code) {
  const text = String(code || '');
  const re =
    /(?:^|\n)\s*(?:(?:static|inline|extern|const|unsigned|signed|long|short|struct|enum|void|int|char|float|double|bool|size_t|[\w*]+)\s+)+([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/g;
  let match;
  while ((match = re.exec(text))) {
    const name = match[1];
    if (!SKIP_FNS.has(name)) return name;
  }
  return null;
}

export function hasMain(code) {
  return /(?:^|\n)\s*(?:int|void)\s+main\s*\(/.test(String(code || ''));
}

/** Embed a JSON fragment inside a C "..." string literal. */
function embedJsonInCString(json) {
  return String(json).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function cLiteral(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0';
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return '0';
}

function isIntList(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'number');
}

function inferArgKind(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'double';
  }
  if (typeof value === 'boolean') return 'int';
  if (typeof value === 'string') return 'string';
  if (isIntList(value)) return 'int[]';
  return 'int';
}

function inferReturnKind(expected) {
  if (expected === null || expected === undefined) return 'void';
  if (typeof expected === 'boolean') return 'int';
  if (typeof expected === 'number') {
    return Number.isInteger(expected) ? 'int' : 'double';
  }
  if (typeof expected === 'string') return 'string';
  if (isIntList(expected)) return 'int[]';
  return 'int';
}

function emitArg(arg, index, decls, callArgs) {
  const kind = inferArgKind(arg);
  const base = `__a${index}`;

  if (kind === 'int') {
    decls.push(`    int ${base} = ${cLiteral(Number(arg))};`);
    callArgs.push(base);
    return;
  }
  if (kind === 'double') {
    decls.push(`    double ${base} = ${cLiteral(Number(arg))};`);
    callArgs.push(base);
    return;
  }
  if (kind === 'string') {
    decls.push(`    const char* ${base} = ${JSON.stringify(arg)};`);
    callArgs.push(base);
    return;
  }
  if (kind === 'int[]') {
    const elems = arg.map((n) => cLiteral(n)).join(', ') || '0';
    const len = arg.length;
    // Match boilerplate convention: `int* name, int nameSize`
    if (len === 0) {
      decls.push(`    int* ${base} = NULL;`);
      decls.push(`    int ${base}Size = 0;`);
    } else {
      decls.push(`    int ${base}[] = { ${elems} };`);
      decls.push(`    int ${base}Size = ${len};`);
    }
    callArgs.push(base, `${base}Size`);
  }
}

/**
 * Harness appended after user C code. Emits __KATA_RESULTS__ JSON via printf.
 */
export function buildExecSuffix(code, testCases) {
  const fn = extractCFnName(code);
  if (!fn || !testCases?.length) return '';

  const retKind = inferReturnKind(testCases[0]?.expected);
  const cases = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const input = Array.isArray(tc.input) ? tc.input : [];
    const decls = [];
    const callArgs = [];

    for (let a = 0; a < input.length; a++) {
      emitArg(input[a], a, decls, callArgs);
    }

    const inputJson = embedJsonInCString(JSON.stringify(input));
    const expectedJson = embedJsonInCString(JSON.stringify(tc.expected));

    let prep = '';
    let callLine = '';
    let passLine = '';
    let printfLine = '';

    if (retKind === 'int[]') {
      const elems = (tc.expected || []).map((n) => cLiteral(n)).join(', ') || '0';
      const len = Array.isArray(tc.expected) ? tc.expected.length : 0;
      decls.push(`    int __exp[] = { ${elems} };`);
      decls.push(`    int __exp_len = ${len};`);
      decls.push(`    int __ret_len = 0;`);
      callArgs.push('&__ret_len');
      callLine = `    int* __got = ${fn}(${callArgs.join(', ')});`;
      passLine = `
    int __passed = (__got != NULL || __exp_len == 0) && __ret_len == __exp_len;
    if (__passed) {
      for (int __j = 0; __j < __ret_len; __j++) {
        if (__got[__j] != __exp[__j]) { __passed = 0; break; }
      }
    }
`;
      printfLine = `
    if (${i} > 0) printf(",");
    printf("{\\"index\\":${i},\\"input\\":${inputJson},\\"expected\\":${expectedJson},\\"returned\\":[");
    for (int __j = 0; __j < __ret_len; __j++) {
      if (__j) printf(",");
      printf("%d", __got[__j]);
    }
    printf("],\\"passed\\":%s,\\"error\\":null}", __passed ? "true" : "false");
`;
    } else if (retKind === 'double') {
      callLine = `    double __got = ${fn}(${callArgs.join(', ') || ''});`;
      decls.push(`    double __exp = ${cLiteral(Number(tc.expected))};`);
      passLine = `    int __passed = (fabs(__got - __exp) < 1e-6) ? 1 : 0;\n`;
      printfLine = `
    if (${i} > 0) printf(",");
    printf("{\\"index\\":${i},\\"input\\":${inputJson},\\"expected\\":${expectedJson},\\"returned\\":%g,\\"passed\\":%s,\\"error\\":null}", __got, __passed ? "true" : "false");
`;
    } else if (retKind === 'string') {
      callLine = `    const char* __got = ${fn}(${callArgs.join(', ') || ''});`;
      decls.push(`    const char* __exp = ${JSON.stringify(String(tc.expected))};`);
      passLine = `    int __passed = (__got && strcmp(__got, __exp) == 0) ? 1 : 0;\n`;
      printfLine = `
    if (${i} > 0) printf(",");
    printf("{\\"index\\":${i},\\"input\\":${inputJson},\\"expected\\":${expectedJson},\\"returned\\":\\"%s\\",\\"passed\\":%s,\\"error\\":null}", __got ? __got : "", __passed ? "true" : "false");
`;
    } else if (retKind === 'void') {
      callLine = `    ${fn}(${callArgs.join(', ') || ''});`;
      passLine = `    int __passed = 1;\n`;
      printfLine = `
    if (${i} > 0) printf(",");
    printf("{\\"index\\":${i},\\"input\\":${inputJson},\\"expected\\":${expectedJson},\\"returned\\":null,\\"passed\\":true,\\"error\\":null}");
`;
    } else {
      callLine = `    int __got = ${fn}(${callArgs.join(', ') || ''});`;
      decls.push(`    int __exp = ${cLiteral(Number(tc.expected))};`);
      passLine = `    int __passed = (__got == __exp) ? 1 : 0;\n`;
      printfLine = `
    if (${i} > 0) printf(",");
    printf("{\\"index\\":${i},\\"input\\":${inputJson},\\"expected\\":${expectedJson},\\"returned\\":%d,\\"passed\\":%s,\\"error\\":null}", __got, __passed ? "true" : "false");
`;
    }

    cases.push(`
  /* case ${i} */
  {
${decls.join('\n')}
${callLine}
${passLine}${printfLine}
  }
`);
  }

  return `
#include <stdio.h>
#include <string.h>
#include <math.h>

__attribute__((export_name("__kata_run")))
void __kata_run(void) {
  printf("${KATA_RESULTS_PREFIX}[");
${cases.join('\n')}
  printf("]\\n");
}
`;
}

export function consumeKataResults(chunk) {
  const idx = chunk.indexOf(KATA_RESULTS_PREFIX);
  if (idx === -1) return { stdout: chunk, results: null };

  const before = chunk.slice(0, idx);
  const after = chunk.slice(idx + KATA_RESULTS_PREFIX.length);
  const nl = after.indexOf('\n');
  const jsonPart = nl === -1 ? after : after.slice(0, nl);
  const leftover = nl === -1 ? '' : after.slice(nl + 1);

  let results = null;
  try {
    results = JSON.parse(jsonPart);
  } catch (err) {
    console.error('Failed to parse C kata results', err, jsonPart);
  }

  return { stdout: before + leftover, results };
}
