import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';

export interface Transaction {
  id?: string;
  user_id?: string;
  description: string;
  amount: number;
  type: 'income' | 'outcome';
  category: string;
  date?: any;
  is_fixed?: boolean;
}

const COLLECTION_NAME = 'transactions';

const FIXED_TRANSACTIONS = [
  {
    description: 'Salário Mensal',
    amount: 0,
    type: 'income' as const,
    category: 'Receita',
    is_fixed: true
  },
  {
    description: 'Moradia',
    amount: 0,
    type: 'outcome' as const,
    category: 'Moradia',
    is_fixed: true
  },
  {
    description: 'Transporte',
    amount: 0,
    type: 'outcome' as const,
    category: 'Transporte',
    is_fixed: true
  },
  {
    description: 'Alimentação',
    amount: 0,
    type: 'outcome' as const,
    category: 'Alimentação',
    is_fixed: true
  }
];

const isFixedDescription = (description: string) => {
  return FIXED_TRANSACTIONS.some(
    item => item.description === description
  );
};

export const transactionService = {

  // =========================
  // CRIAR LANÇAMENTOS FIXOS
  // =========================
  createDefaultTransactions: async (
    userId: string
  ) => {

    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot = await getDocs(q);

    const existingTransactions: Transaction[] = [];

    snapshot.forEach((document) => {
      existingTransactions.push({
        id: document.id,
        ...(document.data() as Transaction)
      });
    });

    for (const fixedItem of FIXED_TRANSACTIONS) {

      const alreadyExists = existingTransactions.some(
        item => item.description === fixedItem.description
      );

      if (!alreadyExists) {

        await addDoc(
          collection(db, COLLECTION_NAME),
          {
            ...fixedItem,
            user_id: userId,
            date: serverTimestamp()
          }
        );

      }

    }

  },

  // =========================
  // LISTAR LANÇAMENTOS
  // =========================
  listAll: async (
    userId: string
  ): Promise<Transaction[]> => {

    await transactionService.createDefaultTransactions(userId);

    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);

    const transactions: Transaction[] = [];

    snapshot.forEach((document) => {

      const data = document.data() as Transaction;

      transactions.push({
        id: document.id,
        ...data,
        is_fixed: data.is_fixed || isFixedDescription(data.description)
      });

    });

    return transactions;
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
        amount
      }
    );

  },

  // =========================
  // ADICIONAR LANÇAMENTO EXTRA
  // =========================
  add: async (
    userId: string,
    transaction: Transaction
  ) => {

    const docRef = await addDoc(
      collection(db, COLLECTION_NAME),
      {
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        user_id: userId,
        is_fixed: false,
        date: serverTimestamp()
      }
    );

    return docRef.id;
  },

  // =========================
  // REMOVER LANÇAMENTO EXTRA
  // =========================
  remove: async (
    id: string
  ) => {

    const docRef = doc(
      db,
      COLLECTION_NAME,
      id
    );

    const document = await getDoc(docRef);

    if (!document.exists()) {
      throw new Error('Lançamento não encontrado.');
    }

    const data = document.data() as Transaction;

    const isFixed =
      data.is_fixed === true ||
      isFixedDescription(data.description);

    if (isFixed) {
      throw new Error('Lançamentos fixos não podem ser excluídos.');
    }

    await deleteDoc(docRef);

  }

};