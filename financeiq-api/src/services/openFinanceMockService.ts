export interface OpenFinanceAccount {
  accountId: string;
  bankId: string;
  bankName: string;
  accountType: string;
  currency: string;
}

export interface OpenFinanceBalance {
  accountId: string;
  bankId: string;
  bankName: string;
  balance: number;
  currency: string;
}

export interface OpenFinanceTransaction {
  id: string;
  accountId: string;
  bankId: string;
  bankName: string;
  description: string;
  amount: number;
  type: 'income' | 'outcome';
  category: string;
  date: string;
  source: string;
}

const MOCK_ACCOUNTS: OpenFinanceAccount[] = [
  {
    accountId: 'acc_nubank_mock',
    bankId: 'nubank',
    bankName: 'Nubank',
    accountType: 'Conta Digital',
    currency: 'BRL'
  },
  {
    accountId: 'acc_itau_mock',
    bankId: 'itau',
    bankName: 'Itaú',
    accountType: 'Conta Corrente',
    currency: 'BRL'
  },
  {
    accountId: 'acc_bradesco_mock',
    bankId: 'bradesco',
    bankName: 'Bradesco',
    accountType: 'Conta Corrente',
    currency: 'BRL'
  },
  {
    accountId: 'acc_c6_mock',
    bankId: 'c6',
    bankName: 'C6 Bank',
    accountType: 'Conta Digital',
    currency: 'BRL'
  }
];

// =========================
// TRANSAÇÕES MOCKADAS
// =========================
// O saldo de cada banco será calculado a partir destas transações.
// Fórmula: entradas - saídas
const buildMockTransactions = (
  userId: string
): OpenFinanceTransaction[] => {

  return [
    // =========================
    // NUBANK
    // Saldo esperado:
    // 4000 - 360.60 - 99.90 - 159.90 = 3379.60
    // =========================
    {
      id: `of_${userId}_nubank_001`,
      accountId: 'acc_nubank_mock',
      bankId: 'nubank',
      bankName: 'Nubank',
      description: 'Salário',
      amount: 4000,
      type: 'income',
      category: 'Receita',
      date: '2026-05-21',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_nubank_002`,
      accountId: 'acc_nubank_mock',
      bankId: 'nubank',
      bankName: 'Nubank',
      description: 'Supermercado',
      amount: 360.6,
      type: 'outcome',
      category: 'Alimentação',
      date: '2026-05-22',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_nubank_003`,
      accountId: 'acc_nubank_mock',
      bankId: 'nubank',
      bankName: 'Nubank',
      description: 'Assinatura Digital',
      amount: 99.9,
      type: 'outcome',
      category: 'Lazer',
      date: '2026-05-23',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_nubank_004`,
      accountId: 'acc_nubank_mock',
      bankId: 'nubank',
      bankName: 'Nubank',
      description: 'Transporte por aplicativo',
      amount: 159.9,
      type: 'outcome',
      category: 'Transporte',
      date: '2026-05-24',
      source: 'OpenFinanceMock'
    },

    // =========================
    // ITAÚ
    // Saldo esperado:
    // 5200 - 680 - 220.50 - 140.75 = 4158.75
    // =========================
    {
      id: `of_${userId}_itau_001`,
      accountId: 'acc_itau_mock',
      bankId: 'itau',
      bankName: 'Itaú',
      description: 'Recebimento Freelance',
      amount: 5200,
      type: 'income',
      category: 'Receita',
      date: '2026-05-20',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_itau_002`,
      accountId: 'acc_itau_mock',
      bankId: 'itau',
      bankName: 'Itaú',
      description: 'Aluguel',
      amount: 680,
      type: 'outcome',
      category: 'Moradia',
      date: '2026-05-21',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_itau_003`,
      accountId: 'acc_itau_mock',
      bankId: 'itau',
      bankName: 'Itaú',
      description: 'Conta de Energia',
      amount: 220.5,
      type: 'outcome',
      category: 'Moradia',
      date: '2026-05-23',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_itau_004`,
      accountId: 'acc_itau_mock',
      bankId: 'itau',
      bankName: 'Itaú',
      description: 'Internet Residencial',
      amount: 140.75,
      type: 'outcome',
      category: 'Moradia',
      date: '2026-05-25',
      source: 'OpenFinanceMock'
    },

    // =========================
    // BRADESCO
    // Saldo esperado:
    // 2500 - 210 - 84.90 - 65.30 = 2139.80
    // =========================
    {
      id: `of_${userId}_bradesco_001`,
      accountId: 'acc_bradesco_mock',
      bankId: 'bradesco',
      bankName: 'Bradesco',
      description: 'PIX Recebido',
      amount: 2500,
      type: 'income',
      category: 'Receita',
      date: '2026-05-18',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_bradesco_002`,
      accountId: 'acc_bradesco_mock',
      bankId: 'bradesco',
      bankName: 'Bradesco',
      description: 'Combustível',
      amount: 210,
      type: 'outcome',
      category: 'Transporte',
      date: '2026-05-19',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_bradesco_003`,
      accountId: 'acc_bradesco_mock',
      bankId: 'bradesco',
      bankName: 'Bradesco',
      description: 'Farmácia',
      amount: 84.9,
      type: 'outcome',
      category: 'Saúde',
      date: '2026-05-22',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_bradesco_004`,
      accountId: 'acc_bradesco_mock',
      bankId: 'bradesco',
      bankName: 'Bradesco',
      description: 'Padaria',
      amount: 65.3,
      type: 'outcome',
      category: 'Alimentação',
      date: '2026-05-24',
      source: 'OpenFinanceMock'
    },

    // =========================
    // C6 BANK
    // Saldo esperado:
    // 1800 - 99.90 - 45.50 - 120 = 1534.60
    // =========================
    {
      id: `of_${userId}_c6_001`,
      accountId: 'acc_c6_mock',
      bankId: 'c6',
      bankName: 'C6 Bank',
      description: 'Transferência Recebida',
      amount: 1800,
      type: 'income',
      category: 'Receita',
      date: '2026-05-17',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_c6_002`,
      accountId: 'acc_c6_mock',
      bankId: 'c6',
      bankName: 'C6 Bank',
      description: 'Academia',
      amount: 99.9,
      type: 'outcome',
      category: 'Saúde',
      date: '2026-05-20',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_c6_003`,
      accountId: 'acc_c6_mock',
      bankId: 'c6',
      bankName: 'C6 Bank',
      description: 'Cafeteria',
      amount: 45.5,
      type: 'outcome',
      category: 'Alimentação',
      date: '2026-05-22',
      source: 'OpenFinanceMock'
    },
    {
      id: `of_${userId}_c6_004`,
      accountId: 'acc_c6_mock',
      bankId: 'c6',
      bankName: 'C6 Bank',
      description: 'Compra Online',
      amount: 120,
      type: 'outcome',
      category: 'Compras',
      date: '2026-05-23',
      source: 'OpenFinanceMock'
    }
  ];

};

// =========================
// CALCULAR SALDO POR CONTA
// =========================
const calculateBalanceByAccount = (
  transactions: OpenFinanceTransaction[],
  accountId: string
): number => {

  const balance =
    transactions
      .filter(
        item => item.accountId === accountId
      )
      .reduce(
        (acc, item) => {

          if (item.type === 'income') {
            return acc + item.amount;
          }

          return acc - item.amount;

        },
        0
      );

  return Number(balance.toFixed(2));

};

export const openFinanceMockService = {

  // =========================
  // CONTAS SIMULADAS
  // =========================
  getAccounts: (
    userId: string
  ): OpenFinanceAccount[] => {

    return MOCK_ACCOUNTS;

  },

  // =========================
  // SALDOS CALCULADOS
  // =========================
  getBalances: (
    userId: string
  ): OpenFinanceBalance[] => {

    const transactions =
      buildMockTransactions(userId);

    return MOCK_ACCOUNTS.map((account) => ({
      accountId: account.accountId,
      bankId: account.bankId,
      bankName: account.bankName,
      balance: calculateBalanceByAccount(
        transactions,
        account.accountId
      ),
      currency: account.currency
    }));

  },

  // =========================
  // TRANSAÇÕES SIMULADAS
  // =========================
  getTransactions: (
    userId: string
  ): OpenFinanceTransaction[] => {

    return buildMockTransactions(userId);

  },

  // =========================
  // TRANSAÇÕES POR CONTA
  // =========================
  getTransactionsByAccount: (
    userId: string,
    accountId: string
  ): OpenFinanceTransaction[] => {

    return buildMockTransactions(userId)
      .filter(
        transaction =>
          transaction.accountId === accountId
      );

  },

  // =========================
  // SINCRONIZAÇÃO SIMULADA
  // =========================
  syncTransactions: (
    userId: string
  ) => {

    const transactions =
      openFinanceMockService
        .getTransactions(userId);

    return {
      success: true,
      message: 'Sincronização simulada realizada com sucesso.',
      userId,
      importedCount: transactions.length,
      source: 'OpenFinanceMock',
      transactions
    };

  }

};