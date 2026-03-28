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
  serverTimestamp
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

// ─── imgbb API key ──────────────────────────────────────────────────
export const IMGBB_API_KEY = "YOUR_IMGBB_API_KEY";

// ─── Upload password ────────────────────────────────────────────────
export const UPLOAD_PASSWORD = "nostopit";

// ─── Firestore helpers ──────────────────────────────────────────────

export async function fetchSpecies(location) {
  const q = query(
    collection(db, 'species'), 
    where('location', '==', location)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchSightings(location) {
  const q = query(
    collection(db, 'sightings'),
    where('location', '==', location)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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