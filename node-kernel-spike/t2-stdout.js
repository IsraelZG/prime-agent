'use strict';
// INVARIANTE 2: separar "o que foi impresso" de "o que a ultima expressao retornou".
const { Kernel, show } = require('./host');

const CELL = `
console.log("linha impressa 1");
console.error("isto foi para stderr");
process.stdout.write("escrita crua sem newline|");
console.log("linha impressa 2");
1 + 1
`;

(async () => {
  for (const backend of ['vm', 'repl', 'inspector']) {
    console.log(`\n===== backend=${backend} =====`);
    const k = new Kernel(backend);
    const r = await k.exec(CELL);
    console.log('resposta bruta do kernel (JSON):');
    console.log(JSON.stringify({ ok: r.ok, repr: r.repr, type: r.type, stdout: r.stdout, stderr: r.stderr }, null, 2));
    show('celula', r);
    // celula sem valor de retorno, so efeito colateral
    show('celula so-print', await k.exec('console.log("so print"); undefined'));
    console.log(`vazou para o stdout real do kernel? ${JSON.stringify(k.leakedStdout)}`);
    console.log(`vazou para o stderr real do kernel? ${JSON.stringify(k.leakedStderr)}`);
    k.kill();
  }
})();
