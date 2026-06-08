import { Request, Response } from 'express';

import { openFinanceMockService } from '../services/openFinanceMockService';

export const openFinanceController = {
  getAccounts: (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: true,
        message: 'O parâmetro userId é obrigatório.'
      });
    }

    const accounts = openFinanceMockService.getAccounts(userId);

    return res.status(200).json(accounts);
  },

  getBalances: (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: true,
        message: 'O parâmetro userId é obrigatório.'
      });
    }

    const balances = openFinanceMockService.getBalances(userId);

    return res.status(200).json(balances);
  },

  getTransactions: (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: true,
        message: 'O parâmetro userId é obrigatório.'
      });
    }

    const transactions = openFinanceMockService.getTransactions(userId);

    return res.status(200).json(transactions);
  },

  syncTransactions: (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: true,
        message: 'O parâmetro userId é obrigatório.'
      });
    }

    const result = openFinanceMockService.syncTransactions(userId);

    return res.status(200).json(result);
  }
};