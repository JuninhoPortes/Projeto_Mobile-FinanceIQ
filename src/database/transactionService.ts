import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';
import { periodService } from '../services/periodService';

export interface Transaction {
  id?: string;
  user_id?: string;
  description: string;
  amount: number;
  type: 'income' | 'outcome';
  category: string;
  date?: any;
  period_month?: string;
  is_fixed?: boolean;

  external_id?: string;
  source?: 'manual' | 'open_finance_mock';
  bank_name?: string;
  account_id?: string;
  original_date?: string;
  imported_at?: any;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'transactions';

const FIXED_TRANSACTIONS: Transaction[] = [
  {
    description: 'Salário Mensal',
    amount: 0,
    type: 'income',
    category: 'Receita',
    is_fixed: true,
    source: 'manual'
  },

  {
    description: 'Moradia',
    amount: 0,
    type: 'outcome',
    category: 'Moradia',
    is_fixed: true,
    source: 'manual'
  },

  {
    description: 'Transporte',
    amount: 0,
    type: 'outcome',
    category: 'Transporte',
    is_fixed: true,
    source: 'manual'
  },

  {
    description: 'Alimentação',
    amount: 0,
    type: 'outcome',
    category: 'Alimentação',
    is_fixed: true,
    source: 'manual'
  }
];

const fixedTransactionDescriptions =
  FIXED_TRANSACTIONS.map(transaction => transaction.description);

const isFixedTransactionDescription = (
  description: string
) => {
  return fixedTransactionDescriptions.includes(description);
};

const parseDateString = (
  value: string
): Date | null => {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const parsePeriodMonthToDate = (
  periodMonth: string
) => {
  const [year, month] = periodMonth
    .split('-')
    .map(Number);

  return new Date(
    year,
    month - 1,
    1,
    0,
    0,
    0,
    0
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

  if (typeof value === 'string') {
    return parseDateString(value);
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  return null;
};

const getTransactionDate = (
  transaction: Transaction
): Date | null => {
  if (transaction.original_date) {
    const originalDate = parseDateString(transaction.original_date);

    if (originalDate) {
      return originalDate;
    }
  }

  return getDateFromValue(transaction.date);
};

const getPeriodMonthFromTransaction = (
  transaction: Transaction
) => {
  if (transaction.period_month) {
    return transaction.period_month;
  }

  const transactionDate = getTransactionDate(transaction);

  if (transactionDate) {
    return periodService.getPeriodMonthFromDate(transactionDate);
  }

  return periodService.getCurrentPeriodMonth();
};

const sortTransactionsByDateDesc = (
  transactions: Transaction[]
) => {
  return transactions.sort((a, b) => {
    const dateA = getTransactionDate(a)?.getTime() || 0;
    const dateB = getTransactionDate(b)?.getTime() || 0;

    return dateB - dateA;
  });
};

const normalizeImportedTransactionDate = (
  transaction: any
): Date => {
  const possibleDate =
    transaction.originalDate ||
    transaction.original_date ||
    transaction.date ||
    transaction.transactionDate;

  if (possibleDate) {
    const parsedDate =
      typeof possibleDate === 'string'
        ? parseDateString(possibleDate)
        : getDateFromValue(possibleDate);

    if (parsedDate) {
      return parsedDate;
    }
  }

  return new Date();
};

export const transactionService = {
  // =========================
  // CRIAR LANÇAMENTOS FIXOS DO PERÍODO
  // =========================
  createDefaultTransactions: async (
    userId: string,
    periodMonth: string = periodService.getCurrentPeriodMonth()
  ) => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot = await getDocs(q);

    const existingFixedTransactions = new Set<string>();

    snapshot.forEach((document) => {
      const data = document.data() as Transaction;

      const isFixed =
        data.is_fixed ||
        isFixedTransactionDescription(data.description);

      if (!isFixed) {
        return;
      }

      const transactionPeriod =
        getPeriodMonthFromTransaction(data);

      existingFixedTransactions.add(
        `${data.description}-${transactionPeriod}`
      );
    });

    const periodStartDate =
      parsePeriodMonthToDate(periodMonth);

    for (const transaction of FIXED_TRANSACTIONS) {
      const transactionKey =
        `${transaction.description}-${periodMonth}`;

      const alreadyExists =
        existingFixedTransactions.has(transactionKey);

      if (!alreadyExists) {
        await addDoc(
          collection(db, COLLECTION_NAME),
          {
            ...transaction,
            user_id: userId,
            amount: 0,
            is_fixed: true,
            source: 'manual',
            period_month: periodMonth,
            date: Timestamp.fromDate(periodStartDate),
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          }
        );
      }
    }
  },

  // =========================
  // LISTAR LANÇAMENTOS DO MÊS ATUAL
  // =========================
  listAll: async (
    userId: string
  ): Promise<Transaction[]> => {
    const currentPeriodMonth =
      periodService.getCurrentPeriodMonth();

    await transactionService.createDefaultTransactions(
      userId,
      currentPeriodMonth
    );

    return transactionService.listByPeriod(
      userId,
      currentPeriodMonth
    );
  },

  // =========================
  // LISTAR LANÇAMENTOS POR PERÍODO
  // Usaremos essa função principalmente em Relatórios.
  // =========================
  listByPeriod: async (
    userId: string,
    periodMonth: string
  ): Promise<Transaction[]> => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);

    const transactions: Transaction[] = [];

    snapshot.forEach((document) => {
      const data = document.data() as Transaction;

      const transaction: Transaction = {
        id: document.id,
        ...data,
        is_fixed:
          data.is_fixed ||
          isFixedTransactionDescription(data.description),
        period_month:
          data.period_month ||
          getPeriodMonthFromTransaction(data)
      };

      const transactionPeriod =
        getPeriodMonthFromTransaction(transaction);

      if (transactionPeriod === periodMonth) {
        transactions.push(transaction);
      }
    });

    return sortTransactionsByDateDesc(transactions);
  },

  // =========================
  // ATUALIZAR VALOR
  // =========================
  updateAmount: async (
    id: string,
    amount: number
  ) => {
    await updateDoc(
      doc(db, COLLECTION_NAME, id),
      {
        amount,
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // ATUALIZAR LANÇAMENTO
  // =========================
  update: async (
    id: string,
    data: Partial<
      Pick<
        Transaction,
        'amount' | 'category' | 'description' | 'type' | 'date' | 'period_month'
      >
    >
  ) => {
    const cleanData: any = {
      ...data
    };

    const updatedDate =
      getDateFromValue(cleanData.date);

    if (updatedDate) {
      cleanData.date = Timestamp.fromDate(updatedDate);
      cleanData.period_month =
        cleanData.period_month ||
        periodService.getPeriodMonthFromDate(updatedDate);
    }

    await updateDoc(
      doc(db, COLLECTION_NAME, id),
      {
        ...cleanData,
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // ADICIONAR LANÇAMENTO MANUAL
  // =========================
  add: async (
    userId: string,
    transaction: Transaction,
    selectedDate: Date = new Date()
  ) => {
    const transactionDate =
      getDateFromValue(transaction.date) ||
      selectedDate;

    const periodMonth =
      transaction.period_month ||
      periodService.getPeriodMonthFromDate(transactionDate);

    const docRef = await addDoc(
      collection(db, COLLECTION_NAME),
      {
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        user_id: userId,
        is_fixed: false,
        source: transaction.source || 'manual',
        date: Timestamp.fromDate(transactionDate),
        period_month: periodMonth,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }
    );

    return docRef.id;
  },

  // =========================
  // IMPORTAR TRANSAÇÕES DO OPEN FINANCE MOCK
  // =========================
  importFromOpenFinance: async (
    userId: string,
    transactions: any[]
  ) => {
    let importedCount = 0;

    for (const transaction of transactions) {
      const externalId =
        transaction.externalId ||
        transaction.external_id;

      if (!externalId) {
        continue;
      }

      const existingQuery = query(
        collection(db, COLLECTION_NAME),
        where('user_id', '==', userId),
        where('external_id', '==', externalId)
      );

      const existingSnapshot =
        await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        continue;
      }

      const transactionDate =
        normalizeImportedTransactionDate(transaction);

      const periodMonth =
        periodService.getPeriodMonthFromDate(transactionDate);

      await addDoc(
        collection(db, COLLECTION_NAME),
        {
          user_id: userId,
          description: transaction.description,
          amount: Math.abs(Number(transaction.amount) || 0),
          type: transaction.type,
          category: transaction.category || 'Outros',
          source: 'open_finance_mock',
          bank_name: transaction.bankName || transaction.bank_name || '',
          account_id: transaction.accountId || transaction.account_id || '',
          external_id: externalId,
          original_date:
            transaction.originalDate ||
            transaction.original_date ||
            transaction.date ||
            '',
          imported_at: serverTimestamp(),
          date: Timestamp.fromDate(transactionDate),
          period_month: periodMonth,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        }
      );

      importedCount += 1;
    }

    return {
      importedCount
    };
  },

  // =========================
  // REMOVER TRANSAÇÕES IMPORTADAS POR BANCO
  // =========================
  removeOpenFinanceTransactionsByBank: async (
    userId: string,
    bankName: string
  ) => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot = await getDocs(q);

    const deletePromises: Promise<void>[] = [];

    snapshot.forEach((document) => {
      const data = document.data() as Transaction;

      const belongsToBank =
        data.source === 'open_finance_mock' &&
        data.bank_name === bankName;

      if (belongsToBank) {
        deletePromises.push(
          deleteDoc(
            doc(db, COLLECTION_NAME, document.id)
          )
        );
      }
    });

    await Promise.all(deletePromises);
  },

  // =========================
  // EXCLUIR LANÇAMENTO
  // =========================
  remove: async (
    id: string
  ) => {
    await deleteDoc(
      doc(db, COLLECTION_NAME, id)
    );
  }
};