export interface MonthPeriod {
  year: number;
  month: number;
  periodMonth: string;
  startDate: Date;
  endDate: Date;
  label: string;
  isCurrentMonth: boolean;
}

const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const padNumber = (value: number) => {
  return String(value).padStart(2, '0');
};

export const periodService = {
  getPeriodMonthFromDate: (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    return `${year}-${padNumber(month)}`;
  },

  getCurrentPeriodMonth: () => {
    return periodService.getPeriodMonthFromDate(
      new Date()
    );
  },

  getMonthPeriodFromDate: (
    referenceDate: Date
  ): MonthPeriod => {
    const year = referenceDate.getFullYear();
    const monthIndex = referenceDate.getMonth();
    const month = monthIndex + 1;

    const startDate = new Date(
      year,
      monthIndex,
      1,
      0,
      0,
      0,
      0
    );

    const endDate = new Date(
      year,
      monthIndex + 1,
      0,
      23,
      59,
      59,
      999
    );

    const today = new Date();

    const isCurrentMonth =
      today.getFullYear() === year &&
      today.getMonth() === monthIndex;

    return {
      year,
      month,
      periodMonth: `${year}-${padNumber(month)}`,
      startDate,
      endDate,
      label: `${monthNames[monthIndex]} ${year}`,
      isCurrentMonth
    };
  },

  getCurrentMonthPeriod: () => {
    return periodService.getMonthPeriodFromDate(
      new Date()
    );
  },

  getPreviousMonthPeriod: (
    referenceDate: Date = new Date()
  ) => {
    return periodService.getMonthPeriodFromDate(
      new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() - 1,
        1
      )
    );
  },

  getNextMonthPeriod: (
    referenceDate: Date
  ) => {
    return periodService.getMonthPeriodFromDate(
      new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() + 1,
        1
      )
    );
  },

  getPreviousPeriod: (
    period: MonthPeriod
  ) => {
    return periodService.getMonthPeriodFromDate(
      new Date(
        period.year,
        period.month - 2,
        1
      )
    );
  },

  getNextPeriod: (
    period: MonthPeriod
  ) => {
    return periodService.getMonthPeriodFromDate(
      new Date(
        period.year,
        period.month,
        1
      )
    );
  }
};