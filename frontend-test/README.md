# Digitool – Drone Operations Risk Assessment Tool

**Version:** 0.8.0  
**Author:** Digisky (© 2025 Digisky / © Data: swisstopo)  
**GRB Engine:** GroundRiskBuffer3 v3.3.0

---

## Overview

Digitool is an interactive web-based tool for **drone operations risk assessment in Switzerland**.  
It combines geospatial visualization (Leaflet + Swisstopo WMS layers) with a backend computational engine (Python/FastAPI + Shapely) to dynamically calculate the **buffer areas required by SORA (Specific Operations Risk Assessment)**.

Users can:
- Draw their **Flight Geography (FG)** directly on the map.
- Input key **drone and operation parameters** (flight height, aircraft type, ROC/ROD, PRS, etc.).
- Automatically compute and visualize all relevant **buffer zones**.
- Import/export results as **KML/GeoJSON** with embedded metadata.

---

## Installation & Setup

### Backend
1. Install dependencies:
   ```bash
   pip install fastapi uvicorn shapely pyproj pydantic
   ```
2. Run the API server:
   ```bash
   uvicorn app:app --reload
   ```
3. Default endpoint: render server

### Frontend
- Open `index.html` in a browser.  
- Uses Leaflet, Leaflet Draw, Leaflet Measure, and swisstopo WMS layers.

---

## Usage

1. **Draw Flight Geography (FG)**  
   Use the map’s draw tools to mark the operational area (polygon, line, rectangle, etc.).

2. **Enter Drone Parameters**  
   In the right-hand **Flight Details** panel:
   - Flight height (AGL)
   - Operation type (VLOS / BVLOS)
   - Aircraft type (rotorcraft / fixed-wing)
   - PRS equipped (yes/no)
   - Characteristic dimension (m)
   - Flight speed (m/s)
   - ROC / ROD (m/s)
   - Wind speed (m/s)

3. **Calculate Buffers**  
   Click **“Puffer berechnen”**.  
   The backend computes buffer distances and returns styled GeoJSON layers. Results are shown both:
   - On the **map** (color-coded polygons/lines).  
   - In the **results panel** (numeric values).

4. **Export / Import**  
   - Export FG or buffers as **KML** (with metadata: inputs, results, version, timestamp).  
   - Import KML back into Digitool – FG goes into **Drawn**, buffers into **Buffers** (non-editable).

---

## Methodology: Buffer Calculations

Digitool implements the **Ground Risk Buffer (GRB) methodology** based on FOCA’s *How to Apply SORA* guidance and internal Digisky extensions.

### Core Functions (GroundRiskBufferCalc v3.3.0)

#### 1. SCV – Safety Containment Volume
```
SCV = GPS error + position error + map error + (reaction time × v0) + SCM
```
- SCM depends on aircraft type:
  - Rotorcraft: `0.5 * (v0² / (g * tan(pitch angle)))`
  - Fixed-wing: `v0² / (g * tan(roll angle))`

#### 2. HCV – Height Containment Volume
```
HCV = Hfg + hbaro + HRT + HCM
```
- HRT = vertical reaction component.  
- HCM = climb margin (different for rotorcraft and fixed-wing).

#### 3. GRB – Ground Risk Buffer (Sgrb)
- If **PRS equipped**:  
  `GRB = (2 × v0) + wind × (HCV / 5)`
- Else:
  - Rotorcraft:  
    `GRB = v0 * sqrt((2 × HCV) / g) + 0.5 × cd`  
    (limited to ≤ HCV + 0.5cd).  
  - Fixed-wing:  
    `GRB = HCV + 0.5 × cd`

#### 4. Sdeco – Detection Distance
- **BVLOS:**  
  `Ddeco = (T_e) × (Vtr + v0)`  
- **VLOS:**  
  Includes visual acquisition distance (ALOS), varies by aircraft type:  
  - Rotorcraft: `ALOS = 327 × cd + 20`  
  - Fixed-wing: `ALOS = 490 × cd + 30`  
  Then `DLOS = deva + ALOS`, capped at 5 km.

#### 5. Hdeco – Detection Height
```
Hdeco = (RODtr + ROC) × T_e
```
- Only relevant for **BVLOS**.

#### 6. Adjacent Area (AA)
```
AA = v0 × 180
```
- Capped between 5,000 m and 35,000 m.  
- Represents the buffer distance around the GRB for adjacent population exposure.

#### 7. Assemblies Horizon (AH)
- Currently a **fixed 1 km offset** beyond SCV.  
- Marks additional safety distance to account for assemblies of people.

---

## Outputs

Each buffer is returned as a **GeoJSON FeatureCollection** with attached style and metadata:
- **SCV (Containment Area)** – yellow
- **GRB (Ground Risk Buffer)** – red
- **Assemblies Horizon** – blue dashed
- **Adjacent Area** – red dashed
- **Detection Area (Sdeco)** – blue dashed
- **Detection Height (Hdeco)** – (BVLOS only)

All outputs are **reprojected to EPSG:4326** for compatibility with Leaflet.

---

## Next Steps

Planned enhancements:
- Minimum visibility function (VLOS/BVLOS-dependent).
- Central config management for constants.
- Session recovery & persistence (localStorage).
- Move toward full backend-supported web application.

---
