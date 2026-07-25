import type { Category } from '../database/categoryService';
import type { Transaction } from '../database/transactionService';

import {
  CategoryStatus,
  financialRules
} from '../constants/financialRules';

export interface AnalyzedCategory extends Category {
  spent: number;
  remaining: number;
  percentageUsed: number;
  status: CategoryStatus;
  insight: string;
  monthlyTransactions: Transaction[];
}

export interface CategorySummary {
  totalSpent: number;
  totalLimit: number;
  totalRemaining: number;
  exceededCount: number;
  attentionCount: number;
  nearLimitCount: number;
  controlledCount: number;
  highestSpentCategory?: AnalyzedCategory;
}

const normalizeText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const categoryAliases: Record<string, string[]> = {
  outros: ['geral', 'outro', 'outros', 'sem categoria']
};

const convertToDate = (date: any): Date | null => {
  if (!date) {
    return null;
  }

  if (date instanceof Date) {
    return date;
  }

  if (typeof date.toDate === 'function') {
    return date.toDate();
  }

  if (typeof date === 'string') {
    const parsedDate = new Date(date);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }

    return null;
  }

  if (typeof date.seconds === 'number') {
    return new Date(date.seconds * 1000);
  }

  return null;
};

const isSameMonth = (
  date: any,
  referenceDate: Date
): boolean => {
  const convertedDate = convertToDate(date);

  if (!convertedDate) {
    return false;
  }

  return (
    convertedDate.getMonth() === referenceDate.getMonth() &&
    convertedDate.getFullYear() === referenceDate.getFullYear()
  );
};

const shouldUseTransactionInCurrentAnalysis = (
  transaction: Transaction,
  referenceDate: Date
): boolean => {
  if (transaction.is_fixed) {
    return true;
  }

  const convertedDate = convertToDate(transaction.date);

  if (!convertedDate) {
    return true;
  }

  return isSameMonth(transaction.date, referenceDate);
};

const doesTransactionBelongToCategory = (
  transactionCategory: string,
  categoryName: string
): boolean => {
  const normalizedTransactionCategory =
    normalizeText(transactionCategory || '');

  const normalizedCategoryName =
    normalizeText(categoryName || '');

  if (normalizedTransactionCategory === normalizedCategoryName) {
    return true;
  }

  const aliases = categoryAliases[normalizedCategoryName] || [];

  return aliases.includes(normalizedTransactionCategory);
};

const getCategoryStatus = (
  spent: number,
  limit: number
): CategoryStatus => {
  if (limit <= 0) {
    return 'sem_limite';
  }

  const percentage = (spent / limit) * 100;

  if (percentage >= financialRules.exceededPercentage) {
    return 'excedido';
  }

  if (percentage >= financialRules.nearLimitPercentage) {
    return 'proximo_limite';
  }

  if (percentage >= financialRules.attentionPercentage) {
    return 'atencao';
  }

  return 'controlado';
};

const generateCategoryInsight = (
  categoryName: string,
  spent: number,
  limit: number,
  status: CategoryStatus
): string => {
  const formattedSpent = spent.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const formattedLimit = limit.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const difference = Math.abs(spent - limit).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  if (status === 'sem_limite') {
    return `A categoria ${categoryName} ainda não possui um limite mensal definido. Definir um limite pode ajudar no acompanhamento dos gastos.`;
  }

  if (status === 'excedido') {
    return `A categoria ${categoryName} ultrapassou o limite mensal em ${difference}. Esse dado serve como alerta educativo para revisar os próximos gastos.`;
  }

  if (status === 'proximo_limite') {
    return `A categoria ${categoryName} já está próxima do limite mensal de ${formattedLimit}. Acompanhar os próximos lançamentos pode ajudar a evitar excessos.`;
  }

  if (status === 'atencao') {
    return `A categoria ${categoryName} já consumiu uma parte relevante do orçamento mensal. Até agora, foram registrados ${formattedSpent}.`;
  }

  return `A categoria ${categoryName} está dentro do limite planejado de ${formattedLimit}. Manter esse acompanhamento ajuda na organização financeira.`;
};

export const categoryAnalysisService = {
  analyzeCategories: (
    categories: Category[],
    transactions: Transaction[],
    referenceDate: Date = new Date()
  ): AnalyzedCategory[] => {
    const activeOutcomeCategories = categories.filter(
      category =>
        category.is_active &&
        category.type === 'outcome'
    );

    return activeOutcomeCategories.map((category) => {
      const monthlyTransactions = transactions.filter((transaction) => {
          return (
            transaction.type === 'outcome' &&
            doesTransactionBelongToCategory(
              transaction.category,
              category.name
            )
          );
        });

      const spent = monthlyTransactions.reduce((total, transaction) => {
        return total + Math.abs(Number(transaction.amount) || 0);
      }, 0);

      const limit = Number(category.monthly_limit) || 0;

      const percentageUsed =
        limit > 0
          ? Math.min((spent / limit) * 100, 100)
          : 0;

      const remaining = limit - spent;

      const status = getCategoryStatus(spent, limit);

      const insight = generateCategoryInsight(
        category.name,
        spent,
        limit,
        status
      );

      return {
        ...category,
        spent,
        remaining,
        percentageUsed,
        status,
        insight,
        monthlyTransactions
      };
    });
  },

  getSummary: (
    analyzedCategories: AnalyzedCategory[]
  ): CategorySummary => {
    const totalSpent = analyzedCategories.reduce(
      (total, category) => total + category.spent,
      0
    );

    const totalLimit = analyzedCategories.reduce(
      (total, category) => total + category.monthly_limit,
      0
    );

    const totalRemaining = totalLimit - totalSpent;

    const exceededCount = analyzedCategories.filter(
      category => category.status === 'excedido'
    ).length;

    const attentionCount = analyzedCategories.filter(
      category => category.status === 'atencao'
    ).length;

    const nearLimitCount = analyzedCategories.filter(
      category => category.status === 'proximo_limite'
    ).length;

    const controlledCount = analyzedCategories.filter(
      category => category.status === 'controlado'
    ).length;

    const highestSpentCategory = analyzedCategories.reduce<
      AnalyzedCategory | undefined
    >((highest, current) => {
      if (!highest) {
        return current;
      }

      return current.spent > highest.spent ? current : highest;
    }, undefined);

    return {
      totalSpent,
      totalLimit,
      totalRemaining,
      exceededCount,
      attentionCount,
      nearLimitCount,
      controlledCount,
      highestSpentCategory
    };
  }
};