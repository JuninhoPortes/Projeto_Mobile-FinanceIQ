import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";

// Cole aqui os seus dados exatamente como estão no console do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBjmidm-HOr56XAyAh-Cd2psEcx8YFRn7U",
  authDomain: "teste-db34e.firebaseapp.com",
  projectId: "teste-db34e",
  storageBucket: "teste-db34e.firebasestorage.app",
  messagingSenderId: "532127181609",
  appId: "1:532127181609:web:bf94a9a8849e3225126538",
  measurementId: "G-2V198Y11Z8" // Se o seu projeto tiver esse campo, mantenha-o
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// Lógica para evitar o erro [DEFAULT] already exists
if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);

export { auth, db, app };