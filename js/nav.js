import { fetchLocations } from './firebase-config.js';

export async function setupNav() {
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

  try {
    const locations = await fetchLocations();
    const navInner = document.querySelector('.nav-inner');
    navInner.innerHTML = '<p class="nav-label">Locations</p>';

    const currentSlug = window.location.pathname
      .split('/').pop()
      .replace('.html', '') || 'oregon';

    const a = document.createElement('a');
    a.href = `index.html`;
    a.className = 'nav-link';
    a.textContent = 'Map';
    if (currentSlug === 'index') {
      a.classList.add('active');
    }
    navInner.appendChild(a);
    
    const b = document.createElement('a');
    b.href = `species-search.html`;
    b.className = 'nav-link';
    b.textContent = 'Species Search';
    b.target = '_blank';
    if (currentSlug === 'species-search') {
      b.classList.add('active');
    }
    navInner.appendChild(b);
    
    locations.forEach(loc => {
      const a = document.createElement('a');
      a.href = `${loc.slug}.html`;
      a.className = 'nav-link' + (loc.noCam ? ' nav-link--nocam' : '');
      if (currentSlug === loc.slug || (currentSlug === 'index' && loc.slug === 'oregon')) {
        a.classList.add('active');
      }
      a.textContent = loc.name;
      navInner.appendChild(a);
    });

    const c = document.createElement('a');
    c.href = `https://www.inaturalist.org/observations?place_id=any&user_id=ian728&verifiable=any`;
    c.className = 'nav-link';
    c.textContent = 'iNaturalist Profile';
    navInner.appendChild(c);
  } catch (err) {
    console.error('Nav load failed:', err);
  }
}