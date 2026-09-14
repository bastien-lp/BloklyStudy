import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export default app;