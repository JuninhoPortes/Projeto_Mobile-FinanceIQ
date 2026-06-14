import { Request, Response } from 'express';

import { indicatorsMockService } from '../services/indicatorsMockService';

export const indicatorsController = {
  getSelic: async (
    req: Request,
    res: Response
  ) => {
    try {
      const selic =
        await indicatorsMockService.getSelic();

      return res.status(200).json(selic);

    } catch (error) {
      console.error(
        'Erro no controller ao buscar Selic:',
        error
      );

      return res.status(500).json({
        message:
          'Erro ao buscar indicador Selic.'
      });
    }
  },

  getIpca: async (
    req: Request,
    res: Response
  ) => {
    try {
      const ipca =
        await indicatorsMockService.getIpca();

      return res.status(200).json(ipca);

    } catch (error) {
      console.error(
        'Erro no controller ao buscar IPCA:',
        error
      );

      return res.status(500).json({
        message:
          'Erro ao buscar indicador IPCA.'
      });
    }
  },

  getDollar: async (
    req: Request,
    res: Response
  ) => {
    try {
      const dollar =
        await indicatorsMockService.getDollar();

      return res.status(200).json(dollar);

    } catch (error) {
      console.error(
        'Erro no controller ao buscar Dólar:',
        error
      );

      return res.status(500).json({
        message:
          'Erro ao buscar cotação do dólar.'
      });
    }
  },

  getSummary: async (
    req: Request,
    res: Response
  ) => {
    try {
      const summary =
        await indicatorsMockService.getSummary();

      return res.status(200).json(summary);

    } catch (error) {
      console.error(
        'Erro no controller ao buscar resumo econômico:',
        error
      );

      return res.status(500).json({
        message:
          'Erro ao buscar resumo econômico.'
      });
    }
  }
};