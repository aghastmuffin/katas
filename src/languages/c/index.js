import {
  ensureCompilerReady,
  isCompilerReady,
} from './compile.js';
import { runCSource } from './run.js';

const activeSessions = new Set();

function setBlinkerReady() {
  const blinker = document.getElementById('blinker');
  if (blinker) blinker.style.backgroundColor = '#00ff33';
}

function makeOnLog(handlers) {
  return (level, msg) => {
    if (!msg) return;
    if (level === 'stderr') handlers.onStderr?.(msg);
    else handlers.onStdout?.(msg);
  };
}

const cLang = {
  id: 'c',
  label: 'C',
  monacoLanguage: 'c',
  shikiLangs: ['c'],
  supportsKataTests: true,

  isReady() {
    return isCompilerReady();
  },

  async loadDependencies() {
    if (isCompilerReady()) {
      setBlinkerReady();
      return;
    }
    await ensureCompilerReady(undefined, (level, msg) => {
      if (level === 'stderr') console.warn(msg);
      else console.log(msg);
    });
    setBlinkerReady();
  },

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

  async registerEditor(_monaco) {},

  createRunSession(handlers = {}) {
    let abortController = null;
    const onLog = makeOnLog(handlers);

    const stop = () => {
      abortController?.abort();
      abortController = null;
      activeSessions.delete(session);
    };

    const session = {
      async start({ code, testCases = [] }) {
        stop();
        abortController = new AbortController();
        activeSessions.add(session);
        const { signal } = abortController;

        try {
          onLog('stdout', '[c] Preparing toolchain…\n');
          await ensureCompilerReady(undefined, onLog);
          if (signal.aborted) throw new Error('Aborted');

          const { stdout, results } = await runCSource({
            code,
            testCases,
            signal,
            onLog,
          });

          if (stdout) handlers.onStdout?.(stdout);
          if (results) handlers.onResults?.(results);
          handlers.onDone?.();
        } catch (err) {
          if (err?.message !== 'Aborted') {
            handlers.onError?.(String(err?.message || err));
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

export default cLang;
