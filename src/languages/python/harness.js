export const KATA_RESULTS_PREFIX = '__KATA_RESULTS__';

/** Extract the first Python `def name(` from starter/editor code. */
export function extractPythonFnName(code) {
  const match = String(code || '').match(/^\s*def\s+([A-Za-z_]\w*)\s*\(/m);
  return match?.[1] ?? null;
}

/**
 * Harness appended after user code. Calls the defined function per test case,
 * leaves user print() on real stdout, and emits one structured results line.
 */
export function buildExecSuffix(code, testCases) {
  const fn = extractPythonFnName(code);
  if (!fn || !testCases?.length) return '';

  const cases = testCases.map((tc) => ({
    input: tc.input || [],
    expected: tc.expected,
  }));
  const casesLiteral = JSON.stringify(JSON.stringify(cases));

  return `
import json as __kata_json
__kata_cases = __kata_json.loads(${casesLiteral})
__kata_results = []
for __i, __case in enumerate(__kata_cases):
    __inp = __case["input"]
    __exp = __case["expected"]
    try:
        __got = ${fn}(*__inp)
        __kata_results.append({
            "index": __i,
            "input": __inp,
            "expected": __exp,
            "returned": __got,
            "passed": __got == __exp,
            "error": None,
        })
    except Exception as __e:
        __kata_results.append({
            "index": __i,
            "input": __inp,
            "expected": __exp,
            "returned": None,
            "passed": False,
            "error": str(__e),
        })
print("${KATA_RESULTS_PREFIX}" + __kata_json.dumps(__kata_results, default=str))
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
    console.error('Failed to parse kata results', err);
  }

  return { stdout: before + leftover, results };
}
