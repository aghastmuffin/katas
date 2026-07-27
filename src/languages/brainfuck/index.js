import { compileBrainfuck } from './compile.js';
import {
  encodeExpectedStdout,
  encodeStdin,
  outputsMatch,
} from './harness.js';

let editorRegistered = false;

function registerBrainfuckLanguage(monaco) {
  if (editorRegistered) return;
  editorRegistered = true;

  monaco.languages.register({ id: 'brainfuck' });
  monaco.languages.setMonarchTokensProvider('brainfuck', {
    tokenizer: {
      root: [
        [/[<>]/, 'keyword'],
        [/[+-]/, 'operator'],
        [/[\[\]]/, 'type'],
        [/[,.]/, 'string'],
        [/[^<>+\-\[\].,]+/, 'comment'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration('brainfuck', {
    brackets: [['[', ']']],
    autoClosingPairs: [{ open: '[', close: ']' }],
    surroundingPairs: [{ open: '[', close: ']' }],
  });
}

function createWorker() {
  const source = `
    self.onmessage = function (e) {
      try {
        (new Function(e.data.H))();
      } catch (err) {
        self.postMessage({ s: 99, error: String(err && err.message ? err.message : err) });
      }
    };
  `;
  const blob = new Blob([source], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  return { worker, url };
}

/**
 * Run one BF program with the given stdin; resolves with collected stdout.
 * Same I/O model as El Brainfuck's input field + output pane.
 *
 * Kata runs use EOF → 0 so loops like `,[.,]` terminate; free-run keeps
 * El Brainfuck's default (EOF leaves cell unchanged).
 */
function runOnce(code, stdin, { signal, eofZero = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const compiled = compileBrainfuck(code, stdin, eofZero
      ? { eofNoChange: false, eofChar: '\0' }
      : {});
    if (compiled.error) {
      reject(new Error(compiled.error.message));
      return;
    }

    const { worker, url } = createWorker();
    let stdout = '';
    let settled = false;

    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      signal?.removeEventListener?.('abort', onAbort);
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onAbort = () => finish(reject, new Error('Aborted'));
    signal?.addEventListener?.('abort', onAbort, { once: true });

    worker.onmessage = (e) => {
      const data = e.data || {};
      if (data.o?.length) {
        stdout += String.fromCharCode.apply(String, data.o);
      }
      if (data.s === -1) {
        finish(resolve, stdout);
      } else if (data.s === 3) {
        finish(reject, new Error('Memory border overflow'));
      } else if (data.s === 4) {
        finish(reject, new Error('Memory border underflow'));
      } else if (data.s === 99) {
        finish(reject, new Error(data.error || 'Brainfuck runtime error'));
      }
    };

    worker.onerror = (err) => {
      finish(reject, new Error(err.message || 'Brainfuck worker error'));
    };

    worker.postMessage(compiled.ok);
  });
}

const activeSessions = new Set();

const brainfuck = {
  id: 'brainfuck',
  label: 'Brainfuck',
  monacoLanguage: 'brainfuck',
  shikiLangs: [],
  /** Kata tests via stdin/stdout (El Brainfuck input field, programmatic). */
  supportsKataTests: true,

  isReady() {
    return true;
  },

  async loadDependencies() {},

  /** Abort any in-flight BF workers when leaving this language. */
  async unload() {
    for (const session of [...activeSessions]) {
      try {
        session.stop?.();
      } catch {
        /* ignore */
      }
    }
    activeSessions.clear();
  },

  async registerEditor(monaco) {
    registerBrainfuckLanguage(monaco);
  },

  createRunSession(handlers = {}) {
    let abortController = null;

    const stop = () => {
      abortController?.abort();
      abortController = null;
      activeSessions.delete(session);
    };

    const session = {
      async start({ code, testCases = [], stdin = '' }) {
        stop();
        abortController = new AbortController();
        activeSessions.add(session);
        const { signal } = abortController;

        try {
          if (testCases.length) {
            const results = [];

            for (let i = 0; i < testCases.length; i++) {
              if (signal.aborted) throw new Error('Aborted');

              const tc = testCases[i];
              const caseStdin = encodeStdin(tc.input ?? []);
              const expectedText = encodeExpectedStdout(tc.expected);

              try {
                const stdout = await runOnce(code, caseStdin, {
                  signal,
                  eofZero: true,
                });
                if (stdout) {
                  handlers.onStdout?.(
                    (testCases.length > 1 ? `[case ${i + 1}] ` : '') + stdout,
                  );
                  if (!stdout.endsWith('\n')) handlers.onStdout?.('\n');
                }

                const passed = outputsMatch(stdout, tc.expected);
                results.push({
                  index: i,
                  input: tc.input ?? [],
                  expected: tc.expected,
                  returned: normalizeReturned(stdout, tc.expected),
                  passed,
                  error: passed
                    ? null
                    : `stdout ${JSON.stringify(stdout)} !== expected ${JSON.stringify(expectedText)}`,
                });
              } catch (err) {
                if (signal.aborted || err.message === 'Aborted') throw err;
                handlers.onStderr?.(String(err.message || err) + '\n');
                results.push({
                  index: i,
                  input: tc.input ?? [],
                  expected: tc.expected,
                  returned: null,
                  passed: false,
                  error: String(err.message || err),
                });
              }
            }

            handlers.onResults?.(results);
            handlers.onDone?.();
          } else {
            const stdout = await runOnce(code, stdin, { signal });
            if (stdout) handlers.onStdout?.(stdout);
            handlers.onDone?.();
          }
        } catch (err) {
          if (err.message !== 'Aborted') {
            handlers.onError?.(String(err.message || err));
          }
          handlers.onDone?.();
        } finally {
          abortController = null;
          activeSessions.delete(session);
        }
      },
      stop,
    };

    return session;
  },
};

/** Prefer structured return when expected was structured; else raw stdout. */
function normalizeReturned(stdout, expected) {
  const text = String(stdout ?? '');
  if (typeof expected === 'number') {
    const n = Number(text.trim());
    return Number.isFinite(n) ? n : text;
  }
  if (
    Array.isArray(expected) &&
    expected.every((v) => typeof v === 'number')
  ) {
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length === expected.length && parts.every((p) => /^-?\d+$/.test(p))) {
      return parts.map(Number);
    }
  }
  return text;
}

export default brainfuck;
