'use strict';
// INVARIANTE 5: serializar e restaurar o namespace (o que o dill faz no IPython).
const { Kernel, show } = require('./host');
const fs = require('node:fs');
const path = require('node:path');

const SETUP = `
globalThis.num = 42;
globalThis.str = "texto";
globalThis.arr = [1, 2, 3];
globalThis.obj = { a: 1, b: { c: 2 } };
globalThis.data = new Date("2026-01-01T00:00:00Z");
globalThis.mapa = new Map([["k", 1]]);
globalThis.conjunto = new Set([1, 2]);
globalThis.buf = Buffer.from("abc");
globalThis.typed = new Uint8Array([1, 2, 3]);
globalThis.regex = /abc/gi;
globalThis.bigint = 123n;
globalThis.circ = { nome: "circular" }; globalThis.circ.self = globalThis.circ;
globalThis.erro = new Error("boom");
globalThis.fn = function soma(a, b) { return a + b };
globalThis.seta = (x) => x * 2;
let contador = 0;
globalThis.closure = () => ++contador;               // captura estado externo
globalThis.Classe = class Pessoa { constructor(n){ this.n = n } oi(){ return "oi " + this.n } };
globalThis.instancia = new globalThis.Classe("ana");
globalThis.promessa = Promise.resolve(1);
globalThis.stream = require("node:fs").createReadStream("package.json");
globalThis.handle = require("node:fs").openSync("package.json", "r");
"setup ok"
`;

(async () => {
  const backend = process.argv[2] || 'inspector';
  console.log(`===== backend=${backend} =====`);
  const k = new Kernel(backend);
  show('setup do namespace', await k.exec(SETUP));

  const snap = await k.snapshot();
  console.log('\n--- v8.serialize do objeto namespace INTEIRO de uma vez:');
  console.log(`    ${snap.whole}`);

  console.log('\n--- por chave (v8.serialize / structuredClone / JSON.stringify):');
  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`    ${w('chave', 12)} ${w('typeof', 10)} ${w('v8.serialize', 46)} ${w('structuredClone', 46)} JSON`);
  for (const [key, row] of Object.entries(snap.report)) {
    console.log(`    ${w(key, 12)} ${w(row.typeof, 10)} ${w(row.v8, 46)} ${w(row.structuredClone, 46)} ${row.json}`);
  }

  // round-trip real: grava em disco, mata o kernel, sobe outro, restaura
  const file = path.join(__dirname, `snapshot-${backend}.json`);
  fs.writeFileSync(file, JSON.stringify(snap.buffers));
  console.log(`\n--- snapshot gravado: ${file} (${fs.statSync(file).size} bytes, ${Object.keys(snap.buffers).length} chaves salvas de ${Object.keys(snap.report).length})`);
  k.kill();

  const k2 = new Kernel(backend);
  const rest = await k2.restore(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log(`--- kernel NOVO, chaves restauradas: ${JSON.stringify(rest.restored)}`);
  show('verificacao pos-restore',
    await k2.exec('[num, str, JSON.stringify(arr), data.toISOString(), mapa.get("k"), [...conjunto], buf.toString(), [...typed], String(regex), circ.self === circ]'));
  show('funcoes sobreviveram?', await k2.exec('[typeof fn, typeof seta, typeof closure, typeof Classe, typeof instancia]'));
  show('instancia mantem prototipo/classe?', await k2.exec('[instancia.constructor.name, typeof instancia.oi, instancia.n]'));
  show('contorno: recuperar funcao por fn.toString() salvo no snapshot', await k2.exec('globalThis.fn2 = eval("(function soma(a,b){return a+b})"); fn2(2,3)'));
  k2.kill();
})();
