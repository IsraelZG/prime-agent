'use strict';
// Sonda: ONDE ficam as variaveis? Sao propriedades enumeraveis do objeto global do contexto?
const { Kernel, show } = require('./host');

(async () => {
  for (const backend of ['vm', 'repl', 'inspector']) {
    console.log(`\n===== backend=${backend} =====`);
    const k = new Kernel(backend);
    await k.exec('const decl_const = 1');
    await k.exec('let decl_let = 2');
    await k.exec('var decl_var = 3');
    await k.exec('globalThis.decl_global = 4');
    await k.exec('function decl_fn(){}');
    await k.exec('class DeclClass {}');
    if (backend === 'repl') await k.exec('const decl_await = await Promise.resolve(9)');
    show('Object.keys(globalThis) filtrado',
      await k.exec('Object.keys(globalThis).filter(n => n.startsWith("decl") || n === "DeclClass")'));
    show('acesso direto a cada uma',
      await k.exec('[typeof decl_const, typeof decl_let, typeof decl_var, typeof decl_global, typeof decl_fn, typeof DeclClass]'));
    console.log(`host ve namespace: ${JSON.stringify((await k.keys()).keys)}`);
    k.kill();
  }
})();
