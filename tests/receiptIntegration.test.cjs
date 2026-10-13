const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript, createHookRuntime, find, text, button, native } = require('./helpers/receiptTestRuntime.cjs');
const { prepareReceiptFormPatch } = loadTypeScript('src/services/receiptFormService.ts');
const categories = [
  { name: 'Receita', type: 'income', is_active: true, color: '#111111' },
  { name: 'Alimentação', type: 'outcome', is_active: true, color: '#222222' },
  { name: 'Lazer', type: 'outcome', is_active: true, color: '#333333' }
];
const analysis = (status = 'success') => ({
  status, provider: 'mock', isSimulated: true, message: 'Dados simulados.',
  fields: status === 'partial'
    ? { description: 'Parcial simulada', amount: 50 }
    : { description: 'Compra simulada', amount: 129.90, type: 'outcome', category: 'Lazer', identifiedDate: '2026-09-15' }
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const input = (runtime, placeholder) => find(runtime.tree, node => node.type === 'TextInput' && node.props.placeholder === placeholder);

async function screenRuntime(options = {}) {
  const runtime = createHookRuntime();
  const writes = [];
  const alerts = [];
  const updates = [];
  const removals = [];
  let releaseSave;
  let rejectSave;
  const transactionService = {
    listAll: async () => options.transactions ?? [],
    add: (uid, data) => {
      writes.push({ uid, data });
      return new Promise((resolve, reject) => { releaseSave = resolve; rejectSave = reject; });
    },
    updateAmount: async (id, amount) => { updates.push({ id, amount }); },
    update: async (id, data) => { updates.push({ id, data }); },
    remove: async id => { removals.push(id); }
  };
  const screen = loadTypeScript('src/screens/Lancamentos.tsx', {
    react: runtime.react,
    'react-native': { ...native, Alert: { alert: (...args) => alerts.push(args) } },
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    '../database/transactionService': { transactionService },
    '../database/categoryService': { categoryService: { listAll: async () => categories } },
    '../services/categorySuggestionService': { categorySuggestionService: {
      suggestCategory: ({ description, type }) => !description ? null : {
        category: categories.find(category => category.name === (type === 'income' ? 'Receita' : 'Alimentação')),
        shouldAutoSelect: true
      }
    } },
    '../../firebaseConfig': { auth: { currentUser: options.user === undefined ? { uid: 'test-user' } : options.user } },
    '../components/ReceiptImportSection': { default: 'ReceiptImportSection' },
    '../services/receiptFormService': { prepareReceiptFormPatch }
  }).default;
  runtime.mount(screen);
  await tick();
  runtime.render();
  if (options.openNew !== false) {
    find(runtime.tree, node => node.type === 'TouchableOpacity' && !!find(node, child => child.type === 'Icon' && child.props.name === 'plus')).props.onPress();
    runtime.render();
  }
  return {
    runtime, writes, alerts, updates, removals,
    releaseSave: () => releaseSave(),
    rejectSave: () => rejectSave(new Error('Falha fictícia de persistência'))
  };
}

test('integração preenche formulário, mantém categoria importada e restaura sugestão ao editar', async () => {
  const { runtime, writes } = await screenRuntime();
  let section = find(runtime.tree, node => node.type === 'ReceiptImportSection');
  assert.equal(section.props.onApply(analysis()), true);
  runtime.render();
  assert.equal(input(runtime, 'Ex: Netflix').props.value, 'Compra simulada');
  assert.equal(input(runtime, '0,00').props.value, '129,90');
  const selectedCategory = find(runtime.tree, node => node.type === 'TouchableOpacity' && text(node) === 'Lazer');
  assert.equal(selectedCategory.props.style[1].backgroundColor, '#333333');
  assert.equal(writes.length, 0);
  input(runtime, 'Ex: Netflix').props.onChangeText('Texto manual');
  runtime.render();
  const manualCategory = find(runtime.tree, node => node.type === 'TouchableOpacity' && text(node) === 'Alimentação');
  assert.equal(manualCategory.props.style[1].backgroundColor, '#222222');
  section = find(runtime.tree, node => node.type === 'ReceiptImportSection');
  assert.equal(section.props.onApply({ status: 'error' }), false);
  assert.equal(input(runtime, 'Ex: Netflix').props.value, 'Texto manual');
  runtime.unmount();
});

test('leitura parcial preserva tipo e categoria; somente Salvar persiste e bloqueia cliques simultâneos', async () => {
  const { runtime, writes, releaseSave } = await screenRuntime();
  button(runtime.tree, '↑ Entrada').props.onPress();
  runtime.render();
  input(runtime, 'Ex: Netflix').props.onChangeText('Salário manual');
  runtime.render();
  find(runtime.tree, node => node.type === 'ReceiptImportSection').props.onApply(analysis('partial'));
  runtime.render();
  assert.equal(input(runtime, '0,00').props.value, '50,00');
  assert.equal(writes.length, 0);
  const save = button(runtime.tree, 'Salvar').props.onPress;
  const pending = save();
  await save();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.type, 'income');
  assert.equal(writes[0].data.category, 'Receita');
  assert.deepEqual(Object.keys(writes[0].data).sort(), ['amount', 'category', 'description', 'type']);
  releaseSave();
  await pending;
  runtime.render();
  runtime.unmount();
});

test('cadastro manual sem importação mantém validações e o payload existente', async () => {
  const { runtime, writes, alerts, releaseSave } = await screenRuntime();
  await button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(alerts.at(-1)[1], 'Preencha o valor.');
  assert.equal(writes.length, 0);
  input(runtime, '0,00').props.onChangeText('7500');
  runtime.render();
  await button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(alerts.at(-1)[1], 'Preencha a descrição.');
  input(runtime, 'Ex: Netflix').props.onChangeText('Compra manual');
  runtime.render();
  const pending = button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].uid, 'test-user');
  assert.equal(writes[0].data.description, 'Compra manual');
  assert.equal(writes[0].data.amount, 75);
  assert.equal(writes[0].data.type, 'outcome');
  assert.equal(writes[0].data.category, 'Alimentação');
  releaseSave();
  await pending;
  runtime.unmount();
});

test('fechar e reabrir o formulário invalida até um callback capturado anteriormente', async () => {
  const { runtime, writes } = await screenRuntime();
  const staleApply = find(runtime.tree, node => node.type === 'ReceiptImportSection').props.onApply;
  button(runtime.tree, 'Cancelar').props.onPress();
  assert.equal(staleApply(analysis()), false);
  runtime.render();
  assert.equal(input(runtime, 'Ex: Netflix').props.value, '');
  find(runtime.tree, node => node.type === 'TouchableOpacity' && !!find(node, child => child.type === 'Icon' && child.props.name === 'plus')).props.onPress();
  runtime.render();
  assert.equal(staleApply(analysis()), false);
  assert.equal(input(runtime, 'Ex: Netflix').props.value, '');
  assert.equal(writes.length, 0);
  runtime.unmount();
});

function importRuntime() {
  const runtime = createHookRuntime();
  let focused = true;
  let resolveAnalysis;
  let passedSignal;
  const applied = [];
  const released = [];
  const doc = { uri: 'local:receipt', name: 'nota.jpg', size: 100, mimeType: 'image/jpeg', source: 'file' };
  const component = loadTypeScript('src/components/ReceiptImportSection.tsx', {
    react: runtime.react,
    'react-native': native,
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    '@react-navigation/native': { useIsFocused: () => focused },
    '../services/receiptAcquisitionService': {
      acquireReceiptDocument: async () => ({ status: 'selected', document: doc }),
      releaseReceiptDocument: document => released.push(document)
    },
    '../services/receiptAnalysisService': { receiptAnalysisService: {
      analyze: (document, context, signal) => {
        passedSignal = signal;
        return new Promise(resolve => { resolveAnalysis = resolve; });
      }
    } }
  }).default;
  runtime.mount(component, { categories, onApply: result => { applied.push(result); return true; } });
  button(runtime.tree, 'Importar nota fiscal').props.onPress();
  runtime.render();
  return {
    runtime, applied, released,
    finish: value => resolveAnalysis(value),
    signal: () => passedSignal,
    blur: () => { focused = false; runtime.render(); }
  };
}

test('mostra loading e aplica resultado somente após conclusão', async () => {
  const { runtime, applied, finish } = importRuntime();
  const pending = button(runtime.tree, 'Escolher arquivo').props.onPress();
  await tick();
  runtime.render();
  assert.match(text(runtime.tree), /Analisando nota fiscal/);
  assert.ok(find(runtime.tree, node => node.type === 'ActivityIndicator'));
  assert.equal(applied.length, 0);
  finish(analysis());
  await pending;
  runtime.render();
  assert.equal(applied.length, 1);
  assert.match(text(runtime.tree), /Dados simulados preenchidos/);
  runtime.unmount();
});

test('cancelar análise descarta resultado atrasado mesmo se o serviço ignorar o abort', async () => {
  const { runtime, applied, finish, signal } = importRuntime();
  const pending = button(runtime.tree, 'Escolher arquivo').props.onPress();
  await tick();
  runtime.render();
  button(runtime.tree, 'Cancelar análise').props.onPress();
  assert.equal(signal().aborted, true);
  finish(analysis());
  await pending;
  runtime.render();
  assert.equal(applied.length, 0);
  assert.match(text(runtime.tree), /Operação cancelada/);
  runtime.unmount();
});

test('sair da tela ou desmontar componente impede aplicação tardia', async () => {
  for (const action of ['blur', 'unmount']) {
    const fixture = importRuntime();
    const pending = button(fixture.runtime.tree, 'Escolher arquivo').props.onPress();
    await tick();
    fixture.runtime.render();
    if (action === 'blur') fixture.blur(); else fixture.runtime.unmount();
    fixture.finish(analysis());
    await pending;
    assert.equal(fixture.applied.length, 0);
    assert.equal(fixture.signal().aborted, true);
    assert.equal(fixture.released.length, 1);
    if (action === 'blur') fixture.runtime.unmount();
  }
});

test('falha de processamento preserva formulário e exibe mensagem', async () => {
  const { runtime, applied, finish } = importRuntime();
  const pending = button(runtime.tree, 'Escolher arquivo').props.onPress();
  await tick();
  finish({ status: 'error', message: 'Falha simulada.', isSimulated: true, provider: 'mock' });
  await pending;
  runtime.render();
  assert.equal(applied.length, 0);
  assert.match(text(runtime.tree), /Falha simulada/);
  runtime.unmount();
});

test('edição de lançamento fixo mantém modos adicionar/substituir e não oferece importação', async () => {
  for (const mode of ['add', 'replace']) {
    const fixture = await screenRuntime({ openNew: false, transactions: [{
      id: 'fixed', description: 'Moradia', amount: 100, type: 'outcome', category: 'Moradia', is_fixed: true
    }] });
    const { runtime, updates, writes } = fixture;
    find(runtime.tree, node => node.type === 'TouchableOpacity' && node.props.key === 'fixed').props.onPress();
    runtime.render();
    assert.equal(find(runtime.tree, node => node.type === 'ReceiptImportSection'), undefined);
    if (mode === 'replace') {
      button(runtime.tree, 'Substituir').props.onPress();
      runtime.render();
    }
    input(runtime, '0,00').props.onChangeText('5000');
    runtime.render();
    await button(runtime.tree, 'Salvar').props.onPress();
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 'fixed');
    assert.equal(updates[0].amount, mode === 'add' ? 150 : 50);
    assert.equal(writes.length, 0);
    runtime.unmount();
  }
});

test('edição personalizada atualiza apenas valor/categoria e não oferece importação', async () => {
  const { runtime, updates, writes } = await screenRuntime({ openNew: false, transactions: [{
    id: 'custom', description: 'Assinatura', amount: 10, type: 'outcome', category: 'Lazer'
  }] });
  find(runtime.tree, node => node.type === 'TouchableOpacity' && node.props.key === 'custom').props.onPress();
  runtime.render();
  assert.equal(find(runtime.tree, node => node.type === 'ReceiptImportSection'), undefined);
  assert.equal(input(runtime, 'Ex: Netflix'), undefined);
  input(runtime, '0,00').props.onChangeText('2500');
  runtime.render();
  await button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(updates[0].id, 'custom');
  assert.deepEqual(Object.keys(updates[0].data).sort(), ['amount', 'category']);
  assert.equal(updates[0].data.amount, 25);
  assert.equal(updates[0].data.category, 'Lazer');
  assert.equal(writes.length, 0);
  runtime.unmount();
});

test('exclusão personalizada ainda exige confirmação e fixos não exibem exclusão', async () => {
  const fixture = await screenRuntime({ openNew: false, transactions: [
    { id: 'custom', description: 'Assinatura', amount: 10, type: 'outcome', category: 'Lazer' },
    { id: 'fixed', description: 'Moradia', amount: 100, type: 'outcome', category: 'Moradia', is_fixed: true }
  ] });
  const { runtime, alerts, removals } = fixture;
  const fixedRow = find(runtime.tree, node => node.type === 'TouchableOpacity' && node.props.key === 'fixed');
  assert.equal(find(fixedRow, node => node.type === 'Icon' && node.props.name === 'trash-can-outline'), undefined);
  const row = find(runtime.tree, node => node.type === 'TouchableOpacity' && node.props.key === 'custom');
  find(row, node => node !== row && node.type === 'TouchableOpacity' && !!find(node, child => child.type === 'Icon' && child.props.name === 'trash-can-outline')).props.onPress();
  assert.equal(removals.length, 0);
  assert.equal(alerts.at(-1)[0], 'Excluir Lançamento');
  await alerts.at(-1)[2].find(option => option.text === 'Excluir').onPress();
  assert.deepEqual(removals, ['custom']);
  runtime.unmount();
});

test('falha no salvamento preserva valores e permite nova tentativa', async () => {
  const fixture = await screenRuntime();
  const { runtime, writes, alerts } = fixture;
  find(runtime.tree, node => node.type === 'ReceiptImportSection').props.onApply(analysis());
  runtime.render();
  const pending = button(runtime.tree, 'Salvar').props.onPress();
  fixture.rejectSave();
  await pending;
  runtime.render();
  assert.equal(alerts.at(-1)[1], 'Não foi possível salvar.');
  assert.equal(input(runtime, '0,00').props.value, '129,90');
  assert.equal(input(runtime, 'Ex: Netflix').props.value, 'Compra simulada');
  assert.equal(button(runtime.tree, 'Salvar').props.disabled, false);
  const retry = button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(writes.length, 2);
  fixture.releaseSave();
  await retry;
  runtime.unmount();
});

test('valor zero, categoria ausente e usuário sem autenticação impedem persistência', async () => {
  const { runtime, writes, alerts } = await screenRuntime();
  input(runtime, '0,00').props.onChangeText('0');
  input(runtime, 'Ex: Netflix').props.onChangeText('Compra manual');
  runtime.render();
  await button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(alerts.at(-1)[1], 'Insira um valor válido maior que zero.');
  input(runtime, '0,00').props.onChangeText('5000');
  runtime.render();
  button(runtime.tree, 'Alimentação').props.onPress();
  runtime.render();
  await button(runtime.tree, 'Salvar').props.onPress();
  assert.equal(alerts.at(-1)[0], 'Categoria obrigatória');
  assert.equal(writes.length, 0);
  runtime.unmount();
  const noUser = await screenRuntime({ user: null });
  input(noUser.runtime, '0,00').props.onChangeText('5000');
  input(noUser.runtime, 'Ex: Netflix').props.onChangeText('Compra manual');
  noUser.runtime.render();
  await button(noUser.runtime.tree, 'Salvar').props.onPress();
  assert.equal(noUser.alerts.at(-1)[1], 'Usuário não autenticado.');
  assert.equal(noUser.writes.length, 0);
  noUser.runtime.unmount();
});
