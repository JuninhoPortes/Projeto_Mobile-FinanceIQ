import { MaterialCommunityIcons } from '@expo/vector-icons';

export type CategoryType = 'income' | 'outcome';

export interface DefaultCategory {
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  monthly_limit: number;
  type: CategoryType;
  description: string;
}

export const defaultCategories: DefaultCategory[] = [
  {
    name: 'Moradia',
    icon: 'home-variant',
    color: '#F39C12',
    monthly_limit: 2000,
    type: 'outcome',
    description: 'Aluguel, contas da casa, condomínio, internet e despesas residenciais.'
  },
  {
    name: 'Alimentação',
    icon: 'food',
    color: '#27AE60',
    monthly_limit: 1200,
    type: 'outcome',
    description: 'Mercado, padaria, restaurantes, delivery e alimentação em geral.'
  },
  {
    name: 'Transporte',
    icon: 'car',
    color: '#2980B9',
    monthly_limit: 500,
    type: 'outcome',
    description: 'Combustível, transporte por aplicativo, ônibus, manutenção e deslocamentos.'
  },
  {
    name: 'Saúde',
    icon: 'pill',
    color: '#E74C3C',
    monthly_limit: 400,
    type: 'outcome',
    description: 'Farmácia, consultas, exames, plano de saúde e cuidados pessoais.'
  },
  {
    name: 'Lazer',
    icon: 'theater',
    color: '#9B59B6',
    monthly_limit: 500,
    type: 'outcome',
    description: 'Cinema, streaming, bares, festas, passeios e entretenimento.'
  },
  {
    name: 'Educação',
    icon: 'book-open-variant',
    color: '#1B365D',
    monthly_limit: 400,
    type: 'outcome',
    description: 'Faculdade, cursos, livros, materiais e desenvolvimento pessoal.'
  },
  {
  name: 'Compras',
  icon: 'cart',
  color: '#8E44AD',
  monthly_limit: 600,
  type: 'outcome',
  description: 'Mercado, supermercado, compras online, lojas, apps e compras diversas.'
  },
  {
    name: 'Outros',
    icon: 'dots-horizontal-circle',
    color: '#7F8C8D',
    monthly_limit: 300,
    type: 'outcome',
    description: 'Despesas que não se encaixam nas categorias principais.'
  },
  {
    name: 'Receita',
    icon: 'cash-plus',
    color: '#16A085',
    monthly_limit: 0,
    type: 'income',
    description: 'Salário, rendimentos, recebimentos e demais entradas financeiras.'
  }
];