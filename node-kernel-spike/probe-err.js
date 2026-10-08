const { Kernel } = require('./host');
(async () => {
  const k = new Kernel('inspector');
  for (const [lbl, code] of [
    ['SyntaxError', 'const a = 1;\nconst q = ;'],
    ['throw string', 'throw "string crua"'],
    ['throw objeto', 'throw { codigo: 42 }'],
  ]) {
    const r = await k.exec(code);
    console.log(`--- ${lbl}: ${r.ok ? 'ok' : r.error.message.split('\n')[0]}`);
  }
  k.kill(); process.exit(0);
})();
