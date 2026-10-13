const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const documentService = loadTypeScript('src/services/receiptDocumentService.ts');

function nativeFixture() {
  const deleted = [];
  const state = {
    permission: { granted: true, canAskAgain: true }, permissionCalls: 0, cameraCalls: 0,
    cameraResult: { canceled: false, assets: [{ uri: 'file:///cache/camera.jpg', mimeType: 'image/jpeg', fileSize: 100 }] },
    fileResult: { canceled: false, assets: [{ uri: 'content://provider/nota', name: 'nota.pdf', mimeType: 'application/pdf', size: 100 }] }
  };
  class NativeFile {
    constructor(uri) { this.uri = uri; this.size = 100; this.exists = true; }
    delete() { deleted.push(this.uri); }
  }
  const service = loadTypeScript('src/services/receiptAcquisitionService.ts', {
    './receiptDocumentService': documentService,
    'expo-file-system': { File: NativeFile, Paths: { cache: { uri: 'file:///cache/' } } },
    'expo-image-picker': {
      CameraType: { back: 'back' },
      requestCameraPermissionsAsync: async () => { state.permissionCalls++; return state.permission; },
      launchCameraAsync: async () => { state.cameraCalls++; return typeof state.cameraResult === 'function' ? state.cameraResult() : state.cameraResult; }
    },
    'expo-document-picker': {
      getDocumentAsync: async options => {
        assert.equal(options.copyToCacheDirectory, false);
        assert.equal(options.base64, false);
        return state.fileResult;
      }
    }
  });
  return { service, state, deleted };
}

test('Android: permissão recusada/bloqueada retorna português sem abrir câmera', async () => {
  const { service, state } = nativeFixture();
  assert.equal(state.permissionCalls, 0);
  for (const canAskAgain of [true, false]) {
    state.permission = { granted: false, canAskAgain };
    const result = await service.acquireReceiptDocument('camera', new AbortController().signal);
    assert.equal(result.status, 'error');
    assert.match(result.message, canAskAgain ? /recusado/ : /bloqueada/);
  }
  assert.equal(state.cameraCalls, 0);
});

test('Android: câmera e PDF são selecionados; limpeza não toca arquivo do usuário', async () => {
  const { service, state, deleted } = nativeFixture();
  const photo = await service.acquireReceiptDocument('camera', new AbortController().signal);
  assert.equal(photo.status, 'selected');
  service.releaseReceiptDocument(photo.document);
  assert.deepEqual(deleted, ['file:///cache/camera.jpg']);
  const pdf = await service.acquireReceiptDocument('file', new AbortController().signal);
  assert.equal(pdf.status, 'selected');
  service.releaseReceiptDocument(pdf.document);
  assert.equal(deleted.length, 1);
  state.cameraResult.assets[0].uri = 'file:///cache-other/camera.jpg';
  const outside = await service.acquireReceiptDocument('camera', new AbortController().signal);
  service.releaseReceiptDocument(outside.document);
  assert.equal(deleted.length, 1);
});

test('Android: cancelamento imediato/tardio não entrega documento e limpa foto temporária', async () => {
  const { service, state, deleted } = nativeFixture();
  let controller = new AbortController();
  controller.abort();
  assert.equal((await service.acquireReceiptDocument('camera', controller.signal)).status, 'cancelled');
  assert.equal(state.permissionCalls, 0);
  controller = new AbortController();
  let resolveCamera;
  state.cameraResult = () => new Promise(resolve => { resolveCamera = resolve; });
  const pending = service.acquireReceiptDocument('camera', controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  resolveCamera({ canceled: false, assets: [{ uri: 'file:///cache/late.jpg', mimeType: 'image/jpeg', fileSize: 100 }] });
  assert.equal((await pending).status, 'cancelled');
  assert.deepEqual(deleted, ['file:///cache/late.jpg']);
});

test('Android: cancelar seletor e rejeitar tamanho inválido não retornam documento', async () => {
  const { service, state } = nativeFixture();
  state.fileResult = { canceled: true };
  assert.equal((await service.acquireReceiptDocument('file', new AbortController().signal)).status, 'cancelled');
  state.fileResult = { canceled: false, assets: [{ uri: 'content://nota', name: 'nota.pdf', mimeType: 'application/pdf', size: documentService.MAX_RECEIPT_SIZE + 1 }] };
  assert.equal((await service.acquireReceiptDocument('file', new AbortController().signal)).status, 'error');
});

function webFixture() {
  let input;
  let count = 0;
  const revoked = [];
  class Input extends EventTarget {
    constructor() { super(); this.style = {}; this.files = []; this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    click() { this.clicked = true; }
    remove() { this.removed = true; }
  }
  const service = loadTypeScript('src/services/receiptAcquisitionService.web.ts', {
    './receiptDocumentService': documentService
  }, {
    document: { createElement: () => (input = new Input()), body: { appendChild() {} } },
    URL: { createObjectURL: () => 'blob:owned-' + ++count, revokeObjectURL: uri => revoked.push(uri) }
  });
  return { service, revoked, input: () => input };
}

test('web: abre seletor imediatamente, aceita imagens/PDF e libera URL somente uma vez', async () => {
  const { service, input, revoked } = webFixture();
  for (const [name, type] of [['nota.jpg', 'image/jpeg'], ['nota.jpeg', 'image/jpeg'], ['nota.png', 'image/png'], ['nota.pdf', 'application/pdf']]) {
    const pending = service.acquireReceiptDocument('file', new AbortController().signal);
    assert.equal(input().clicked, true);
    assert.match(input().accept, /application\/pdf/);
    input().files = [{ name, type, size: 100 }];
    input().dispatchEvent(new Event('change'));
    const result = await pending;
    assert.equal(result.status, 'selected');
    assert.equal(input().removed, true);
    service.releaseReceiptDocument(result.document);
    service.releaseReceiptDocument(result.document);
  }
  assert.equal(revoked.length, 4);
});

test('web: câmera sugere captura; cancelar ou abortar remove input e ignora eventos antigos', async () => {
  const { service, input } = webFixture();
  let controller = new AbortController();
  let pending = service.acquireReceiptDocument('camera', controller.signal);
  assert.equal(input().attributes.capture, 'environment');
  assert.equal(input().accept.includes('application/pdf'), false);
  const previous = input();
  controller.abort();
  assert.equal((await pending).status, 'cancelled');
  assert.equal(previous.removed, true);
  previous.dispatchEvent(new Event('change'));
  pending = service.acquireReceiptDocument('file', new AbortController().signal);
  input().dispatchEvent(new Event('cancel'));
  assert.equal((await pending).status, 'cancelled');
  assert.equal(input().removed, true);
});

test('web: arquivo inválido é rejeitado sem manter URL temporária', async () => {
  const { service, input, revoked } = webFixture();
  const pending = service.acquireReceiptDocument('file', new AbortController().signal);
  input().files = [{ name: 'arquivo.exe', type: 'application/octet-stream', size: 100 }];
  input().dispatchEvent(new Event('change'));
  assert.equal((await pending).status, 'error');
  assert.equal(input().removed, true);
  assert.equal(revoked.length, 1);
});

test('metadados aceitam limite de 10 MB e rejeitam MIME divergente, vazio e tamanho desconhecido', () => {
  const base = { uri: 'local:nota', name: 'nota.JPG', mimeType: 'image/jpeg', size: documentService.MAX_RECEIPT_SIZE, source: 'file' };
  assert.equal(documentService.normalizeReceiptDocument(base).size, documentService.MAX_RECEIPT_SIZE);
  assert.equal(documentService.normalizeReceiptDocument({ ...base, mimeType: '' }).mimeType, 'image/jpeg');
  for (const patch of [{ mimeType: 'application/pdf' }, { size: 0 }, { size: NaN }, { size: undefined }, { size: Infinity }]) {
    assert.throws(() => documentService.normalizeReceiptDocument({ ...base, ...patch }));
  }
});
