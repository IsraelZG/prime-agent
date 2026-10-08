'use strict';
// Worker "cao de guarda": a thread principal fica BLOQUEADA num loop sincrono e nao
// consegue receber a mensagem de interrupcao pelo IPC. Este worker vive numa thread
// separada, observa um arquivo-sentinela e dispara Runtime.terminateExecution na
// thread principal via Session.connectToMainThread().
const { workerData, parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const inspector = require('node:inspector');

const session = new inspector.Session();
session.connectToMainThread();

setInterval(() => {
  if (!fs.existsSync(workerData.flagFile)) return;
  try { fs.unlinkSync(workerData.flagFile); } catch { /* ignore */ }
  session.post('Runtime.terminateExecution', (err) => {
    if (parentPort) parentPort.postMessage({ terminated: !err, err: err && err.message });
  });
}, 25);
