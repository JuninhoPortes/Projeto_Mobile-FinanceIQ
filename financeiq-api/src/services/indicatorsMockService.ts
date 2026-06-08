export interface EconomicIndicator {
  indicator: string;
  value: number;
  unit: string;
  date: string;
  source: string;
  description: string;
}

const today = () => {
  return new Date().toISOString().split('T')[0];
};

export const indicatorsMockService = {
  getSelic: (): EconomicIndicator => {
    return {
      indicator: 'Selic',
      value: 10.5,
      unit: '% ao ano',
      date: today(),
      source: 'Mock FinanceIQ / Banco Central do Brasil',
      description: 'Taxa básica de juros da economia brasileira.'
    };
  },

  getIpca: (): EconomicIndicator => {
    return {
      indicator: 'IPCA',
      value: 4.62,
      unit: '% acumulado',
      date: today(),
      source: 'Mock FinanceIQ / IBGE',
      description: 'Índice oficial de inflação ao consumidor no Brasil.'
    };
  },

  getDollar: (): EconomicIndicator => {
    return {
      indicator: 'Dólar Comercial',
      value: 5.25,
      unit: 'BRL',
      date: today(),
      source: 'Mock FinanceIQ / Mercado Financeiro',
      description: 'Cotação simulada do dólar comercial em reais.'
    };
  },

  getSummary: () => {
    return {
      date: today(),
      source: 'Mock FinanceIQ',
      indicators: [
        indicatorsMockService.getSelic(),
        indicatorsMockService.getIpca(),
        indicatorsMockService.getDollar()
      ],
      message:
        'Resumo econômico simulado para apoiar a educação financeira do usuário.'
    };
  }
};