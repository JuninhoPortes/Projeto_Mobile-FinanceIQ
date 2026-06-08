import { api } from './api';

export interface EconomicIndicator {
  indicator: string;
  value: number;
  date: string;
  source: string;
}

export const economicIndicatorsService = {
  getSelic: async (): Promise<EconomicIndicator> => {
    const response = await api.get('/indicators/selic');

    return response.data;
  },

  getIpca: async (): Promise<EconomicIndicator> => {
    const response = await api.get('/indicators/ipca');

    return response.data;
  },

  getDollar: async (): Promise<EconomicIndicator> => {
    const response = await api.get('/indicators/dollar');

    return response.data;
  },
};