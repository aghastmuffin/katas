import * as monaco from 'monaco-editor-core';
import editorWorker from 'monaco-editor-core/esm/vs/editor/editor.worker.start.js?worker';
import { createHighlighter } from 'shiki';
import { shikiToMonaco } from '@shikijs/monaco';

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};
import {
  getActiveLanguage,
  getLanguage,
  listLanguages,
  onLanguageChange,
  setActiveLanguage,
} from './languages/index.js';

let monacoBoot = null;
const liveEditors = new Set();
const loadedShiki = new Set();
let highlighter = null;

function setBlinkerColor(color) {
  const blinker = document.getElementById('blinker');
  if (blinker) blinker.style.backgroundColor = color;
}

async function ensureHighlighter(langs) {
  const needed = langs.filter((l) => !loadedShiki.has(l));
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['dark-plus'],
      langs: needed.length ? needed : ['python'],
    });
    for (const l of needed.length ? needed : ['python']) loadedShiki.add(l);
  } else if (needed.length) {
    await highlighter.loadLanguage(...needed);
    for (const l of needed) loadedShiki.add(l);
  }
  return highlighter;
}

async function bootMonaco() {
  if (monacoBoot) return monacoBoot;

  monacoBoot = (async () => {
    // Register shiki themes/langs for every known language once; heavy
    // runtimes (pyodide / bf workers) still load only when activated.
    const allShiki = [
      ...new Set(listLanguages().flatMap((l) => l.shikiLangs || [])),
    ];
    const hl = await ensureHighlighter(allShiki.length ? allShiki : ['python']);

    for (const lang of listLanguages()) {
      if (lang.monacoLanguage && lang.shikiLangs?.length) {
        monaco.languages.register({ id: lang.monacoLanguage });
      }
    }
    shikiToMonaco(hl, monaco);
  })();

  return monacoBoot;
}

async function activateLanguageRuntime(lang) {
  await lang.loadDependencies?.();
  await lang.registerEditor?.(monaco);
  setBlinkerColor(lang.isReady?.() ? '#00ff33' : '#FF0000');
}

/**
 * Create a Monaco editor for the currently active (or specified) language.
 */
export async function createCodeEditor(container, value = '', languageId) {
  await bootMonaco();
  if (languageId) await setActiveLanguage(languageId);
  const lang = getActiveLanguage();
  await activateLanguageRuntime(lang);

  const editor = monaco.editor.create(container, {
    value,
    language: lang.monacoLanguage,
    theme: 'dark-plus',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
  });

  liveEditors.add(editor);
  editor.onDidDispose(() => liveEditors.delete(editor));
  return editor;
}

/** @deprecated use createCodeEditor */
export async function createPythonEditor(container, value = '') {
  return createCodeEditor(container, value, 'python');
}

/**
 * Switch language: unload the previous runtime, load the new one, update editors.
 * @param {string} languageId
 * @param {{ getValue?: (editor) => string, setValue?: (editor, value: string) => void }} [hooks]
 */
export async function applyLanguageToEditors(languageId, hooks = {}) {
  const lang = await setActiveLanguage(languageId);
  await bootMonaco();
  await activateLanguageRuntime(lang);

  for (const editor of liveEditors) {
    const model = editor.getModel();
    if (!model) continue;
    monaco.editor.setModelLanguage(model, lang.monacoLanguage);
    if (hooks.setValue) {
      hooks.setValue(editor, hooks.getValue?.(editor) ?? editor.getValue());
    }
  }

  setBlinkerColor(lang.isReady?.() ? '#00ff33' : '#FF0000');
  return lang;
}

onLanguageChange((lang) => {
  setBlinkerColor(lang.isReady?.() ? '#00ff33' : '#FF0000');
});

export { getActiveLanguage, listLanguages, setActiveLanguage };
