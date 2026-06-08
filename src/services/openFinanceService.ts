import { api } from './api';

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

export const openFinanceService = {
  getBalances: async (
    userId: string
  ): Promise<OpenFinanceBalance[]> => {
    const response = await api.get(
      `/open-finance/balances/${userId}`
    );

    return response.data;
  },

  getTransactions: async (
    userId: string
  ): Promise<OpenFinanceTransaction[]> => {
    const response = await api.get(
      `/open-finance/transactions/${userId}`
    );

    return response.data;
  },

  syncTransactions: async (
    userId: string
  ) => {
    const response = await api.post(
      `/open-finance/sync/${userId}`
    );

    return response.data;
  },
};