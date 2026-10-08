'use strict';
// Host TypeScript-equivalente (JS) que controla o kernel persistente.
const { fork } = require('node:child_process');
const path = require('node:path');

class Kernel {
  constructor(backend = 'vm') {
    this.backend = backend;
    this.child = fork(path.join(__dirname, 'kernel.js'), [`--backend=${backend}`], {
      silent: true, // stdout/stderr do kernel viram pipes -> provamos que nada vaza
    });
    this.leakedStdout = '';
    this.leakedStderr = '';
    this.child.stdout.on('data', (d) => { this.leakedStdout += d; });
    this.child.stderr.on('data', (d) => { this.leakedStderr += d; });
    this.seq = 0;
    this.pending = new Map();
    this.child.on('message', (m) => {
      const r = this.pending.get(m.id);
      if (r) { this.pending.delete(m.id); r(m); }
    });
  }
  send(msg) {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.send({ id, ...msg });
    });
  }
  exec(code, opts = {}) { return this.send({ op: 'exec', code, ...opts }); }
  keys() { return this.send({ op: 'keys' }); }
  snapshot() { return this.send({ op: 'snapshot' }); }
  restore(buffers) { return this.send({ op: 'restore', buffers }); }
  ping() { return this.send({ op: 'ping' }); }
  kill() { this.child.kill(); }
}

function show(label, r) {
  const parts = [`--- ${label}`];
  if (r.ok) {
    parts.push(`  valor  : ${r.repr !== undefined ? r.repr : '(n/a)'}${r.wrapped ? '   [codigo foi envolvido em IIFE async]' : ''}`);
  } else {
    parts.push(`  ERRO   : ${r.error.name}: ${r.error.message}`);
    if (r.error.stack) parts.push(r.error.stack.split('\n').slice(0, 5).map((l) => `           ${l}`).join('\n'));
  }
  if (r.stdout) parts.push(`  stdout : ${JSON.stringify(r.stdout)}`);
  if (r.stderr) parts.push(`  stderr : ${JSON.stringify(r.stderr)}`);
  console.log(parts.join('\n'));
}

module.exports = { Kernel, show };
