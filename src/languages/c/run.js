import { twrWasmModule, twrConsoleDiv } from 'twr-wasm';
import { compileC } from './compile.js';
import {
  buildExecSuffix,
  consumeKataResults,
  hasMain,
  extractCFnName,
} from './harness.js';

/**
 * Capture printf via a hidden twrConsoleDiv.
 */
function createCaptureConsole() {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  el.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(el);
  const con = new twrConsoleDiv(el);
  return {
    con,
    el,
    read() {
      return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ');
    },
    dispose() {
      try {
        el.remove();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Compile and run C source with optional kata tests.
 * @returns {Promise<{ stdout: string, results: object[] | null }>}
 */
export async function runCSource({
  code,
  testCases = [],
  signal,
  onLog,
} = {}) {
  if (signal?.aborted) throw new Error('Aborted');

  const hasTests = Array.isArray(testCases) && testCases.length > 0;
  let source = code;

  if (hasTests) {
    const fn = extractCFnName(code);
    onLog?.('stdout', `[c] Kata entry: ${fn || '(not found)'}\n`);
    const suffix = buildExecSuffix(code, testCases);
    if (!suffix) {
      throw new Error(
        'Could not find a C function to test. Define a function like: int solution(...) { ... }',
      );
    }
    source = `${code}\n${suffix}`;
    onLog?.(
      'stdout',
      `[c] Appended harness for ${testCases.length} test case(s)\n`,
    );
  } else if (!hasMain(code)) {
    throw new Error(
      'No main() found. Add int main(void) { ... } or run with kata tests.',
    );
  } else {
    onLog?.('stdout', '[c] Free-run entry: main\n');
  }

  const linkExports = hasTests ? ['__kata_run'] : ['main'];
  const wasmBytes = await compileC(source, {
    exports: linkExports,
    onLog,
    verbose: true,
  });
  if (signal?.aborted) throw new Error('Aborted');

  onLog?.('stdout', '[c] Loading Wasm module via twr-wasm…\n');
  const capture = createCaptureConsole();
  let blobUrl = null;

  try {
    const blob = new Blob([wasmBytes], { type: 'application/wasm' });
    blobUrl = URL.createObjectURL(blob);

    const mod = new twrWasmModule({
      io: { stdio: capture.con, stderr: capture.con },
    });
    await mod.loadWasm(blobUrl);
    if (signal?.aborted) throw new Error('Aborted');

    const entry = hasTests ? '__kata_run' : 'main';
    onLog?.('stdout', `[c] callC(["${entry}"])\n`);
    await mod.callC([entry]);

    const raw = capture.read();
    if (hasTests) {
      const parsed = consumeKataResults(raw);
      onLog?.(
        'stdout',
        `[c] Kata results: ${parsed.results ? parsed.results.length : 0} case(s)\n`,
      );
      return parsed;
    }
    return { stdout: raw, results: null };
  } finally {
    capture.dispose();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}
