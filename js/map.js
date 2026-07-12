import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { setupNav } from './nav.js';

const UPLOAD_PASSWORD = 'nostopit';
let coordToolUnlocked = localStorage.getItem('wildlife_pw_unlocked') === '1';
let coordPendingSpecies = null;

const coordPanel     = document.getElementById('coordPanel');
const coordPanelBody = document.getElementById('coordPanelBody');
const coordToggle    = document.getElementById('coordPanelToggle');
const coordList      = document.getElementById('coordSpeciesList');
const coordStatus    = document.getElementById('coordStatus');

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
  center: [-110, 20],
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
  return `${locationToSlug(locationName)}.html`;
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

function setupAuthFab() {
  const fab = document.createElement('button');
  fab.id = 'authFab';
  fab.className = 'auth-fab';
  fab.title = 'Edit mode';
  fab.innerHTML = coordToolUnlocked ? lockOpenIcon() : lockIcon();
  document.body.appendChild(fab);

  fab.addEventListener('click', () => {
    if (coordToolUnlocked) {
      coordToolUnlocked = false;
      localStorage.removeItem('wildlife_pw_unlocked');
      coordPanel.classList.add('coord-panel--hidden');
      fab.innerHTML = lockIcon();
      return;
    }

    if (localStorage.getItem('wildlife_pw_unlocked') === '1') {
      coordToolUnlocked = true;
      coordPanel.classList.remove('coord-panel--hidden');
      fab.innerHTML = lockOpenIcon();
      return;
    }

    const pw = prompt('Enter password:');
    if (pw === UPLOAD_PASSWORD) {
      coordToolUnlocked = true;
      localStorage.setItem('wildlife_pw_unlocked', '1');
      coordPanel.classList.remove('coord-panel--hidden');
      fab.innerHTML = lockOpenIcon();
    } else {
      alert('Incorrect password.');
    }
  });
}

function lockIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
}

function lockOpenIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
}

coordToggle.addEventListener('click', () => {
  const collapsed = coordPanelBody.style.display === 'none';
  coordPanelBody.style.display = collapsed ? '' : 'none';
  coordToggle.style.transform = collapsed ? '' : 'rotate(180deg)';
});
 
function COORD_TOOL_loadSpecies(allSpecies) {
  if (!coordToolUnlocked) {
    coordList.innerHTML = `
      <div style="padding:0.75rem 1rem">
        <button id="coordUnlockBtn" style="
          background:rgba(200,133,58,0.15);
          border:1px solid rgba(200,133,58,0.4);
          color:rgba(255,255,255,0.8);
          padding:0.4rem 0.8rem;
          border-radius:6px;
          font-size:0.75rem;
          cursor:pointer;
          width:100%;
        ">🔒 Unlock to assign coords</button>
      </div>`;
    document.getElementById('coordUnlockBtn').addEventListener('click', () => {
      if (COORD_TOOL_checkAuth()) {
        COORD_TOOL_loadSpecies(allSpecies);
      }
    });
    return;
  }
 
  coordPanel.classList.remove('coord-panel--hidden');
 
  const needsCoords = allSpecies.filter(s => (!s.coordinates || !s.coordinates.lat) && (s.imageUrl && s.imageUrl.trim() !== ''));
  
  if (needsCoords.length === 0) {
    coordList.innerHTML = `<p style="padding:0 1rem;font-size:0.75rem;color:rgba(255,255,255,0.35)">All species have coordinates ✓</p>`;
    return;
  }
 
  coordList.innerHTML = '';
 
  needsCoords.forEach(species => {
    const item = document.createElement('div');
    item.className = 'coord-species-item';
    item.dataset.id = species.id;
 
    const thumbHtml = species.imageUrl
      ? `<img class="coord-species-thumb" src="${species.imageUrl}" alt="" loading="lazy">`
      : `<div class="coord-species-thumb coord-species-thumb--placeholder">🦎</div>`;
 
    item.innerHTML = `
      ${thumbHtml}
      <div class="coord-species-info">
        <div class="coord-species-name">${species.commonName}</div>
        <div class="coord-species-loc">${species.location} · ${species.class || '—'}</div>
      </div>
    `;
 
    item.addEventListener('click', () => {
      document.querySelectorAll('.coord-species-item').forEach(el => el.classList.remove('coord-species-item--active'));
      item.classList.add('coord-species-item--active');
      coordPendingSpecies = species;
      coordStatus.textContent = `Selected: ${species.commonName}. Click map to place.`;
      document.body.classList.add('coord-assign-mode');
    });
 
    coordList.appendChild(item);
  });
}
 
map.on('click', async (e) => {
  if (!coordPendingSpecies) return; 
 
  e.originalEvent.stopPropagation(); 
 
  const { lng, lat } = e.lngLat;
  const species = coordPendingSpecies;
  coordPendingSpecies = null;
  document.body.classList.remove('coord-assign-mode');
 
  coordStatus.textContent = `Saving coords for ${species.commonName}…`;
 
  const el = document.createElement('div');
  el.className = 'wildlife-marker wildlife-marker--active';
  new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(map);
 
  try {
    await updateDoc(doc(db, 'species', species.id), {
      coordinates: {
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6))
      }
    });
 
    coordStatus.textContent = `✓ Saved ${species.commonName} at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
 
    const item = coordList.querySelector(`[data-id="${species.id}"]`);
    if (item) item.remove();
 
    el.classList.remove('wildlife-marker--active');
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (activeMarkerEl) activeMarkerEl.classList.remove('wildlife-marker--active');
      activeMarkerEl = el;
      el.classList.add('wildlife-marker--active');
      openPopup({ ...species, coordinates: { lat, lng } });
    });
 
    if (coordList.querySelectorAll('.coord-species-item').length === 0) {
      coordList.innerHTML = `<p style="padding:0 1rem;font-size:0.75rem;color:rgba(255,255,255,0.35)">All species have coordinates ✓</p>`;
    }
 
  } catch (err) {
    console.error(err);
    coordStatus.textContent = `✗ Failed to save. Try again.`;
    coordPendingSpecies = species; // re-select so they can retry
    document.body.classList.add('coord-assign-mode');
  }
});

map.on('load', () => {
  loadSightings();
  buildLegend();
  setupNav();
  setupAuthFab();
});

map.on('click', () => {
  closePopup();
});