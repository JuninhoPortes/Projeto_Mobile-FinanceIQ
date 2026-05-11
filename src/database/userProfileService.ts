import {
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';

export interface UserProfile {
  risk_profile: string;
}

const COLLECTION_NAME = 'users';

export const userProfileService = {

  // =========================
  // SALVAR PERFIL
  // =========================
  saveProfile: async (
    userId: string,
    profile: UserProfile
  ) => {

    await setDoc(
      doc(db, COLLECTION_NAME, userId),
      profile,
      { merge: true }
    );

  },

  // =========================
  // BUSCAR PERFIL
  // =========================
  getProfile: async (
    userId: string
  ): Promise<UserProfile | null> => {

    const document = await getDoc(
      doc(db, COLLECTION_NAME, userId)
    );

    if (!document.exists()) {
      return null;
    }

    const data = document.data();

    return {
      risk_profile: data.risk_profile || 'Moderado'
    };

  }

};