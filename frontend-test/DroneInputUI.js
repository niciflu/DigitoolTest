import { collectInputs } from './DroneInput.js';
import { wireKmlUI } from './modules/kml/kml.js';

export function renderDroneInputUI(containerId = 'inputContent') {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <label>Flughöhe [m AGL]*:
      <input id="hfgInput" type="number" step="1">
    </label><br>

    <label>Betriebsmodus:
      <select id="opType">
        <option value="VLOS">VLOS</option>
        <option value="BVLOS">BVLOS</option>
      </select>
    </label><br>

    <label>Drohnentyp:
      <select id="aircraftType">
        <option value="rotorcraft">Drehflügler</option>
        <option value="fixedwing">Starrflügler</option>
      </select>
    </label><br>

    <label>
      <input type="checkbox" id="prsEquipped"> Ausgestattet mit PRS
    </label><br>

    <label>Drohnengrösse [m]*:
      <input id="cdInput" type="number" step="0.1">
    </label><br>

    <label>Fluggeschwindigkeit [m/s]*:
      <input id="v0Input" type="number" step="0.1">
    </label><br>

    <label>Steigrate (ROC) [m/s]*:
      <input id="rocInput" type="number" step="0.1">
    </label><br>

    <label>Sinkrate (ROD) [m/s]*:
      <input id="rodInput" type="number" step="0.1">
    </label><br>

    <label>Windgeschwindigkeit [m/s]:
      <input id="windInput" type="number" step="0.1">
    </label><br>

    <button id="submitDroneInputs">Puffer berechnen</button>
    
    <!-- KML controls -->
    <div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
      <button id="kmlImportBtn">KML importieren</button>
      <button id="kmlExportBtn">KML exportieren</button>
    </div>
  `;

  // simple style helper (you were calling style(...) but hadn't defined it)
  const style = (color) => ({ color, weight: 1, opacity: 1, fillOpacity: 0.4 });

  document.getElementById('submitDroneInputs')?.addEventListener('click', async () => {
    const input = collectInputs();
    if (!input) return;

    const fg = window.getFG?.();
    if (!fg || !fg.features || !fg.features.length) {
      alert("Please draw the Flight Geography (polygon/line/area) on the map first.");
      return;
    }

    // Clear previous results UI and buffer layers before new calculation
    el.querySelectorAll('.resultsPanel').forEach(n => n.remove());
    window.clearCalculatedBuffers?.();

    try {
      const res = await fetch('https://digitooltest-backend.onrender.com/api/grb/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fg, params: input })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Backend error (${res.status}): ${txt}`);
      }

      const data = await res.json();
      console.debug('[GRB] response:', data);

      const meta = data?.meta ?? {};
      // Store last inputs & results globally for KML export
      window.DigitoolState = window.DigitoolState || {};
      window.DigitoolState.lastInputs = {
        hfg:        meta?.inputs?.hfg,
        opType:     meta?.inputs?.opType,
        aircraftType: meta?.inputs?.aircraftType,
        prsEquipped:  meta?.inputs?.prsEquipped,
        cd:         meta?.inputs?.cd,
        v0:         meta?.inputs?.v0,
        roc:        meta?.inputs?.roc,
        rod:        meta?.inputs?.rod,
        wind:       meta?.inputs?.wind
      };
      window.DigitoolState.lastResults = {
        scv:  meta?.scv_m,
        hcv:  meta?.hcv_m,
        grb:  meta?.grb_m,
        ah:   meta?.ah_m,
        decon: meta?.sd_m,
        hdeco:  meta?.hd_m,   // only set if BVLOS; may be null
        aa:   meta?.aa_m
      };

      const layers = data?.layers ?? {};

      const fmt = (x, digits = 1) => Number.isFinite(x) ? x.toFixed(digits) : '—';

      const scv_m = Number.isFinite(meta.scv_m) ? meta.scv_m : null;
      const hcv_m = Number.isFinite(meta.hcv_m) ? meta.hcv_m : null;
      const grb_m = Number.isFinite(meta.grb_m) ? meta.grb_m : null;
      const sd_m  = Number.isFinite(meta.sd_m)  ? meta.sd_m  : null;
      const hd_m  = Number.isFinite(meta.hd_m)  ? meta.hd_m  : null; // only set if BVLOS; may be null
      const aa_m  = Number.isFinite(meta.aa_m)  ? meta.aa_m  : null;
      const ah_m = Number.isFinite(meta.ah_m) ? meta.ah_m : null;

      const targetGroup = window._bufferGroup || map;
      
      window.clearRegisteredBuffers?.(); // NEW: reset the registry before adding

      const makeLayer = (gj) => gj ? L.geoJSON(gj, { style: f => f.properties.style }) : null;
      const add = (key, gj) => {
        const ly = makeLayer(gj);
        if (!ly) return null;
        window.registerBufferLayer?.(key, ly);
        ly.addTo(targetGroup);
        return ly;
      };

      // Keep stable keys in sync with the Results chips below
      add('scv',                 layers.ca);
      add('grb',                 layers.grb);
      add('detection_area',      layers.detection_area);
      add('detection_height',    layers.detection_height);
      add('adjacent_area',       layers.adjacent_area);
      add('assemblies_horizon',  layers.assemblies_horizon);

      const panelHtml = `
        <div class="resultsPanel">
          <h4>Berechnete Puffer</h4>

          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-scv" data-key="scv" title="Ein-/Ausblenden"></span>Scv</div>
            <div class="metricValue">${fmt(scv_m)} m</div>
          </div>

          ${hcv_m !== null ? `
          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-scv"></span>Hcv</div>
            <div class="metricValue">${fmt(hcv_m)} m</div>
          </div>` : ''}

          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-grb" data-key="grb" title="Ein-/Ausblenden"></span>GRB</div>
            <div class="metricValue">${fmt(grb_m)} m</div>
          </div>

          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-ah" data-key="assemblies_horizon" title="Ein-/Ausblenden"></span>Sah</div>
            <div class="metricValue">${fmt(ah_m)} m</div>
          </div>

          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-sd" data-key="detection_area" title="Ein-/Ausblenden"></span>Sdeco</div>
            <div class="metricValue">${fmt(sd_m)} m</div>
          </div>

          ${hd_m !== null ? `
          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-hd"></span>Hdeco</div>
            <div class="metricValue">${fmt(hd_m)} m</div>
          </div>` : ''}

          <div class="metricRow">
            <div class="metricLabel"><span class="chip chip-aa" data-key="adjacent_area" title="Ein-/Ausblenden"></span>Saa</div>
            <div class="metricValue">${fmt(aa_m, 0)} m</div>
          </div>
        </div>
      `;

      el.insertAdjacentHTML('beforeend', panelHtml);

      
      const panel = document.getElementById('digitool-results') || el.querySelector('.resultsPanel');
      panel?.addEventListener('click', (evt) => {
        const chip = evt.target.closest('.chip');
        if (!chip) return;

        // Only chips with data-key should toggle (HCV/Hdeco have none)
        const key = chip.dataset.key;
        if (!key) return;

        window.toggleBuffer?.(key);

        // Update visual state
        const layer = window.BufferLayers?.[key];
        const isShown = layer && window._bufferGroup?.hasLayer(layer);
        chip.classList.toggle('off', !isShown);
      });  

    } 
    
    catch (e) {
    console.error(e);
    alert(`Request failed: ${e.message}`);
    
  }
  });

  wireKmlUI({ exportScopeSelectId: 'kmlScope' }); // will look for #kmlImportBtn and #kmlExportBtn we added above

}


// === KML → UI helpers ===
function prefillInputsFromKml(params = {}) {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el != null && v != null) el.value = String(v); };
  const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

  setVal('hfgInput', params.hfg);
  setVal('cdInput',  params.cd);
  setVal('v0Input',  params.v0);
  setVal('rocInput', params.roc);
  setVal('rodInput', params.rod);
  setVal('windInput', params.wind);

  const opSel = document.getElementById('opType'); if (opSel && params.opType) opSel.value = params.opType;
  const acSel = document.getElementById('aircraftType'); if (acSel && params.aircraftType) acSel.value = params.aircraftType;
  setCheck('prsEquipped', params.prsEquipped);
}

function renderResultsPanelFromKml(results = {}) {
  const el = document.getElementById('inputContent');
  if (!el) return;
  el.querySelectorAll('.resultsPanel').forEach(n => n.remove());

  const fmt = (x, d=1) => (Number.isFinite(x) ? Number(x).toFixed(d) : '—');

  const panelHtml = `
    <div class="resultsPanel">
      <h4>Berechnete Puffer (aus KML)</h4>
      <div class="metricRow"><div class="metricLabel"><span class="chip chip-scv"></span>Scv</div><div class="metricValue">${fmt(results.scv)} m</div></div>
      ${Number.isFinite(results.hcv) ? `<div class="metricRow"><div class="metricLabel"><span class="chip chip-scv"></span>Hcv</div><div class="metricValue">${fmt(results.hcv)} m</div></div>` : ''}
      <div class="metricRow"><div class="metricLabel"><span class="chip chip-grb"></span>GRB</div><div class="metricValue">${fmt(results.grb)} m</div></div>
      <div class="metricRow"><div class="metricLabel"><span class="chip chip-ah"></span>Sah</div><div class="metricValue">${fmt(results.ah)} m</div></div>
      <div class="metricRow"><div class="metricLabel"><span class="chip chip-sd"></span>Sdeco</div><div class="metricValue">${fmt(results.decon)} m</div></div>
      ${Number.isFinite(results.hdeco) ? `<div class="metricRow"><div class="metricLabel"><span class="chip chip-hd"></span>Hdeco</div><div class="metricValue">${fmt(results.hdeco)} m</div></div>` : ''}
      <div class="metricRow"><div class="metricLabel"><span class="chip chip-aa"></span>Saa</div><div class="metricValue">${fmt(results.aa, 0)} m</div></div>
    </div>`;
  el.insertAdjacentHTML('beforeend', panelHtml);
}

// Global hook for the importer:
window.onKmlImportedMeta = (params, results) => {
  try {
    prefillInputsFromKml(params || {});
    renderResultsPanelFromKml(results || {});
    // keep state for future exports
    window.DigitoolState = window.DigitoolState || {};
    window.DigitoolState.lastInputs  = params  || null;
    window.DigitoolState.lastResults = results || null;
  } catch (e) { console.error('Failed to apply imported meta', e); }
};

