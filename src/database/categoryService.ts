import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';
import { defaultCategories, CategoryType } from '../constants/defaultCategories';

export interface Category {
  id?: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  monthly_limit: number;
  type: CategoryType;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  created_at?: any;
  updated_at?: any;
}

export interface NewCategory {
  name: string;
  icon: string;
  color: string;
  monthly_limit: number;
  type: CategoryType;
  description?: string;
}

const COLLECTION_NAME = 'categories';

const normalizeCategoryName = (name: string) => {
  return name.trim().toLowerCase();
};

const sortCategories = (categories: Category[]) => {
  return categories.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'outcome' ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
};

export const categoryService = {
  // =========================
  // CRIAR CATEGORIAS PADRÃO
  // =========================
  createDefaultCategories: async (userId: string) => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot = await getDocs(q);

    const existingCategoryNames = new Set<string>();

    snapshot.forEach((document) => {
      const data = document.data() as Category;

      if (data.name) {
        existingCategoryNames.add(
          normalizeCategoryName(data.name)
        );
      }
    });

    for (const category of defaultCategories) {
      const categoryAlreadyExists = existingCategoryNames.has(
        normalizeCategoryName(category.name)
      );

      if (!categoryAlreadyExists) {
        await addDoc(
          collection(db, COLLECTION_NAME),
          {
            user_id: userId,
            name: category.name,
            icon: category.icon,
            color: category.color,
            monthly_limit: category.monthly_limit,
            type: category.type,
            description: category.description,
            is_default: true,
            is_active: true,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          }
        );
      }
    }
  },

  // =========================
  // LISTAR CATEGORIAS DO USUÁRIO
  // =========================
  listAll: async (userId: string): Promise<Category[]> => {
    await categoryService.createDefaultCategories(userId);

    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId),
      where('is_active', '==', true)
    );

    const snapshot = await getDocs(q);

    const categories: Category[] = [];

    snapshot.forEach((document) => {
      categories.push({
        id: document.id,
        ...(document.data() as Category)
      });
    });

    return sortCategories(categories);
  },

  // =========================
  // ADICIONAR NOVA CATEGORIA
  // =========================
  add: async (
    userId: string,
    category: NewCategory
  ) => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot = await getDocs(q);

    const categoryAlreadyExists = snapshot.docs.some((document) => {
      const data = document.data() as Category;

      return normalizeCategoryName(data.name) === normalizeCategoryName(category.name);
    });

    if (categoryAlreadyExists) {
      throw new Error('Já existe uma categoria com esse nome.');
    }

    const docRef = await addDoc(
      collection(db, COLLECTION_NAME),
      {
        user_id: userId,
        name: category.name.trim(),
        icon: category.icon,
        color: category.color,
        monthly_limit: category.monthly_limit,
        type: category.type,
        description: category.description || '',
        is_default: false,
        is_active: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }
    );

    return docRef.id;
  },

  // =========================
  // ATUALIZAR CATEGORIA
  // =========================
  update: async (
    id: string,
    data: Partial<NewCategory>
  ) => {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );

    await updateDoc(
      doc(db, COLLECTION_NAME, id),
      {
        ...cleanData,
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // ATUALIZAR LIMITE MENSAL
  // =========================
  updateMonthlyLimit: async (
    id: string,
    monthlyLimit: number
  ) => {
    await updateDoc(
      doc(db, COLLECTION_NAME, id),
      {
        monthly_limit: monthlyLimit,
        updated_at: serverTimestamp()
      }
    );
  },

  // =========================
  // DESATIVAR CATEGORIA
  // =========================
  deactivate: async (
    id: string
  ) => {
    await updateDoc(
      doc(db, COLLECTION_NAME, id),
      {
        is_active: false,
        updated_at: serverTimestamp()
      }
    );
  },
  
  // =========================
  // REMOVER CATEGORIA
  // =========================
    remove: async (
    id: string
  ) => {
    await deleteDoc(
      doc(db, COLLECTION_NAME, id)
    );
  },
};