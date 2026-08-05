import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const missingFirebaseConfig = !firebaseConfig.apiKey || !firebaseConfig.projectId

// Sem as credenciais em .env, getAuth()/initializeFirestore() lançam exceção
// síncrona ("auth/invalid-api-key") e derrubariam o app inteiro no load.
// Só inicializamos de verdade quando a config existe; caso contrário a UI
// mostra a tela de configuração (ver App.tsx) em vez de quebrar em branco.
let app: FirebaseApp | undefined
let db: Firestore | undefined
let auth: Auth | undefined

if (!missingFirebaseConfig) {
  app = initializeApp(firebaseConfig)

  // Cache local persistente + suporte a múltiplas abas: os lançamentos feitos
  // offline (sem internet) ficam na fila e são enviados sozinhos assim que o
  // dispositivo volta a ficar online, sincronizando com os demais aparelhos.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })

  auth = getAuth(app)

  if (import.meta.env.VITE_USE_EMULATOR === 'true') {
    connectFirestoreEmulator(db, 'localhost', 8080)
    connectAuthEmulator(auth, 'http://localhost:9099')
  }
}

export { app, db, auth }
