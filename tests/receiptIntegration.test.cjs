const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript, createHookRuntime, find, text, button, native } = require('./helpers/receiptTestRuntime.cjs');
const { prepareReceiptFormPatch } = loadTypeScript('src/services/receiptFormService.ts');
const categoryKeywords = loadTypeScript('src/constants/categoryKeywords.ts');
const { categorySuggestionService: realCategorySuggestionService } = loadTypeScript('src/services/categorySuggestionService.ts', {
  '../constants/categoryKeywords': categoryKeywords
});
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
  const loadedCategories = options.categories ?? categories;
  let categoryReads = 0;
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
    '../database/categoryService': { categoryService: { listAll: async () => { categoryReads++; return loadedCategories; } } },
    '../services/categorySuggestionService': { categorySuggestionService: options.realSuggestions ? realCategorySuggestionService : {
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
    runtime, writes, alerts, updates, removals, categoryReads: () => categoryReads,
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

function importRuntime(props = {}, mode) {
  const runtime = createHookRuntime();
  let focused = true;
  let resolveAnalysis;
  const analyses = [];
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
    '../services/receiptAnalysisService': { receiptAnalysisMode: mode, receiptAnalysisService: {
      analyze: (document, context, signal) => {
        passedSignal = signal;
        return new Promise(resolve => { resolveAnalysis = resolve; analyses.push(resolve); });
      }
    } }
  }).default;
  runtime.mount(component, { categories, onApply: result => { applied.push(result); return true; }, ...props });
  button(runtime.tree, 'Importar nota fiscal').props.onPress();
  runtime.render();
  return {
    runtime, applied, released,
    finish: (value, index) => index === undefined ? resolveAnalysis(value) : analyses[index](value),
    signal: () => passedSignal,
    blur: () => { focused = false; runtime.render(); }
  };
}

const pendingCategoryMessage = 'Nenhuma categoria foi sugerida automaticamente. Escolha a categoria manualmente.';
const categorySelected = (runtime, name) => !!button(runtime.tree, name)?.props.style[1];
const receiptSection = runtime => find(runtime.tree, node => node.type === 'ReceiptImportSection');
const openNew = runtime => {
  find(runtime.tree, node => node.type === 'TouchableOpacity' && !!find(node, child => child.type === 'Icon' && child.props.name === 'plus')).props.onPress();
  runtime.render();
};
const changeDescription = (runtime, value) => { input(runtime, 'Ex: Netflix').props.onChangeText(value); runtime.render(); };
const realScreen = (options = {}) => screenRuntime({
  realSuggestions: true,
  categories: [...categories.map(category => ({ ...category, is_default: true })),
    { name: 'Compras', type: 'outcome', is_active: true, is_default: true, color: '#444444' }],
  ...options
});

test('motor real: digitação progressiva de barbearia remove seleção automática intermediária', async () => {
  const f = await realScreen();
  for (const [description, selected] of [['b', false], ['ba', false], ['bar', true], ['barb', false], ['barbearia', false]]) {
    changeDescription(f.runtime, description);
    assert.equal(categorySelected(f.runtime, 'Lazer'), selected, description);
  }
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  assert.equal(f.writes.length, 0);
  assert.equal(f.categoryReads(), 1);
  f.runtime.unmount();
});

test('motor real: colar barbearia não seleciona Lazer', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'barbearia');
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  f.runtime.unmount();
});

test('motor real: Compras manual permanece durante digitação progressiva e troca para Netflix', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  for (const description of ['b', 'ba', 'bar', 'barb', 'barbearia', 'Netflix', '']) {
    changeDescription(f.runtime, description);
    assert.equal(categorySelected(f.runtime, 'Compras'), true, description);
    assert.equal(categorySelected(f.runtime, 'Lazer'), false);
    assert.equal(text(f.runtime.tree).includes('Categoria sugerida: Lazer.'), false);
  }
  assert.equal(f.writes.length, 0);
  f.runtime.unmount();
});

test('motor real: Usar Compras protege a seleção contra perda de correspondência e outra sugestão', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'Loja de testes');
  button(f.runtime.tree, 'Usar Compras').props.onPress(); f.runtime.render();
  for (const description of ['bar', 'barbearia', 'Netflix', '']) {
    changeDescription(f.runtime, description);
    assert.equal(categorySelected(f.runtime, 'Compras'), true, description);
    assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  }
  f.runtime.unmount();
});

test('motor real: seleção automática acompanha novas sugestões e é removida na ambiguidade', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'bar');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  changeDescription(f.runtime, 'Restaurante');
  assert.equal(categorySelected(f.runtime, 'Alimentação'), true);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  changeDescription(f.runtime, 'Netflix restaurante');
  assert.equal(categorySelected(f.runtime, 'Alimentação'), false);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.match(text(f.runtime.tree), /Mais de uma categoria/);
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  assert.equal(f.categoryReads(), 1);
  f.runtime.unmount();
});

test('motor real: apagar descrição remove somente a categoria de origem automática', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  changeDescription(f.runtime, '');
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.equal(text(f.runtime.tree).includes(pendingCategoryMessage), false);
  f.runtime.unmount();
});

test('motor real: sugestão que exige confirmação substitui aviso mas não mantém seleção automática obsoleta', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'Netflix');
  changeDescription(f.runtime, 'Loja de testes');
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  assert.ok(button(f.runtime.tree, 'Usar Compras'));
  f.runtime.unmount();
});

test('motor real: cancelar e reabrir não conserva seleção automática nem aceita callback antigo', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'bar');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  const staleApply = receiptSection(f.runtime).props.onApply;
  button(f.runtime.tree, 'Cancelar').props.onPress(); f.runtime.render();
  openNew(f.runtime);
  assert.equal(staleApply(analysis()), false);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  changeDescription(f.runtime, 'barbearia');
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  changeDescription(f.runtime, 'Restaurante');
  assert.equal(categorySelected(f.runtime, 'Alimentação'), true);
  assert.equal(f.writes.length, 0);
  f.runtime.unmount();
});

test('motor real: categoria aplicada pela importação deixa de pertencer ao efeito automático', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'bar');
  receiptSection(f.runtime).props.onApply(analysis()); f.runtime.render();
  changeDescription(f.runtime, 'barbearia');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true); // categoria explícita da importação, não da digitação.
  assert.equal(f.writes.length, 0);
  f.runtime.unmount();
});

test('motor real: importação sem categoria preserva o valor anterior e mantém sua origem automática', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'bar');
  receiptSection(f.runtime).props.onApply({ ...analysis('partial'), provider: 'backend' }); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Lazer'), true); // campo ausente não apaga a seleção na importação.
  changeDescription(f.runtime, 'barbearia');
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  f.runtime.unmount();
});

test('motor real: mudança de tipo invalida origem automática e permite sugestão compatível', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'bar');
  button(f.runtime.tree, '↑ Entrada').props.onPress(); f.runtime.render();
  assert.equal(button(f.runtime.tree, 'Lazer'), undefined);
  assert.equal(categorySelected(f.runtime, 'Receita'), false);
  changeDescription(f.runtime, 'Salário');
  assert.equal(categorySelected(f.runtime, 'Receita'), true);
  f.runtime.unmount();
});

test('motor real: resposta tardia não substitui sugestão automática da descrição mais recente', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'bar');
  const child = importRuntime(receiptSection(f.runtime).props, 'backend-simulated');
  const pending = button(child.runtime.tree, 'Escolher arquivo').props.onPress(); await tick();
  changeDescription(f.runtime, 'Restaurante');
  child.finish({ ...analysis(), provider: 'backend' }); await pending;
  f.runtime.render(); child.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Alimentação'), true);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.equal(input(f.runtime, 'Ex: Netflix').props.value, 'Restaurante');
  assert.match(text(child.runtime.tree), /campos foram editados/);
  assert.equal(f.writes.length, 0);
  child.runtime.unmount(); f.runtime.unmount();
});

test('motor real: aviso pendente desaparece com seleção válida e reaparece ao desmarcar', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'XYZ');
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), true);
  assert.equal(text(f.runtime.tree).includes(pendingCategoryMessage), false);
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  assert.equal(f.categoryReads(), 1);
  assert.equal(f.writes.length, 0);
  f.runtime.unmount();
});

test('motor real: cliques agrupados mantêm seleção e desmarcação consistentes', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'XYZ');
  const select = button(f.runtime.tree, 'Compras').props.onPress;
  select(); select(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  f.runtime.unmount();
});

test('motor real: categoria que fica inativa ou ausente na lista não oculta aviso pendente', async () => {
  for (const state of ['inactive', 'missing']) {
    const loaded = categories.map(category => ({ ...category, is_default: true }));
    const f = await realScreen({ categories: loaded });
    changeDescription(f.runtime, 'XYZ');
    button(f.runtime.tree, 'Lazer').props.onPress(); f.runtime.render();
    assert.equal(text(f.runtime.tree).includes(pendingCategoryMessage), false);
    if (state === 'inactive') loaded.find(category => category.name === 'Lazer').is_active = false;
    else loaded.splice(loaded.findIndex(category => category.name === 'Lazer'), 1);
    f.runtime.render();
    assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
    assert.equal(button(f.runtime.tree, 'Lazer'), undefined);
    assert.equal(f.categoryReads(), 1);
    f.runtime.unmount();
  }
});

test('motor real: escolha manual resiste à edição da descrição e a recomendações automáticas', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  for (const description of ['Netflix', 'Restaurante', 'XYZ']) {
    changeDescription(f.runtime, description);
    assert.equal(categorySelected(f.runtime, 'Compras'), true);
    assert.equal(categorySelected(f.runtime, 'Lazer'), false);
    assert.equal(categorySelected(f.runtime, 'Alimentação'), false);
    assert.equal(text(f.runtime.tree).includes(pendingCategoryMessage), false);
  }
  assert.equal(f.categoryReads(), 1);
  f.runtime.unmount();
});

test('motor real: confirmar Usar Compras também é escolha manual protegida', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'Loja de testes');
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  button(f.runtime.tree, 'Usar Compras').props.onPress(); f.runtime.render();
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Compras'), true);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  f.runtime.unmount();
});

test('motor real: escolha manual oculta sugestão conflitante sem apagar a sugestão ao desmarcar', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Compras'), true);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  assert.equal(text(f.runtime.tree).includes('Categoria sugerida: Lazer.'), false);
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  assert.ok(text(f.runtime.tree).includes('Categoria sugerida: Lazer.'));
  assert.equal(f.categoryReads(), 1);
  assert.equal(f.writes.length, 0);
  f.runtime.unmount();
});

test('motor real: sem escolha manual mantém mensagem automática e opção Usar quando aplicável', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  assert.ok(text(f.runtime.tree).includes('Categoria sugerida: Lazer.'));
  changeDescription(f.runtime, 'Loja de testes');
  assert.ok(button(f.runtime.tree, 'Usar Compras'));
  // Escolher Compras manualmente oculta a recomendação; desmarcar a revela novamente.
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  assert.equal(button(f.runtime.tree, 'Usar Compras'), undefined);
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  assert.ok(button(f.runtime.tree, 'Usar Compras'));
  button(f.runtime.tree, 'Usar Compras').props.onPress(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), true);
  assert.equal(button(f.runtime.tree, 'Usar Compras'), undefined);
  f.runtime.unmount();
});

test('motor real: seleção manual inativa, ausente ou incompatível não esconde sugestões', async () => {
  for (const state of ['inactive', 'missing', 'incompatible']) {
    const loaded = [...categories.map(category => ({ ...category, is_default: true })),
      { name: 'Compras', type: 'outcome', is_active: true, is_default: true, color: '#444444' }];
    const f = await realScreen({ categories: loaded });
    button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
    changeDescription(f.runtime, 'Netflix');
    assert.equal(text(f.runtime.tree).includes('Categoria sugerida: Lazer.'), false);
    const manualCategory = loaded.find(category => category.name === 'Compras');
    if (state === 'inactive') manualCategory.is_active = false;
    else if (state === 'missing') loaded.splice(loaded.indexOf(manualCategory), 1);
    else manualCategory.type = 'income';
    f.runtime.render();
    assert.ok(text(f.runtime.tree).includes('Categoria sugerida: Lazer.'));
    assert.equal(f.categoryReads(), 1);
    assert.equal(f.writes.length, 0);
    f.runtime.unmount();
  }
});

test('motor real: importação posterior não substitui categoria manual por categoria do mock ou backend', async () => {
  for (const provider of ['mock', 'backend']) {
    const f = await realScreen();
    const apply = receiptSection(f.runtime).props.onApply;
    button(f.runtime.tree, 'Compras').props.onPress();
    // Exercita a ref de escolha manual antes da próxima renderização do formulário.
    assert.equal(apply({ ...analysis(), provider }), true);
    f.runtime.render();
    assert.equal(categorySelected(f.runtime, 'Compras'), true);
    assert.equal(categorySelected(f.runtime, 'Lazer'), false);
    assert.equal(input(f.runtime, '0,00').props.value, '129,90');
    assert.equal(f.writes.length, 0);
    f.runtime.unmount();
  }
});

test('motor real: categoria escolhida durante a espera invalida resposta atrasada', async () => {
  const f = await realScreen();
  const child = importRuntime(receiptSection(f.runtime).props, 'backend-simulated');
  const pending = button(child.runtime.tree, 'Escolher arquivo').props.onPress();
  await tick();
  button(f.runtime.tree, 'Compras').props.onPress();
  child.finish({ ...analysis(), provider: 'backend' }); await pending;
  f.runtime.render(); child.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), true);
  assert.equal(input(f.runtime, 'Ex: Netflix').props.value, '');
  assert.match(text(child.runtime.tree), /campos foram editados/);
  assert.equal(f.writes.length, 0);
  child.runtime.unmount(); f.runtime.unmount();
});

test('motor real: mudar tipo limpa escolha incompatível sem selecionar outra ou restaurar a antiga', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'XYZ');
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  button(f.runtime.tree, '↑ Entrada').props.onPress(); f.runtime.render();
  assert.equal(button(f.runtime.tree, 'Compras'), undefined);
  assert.equal(categorySelected(f.runtime, 'Receita'), false);
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  changeDescription(f.runtime, 'Salário');
  assert.equal(categorySelected(f.runtime, 'Receita'), false);
  button(f.runtime.tree, 'Receita').props.onPress(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Receita'), true);
  button(f.runtime.tree, '↓ Saída').props.onPress(); f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  assert.equal(categorySelected(f.runtime, 'Lazer'), false);
  f.runtime.unmount();
});

test('motor real: tipo recebido na importação limpa manual incompatível e exige nova seleção', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  receiptSection(f.runtime).props.onApply({ ...analysis(), fields: { ...analysis().fields, type: 'income', category: 'Receita' } });
  f.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Receita'), false);
  assert.equal(button(f.runtime.tree, 'Compras'), undefined);
  await button(f.runtime.tree, 'Salvar').props.onPress();
  assert.equal(f.alerts.at(-1)[0], 'Categoria obrigatória');
  assert.equal(f.writes.length, 0);
  f.runtime.unmount();
});

test('motor real: cancelar e reabrir limpa proteção manual e continua rejeitando callback da sessão anterior', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  const staleApply = receiptSection(f.runtime).props.onApply;
  button(f.runtime.tree, 'Cancelar').props.onPress(); f.runtime.render();
  openNew(f.runtime);
  assert.equal(staleApply(analysis()), false);
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  assert.equal(categorySelected(f.runtime, 'Compras'), false);
  assert.equal(f.categoryReads(), 1);
  f.runtime.unmount();
});

test('motor real: salvar mantém payload anterior e nova sessão não herda proteção manual', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  changeDescription(f.runtime, 'Netflix');
  input(f.runtime, '0,00').props.onChangeText('1000'); f.runtime.render();
  assert.equal(f.writes.length, 0);
  const pending = button(f.runtime.tree, 'Salvar').props.onPress();
  assert.equal(f.writes[0].data.category, 'Compras');
  assert.deepEqual(Object.keys(f.writes[0].data).sort(), ['amount', 'category', 'description', 'type']);
  f.releaseSave(); await pending; await tick(); f.runtime.render();
  openNew(f.runtime); changeDescription(f.runtime, 'Restaurante');
  assert.equal(categorySelected(f.runtime, 'Alimentação'), true);
  f.runtime.unmount();
});

test('motor real: sem intervenção manual a seleção automática anterior continua funcionando', async () => {
  const f = await realScreen();
  changeDescription(f.runtime, 'Restaurante');
  assert.equal(categorySelected(f.runtime, 'Alimentação'), true);
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Lazer'), true);
  assert.equal(categorySelected(f.runtime, 'Alimentação'), false);
  f.runtime.unmount();
});

test('motor real: importação fictícia mantém bloqueio automático e aviso parcial independente da seleção', async () => {
  const f = await realScreen();
  const child = importRuntime(receiptSection(f.runtime).props, 'backend-simulated');
  const pending = button(child.runtime.tree, 'Escolher arquivo').props.onPress(); await tick();
  child.finish({ ...analysis('partial'), provider: 'backend', fields: { description: 'Netflix', amount: 50 } });
  await pending; f.runtime.render(); child.runtime.render();
  assert.equal(categorySelected(f.runtime, 'Lazer'), false); // o motor real sugeriria Lazer para esse texto.
  assert.match(text(child.runtime.tree), /Leitura parcial simulada/);
  changeDescription(f.runtime, 'XYZ');
  assert.ok(text(f.runtime.tree).includes(pendingCategoryMessage));
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  assert.equal(text(f.runtime.tree).includes(pendingCategoryMessage), false);
  child.runtime.render(receiptSection(f.runtime).props);
  assert.match(text(child.runtime.tree), /Leitura parcial simulada/);
  assert.equal(f.categoryReads(), 1);
  assert.equal(f.writes.length, 0);
  child.runtime.unmount(); f.runtime.unmount();
});

test('motor real: cancelar análise preserva escolha manual do formulário ainda aberto', async () => {
  const f = await realScreen();
  button(f.runtime.tree, 'Compras').props.onPress(); f.runtime.render();
  const child = importRuntime(receiptSection(f.runtime).props);
  const pending = button(child.runtime.tree, 'Escolher arquivo').props.onPress(); await tick(); child.runtime.render();
  button(child.runtime.tree, 'Cancelar análise').props.onPress();
  child.finish(analysis()); await pending; f.runtime.render();
  changeDescription(f.runtime, 'Netflix');
  assert.equal(categorySelected(f.runtime, 'Compras'), true);
  assert.equal(f.writes.length, 0);
  child.runtime.unmount(); f.runtime.unmount();
});

test('edições manuais durante análise preservam descrição, valor, tipo e categoria sem persistir', async () => {
  for (const edit of ['description', 'amount', 'type', 'category']) {
    const screen = await screenRuntime();
    const section = find(screen.runtime.tree, node => node.type === 'ReceiptImportSection');
    const child = importRuntime(section.props);
    const pending = button(child.runtime.tree, 'Escolher arquivo').props.onPress();
    await tick(); child.runtime.render();
    const before = section.props.getFormRevision();
    if (edit === 'description') input(screen.runtime, 'Ex: Netflix').props.onChangeText('Correção manual');
    if (edit === 'amount') input(screen.runtime, '0,00').props.onChangeText('9900');
    if (edit === 'type') button(screen.runtime.tree, '↑ Entrada').props.onPress();
    if (edit === 'category') button(screen.runtime.tree, 'Lazer').props.onPress();
    // A ref invalida o resultado mesmo antes de uma nova renderização.
    assert.ok(section.props.getFormRevision() > before);
    child.finish({ ...analysis(), provider: 'backend' });
    await pending;
    child.runtime.render(); screen.runtime.render();
    assert.match(text(child.runtime.tree), /campos foram editados/);
    assert.equal(input(screen.runtime, 'Ex: Netflix').props.value, edit === 'description' ? 'Correção manual' : '');
    assert.equal(input(screen.runtime, '0,00').props.value, edit === 'amount' ? '99,00' : '');
    assert.equal(screen.writes.length, 0);
    child.runtime.unmount(); screen.runtime.unmount();
  }
});

test('nova importação após cancelar invalida a antiga e aplica apenas a resposta atual', async () => {
  const f = importRuntime();
  const first = button(f.runtime.tree, 'Escolher arquivo').props.onPress();
  await tick(); f.runtime.render();
  button(f.runtime.tree, 'Cancelar análise').props.onPress();
  f.runtime.render();
  const second = button(f.runtime.tree, 'Escolher arquivo').props.onPress();
  await tick();
  f.finish({ ...analysis(), fields: { ...analysis().fields, description: 'Resposta antiga' } }, 0);
  await first;
  assert.equal(f.applied.length, 0);
  f.finish({ ...analysis(), fields: { ...analysis().fields, description: 'Resposta atual' } }, 1);
  await second;
  assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0].fields.description, 'Resposta atual');
  f.runtime.unmount();
});

test('resposta do backend sem categoria preserva seleção compatível e continua exigindo Salvar', async () => {
  const f = await screenRuntime();
  input(f.runtime, 'Ex: Netflix').props.onChangeText('Descrição anterior');
  f.runtime.render();
  button(f.runtime.tree, 'Lazer').props.onPress();
  f.runtime.render();
  const result = { provider: 'backend', isSimulated: true, status: 'partial', message: 'Dados demonstrativos.',
    fields: { description: 'SIMULAÇÃO — compra', amount: 129.9, type: 'outcome', identifiedDate: '2020-01-01' } };
  find(f.runtime.tree, node => node.type === 'ReceiptImportSection').props.onApply(result);
  f.runtime.render();
  assert.equal(input(f.runtime, 'Ex: Netflix').props.value, result.fields.description);
  assert.equal(input(f.runtime, '0,00').props.value, '129,90');
  assert.equal(button(f.runtime.tree, 'Lazer').props.style[1].backgroundColor, '#333333');
  assert.equal(f.writes.length, 0);
  const pending = button(f.runtime.tree, 'Salvar').props.onPress();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(Object.keys(f.writes[0].data).sort(), ['amount', 'category', 'description', 'type']);
  assert.equal(f.writes[0].data.category, 'Lazer');
  f.releaseSave(); await pending;
  f.runtime.unmount();
});

test('fechar formulário durante análise impede aplicação mesmo com resposta backend tardia', async () => {
  const screen = await screenRuntime();
  const section = find(screen.runtime.tree, node => node.type === 'ReceiptImportSection');
  const child = importRuntime(section.props);
  const pending = button(child.runtime.tree, 'Escolher arquivo').props.onPress();
  await tick();
  button(screen.runtime.tree, 'Cancelar').props.onPress();
  child.finish({ ...analysis(), provider: 'backend' });
  await pending;
  screen.runtime.render();
  assert.equal(input(screen.runtime, 'Ex: Netflix').props.value, '');
  assert.equal(screen.writes.length, 0);
  child.runtime.unmount(); screen.runtime.unmount();
});

test('aviso diferencia envio ao servidor de mock local sem controles técnicos adicionais', () => {
  const backend = importRuntime({}, 'backend-simulated');
  assert.match(text(backend.runtime.tree), /enviado ao servidor FinanceIQ/);
  assert.equal(text(backend.runtime.tree).includes('Nenhum documento será enviado'), false);
  backend.runtime.unmount();
  const mock = importRuntime({}, 'mock');
  assert.match(text(mock.runtime.tree), /Nenhum documento será enviado a serviços externos/);
  mock.runtime.unmount();
});

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
