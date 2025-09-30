// frontend/modules/kml/kml.js
// Small, UI-agnostic KML module that you can reuse later in other views

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Convert our Leaflet-style object (properties.style) into "simplestyle" keys
function applySimpleStyleToFeature(f) {
  const s = f?.properties?.style;
  if (!s) return;
  const p = f.properties;

  // stroke
  if (s.color) p['stroke'] = s.color;
  if (typeof s.weight === 'number') p['stroke-width'] = s.weight;
  if (typeof s.opacity === 'number') p['stroke-opacity'] = s.opacity;

  // fill: ensure a color is present if we set opacity (tokml needs both)
  // default fill color falls back to stroke to avoid white default
  const hasFillOpacity = typeof s.fillOpacity === 'number';
  const fillColor = s.fillColor || s.color; // <— change is here
  if (fillColor) p['fill'] = fillColor;
  if (hasFillOpacity) p['fill-opacity'] = s.fillOpacity;
}

// helper to append params and results to kml.
function attachDigitoolMetaToFeatures(features) {
  const params  = window.DigitoolState?.lastInputs || null;
  const results = window.DigitoolState?.lastResults || null;
  const app = 'Digitool';
  const ver = window.APP_VERSION || 'dev';
  if (!params && !results) return;
  for (const f of features) {
    const p = (f.properties = f.properties || {});
    if (params)  p['digitool:params']  = JSON.stringify(params);
    if (results) p['digitool:results'] = JSON.stringify(results);

    p['digitool:app']     = app;          // e.g., "Digitool"
    p['digitool:version'] = `v${ver}`;    // e.g., "v0.7.0"
  }
}

// Export helpers
function exportDrawnAsKml(filename = 'flight_geography.kml') {
  const gj = window.getFG?.();
  if (!gj || !gj.features || !gj.features.length) {
    alert('Es gibt keine gezeichneten Geometrien zum Exportieren.');
    return;
  }
  if (!window.tokml) {
    alert('tokml library nicht geladen.');
    return;
  }
   // Deep clone and flatten styles to simplestyle
  const styled = JSON.parse(JSON.stringify(gj));
  attachDigitoolMetaToFeatures(styled.features);    // <<< INSERT HERE (line ~40)
  styled.features.forEach(applySimpleStyleToFeature);
  const kml = window.tokml(styled, { name: 'name', simplestyle: true });
  download(filename, kml);
}

function exportBuffersAsKml(filename = 'calculated_buffers.kml') {
  const gj = window.getCalculatedBuffers?.();
  const fg = window.getFG?.();

  if (!gj || !gj.features || !gj.features.length) {
    alert('Keine berechneten Puffer zum Exportieren.');
    return;
  }
  if (!window.tokml) {
    alert('tokml library nicht geladen.');
    return;
  }

  const merged = {type: 'FeatureCollection', features: [
      ...(fg?.features || []),
      ...(gj?.features || [])
    ]
  };

  const styled = JSON.parse(JSON.stringify(merged));
  attachDigitoolMetaToFeatures(styled.features);    // <<< INSERT HERE (line ~75)
  styled.features.forEach(applySimpleStyleToFeature);
  const kml = window.tokml(styled, { name: 'name', simplestyle: true });
  download(filename, kml);
}

// Import helper
async function importKmlIntoDrawn(file) {
  if (!file) return;
  if (!window.toGeoJSON) {
    alert('togeojson library nicht geladen.');
    return;
  }
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  const gj = window.toGeoJSON.kml(dom);
  if (!gj || !gj.features || !gj.features.length) {
    alert('KML enthält keine erkennbaren Geometrien.');
    return;
  }
  window.addGeoJSONToDrawn?.(gj);
}

// Wire buttons (complete rewrite)
// Wire buttons (updated with export choice)
// Wire buttons (popup with two checkboxes behaving like radios)
export function wireKmlUI({
  importBtnId = 'kmlImportBtn',
  exportBtnId = 'kmlExportBtn',
  filenames = { fg: 'digitool_fg.kml', buffers: 'digitool_buffers.kml' }
} = {}) {
  const importBtn = document.getElementById(importBtnId);
  const exportBtn = document.getElementById(exportBtnId);

  // --- one-time lightweight styles for the modal ---
  (function injectStylesOnce() {
    if (document.getElementById('kml-modal-styles')) return;
    const s = document.createElement('style');
    s.id = 'kml-modal-styles';
    s.textContent = `
      .kml-modal-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,.35);
        display: flex; align-items: center; justify-content: center; z-index: 99999;
      }
      .kml-modal {
        background: #fff; border-radius: 10px; padding: 14px; width: 320px;
        box-shadow: 0 10px 30px rgba(0,0,0,.25); font-family: Montserrat, sans-serif;
      }
      .kml-modal h3 { margin: 0 0 8px 0; font-size: 16px; color: #0b1b3a; }
      .kml-row { display:flex; align-items:center; gap:8px; margin: 8px 0; }
      .kml-actions { display:flex; gap:8px; justify-content:flex-end; margin-top: 12px; }
      .kml-btn {
        padding: 8px 10px; border-radius: 6px; border: 0; cursor: pointer; font-weight: 600;
      }
      .kml-btn.primary { background:#004080; color:#fff; }
      .kml-btn.ghost { background:#edf2f7; color:#1a202c; }
      .kml-help { font-size:12px; color:#4a5568; margin-top:4px; }
    `;
    document.head.appendChild(s);
  })();

  function openExportPopup() {
    const last = localStorage.getItem('digitool.kml.scope') || 'fg';

    const backdrop = document.createElement('div');
    backdrop.className = 'kml-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'kml-modal';
    modal.innerHTML = `
      <h3>KML exportieren</h3>
      <div class="kml-row">
        <input type="checkbox" id="kmlChoiceFg">
        <label for="kmlChoiceFg">Nur Flight Geography (FG)</label>
      </div>
      <div class="kml-row">
        <input type="checkbox" id="kmlChoiceBuffers">
        <label for="kmlChoiceBuffers">Mit berechneten Puffern</label>
      </div>
      <div class="kml-help">Wählen Sie genau eine Option.</div>
      <div class="kml-actions">
        <button class="kml-btn ghost" id="kmlCancel">Abbrechen</button>
        <button class="kml-btn primary" id="kmlConfirm">Export</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const fgBox = modal.querySelector('#kmlChoiceFg');
    const bufBox = modal.querySelector('#kmlChoiceBuffers');
    const cancelBtn = modal.querySelector('#kmlCancel');
    const confirmBtn = modal.querySelector('#kmlConfirm');

    // restore last choice
    if (last === 'buffers') { bufBox.checked = true; fgBox.checked = false; }
    else { fgBox.checked = true; bufBox.checked = false; }

    // make them behave like radios
    const sync = (scope) => {
      if (scope === 'buffers') { bufBox.checked = true; fgBox.checked = false; }
      else { fgBox.checked = true; bufBox.checked = false; }
    };
    fgBox.addEventListener('change', () => sync('fg'));
    bufBox.addEventListener('change', () => sync('buffers'));

    function close() { backdrop.remove(); }

    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    confirmBtn.addEventListener('click', () => {
      if (!window.tokml) { alert('tokml library nicht geladen.'); return; }

      const scope = bufBox.checked ? 'buffers' : 'fg';
      localStorage.setItem('digitool.kml.scope', scope);

      if (scope === 'buffers') {
        exportBuffersAsKml(filenames.buffers || 'digitool_buffers.kml');
      } else {
        exportDrawnAsKml(filenames.fg || 'digitool_fg.kml');
      }
      close();
    });
  }

  // IMPORT
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      if (!window.toGeoJSON) { alert('togeojson library nicht geladen.'); return; }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kml,application/vnd.google-earth.kml+xml,application/xml,text/xml';
      input.onchange = () => importKmlIntoDrawn(input.files?.[0]);
      input.click();
    });
  }

  // EXPORT (opens popup)
  if (exportBtn) {
    exportBtn.addEventListener('click', openExportPopup);
  }
}


// --- Helpers to read/write ExtendedData ------------------------------------

export function setDigitoolMeta(placemarkEl, meta = {}) {
  const doc = placemarkEl.ownerDocument;
  let ext = placemarkEl.querySelector('ExtendedData');
  if (!ext) {
    ext = doc.createElement('ExtendedData');
    placemarkEl.appendChild(ext);
  }
  const setData = (name, value) => {
    let data = Array.from(ext.querySelectorAll('Data')).find(d => d.getAttribute('name') === name);
    if (!data) {
      data = doc.createElement('Data');
      data.setAttribute('name', name);
      ext.appendChild(data);
      const v = doc.createElement('value');
      data.appendChild(v);
    }
    data.querySelector('value').textContent = value;
  };
  if (meta.layerType) setData('digitool:layerType', meta.layerType);
  if (meta.grbVersion) setData('digitool:grbVersion', meta.grbVersion);
  if (meta.params) setData('digitool:params', JSON.stringify(meta.params));
  if (meta.results) setData('digitool:results', JSON.stringify(meta.results));
}

export function getDigitoolMeta(placemarkEl) {
  const q = (name) => {
    const el = Array.from(placemarkEl.querySelectorAll('ExtendedData Data'))
      .find(d => d.getAttribute('name') === name);
    return el ? el.querySelector('value')?.textContent ?? null : null;
  };
  const meta = {
    layerType: q('digitool:layerType'),
    grbVersion: q('digitool:grbVersion'),
    params: null
  };
  const paramsRaw = q('digitool:params');
  if (paramsRaw) {
    try { meta.params = JSON.parse(paramsRaw); } catch { meta.params = paramsRaw; }
  }

   const resultsRaw = q('digitool:results');
  if (resultsRaw) {
    try { meta.params = meta.params; } catch {}
    try { meta.results = JSON.parse(resultsRaw); } catch { meta.results = resultsRaw; }
  }

  return meta;
}

// --- Style defaults (only used if missing) ----------------------------------

export const DIGITOOL_STYLE_IDS = {
  FG: '#FGPolygon',
  AssembliesHorizon: '#AssembliesHorizon',
  AdjacentArea: '#AdjacentArea'
};

export function ensureDefaultStyles(kmlDoc) {
  const doc = kmlDoc;
  const ensure = (id, color, width, fill) => {
    if (doc.querySelector(`Style[id="${id.substring(1)}"]`)) return;
    const style = doc.createElement('Style');
    style.setAttribute('id', id.substring(1));
    const line = doc.createElement('LineStyle');
    const poly = doc.createElement('PolyStyle');
    const lc = doc.createElement('color');
    const lw = doc.createElement('width');
    const pc = doc.createElement('color');

    // KML color is aabbggrr (hex, alpha first). Example: 80FF0000 = 50% blue? (Careful!)
    lc.textContent = color.line;   // e.g., 'ff0000ff'
    lw.textContent = String(width); // e.g., 2
    pc.textContent = color.poly;   // e.g., '7f0000ff'

    line.appendChild(lc); line.appendChild(lw);
    poly.appendChild(pc);
    if (fill === false) {
      const fillEl = doc.createElement('fill');
      fillEl.textContent = '0';
      poly.appendChild(fillEl);
    }

    style.appendChild(line);
    style.appendChild(poly);
    doc.documentElement.querySelector('Document')?.appendChild(style);
  };

  ensure(DIGITOOL_STYLE_IDS.FG,               { line: 'ff0000ff', poly: '4d0000ff' }, 2, true);
  ensure(DIGITOOL_STYLE_IDS.AssembliesHorizon,{ line: 'ff00ff00', poly: '4d00ff00' }, 2, true);
  ensure(DIGITOOL_STYLE_IDS.AdjacentArea,    { line: 'ffffa500', poly: '4dffa500' }, 2, true);
}

// --- Export -----------------------------------------------------------------

/**
 * features: array of your internal features
 *   { geometry: <GeoJSON-like or raw KML>, name, meta: {layerType, grbVersion, params}, styleUrl? }
 * options: { include: 'all'|'fg'|'buffers', preserveStyles: true|false, flatten: true|false }
 */
export function exportKML(features, options) {
  const { include = 'all', preserveStyles = true, flatten = false } = options || {};
  const doc = document.implementation.createDocument('', 'kml', null);
  const kml = doc.documentElement;
  kml.setAttribute('xmlns', 'http://www.opengis.net/kml/2.2');

  const documentEl = doc.createElement('Document');
  kml.appendChild(documentEl);

  // Ensure default styles exist (they only apply to unstyled features)
  ensureDefaultStyles(doc);

  const makeFolder = (name) => {
    const f = doc.createElement('Folder');
    const n = doc.createElement('name'); n.textContent = name;
    f.appendChild(n);
    return f;
  };

  const fgFolder  = flatten ? documentEl : documentEl.appendChild(makeFolder('Flight Geometry (FG)'));
  const bufFolder = flatten ? documentEl : documentEl.appendChild(makeFolder('Buffers'));

  const want = (metaLT) => {
    if (include === 'all') return true;
    if (include === 'fg') return metaLT === 'FG';
    if (include === 'buffers') return metaLT === 'AssembliesHorizon' || metaLT === 'AdjacentArea';
    return true;
  };

  for (const f of features) {
    const { name, meta, geometry, styleUrl } = f;
    if (!meta?.layerType || !want(meta.layerType)) continue;

    const placemark = doc.createElement('Placemark');
    if (name) {
      const nm = doc.createElement('name'); nm.textContent = name;
      placemark.appendChild(nm);
    }

    // Style logic
    if (preserveStyles && styleUrl) {
      const su = doc.createElement('styleUrl'); su.textContent = styleUrl;
      placemark.appendChild(su);
    } else if (!styleUrl) {
      const su = doc.createElement('styleUrl');
      const sid = DIGITOOL_STYLE_IDS[meta.layerType] || DIGITOOL_STYLE_IDS.FG;
      su.textContent = sid;
      placemark.appendChild(su);
    }

    // Metadata
    setDigitoolMeta(placemark, meta);

    // Geometry (assuming you already have a function that converts your geometry to KML)
    const geomEl = geometryToKml(doc, geometry); // implement or reuse your converter
    placemark.appendChild(geomEl);

    // Folder routing
    if (meta.layerType === 'FG') {
      fgFolder.appendChild(placemark);
    } else {
      bufFolder.appendChild(placemark);
    }
  }

  // If flattened, we didn't create folders; otherwise they’re already attached
  if (flatten) {
    // nothing to do
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

// --- Import -----------------------------------------------------------------

/**
 * text: string contents of a .kml file
 * returns: { features: [...], unknowns: [...]} where features carry meta.layerType
 */
export function importKML(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  // basic error check
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid KML file.');
  }

  const out = { features: [], unknowns: [] };

  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  for (const pm of placemarks) {
    const name = pm.querySelector('name')?.textContent?.trim() || '';
    const meta = getDigitoolMeta(pm);

    // Fallback classification if no ExtendedData present
    let layerType = meta.layerType;
    if (!layerType) {
      const hay = [name, pm.closest('Folder')?.querySelector(':scope > name')?.textContent || '']
        .join(' ').toLowerCase();

      if (/\bfg\b|\bflight geometry\b/.test(hay)) layerType = 'FG';
      else if (/assemblies\s*horizon/i.test(hay)) layerType = 'AssembliesHorizon';
      else if (/adjacent\s*area/i.test(hay)) layerType = 'AdjacentArea';
    }

    const styleUrl = pm.querySelector('styleUrl')?.textContent || null;
    const geometry = kmlToGeometry(pm); // implement or reuse your parser

    const feature = {
      name,
      geometry,
      styleUrl,
      meta: {
        layerType: layerType || null,
        grbVersion: meta.grbVersion || null,
        params: meta.params || null
      }
    };

    if (!feature.meta.layerType) out.unknowns.push(feature);
    else out.features.push(feature);
  }

  return out;
}

// --- Stubs you likely already have -----------------------------------------

function geometryToKml(doc, geometry) {
  // TODO: plug your existing GeoJSON->KML conversion here
  // Must return a KML geometry element: <Polygon>, <LineString>, or <MultiGeometry>
  throw new Error('geometryToKml not implemented');
}

function kmlToGeometry(placemarkEl) {
  // TODO: plug your existing KML->GeoJSON parsing here
  // Should return your internal geometry format
  throw new Error('kmlToGeometry not implemented');
}
