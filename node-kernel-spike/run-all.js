'use strict';
// Roda toda a bateria de invariantes: node run-all.js
const { execFileSync } = require('node:child_process');
const testes = [
  ['1 estado persistente', 't1-estado.js'],
  ['2 stdout/stderr vs valor', 't2-stdout.js'],
  ['3 top-level await', 't3-await.js'],
  ['3b onde vivem as variaveis', 't3b-namespace.js'],
  ['4 redefinicao', 't4-redefinicao.js'],
  ['5 serializacao', 't5-serializacao.js'],
  ['6 interrupcao', 't6-interromper.js'],
  ['7 stack trace', 't7-stacktrace.js'],
  ['8 shell', 't8-shell.js'],
];
for (const [nome, arq] of testes) {
  console.log(`\n########## INVARIANTE ${nome} (${arq}) ##########`);
  try { console.log(execFileSync(process.execPath, [arq], { cwd: __dirname, encoding: 'utf8' })); }
  catch (e) { console.log(e.stdout || ''); console.log('[falhou ao rodar] ' + e.message); }
}
