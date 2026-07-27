import type { Category } from '../database/categoryService';
import type { Transaction } from '../database/transactionService';

import {
  CategoryStatus,
  financialRules
} from '../constants/financialRules';

import {
  financialEducationService,
  FinancialEducationInsight
} from './financialEducationService';

export interface MonthAnalysisPeriod {
  year: number;
  month: number;
  startDate: Date;
  endDate: Date;
  currentDay: number;
  daysInMonth: number;
  daysRemaining: number;
}

export interface AnalyzedCategory extends Category {
  spent: number;
  remaining: number;
  percentageUsed: number;
  rawPercentageUsed: number;
  status: CategoryStatus;
  insight: string;
  educationInsight: FinancialEducationInsight;
  monthlyTransactions: Transaction[];
  allLinkedTransactions: Transaction[];
  analysisPeriod: MonthAnalysisPeriod;
  limitReached: boolean;
  limitExceeded: boolean;
  hasSavings: boolean;
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

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

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

const getCurrentMonthPeriod = (
  referenceDate: Date = new Date()
): MonthAnalysisPeriod => {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();

  const startDate = new Date(
    year,
    monthIndex,
    1,
    0,
    0,
    0,
    0
  );

  const endDate = new Date(
    year,
    monthIndex + 1,
    0,
    23,
    59,
    59,
    999
  );

  const daysInMonth = endDate.getDate();
  const currentDay = referenceDate.getDate();

  return {
    year,
    month: monthIndex + 1,
    startDate,
    endDate,
    currentDay,
    daysInMonth,
    daysRemaining: Math.max(daysInMonth - currentDay, 0)
  };
};

const parseDateString = (value: string): Date | null => {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const getTransactionDate = (
  transaction: Transaction
): Date | null => {
  if (transaction.original_date) {
    const originalDate = parseDateString(transaction.original_date);

    if (originalDate) {
      return originalDate;
    }
  }

  const dateValue = transaction.date;

  if (!dateValue) {
    return null;
  }

  if (dateValue instanceof Date) {
    return dateValue;
  }

  if (typeof dateValue === 'string') {
    return parseDateString(dateValue);
  }

  if (typeof dateValue?.toDate === 'function') {
    return dateValue.toDate();
  }

  if (typeof dateValue?.seconds === 'number') {
    return new Date(dateValue.seconds * 1000);
  }

  return null;
};

const isTransactionInsidePeriod = (
  transaction: Transaction,
  period: MonthAnalysisPeriod
): boolean => {
  const transactionDate = getTransactionDate(transaction);

  // Fallback para não esconder lançamentos antigos caso algum esteja sem data.
  if (!transactionDate) {
    return true;
  }

  return (
    transactionDate >= period.startDate &&
    transactionDate <= period.endDate
  );
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

  if (percentage > financialRules.exceededPercentage) {
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
  status: CategoryStatus,
  period: MonthAnalysisPeriod
): string => {
  const formattedSpent = formatCurrency(spent);
  const formattedLimit = formatCurrency(limit);
  const difference = Math.abs(spent - limit);

  if (status === 'sem_limite') {
    return `A categoria ${categoryName} ainda não possui um limite definido. Definir um limite ajuda o FinanceIQ a acompanhar melhor seus gastos e criar projeções educativas.`;
  }

  if (Math.abs(spent - limit) <= 0.01) {
    return `A categoria ${categoryName} atingiu exatamente o limite definido de ${formattedLimit}. Como ainda restam ${period.daysRemaining} dia(s) neste mês, vale acompanhar os próximos lançamentos com atenção para não passar do planejado.`;
  }

  if (status === 'excedido') {
    return `A categoria ${categoryName} está ${formatCurrency(difference)} acima do limite planejado. Isso pode acontecer por necessidade ou imprevisto, mas acompanhar esse excesso ajuda a entender o impacto desse padrão ao longo do tempo.`;
  }

  if (status === 'proximo_limite') {
    return `A categoria ${categoryName} já está próxima do limite de ${formattedLimit}. Como ainda restam ${period.daysRemaining} dia(s) neste mês, pequenos cuidados nos próximos gastos podem ajudar a manter o equilíbrio.`;
  }

  if (status === 'atencao') {
    return `A categoria ${categoryName} já consumiu uma parte relevante do orçamento. Até agora, foram registrados ${formattedSpent}. Continue acompanhando para decidir se vale segurar um pouco ou se esse gasto faz sentido neste momento.`;
  }

  return `A categoria ${categoryName} está dentro do limite planejado de ${formattedLimit}. Manter esse acompanhamento ajuda a transformar pequenas economias em uma reserva financeira mais forte ao longo do tempo.`;
};

export const categoryAnalysisService = {
  analyzeCategories: (
    categories: Category[],
    transactions: Transaction[],
    referenceDate: Date = new Date()
  ): AnalyzedCategory[] => {
    const period = getCurrentMonthPeriod(referenceDate);

    const activeOutcomeCategories = categories.filter(
      category =>
        category.is_active &&
        category.type === 'outcome'
    );

    return activeOutcomeCategories.map((category) => {
      const allLinkedTransactions = transactions.filter((transaction) => {
        return (
          transaction.type === 'outcome' &&
          doesTransactionBelongToCategory(
            transaction.category,
            category.name
          )
        );
      });

      const monthlyTransactions = allLinkedTransactions.filter((transaction) => {
        return isTransactionInsidePeriod(
          transaction,
          period
        );
      });

      const spent = monthlyTransactions.reduce((total, transaction) => {
        return total + Math.abs(Number(transaction.amount) || 0);
      }, 0);

      const limit = Number(category.monthly_limit) || 0;

      const rawPercentageUsed =
        limit > 0
          ? (spent / limit) * 100
          : 0;

      const percentageUsed =
        limit > 0
          ? Math.min(rawPercentageUsed, 100)
          : 0;

      const remaining = limit - spent;

      const status = getCategoryStatus(
        spent,
        limit
      );

      const insight = generateCategoryInsight(
        category.name,
        spent,
        limit,
        status,
        period
      );

      const educationInsight =
        financialEducationService.generateCategoryInsight({
          categoryName: category.name,
          monthlyLimit: limit,
          spent
        });

      return {
        ...category,
        spent,
        remaining,
        percentageUsed,
        rawPercentageUsed,
        status,
        insight,
        educationInsight,
        monthlyTransactions,
        allLinkedTransactions,
        analysisPeriod: period,
        limitReached: limit > 0 && spent >= limit,
        limitExceeded: limit > 0 && spent > limit,
        hasSavings: limit > 0 && spent < limit
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