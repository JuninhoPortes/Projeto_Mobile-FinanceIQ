const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/receiptTestRuntime.cjs');
const { categoryKeywordRules } = loadTypeScript('src/constants/categoryKeywords.ts');
const { defaultCategories } = loadTypeScript('src/constants/defaultCategories.ts');
const loadEngine = (rules = categoryKeywordRules) => loadTypeScript('src/services/categorySuggestionService.ts', {
  '../constants/categoryKeywords': { categoryKeywordRules: rules }
}).categorySuggestionService;
const engine = loadEngine();
const categories = Object.freeze(defaultCategories.map((category, index) => Object.freeze({
  ...category, id: String(index), user_id: 'test-user', is_active: true, is_default: true
})));
const suggest = (description, list = categories, type = 'outcome', service = engine) =>
  service.suggestCategory({ description, categories: list, type });
const unresolved = result => {
  assert.equal(result.category, null);
  assert.equal(result.confidence, 'baixa');
  assert.equal(result.shouldAutoSelect, false);
  assert.equal(result.requiresConfirmation, true);
};
const resolved = (result, name, auto = true, list = categories) => {
  assert.equal(result.category?.name, name);
  assert.equal(result.shouldAutoSelect, auto);
  assert.equal(result.requiresConfirmation, !auto);
  assert.ok(list.some(category => category === result.category)); // reutiliza a categoria existente.
};

for (const description of [
  'Netflix 199,90', 'Netflix 99,90', 'Netflix 99.90', 'Netflix R$ 99',
  'Netflix R$99,90', 'Netflix 1.199,99', 'Netflix 999,99', 'Netflix 0,99',
  '99,90 Netflix', '1,99 Netflix', 'Netflix 99 reais', 'Netflix BRL 99',
  'Netflix 1999,90', 'Netflix 99'
]) {
  test(`preço não ativa Transporte: ${description}`, () => {
    const result = suggest(description);
    resolved(result, 'Lazer');
    assert.equal(result.matchedKeyword, 'netflix');
    assert.equal(result.confidence, 'alta');
  });
}

for (const description of ['199,90', '99,90', '0,99', 'R$ 99', 'BRL 99', '99 reais', '1.99', '999', '99', 'app 99,90', 'app R$ 99', 'app 1,99']) {
  test(`número ou preço isolado não identifica serviço: ${description}`, () => unresolved(suggest(description)));
}

for (const description of ['App 99', '99 app', 'aplicativo 99', '99 aplicativo', 'corrida pela 99', '99 — táxi', 'Transporte 99']) {
  test(`99 com contexto explícito de transporte: ${description}`, () => resolved(suggest(description), 'Transporte'));
}

for (const description of ['Barbearia', 'barato', 'Maximiliano', 'tapete', 'uberlandia', 'ceara', 'Lazeroso', 'Transp']) {
  test(`fragmento de palavra não sugere categoria: ${description}`, () => unresolved(suggest(description)));
}

for (const description of ['Amazon Prime Video', 'AMAZON — PRIME...VÍDEO!', 'Amazon Prime\n\tVideo']) {
  test(`expressão existente supera palavra isolada: ${JSON.stringify(description)}`, () => {
    const result = suggest(description);
    resolved(result, 'Lazer');
    assert.equal(result.matchedKeyword, 'prime video');
  });
}

for (const description of ['Supermercado', 'SUPERMERCADO!', 'Compras no supermercado', 'mercado livre', 'C&A']) {
  test(`correspondência útil de Compras preservada: ${description}`, () => resolved(suggest(description), 'Compras', false));
}

test('expressões compostas e palavras preservam normalização de acentos, caixa e pontuação', () => {
  resolved(suggest('FARMÁCIA!'), 'Saúde');
  resolved(suggest('plano — de... SAÚDE'), 'Saúde');
  resolved(suggest('condomínio'), 'Moradia');
  resolved(suggest('almoço'), 'Alimentação');
  resolved(suggest('PiX\tRECEBIDO', categories, 'income'), 'Receita');
});

test('expressão composta não corresponde a palavras fora de ordem ou separadas por outra palavra', () => {
  unresolved(suggest('video prime'));
  unresolved(suggest('prime qualquer video'));
  unresolved(suggest('youtube assinatura premium'));
});

for (const description of [
  'Netflix Uber', 'restaurante farmácia', 'Prime Video plano de saúde', 'banho e tosa plano de saúde',
  'Amazon Prime Video e Uber', 'Uber e Amazon Prime Video', 'mercado livre e Netflix'
]) {
  test(`conflito sem desempate seguro exige seleção manual: ${description}`, () => {
    const withPets = [...categories, { ...categories[0], id: 'pets', name: 'Pets' }];
    const result = suggest(description, withPets);
    unresolved(result);
    assert.match(result.message, /Mais de uma categoria/);
  });
}

test('ordem das regras e das categorias não altera prioridade ou resolve ambiguidades', () => {
  const reversed = loadEngine([...categoryKeywordRules].reverse());
  const reversedCategories = [...categories].reverse();
  for (const description of ['Amazon Prime Video', 'Netflix Uber', 'Supermercado', 'plano de saúde']) {
    const first = suggest(description);
    const second = suggest(description, reversedCategories, 'outcome', reversed);
    assert.equal(second.category?.id, first.category?.id);
    assert.equal(second.confidence, first.confidence);
    assert.equal(second.shouldAutoSelect, first.shouldAutoSelect);
    assert.equal(second.requiresConfirmation, first.requiresConfirmation);
  }
});

test('categoria ausente não é criada nem substituída por fallback', () => {
  unresolved(suggest('Netflix', categories.filter(category => category.name !== 'Lazer')));
  unresolved(suggest('farmácia', []));
});

test('categoria inativa ou de tipo incompatível não participa da sugestão', () => {
  const inactive = categories.map(category => category.name === 'Lazer' ? { ...category, is_active: false } : category);
  const incompatible = categories.map(category => category.name === 'Lazer' ? { ...category, type: 'income' } : category);
  unresolved(suggest('Netflix', inactive));
  unresolved(suggest('Netflix', incompatible));
  unresolved(suggest('Netflix', categories, 'income'));
  unresolved(suggest('salário', categories, 'outcome'));
});

test('somente regras com categorias disponíveis participam da prioridade e do conflito', () => {
  const withoutLeisure = categories.filter(category => category.name !== 'Lazer');
  resolved(suggest('Amazon Prime Video', withoutLeisure), 'Compras', false, withoutLeisure);
  const withoutTransport = categories.filter(category => category.name !== 'Transporte');
  resolved(suggest('Netflix Uber', withoutTransport), 'Lazer', true, withoutTransport);
});

test('nome completo e único da categoria é respeitado', () => {
  resolved(suggest('SAÚDE!'), 'Saúde');
  const custom = [{ ...categories[0], id: 'custom', name: 'Viagens em família', is_default: false }];
  const result = suggest('VIAGENS EM FAMÍLIA!', custom);
  resolved(result, custom[0].name, false, custom);
  assert.equal(result.confidence, 'media');
});

test('nome de categoria personalizada também exige palavras completas', () => {
  const custom = [{ ...categories[0], id: 'custom', name: 'Bar', is_default: false }];
  unresolved(suggest('Barbearia', custom));
  unresolved(suggest('Viagens', [{ ...custom[0], name: 'Viagens em família' }]));
});

test('categoria personalizada exige confirmação mesmo quando corresponde a palavra-chave de confiança alta', () => {
  const custom = categories.map(category => category.name === 'Lazer' ? { ...category, is_default: false } : category);
  for (const description of ['Netflix', 'Lazer', 'Amazon Prime Video']) {
    const result = suggest(description, custom);
    resolved(result, 'Lazer', false, custom);
    assert.equal(result.confidence, 'media');
  }
});

test('categorias diferentes com nomes equivalentes após normalização são ambíguas', () => {
  const duplicate = { ...categories.find(category => category.name === 'Saúde'), id: 'custom-health', name: 'Saude', is_default: false };
  for (const description of ['farmácia', 'Saúde']) unresolved(suggest(description, [...categories, duplicate]));
  resolved(suggest('farmácia', [...categories, { ...duplicate, is_active: false }]), 'Saúde');
});

test('várias correspondências da mesma categoria não geram ambiguidade', () => resolved(suggest('Netflix Spotify cinema'), 'Lazer'));

test('descrição vazia mantém retorno nulo e pontuação sem evidência não gera sugestão', () => {
  assert.equal(suggest(' \n\t '), null);
  unresolved(suggest('... ! ?'));
});

test('motor é puro e preserva entradas e regras existentes', () => {
  const before = JSON.stringify({ categories, categoryKeywordRules });
  for (const description of ['Netflix', 'XYZ', 'Amazon Prime Video', 'Netflix Uber']) suggest(description);
  assert.equal(JSON.stringify({ categories, categoryKeywordRules }), before);
});

const establishments = [
  ['Drogasil', 'Saúde', true],
  ['Droga Raia', 'Saúde', true],
  ['Drogaria São Paulo', 'Saúde', true],
  ['Drogaria Pacheco', 'Saúde', true],
  ['Drogarias Pacheco', 'Saúde', true],
  ['Panvel', 'Saúde', true],
  ["McDonald's", 'Alimentação', true],
  ['McDonalds', 'Alimentação', true],
  ['MC DONALDS', 'Alimentação', true],
  ['Burger King', 'Alimentação', true],
  ['Lanchonete', 'Alimentação', true],
  ['Atacadão', 'Compras', false],
  ['Assaí', 'Compras', false],
  ['Carrefour', 'Compras', false],
  ['Supermercado BH', 'Compras', false],
  ['99Pop', 'Transporte', true],
  ['HBO Max', 'Lazer', true]
];

for (const [description, category, auto] of establishments) {
  test(`estabelecimento ou serviço reconhecido: ${description}`, () => {
    const result = suggest(description);
    resolved(result, category, auto);
    assert.equal(result.confidence, auto ? 'alta' : 'media');
  });
}

for (const [description, category, auto] of [
  ['DROGASIL!', 'Saúde', true], ['droga...RAIA', 'Saúde', true],
  ['Drogaria SAO PAULO', 'Saúde', true], ['DROGARIAS — PACHECO', 'Saúde', true],
  ['McDonald’s', 'Alimentação', true], ['MCDONALD-S', 'Alimentação', true],
  ['BURGER—KING', 'Alimentação', true], ['ATACADAO', 'Compras', false],
  ['ASSAI', 'Compras', false], ['CARREFOUR.', 'Compras', false],
  ['Supermercado—BH', 'Compras', false], ['99POP!', 'Transporte', true], ['HBO...MAX', 'Lazer', true]
]) {
  test(`nome comercial normalizado: ${description}`, () => resolved(suggest(description), category, auto));
}

for (const description of [
  'Extra', 'Dia', 'Max', 'Casa', 'Pacheco', 'Raia', 'São Paulo', 'Rappi', 'BH',
  'mc', 'burger', 'king', 'pan', 'drogasilina', 'carrefourista', 'panveloso',
  '99popcorn', '199pop', 'assaiada', 'atacadaozinho', 'Maximiliano', 'Casa Nova'
]) {
  test(`nome ambíguo ou fragmento não identifica estabelecimento: ${description}`, () => unresolved(suggest(description)));
}

test('termos ambíguos podem usar contexto existente sem receber associação isolada', () => {
  resolved(suggest('Supermercado Extra'), 'Compras', false);
  resolved(suggest('Supermercado Dia'), 'Compras', false);
  resolved(suggest('Max atacadista'), 'Compras', false);
  resolved(suggest('Aluguel da casa'), 'Moradia');
  resolved(suggest('Farmácia Pacheco'), 'Saúde');
  resolved(suggest('Rappi restaurante'), 'Alimentação');
  resolved(suggest('Rappi farmácia'), 'Saúde');
});

test('99Pop não amplia correspondências do número 99 em valores monetários', () => {
  for (const description of ['1,99 pop', 'R$ 99 pop', '99,90 pop', '99.90 pop', '99 Pop', '99']) unresolved(suggest(description));
  resolved(suggest('App 99 Pop'), 'Transporte');
  resolved(suggest('App 99'), 'Transporte');
  resolved(suggest('Netflix 1,99 pop'), 'Lazer');
  resolved(suggest('Netflix 99,90'), 'Lazer');
});

test('nome 99Pop também não corresponde a fragmento de preço ou valor com moeda', () => {
  for (const description of ['1,99pop', '1.99pop', 'R$ 99Pop', 'BRL 99Pop']) unresolved(suggest(description));
  resolved(suggest('Netflix 1,99pop'), 'Lazer');
  resolved(suggest('99Pop 10,99'), 'Transporte');
});

for (const description of [
  'Drogasil Netflix', 'Burger King e Panvel', 'Carrefour e Drogasil',
  'Supermercado BH e Drogasil', '99Pop e Netflix', 'Droga Raia e Burger King',
  'HBO Max e Drogaria São Paulo'
]) {
  test(`estabelecimentos de categorias diferentes não são desempatados arbitrariamente: ${description}`, () => {
    const result = suggest(description);
    unresolved(result);
    assert.match(result.message, /Mais de uma categoria/);
  });
}

for (const [description, name] of [
  ['Drogasil', 'Saúde'], ['Burger King', 'Alimentação'], ['Assaí', 'Compras'],
  ['99Pop', 'Transporte'], ['HBO Max', 'Lazer']
]) {
  test(`nova marca respeita categoria ausente, inativa e tipo financeiro: ${description}`, () => {
    unresolved(suggest(description, categories.filter(category => category.name !== name)));
    unresolved(suggest(description, categories.map(category => category.name === name ? { ...category, is_active: false } : category)));
    unresolved(suggest(description, categories.map(category => category.name === name ? { ...category, type: 'income' } : category)));
    unresolved(suggest(description, categories, 'income'));
  });
  test(`nova marca preserva confirmação de categoria personalizada: ${description}`, () => {
    const custom = categories.map(category => category.name === name ? { ...category, is_default: false } : category);
    const result = suggest(description, custom);
    resolved(result, name, false, custom);
    assert.equal(result.confidence, 'media');
  });
}

test('categorias personalizadas não recebem marcas por semelhança presumida de significado', () => {
  const renamed = categories.map(category => category.name === 'Saúde' ? { ...category, name: 'Bem-estar', is_default: false } : category);
  unresolved(suggest('Drogasil', renamed));
});

test('expansão preserva todos os casos críticos da etapa anterior', () => {
  for (const description of ['Netflix 199,90', 'Netflix 99,90', 'Bar', 'Amazon Prime Video']) resolved(suggest(description), 'Lazer');
  resolved(suggest('App 99'), 'Transporte');
  resolved(suggest('Supermercado'), 'Compras', false);
  for (const description of ['99', 'Barbearia', 'Netflix Uber', 'Amazon Prime Video e Uber']) unresolved(suggest(description));
});
