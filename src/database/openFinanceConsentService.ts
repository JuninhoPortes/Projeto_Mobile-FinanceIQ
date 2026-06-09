import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';

export interface OpenFinancePermissions {
  balance: boolean;
  transactions: boolean;
  personalData: boolean;
}

export interface OpenFinanceConsent {
  id?: string;
  user_id: string;
  bank_id: string;
  bank_name: string;
  account_id: string;
  account_type: string;
  connected: boolean;
  permissions: OpenFinancePermissions;
  last_sync?: any;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'open_finance_consents';

const getConsentDocId = (
  userId: string,
  bankId: string
) => {
  return `${userId}_${bankId}`;
};

export const openFinanceConsentService = {

  // =========================
  // LISTAR CONSENTIMENTOS DO USUÁRIO
  // =========================
  listByUser: async (
    userId: string
  ): Promise<OpenFinanceConsent[]> => {

    const q = query(
      collection(db, COLLECTION_NAME),
      where('user_id', '==', userId)
    );

    const snapshot = await getDocs(q);

    const consents: OpenFinanceConsent[] = [];

    snapshot.forEach((document) => {
      consents.push({
        id: document.id,
        ...(document.data() as OpenFinanceConsent)
      });
    });

    return consents;
  },

  // =========================
  // SALVAR / ATUALIZAR BANCO
  // =========================
  saveBankConsent: async (
    consent: OpenFinanceConsent
  ) => {

    const consentId =
      getConsentDocId(
        consent.user_id,
        consent.bank_id
      );

    await setDoc(
      doc(db, COLLECTION_NAME, consentId),
      {
        ...consent,
        updated_at: serverTimestamp(),
        created_at: consent.created_at || serverTimestamp()
      },
      {
        merge: true
      }
    );

  },

  // =========================
  // ATUALIZAR PERMISSÕES
  // =========================
  updatePermissions: async (
    userId: string,
    bankId: string,
    permissions: OpenFinancePermissions
  ) => {

    const consentId =
      getConsentDocId(
        userId,
        bankId
      );

    await setDoc(
      doc(db, COLLECTION_NAME, consentId),
      {
        user_id: userId,
        bank_id: bankId,
        permissions,
        updated_at: serverTimestamp()
      },
      {
        merge: true
      }
    );

  },

  // =========================
  // ATUALIZAR ÚLTIMA SINCRONIZAÇÃO
  // =========================
  updateLastSync: async (
    userId: string,
    bankId: string
  ) => {

    const consentId =
      getConsentDocId(
        userId,
        bankId
      );

    await setDoc(
      doc(db, COLLECTION_NAME, consentId),
      {
        user_id: userId,
        bank_id: bankId,
        last_sync: serverTimestamp(),
        updated_at: serverTimestamp()
      },
      {
        merge: true
      }
    );

  },

  // =========================
  // REMOVER CONSENTIMENTO DE UM BANCO
  // =========================
  removeBankConsent: async (
    userId: string,
    bankId: string
  ) => {

    const consentId =
      getConsentDocId(
        userId,
        bankId
      );

    await deleteDoc(
      doc(db, COLLECTION_NAME, consentId)
    );

  }

};