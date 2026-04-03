import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
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
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';

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
    el.className = 'wildlife-marker';

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

map.on('load', loadSightings);

map.on('click', () => {
  closePopup();
});


// ═══════════════════════════════════════════════════════════════
//  TEMPORARY: COORDINATE ASSIGNMENT TOOL
//
//  Purpose: Lets you click a species in the left panel, then
//           click the map to assign coordinates to it in Firestore.
//
//  To remove when done:
//    1. Delete this entire block (between the === markers)
//    2. Delete the <aside id="coordPanel"> in index.html
//    3. Delete the TEMPORARY sections in map.css
//    4. Remove the COORD_TOOL_loadSpecies(all) call above
//    5. Remove the updateDoc import if no longer needed elsewhere
// ═══════════════════════════════════════════════════════════════

const UPLOAD_PASSWORD = 'nostopit';
let coordToolUnlocked = localStorage.getItem('wildlife_pw_unlocked') === '1';
let coordPendingSpecies = null; // species object being assigned

const coordPanel     = document.getElementById('coordPanel');
const coordPanelBody = document.getElementById('coordPanelBody');
const coordToggle    = document.getElementById('coordPanelToggle');
const coordList      = document.getElementById('coordSpeciesList');
const coordStatus    = document.getElementById('coordStatus');

// Only show the panel if unlocked (or unlock flow below)
if (coordToolUnlocked) {
  coordPanel.classList.remove('coord-panel--hidden');
}

function COORD_TOOL_checkAuth() {
  if (coordToolUnlocked) return true;
  const pw = prompt('Enter password to use coordinate tool:');
  if (pw === UPLOAD_PASSWORD) {
    coordToolUnlocked = true;
    localStorage.setItem('wildlife_pw_unlocked', '1');
    coordPanel.classList.remove('coord-panel--hidden');
    return true;
  }
  alert('Incorrect password.');
  return false;
}

coordToggle.addEventListener('click', () => {
  const collapsed = coordPanelBody.style.display === 'none';
  coordPanelBody.style.display = collapsed ? '' : 'none';
  coordToggle.style.transform = collapsed ? '' : 'rotate(180deg)';
});

function COORD_TOOL_loadSpecies(allSpecies) {
  if (!coordToolUnlocked) {
    // Show a single "unlock" item so the panel isn't just blank
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

  // Show only species WITHOUT coordinates
  const needsCoords = allSpecies.filter(s => s.imageUrl && s.imageUrl.trim() !== '');
  

  coordList.innerHTML = '';

  needsCoords.forEach(species => {
    const item = document.createElement('div');
    item.className = 'coord-species-item';
    item.dataset.id = species.id;

    const thumbHtml = species.imageUrl
      ? `<img class="coord-species-thumb" src="${species.imageUrl}" alt="" loading="lazy">`
      : `<div class="coord-species-thumb coord-species-thumb--placeholder">🦎</div>`;

    const hasCoords = species.coordinates && species.coordinates.lat;
    item.innerHTML = `
        ${thumbHtml}
            <div class="coord-species-info">
                <div class="coord-species-name">${species.commonName}</div>
                <div class="coord-species-loc">${species.location} · ${species.class || '—'}</div>
            </div>
        ${hasCoords ? `<span style="font-size:0.6rem;color:var(--moss-light);margin-left:auto;flex-shrink:0">📍</span>` : ''}
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

// Map click handler for coord assignment
map.on('click', async (e) => {
  if (!coordPendingSpecies) return; // not in assign mode

  e.originalEvent.stopPropagation(); // prevent popup close

  const { lng, lat } = e.lngLat;
  const species = coordPendingSpecies;
  coordPendingSpecies = null;
  document.body.classList.remove('coord-assign-mode');

  coordStatus.textContent = `Saving coords for ${species.commonName}…`;

  // Optimistically place a marker
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

    // Remove from list
    const item = coordList.querySelector(`[data-id="${species.id}"]`);
    if (item) item.remove();

    // Wire up the new marker popup
    el.classList.remove('wildlife-marker--active');
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (activeMarkerEl) activeMarkerEl.classList.remove('wildlife-marker--active');
      activeMarkerEl = el;
      el.classList.add('wildlife-marker--active');
      openPopup({ ...species, coordinates: { lat, lng } });
    });

  } catch (err) {
    console.error(err);
    coordStatus.textContent = `✗ Failed to save. Try again.`;
    coordPendingSpecies = species; // re-select so they can retry
    document.body.classList.add('coord-assign-mode');
  }
});

// END TEMPORARY: COORDINATE ASSIGNMENT TOOL
// ═══════════════════════════════════════════════════════════════