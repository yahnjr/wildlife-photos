import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB0yj1a7-ROuhKKiy0SoFZ_3ZzGucRQKxs",
    authDomain: "wildlife-photos-675dc.firebaseapp.com",
    projectId: "wildlife-photos-675dc",
    storageBucket: "wildlife-photos-675dc.firebasestorage.app",
    messagingSenderId: "691811821177",
    appId: "1:691811821177:web:4f12a2039cf2f6880fd6a8",
    measurementId: "G-59WYS96KK8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const IMGBB_API_KEY = "YOUR_IMGBB_API_KEY";

export const UPLOAD_PASSWORD = "nostopit";

export async function fetchSpecies(location) {
  const q = query(
    collection(db, 'species'), 
    where('location', '==', location)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchLocations() {
  const q = query(collection(db, 'locations'), orderBy('order'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchLocation(name) {
  const q = query(collection(db, 'locations'), where('name', '==', name));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function updateSpeciesImage(docId, imageUrl, coordinates) {
  const ref = doc(db, 'species', docId);
  const data = { imageUrl };
  if (coordinates) data.coordinates = coordinates;
  return updateDoc(ref, data);
}

export async function addSighting(data) {
  return addDoc(collection(db, 'species'), {
    ...data,
    addedAt: serverTimestamp()
  });
}