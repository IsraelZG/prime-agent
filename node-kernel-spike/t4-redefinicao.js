'use strict';
// INVARIANTE 4: reexecutar a mesma celula que declara `const x`.
const { Kernel, show } = require('./host');

(async () => {
  for (const backend of ['vm', 'repl', 'inspector']) {
    console.log(`\n===== backend=${backend} =====`);
    const k = new Kernel(backend);

    show('1a exec de "const x = 1"', await k.exec('const x = 1'));
    show('2a exec da MESMA celula "const x = 1"', await k.exec('const x = 1'));
    show('x continua valendo?', await k.exec('typeof x === "undefined" ? "sumiu" : x'));

    show('1a exec de "let y = 1"', await k.exec('let y = 1'));
    show('2a exec de "let y = 2"', await k.exec('let y = 2'));
    show('y vale?', await k.exec('typeof y === "undefined" ? "sumiu" : y'));

    show('1a exec de "class C {}"', await k.exec('class C { m(){ return "v1" } }'));
    show('2a exec de "class C {}" (iteracao tipica do agente)', await k.exec('class C { m(){ return "v2" } }'));
    show('new C().m()', await k.exec('new C().m()'));

    show('funcao redeclarada (function)', await k.exec('function f(){ return "v1" }\nf()'));
    show('funcao redeclarada de novo', await k.exec('function f(){ return "v2" }\nf()'));

    show('var redeclarada', await k.exec('var v = 1; v'));
    show('var redeclarada de novo', await k.exec('var v = 2; v'));

    // celula grande que so falha na ultima linha por causa do const
    show('celula mista reexecutada (efeito colateral roda 2x antes de estourar?)',
      await k.exec('console.log("efeito colateral!");\nconst x = 99;\n"fim"'));

    k.kill();
  }
})();
