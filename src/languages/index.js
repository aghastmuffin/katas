/**
 * Language registry — add a folder under `languages/<id>/` and register it here.
 *
 * Each language module should export a descriptor shaped like:
 * {
 *   id, label, monacoLanguage,
 *   supportsKataTests,
 *   loadDependencies(),   // optional: heavy runtime (pyodide, wasm, …)
 *   unload(),             // free workers / wasm when another language is active
 *   registerEditor(monaco),
 *   createRunSession(handlers),
 *   isReady(),
 * }
 */

import python from './python/index.js';
import brainfuck from './brainfuck/index.js';
import c from './c/index.js';

const registry = new Map([
  [python.id, python],
  [brainfuck.id, brainfuck],
  [c.id, c],
]);

let activeId = python.id;
const listeners = new Set();

export function listLanguages() {
  return [...registry.values()];
}

export function getLanguage(id) {
  const lang = registry.get(id);
  if (!lang) throw new Error(`Unknown language: ${id}`);
  return lang;
}

export function getActiveLanguage() {
  return getLanguage(activeId);
}

export function getActiveLanguageId() {
  return activeId;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Activate one language and unload every other runtime (pyodide, bf workers, …).
 */
export async function setActiveLanguage(id) {
  if (!registry.has(id)) throw new Error(`Unknown language: ${id}`);

  const lang = getLanguage(id);
  const switching = id !== activeId;

  if (switching) {
    for (const [otherId, other] of registry) {
      if (otherId === id) continue;
      try {
        await other.unload?.();
      } catch (err) {
        console.warn(`Failed to unload language ${otherId}`, err);
      }
    }
  }

  await lang.loadDependencies?.();
  activeId = id;

  if (switching) {
    for (const fn of listeners) fn(lang);
  }
  return lang;
}

export function registerLanguage(lang) {
  if (!lang?.id) throw new Error('Language must have an id');
  registry.set(lang.id, lang);
}

export {
  boilerplateFor,
  resolveStarterCode,
  mapType,
  normalizeBoilerplate,
} from './boilerplate.js';
