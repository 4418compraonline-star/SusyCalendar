import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Estos datos identifican tu proyecto de Firebase (no son una contraseña — el propio
// Firebase los llama "config" y es normal que estén visibles en el código del navegador).
// Quien de verdad protege tus datos son las reglas de seguridad de Firestore (ver README.md).
const firebaseConfig = {
  apiKey: "AIzaSyAiGH_xHEjPBB_nlvKsObX6YpGB6VIzb4s",
  authDomain: "susy-ia.firebaseapp.com",
  projectId: "susy-ia",
  storageBucket: "susy-ia.firebasestorage.app",
  messagingSenderId: "510768253280",
  appId: "1:510768253280:web:3ad891dc57f5b61b94f605",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(firebaseApp);
