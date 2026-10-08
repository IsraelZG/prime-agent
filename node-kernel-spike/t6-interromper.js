'use strict';
// INVARIANTE 6: interromper execucao em andamento SEM matar o processo e perder o estado.
const { Kernel, show } = require('./host');
const fs = require('node:fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOOP = 'globalThis.marcador = "antes do loop"; let i = 0; while (true) { i++ } "nunca chega aqui"';

(async () => {
  // ---------- A) vm + option timeout (interrupcao PRE-agendada, nao sob demanda) ----------
  console.log('===== A) backend=vm, vm.Script timeout=1500ms num loop infinito sincrono =====');
  {
    const k = new Kernel('vm');
    await k.exec('globalThis.estado_previo = "valioso"');
    const t0 = Date.now();
    const r = await k.exec(LOOP, { timeout: 1500 });
    console.log(`decorrido: ${Date.now() - t0}ms`);
    show('loop infinito', r);
    show('processo sobreviveu? estado_previo ainda existe?', await k.exec('estado_previo'));
    show('marcador setado ANTES do loop sobreviveu?', await k.exec('globalThis.marcador'));
    show('kernel ainda executa codigo novo?', await k.exec('1+1'));
    k.kill();
  }

  // ---------- B) SIGINT sob demanda no Windows ----------
  console.log('\n===== B) backend=vm + breakOnSigint, host manda SIGINT sob demanda (Windows) =====');
  {
    const k = new Kernel('vm');
    await k.exec('globalThis.estado_previo = "valioso"');
    const pending = k.exec(LOOP, { breakOnSigint: true });
    await sleep(700);
    let sigintErr = null;
    try { process.kill(k.child.pid, 'SIGINT'); console.log('host: SIGINT enviado para pid ' + k.child.pid); }
    catch (e) { sigintErr = e; console.log('host: process.kill falhou: ' + e.message); }
    const res = await Promise.race([pending, sleep(4000).then(() => ({ TIMEOUT_DO_TESTE: true }))]);
    console.log('resultado: ' + JSON.stringify(res.TIMEOUT_DO_TESTE ? 'kernel NAO respondeu em 4s' : res).slice(0, 300));
    console.log('kernel ainda vivo? exitCode=' + k.child.exitCode + ' signalCode=' + k.child.signalCode);
    if (!res.TIMEOUT_DO_TESTE) show('estado sobreviveu?', await k.exec('estado_previo'));
    k.kill();
  }

  // ---------- C) inspector + Runtime.terminateExecution via worker watchdog ----------
  console.log('\n===== C) backend=inspector, Runtime.terminateExecution disparado por worker =====');
  {
    const k = new Kernel('inspector');
    const p = await k.ping();
    console.log(`kernel pid=${p.pid}, arquivo-sentinela=${p.flagFile}`);
    await k.exec('globalThis.estado_previo = "valioso"');
    const t0 = Date.now();
    const pending = k.exec(LOOP);
    await sleep(800);
    fs.writeFileSync(p.flagFile, 'go');
    console.log('host: sentinela escrita (pedido de interrupcao)');
    const res = await Promise.race([pending, sleep(6000).then(() => ({ TIMEOUT_DO_TESTE: true }))]);
    console.log(`decorrido: ${Date.now() - t0}ms`);
    if (res.TIMEOUT_DO_TESTE) console.log('resultado: kernel NAO respondeu em 6s -> interrupcao FALHOU');
    else show('loop infinito', res);
    console.log('kernel vivo? exitCode=' + k.child.exitCode);
    show('estado_previo sobreviveu?', await k.exec('estado_previo'));
    show('marcador de antes do loop sobreviveu?', await k.exec('globalThis.marcador'));
    show('kernel executa codigo novo depois da interrupcao?', await k.exec('40 + 2'));
    k.kill();
  }

  // ---------- D) loop ASSINCRONO (await dentro do while) ----------
  console.log('\n===== D) backend=inspector, loop infinito ASSINCRONO =====');
  {
    const k = new Kernel('inspector');
    const p = await k.ping();
    await k.exec('globalThis.tick = 0');
    const pending = k.exec('while (true) { globalThis.tick++; await new Promise(r => setTimeout(r, 20)) }');
    await sleep(800);
    fs.writeFileSync(p.flagFile, 'go');
    const res = await Promise.race([pending, sleep(6000).then(() => ({ TIMEOUT_DO_TESTE: true }))]);
    if (res.TIMEOUT_DO_TESTE) console.log('resultado: loop assincrono NAO foi interrompido em 6s');
    else show('loop assincrono', res);
    show('tick apos interrupcao', await k.exec('globalThis.tick'));
    await sleep(300);
    show('tick continua subindo? (loop realmente parou?)', await k.exec('globalThis.tick'));
    k.kill();
  }
  process.exit(0);
})();
