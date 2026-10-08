'use strict';
// INVARIANTE 3: top-level await sem wrapper explicito escrito pelo modelo.
const { Kernel, show } = require('./host');

(async () => {
  for (const backend of ['vm', 'repl', 'inspector']) {
    console.log(`\n===== backend=${backend} =====`);
    const k = new Kernel(backend);

    show('A) await simples, valor de retorno',
      await k.exec('await new Promise(r => setTimeout(() => r("pronto"), 50))'));

    show('B) const r = await ...  (declaracao + await)',
      await k.exec('const r = await new Promise(res => setTimeout(() => res(123), 30));\nconsole.log("dentro:", r);\nr'));

    show('C) a variavel r sobreviveu para a proxima chamada?',
      await k.exec('typeof r === "undefined" ? "PERDIDA" : "viva=" + r'));

    show('D) await de import() dinamico + uso',
      await k.exec('const os = await import("node:os");\nos.EOL.length'));

    show('E) os sobreviveu?', await k.exec('typeof os'));

    show('F) await com fetch real (rede)',
      await k.exec('const resp = await fetch("https://example.com");\nresp.status'));

    show('G) resp sobreviveu?', await k.exec('typeof resp === "undefined" ? "PERDIDA" : resp.status'));

    console.log(`namespace: ${JSON.stringify((await k.keys()).keys)}`);
    k.kill();
  }
})();
