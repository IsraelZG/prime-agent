const { Kernel, show } = require('./host');
(async () => {
  const k = new Kernel('inspector');
  await k.exec('let contador = 10; globalThis.closure = () => ++contador; globalThis.closure(); globalThis.closure()');
  show('estado do closure no kernel original', await k.exec('globalThis.closure()'));
  const src = await k.exec('globalThis.closure.toString()');
  console.log('fonte capturada:', src.repr);
  k.kill();
  const k2 = new Kernel('inspector');
  show('re-eval da fonte no kernel novo', await k2.exec(`globalThis.rec = eval(${JSON.stringify('(' + src.repr.slice(1,-1) + ')')}); rec()`));
  k2.kill();
})();
