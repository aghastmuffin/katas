import { loadPyodide, type PyodideInterface } from 'pyodide';

let pyodide: PyodideInterface | null = null;
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v314.0.3/full/';

const initPyodide = async () => {
  pyodide = await loadPyodide({
    indexURL: PYODIDE_INDEX,
  });

  pyodide.setStdout({ batched: (msg) => self.postMessage({ type: 'stdout', msg }) });
  pyodide.setStderr({ batched: (msg) => self.postMessage({ type: 'stderr', msg }) });

  self.postMessage({ type: 'READY' });
};

const pyodideReadyPromise = initPyodide();

self.onmessage = async (e: MessageEvent) => {
  const { id, code } = e.data;
  await pyodideReadyPromise;

  if (!pyodide) return;

  try {
    await pyodide.loadPackagesFromImports(code);
    const result = await pyodide.runPythonAsync(code);
    self.postMessage({ type: 'done', id, result: result?.toString() });
  } catch (err: any) {
    self.postMessage({ type: 'error', id, error: err.message });
  }
};
