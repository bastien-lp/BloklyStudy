import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyC3NGYPMYax-_H1PobunXBrIr9hQDWfQqE',
  authDomain: 'bloklystudy-9a88f.firebaseapp.com',
  projectId: 'bloklystudy-9a88f',
  storageBucket: 'bloklystudy-9a88f.firebasestorage.app',
  messagingSenderId: '903197636631',
  appId: '1:903197636631:web:024da86fa0147454e64452',
  databaseURL: 'https://bloklystudy-9a88f-default-rtdb.europe-west1.firebasedatabase.app'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Firestore with the official offline cache (IndexedDB): pages keep working
 * without a connection (flashcards, planner…) and writes made offline are
 * queued and sent when the network is back. Several tabs share one cache.
 * If the browser refuses (e.g. some private modes), Firestore falls back to
 * its default in-memory behaviour — exactly how the app worked before.
 * Only the initialisation changed here; the configuration values did not.
 */
function createFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db = createFirestore();
export const rtdb = getDatabase(app);
export default app;