function bindOverlayControl(toggleId, sliderId, key) {
  const layer = window.overlays[key];
  const toggle = document.getElementById(toggleId);
  const slider = document.getElementById(sliderId);

  if (toggle) {
    toggle.onchange = (e) =>
      e.target.checked ? layer.addTo(window.map) : window.map.removeLayer(layer);
  }
  if (slider && layer.setOpacity) {
    slider.oninput = (e) => layer.setOpacity(parseFloat(e.target.value));
  }
}

function setupOverlayBindings() {
  bindOverlayControl('icaoToggle',    'icaoOpacity',    'ICAO Karte');
  bindOverlayControl('obstacleToggle','obstacleOpacity','Luftfahrthindernisse');
  bindOverlayControl('droneToggle',   'droneOpacity',   'Einschränkungen für Drohnen');
  bindOverlayControl('soraToggle',    'soraOpacity',    'SORA Bodenrisiko');
  bindOverlayControl('spitalToggle',  null,             'Spitallandeplätze');
  bindOverlayControl('gebirgsToggle', null,             'Gebirgslandeplätze');
}

// If overlays are already published, bind immediately; otherwise wait for the event from map.js
if (window.overlays && window.map) {
  setupOverlayBindings();
} else {
  window.addEventListener('digitool:mapReady', setupOverlayBindings, { once: true });
}

const toolsToggle = document.getElementById('toolsToggle');
const mapTools = document.getElementById('mapTools');

toolsToggle?.addEventListener('click', () => {
  mapTools.classList.toggle('collapsed');
  toolsToggle.textContent = mapTools.classList.contains('collapsed') ? '▲ Tools' : '▼ Tools';
});

// --- Address Search (simple) ---
const addrInput = document.getElementById('addrInput');
const addrResults = document.getElementById('addrResults');

let addrTimer = null;

async function searchAddress(q) {
  // GeoAdmin SearchServer: type=locations keeps results clean for places/addresses
  const url = `https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=${encodeURIComponent(q)}&type=locations`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  // Map to label + LV95 coords (x=E, y=N). We'll convert to WGS84 via a simple formula if needed later.
  return (data.results || []).slice(0, 8).map(r => ({
    label: r.attrs.label,
    lon: r.attrs.lon, // WGS84 lon/lat are available in the response
    lat: r.attrs.lat
  }));
}

function clearResults() {
  addrResults.innerHTML = '';
  addrResults.style.display = 'none';
}

function showResults(items) {
  if (!items.length) { clearResults(); return; }
  addrResults.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'result';
    div.innerHTML = item.label;
    div.onclick = () => {
      clearResults();
      // center & mark using helper on window from map.js
      window.flyToAndMark(item.lat, item.lon, item.label);
      addrInput.value = item.label;
    };
    addrResults.appendChild(div);
  });
  addrResults.style.display = 'block';
}

addrInput?.addEventListener('input', () => {
  const q = addrInput.value.trim();
  clearTimeout(addrTimer);
  if (q.length < 3) { clearResults(); return; }
  addrTimer = setTimeout(async () => {
    try {
      const items = await searchAddress(q);
      showResults(items);
    } catch (e) {
      console.error('address search failed', e);
      clearResults();
    }
  }, 250); // debounce
});

// Hide dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!document.getElementById('searchBox')?.contains(e.target)) clearResults();
});

// ui.js

// Add to your export dialog:
//  - radio name="kmlInclude": values "all" (default), "fg", "buffers"
//  - checkbox id="kmlPreserveStyles" (checked)
//  - checkbox id="kmlFlatten" (optional)

export function getKmlExportOptionsFromUI() {
  const include = (document.querySelector('input[name="kmlInclude"]:checked')?.value) || 'all';
  const preserveStyles = !!document.getElementById('kmlPreserveStyles')?.checked;
  const flatten = !!document.getElementById('kmlFlatten')?.checked;
  return { include, preserveStyles, flatten };
}