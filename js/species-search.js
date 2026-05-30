require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/core/reactiveUtils"
], function(Map, MapView, FeatureLayer, reactiveUtils) {
  const { setupNav } = import('./nav.js');

  const SERVICE_URL = "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/iNat_PreUC_View/FeatureServer/0";

  const TAXON_COLORS = {
    Aves:     "#2688F2",
    Mammalia: "#EB7F0E",
    Reptilia: "#35C440",
    Amphibia: "#932DEE",
    Insecta:  "#c8a010",
    Mollusca: "#e05090"
  };

  const TAXON_LABELS = {
    Aves: "Birds", Mammalia: "Mammals", Reptilia: "Reptiles",
    Amphibia: "Amphibians", Insecta: "Insects", Mollusca: "Mollusca"
  };

  // Relevant fields
  const OUT_FIELDS = [
    "common_name",
    "scientific_name",
    "taxon_category_name",
    "observed_on",
    "observed_on_year",
    "image_url"
  ];

  let activeTaxon = "Aves";
  let activeSpeciesFilter = null;
  let debounceTimer = null;
  let lastExtentKey = "";

  function buildWhere(taxon, speciesFilter) {
    let expr = `(observed_on_year = 2026 OR observed_on_year = 2025) AND taxon_category_name = '${taxon}'`;
    if (speciesFilter) {
      expr += ` AND scientific_name = '${speciesFilter.replace(/'/g, "''")}'`;
    }
    return expr;
  }

  function applySpeciesFilter(scientific, common) {
    activeSpeciesFilter = scientific || null;
    const bar  = document.getElementById("speciesFilterBar");
    const name = document.getElementById("speciesFilterName");
    if (activeSpeciesFilter) {
      name.textContent = scientific || common;
      bar.classList.add("visible");
    } else {
      bar.classList.remove("visible");
    }
    layer.definitionExpression = buildWhere(activeTaxon, activeSpeciesFilter);
    layer.refresh();
    lastExtentKey = "";
    scheduleUpdate();
  }

  function makeRenderer(taxon) {
    return {
      type: "simple",
      symbol: {
        type: "simple-marker",
        style: "circle",
        size: 7,
        color: TAXON_COLORS[taxon],
        outline: { color: "rgba(0,0,0,0.45)", width: 0.8 }
      }
    };
  }

  const layer = new FeatureLayer({
    url: SERVICE_URL,
    definitionExpression: buildWhere(activeTaxon),
    outFields: OUT_FIELDS,
    renderer: makeRenderer(activeTaxon),
    popupTemplate: {
      title: "{common_name}",
      content: [
        {
          type: "media",
          mediaInfos: [{
            type: "image",
            value: { sourceURL: "{image_url}" }
          }]
        },
        {
          type: "fields",
          fieldInfos: [
            { fieldName: "common_name",         label: "Common name" },
            { fieldName: "scientific_name",     label: "Scientific name" },
            { fieldName: "taxon_category_name", label: "Category" },
            { fieldName: "observed_on",         label: "Observed" }
          ]
        }
      ]

    }
  });

  // Map & View
  const map = new Map({ basemap: "dark-gray-vector", layers: [layer] });

  const view = new MapView({
    container: "viewDiv",
    map,
    center: [-122.8, 45.5],
    zoom: 12,
    ui: { components: ["zoom", "attribution"] }
  });

  view.ui.move("zoom", "bottom-left");

  // Taxon buttons
  document.getElementById("taxonFilters").addEventListener("click", e => {
    const btn = e.target.closest(".taxon-btn");
    if (!btn || btn.classList.contains("active")) return;
    document.querySelectorAll(".taxon-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeTaxon = btn.dataset.taxon;
    // Clear any active species filter when switching taxon
    activeSpeciesFilter = null;
    document.getElementById("speciesFilterBar").classList.remove("visible");
    layer.definitionExpression = buildWhere(activeTaxon, null);
    layer.renderer = makeRenderer(activeTaxon);
    layer.refresh();
    lastExtentKey = "";
    scheduleUpdate();
  });

  // List update
  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateList, 650);
  }

  async function updateList() {
    if (!view.extent) return;

    const ext = view.extent;
    const key = `${activeTaxon}|${ext.xmin.toFixed(2)}|${ext.ymin.toFixed(2)}|${ext.xmax.toFixed(2)}|${ext.ymax.toFixed(2)}`;
    if (key === lastExtentKey) return;
    lastExtentKey = key;

    const panelBody  = document.getElementById("panelBody");
    const countBar   = document.getElementById("countBar");
    const countLabel = document.getElementById("countLabel");
    const zoomHint   = document.getElementById("zoomHint");

    panelBody.innerHTML = `<div class="panel-loading"><div class="spinner"></div> Querying…</div>`;
    countBar.style.display = "none";

    // Count in extent
    const countQ = layer.createQuery();
    countQ.geometry = ext;
    countQ.spatialRelationship = "intersects";
    countQ.where = buildWhere(activeTaxon, activeSpeciesFilter);
    countQ.returnCountOnly = true;

    let total;
    try {
      total = await layer.queryFeatureCount(countQ);
    } catch(e) {
      panelBody.innerHTML = `<div class="panel-status">Could not reach the feature service.</div>`;
      return;
    }

    const label = TAXON_LABELS[activeTaxon].toLowerCase();
    countBar.style.display = "flex";
    countLabel.textContent = `${total.toLocaleString()} ${label} observation${total !== 1 ? "s" : ""} in view`;

    if (total === 0) {
      panelBody.innerHTML = `<div class="panel-status">No ${label} observations here for 2026.</div>`;
      return;
    }

    if (total > 100) {
      zoomHint.classList.add("visible");
      setTimeout(() => zoomHint.classList.remove("visible"), 2800);
      panelBody.innerHTML = `<div class="panel-status">${total.toLocaleString()} observations visible —<br>zoom in to see individual species.</div>`;
      return;
    }

    zoomHint.classList.remove("visible");

    // Fetch up to 200 records, pick image_url per species
    const dataQ = layer.createQuery();
    dataQ.geometry = ext;
    dataQ.spatialRelationship = "intersects";
    dataQ.where = buildWhere(activeTaxon, activeSpeciesFilter);
    dataQ.outFields = OUT_FIELDS;
    dataQ.returnGeometry = false;
    dataQ.num = 200;

    let result;
    try {
      result = await layer.queryFeatures(dataQ);
    } catch(e) {
      panelBody.innerHTML = `<div class="panel-status">Error loading species data.</div>`;
      return;
    }

    const grouped = {};
    result.features.forEach(f => {
      const a = f.attributes;
      const sciKey = a.scientific_name || a.common_name || "Unknown";
      if (!grouped[sciKey]) {
        grouped[sciKey] = {
          common:     a.common_name     || "Unknown",
          scientific: a.scientific_name || "",
          imageUrl:   null,
          count: 0
        };
      }
      grouped[sciKey].count++;
      if (!grouped[sciKey].imageUrl && a.image_url) {
        grouped[sciKey].imageUrl = a.image_url;
      }
    });

    const sorted = Object.values(grouped)
      .sort((a, b) => a.common.localeCompare(b.common));

    const color = TAXON_COLORS[activeTaxon];

    const ul = document.createElement("ul");
    ul.className = "species-list";

    sorted.forEach(sp => {
      const li = document.createElement("li");
      li.className = "species-item";

      // Thumbnail cell
      const thumb = document.createElement("div");
      thumb.className = "species-thumb";
      thumb.style.setProperty("--dot-color", color);

      const dot = document.createElement("div");
      dot.className = "species-thumb__dot";
      thumb.appendChild(dot);

      if (sp.imageUrl) {
        const img = document.createElement("img");
        img.alt = sp.common;
        img.dataset.src = sp.imageUrl; // lazy-loaded below
        img.addEventListener("load",  () => img.classList.add("loaded"));
        img.addEventListener("error", () => img.remove());
        thumb.appendChild(img);
      }

      // Text cell
      const info = document.createElement("div");
      info.className = "species-item__info";
      info.innerHTML = `
        <div class="species-item__common">${sp.common}</div>
        <div class="species-item__sci">${sp.scientific}</div>
      `;

      // Count badge
      const cnt = document.createElement("div");
      cnt.className = "species-item__count";
      cnt.textContent = sp.count;

      li.appendChild(thumb);
      li.appendChild(info);
      li.appendChild(cnt);

      // Apply species filter to map
      li.addEventListener("click", () => {
        applySpeciesFilter(sp.scientific, sp.common);
      });

      ul.appendChild(li);
    });

    panelBody.innerHTML = "";
    panelBody.appendChild(ul);

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          io.unobserve(img);
        }
      });
    }, { root: panelBody, rootMargin: "80px" });

    ul.querySelectorAll("img[data-src]").forEach(img => io.observe(img));
  }

  reactiveUtils.watch(
    () => view.stationary,
    stationary => { if (stationary) scheduleUpdate(); }
  );

  view.when(() => {
    scheduleUpdate();
    // setupNav();
  });

  // Species filter clear button
  document.getElementById("speciesFilterClear").addEventListener("click", () => {
    applySpeciesFilter(null, null);
  });
});