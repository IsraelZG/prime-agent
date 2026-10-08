'use strict';
// INVARIANTE 8: equivalente a celula %%bash -- rodar git --version e capturar a saida.
const { Kernel, show } = require('./host');

(async () => {
  const k = new Kernel('inspector');

  show('A) execSync sincrono, valor de retorno',
    await k.exec('require("node:child_process").execSync("git --version").toString().trim()'));

  show('B) top-level await + execFile assincrono (nao bloqueia o kernel)',
    await k.exec(`
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);
const { stdout, stderr } = await execFile("git", ["--version"]);
({ stdout: stdout.trim(), stderr, codigo: 0 })
`));

  show('C) comando que falha: codigo de saida e stderr capturados',
    await k.exec(`
const cp = require("node:child_process");
const r = cp.spawnSync("git", ["comando-que-nao-existe"], { encoding: "utf8" });
({ status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() })
`));

  show('D) shell de verdade (pipes, redirecionamento) via shell:true',
    await k.exec(`
const cp = require("node:child_process");
const r = cp.spawnSync("git --version && node --version", { shell: true, encoding: "utf8" });
r.stdout.trim().split("\\n")
`));

  show('E) saida do subprocesso vai para o stdout capturado da celula?',
    await k.exec('require("node:child_process").execSync("git --version", { stdio: "inherit" }); "fim"'));

  show('F) estado do kernel continua vivo depois de tudo', await k.exec('typeof require'));
  console.log(`vazou algo para o stdout real do kernel? ${JSON.stringify(k.leakedStdout)}`);
  k.kill();
  process.exit(0);
})();
