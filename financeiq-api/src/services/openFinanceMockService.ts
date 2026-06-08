export interface OpenFinanceAccount {
  accountId: string;
  bankName: string;
  accountType: string;
  currency: string;
}

export interface OpenFinanceBalance {
  accountId: string;
  bankName: string;
  balance: number;
  currency: string;
}

export interface OpenFinanceTransaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'outcome';
  category: string;
  date: string;
  source: string;
}

export const openFinanceMockService = {
  getAccounts: (userId: string): OpenFinanceAccount[] => {
    return [
      {
        accountId: `acc_${userId}_001`,
        bankName: 'Banco Simulado FinanceIQ',
        accountType: 'Conta Corrente',
        currency: 'BRL'
      },
      {
        accountId: `acc_${userId}_002`,
        bankName: 'Carteira Digital Mock',
        accountType: 'Conta de Pagamento',
        currency: 'BRL'
      }
    ];
  },

  getBalances: (userId: string): OpenFinanceBalance[] => {
    return [
      {
        accountId: `acc_${userId}_001`,
        bankName: 'Banco Simulado FinanceIQ',
        balance: 6250.75,
        currency: 'BRL'
      },
      {
        accountId: `acc_${userId}_002`,
        bankName: 'Carteira Digital Mock',
        balance: 840.25,
        currency: 'BRL'
      }
    ];
  },

  getTransactions: (userId: string): OpenFinanceTransaction[] => {
    return [
      {
        id: `of_${userId}_001`,
        description: 'Salário',
        amount: 4000,
        type: 'income',
        category: 'Receita',
        date: '2026-05-21',
        source: 'OpenFinanceMock'
      },
      {
        id: `of_${userId}_002`,
        description: 'Supermercado',
        amount: 320.5,
        type: 'outcome',
        category: 'Alimentação',
        date: '2026-05-22',
        source: 'OpenFinanceMock'
      },
      {
        id: `of_${userId}_003`,
        description: 'Conta de Energia',
        amount: 180.9,
        type: 'outcome',
        category: 'Moradia',
        date: '2026-05-23',
        source: 'OpenFinanceMock'
      },
      {
        id: `of_${userId}_004`,
        description: 'Transporte por aplicativo',
        amount: 42.75,
        type: 'outcome',
        category: 'Transporte',
        date: '2026-05-24',
        source: 'OpenFinanceMock'
      }
    ];
  },

  syncTransactions: (userId: string) => {
    const transactions = openFinanceMockService.getTransactions(userId);

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