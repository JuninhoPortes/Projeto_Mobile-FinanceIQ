import type {
  FinancialGoal
} from '../database/goalService';

export type GoalAnalysisStatus =
  | 'concluida'
  | 'quase_la'
  | 'em_andamento'
  | 'prazo_apertado'
  | 'atrasada'
  | 'sem_aporte';

export interface AnalyzedGoal {
  goal: FinancialGoal;
  progressPercentage: number;
  rawProgressPercentage: number;
  remainingAmount: number;
  estimatedMonths: number | null;
  monthsUntilDeadline: number | null;
  status: GoalAnalysisStatus;
  statusLabel: string;
  statusColor: string;
  statusBackgroundColor: string;
  assistantTitle: string;
  assistantMessage: string;
  shortMessage: string;
  priorityScore: number;
}

export interface GoalsOverview {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTargetAmount: number;
  totalCurrentAmount: number;
  totalRemainingAmount: number;
  averageProgress: number;
  highlightedGoals: AnalyzedGoal[];
  nextGoal?: AnalyzedGoal;
}

const formatCurrency = (
  value: number
) => {
  return value.toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
};

const normalizeMoneyValue = (
  value: number | undefined
) => {
  if (!value || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(
    0,
    Number(value)
  );
};

const getDateFromValue = (
  value: any
): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value?.seconds === 'number') {
    return new Date(
      value.seconds * 1000
    );
  }

  if (typeof value === 'string') {
    const parsedDate =
      new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
};

const getMonthsDifference = (
  startDate: Date,
  endDate: Date
) => {
  const yearDifference =
    endDate.getFullYear() - startDate.getFullYear();

  const monthDifference =
    endDate.getMonth() - startDate.getMonth();

  const totalMonths =
    yearDifference * 12 + monthDifference;

  if (endDate.getDate() >= startDate.getDate()) {
    return totalMonths;
  }

  return totalMonths - 1;
};

const formatMonths = (
  months: number
) => {
  if (months <= 0) {
    return 'menos de 1 mês';
  }

  if (months === 1) {
    return '1 mês';
  }

  return `${months} meses`;
};

const getEstimatedMonths = (
  remainingAmount: number,
  monthlyContribution: number
) => {
  if (remainingAmount <= 0) {
    return 0;
  }

  if (monthlyContribution <= 0) {
    return null;
  }

  return Math.ceil(
    remainingAmount / monthlyContribution
  );
};

const getGoalStatus = (
  data: {
    isCompleted: boolean;
    progressPercentage: number;
    monthlyContribution: number;
    estimatedMonths: number | null;
    monthsUntilDeadline: number | null;
    deadline: Date | null;
  }
): GoalAnalysisStatus => {
  const today =
    new Date();

  if (data.isCompleted) {
    return 'concluida';
  }

  if (
    data.deadline &&
    today > data.deadline
  ) {
    return 'atrasada';
  }

  if (data.monthlyContribution <= 0) {
    return 'sem_aporte';
  }

  if (data.progressPercentage >= 80) {
    return 'quase_la';
  }

  if (
    data.estimatedMonths !== null &&
    data.monthsUntilDeadline !== null &&
    data.estimatedMonths > data.monthsUntilDeadline
  ) {
    return 'prazo_apertado';
  }

  return 'em_andamento';
};

const getStatusVisual = (
  status: GoalAnalysisStatus
) => {
  if (status === 'concluida') {
    return {
      statusLabel: 'Concluída',
      statusColor: '#1E8449',
      statusBackgroundColor: '#EAF7EE'
    };
  }

  if (status === 'quase_la') {
    return {
      statusLabel: 'Quase lá',
      statusColor: '#1E8449',
      statusBackgroundColor: '#EAF7EE'
    };
  }

  if (status === 'prazo_apertado') {
    return {
      statusLabel: 'Prazo apertado',
      statusColor: '#B76300',
      statusBackgroundColor: '#FEF0D9'
    };
  }

  if (status === 'atrasada') {
    return {
      statusLabel: 'Atrasada',
      statusColor: '#C0392B',
      statusBackgroundColor: '#FDEDEC'
    };
  }

  if (status === 'sem_aporte') {
    return {
      statusLabel: 'Sem aporte',
      statusColor: '#1B365D',
      statusBackgroundColor: '#EAF0F6'
    };
  }

  return {
    statusLabel: 'Em andamento',
    statusColor: '#1B365D',
    statusBackgroundColor: '#EAF0F6'
  };
};

const generateAssistantMessage = (
  data: {
    goal: FinancialGoal;
    status: GoalAnalysisStatus;
    remainingAmount: number;
    estimatedMonths: number | null;
    monthsUntilDeadline: number | null;
    progressPercentage: number;
  }
) => {
  const goalTitle =
    data.goal.title;

  if (data.status === 'concluida') {
    return {
      assistantTitle: 'Meta concluída',
      assistantMessage:
        `Parabéns! A meta ${goalTitle} já atingiu o valor planejado. Esse é um ótimo sinal de organização e constância financeira.`,
      shortMessage:
        'Meta concluída com sucesso.'
    };
  }

  if (data.status === 'quase_la') {
    return {
      assistantTitle: 'Você está muito perto',
      assistantMessage:
        `Faltam ${formatCurrency(data.remainingAmount)} para concluir esta meta. Mantendo o ritmo atual, você está na reta final para alcançar esse objetivo.`,
      shortMessage:
        `Faltam ${formatCurrency(data.remainingAmount)} para concluir.`
    };
  }

  if (data.status === 'prazo_apertado') {
    return {
      assistantTitle: 'Ajuste recomendado',
      assistantMessage:
        data.estimatedMonths !== null &&
        data.monthsUntilDeadline !== null
          ? `Mantendo o aporte atual, a previsão é atingir esta meta em ${formatMonths(data.estimatedMonths)}, mas o prazo definido está em aproximadamente ${formatMonths(data.monthsUntilDeadline)}. Um pequeno ajuste no valor mensal pode ajudar a aproximar o objetivo do prazo desejado.`
          : `O prazo desta meta merece atenção. Ajustar o valor mensal pode ajudar você a se aproximar do objetivo com mais segurança.`,
      shortMessage:
        'O prazo pode exigir ajuste no aporte.'
    };
  }

  if (data.status === 'atrasada') {
    return {
      assistantTitle: 'Meta fora do prazo',
      assistantMessage:
        `O prazo definido para esta meta já passou, mas ainda faltam ${formatCurrency(data.remainingAmount)}. Você pode revisar a data, ajustar o aporte mensal ou manter a meta ativa para continuar evoluindo.`,
      shortMessage:
        'Revise o prazo ou ajuste o aporte.'
    };
  }

  if (data.status === 'sem_aporte') {
    return {
      assistantTitle: 'Defina um aporte mensal',
      assistantMessage:
        `Ainda faltam ${formatCurrency(data.remainingAmount)} para atingir esta meta. Definir um aporte mensal ajuda o FinanceIQ a calcular uma previsão mais clara para o objetivo.`,
      shortMessage:
        'Defina um aporte para calcular a projeção.'
    };
  }

  return {
    assistantTitle: 'Meta em evolução',
    assistantMessage:
      data.estimatedMonths !== null
        ? `Mantendo um aporte mensal parecido, a previsão é atingir esta meta em aproximadamente ${formatMonths(data.estimatedMonths)}. Continue acompanhando o progresso para manter o objetivo no radar.`
        : `Continue acompanhando esta meta. Conforme você adicionar valores, o FinanceIQ vai atualizar automaticamente o progresso e a projeção.`,
    shortMessage:
      data.estimatedMonths !== null
        ? `Previsão de conclusão em ${formatMonths(data.estimatedMonths)}.`
        : 'Continue registrando valores para acompanhar a evolução.'
  };
};

const getPriorityScore = (
  status: GoalAnalysisStatus,
  progressPercentage: number,
  monthsUntilDeadline: number | null
) => {
  let score = 0;

  if (status === 'atrasada') {
    score += 100;
  }

  if (status === 'prazo_apertado') {
    score += 80;
  }

  if (status === 'quase_la') {
    score += 70;
  }

  if (status === 'em_andamento') {
    score += 40;
  }

  if (status === 'sem_aporte') {
    score += 30;
  }

  score += progressPercentage / 2;

  if (
    monthsUntilDeadline !== null &&
    monthsUntilDeadline <= 3
  ) {
    score += 20;
  }

  return score;
};

export const goalAnalysisService = {
  analyzeGoal: (
    goal: FinancialGoal
  ): AnalyzedGoal => {
    const targetAmount =
      normalizeMoneyValue(goal.target_amount);

    const currentAmount =
      normalizeMoneyValue(goal.current_amount);

    const monthlyContribution =
      normalizeMoneyValue(goal.monthly_contribution);

    const remainingAmount =
      Math.max(
        targetAmount - currentAmount,
        0
      );

    const rawProgressPercentage =
      targetAmount > 0
        ? (currentAmount / targetAmount) * 100
        : 0;

    const progressPercentage =
      Math.min(
        rawProgressPercentage,
        100
      );

    const estimatedMonths =
      getEstimatedMonths(
        remainingAmount,
        monthlyContribution
      );

    const deadline =
      getDateFromValue(goal.deadline);

    const monthsUntilDeadline =
      deadline
        ? Math.max(
            getMonthsDifference(
              new Date(),
              deadline
            ),
            0
          )
        : null;

    const isCompleted =
      Boolean(goal.is_completed) ||
      (
        targetAmount > 0 &&
        currentAmount >= targetAmount
      );

    const status =
      getGoalStatus({
        isCompleted,
        progressPercentage,
        monthlyContribution,
        estimatedMonths,
        monthsUntilDeadline,
        deadline
      });

    const visual =
      getStatusVisual(status);

    const assistant =
      generateAssistantMessage({
        goal,
        status,
        remainingAmount,
        estimatedMonths,
        monthsUntilDeadline,
        progressPercentage
      });

    const priorityScore =
      getPriorityScore(
        status,
        progressPercentage,
        monthsUntilDeadline
      );

    return {
      goal,
      progressPercentage,
      rawProgressPercentage,
      remainingAmount,
      estimatedMonths,
      monthsUntilDeadline,
      status,
      statusLabel: visual.statusLabel,
      statusColor: visual.statusColor,
      statusBackgroundColor: visual.statusBackgroundColor,
      assistantTitle: assistant.assistantTitle,
      assistantMessage: assistant.assistantMessage,
      shortMessage: assistant.shortMessage,
      priorityScore
    };
  },

  analyzeGoals: (
    goals: FinancialGoal[]
  ): AnalyzedGoal[] => {
    return goals
      .map(goalAnalysisService.analyzeGoal)
      .sort((a, b) => {
        if (
          a.status === 'concluida' &&
          b.status !== 'concluida'
        ) {
          return 1;
        }

        if (
          a.status !== 'concluida' &&
          b.status === 'concluida'
        ) {
          return -1;
        }

        return b.priorityScore - a.priorityScore;
      });
  },

  generateOverview: (
    goals: FinancialGoal[]
  ): GoalsOverview => {
    const analyzedGoals =
      goalAnalysisService.analyzeGoals(goals);

    const activeGoals =
      analyzedGoals.filter(
        item => item.status !== 'concluida'
      );

    const completedGoals =
      analyzedGoals.filter(
        item => item.status === 'concluida'
      );

    const totalTargetAmount =
      goals.reduce(
        (total, goal) =>
          total + normalizeMoneyValue(goal.target_amount),
        0
      );

    const totalCurrentAmount =
      goals.reduce(
        (total, goal) =>
          total + normalizeMoneyValue(goal.current_amount),
        0
      );

    const totalRemainingAmount =
      Math.max(
        totalTargetAmount - totalCurrentAmount,
        0
      );

    const averageProgress =
      analyzedGoals.length > 0
        ? analyzedGoals.reduce(
            (total, item) =>
              total + item.progressPercentage,
            0
          ) / analyzedGoals.length
        : 0;

    return {
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      totalTargetAmount,
      totalCurrentAmount,
      totalRemainingAmount,
      averageProgress,
      highlightedGoals: analyzedGoals.slice(0, 2),
      nextGoal: analyzedGoals[0]
    };
  }
};