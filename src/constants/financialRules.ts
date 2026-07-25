export type CategoryStatus =
  | 'controlado'
  | 'atencao'
  | 'proximo_limite'
  | 'excedido'
  | 'sem_limite';

export const financialRules = {
  attentionPercentage: 60,
  nearLimitPercentage: 85,
  exceededPercentage: 100
};

export const categoryStatusLabels: Record<CategoryStatus, string> = {
  controlado: 'Controlado',
  atencao: 'Atenção',
  proximo_limite: 'Próximo do limite',
  excedido: 'Excedido',
  sem_limite: 'Sem limite definido'
};

export const categoryStatusDescriptions: Record<CategoryStatus, string> = {
  controlado: 'A categoria está dentro de um uso saudável do orçamento mensal.',
  atencao: 'A categoria já consumiu uma parte relevante do orçamento mensal.',
  proximo_limite: 'A categoria está próxima de atingir o limite planejado.',
  excedido: 'A categoria ultrapassou o limite mensal definido.',
  sem_limite: 'A categoria ainda não possui um limite mensal configurado.'
};