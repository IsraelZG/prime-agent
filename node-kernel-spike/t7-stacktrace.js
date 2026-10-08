'use strict';
// INVARIANTE 7: erro com stack trace apontando a LINHA do codigo do modelo.
const { Kernel } = require('./host');

const CELL = `const a = 1;
const b = 2;
function quebra(x) {
  return x.propriedade.inexistente;   // <-- linha 4, aqui estoura
}
quebra(null);
`;

const CELL_SOURCEURL = CELL + '\n//# sourceURL=celula-do-modelo.js\n';

function p(label, r) {
  console.log(`--- ${label}`);
  if (r.ok) { console.log(`    (nao deu erro, valor=${r.repr})`); return; }
  console.log(`    ${r.error.name}: ${r.error.message}`);
  console.log((r.error.stack || '(sem stack)').split('\n').map((l) => `    | ${l}`).join('\n'));
}

(async () => {
  for (const backend of ['vm', 'repl', 'inspector']) {
    console.log(`\n===== backend=${backend} =====`);
    const k = new Kernel(backend);
    p('erro de runtime na linha 4 de uma celula de 6 linhas', await k.exec(CELL, { filename: 'celula-do-modelo.js' }));
    p('mesma celula com //# sourceURL', await k.exec(CELL_SOURCEURL, { filename: 'celula-do-modelo.js' }));
    await k.exec('function defAnterior(){ throw new Error("erro vindo de celula anterior") }');
    p('erro atravessando celulas (funcao definida em outra celula)', await k.exec('defAnterior()'));
    p('erro de sintaxe', await k.exec('const q = ;'));
    p('throw de valor nao-Error', await k.exec('throw "string crua"'));
    p('rejeicao de promise com await', await k.exec('await Promise.reject(new Error("promise rejeitada"))'));
    k.kill();
  }
  process.exit(0);
})();
