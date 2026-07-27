import ExecutionWorker from '../../execution-pyodide.worker.ts?worker';
import PyodideWorker from '../../autocomplete-pyodide.worker.ts?worker';
import { buildExecSuffix, consumeKataResults } from './harness.js';

let jediReady = false;
let autocompleteWorker = null;
let completionDisposable = null;
let requestId = 0;
const pendingRequests = new Map();
let activeRunWorkers = new Set();

function setBlinkerReady() {
  const blinker = document.getElementById('blinker');
  if (blinker) blinker.style.backgroundColor = '#00ff33';
}

function mapJediTypeToMonaco(monaco, type) {
  switch (type) {
    case 'function':
      return monaco.languages.CompletionItemKind.Function;
    case 'module':
      return monaco.languages.CompletionItemKind.Module;
    case 'class':
      return monaco.languages.CompletionItemKind.Class;
    case 'param':
    case 'statement':
      return monaco.languages.CompletionItemKind.Variable;
    default:
      return monaco.languages.CompletionItemKind.Property;
  }
}

function killAutocomplete() {
  if (autocompleteWorker) {
    autocompleteWorker.terminate();
    autocompleteWorker = null;
  }
  jediReady = false;
  pendingRequests.clear();
}

function killRunWorkers() {
  for (const worker of activeRunWorkers) {
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
  }
  activeRunWorkers.clear();
}

const python = {
  id: 'python',
  label: 'Python',
  monacoLanguage: 'python',
  shikiLangs: ['python'],
  supportsKataTests: true,

  isReady() {
    return jediReady;
  },

  async loadDependencies() {
    // Autocomplete worker is started in registerEditor.
  },

  /**
   * Tear down Pyodide autocomplete + any live execution workers so they
   * leave memory when another language is selected.
   */
  async unload() {
    killRunWorkers();
    killAutocomplete();
    completionDisposable?.dispose?.();
    completionDisposable = null;
  },

  async registerEditor(monaco) {
    if (autocompleteWorker) {
      if (jediReady) setBlinkerReady();
      return;
    }

    autocompleteWorker = new PyodideWorker();
    autocompleteWorker.onmessage = (e) => {
      const { id, completions, type } = e.data;
      if (type === 'READY') {
        jediReady = true;
        setBlinkerReady();
        return;
      }
      const resolve = pendingRequests.get(id);
      if (resolve) {
        resolve(completions);
        pendingRequests.delete(id);
      }
    };

    completionDisposable?.dispose?.();
    completionDisposable = monaco.languages.registerCompletionItemProvider(
      'python',
      {
        triggerCharacters: ['.', ' '],
        provideCompletionItems: (model, position) =>
          new Promise((resolve) => {
            if (!autocompleteWorker) {
              resolve({ suggestions: [] });
              return;
            }
            const id = ++requestId;
            const wordInfo = model.getWordUntilPosition(position);

            pendingRequests.set(id, (completions) => {
              const suggestions = (completions || []).map((item) => ({
                label: item.name,
                kind: mapJediTypeToMonaco(monaco, item.type),
                insertText: item.name,
                documentation: item.docstring || '',
                range: {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: wordInfo.startColumn,
                  endColumn: wordInfo.endColumn,
                },
              }));
              resolve({ suggestions });
            });

            autocompleteWorker.postMessage({
              id,
              code: model.getValue(),
              line: position.lineNumber,
              column: position.column,
            });
          }),
      },
    );
  },

  createRunSession(handlers = {}) {
    let worker = null;

    const stop = () => {
      if (worker) {
        activeRunWorkers.delete(worker);
        worker.terminate();
        worker = null;
      }
    };

    return {
      start({ code, testCases = [] }) {
        stop();
        worker = new ExecutionWorker();
        activeRunWorkers.add(worker);
        worker.onmessage = (e) => {
          const { type } = e.data;
          if (type === 'READY') {
            const suffix = buildExecSuffix(code, testCases);
            worker.postMessage({ id: 1, code: code + suffix });
          } else if (type === 'stdout' || type === 'stderr') {
            const { stdout, results } = consumeKataResults(e.data.msg);
            if (results) handlers.onResults?.(results);
            if (stdout) {
              if (type === 'stderr') handlers.onStderr?.(stdout);
              else handlers.onStdout?.(stdout);
            }
          } else if (type === 'done') {
            handlers.onDone?.({ result: e.data.result });
            stop();
          } else if (type === 'error') {
            handlers.onError?.(e.data.error || 'Unknown error');
            stop();
          }
        };
      },
      stop,
    };
  },
};

export default python;
