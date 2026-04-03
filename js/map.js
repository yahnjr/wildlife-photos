import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { setupNav } from './nav.js';

const firebaseConfig = {
  apiKey: "AIzaSyB0yj1a7-ROuhKKiy0SoFZ_3ZzGucRQKxs",
  authDomain: "wildlife-photos-675dc.firebaseapp.com",
  projectId: "wildlife-photos-675dc",
  storageBucket: "wildlife-photos-675dc.firebasestorage.app",
  messagingSenderId: "691811821177",
  appId: "1:691811821177:web:4f12a2039cf2f6880fd6a8",
  measurementId: "G-59WYS96KK8"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';

export const CLASS_COLORS = {
  bird:      '#2688F2',  
  mammal:    '#EB7F0E',  
  reptile:   '#35C440',  
  amphibian: '#932DEE',  
  insect:    '#F0D010',  
  other:     '#6F7989',   
};

const CLASS_LABELS = {
  bird: 'Birds', mammal: 'Mammals', reptile: 'Reptiles',
  amphibian: 'Amphibians', insect: 'Insects', other: 'Other'
};

const activeFilters = new Set(Object.keys(CLASS_COLORS));

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: [0, 20],
  zoom: 1.8,
  projection: 'mercator',
  attributionControl: false
});

map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');

function locationToSlug(locationName) {
  return locationName.toLowerCase().replace(/\s+/g, '-');
}

function locationToHref(locationName) {
  return `pages/${locationToSlug(locationName)}.html`;
}

const popup      = document.getElementById('sightingPopup');
const popupClose = document.getElementById('popupClose');
const popupImg   = document.getElementById('popupImg');
const popupClass = document.getElementById('popupClass');
const popupName  = document.getElementById('popupName');
const popupSci   = document.getElementById('popupSci');
const popupLink  = document.getElementById('popupLink');

let activeMarkerEl = null;

popupClose.addEventListener('click', closePopup);

function openPopup(species) {
  const hasImg = species.imageUrl && species.imageUrl.trim() !== '';
  const imgWrap = popupImg.parentElement;

  if (hasImg) {
    popupImg.src = species.imageUrl;
    imgWrap.classList.remove('sighting-popup__img-wrap--no-img');
  } else {
    popupImg.src = '';
    imgWrap.classList.add('sighting-popup__img-wrap--no-img');
  }

  popupClass.textContent = species.class || '';
  popupName.textContent  = species.commonName || '';
  popupSci.textContent   = species.scientificName || '';
  popupLink.href         = locationToHref(species.location);
  popupLink.textContent  = `View all in ${species.location} →`;

  popup.classList.remove('sighting-popup--hidden');
}

function closePopup() {
  popup.classList.add('sighting-popup--hidden');
  if (activeMarkerEl) {
    activeMarkerEl.classList.remove('wildlife-marker--active');
    activeMarkerEl = null;
  }
}

async function loadSightings() {
  // Fetch all species that have coordinates
  const snap = await getDocs(collection(db, 'species'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const withCoords = all.filter(s => s.coordinates && s.coordinates.lat && s.coordinates.lng);

  withCoords.forEach(species => {
    const el = document.createElement('div');
    el.className = 'map-dot';
    el.style.setProperty('--dot-color', CLASS_COLORS[species.class] ?? CLASS_COLORS.other);
    el.dataset.class = species.class; 

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([species.coordinates.lng, species.coordinates.lat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeMarkerEl) activeMarkerEl.classList.remove('wildlife-marker--active');
      activeMarkerEl = el;
      el.classList.add('wildlife-marker--active');
      openPopup(species);
    });
  });

  COORD_TOOL_loadSpecies(all);
}

function buildLegend() {
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.innerHTML = Object.entries(CLASS_LABELS).map(([cls, label]) => `
    <button class="legend-item legend-item--active" data-class="${cls}">
      <span class="legend-dot" style="background:${CLASS_COLORS[cls]}"></span>
      <span class="legend-label">${label}</span>
    </button>
  `).join('');

  legend.addEventListener('click', (e) => {
    const btn = e.target.closest('.legend-item');
    if (!btn) return;
    const cls = btn.dataset.class;
    if (activeFilters.has(cls)) {
      activeFilters.delete(cls);
      btn.classList.remove('legend-item--active');
    } else {
      activeFilters.add(cls);
      btn.classList.add('legend-item--active');
    }
    document.querySelectorAll('.map-dot').forEach(dot => {
      dot.style.display = activeFilters.has(dot.dataset.class) ? '' : 'none';
    });
  });

  document.body.appendChild(legend);
}

map.on('load', () => {
  loadSightings();
  buildLegend();
  setupNav();
});

map.on('click', () => {
  closePopup();
});