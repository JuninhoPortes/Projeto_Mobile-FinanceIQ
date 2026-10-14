const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once, EventEmitter, getEventListeners } = require('node:events');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const express = require('../financeiq-api/node_modules/express');
const { createReceiptRoutes } = require('../financeiq-api/src/routes/receiptRoutes.ts');
const { createReceiptUpload } = require('../financeiq-api/src/middleware/receiptUpload.ts');
const { withReceiptDocument } = require('../financeiq-api/src/services/receiptDocumentScope.ts');
const { validateReceiptDocument } = require('../financeiq-api/src/services/receiptDocumentValidation.ts');
const { LocalReceiptLimits } = require('../financeiq-api/src/services/receiptUploadLimits.ts');
const { image, pdf, multipart } = require('./helpers/receiptUploadFixtures.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const signalAbort = signal => signal.aborted ? Promise.resolve() : new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));

async function endpoint(t, consume, { settings = {}, validate = validateReceiptDocument } = {}) {
  const app = express();
  app.use('/receipts', createReceiptRoutes(async token => {
    if (token === 'invalid') throw Object.assign(new Error('secret'), { code: 'auth/invalid-id-token' });
    return { uid: token };
  }, 'pilot,a,b,c,d', createReceiptUpload({ RECEIPT_LIMITS_MODE: 'local-single-process', ...settings }, validate, consume)));
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const raw = (payload, token = 'pilot', onResponse) => http.request({
    hostname: '127.0.0.1', port: server.address().port, path: '/receipts/analyze', method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': payload.contentType }
  }, onResponse);
  const request = (payload, token) => new Promise((resolve, reject) => {
    const req = raw(payload, token, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject);
    req.end(payload.bytes);
  });
  return { request, raw, server };
}

test('consumidor recebe imagem/PDF realmente validados, MIME técnico e empréstimo sem cópia', async t => {
  const held = [];
  const { request } = await endpoint(t, async (document, signal) => {
    const bytes = document.readBytes();
    const snapshot = Buffer.from(bytes);
    held.push({ document, bytes });
    assert.equal(document.size, bytes.length);
    assert.equal(document.mimeType, document.format === 'pdf' ? 'application/pdf' : `image/${document.format}`);
    assert.equal(signal.aborted, false);
    await tick();
    assert.equal(document.readBytes(), bytes);
    assert.deepEqual(bytes, snapshot);
  });
  for (const file of [{ bytes: await image(), name: 'synthetic.png', mime: 'image/png' }, { bytes: pdf(), name: 'synthetic.pdf', mime: 'application/pdf' }]) {
    const result = await request(multipart([file]));
    assert.equal(result.status, 501);
    assert.equal(result.body.code, 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED');
    assert.equal('fields' in result.body, false);
  }
  for (const { document, bytes } of held) {
    assert.throws(() => document.readBytes(), error => error.code === 'DOCUMENT_ACCESS_CLOSED');
    assert.throws(() => document.size);
    assert.throws(() => document.mimeType);
    assert.ok(bytes.every(value => value === 0));
  }
});

test('documento corrompido ou upload rejeitado não chegam ao consumidor', async t => {
  let consumers = 0;
  const { request } = await endpoint(t, async () => { consumers++; });
  const png = await image();
  assert.equal((await request(multipart([{ bytes: png.subarray(0, png.length - 10) }]))).status, 422);
  assert.equal((await request(multipart([{ bytes: png, field: 'unexpected' }]))).status, 400);
  assert.equal(consumers, 0);
});

test('401/403 preservados e nenhum consumidor acionado sem autorização', async t => {
  let consumers = 0;
  const { request } = await endpoint(t, async () => { consumers++; });
  const payload = multipart([{ bytes: await image() }]);
  for (const [token, status] of [[null, 401], ['invalid', 401], ['unauthorized', 403]]) {
    assert.equal((await request(payload, token)).status, status);
  }
  assert.equal(consumers, 0);
});

test('sucesso aguarda o processamento e só depois descarta e libera concorrência', async t => {
  const started = deferred();
  const finish = deferred();
  let held;
  let count = 0;
  const { request } = await endpoint(t, async document => {
    if (count++ > 0) return;
    held = document.readBytes();
    started.resolve();
    await finish.promise;
    assert.ok(held.some(byte => byte !== 0));
  });
  const payload = multipart([{ bytes: await image() }]);
  let responded = false;
  const pending = request(payload).then(result => { responded = true; return result; });
  await started.promise;
  assert.equal(responded, false);
  assert.equal((await request(payload)).status, 429);
  finish.resolve();
  assert.equal((await pending).status, 501);
  assert.ok(held.every(byte => byte === 0));
  assert.equal((await request(payload)).status, 501);
});

test('erro síncrono e rejeição assíncrona do consumidor descartam e não expõem detalhes', async t => {
  for (const asyncFailure of [false, true]) {
    let held;
    let handle;
    const { request } = await endpoint(t, document => {
      held = document.readBytes(); handle = document;
      if (asyncFailure) return Promise.reject(new Error('secret fiscal data'));
      throw new Error('secret fiscal data');
    });
    const payload = multipart([{ bytes: await image() }]);
    const result = await request(payload);
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result).includes('secret fiscal data'), false);
    assert.ok(held.every(byte => byte === 0));
    assert.throws(() => handle.readBytes());
    assert.equal((await request(payload)).status, 503); // sem reserva vazada.
  }
});

test('timeout revoga escopo mas aguarda limpeza do consumidor antes de responder/liberar', async t => {
  const aborted = deferred();
  const finishCleanup = deferred();
  let held;
  let handle;
  let calls = 0;
  const { request } = await endpoint(t, async (document, signal) => {
    if (calls++ > 0) return;
    held = document.readBytes(); handle = document;
    await signalAbort(signal);
    aborted.resolve();
    await finishCleanup.promise;
  }, { settings: { RECEIPT_PROCESSING_TIMEOUT_MS: '10' } });
  const payload = multipart([{ bytes: await image() }]);
  let responded = false;
  const pending = request(payload).then(result => { responded = true; return result; });
  await aborted.promise;
  assert.throws(() => handle.readBytes());
  assert.equal(responded, false);
  assert.ok(held.some(value => value !== 0)); // proprietário ainda aguarda término.
  assert.equal((await request(payload)).status, 429);
  finishCleanup.resolve();
  assert.equal((await pending).status, 504);
  assert.ok(held.every(value => value === 0));
  assert.equal((await request(payload)).status, 501);
});

test('cancelamento externo anterior ou durante processamento revoga acesso e remove listeners', async () => {
  const upload = { bytes: Buffer.from('synthetic'), format: 'png' };
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(withReceiptDocument(upload, async () => assert.fail('não consumir'), cancelled.signal, 1000), error => error.status === 504);
  const controller = new AbortController();
  const started = deferred();
  const finish = deferred();
  let handle;
  let stopped = false;
  const operation = withReceiptDocument(upload, async (document, signal) => {
    handle = document;
    started.resolve();
    await signalAbort(signal);
    assert.throws(() => document.readBytes());
    await finish.promise;
  }, controller.signal, 1000).finally(() => { stopped = true; });
  await started.promise;
  controller.abort(); controller.abort();
  await tick();
  assert.equal(stopped, false);
  finish.resolve();
  await assert.rejects(operation, error => error.status === 504);
  assert.throws(() => handle.readBytes());
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('desconexão HTTP durante upload libera reserva e não chama consumidor', async t => {
  let consumers = 0;
  const { request, raw, server } = await endpoint(t, async () => { consumers++; });
  const aborted = deferred();
  server.prependListener('request', req => req.once('aborted', aborted.resolve));
  const payload = multipart([{ bytes: await image() }]);
  const req = raw(payload);
  req.on('error', () => {});
  req.write(payload.bytes.subarray(0, 50));
  // Esperar a requisição entrar em upload sem usar um sleep fixo.
  await once(server, 'request');
  await tick();
  assert.equal((await request(payload)).status, 429);
  req.destroy();
  await aborted.promise; await tick();
  assert.equal(consumers, 0);
  assert.equal((await request(payload)).status, 501);
  assert.equal(consumers, 1);
});

test('desconexão durante consumidor mantém reserva até sua confirmação de término', async t => {
  const started = deferred();
  const aborted = deferred();
  const cleanup = deferred();
  let bytes;
  let handle;
  let count = 0;
  const { request, raw } = await endpoint(t, async (document, signal) => {
    if (count++ > 0) return;
    bytes = document.readBytes(); handle = document;
    started.resolve();
    await signalAbort(signal); aborted.resolve();
    await cleanup.promise;
  });
  const payload = multipart([{ bytes: await image() }]);
  let responses = 0;
  const req = raw(payload, 'pilot', res => { responses++; res.resume(); });
  req.on('error', () => {}); req.end(payload.bytes);
  await started.promise; req.destroy();
  await aborted.promise;
  assert.throws(() => handle.readBytes());
  assert.equal((await request(payload)).status, 429);
  cleanup.resolve(); await tick();
  assert.ok(bytes.every(byte => byte === 0));
  assert.equal((await request(payload)).status, 501);
  assert.equal(responses, 0);
});

test('concorrência global inclui consumidores e é liberada somente após todos terminarem', async t => {
  const entered = [deferred(), deferred(), deferred(), deferred()];
  const releases = [deferred(), deferred(), deferred(), deferred()];
  let count = 0;
  const { request } = await endpoint(t, async () => {
    const index = count++;
    if (index >= 4) return;
    entered[index].resolve(); await releases[index].promise;
  });
  const payload = multipart([{ bytes: await image() }]);
  const pending = ['pilot', 'a', 'b', 'c'].map(token => request(payload, token));
  await Promise.all(entered.map(event => event.promise));
  assert.equal((await request(payload, 'd')).status, 429);
  releases[0].resolve();
  await Promise.race(pending);
  assert.equal((await request(payload, 'd')).status, 501);
  releases.forEach(event => event.resolve());
  assert.ok((await Promise.all(pending)).every(result => result.status === 501));
});

test('falha de inicialização do worker descarta buffer e não chama consumidor', async t => {
  let held;
  let consumed = 0;
  const { request } = await endpoint(t, async () => { consumed++; }, { validate: (upload, config, signal) => {
    held = upload.bytes;
    return validateReceiptDocument(upload, config, signal, () => { throw new Error('spawn failed'); });
  } });
  const payload = multipart([{ bytes: await image() }]);
  assert.equal((await request(payload)).status, 503);
  assert.ok(held.every(value => value === 0));
  assert.equal((await request(payload)).status, 503);
  assert.equal(consumed, 0);
});

test('worker real encerrando inesperadamente retorna 503 sem acesso ao consumidor', async t => {
  const { fork } = require('node:child_process');
  let closed = false;
  let held;
  const { request } = await endpoint(t, async () => assert.fail('não consumir'), { validate: (upload, config, signal) => {
    held = upload.bytes;
    return validateReceiptDocument(upload, config, signal, (_file, _args, options) => {
      const child = fork('-e', ['process.exit(7)'], options);
      child.once('close', () => { closed = true; });
      return child;
    });
  } });
  assert.equal((await request(multipart([{ bytes: await image() }]))).status, 503);
  assert.equal(closed, true);
  assert.ok(held.every(value => value === 0));
});

test('erro IPC síncrono aguarda close do worker antes do descarte e da liberação', async t => {
  const stopRequested = deferred();
  let child;
  let held;
  let responses = 0;
  const { request } = await endpoint(t, async () => assert.fail('não consumir'), { validate: (upload, config, signal) => {
    held = upload.bytes;
    return validateReceiptDocument(upload, config, signal, () => {
      child = new EventEmitter();
      child.send = () => { throw new Error('IPC send failed'); };
      child.kill = () => { stopRequested.resolve(); return true; };
      return child;
    });
  } });
  const payload = multipart([{ bytes: await image() }]);
  const pending = request(payload).then(result => { responses++; return result; });
  await stopRequested.promise;
  assert.equal((await request(payload)).status, 429);
  assert.ok(held.some(value => value !== 0));
  assert.equal(responses, 0);
  child.emit('close', 1);
  child.emit('close', 1); // corrida de encerramento não duplica finalização.
  assert.equal((await pending).status, 503);
  assert.equal(responses, 1);
  assert.ok(held.every(value => value === 0));
});

test('falha ao solicitar encerramento mantém reserva até close confirmado', async t => {
  const requested = deferred();
  let child;
  const { request } = await endpoint(t, async () => assert.fail('não consumir'), { settings: { RECEIPT_VALIDATION_TIMEOUT_MS: '10' }, validate: (upload, config, signal) => validateReceiptDocument(upload, config, signal, () => {
    child = new EventEmitter();
    child.send = () => {};
    child.kill = () => { requested.resolve(); throw new Error('cannot kill yet'); };
    return child;
  }) });
  const payload = multipart([{ bytes: await image() }]);
  const pending = request(payload);
  await requested.promise;
  assert.equal((await request(payload)).status, 429);
  child.emit('close', 1);
  assert.equal((await pending).status, 503);
});

test('corrida entre timeout, desconexão e conclusão libera reserva uma única vez', async t => {
  const original = LocalReceiptLimits.prototype.acquire;
  let releases = 0;
  LocalReceiptLimits.prototype.acquire = function(uid) {
    const lease = original.call(this, uid);
    if (!lease) return null;
    return { release() { releases++; lease.release(); } };
  };
  t.after(() => { LocalReceiptLimits.prototype.acquire = original; });
  const aborted = deferred();
  const finish = deferred();
  let held;
  const { raw } = await endpoint(t, async (document, signal) => {
    held = document.readBytes();
    await signalAbort(signal); aborted.resolve();
    await finish.promise;
  }, { settings: { RECEIPT_PROCESSING_TIMEOUT_MS: '10' } });
  const payload = multipart([{ bytes: await image() }]);
  const req = raw(payload); req.on('error', () => {}); req.end(payload.bytes);
  await aborted.promise;
  req.destroy(); finish.resolve();
  await tick(); await tick();
  assert.equal(releases, 1);
  assert.ok(held.every(value => value === 0));
});

test('consumidor não cooperativo não ganha liberação antecipada e resultado tardio não vira sucesso', async t => {
  const started = deferred();
  const finish = deferred();
  let signal;
  const { request } = await endpoint(t, async (_document, abortSignal) => {
    signal = abortSignal; started.resolve(); await finish.promise;
  }, { settings: { RECEIPT_PROCESSING_TIMEOUT_MS: '10' } });
  const payload = multipart([{ bytes: await image() }]);
  const pending = request(payload);
  await started.promise;
  await signalAbort(signal);
  assert.equal((await request(payload)).status, 429);
  finish.resolve();
  assert.equal((await pending).status, 504);
});

test('limpeza do consumidor é aguardada inclusive se ele rejeitar após abort', async () => {
  const controller = new AbortController();
  const started = deferred();
  const cleanup = deferred();
  let settled = false;
  const pending = withReceiptDocument({ bytes: Buffer.from('synthetic'), format: 'png' }, async (_doc, signal) => {
    started.resolve();
    await signalAbort(signal);
    await cleanup.promise;
    throw new Error('cleanup finished with rejection');
  }, controller.signal, 1000).finally(() => { settled = true; });
  await started.promise; controller.abort(); await tick();
  assert.equal(settled, false);
  cleanup.resolve();
  await assert.rejects(pending, error => error.status === 504);
});

test('rejeições sem objeto de erro nunca são promovidas a 501', async t => {
  for (const reason of [undefined, null, false, 0]) {
    const { request } = await endpoint(t, async () => { throw reason; });
    assert.equal((await request(multipart([{ bytes: await image() }]))).status, 503);
  }
});

test('consumidor simulado não faz rede ou persistência e escopo não envia conteúdo à resposta', async () => {
  const fs = require('node:fs');
  const https = require('node:https');
  const net = require('node:net');
  const restore = [];
  let attempts = 0;
  const deny = (target, key) => {
    const original = target[key];
    target[key] = () => { attempts++; throw new Error('Unexpected I/O'); };
    restore.push(() => { target[key] = original; });
  };
  for (const target of [http, https]) for (const key of ['request', 'get']) deny(target, key);
  deny(net.Socket.prototype, 'connect'); deny(globalThis, 'fetch');
  for (const key of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']) deny(fs, key);
  deny(fs.promises, 'writeFile'); deny(fs.promises, 'appendFile');
  const controller = new AbortController();
  let handle;
  try {
    await withReceiptDocument({ bytes: Buffer.from('synthetic'), format: 'png' }, async document => {
      handle = document;
      assert.equal(document.readBytes().toString(), 'synthetic');
      await tick();
      assert.equal(document.readBytes().toString(), 'synthetic');
    }, controller.signal, 1000);
    assert.throws(() => handle.readBytes());
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(attempts, 0);
  } finally { restore.forEach(reset => reset()); }
});
