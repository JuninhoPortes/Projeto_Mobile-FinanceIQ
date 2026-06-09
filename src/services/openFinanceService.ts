import { api } from './api';

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

export interface OpenFinanceSyncResponse {
  success: boolean;
  message: string;
  userId: string;
  importedCount: number;
  source: string;
  transactions: OpenFinanceTransaction[];
}

export const openFinanceService = {

  // =========================
  // BUSCAR SALDOS
  // =========================
  getBalances: async (
    userId: string
  ): Promise<OpenFinanceBalance[]> => {

    const response = await api.get(
      `/open-finance/balances/${userId}`
    );

    return response.data;
  },

  // =========================
  // BUSCAR TRANSAÇÕES
  // =========================
  getTransactions: async (
    userId: string
  ): Promise<OpenFinanceTransaction[]> => {

    const response = await api.get(
      `/open-finance/transactions/${userId}`
    );

    return response.data;
  },

  // =========================
  // SINCRONIZAR TRANSAÇÕES
  // =========================
  syncTransactions: async (
    userId: string
  ): Promise<OpenFinanceSyncResponse> => {

    const response = await api.post(
      `/open-finance/sync/${userId}`
    );

    return response.data;
  }

};