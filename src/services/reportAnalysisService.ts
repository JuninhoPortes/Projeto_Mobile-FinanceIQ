import type { Transaction } from '../database/transactionService';
import type { Category } from '../database/categoryService';
import type { MonthPeriod } from './periodService';

import {
  CategoryStatus,
  financialRules
} from '../constants/financialRules';

export interface ReportCategoryItem {
  name: string;
  amount: number;
  limit: number;
  remaining: number;
  percentageOfExpenses: number;
  percentageOfLimit: number;
  status: CategoryStatus;
  transactionsCount: number;
  color: string;
  icon: string;
}

export interface ReportSummary {
  period: MonthPeriod;
  totalIncome: number;
  totalOutcome: number;
  balance: number;
  totalPlannedLimit: number;
  totalRemainingLimit: number;
  incomeTransactionsCount: number;
  outcomeTransactionsCount: number;
  totalTransactionsCount: number;
  biggestExpenseCategory?: ReportCategoryItem;
  topCategories: ReportCategoryItem[];
  incomePercentage: number;
  outcomePercentage: number;
  insightTitle: string;
  insightMessage: string;
  balanceStatus: 'positivo' | 'negativo' | 'neutro';
}

const normalizeText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
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

const findCategoryByName = (
  categories: Category[],
  categoryName: string
) => {
  const normalizedCategoryName =
    normalizeText(categoryName || '');

  return categories.find((category) => {
    return (
      category.type === 'outcome' &&
      normalizeText(category.name) === normalizedCategoryName
    );
  });
};

const groupOutcomeTransactionsByCategory = (
  transactions: Transaction[],
  categories: Category[]
): ReportCategoryItem[] => {
  const groupedCategories = new Map<string, ReportCategoryItem>();

  const outcomeTransactions = transactions.filter(
    transaction => transaction.type === 'outcome'
  );

  outcomeTransactions.forEach((transaction) => {
    const categoryName =
      transaction.category || 'Outros';

    const category =
      findCategoryByName(categories, categoryName);

    const current =
      groupedCategories.get(categoryName);

    const amount =
      Math.abs(Number(transaction.amount) || 0);

    if (current) {
      groupedCategories.set(
        categoryName,
        {
          ...current,
          amount: current.amount + amount,
          transactionsCount: current.transactionsCount + 1
        }
      );

      return;
    }

    groupedCategories.set(
      categoryName,
      {
        name: categoryName,
        amount,
        limit: Number(category?.monthly_limit) || 0,
        remaining: 0,
        percentageOfExpenses: 0,
        percentageOfLimit: 0,
        status: 'sem_limite',
        transactionsCount: 1,
        color: category?.color || '#1B365D',
        icon: category?.icon || 'tag'
      }
    );
  });

  return Array.from(groupedCategories.values())
    .map((category) => {
      const percentageOfLimit =
        category.limit > 0
          ? Math.min((category.amount / category.limit) * 100, 100)
          : 0;

      const remaining =
        category.limit - category.amount;

      return {
        ...category,
        remaining,
        percentageOfLimit,
        status: getCategoryStatus(
          category.amount,
          category.limit
        )
      };
    })
    .sort((a, b) => b.amount - a.amount);
};

const completeCategoryPercentages = (
  categories: ReportCategoryItem[],
  totalOutcome: number
) => {
  return categories.map((category) => {
    const percentageOfExpenses =
      totalOutcome > 0
        ? (category.amount / totalOutcome) * 100
        : 0;

    return {
      ...category,
      percentageOfExpenses
    };
  });
};

const generateReportInsight = (
  summary: {
    period: MonthPeriod;
    totalIncome: number;
    totalOutcome: number;
    balance: number;
    totalPlannedLimit: number;
    totalRemainingLimit: number;
    biggestExpenseCategory?: ReportCategoryItem;
    exceededCategoriesCount: number;
  }
) => {
  const periodText = summary.period.isCurrentMonth
    ? 'até agora neste mês'
    : `em ${summary.period.label}`;

  if (
    summary.totalIncome === 0 &&
    summary.totalOutcome === 0
  ) {
    return {
      title: 'Sem movimentações no período',
      message:
        `Ainda não existem lançamentos registrados ${periodText}. ` +
        `Quando você adicionar entradas e saídas, o FinanceIQ vai montar uma análise consolidada para ajudar na sua organização financeira.`
    };
  }

  if (
    summary.balance > 0 &&
    summary.totalPlannedLimit > 0 &&
    summary.totalRemainingLimit > 0
  ) {
    return {
      title: 'Resultado positivo no período',
      message:
        `Seu saldo ficou positivo ${periodText}, com uma sobra de ${formatCurrency(summary.balance)} entre entradas e saídas. ` +
        `Além disso, suas despesas ficaram ${formatCurrency(summary.totalRemainingLimit)} abaixo do total planejado para as categorias. ` +
        `Esse é um ótimo sinal de controle: pequenas sobras, quando aparecem com frequência, podem fortalecer sua reserva financeira e abrir espaço para novos objetivos.`
    };
  }

  if (
    summary.balance > 0 &&
    summary.exceededCategoriesCount > 0
  ) {
    return {
      title: 'Saldo positivo, mas com pontos de atenção',
      message:
        `Seu saldo ficou positivo ${periodText}, o que é uma boa notícia. ` +
        `Mesmo assim, algumas categorias passaram do limite definido. Isso não significa necessariamente um problema, mas mostra onde vale observar melhor nos próximos períodos para manter o equilíbrio.`
    };
  }

  if (summary.balance < 0) {
    return {
      title: 'Atenção ao equilíbrio do período',
      message:
        `As saídas ficaram acima das entradas ${periodText}, gerando um saldo negativo de ${formatCurrency(Math.abs(summary.balance))}. ` +
        `Isso pode acontecer por imprevistos ou gastos necessários, mas acompanhar as categorias com maior peso pode ajudar você a recuperar o equilíbrio aos poucos.`
    };
  }

  if (summary.biggestExpenseCategory) {
    return {
      title: 'Categoria de maior impacto',
      message:
        `A categoria que mais pesou ${periodText} foi ${summary.biggestExpenseCategory.name}, com ${formatCurrency(summary.biggestExpenseCategory.amount)} registrados. ` +
        `Observar as categorias com maior participação ajuda a entender melhor para onde o dinheiro está indo e facilita decisões mais conscientes.`
    };
  }

  return {
    title: 'Período equilibrado',
    message:
      `O período analisado ficou equilibrado. Continue registrando suas movimentações para que o FinanceIQ consiga mostrar padrões, excessos e oportunidades de economia com mais clareza.`
  };
};

export const reportAnalysisService = {
  generateMonthlyReport: (
    transactions: Transaction[],
    categories: Category[],
    period: MonthPeriod
  ): ReportSummary => {
    const incomeTransactions = transactions.filter(
      transaction => transaction.type === 'income'
    );

    const outcomeTransactions = transactions.filter(
      transaction => transaction.type === 'outcome'
    );

    const totalIncome = incomeTransactions.reduce(
      (total, transaction) =>
        total + Math.abs(Number(transaction.amount) || 0),
      0
    );

    const totalOutcome = outcomeTransactions.reduce(
      (total, transaction) =>
        total + Math.abs(Number(transaction.amount) || 0),
      0
    );

    const balance =
      totalIncome - totalOutcome;

    const groupedCategories =
      groupOutcomeTransactionsByCategory(
        transactions,
        categories
      );

    const topCategories =
      completeCategoryPercentages(
        groupedCategories,
        totalOutcome
      );

    const totalPlannedLimit = categories
      .filter(category => category.type === 'outcome')
      .reduce(
        (total, category) =>
          total + (Number(category.monthly_limit) || 0),
        0
      );

    const totalRemainingLimit =
      totalPlannedLimit - totalOutcome;

    const totalMovement =
      totalIncome + totalOutcome;

    const incomePercentage =
      totalMovement > 0
        ? (totalIncome / totalMovement) * 100
        : 0;

    const outcomePercentage =
      totalMovement > 0
        ? (totalOutcome / totalMovement) * 100
        : 0;

    const biggestExpenseCategory =
      topCategories[0];

    const exceededCategoriesCount =
      topCategories.filter(
        category => category.status === 'excedido'
      ).length;

    const balanceStatus =
      balance > 0
        ? 'positivo'
        : balance < 0
          ? 'negativo'
          : 'neutro';

    const insight =
      generateReportInsight({
        period,
        totalIncome,
        totalOutcome,
        balance,
        totalPlannedLimit,
        totalRemainingLimit,
        biggestExpenseCategory,
        exceededCategoriesCount
      });

    return {
      period,
      totalIncome,
      totalOutcome,
      balance,
      totalPlannedLimit,
      totalRemainingLimit,
      incomeTransactionsCount: incomeTransactions.length,
      outcomeTransactionsCount: outcomeTransactions.length,
      totalTransactionsCount: transactions.length,
      biggestExpenseCategory,
      topCategories,
      incomePercentage,
      outcomePercentage,
      insightTitle: insight.title,
      insightMessage: insight.message,
      balanceStatus
    };
  }
};