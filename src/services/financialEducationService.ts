export type FinancialBehavior =
  | 'economia'
  | 'excesso'
  | 'equilibrado'
  | 'sem_limite';

export interface FinancialProjection {
  sixMonths: number;
  twelveMonths: number;
  twentyFourMonths: number;
}

export interface FinancialEducationInsight {
  behavior: FinancialBehavior;
  difference: number;
  projection: FinancialProjection;
  title: string;
  message: string;
  shortMessage: string;
}

interface GenerateCategoryInsightParams {
  categoryName: string;
  monthlyLimit: number;
  spent: number;
}

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

const calculateProjection = (
  monthlyDifference: number
): FinancialProjection => {
  return {
    sixMonths: monthlyDifference * 6,
    twelveMonths: monthlyDifference * 12,
    twentyFourMonths: monthlyDifference * 24
  };
};

const generateSavingInsight = (
  categoryName: string,
  difference: number
): FinancialEducationInsight => {
  const projection = calculateProjection(difference);

  return {
    behavior: 'economia',
    difference,
    projection,
    title: 'Você está no caminho certo',
    shortMessage:
      `Até agora, você está ${formatCurrency(difference)} abaixo do limite em ${categoryName}.`,
    message:
      `Até este momento, a categoria ${categoryName} está ${formatCurrency(difference)} abaixo do limite planejado. ` +
      `Isso não significa que o mês já terminou ou que esse valor está garantido, mas é um ótimo sinal de controle até aqui. ` +
      `Se uma economia média parecida se repetisse ao longo do tempo, ela poderia representar aproximadamente ` +
      `${formatCurrency(projection.sixMonths)} em 6 meses, ${formatCurrency(projection.twelveMonths)} em 1 ano ` +
      `e ${formatCurrency(projection.twentyFourMonths)} em 2 anos. ` +
      `Continue acompanhando seus próximos lançamentos com calma. Pequenas sobras, quando aparecem com frequência, podem virar uma reserva importante.`
  };
};

const generateExcessInsight = (
  categoryName: string,
  difference: number
): FinancialEducationInsight => {
  const projection = calculateProjection(difference);

  return {
    behavior: 'excesso',
    difference,
    projection,
    title: 'Vamos acompanhar de perto',
    shortMessage:
      `Até agora, você passou ${formatCurrency(difference)} do limite em ${categoryName}.`,
    message:
      `Neste momento, a categoria ${categoryName} está ${formatCurrency(difference)} acima do limite definido. ` +
      `Isso pode acontecer por necessidade, imprevisto ou por algum gasto importante, então não encare isso como uma falha. ` +
      `A ideia aqui é te ajudar a visualizar o impacto: se um excesso médio parecido se repetisse por vários meses, poderia representar cerca de ` +
      `${formatCurrency(projection.sixMonths)} em 6 meses, ${formatCurrency(projection.twelveMonths)} em 1 ano ` +
      `e ${formatCurrency(projection.twentyFourMonths)} em 2 anos. ` +
      `Se for possível, tente segurar um pouco os próximos gastos nessa categoria. Pequenos ajustes já ajudam a recuperar o equilíbrio.`
  };
};

const generateBalancedInsight = (
  categoryName: string
): FinancialEducationInsight => {
  return {
    behavior: 'equilibrado',
    difference: 0,
    projection: {
      sixMonths: 0,
      twelveMonths: 0,
      twentyFourMonths: 0
    },
    title: 'Categoria no limite planejado',
    shortMessage:
      `A categoria ${categoryName} está exatamente no limite definido.`,
    message:
      `A categoria ${categoryName} atingiu o limite planejado. ` +
      `Isso mostra que o valor definido está bem alinhado com o uso atual, mas vale ter atenção aos próximos lançamentos. ` +
      `Se ainda houver novos gastos nessa categoria, ela pode passar do limite. Acompanhar esse ponto ajuda você a decidir melhor antes de cada nova despesa.`
  };
};

const generateNoLimitInsight = (
  categoryName: string,
  spent: number
): FinancialEducationInsight => {
  return {
    behavior: 'sem_limite',
    difference: 0,
    projection: {
      sixMonths: 0,
      twelveMonths: 0,
      twentyFourMonths: 0
    },
    title: 'Defina um limite para acompanhar melhor',
    shortMessage:
      `A categoria ${categoryName} ainda não possui limite definido.`,
    message:
      `A categoria ${categoryName} ainda não possui um limite planejado. Até agora, foram registrados ${formatCurrency(spent)} nessa categoria. ` +
      `Definir um limite ajuda o FinanceIQ a mostrar se você está economizando, mantendo equilíbrio ou passando um pouco do planejado. ` +
      `Isso transforma seus lançamentos em uma análise mais educativa para as próximas decisões.`
  };
};

export const financialEducationService = {
  generateCategoryInsight: ({
    categoryName,
    monthlyLimit,
    spent
  }: GenerateCategoryInsightParams): FinancialEducationInsight => {
    const safeLimit = Number(monthlyLimit) || 0;
    const safeSpent = Number(spent) || 0;

    if (safeLimit <= 0) {
      return generateNoLimitInsight(
        categoryName,
        safeSpent
      );
    }

    const difference = safeLimit - safeSpent;

    const tolerance = 0.01;

    if (Math.abs(difference) <= tolerance) {
      return generateBalancedInsight(categoryName);
    }

    if (difference > 0) {
      return generateSavingInsight(
        categoryName,
        difference
      );
    }

    return generateExcessInsight(
      categoryName,
      Math.abs(difference)
    );
  }
};