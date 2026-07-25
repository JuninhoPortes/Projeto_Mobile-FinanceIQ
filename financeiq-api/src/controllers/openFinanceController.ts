import { Request, Response } from 'express';

import { openFinanceMockService } from '../services/openFinanceMockService';

const getRequestUserId = (req: Request): string => {
  const paramUserId = req.params.userId;
  const queryUserId = req.query.userId;
  const bodyUserId = req.body?.userId;

  if (typeof paramUserId === 'string' && paramUserId.trim() !== '') {
    return paramUserId;
  }

  if (typeof queryUserId === 'string' && queryUserId.trim() !== '') {
    return queryUserId;
  }

  if (typeof bodyUserId === 'string' && bodyUserId.trim() !== '') {
    return bodyUserId;
  }

  return 'demo-user';
};

export const openFinanceController = {
  getAccounts: (req: Request, res: Response) => {
    try {
      const userId = getRequestUserId(req);

      const accounts = openFinanceMockService.getAccounts(userId);

      return res.status(200).json(accounts);
    } catch (error) {
      console.error('Erro ao buscar contas do Open Finance Mock:', error);

      return res.status(500).json({
        error: true,
        message: 'Erro ao buscar contas do Open Finance Mock.'
      });
    }
  },

  getBalances: (req: Request, res: Response) => {
    try {
      const userId = getRequestUserId(req);

      const balances = openFinanceMockService.getBalances(userId);

      return res.status(200).json(balances);
    } catch (error) {
      console.error('Erro ao buscar saldos do Open Finance Mock:', error);

      return res.status(500).json({
        error: true,
        message: 'Erro ao buscar saldos do Open Finance Mock.'
      });
    }
  },

  getTransactions: (req: Request, res: Response) => {
    try {
      const userId = getRequestUserId(req);

      const transactions = openFinanceMockService.getTransactions(userId);

      return res.status(200).json(transactions);
    } catch (error) {
      console.error('Erro ao buscar transações do Open Finance Mock:', error);

      return res.status(500).json({
        error: true,
        message: 'Erro ao buscar transações do Open Finance Mock.'
      });
    }
  },

  syncTransactions: (req: Request, res: Response) => {
    try {
      const userId = getRequestUserId(req);

      const result = openFinanceMockService.syncTransactions(userId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Erro ao sincronizar transações do Open Finance Mock:', error);

      return res.status(500).json({
        error: true,
        message: 'Erro ao sincronizar transações do Open Finance Mock.'
      });
    }
  }
};