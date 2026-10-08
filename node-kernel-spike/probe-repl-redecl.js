const repl = require('node:repl');
const { PassThrough } = require('node:stream');
const input = new PassThrough(), output = new PassThrough();
output.on('data', c => process.stdout.write('[replout] ' + JSON.stringify(c.toString()) + '\n'));
const r = repl.start({ input, output, terminal:false, useColors:false, prompt:'', useGlobal:false });
function run(code){
  return new Promise((res) => {
    let done = false;
    const t = setTimeout(() => { if(!done){ done=true; res({timeout:true}); } }, 2000);
    r.eval(code + '\n', r.context, 'probe.js', (err, val) => {
      if (done) return; done = true; clearTimeout(t);
      res({ err: err && (err.name + ': ' + err.message), val });
    });
  });
}
(async () => {
  console.log('1:', JSON.stringify(await run('const x = 1')));
  console.log('2:', JSON.stringify(await run('const x = 1')));
  console.log('3:', JSON.stringify(await run('x')));
  process.exit(0);
})();
