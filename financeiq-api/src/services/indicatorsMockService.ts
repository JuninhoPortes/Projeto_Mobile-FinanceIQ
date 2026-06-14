import axios from 'axios';

export interface EconomicIndicator {
  indicator: string;
  value: number;
  unit: string;
  date: string;
  source: string;
  description: string;
}

interface BrasilApiRate {
  nome: string;
  valor: number;
}

const today = () => {
  return new Date().toISOString().split('T')[0];
};

const brasilApi = axios.create({
  baseURL: 'https://brasilapi.com.br/api',
  timeout: 10000
});

const exchangeApi = axios.create({
  baseURL: 'https://open.er-api.com/v6',
  timeout: 10000
});

// =========================
// BUSCAR TAXAS BRASILAPI
// =========================
const getBrazilianRates = async (): Promise<BrasilApiRate[]> => {
  const response = await brasilApi.get('/taxas/v1');

  return response.data;
};

// =========================
// BUSCAR TAXA PELO NOME
// =========================
const findRateByName = (
  rates: BrasilApiRate[],
  name: string
): BrasilApiRate | undefined => {
  return rates.find((item) =>
    item.nome
      .toLowerCase()
      .includes(name.toLowerCase())
  );
};

// =========================
// FALLBACKS
// =========================
const fallbackSelic = (): EconomicIndicator => {
  return {
    indicator: 'Selic',
    value: 10.5,
    unit: '% ao ano',
    date: today(),
    source: 'Fallback FinanceIQ',
    description:
      'Taxa básica de juros da economia brasileira.'
  };
};

const fallbackIpca = (): EconomicIndicator => {
  return {
    indicator: 'IPCA',
    value: 4.62,
    unit: '% acumulado',
    date: today(),
    source: 'Fallback FinanceIQ',
    description:
      'Índice oficial de inflação ao consumidor no Brasil.'
  };
};

const fallbackDollar = (): EconomicIndicator => {
  return {
    indicator: 'Dólar Comercial',
    value: 5.25,
    unit: 'BRL',
    date: today(),
    source: 'Fallback FinanceIQ',
    description:
      'Cotação do dólar comercial em reais.'
  };
};

export const indicatorsMockService = {
  // =========================
  // SELIC REAL
  // =========================
  getSelic: async (): Promise<EconomicIndicator> => {
    try {
      const rates = await getBrazilianRates();

      const selic = findRateByName(
        rates,
        'selic'
      );

      if (!selic) {
        return fallbackSelic();
      }

      return {
        indicator: 'Selic',
        value: Number(selic.valor),
        unit: '% ao ano',
        date: today(),
        source: 'BrasilAPI',
        description:
          'Taxa básica de juros da economia brasileira.'
      };

    } catch (error) {
      console.error(
        'Erro ao buscar Selic real:',
        error
      );

      return fallbackSelic();
    }
  },

  // =========================
  // IPCA REAL
  // =========================
  getIpca: async (): Promise<EconomicIndicator> => {
    try {
      const rates = await getBrazilianRates();

      const ipca = findRateByName(
        rates,
        'ipca'
      );

      if (!ipca) {
        return fallbackIpca();
      }

      return {
        indicator: 'IPCA',
        value: Number(ipca.valor),
        unit: '% acumulado',
        date: today(),
        source: 'BrasilAPI',
        description:
          'Índice oficial de inflação ao consumidor no Brasil.'
      };

    } catch (error) {
      console.error(
        'Erro ao buscar IPCA real:',
        error
      );

      return fallbackIpca();
    }
  },

  // =========================
  // DÓLAR REAL
  // =========================
  getDollar: async (): Promise<EconomicIndicator> => {
    try {
      const response = await exchangeApi.get(
        '/latest/USD'
      );

      const brlRate =
        response.data?.rates?.BRL;

      if (!brlRate) {
        return fallbackDollar();
      }

      return {
        indicator: 'Dólar Comercial',
        value: Number(brlRate),
        unit: 'BRL',
        date: today(),
        source: 'ExchangeRate-API',
        description:
          'Cotação do dólar americano em reais.'
      };

    } catch (error) {
      console.error(
        'Erro ao buscar Dólar real:',
        error
      );

      return fallbackDollar();
    }
  },

  // =========================
  // RESUMO REAL
  // =========================
  getSummary: async () => {
    const [
      selic,
      ipca,
      dollar
    ] = await Promise.all([
      indicatorsMockService.getSelic(),
      indicatorsMockService.getIpca(),
      indicatorsMockService.getDollar()
    ]);

    return {
      date: today(),
      source:
        'BrasilAPI / ExchangeRate-API',
      indicators: [
        selic,
        ipca,
        dollar
      ],
      message:
        'Resumo econômico obtido a partir de APIs públicas para apoiar a educação financeira do usuário.'
    };
  }
};