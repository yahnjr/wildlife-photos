import { fetchSpecies, fetchSightings, addSighting } from './firebase-config.js';

let currentLocation = '';

export async function initNoCamPage(location) {
  currentLocation = location;
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-state">Loading species...</div>';

  try {
    const [species, sightings] = await Promise.all([
      fetchSpecies(location),
      fetchSightings(location)
    ]);

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
      if (list.length > 0 || cls === 'bird') {
        renderNoCamSection(classLabels[cls], list, app);
      }
    });

    // Unlisted sightings
    if (sightings.length > 0) {
      const block = document.createElement('div');
      block.className = 'section-block';
      block.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">Unlisted sightings</h2>
          <span class="section-count">${sightings.length} recorded</span>
        </div>
        <div class="sightings-card">
          ${sightings.map(s => `
            <div class="sighting-item">
              <div>
                <div class="sighting-name">${s.commonName}</div>
                ${s.scientificName ? `<div class="card-scientific">${s.scientificName}</div>` : ''}
              </div>
              <span class="sighting-meta">${s.class || ''}</span>
            </div>
          `).join('')}
        </div>
      `;
      app.appendChild(block);
    }

    // Always show add sighting at bottom
    const addRow = document.createElement('div');
    addRow.className = 'add-sighting-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-sighting';
    addBtn.textContent = '+ Add unlisted sighting';
    addBtn.addEventListener('click', () => openSightingModal());
    addRow.appendChild(addBtn);
    app.appendChild(addRow);

  } catch (err) {
    console.error(err);
    app.innerHTML = `<p class="loading-state">Error loading data. Check your Firebase config.</p>`;
  }

  setupNav();
  setupSightingModal();
}

function renderNoCamSection(title, speciesList, container) {
  const block = document.createElement('div');
  block.className = 'section-block';

  const count = speciesList.length;
  block.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${title}</h2>
      <span class="section-count">${count} species</span>
    </div>
  `;

  if (speciesList.length > 0) {
    const list = document.createElement('div');
    list.className = 'bird-list';
    speciesList.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'bird-list-item';
      item.innerHTML = `
        <span class="bird-list-num">${i + 1}</span>
        <div class="bird-list-names">
          <div class="bird-list-common">${s.commonName}</div>
          ${s.scientificName ? `<div class="bird-list-scientific">${s.scientificName}</div>` : ''}
        </div>
      `;
      list.appendChild(item);
    });
    block.appendChild(list);
  } else {
    block.innerHTML += `<p class="empty-state">No species listed yet.</p>`;
  }

  // Add sighting button per section
  const row = document.createElement('div');
  row.className = 'add-sighting-row';
  const btn = document.createElement('button');
  btn.className = 'btn-add-sighting';
  btn.textContent = '+ Add unlisted sighting';
  btn.addEventListener('click', () => openSightingModal());
  row.appendChild(btn);
  block.appendChild(row);

  container.appendChild(block);
}

function openSightingModal() {
  document.getElementById('sightingCommon').value = '';
  document.getElementById('sightingScientific').value = '';
  document.getElementById('sightingNotes').value = '';
  document.getElementById('sightingModal').classList.add('active');
}

function setupSightingModal() {
  document.getElementById('sightingCancel').addEventListener('click', () => {
    document.getElementById('sightingModal').classList.remove('active');
  });

  document.getElementById('sightingModal').addEventListener('click', (e) => {
    if (e.target.id === 'sightingModal') document.getElementById('sightingModal').classList.remove('active');
  });

  document.getElementById('sightingSubmit').addEventListener('click', async () => {
    const common = document.getElementById('sightingCommon').value.trim();
    if (!common) { document.getElementById('sightingCommon').focus(); return; }
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
}

function setupNav() {
  const hamburger = document.getElementById('hamburger');
  const drawer = document.getElementById('navDrawer');
  const overlay = document.getElementById('navOverlay');

  hamburger.addEventListener('click', () => {
    const open = drawer.classList.toggle('open');
    hamburger.classList.toggle('open', open);
    overlay.classList.toggle('active', open);
  });

  overlay.addEventListener('click', () => {
    drawer.classList.remove('open');
    hamburger.classList.remove('open');
    overlay.classList.remove('active');
  });
}