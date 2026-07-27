import { CategoryType } from './defaultCategories';

export type SuggestionConfidence = 'alta' | 'media' | 'baixa';

export interface CategoryKeywordRule {
  categoryName: string;
  type: CategoryType;
  keywords: string[];
  confidence: SuggestionConfidence;
  requiresConfirmation?: boolean;
}

export const categoryKeywordRules: CategoryKeywordRule[] = [
  {
    categoryName: 'Moradia',
    type: 'outcome',
    confidence: 'alta',
    keywords: [
      'aluguel',
      'condomínio',
      'condominio',
      'energia',
      'luz',
      'água',
      'agua',
      'internet',
      'iptu',
      'casa',
      'moradia',
      'net residencial',
      'claro residencial',
      'vivo fibra'
    ]
  },

  {
    categoryName: 'Alimentação',
    type: 'outcome',
    confidence: 'alta',
    keywords: [
      'restaurante',
      'ifood',
      'delivery',
      'lanche',
      'pizza',
      'hamburguer',
      'hambúrguer',
      'padaria',
      'açaí',
      'acai',
      'almoço',
      'almoco',
      'jantar',
      'marmita',
      'comida',
      'sorveteria',
      'cafeteria'
    ]
  },

  {
    categoryName: 'Compras',
    type: 'outcome',
    confidence: 'media',
    requiresConfirmation: true,
    keywords: [
      'mercado',
      'supermercado',
      'compras',
      'compra',
      'loja',
      'shopping',
      'atacado',
      'atacadista',
      'amazon',
      'shopee',
      'mercado livre',
      'magalu',
      'americanas',
      'casas bahia',
      'shein',
      'aliexpress',
      'renner',
      'riachuelo',
      'cea',
      'c&a',
      'roupa',
      'calçado',
      'calcado',
      'eletrônico',
      'eletronico'
    ]
  },

  {
    categoryName: 'Transporte',
    type: 'outcome',
    confidence: 'alta',
    keywords: [
      'uber',
      '99',
      'taxi',
      'táxi',
      'ônibus',
      'onibus',
      'gasolina',
      'combustível',
      'combustivel',
      'posto',
      'estacionamento',
      'pedágio',
      'pedagio',
      'transporte',
      'corrida'
    ]
  },

  {
    categoryName: 'Saúde',
    type: 'outcome',
    confidence: 'alta',
    keywords: [
      'farmácia',
      'farmacia',
      'remédio',
      'remedio',
      'consulta',
      'exame',
      'médico',
      'medico',
      'dentista',
      'saúde',
      'saude',
      'plano de saúde',
      'plano de saude',
      'hospital',
      'laboratório',
      'laboratorio'
    ]
  },

  {
    categoryName: 'Lazer',
    type: 'outcome',
    confidence: 'alta',
    keywords: [
      'netflix',
      'spotify',
      'cinema',
      'show',
      'bar',
      'festa',
      'streaming',
      'lazer',
      'passeio',
      'viagem',
      'prime video',
      'disney',
      'hbo',
      'max',
      'globoplay',
      'youtube premium'
    ]
  },

  {
    categoryName: 'Educação',
    type: 'outcome',
    confidence: 'alta',
    keywords: [
      'faculdade',
      'curso',
      'livro',
      'material',
      'mensalidade',
      'educação',
      'educacao',
      'aula',
      'unipac',
      'udemy',
      'alura',
      'hotmart',
      'certificado'
    ]
  },

  {
    categoryName: 'Pets',
    type: 'outcome',
    confidence: 'media',
    requiresConfirmation: true,
    keywords: [
      'pet',
      'pets',
      'ração',
      'racao',
      'veterinário',
      'veterinario',
      'banho e tosa',
      'petshop'
    ]
  },

  {
    categoryName: 'Receita',
    type: 'income',
    confidence: 'alta',
    keywords: [
      'salário',
      'salario',
      'pagamento',
      'recebimento',
      'renda',
      'freelance',
      'pix recebido',
      'depósito',
      'deposito',
      'bonus',
      'bônus'
    ]
  }
];