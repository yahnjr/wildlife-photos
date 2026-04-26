import {
  fetchSpecies,
  fetchLocation,
  fetchLocations,
  updateSpeciesImage,
  addSighting,
  IMGBB_API_KEY,
  UPLOAD_PASSWORD
} from './firebase-config.js';
import { setupNav } from './nav.js';

let currentLocation = '';
let pendingDocId = null;
let pendingFile = null;
let pendingSightingLocation = null;
let pendingCoords = null;
let isUnlocked = false;
let locationMeta = null;

function extractExifCoords(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint16(0) !== 0xFFD8) { resolve(null); return; }
        let offset = 2;
        while (offset < view.byteLength) {
          const marker = view.getUint16(offset);
          offset += 2;
          if (marker === 0xFFE1) {
            const len = view.getUint16(offset);
            const exif = parseExifGPS(view, offset + 2, len - 2);
            resolve(exif);
            return;
          }
          if ((marker & 0xFF00) !== 0xFF00) break;
          offset += view.getUint16(offset);
        }
        resolve(null);
      } catch { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

function parseExifGPS(view, start, length) {
  try {
    const exifHeader = String.fromCharCode(...new Uint8Array(view.buffer, start, 6));
    if (!exifHeader.startsWith('Exif')) return null;
    const tiffOffset = start + 6;
    const littleEndian = view.getUint16(tiffOffset) === 0x4949;
    const getUint16 = (o) => view.getUint16(tiffOffset + o, littleEndian);
    const getUint32 = (o) => view.getUint32(tiffOffset + o, littleEndian);

    const ifdOffset = getUint32(4);
    const count = getUint16(ifdOffset);
    let gpsIfdOffset = null;

    for (let i = 0; i < count; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      const tag = getUint16(entryOffset);
      if (tag === 0x8825) {
        gpsIfdOffset = getUint32(entryOffset + 8);
      }
    }
    if (!gpsIfdOffset) return null;

    const gpsCount = getUint16(gpsIfdOffset);
    const gps = {};
    for (let i = 0; i < gpsCount; i++) {
      const entryOffset = gpsIfdOffset + 2 + i * 12;
      const tag = getUint16(entryOffset);
      const type = getUint16(entryOffset + 2);
      const numValues = getUint32(entryOffset + 4);
      const valueOffset = getUint32(entryOffset + 8);

      if (type === 2) { // ASCII
        const str = String.fromCharCode(...new Uint8Array(view.buffer, tiffOffset + valueOffset, numValues - 1));
        gps[tag] = str;
      } else if (type === 5) { // RATIONAL
        const ratOffset = tiffOffset + valueOffset;
        const readRational = (o) => view.getUint32(ratOffset + o, littleEndian) / view.getUint32(ratOffset + o + 4, littleEndian);
        if (numValues === 3) {
          gps[tag] = readRational(0) + readRational(8) / 60 + readRational(16) / 3600;
        } else {
          gps[tag] = readRational(0);
        }
      }
    }

    const lat = gps[2] !== undefined ? (gps[1] === 'S' ? -Math.abs(gps[2]) : Math.abs(gps[2])) : null;
    const lng = gps[4] !== undefined ? (gps[3] === 'W' ? -Math.abs(gps[4]) : Math.abs(gps[4])) : null;

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
    }
    return null;
  } catch { return null; }
}

async function uploadToImgbb(file, onProgress) {
  const formData = new FormData();
  formData.append('image', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 90));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          onProgress && onProgress(100);
          resolve(data.data.display_url);
        } else {
          reject(new Error('imgbb upload failed'));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', `https://api.imgbb.com/1/upload?key=${"974d08f8ae673541331db22c6d6e7c66"}`);
    xhr.send(formData);
  });
}

function uploadIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
}

function renderCard(species) {
  const card = document.createElement('div');
  card.className = 'species-card';
  card.dataset.id = species.id;

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-image-wrap';

  if (species.imageUrl) {
    const img = document.createElement('img');
    img.src = species.imageUrl;
    img.alt = species.commonName;
    img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(species.imageUrl));
    img.style.cursor = 'zoom-in';
    imgWrap.appendChild(img);

    const swapBtn = document.createElement('button');
    swapBtn.className = 'card-swap-btn';
    swapBtn.title = 'Replace photo';
    swapBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startUpload(species.id, species.commonName);
    });
    imgWrap.appendChild(swapBtn);
  } else {
    card.classList.add('card--no-photo');  // ← add marker class
    const btn = document.createElement('button');
    btn.className = 'card-upload-btn';
    btn.innerHTML = `${uploadIcon()}<span>Add photo</span>`;
    btn.addEventListener('click', () => startUpload(species.id, species.commonName));
    imgWrap.appendChild(btn);
  }

  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <div class="card-common">${species.commonName}</div>
    <div class="card-scientific">${species.scientificName || ''}</div>
  `;

  card.appendChild(imgWrap);
  card.appendChild(body);
  return card;
}

function renderSection(title, speciesList, container, showAddSighting = true) {
  const speciesWithPhotos = speciesList.filter(s => s.imageUrl && s.imageUrl.trim() !== "");
  
  const isNoCamBirds = title === 'Birds' 
    && locationMeta 
    && locationMeta.birdPlateUrl;

  const numberSpecies = isNoCamBirds
    ? (locationMeta.birdCount || 0)
    : speciesWithPhotos.length;

  const block = document.createElement('div');
  block.className = 'section-block';

  block.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${title}</h2>
      <span class="section-count">${numberSpecies} species</span>
    </div>
  `;

  if (isNoCamBirds) {
    const heroImg = document.createElement('div');
    heroImg.className = 'special-hero-wrap';
    heroImg.innerHTML = `
      <img src="${locationMeta.birdPlateUrl}" class="hero-image" style="width:100%; border-radius:8px; margin-bottom:1rem; cursor:zoom-in;">
      <p class="hero-note" style="font-style:italic; color:var(--text-secondary); font-size:0.9rem; margin-bottom:1.5rem;">
        Note: I didn't have a bird-capable camera during this trip; this compilation represents birds sighted.
      </p>
    `;
    heroImg.querySelector('img').addEventListener('click', () => openLightbox(locationMeta.birdPlateUrl));
    block.appendChild(heroImg);
    showAddSighting = false;
  } 
  else if (speciesList.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'species-grid';
    speciesList.forEach(s => grid.appendChild(renderCard(s)));
    block.appendChild(grid);
  } else {
    block.innerHTML += `<p class="empty-state">No species listed yet.</p>`;
  }

  if (showAddSighting) {
    const row = document.createElement('div');
    row.className = 'add-sighting-row';
    const btn = document.createElement('button');
    btn.className = 'btn-add-sighting';
    btn.textContent = `+ Add ${title} sighting`;
    btn.addEventListener('click', () => openSightingModal(title));
    row.appendChild(btn);
    row.classList.add('add-sighting-row--gated');
    block.appendChild(row);
  }

  container.appendChild(block);
}

export async function initPage(location) {
  currentLocation = location;
  if (localStorage.getItem('wildlife_pw_unlocked') === '1') isUnlocked = true;
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-state">Loading species...</div>';

  try {
    const [species, locData] = await Promise.all([
      fetchSpecies(location),
      fetchLocation(location)
    ]);
    locationMeta = locData;

    app.innerHTML = '';

    const classes = ['bird', 'mammal', 'reptile', 'amphibian', 'insect', 'other'];
    const classLabels = {
      bird: 'Birds',
      mammal: 'Mammals',
      reptile: 'Reptiles',
      amphibian: 'Amphibians',
      insect: 'Insects',
      other: 'Other'
    };

    classes.forEach(cls => {
      const list = species.filter(s => s.class === cls);
      renderSection(classLabels[cls], list, app, true);
    });

  } catch (err) {
    console.error(err);
    app.innerHTML = `<p class="loading-state">Error loading data.</p>`;
  }

  setupModals();
  setupLightbox();
  setupNav();
  setupAuthFab();
  applyAuthVisibility();
}

function startUpload(docId, speciesName) {
  if (isUnlocked) {
    openUploadModal(docId, speciesName);
    return;
  }

  pendingDocId = docId;
  document.getElementById('modalSpeciesName').textContent = speciesName;
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordError').textContent = '';
  document.getElementById('passwordModal').classList.add('active');
}

function openUploadModal(docId, speciesName) {
  pendingDocId = docId;
  pendingFile = null;
  pendingCoords = null;
  document.getElementById('uploadSpeciesName').textContent = speciesName;
  document.getElementById('uploadSubmit').disabled = true;
  document.getElementById('coordsNote').textContent = '';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('dropZone').classList.remove('dragover');
  document.getElementById('uploadModal').classList.add('active');
}

function openSightingModal(classLabel) {
  if (!isUnlocked) {
    pendingDocId = '__sighting__';
    pendingSightingLocation = classLabel;
    document.getElementById('modalSpeciesName').textContent = `Add sighting — ${classLabel}`;
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').textContent = '';
    document.getElementById('passwordModal').classList.add('active');
    return;
  }
  pendingSightingLocation = classLabel;
  document.getElementById('sightingCommon').value = '';
  document.getElementById('sightingScientific').value = '';
  document.getElementById('sightingNotes').value = '';
  document.getElementById('sightingModal').classList.add('active');
}

function setupModals() {

  document.getElementById('modalCancel').addEventListener('click', () => {
    document.getElementById('passwordModal').classList.remove('active');
  });

  document.getElementById('modalUnlock').addEventListener('click', () => {
    const pw = document.getElementById('passwordInput').value;
    if (pw === UPLOAD_PASSWORD) {
      isUnlocked = true;
      localStorage.setItem('wildlife_pw_unlocked', '1');
      applyAuthVisibility();
      document.getElementById('passwordModal').classList.remove('active');

      if (pendingDocId === '__fab__') {
      } else if (pendingDocId === '__sighting__') {
        document.getElementById('sightingCommon').value = '';
        document.getElementById('sightingScientific').value = '';
        document.getElementById('sightingNotes').value = '';
        document.getElementById('sightingModal').classList.add('active');
      } else {
        openUploadModal(pendingDocId, document.getElementById('modalSpeciesName').textContent);
      }
    } else {
      document.getElementById('passwordError').textContent = 'Incorrect password.';
    }
});

  document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('modalUnlock').click();
  });

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
  });

  document.getElementById('uploadCancel').addEventListener('click', () => {
    document.getElementById('uploadModal').classList.remove('active');
  });

  document.getElementById('uploadSubmit').addEventListener('click', async () => {
    if (!pendingFile) return;
    const submitBtn = document.getElementById('uploadSubmit');
    const cancelBtn = document.getElementById('uploadCancel');
    submitBtn.disabled = true;
    cancelBtn.disabled = true;

    document.getElementById('uploadProgress').style.display = 'flex';

    try {
      const imageUrl = await uploadToImgbb(pendingFile, (pct) => {
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressLabel').textContent = pct < 100 ? `Uploading… ${pct}%` : 'Saving…';
      });

      await updateSpeciesImage(pendingDocId, imageUrl, pendingCoords);

      const card = document.querySelector(`.species-card[data-id="${pendingDocId}"]`);
      if (card) {
        const imgWrap = card.querySelector('.card-image-wrap');
        imgWrap.innerHTML = '';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => openLightbox(imageUrl));
        imgWrap.appendChild(img);
      }

      document.getElementById('uploadModal').classList.remove('active');
      cancelBtn.disabled = false;
      submitBtn.disabled = false;
      pendingFile = null;
      document.querySelector('.drop-inner').innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>Click or drag a photo here</p>
        <span id="coordsNote" class="coords-note"></span>
        `;
    } catch (err) {
      console.error(err);
      document.getElementById('progressLabel').textContent = 'Upload failed. Try again.';
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  document.getElementById('sightingCancel').addEventListener('click', () => {
    document.getElementById('sightingModal').classList.remove('active');
  });

  document.getElementById('sightingSubmit').addEventListener('click', async () => {
    const common = document.getElementById('sightingCommon').value.trim();
    if (!common) {
      document.getElementById('sightingCommon').focus();
      return;
    }
    const btn = document.getElementById('sightingSubmit');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await addSighting({
        commonName: common,
        scientificName: document.getElementById('sightingScientific').value.trim(),
        class: document.getElementById('sightingClass').value,
        notes: document.getElementById('sightingNotes').value.trim(),
        location: currentLocation
      });
      document.getElementById('sightingModal').classList.remove('active');
      window.location.reload();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Add sighting';
    }
  });

  ['passwordModal', 'uploadModal', 'sightingModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.id === id) document.getElementById(id).classList.remove('active');
    });
  });
}

async function handleFileSelected(file) {
  pendingFile = file;
  pendingCoords = null;

  const coords = await extractExifCoords(file);
  if (coords) {
    pendingCoords = coords;
    document.getElementById('coordsNote').textContent =
      `GPS found: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  } else {
    document.getElementById('coordsNote').textContent = 'No GPS data in photo';
  }

  document.getElementById('uploadSubmit').disabled = false;

  // Show a small thumbnail in the drop zone
  const reader = new FileReader();
  reader.onload = (e) => {
    document.querySelector('.drop-inner').innerHTML = `
      <img src="${e.target.result}" style="max-height:100px;max-width:100%;border-radius:2px;object-fit:contain;">
      <p style="margin-top:0.4rem">${file.name}</p>
      ${pendingCoords ? `<span class="coords-note">GPS: ${pendingCoords.lat.toFixed(4)}, ${pendingCoords.lng.toFixed(4)}</span>` : `<span class="coords-note" style="color:var(--text-tertiary)">No GPS in photo</span>`}
    `;
  };
  reader.readAsDataURL(file);
}

function setupLightbox() {
  const lb = document.createElement('div');
  lb.className = 'lightbox-overlay';
  lb.id = 'lightbox';
  lb.innerHTML = `<button class="lightbox-close" id="lightboxClose">✕</button><img id="lightboxImg" src="" alt="">`;
  document.body.appendChild(lb);

  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
}

function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('active');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}

function applyAuthVisibility() {
  document.querySelectorAll('.card--no-photo').forEach(card => {
    card.style.display = isUnlocked ? '' : 'none';
  });
  document.querySelectorAll('.add-sighting-row--gated').forEach(row => {
    row.style.display = isUnlocked ? '' : 'none';
  });
  document.querySelectorAll('.card-swap-btn').forEach(btn => {
    btn.style.display = isUnlocked ? '' : 'none';
  });
  const fab = document.getElementById('authFab');
  if (fab) fab.innerHTML = isUnlocked ? lockOpenIcon() : lockIcon();
}

function lockIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
}

function lockOpenIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
}

function setupAuthFab() {
  const fab = document.createElement('button');
  fab.id = 'authFab';
  fab.className = 'auth-fab';
  fab.title = 'Edit mode';
  fab.innerHTML = isUnlocked ? lockOpenIcon() : lockIcon();
  document.body.appendChild(fab);

  fab.addEventListener('click', () => {
    if (isUnlocked) {
      isUnlocked = false;
      localStorage.removeItem('wildlife_pw_unlocked');
      applyAuthVisibility();
      return;
    }

    if (localStorage.getItem('wildlife_pw_unlocked') === '1') {
      isUnlocked = true;
      applyAuthVisibility();
      return;
    }

    pendingDocId = '__fab__';
    document.getElementById('modalSpeciesName').textContent = 'Enter password to edit';
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').textContent = '';
    document.getElementById('passwordModal').classList.add('active');
  });
}

// async function setupNav() {
//   const hamburger = document.getElementById('hamburger');
//   const drawer = document.getElementById('navDrawer');
//   const overlay = document.getElementById('navOverlay');

//   hamburger.addEventListener('click', () => {
//     const open = drawer.classList.toggle('open');
//     hamburger.classList.toggle('open', open);
//     overlay.classList.toggle('active', open);
//   });

//   overlay.addEventListener('click', () => {
//     drawer.classList.remove('open');
//     hamburger.classList.remove('open');
//     overlay.classList.remove('active');
//   });

//   try {
//     const locations = await fetchLocations();
//     const navInner = document.querySelector('.nav-inner');
//     navInner.innerHTML = '<p class="nav-label">Locations</p>';

//     const currentSlug = window.location.pathname
//       .split('/').pop()
//       .replace('.html', '') || 'oregon';

//     locations.forEach(loc => {
//       const a = document.createElement('a');
//       const href = `${loc.slug}.html`;
//       a.href = href;
//       a.className = 'nav-link' + (loc.noCam ? ' nav-link--nocam' : '');
//       if (currentSlug === loc.slug || (currentSlug === 'index' && loc.slug === 'oregon')) {
//         a.classList.add('active');
//       }
//       a.textContent = loc.name;
//       navInner.appendChild(a);
//     });
//   } catch (err) {
//     console.error('Nav load failed:', err);
//   }
// }