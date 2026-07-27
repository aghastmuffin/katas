/**
 * Client-side C → Wasm compile/link via @yowasp/clang + twr-wasm's twr.a.
 */

import twrAUrl from '../../../node_modules/twr-wasm/lib-c/twr.a?url';

// Vite: query ?raw + import default (eager so we always get plain strings).
const headerModules = import.meta.glob(
  '../../../node_modules/twr-wasm/include/*.h',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

let yowasp = null;
let twrTree = null;
let ready = false;

function log(onLog, level, msg) {
  const line = String(msg).endsWith('\n') ? String(msg) : `${msg}\n`;
  if (onLog) onLog(level, line);
  else if (level === 'stderr') console.warn('[c]', msg);
  else console.log('[c]', msg);
}

function asRawString(value, path) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.default === 'string') {
    return value.default;
  }
  throw new Error(
    `twr header ${path} did not resolve to a raw string (got ${typeof value})`,
  );
}

async function buildTwrTree(onLog) {
  log(onLog, 'stdout', `[c] Loading ${Object.keys(headerModules).length} twr headers…`);
  const include = {};
  for (const [path, value] of Object.entries(headerModules)) {
    const name = path.split('/').pop();
    include[name] = asRawString(value, name);
  }
  log(onLog, 'stdout', `[c] Fetching twr.a from ${twrAUrl}`);
  const twrA = new Uint8Array(await (await fetch(twrAUrl)).arrayBuffer());
  log(onLog, 'stdout', `[c] twr.a loaded (${twrA.byteLength} bytes)`);
  return {
    include,
    lib: { 'twr.a': twrA },
  };
}

function captureStreams(onLog, label) {
  const chunks = { stdout: [], stderr: [] };
  const make = (key) => (bytes) => {
    if (!bytes) return;
    chunks[key].push(bytes);
    if (onLog) {
      const text = new TextDecoder().decode(bytes);
      if (text) onLog(key === 'stderr' ? 'stderr' : 'stdout', text);
    }
  };
  const text = (key) => {
    const parts = chunks[key];
    if (!parts.length) return '';
    const total = parts.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return new TextDecoder().decode(out);
  };
  return {
    // Binary .o / .wasm must not be ASCII-decoded (YoWASP default is true).
    options: {
      stdout: make('stdout'),
      stderr: make('stderr'),
      decodeASCII: false,
    },
    stdout: () => text('stdout'),
    stderr: () => text('stderr'),
    label,
  };
}

function vfsFiles(source) {
  return {
    'solution.c': source,
    twr: {
      include: twrTree.include,
      lib: { 'twr.a': twrTree.lib['twr.a'].slice() },
    },
  };
}

/**
 * Prefetch YoWASP + twr headers/lib (call from language loadDependencies).
 */
export async function ensureCompilerReady(onProgress, onLog) {
  if (ready && yowasp && twrTree) {
    log(onLog, 'stdout', '[c] Compiler already ready');
    return;
  }

  log(onLog, 'stdout', '[c] Loading @yowasp/clang toolchain…');
  // Load the untransformed bundle from /yowasp/* (see vite.config.js).
  // Variable URL + @vite-ignore prevents Vite from analyzing/prebundling the import
  // (prebundled deps return JSON 504 → MIME error and language switch rolls back).
  const base = import.meta.env.BASE_URL;
  const yowaspUrl = `${window.location.origin}${base}yowasp/bundle.js`;
  const [{ runClang, runLLVM, Exit }, tree] = await Promise.all([
    import(/* @vite-ignore */ yowaspUrl),
    buildTwrTree(onLog),
  ]);

  yowasp = { runClang, runLLVM, Exit };
  twrTree = tree;

  log(onLog, 'stdout', '[c] Prefetching clang/lld Wasm resources…');
  await runClang(null, {}, {
    decodeASCII: false,
    fetchProgress: (status) => {
      onProgress?.(status);
      if (!status?.totalLength) return;
      const pct = ((100 * status.doneLength) / status.totalLength).toFixed(0);
      log(
        onLog,
        'stdout',
        `[c] Toolchain download ${pct}% (${status.doneLength}/${status.totalLength})`,
      );
    },
  });
  ready = true;
  log(onLog, 'stdout', '[c] Compiler ready');
}

export function isCompilerReady() {
  return ready;
}

export function resetCompiler() {
  ready = false;
  yowasp = null;
  twrTree = null;
}

/**
 * Compile + link C source to a Wasm binary linked with twr.a.
 * @param {string} source
 * @param {{ exports?: string[], onLog?: (level: string, msg: string) => void, verbose?: boolean }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function compileC(source, opts = {}) {
  const onLog = opts.onLog;
  const verbose = opts.verbose !== false;

  if (!ready || !yowasp || !twrTree) {
    await ensureCompilerReady(undefined, onLog);
  }

  const { runClang, runLLVM, Exit } = yowasp;
  const exports = opts.exports?.length ? opts.exports : ['__kata_run'];
  const files = vfsFiles(source);

  log(onLog, 'stdout', `[c] Compiling solution.c (${source.length} chars)…`);
  if (verbose) {
    log(onLog, 'stdout', `[c] Exports: ${exports.join(', ')}`);
  }

  const clangArgs = [
    'clang',
    '--target=wasm32',
    '-nostdinc',
    '-nostdlib',
    '-isystem',
    'twr/include',
    '-Wall',
    '-O2',
  ];
  if (verbose) clangArgs.push('-v');
  clangArgs.push('-c', 'solution.c', '-o', 'solution.o');

  log(onLog, 'stdout', `[c] $ ${clangArgs.join(' ')}`);
  const streams = captureStreams(onLog, 'clang');

  let afterCompile;
  try {
    afterCompile = await runClang(clangArgs, files, streams.options);
  } catch (err) {
    const detail = [streams.stderr(), streams.stdout()].filter(Boolean).join('\n');
    if (err instanceof Exit || err?.name === 'Exit') {
      throw new Error(detail || `clang failed (exit ${err.code ?? '?'})`);
    }
    throw new Error(detail || String(err?.message || err));
  }

  if (!afterCompile?.['solution.o']) {
    throw new Error('clang produced no solution.o');
  }
  const obj = afterCompile['solution.o'];
  const objSize =
    obj instanceof Uint8Array
      ? obj.byteLength
      : typeof obj === 'string'
        ? obj.length
        : '?';
  log(onLog, 'stdout', `[c] Compiled solution.o (${objSize} bytes)`);

  const linkArgs = [
    'wasm-ld',
    'solution.o',
    'twr/lib/twr.a',
    '-o',
    'out.wasm',
    '--no-entry',
    '--initial-memory=1048576',
    '--max-memory=1048576',
  ];
  for (const name of exports) {
    linkArgs.push(`--export=${name}`);
  }

  log(onLog, 'stdout', `[c] $ ${linkArgs.join(' ')}`);
  const linkStreams = captureStreams(onLog, 'wasm-ld');
  let afterLink;
  try {
    afterLink = await runLLVM(linkArgs, afterCompile, linkStreams.options);
  } catch (err) {
    const detail = [linkStreams.stderr(), linkStreams.stdout()]
      .filter(Boolean)
      .join('\n');
    if (err instanceof Exit || err?.name === 'Exit') {
      throw new Error(detail || `wasm-ld failed (exit ${err.code ?? '?'})`);
    }
    throw new Error(detail || String(err?.message || err));
  }

  const wasm = afterLink?.['out.wasm'];
  if (!(wasm instanceof Uint8Array) && !(wasm instanceof ArrayBuffer)) {
    throw new Error(
      `Link succeeded but out.wasm was not binary (got ${typeof wasm})`,
    );
  }
  const bytes = wasm instanceof Uint8Array ? wasm : new Uint8Array(wasm);
  log(onLog, 'stdout', `[c] Linked out.wasm (${bytes.byteLength} bytes)`);
  return bytes;
}
