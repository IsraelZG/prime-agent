const { Kernel, show } = require('./host');
(async () => {
  const k = new Kernel('inspector');
  show('import() direto', await k.exec('const m1 = await import("node:os"); typeof m1.EOL'));
  show('ponte __import', await k.exec('const m2 = await globalThis.__import("node:os"); typeof m2.EOL'));
  show('require() normal', await k.exec('const m3 = require("node:os"); typeof m3.EOL'));
  k.kill();
})();
