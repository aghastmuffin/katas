import { loadPyodide, type PyodideInterface } from 'pyodide';

let pyodide: PyodideInterface | null = null;

const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v314.0.3/full/';

// Initialize Pyodide & Jedi on worker startup
// @ts-ignore
const initPyodide = async () => {
  pyodide = await loadPyodide({
    indexURL: PYODIDE_INDEX,
  });

  await pyodide.loadPackage('jedi');

  await pyodide.runPythonAsync(`
import jedi

def get_completions(code, line, column):
    try:
        script = jedi.Script(code)
        completions = script.complete(line, column - 1)
        return [
            {
                "name": c.name,
                "type": c.type,
                "docstring": c.docstring(raw=True)
            }
            for c in completions
        ]
    except Exception:
        return []
`);

  self.postMessage({ type: 'READY' });
};

const pyodideReadyPromise = initPyodide();

// @ts-ignore
self.onmessage = async (e: MessageEvent) => {
  const { id, code, line, column } = e.data;
  await pyodideReadyPromise;

  if (!pyodide) return;

  try {
    const getCompletions = pyodide.globals.get('get_completions');
    const pyResult = getCompletions(code, line, column);
    const completions = pyResult.toJs();
    pyResult.destroy();

    self.postMessage({ id, completions });
  } catch {
    self.postMessage({ id, completions: [] });
  }
};

