import { Request, Response } from 'express';

import { indicatorsMockService } from '../services/indicatorsMockService';

export const indicatorsController = {
  getSelic: (req: Request, res: Response) => {
    const selic = indicatorsMockService.getSelic();

    return res.status(200).json(selic);
  },

  getIpca: (req: Request, res: Response) => {
    const ipca = indicatorsMockService.getIpca();

    return res.status(200).json(ipca);
  },

  getDollar: (req: Request, res: Response) => {
    const dollar = indicatorsMockService.getDollar();

    return res.status(200).json(dollar);
  },

  getSummary: (req: Request, res: Response) => {
    const summary = indicatorsMockService.getSummary();

    return res.status(200).json(summary);
  }
};