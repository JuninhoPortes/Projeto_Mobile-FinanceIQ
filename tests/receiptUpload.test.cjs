const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
require('../financeiq-api/node_modules/ts-node').register({ project: path.resolve(__dirname, '../financeiq-api/tsconfig.json') });
const express = require('../financeiq-api/node_modules/express');
const { createReceiptRoutes } = require('../financeiq-api/src/routes/receiptRoutes.ts');
const { createReceiptUpload } = require('../financeiq-api/src/middleware/receiptUpload.ts');
const { receiveReceipt } = require('../financeiq-api/src/services/receiptMultipart.ts');
const { validateReceiptDocument } = require('../financeiq-api/src/services/receiptDocumentValidation.ts');
const { LocalReceiptLimits, receiptUploadConfig } = require('../financeiq-api/src/services/receiptUploadLimits.ts');
const { ReceiptUploadError } = require('../financeiq-api/src/services/receiptUploadError.ts');
const { image, pdf, multipart } = require('./helpers/receiptUploadFixtures.cjs');
const env = { RECEIPT_LIMITS_MODE: 'local-single-process' };

async function endpoint(t, { settings = {}, validate, verify = async token => ({ uid: token }), pilots = 'pilot,other,a,b,c,d,e' } = {}) {
  const app = express();
  app.use('/receipts', createReceiptRoutes(verify, pilots, createReceiptUpload({ ...env, ...settings }, validate)));
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = ({ upload, bytes = upload?.bytes, contentType = upload?.contentType, token = 'pilot', chunked = false } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/receipts/analyze', method: 'POST', headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(bytes && !chunked ? { 'Content-Length': bytes.length } : {})
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)), headers: response.headers }));
    });
    req.on('error', reject);
    req.end(bytes);
  });
  return { request, server };
}

test('upload não é lido/validado antes de autenticação e autorização', async t => {
  let validations = 0;
  const verify = async token => {
    if (token === 'invalid') throw Object.assign(new Error('secret'), { code: 'auth/invalid-id-token' });
    return { uid: token };
  };
  const { request } = await endpoint(t, { verify, validate: async () => { validations++; }, pilots: 'pilot' });
  const upload = multipart([{ bytes: Buffer.from('not an image') }]);
  assert.equal((await request({ upload, token: null })).status, 401);
  assert.equal((await request({ upload, token: 'invalid' })).status, 401);
  assert.equal((await request({ upload, token: 'unauthorized' })).status, 403);
  assert.equal(validations, 0);
});

test('PNG e JPEG válidos retornam 501 sem campos financeiros', async t => {
  const { request } = await endpoint(t);
  for (const format of ['png', 'jpeg']) {
    const upload = multipart([{ bytes: await image(format), name: `synthetic.${format}`, mime: `image/${format}` }]);
    const response = await request({ upload });
    assert.equal(response.status, 501, JSON.stringify(response.body));
    assert.equal(response.body.code, 'RECEIPT_ANALYSIS_NOT_IMPLEMENTED');
    assert.equal('fields' in response.body, false);
  }
});

test('PDFs válidos com uma e três páginas retornam 501', async t => {
  const { request } = await endpoint(t);
  for (const pages of [1, 3]) {
    const response = await request({ upload: multipart([{ bytes: pdf(pages), name: 'synthetic.pdf', mime: 'application/pdf' }]) });
    assert.equal(response.status, 501, JSON.stringify(response.body));
  }
});

test('arquivo vazio retorna 422 e ausência de arquivo retorna 400', async t => {
  const { request } = await endpoint(t);
  assert.equal((await request({ upload: multipart([{ bytes: Buffer.alloc(0) }]) })).status, 422);
  assert.equal((await request({ upload: multipart() })).status, 400);
});

test('arquivo acima de 10 MiB retorna 413 com ou sem Content-Length', async t => {
  const { request } = await endpoint(t);
  const upload = multipart([{ bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }]);
  for (const chunked of [false, true]) assert.equal((await request({ upload, chunked })).status, 413);
});

test('tamanho limite exato é aceito pelo transporte e limite configurado é respeitado', async t => {
  const captured = [];
  const { request } = await endpoint(t, { settings: { RECEIPT_MAX_FILE_BYTES: '128' }, validate: async upload => { captured.push(upload.bytes); } });
  assert.equal((await request({ upload: multipart([{ bytes: Buffer.alloc(128, 7) }]) })).status, 501);
  assert.equal((await request({ upload: multipart([{ bytes: Buffer.alloc(129) }]) })).status, 413);
  assert.equal(captured[0].every(byte => byte === 0), true);
});

test('extensão, MIME e assinatura falsificados são rejeitados', async t => {
  const { request } = await endpoint(t);
  const png = await image();
  for (const file of [
    { bytes: png, name: 'synthetic.jpg', mime: 'image/png' },
    { bytes: png, name: 'synthetic.jpg', mime: 'image/jpeg' },
    { bytes: png, name: 'synthetic.txt', mime: 'image/png' },
    { bytes: Buffer.from('https://external.test/document.pdf'), name: 'synthetic.pdf', mime: 'application/pdf' }
  ]) assert.equal((await request({ upload: multipart([file]) })).status, 415);
});

test('JPG e PNG truncados ou corrompidos retornam 422', async t => {
  const { request } = await endpoint(t);
  for (const format of ['png', 'jpeg']) {
    const bytes = await image(format);
    const response = await request({ upload: multipart([{ bytes: bytes.subarray(0, bytes.length - 15), name: `synthetic.${format}`, mime: `image/${format}` }]) });
    assert.equal(response.status, 422, JSON.stringify(response.body));
  }
  const corrupted = await image();
  const position = corrupted.indexOf(Buffer.from('IDAT'));
  corrupted[position + 5] ^= 0xff;
  assert.equal((await request({ upload: multipart([{ bytes: corrupted }]) })).status, 422);
});

test('largura, altura e total de pixels excessivos são rejeitados', async t => {
  const { request } = await endpoint(t, { settings: { RECEIPT_MAX_IMAGE_WIDTH: '20', RECEIPT_MAX_IMAGE_HEIGHT: '20', RECEIPT_MAX_IMAGE_PIXELS: '300' } });
  for (const [width, height] of [[21, 1], [1, 21], [20, 20]]) {
    assert.equal((await request({ upload: multipart([{ bytes: await image('png', width, height) }]) })).status, 422);
  }
});

test('PDF com quatro páginas, protegido, truncado ou tabela corrompida é rejeitado', async t => {
  const { request } = await endpoint(t);
  const corrupted = Buffer.from(pdf().toString().replace('xref\n0 ', 'xref\n9 '));
  for (const bytes of [pdf(4), pdf(1, true), pdf().subarray(0, 150), corrupted]) {
    const response = await request({ upload: multipart([{ bytes, name: 'synthetic.pdf', mime: 'application/pdf' }]) });
    assert.equal(response.status, 422, JSON.stringify(response.body));
  }
});

test('múltiplos arquivos, campo inesperado, campos textuais e URLs são rejeitados', async t => {
  const { request } = await endpoint(t, { validate: async () => {} });
  const file = { bytes: Buffer.from('synthetic') };
  for (const upload of [
    multipart([file, file]), multipart([{ ...file, field: 'file' }]),
    multipart([file], [['userId', 'pilot']]), multipart([], [['url', 'https://external.test/a.pdf']])
  ]) assert.equal((await request({ upload })).status, 400);
});

test('multipart ausente, sem boundary ou truncado retorna 400', async t => {
  const { request } = await endpoint(t);
  const complete = multipart([{ bytes: await image() }]);
  for (const options of [
    {}, { bytes: Buffer.from('{}'), contentType: 'application/json' },
    { bytes: Buffer.from('invalid'), contentType: 'multipart/form-data' },
    { bytes: Buffer.from('--x\r\ninvalid'), contentType: 'multipart/form-data; boundary=x' },
    { bytes: complete.bytes.subarray(0, complete.bytes.length - 45), contentType: complete.contentType }
  ]) assert.equal((await request(options)).status, 400);
});

test('cabeçalhos multipart excessivos são rejeitados antes de decodificação', async t => {
  const { request } = await endpoint(t, { validate: async () => assert.fail('não deve validar') });
  for (const extra of [`X-Test: ${'a'.repeat(2100)}\r\n`, Array.from({ length: 9 }, (_, index) => `X-${index}: test\r\n`).join('')]) {
    assert.equal((await request({ upload: multipart([{ bytes: Buffer.from('test') }], [], extra) })).status, 400);
  }
});

test('quinta solicitação é permitida; sexta no mesmo minuto retorna 429', async t => {
  const { request } = await endpoint(t, { validate: async () => {} });
  const upload = multipart([{ bytes: Buffer.from('synthetic') }]);
  for (let index = 0; index < 5; index++) assert.equal((await request({ upload })).status, 501);
  assert.equal((await request({ upload })).status, 429);
});

test('quota diária conta rejeições e impede tentativas excessivas', async t => {
  const { request } = await endpoint(t, { settings: { RECEIPT_REQUESTS_PER_DAY: '2' } });
  assert.equal((await request()).status, 400);
  assert.equal((await request()).status, 400);
  assert.equal((await request()).status, 429);
});

test('quota é móvel por minuto e diária em UTC; release é idempotente', () => {
  let now = Date.parse('2026-10-14T23:59:58Z');
  const limits = new LocalReceiptLimits(receiptUploadConfig(env), () => now);
  for (let index = 0; index < 5; index++) { const lease = limits.acquire('pilot'); lease.release(); lease.release(); }
  now += 3000;
  assert.equal(limits.acquire('pilot'), null); // Virada de minuto/dia não permite um burst.
  now += 60000;
  const lease = limits.acquire('pilot');
  assert.ok(lease);
  lease.release();
});

test('quota diária admite trinta operações e só renova no dia seguinte', () => {
  let now = Date.parse('2026-10-14T10:00:00Z');
  const limits = new LocalReceiptLimits(receiptUploadConfig(env), () => now);
  for (let index = 0; index < 30; index++) {
    const lease = limits.acquire('pilot');
    assert.ok(lease);
    lease.release();
    now += 61000;
  }
  assert.equal(limits.acquire('pilot'), null);
  now = Date.parse('2026-10-15T10:00:00Z');
  const lease = limits.acquire('pilot');
  assert.ok(lease);
  lease.release();
});

test('limite exato de 10 MiB passa pelo transporte sem truncamento', async t => {
  let size;
  const { request } = await endpoint(t, { validate: async upload => { size = upload.bytes.length; } });
  const upload = multipart([{ bytes: Buffer.alloc(10 * 1024 * 1024, 7) }]);
  assert.equal((await request({ upload })).status, 501);
  assert.equal(size, 10 * 1024 * 1024);
});

test('concorrência por UID e global é liberada após conclusão', async t => {
  const pending = [];
  let arrived;
  const firstStarted = new Promise(resolve => { arrived = resolve; });
  const { request } = await endpoint(t, { validate: () => new Promise(resolve => { pending.push(resolve); arrived(); }) });
  const upload = multipart([{ bytes: Buffer.from('synthetic') }]);
  const first = request({ upload });
  await firstStarted;
  assert.equal((await request({ upload })).status, 429);
  const others = ['a', 'b', 'c'].map(token => request({ upload, token }));
  while (pending.length < 4) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await request({ upload, token: 'd' })).status, 429);
  pending.splice(0).forEach(resolve => resolve());
  assert.equal((await first).status, 501);
  assert.deepEqual((await Promise.all(others)).map(response => response.status), [501, 501, 501]);
  const next = request({ upload, token: 'd' });
  while (!pending.length) await new Promise(resolve => setTimeout(resolve, 5));
  pending.shift()();
  assert.equal((await next).status, 501);
});

test('buffers são zerados e concorrência liberada após sucesso, rejeição e erro operacional', async t => {
  for (const failure of [undefined, new ReceiptUploadError(422, 'INVALID_DOCUMENT'), new Error('sensitive-data')]) {
    const captured = [];
    const { request } = await endpoint(t, { validate: async upload => { captured.push(upload.bytes); if (failure) throw failure; } });
    const upload = multipart([{ bytes: Buffer.from('synthetic') }]);
    const expected = failure ? failure instanceof ReceiptUploadError ? 422 : 503 : 501;
    assert.equal((await request({ upload })).status, expected);
    assert.equal((await request({ upload })).status, expected);
    assert.ok(captured.every(bytes => bytes.every(byte => byte === 0)));
  }
});

test('prazo de upload incompleto gera 504 e libera reserva', async t => {
  const { request, server } = await endpoint(t, { settings: { RECEIPT_UPLOAD_TIMEOUT_MS: '40' }, validate: async () => {} });
  const upload = multipart([{ bytes: Buffer.from('synthetic') }]);
  const incomplete = new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', path: '/receipts/analyze', headers: { Authorization: 'Bearer pilot', 'Content-Type': upload.contentType } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.write(upload.bytes.subarray(0, 40));
    t.after(() => req.destroy());
  });
  assert.equal(await incomplete, 504);
  assert.equal((await request({ upload })).status, 501);
});

test('cancelamento de upload remove listeners e permite requisição posterior', async t => {
  const { PassThrough } = require('node:stream');
  const req = new PassThrough();
  req.headers = { 'content-type': multipart().contentType };
  const controller = new AbortController();
  const operation = receiveReceipt(req, 1024, controller.signal);
  req.write(Buffer.from('--FinanceIQSyntheticBoundary\r\n'));
  controller.abort();
  await assert.rejects(operation, error => error.status === 504);
  assert.equal(req.listenerCount('data'), 0);
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(req.listenerCount('error'), 0);
});

test('cancelamento HTTP durante validação zera buffer e libera concorrência', async t => {
  let buffer;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let cancelled;
  const finished = new Promise(resolve => { cancelled = resolve; });
  let first = true;
  const { request, server } = await endpoint(t, { validate: (upload, _config, signal) => {
    if (!first) return Promise.resolve();
    first = false;
    buffer = upload.bytes;
    started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { reject(new ReceiptUploadError(504, 'DOCUMENT_VALIDATION_TIMEOUT')); cancelled(); }, { once: true }));
  } });
  const upload = multipart([{ bytes: Buffer.from('synthetic') }]);
  const req = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', path: '/receipts/analyze', headers: { Authorization: 'Bearer pilot', 'Content-Type': upload.contentType } });
  req.on('error', () => {});
  req.end(upload.bytes);
  await ready;
  req.destroy();
  await finished;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(buffer.every(byte => byte === 0), true);
  assert.equal((await request({ upload })).status, 501);
});

test('timeout real do processo validador gera 504 e libera concorrência', async t => {
  const { request } = await endpoint(t, { settings: { RECEIPT_VALIDATION_TIMEOUT_MS: '1' } });
  const upload = multipart([{ bytes: await image() }]);
  assert.equal((await request({ upload })).status, 504);
  assert.equal((await request({ upload })).status, 504);
});

test('controles desativados, configuração inválida e produção falham fechados', async t => {
  for (const settings of [
    { RECEIPT_LIMITS_MODE: '' }, { NODE_ENV: 'production' },
    { RECEIPT_MAX_FILE_BYTES: 'invalid' }, { RECEIPT_GLOBAL_CONCURRENCY: '0' },
    { RECEIPT_LIMITS_MODE: 'distributed' }
  ]) {
    const { request } = await endpoint(t, { settings, validate: async () => assert.fail('não deve processar') });
    assert.equal((await request()).status, 503);
  }
});

test('validação local não executa OCR, interpretação, upload externo ou gravação', async () => {
  const { fork } = require('node:child_process');
  const observed = [];
  const launch = (file, args, options) => {
    for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'NODE_OPTIONS', 'FIREBASE_PROJECT_ID']) assert.equal(key in options.env, false);
    const child = fork(file, args, { ...options, execArgv: [...options.execArgv, '--require', path.resolve(__dirname, 'helpers/receiptWorkerIOGuard.cjs')] });
    child.on('message', message => observed.push(message));
    return child;
  };
  for (const upload of [{ bytes: pdf(), format: 'pdf' }, { bytes: await image(), format: 'png' }]) {
    await validateReceiptDocument(upload, receiptUploadConfig(env), new AbortController().signal, launch);
    upload.bytes.fill(0);
  }
  assert.equal(observed.length, 2);
  assert.ok(observed.every(message => message.ok && message.externalIOAttempts === 0));
});
