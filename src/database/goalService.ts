import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';

export interface FinancialGoal {
  id?: string;
  user_id?: string;
  title: string;
  description?: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  deadline?: any;
  icon: string;
  color: string;
  is_completed?: boolean;
  created_at?: any;
  updated_at?: any;
}

export interface CreateFinancialGoalData {
  title: string;
  description?: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  deadline?: Date | null;
  icon: string;
  color: string;
}

export interface UpdateFinancialGoalData {
  title?: string;
  description?: string;
  target_amount?: number;
  current_amount?: number;
  monthly_contribution?: number;
  deadline?: Date | null;
  icon?: string;
  color?: string;
}

const COLLECTION_NAME = 'goals';

const normalizeMoneyValue = (
  value: number | undefined
) => {
  if (!value || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Number(value));
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
    return new Date(value.seconds * 1000);
  }

  if (typeof value === 'string') {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
};

const normalizeDeadline = (
  deadline?: Date | null
) => {
  if (!deadline) {
    return null;
  }

  return Timestamp.fromDate(deadline);
};

const isGoalCompleted = (
  currentAmount: number,
  targetAmount: number
) => {
  if (targetAmount <= 0) {
    return false;
  }

  return currentAmount >= targetAmount;
};

const sortGoals = (
  goals: FinancialGoal[]
) => {
  return goals.sort((a, b) => {
    const completedA = a.is_completed ? 1 : 0;
    const completedB = b.is_completed ? 1 : 0;

    if (completedA !== completedB) {
      return completedA - completedB;
    }

    const dateA =
      getDateFromValue(a.created_at)?.getTime() || 0;

    const dateB =
      getDateFromValue(b.created_at)?.getTime() || 0;

    return dateB - dateA;
  });
};

export const goalService = {
  // =========================
  // LISTAR METAS DO USUÁRIO
  // =========================
  listAll: async (
    userId: string
  ): Promise<FinancialGoal[]> => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot =
      await getDocs(q);

    const goals: FinancialGoal[] = [];

    snapshot.forEach((document) => {
      const data =
        document.data() as FinancialGoal;

      goals.push({
        id: document.id,
        ...data,
        target_amount: normalizeMoneyValue(
          data.target_amount
        ),
        current_amount: normalizeMoneyValue(
          data.current_amount
        ),
        monthly_contribution: normalizeMoneyValue(
          data.monthly_contribution
        ),
        is_completed:
          data.is_completed ||
          isGoalCompleted(
            normalizeMoneyValue(data.current_amount),
            normalizeMoneyValue(data.target_amount)
          )
      });
    });

    return sortGoals(goals);
  },

  // =========================
  // CRIAR META
  // =========================
  create: async (
    userId: string,
    goal: CreateFinancialGoalData
  ) => {
    const targetAmount =
      normalizeMoneyValue(goal.target_amount);

    const currentAmount =
      normalizeMoneyValue(goal.current_amount);

    const monthlyContribution =
      normalizeMoneyValue(goal.monthly_contribution);

    const docRef =
      await addDoc(
        collection(db, COLLECTION_NAME),
        {
          user_id: userId,
          title: goal.title.trim(),
          description: goal.description?.trim() || '',
          target_amount: targetAmount,
          current_amount: currentAmount,
          monthly_contribution: monthlyContribution,
          deadline: normalizeDeadline(goal.deadline),
          icon: goal.icon,
          color: goal.color,
          is_completed: isGoalCompleted(
            currentAmount,
            targetAmount
          ),
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        }
      );

    return docRef.id;
  },

  // =========================
  // ATUALIZAR META
  // =========================
  update: async (
    id: string,
    data: UpdateFinancialGoalData
  ) => {
    const cleanData: any = {
      ...data
    };

    if (typeof cleanData.title === 'string') {
      cleanData.title = cleanData.title.trim();
    }

    if (typeof cleanData.description === 'string') {
      cleanData.description =
        cleanData.description.trim();
    }

    if (
      typeof cleanData.target_amount === 'number'
    ) {
      cleanData.target_amount =
        normalizeMoneyValue(
          cleanData.target_amount
        );
    }

    if (
      typeof cleanData.current_amount === 'number'
    ) {
      cleanData.current_amount =
        normalizeMoneyValue(
          cleanData.current_amount
        );
    }

    if (
      typeof cleanData.monthly_contribution === 'number'
    ) {
      cleanData.monthly_contribution =
        normalizeMoneyValue(
          cleanData.monthly_contribution
        );
    }

    if ('deadline' in cleanData) {
      cleanData.deadline =
        normalizeDeadline(cleanData.deadline);
    }

    if (
      typeof cleanData.current_amount === 'number' &&
      typeof cleanData.target_amount === 'number'
    ) {
      cleanData.is_completed =
        isGoalCompleted(
          cleanData.current_amount,
          cleanData.target_amount
        );
    }

    cleanData.updated_at =
      serverTimestamp();

    await updateDoc(
      doc(db, COLLECTION_NAME, id),
      cleanData
    );
  },

  // =========================
  // ADICIONAR VALOR À META
  // =========================
  addAmount: async (
    goal: FinancialGoal,
    amountToAdd: number
  ) => {
    if (!goal.id) {
      throw new Error(
        'Meta inválida para atualização.'
      );
    }

    const currentAmount =
      normalizeMoneyValue(goal.current_amount);

    const targetAmount =
      normalizeMoneyValue(goal.target_amount);

    const updatedAmount =
      currentAmount +
      normalizeMoneyValue(amountToAdd);

    await updateDoc(
      doc(db, COLLECTION_NAME, goal.id),
      {
        current_amount: updatedAmount,
        is_completed: isGoalCompleted(
          updatedAmount,
          targetAmount
        ),
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // SUBSTITUIR VALOR ATUAL
  // =========================
  replaceCurrentAmount: async (
    goal: FinancialGoal,
    newAmount: number
  ) => {
    if (!goal.id) {
      throw new Error(
        'Meta inválida para atualização.'
      );
    }

    const updatedAmount =
      normalizeMoneyValue(newAmount);

    const targetAmount =
      normalizeMoneyValue(goal.target_amount);

    await updateDoc(
      doc(db, COLLECTION_NAME, goal.id),
      {
        current_amount: updatedAmount,
        is_completed: isGoalCompleted(
          updatedAmount,
          targetAmount
        ),
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // MARCAR COMO CONCLUÍDA
  // =========================
  complete: async (
    goal: FinancialGoal
  ) => {
    if (!goal.id) {
      throw new Error(
        'Meta inválida para conclusão.'
      );
    }

    const targetAmount =
      normalizeMoneyValue(goal.target_amount);

    await updateDoc(
      doc(db, COLLECTION_NAME, goal.id),
      {
        current_amount: targetAmount,
        is_completed: true,
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // REABRIR META
  // =========================
  reopen: async (
    goal: FinancialGoal
  ) => {
    if (!goal.id) {
      throw new Error(
        'Meta inválida para reabertura.'
      );
    }

    await updateDoc(
      doc(db, COLLECTION_NAME, goal.id),
      {
        is_completed: false,
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // EXCLUIR META
  // =========================
  remove: async (
    id: string
  ) => {
    await deleteDoc(
      doc(db, COLLECTION_NAME, id)
    );
  }
};