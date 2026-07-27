import { loadAll } from 'js-yaml';
import exampleYaml from './assets/example.yaml?raw';
import {
  applyLanguageToEditors,
  createCodeEditor,
  getActiveLanguage,
  listLanguages,
} from './editor.js';
import {
  getActiveLanguageId,
  getLanguage,
  resolveStarterCode,
} from './languages/index.js';

/** Build a styled DOM preview for a single value (array chips, scalars, etc.). */
function createValueView(value) {
  const root = document.createElement('div');
  root.className = 'value-view';

  if (value === undefined) {
    root.classList.add('is-empty');
    root.textContent = '—';
    return root;
  }

  if (value === null) {
    const chip = document.createElement('span');
    chip.className = 'value-chip is-null';
    chip.textContent = 'None';
    root.appendChild(chip);
    return root;
  }

  if (typeof value === 'boolean') {
    const chip = document.createElement('span');
    chip.className = `value-chip is-bool is-${value}`;
    chip.textContent = value ? 'True' : 'False';
    root.appendChild(chip);
    return root;
  }

  if (typeof value === 'number') {
    const chip = document.createElement('span');
    chip.className = 'value-chip is-number';
    chip.textContent = String(value);
    root.appendChild(chip);
    return root;
  }

  if (typeof value === 'string') {
    const chip = document.createElement('span');
    chip.className = 'value-chip is-string';
    chip.textContent = value;
    root.appendChild(chip);
    return root;
  }

  if (Array.isArray(value)) {
    // Nested arrays (matrix) → stacked rows; flat array → chip strip
    const isMatrix =
      value.length > 0 && value.every((item) => Array.isArray(item));

    if (isMatrix) {
      root.classList.add('is-matrix');
      for (const row of value) {
        root.appendChild(createArrayStrip(row));
      }
    } else {
      root.appendChild(createArrayStrip(value));
    }
    return root;
  }

  if (typeof value === 'object') {
    root.classList.add('is-object');
    for (const [key, entry] of Object.entries(value)) {
      const row = document.createElement('div');
      row.className = 'value-kv';
      const k = document.createElement('span');
      k.className = 'value-key';
      k.textContent = key;
      row.append(k, createValueView(entry));
      root.appendChild(row);
    }
    return root;
  }

  const chip = document.createElement('span');
  chip.className = 'value-chip';
  chip.textContent = String(value);
  root.appendChild(chip);
  return root;
}

function createArrayStrip(items) {
  const strip = document.createElement('div');
  strip.className = 'value-array';
  strip.setAttribute('role', 'list');

  if (!items.length) {
    const empty = document.createElement('span');
    empty.className = 'value-chip is-empty';
    empty.textContent = '∅';
    strip.appendChild(empty);
    return strip;
  }

  items.forEach((item, i) => {
    if (Array.isArray(item) || (item && typeof item === 'object')) {
      const nest = document.createElement('div');
      nest.className = 'value-array-item';
      nest.appendChild(createValueView(item));
      strip.appendChild(nest);
    } else {
      const cell = document.createElement('span');
      cell.className = 'value-cell';
      cell.setAttribute('role', 'listitem');
      cell.dataset.index = String(i);
      if (item === null) {
        cell.classList.add('is-null');
        cell.textContent = 'None';
      } else if (typeof item === 'string') {
        cell.classList.add('is-string');
        cell.textContent = item;
      } else if (typeof item === 'boolean') {
        cell.classList.add('is-bool');
        cell.textContent = item ? 'True' : 'False';
      } else {
        cell.textContent = String(item);
      }
      strip.appendChild(cell);
    }
  });

  return strip;
}

/** Render function args as labeled Input slots (not a raw JSON dump). */
function renderInputArgs(container, args) {
  container.replaceChildren();
  const list = Array.isArray(args) ? args : [args];

  if (!list.length) {
    container.appendChild(createValueView(undefined));
    return;
  }

  if (list.length === 1) {
    container.appendChild(createValueView(list[0]));
    return;
  }

  list.forEach((arg, i) => {
    const slot = document.createElement('div');
    slot.className = 'input-slot';
    const label = document.createElement('div');
    label.className = 'input-slot-label';
    label.textContent = `arg ${i + 1}`;
    slot.append(label, createValueView(arg));
    container.appendChild(slot);
  });
}

function renderValueInto(container, value, emptyLabel = '—') {
  container.replaceChildren();
  if (value === undefined) {
    const empty = createValueView(undefined);
    empty.textContent = emptyLabel;
    container.appendChild(empty);
    return;
  }
  container.appendChild(createValueView(value));
}

/** Collapsed hint/explanation — hidden until the learner reveals it. */
function createHintBlock(text) {
  const root = document.createElement('div');
  root.className = 'hint-block';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'hint-toggle';
  toggle.textContent = 'Show hint';

  const body = document.createElement('div');
  body.className = 'hint-body markdown';
  body.textContent = text;
  body.hidden = true;

  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    root.classList.toggle('is-open', open);
    toggle.textContent = open ? 'Hide hint' : 'Show hint';
  });

  root.append(toggle, body);
  return root;
}

/** Interactive test browser: click through cases showing input / expected / returned. */
function createTestPanel(testCases) {
  const root = document.createElement('div');
  root.className = 'test-panel';

  const header = document.createElement('div');
  header.className = 'test-panel-header';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'test-nav-btn';
  prevBtn.setAttribute('aria-label', 'Previous test case');
  prevBtn.textContent = '‹';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'test-nav-btn';
  nextBtn.setAttribute('aria-label', 'Next test case');
  nextBtn.textContent = '›';

  const title = document.createElement('div');
  title.className = 'test-panel-title';

  const status = document.createElement('span');
  status.className = 'test-status';

  const dots = document.createElement('div');
  dots.className = 'test-dots';

  header.append(prevBtn, title, nextBtn, status);
  root.append(header, dots);

  const fields = [
    ['Input', 'input'],
    ['Expected', 'expected'],
    ['Returned', 'returned'],
  ].map(([label, key]) => {
    const row = document.createElement('div');
    row.className = `test-field test-field-${key}`;
    const lab = document.createElement('div');
    lab.className = 'test-field-label';
    lab.textContent = label;
    const val = document.createElement('div');
    val.className = 'test-field-value';
    row.append(lab, val);
    root.appendChild(row);
    return { key, val, row };
  });

  const errorRow = document.createElement('div');
  errorRow.className = 'test-field test-field-error';
  errorRow.hidden = true;
  const errorLab = document.createElement('div');
  errorLab.className = 'test-field-label';
  errorLab.textContent = 'Error';
  const errorVal = document.createElement('div');
  errorVal.className = 'test-field-value';
  errorRow.append(errorLab, errorVal);
  root.appendChild(errorRow);

  let index = 0;
  let results = testCases.map((tc, i) => ({
    index: i,
    input: tc.input || [],
    expected: tc.expected,
    returned: undefined,
    passed: null,
    error: null,
  }));

  testCases.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'test-dot';
    dot.textContent = String(i + 1);
    dot.addEventListener('click', () => {
      index = i;
      render();
    });
    dots.appendChild(dot);
  });

  function render() {
    const total = results.length;
    const caseResult = results[index];
    title.textContent = `Test ${index + 1} of ${total}`;

    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= total - 1;

    status.className = 'test-status';
    if (caseResult.passed === true) {
      status.textContent = 'PASS';
      status.classList.add('is-pass');
    } else if (caseResult.passed === false) {
      status.textContent = 'FAIL';
      status.classList.add('is-fail');
    } else {
      status.textContent = 'Not run';
      status.classList.add('is-pending');
    }

    [...dots.children].forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      dot.classList.toggle('is-pass', results[i].passed === true);
      dot.classList.toggle('is-fail', results[i].passed === false);
    });

    for (const { key, val } of fields) {
      if (key === 'input') {
        renderInputArgs(val, caseResult.input || []);
      } else if (key === 'expected') {
        renderValueInto(val, caseResult.expected);
      } else {
        renderValueInto(
          val,
          caseResult.returned === undefined && !caseResult.error
            ? undefined
            : caseResult.returned,
        );
      }
    }

    if (caseResult.error) {
      errorRow.hidden = false;
      errorVal.textContent = caseResult.error;
    } else {
      errorRow.hidden = true;
      errorVal.textContent = '';
    }
  }

  prevBtn.addEventListener('click', () => {
    if (index > 0) {
      index -= 1;
      render();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (index < results.length - 1) {
      index += 1;
      render();
    }
  });

  render();

  return {
    el: root,
    allPassed() {
      return (
        results.length > 0 && results.every((r) => r.passed === true)
      );
    },
    setResults(nextResults) {
      if (!Array.isArray(nextResults) || !nextResults.length) return;
      results = nextResults.map((r, i) => ({
        index: i,
        input: r.input ?? testCases[i]?.input ?? [],
        expected: r.expected ?? testCases[i]?.expected,
        returned: r.returned,
        passed: r.passed,
        error: r.error ?? null,
      }));
      if (index >= results.length) index = 0;
      // Jump to first failure if any
      const failAt = results.findIndex((r) => r.passed === false);
      if (failAt >= 0) index = failAt;
      render();
    },
    reset() {
      results = testCases.map((tc, i) => ({
        index: i,
        input: tc.input || [],
        expected: tc.expected,
        returned: undefined,
        passed: null,
        error: null,
      }));
      index = 0;
      render();
    },
  };
}

async function fetchAndParseYAML(source) {
  try {
    let yamlText;

    if (typeof source === 'string' && source.includes('\n')) {
      yamlText = source;
    } else {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      yamlText = await response.text();
    }

    return loadAll(yamlText);
  } catch (error) {
    console.error('Error loading or parsing YAML:', error);
    document.body.innerHTML = '<h1>Could not load lesson YAML.</h1>';
    return null;
  }
}

export async function displayLesson(lessonId = 'two-pointers', endpoint = null) {
  let data = null;
  if (endpoint) {
    try {
      const response = await fetch(`${endpoint}${lessonId}.yaml`);
      if (response.ok) {
        const yamlText = await response.text();
        data = await fetchAndParseYAML(yamlText);
      }
    } catch (err) {
      console.warn(`Failed to fetch dynamic lesson: ${lessonId} from ${endpoint}`, err);
    }
  }

  if (!data) {
    const yamlText = exampleYaml;
    data = await fetchAndParseYAML(yamlText);
  }

  if (!data) return;

  // Index 0 is always the kata config / authors block
  await renderLesson(data, 1);
}

async function renderLesson(data, num) {
  const config = data[0] || {};
  const sublesson = data[num];

  if (!sublesson) {
    document.body.innerHTML = '<h1>Lesson not found.</h1>';
    return;
  }

  document.body.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = config.title || 'Lesson';
  document.body.appendChild(title);

  const interpreterstatus = document.createElement('div');
  interpreterstatus.classList.add('Istatus');

  const langSelect = document.createElement('select');
  langSelect.className = 'lang-select';
  langSelect.setAttribute('aria-label', 'Interpreter language');
  for (const lang of listLanguages()) {
    const opt = document.createElement('option');
    opt.value = lang.id;
    opt.textContent = lang.label;
    if (lang.id === getActiveLanguageId()) opt.selected = true;
    langSelect.appendChild(opt);
  }

  const blinker = document.createElement('div');
  blinker.classList.add('blinker');
  blinker.id = 'blinker';
  blinker.style.backgroundColor = getActiveLanguage().isReady?.()
    ? '#00ff33'
    : '#FF0000';

  interpreterstatus.append(langSelect, blinker);
  document.body.appendChild(interpreterstatus);

  const subtitle = document.createElement('p');
  subtitle.textContent = sublesson.lessontitle || '';
  document.body.appendChild(subtitle);

  const content = sublesson.content || [];
  const editorMounts = [];
  const hasNext = num + 1 < data.length && data[num + 1] != null;

  for (const item of content) {
    const isHint =
      item.type === 'hint' ||
      (item.type === 'markdown' && /^\s*#{1,6}[^\n]*\bhint\b/i.test(item.text || ''));

    if (isHint) {
      document.body.appendChild(createHintBlock(item.text || ''));
    } else if (item.type === 'markdown') {
      const block = document.createElement('div');
      block.className = 'markdown';
      block.textContent = item.text || '';
      document.body.appendChild(block);
    } else if (item.type === 'codeblock' || item.type === 'code') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-wrap';

      const playBtn = document.createElement('button');
      playBtn.className = 'run-btn';
      playBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
      playBtn.type = 'button';

      const editorEl = document.createElement('div');
      editorEl.className = 'editor';

      const outputEl = document.createElement('pre');
      outputEl.className = 'output-console';
      outputEl.hidden = true;

      wrap.appendChild(editorEl);
      wrap.appendChild(playBtn);
      wrap.appendChild(outputEl);
      document.body.appendChild(wrap);

      const activeId = getActiveLanguageId();
      const initialCode = resolveStarterCode(item, activeId);

      editorMounts.push({
        el: editorEl,
        codeblock: item,
        code: initialCode,
        playBtn,
        outputEl,
        wrap,
        testCases: [],
        testPanel: null,
        /** Per-language editor buffers so switching doesn't wipe work. */
        buffers: { [activeId]: initialCode },
        editor: null,
      });
    } else if (item.type === 'tests') {
      const testCases = item.test_cases || [];
      const lastMount = editorMounts[editorMounts.length - 1];
      if (lastMount) {
        lastMount.testCases = testCases;
        lastMount.testPanel = createTestPanel(testCases);
        // Sit under the matching editor, not as raw JSON
        lastMount.wrap.after(lastMount.testPanel.el);
      }
    }
  }

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'finbtn next-lesson-btn';
  nextBtn.hidden = true;
  nextBtn.textContent = hasNext ? 'Next' : 'Finished';
  nextBtn.disabled = !hasNext;
  document.body.appendChild(nextBtn);

  if (hasNext) {
    nextBtn.addEventListener('click', () => {
      renderLesson(data, num + 1);
    });
  }

  const gradedMounts = () =>
    editorMounts.filter((m) => m.testCases.length > 0);

  const refreshNextVisibility = () => {
    const graded = gradedMounts();
    // No tests in this sublesson → allow advancing immediately
    const complete =
      graded.length === 0 ||
      graded.every((m) => m.testPanel?.allPassed());
    nextBtn.hidden = !complete;
  };

  // Lessons with no graded code can advance right away
  refreshNextVisibility();

  const activeSessions = [];
  let currentLangId = getActiveLanguageId();
  let langSwitchGen = 0;
  let langSwitching = null;

  async function switchLanguage(nextId, { fromSelect = false } = {}) {
    if (!fromSelect && nextId === currentLangId && nextId === getActiveLanguageId()) {
      return getActiveLanguage();
    }

    const gen = ++langSwitchGen;
    for (const session of activeSessions) session?.stop?.();
    activeSessions.length = 0;

    for (const mount of editorMounts) {
      if (mount.editor) {
        // Change event: editor still has the previous language's text.
        // Run-time resync after a failed switch: editor text belongs to nextId.
        const saveAs =
          fromSelect || getActiveLanguageId() === nextId
            ? currentLangId
            : nextId;
        mount.buffers[saveAs] = mount.editor.getValue();
      }
      if (mount.buffers[nextId] == null) {
        mount.buffers[nextId] = resolveStarterCode(mount.codeblock, nextId);
      }
    }

    langSelect.disabled = true;
    const pending = (async () => {
      try {
        const lang = await applyLanguageToEditors(nextId);
        if (gen !== langSwitchGen) return getActiveLanguage();

        currentLangId = nextId;
        langSelect.value = nextId;

        for (const mount of editorMounts) {
          if (mount.editor) {
            mount.editor.setValue(mount.buffers[nextId] ?? '');
          }
          if (mount.testPanel?.el) {
            mount.testPanel.el.hidden = !lang.supportsKataTests;
          }
        }
        refreshNextVisibility();
        return lang;
      } catch (err) {
        if (gen === langSwitchGen) {
          langSelect.value = currentLangId;
          console.error(`Failed to switch to ${nextId}:`, err);
          throw err;
        }
        return getActiveLanguage();
      } finally {
        if (gen === langSwitchGen) {
          langSelect.disabled = false;
        }
      }
    })();

    langSwitching = pending;
    try {
      return await pending;
    } finally {
      if (langSwitching === pending) langSwitching = null;
    }
  }

  langSelect.addEventListener('change', () => {
    const nextId = langSelect.value;
    switchLanguage(nextId, { fromSelect: true }).catch((err) => {
      const msg = String(err?.message || err);
      for (const mount of editorMounts) {
        mount.outputEl.hidden = false;
        mount.outputEl.classList.add('has-stderr');
        mount.outputEl.textContent = `Failed to load ${getLanguage(nextId).label}: ${msg}\n`;
      }
    });
  });

  for (const mount of editorMounts) {
    // Prefer buffer for the active language (handles switches before editors exist)
    const startCode =
      mount.buffers[getActiveLanguageId()] ?? mount.code;
    const editor = await createCodeEditor(
      mount.el,
      startCode,
      getActiveLanguageId(),
    );
    mount.editor = editor;
    let session = null;

    const resetPlayBtn = () => {
      mount.playBtn.className = 'run-btn';
      mount.playBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    };

    const appendOut = (text, { stderr = false } = {}) => {
      if (!text) return;
      mount.outputEl.hidden = false;
      mount.outputEl.textContent += text;
      if (stderr) mount.outputEl.classList.add('has-stderr');
    };

    mount.playBtn.addEventListener('click', () => {
      if (mount.playBtn.className === 'run-btn') {
        mount.playBtn.className = 'run-btn-stop';
        mount.playBtn.innerHTML = '<span class="material-symbols-outlined">stop</span>';
        mount.outputEl.hidden = true;
        mount.outputEl.textContent = '';
        mount.outputEl.classList.remove('has-stderr');
        mount.testPanel?.reset();
        refreshNextVisibility();

        const selectedId = langSelect.value;

        (async () => {
          try {
            // Wait for any in-flight switch, then force-sync runtime to the dropdown
            if (langSwitching) await langSwitching.catch(() => {});
            const lang = await switchLanguage(selectedId);
            if (mount.playBtn.className !== 'run-btn-stop') return;

            session = lang.createRunSession({
              onStdout(msg) {
                appendOut(msg);
              },
              onStderr(msg) {
                appendOut(msg + (msg.endsWith('\n') ? '' : '\n'), {
                  stderr: true,
                });
              },
              onResults(results) {
                if (lang.supportsKataTests) {
                  mount.testPanel?.setResults(results);
                  refreshNextVisibility();
                }
              },
              onDone({ result } = {}) {
                if (
                  lang.supportsKataTests &&
                  !mount.testCases.length &&
                  result &&
                  result !== 'undefined'
                ) {
                  appendOut(result + '\n');
                }
                if (!mount.outputEl.textContent.trim()) {
                  mount.outputEl.hidden = true;
                }
                resetPlayBtn();
                session = null;
              },
              onError(error) {
                appendOut(error + '\n', { stderr: true });
                resetPlayBtn();
                session = null;
              },
            });
            activeSessions.push(session);

            session.start({
              code: editor.getValue(),
              testCases: lang.supportsKataTests ? mount.testCases : [],
              stdin: '',
            });
          } catch (err) {
            appendOut(String(err?.message || err) + '\n', { stderr: true });
            resetPlayBtn();
          }
        })();
      } else {
        session?.stop?.();
        session = null;
        mount.outputEl.hidden = false;
        mount.outputEl.textContent += '\n[Terminated by user]';
        resetPlayBtn();
      }
    });
  }
}
