const { Kernel, show } = require('./host');
const fs = require('node:fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const k = new Kernel('inspector');
  const p = await k.ping();
  await k.exec('globalThis.tick = 0');
  const pending = k.exec('while (true) { globalThis.tick++; await new Promise(r => setTimeout(r, 20)) }');
  await sleep(500);
  console.log('host: disparando terminateExecution 60x em rajada (1 a cada 30ms)');
  for (let i = 0; i < 60; i++) { try { fs.writeFileSync(p.flagFile, 'go'); } catch {} await sleep(30); }
  const res = await Promise.race([pending, sleep(3000).then(() => ({T:true}))]);
  console.log('exec retornou?', res.T ? 'NAO' : JSON.stringify({ok:res.ok, err:res.error && res.error.message}));
  const a = await k.exec('globalThis.tick'); await sleep(400); const b = await k.exec('globalThis.tick');
  console.log('tick:', a.repr, '->', b.repr, b.repr > a.repr ? '(LOOP AINDA RODANDO)' : '(loop parou)');
  k.kill(); process.exit(0);
})();
