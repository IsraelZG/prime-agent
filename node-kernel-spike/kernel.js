'use strict';
// Kernel Node persistente. Protocolo JSON via canal IPC do child_process.fork,
// portanto stdout/stderr ficam 100% livres para o codigo do modelo.
// Backends: --backend=vm  (vm.createContext + vm.Script)
//           --backend=repl (repl.REPLServer.eval -> transform de top-level await do proprio Node)

const vm = require('node:vm');
const repl = require('node:repl');
const util = require('node:util');
const v8 = require('node:v8');
const { PassThrough } = require('node:stream');

const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};
const BACKEND = argOf('backend', 'vm');

// ---------------------------------------------------------------- captura ---
const INJECTED = new Set();
// baseline dos globais reais, tirado ANTES de qualquer celula rodar
const BASE_GLOBALS = new Set(
  Object.getOwnPropertyNames(globalThis).concat(['module', 'require', 'global', '_', '_error', 'exports', '__dirname', '__filename'])
);

function startCapture() {
  const out = [];
  const err = [];
  const ow = process.stdout.write;
  const ew = process.stderr.write;
  const mk = (sink) =>
    function (chunk, enc, cb) {
      sink.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      const done = typeof enc === 'function' ? enc : cb;
      if (typeof done === 'function') done();
      return true;
    };
  process.stdout.write = mk(out);
  process.stderr.write = mk(err);
  return () => {
    process.stdout.write = ow;
    process.stderr.write = ew;
    return { stdout: out.join(''), stderr: err.join('') };
  };
}

// ------------------------------------------------------------- backend vm ---
const sandbox = {};
const context = vm.createContext(sandbox, { name: 'prime-node-kernel' });

const GLOBALS = [
  'console', 'process', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate',
  'queueMicrotask', 'structuredClone', 'fetch', 'AbortController', 'performance', 'crypto',
];
for (const k of GLOBALS) if (globalThis[k] !== undefined) { sandbox[k] = globalThis[k]; INJECTED.add(k); }
sandbox.require = require;
INJECTED.add('require');

const AWAIT_ERR = /await is only valid|Unexpected reserved word|await is not defined/;

function compile(code, filename) {
  try {
    return { script: new vm.Script(code, { filename }), wrapped: false };
  } catch (e) {
    if (e instanceof SyntaxError && AWAIT_ERR.test(e.message)) {
      // Contorno ingenuo: envolve em IIFE async. Declaracoes viram escopo de funcao.
      return { script: new vm.Script(`(async () => {\n${code}\n})()`, { filename }), wrapped: true };
    }
    throw e;
  }
}

async function execVm(code, filename, opts) {
  const { script, wrapped } = compile(code, filename);
  const runOpts = { displayErrors: true };
  if (opts.timeout) runOpts.timeout = opts.timeout;
  if (opts.breakOnSigint) runOpts.breakOnSigint = true;
  let value = script.runInContext(context, runOpts);
  if (value && typeof value.then === 'function') value = await value;
  return { value, wrapped };
}

// ----------------------------------------------------------- backend repl ---
let replServer = null;
const replOut = []; // o console DENTRO do repl escreve neste stream, nao no process.stdout
let replErrHook = null; // gambiarra necessaria: repl NAO chama o callback em SyntaxError
function getRepl() {
  if (replServer) return replServer;
  const input = new PassThrough();
  const output = new PassThrough();
  output.on('data', (c) => {
    const s = c.toString('utf8');
    if (replErrHook && /^Uncaught /.test(s)) { const h = replErrHook; replErrHook = null; h(s.trim()); return; }
    replOut.push(s);
  });
  replServer = repl.start({
    input, output, terminal: false, useColors: false, prompt: '',
    ignoreUndefined: true, useGlobal: false, breakEvalOnSigint: true,
  });
  replOut.length = 0;
  return replServer;
}

function drainRepl() {
  const s = replOut.join('');
  replOut.length = 0;
  return s;
}

function execRepl(code, filename) {
  const r = getRepl();
  return new Promise((resolve, reject) => {
    let settled = false;
    replErrHook = (line) => {
      if (settled) return; settled = true;
      const e = new SyntaxError(line.replace(/^Uncaught (SyntaxError: )?/, ''));
      e.name = 'SyntaxError(via stream do repl, sem stack)';
      reject(e);
    };
    r.eval(code + '\n', r.context, filename, (err, val) => {
      if (settled) return; settled = true; replErrHook = null;
      err ? reject(err) : resolve({ value: val, wrapped: false });
    });
  });
}

// ------------------------------------------------------ backend inspector ---
// Usa o protocolo CDP embutido (node:inspector). `replMode: true` e a mesma flag
// que o DevTools usa para permitir redeclarar let/const e aceitar top-level await.
const inspector = require('node:inspector');
const nodePath = require('node:path');
const nodeOs = require('node:os');
const { Worker } = require('node:worker_threads');

const FLAG_FILE = nodePath.join(nodeOs.tmpdir(), `pa-kernel-${process.pid}.interrupt`);
let watchdog = null;
function startWatchdog() {
  if (watchdog) return FLAG_FILE;
  watchdog = new Worker(nodePath.join(__dirname, 'watchdog.js'), { workerData: { flagFile: FLAG_FILE } });
  watchdog.unref();
  return FLAG_FILE;
}

let cdp = null;
function getCdp() {
  if (cdp) return cdp;
  const session = new inspector.Session();
  session.connect();
  globalThis.require = require; // Runtime.evaluate roda no contexto global real
  // ponte para import() dinamico: Runtime.evaluate nao tem host import callback
  globalThis.__import = (s) => import(s);
  const post = (method, params) =>
    new Promise((res, rej) => session.post(method, params, (e, r) => (e ? rej(e) : res(r))));
  cdp = { session, post };
  return cdp;
}

async function execInspector(code) {
  const { post } = getCdp();
  await post('Runtime.enable').catch(() => {});
  const r = await post('Runtime.evaluate', {
    expression: code,
    replMode: true,
    awaitPromise: true,
    returnByValue: false,
    generatePreview: true,
    includeCommandLineAPI: true,
    timeout: undefined,
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    const ex = d.exception || {};
    let desc;
    if (ex.className === 'SyntaxError') {
      // description traz um stack das entranhas do Node, inutil. lineNumber/columnNumber
      // do exceptionDetails sao 0-based e apontam a linha REAL do modelo.
      desc = `${String(ex.description).split('\n')[0]}  [linha ${d.lineNumber + 1}, coluna ${d.columnNumber + 1}]`;
    } else if (ex.description) {
      desc = ex.description; // Error normal: stack ja e bom (use //# sourceURL p/ nomear)
    } else {
      // throw de primitivo/objeto cru: CDP NAO da a localizacao (lineNumber aponta p/ interno)
      desc = `valor nao-Error lancado (${ex.type}): ${util.inspect(ex.value)} -- SEM localizacao`;
    }
    const e = new Error(desc);
    e.name = 'CDP';
    e.cdpLine = d.lineNumber + 1;
    e.cdpColumn = d.columnNumber + 1;
    throw e;
  }
  const ro = r.result;
  let repr;
  if (ro.objectId) {
    // valor e um objeto remoto: pede o util.inspect real, no proprio processo
    globalThis.__inspect = (v) => util.inspect(v, { depth: 2 });
    const c = await post('Runtime.callFunctionOn', {
      objectId: ro.objectId,
      functionDeclaration: 'function(){ return globalThis.__inspect(this) }',
      returnByValue: true,
    });
    repr = c.result.value;
    await post('Runtime.releaseObject', { objectId: ro.objectId }).catch(() => {});
  } else {
    repr = ro.type === 'undefined' ? 'undefined'
      : ro.unserializableValue !== undefined ? ro.unserializableValue
      : util.inspect(ro.value);
  }
  return { value: undefined, replRepr: repr, replType: ro.type, wrapped: false };
}

// -------------------------------------------------------------- namespace ---
function nsObject() {
  if (BACKEND === 'repl') return getRepl().context;
  if (BACKEND === 'inspector') return globalThis;
  return sandbox;
}
function userKeys() {
  const ns = nsObject();
  const skip = BACKEND !== 'vm' ? BASE_GLOBALS : INJECTED;
  return Object.keys(ns).filter((k) => !skip.has(k));
}

function serializeErr(e) {
  if (!(e instanceof Error)) return { name: 'Thrown', message: util.inspect(e), stack: null };
  return { name: e.name, message: e.message, stack: e.stack };
}

// --------------------------------------------------------------- protocolo ---
process.on('message', async (msg) => {
  const reply = (extra) => process.send({ id: msg.id, ...extra });
  const rawStop = startCapture();
  // no backend repl, o console do contexto escreve no stream do repl: junta os dois
  const stop = () => {
    const cap = rawStop();
    if (BACKEND === 'repl') {
      const extra = drainRepl();
      // aguardar 0ms nao e possivel aqui; o PassThrough entrega sincrono o suficiente p/ console
      cap.stdout = extra + cap.stdout;
    }
    return cap;
  };
  try {
    if (msg.op === 'exec') {
      const filename = msg.filename || `cell-${msg.id}.js`;
      const r = BACKEND === 'repl' ? await execRepl(msg.code, filename)
        : BACKEND === 'inspector' ? await execInspector(msg.code)
        : await execVm(msg.code, filename, msg);
      const cap = stop();
      reply({
        ok: true, wrapped: r.wrapped,
        repr: r.replRepr !== undefined ? r.replRepr : util.inspect(r.value, { depth: 2 }),
        type: r.replType !== undefined ? r.replType : typeof r.value,
        ...cap,
      });
    } else if (msg.op === 'keys') {
      const cap = stop();
      reply({ ok: true, keys: userKeys(), ...cap });
    } else if (msg.op === 'snapshot') {
      // tenta serializar o namespace inteiro, chave a chave
      const ns = nsObject();
      const report = {};
      const buffers = {};
      for (const k of userKeys()) {
        const val = ns[k];
        const row = {};
        try { v8.serialize(val); row.v8 = 'ok'; buffers[k] = v8.serialize(val).toString('base64'); }
        catch (e) { row.v8 = `FALHA: ${e.name}: ${e.message.split('\n')[0]}`; }
        try { structuredClone(val); row.structuredClone = 'ok'; }
        catch (e) { row.structuredClone = `FALHA: ${e.name}: ${e.message.split('\n')[0]}`; }
        try {
          const j = JSON.stringify(val);
          row.json = j === undefined ? 'FALHA: JSON.stringify => undefined (valor sumiu)' : `ok (${j.slice(0, 40)})`;
        } catch (e) { row.json = `FALHA: ${e.name}: ${e.message.split('\n')[0]}`; }
        row.typeof = typeof val;
        report[k] = row;
      }
      let whole;
      try { v8.serialize(ns); whole = 'ok'; } catch (e) { whole = `FALHA: ${e.name}: ${e.message.split('\n')[0]}`; }
      const cap = stop();
      reply({ ok: true, report, whole, buffers, ...cap });
    } else if (msg.op === 'restore') {
      const ns = nsObject();
      const restored = [];
      for (const [k, b64] of Object.entries(msg.buffers)) {
        ns[k] = v8.deserialize(Buffer.from(b64, 'base64'));
        restored.push(k);
      }
      const cap = stop();
      reply({ ok: true, restored, ...cap });
    } else if (msg.op === 'ping') {
      const cap = stop();
      if (BACKEND === 'inspector') { getCdp(); startWatchdog(); }
      reply({ ok: true, pid: process.pid, backend: BACKEND, node: process.version, flagFile: FLAG_FILE, ...cap });
    } else {
      const cap = stop();
      reply({ ok: false, error: { name: 'BadOp', message: String(msg.op) }, ...cap });
    }
  } catch (e) {
    const cap = stop();
    reply({ ok: false, error: serializeErr(e), ...cap });
  }
});

process.on('SIGINT', () => { /* nao morrer: deixa o vm/breakOnSigint tratar */ });
