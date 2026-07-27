/**
 * Language-agnostic boilerplate → source generators.
 *
 * YAML shape:
 *   boilerplate:
 *     - function:
 *         name: max_area          # optional (default: solution)
 *         expects: int
 *         inputs: |
 *           height = list[int]
 *           target = int
 *
 * Add a case in `boilerplateFor` when you add a language.
 */

/** Known language id aliases used as YAML keys. */
export const LANGUAGE_SOURCE_ALIASES = {
  bf: 'brainfuck',
  js: 'javascript',
  ts: 'typescript',
  'c++': 'cpp',
  cxx: 'cpp',
  py: 'python',
};

/**
 * Resolve editor source for a codeblock + language.
 * Prefer an explicit language key (`python:`, `c:`, …); else build from boilerplate.
 */
export function resolveStarterCode(codeblock, languageId) {
  const id = normalizeLanguageId(languageId);
  const specific = getExplicitLanguageSource(codeblock, id);
  if (specific != null) return specific;

  // Legacy single-field starter (treat as python unless language says otherwise)
  if (typeof codeblock?.starter_code === 'string') {
    if (id === 'python' || !codeblock.boilerplate) return codeblock.starter_code;
  }

  return boilerplateFor(id, codeblock?.boilerplate || []);
}

function normalizeLanguageId(id) {
  const raw = String(id || 'python').toLowerCase();
  return LANGUAGE_SOURCE_ALIASES[raw] || raw;
}

function getExplicitLanguageSource(codeblock, languageId) {
  if (!codeblock || typeof codeblock !== 'object') return null;

  const keys = new Set([languageId]);
  for (const [alias, target] of Object.entries(LANGUAGE_SOURCE_ALIASES)) {
    if (target === languageId) keys.add(alias);
  }

  for (const key of keys) {
    if (typeof codeblock[key] === 'string') return codeblock[key];
  }
  return null;
}

/**
 * Build starter source from the shared `boilerplate` list.
 * Extend the switch when adding languages.
 */
export function boilerplateFor(languageId, boilerplate) {
  const specs = normalizeBoilerplate(boilerplate);
  const id = normalizeLanguageId(languageId);

  switch (id) {
    case 'python':
      return pythonBoilerplate(specs);
    case 'javascript':
    case 'typescript':
      return javascriptBoilerplate(specs, id === 'typescript');
    case 'c':
      return cBoilerplate(specs);
    case 'cpp':
      return cppBoilerplate(specs);
    case 'brainfuck':
      return brainfuckBoilerplate(specs);
    default:
      return genericBoilerplate(id, specs);
  }
}

/** Normalize YAML boilerplate array into plain function specs. */
export function normalizeBoilerplate(boilerplate) {
  if (!boilerplate) return [];
  const list = Array.isArray(boilerplate) ? boilerplate : [boilerplate];
  const specs = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.function) {
      const fn = entry.function;
      specs.push({
        kind: 'function',
        name: fn.name || 'solution',
        expects: String(fn.expects || 'None').trim(),
        inputs: parseInputsBlock(fn.inputs || ''),
      });
    }
  }
  return specs;
}

/**
 * Parse:
 *   height = list[int]
 *   target = int
 */
export function parseInputsBlock(block) {
  const text = String(block || '');
  const inputs = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (!match) continue;
    inputs.push({
      name: match[1],
      type: match[2].trim(),
    });
  }
  return inputs;
}

// —— per-language generators (edit these to change default stubs) ——

function pythonBoilerplate(specs) {
  if (!specs.length) {
    return '# Write your solution here\npass\n';
  }
  return specs
    .map((fn) => {
      const params = fn.inputs
        .map((p) => `${p.name}: ${mapType(p.type, 'python')}`)
        .join(', ');
      const ret = mapType(fn.expects, 'python');
      return `def ${fn.name}(${params}) -> ${ret}:\n    # Write your solution here\n    pass\n`;
    })
    .join('\n');
}

function javascriptBoilerplate(specs, typescript = false) {
  if (!specs.length) {
    return '// Write your solution here\n';
  }
  return specs
    .map((fn) => {
      if (typescript) {
        const params = fn.inputs
          .map((p) => `${p.name}: ${mapType(p.type, 'typescript')}`)
          .join(', ');
        const ret = mapType(fn.expects, 'typescript');
        return `function ${fn.name}(${params}): ${ret} {\n  // Write your solution here\n}\n`;
      }
      const params = fn.inputs.map((p) => p.name).join(', ');
      return `function ${fn.name}(${params}) {\n  // Write your solution here\n}\n`;
    })
    .join('\n');
}

function cParamList(inputs, expects) {
  const params = [];
  for (const p of inputs) {
    const t = String(p.type || '').trim();
    if (/^list\[\s*.+\s*]$/i.test(t)) {
      params.push(`${mapType(t, 'c')} ${p.name}`);
      params.push(`int ${p.name}Size`);
    } else {
      params.push(`${mapType(t, 'c')} ${p.name}`);
    }
  }
  if (/^list\[\s*.+\s*]$/i.test(String(expects || '').trim())) {
    params.push('int* returnSize');
  }
  return params.join(', ') || 'void';
}

function cBoilerplate(specs) {
  const header =
    '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <stdbool.h>\n\n';
  if (!specs.length) {
    return `${header}/* Write your solution here */\nint main(void) {\n    return 0;\n}\n`;
  }
  return (
    header +
    specs
      .map((fn) => {
        const ret = mapType(fn.expects, 'c');
        const params = cParamList(fn.inputs, fn.expects);
        let body = '    /* Write your solution here */\n';
        if (/^list\[\s*.+\s*]$/i.test(String(fn.expects || '').trim())) {
          body += '    if (returnSize) *returnSize = 0;\n    return NULL;\n';
        }
        return `${ret} ${fn.name}(${params}) {\n${body}}\n`;
      })
      .join('\n')
  );
}

function cppBoilerplate(specs) {
  if (!specs.length) {
    return '// Write your solution here\n';
  }
  return specs
    .map((fn) => {
      const ret = mapType(fn.expects, 'cpp');
      const params = fn.inputs
        .map((p) => `${mapType(p.type, 'cpp')} ${p.name}`)
        .join(', ');
      return `${ret} ${fn.name}(${params}) {\n    // Write your solution here\n}\n`;
    })
    .join('\n');
}

function brainfuckBoilerplate(specs) {
  const hint = specs.length
    ? specs
        .map((fn) => {
          const args = fn.inputs.map((p) => `${p.name}:${p.type}`).join(', ');
          return `${fn.name}(${args}) -> ${fn.expects}`;
        })
        .join('; ')
    : 'solution';
  return `,.[.,]\n[ read stdin / write stdout — ${hint} ]\n`;
}

function genericBoilerplate(languageId, specs) {
  const summary = specs
    .map((fn) => {
      const args = fn.inputs.map((p) => `${p.name}: ${p.type}`).join(', ');
      return `${fn.name}(${args}) -> ${fn.expects}`;
    })
    .join('\n');
  return `# ${languageId} starter\n# ${summary || 'Write your solution here'}\n`;
}

/**
 * Map the YAML type DSL (`list[int]`, `int`, …) into a language type.
 * Extend per language as you add runtimes.
 */
export function mapType(typeExpr, languageId) {
  const raw = String(typeExpr || '').trim();
  const id = normalizeLanguageId(languageId);

  const listMatch = raw.match(/^list\[\s*(.+)\s*]$/i);
  if (listMatch) {
    const inner = mapType(listMatch[1], id);
    switch (id) {
      case 'python':
        return `list[${inner}]`;
      case 'javascript':
        return `${inner}[]`;
      case 'typescript':
        return `${inner}[]`;
      case 'c':
        return `${inner}*`;
      case 'cpp':
        return `std::vector<${inner}>`;
      default:
        return `list[${inner}]`;
    }
  }

  const dictMatch = raw.match(/^dict\[\s*(.+)\s*,\s*(.+)\s*]$/i);
  if (dictMatch) {
    const k = mapType(dictMatch[1], id);
    const v = mapType(dictMatch[2], id);
    switch (id) {
      case 'python':
        return `dict[${k}, ${v}]`;
      case 'typescript':
        return `Record<${k}, ${v}>`;
      case 'javascript':
        return 'object';
      case 'cpp':
        return `std::map<${k}, ${v}>`;
      default:
        return `dict[${k}, ${v}]`;
    }
  }

  const primitives = {
    python: {
      int: 'int',
      float: 'float',
      str: 'str',
      string: 'str',
      bool: 'bool',
      None: 'None',
      void: 'None',
    },
    javascript: {
      int: 'number',
      float: 'number',
      str: 'string',
      string: 'string',
      bool: 'boolean',
      None: 'void',
      void: 'void',
    },
    typescript: {
      int: 'number',
      float: 'number',
      str: 'string',
      string: 'string',
      bool: 'boolean',
      None: 'void',
      void: 'void',
    },
    c: {
      int: 'int',
      float: 'double',
      str: 'char*',
      string: 'char*',
      bool: 'bool',
      None: 'void',
      void: 'void',
    },
    cpp: {
      int: 'int',
      float: 'double',
      str: 'std::string',
      string: 'std::string',
      bool: 'bool',
      None: 'void',
      void: 'void',
    },
  };

  const table = primitives[id] || primitives.python;
  return table[raw] || raw;
}
