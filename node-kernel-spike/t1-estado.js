'use strict';
// INVARIANTE 1: estado persistente entre chamadas separadas do host ao kernel.
const { Kernel, show } = require('./host');

(async () => {
  for (const backend of ['vm', 'repl', 'inspector']) {
    console.log(`\n===== backend=${backend} =====`);
    const k = new Kernel(backend);
    const p = await k.ping();
    console.log(`kernel pid=${p.pid} node=${p.node}`);

    show('chamada #1: const x = 41', await k.exec('const x = 41'));
    show('chamada #2: x + 1', await k.exec('x + 1'));
    show('chamada #3: function dobro(n){return n*2}; dobro(x)', await k.exec('function dobro(n){ return n*2 }\ndobro(x)'));
    show('chamada #4 (var/let/global)', await k.exec('var y = 10; globalThis.z = 5; [x, y, z]'));

    const ks = await k.keys();
    console.log(`namespace visto pelo host: ${JSON.stringify(ks.keys)}`);
    console.log(`vazamento stdout do processo kernel: ${JSON.stringify(k.leakedStdout)}`);
    k.kill();
  }
})();
