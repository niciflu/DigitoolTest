# app.py
from pyproj import Transformer
from shapely.ops import transform
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from grb import GroundRiskBufferCalc  # uses your current math engine

class Params(BaseModel):
    hfg: float = Field(..., description="Height flight geography [m AGL]")
    opType: str
    aircraftType: str  # "rotorcraft" | "fixed-wing" (matches AIRCRAFTTYPS) 
    prsEquipped: bool
    cd: float = Field(..., description="Characteristic dimension [m]")
    v0: float = Field(..., description="Flight speed [m/s]")
    roc: float = Field(..., gt=0, description="Rate of climb [m/s], must be > 0")
    rod: float = Field(..., gt=0, description="Rate of descent [m/s], must be > 0")
    wind: float = Field(..., gt=0, description="Wind speed [m/s], must be > 0")

class RunReq(BaseModel):
    fg: dict   # GeoJSON FeatureCollection from Leaflet draw
    params: Params

app = FastAPI(title="Digitool GRB API", redirect_slashes=False)

# Allow local dev from your index.html
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "https://digitool.onrender.com",  # prod frontend
    "http://localhost:5173",          # dev (vite) optional
    "http://localhost:3000",          # dev (next) optional
    ],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    allow_credentials=False,  # set True only if you use cookies/auth
)

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.options("/api/grb/run")
def cors_preflight_run() -> Response:
    # CORSMiddleware will attach the proper CORS headers.
    return Response(status_code=204)

@app.post("/api/grb/run")
def run(req: RunReq):
    p = req.params

    # Instantiate GRB calculator with PRS and aircraft type
    grb = GroundRiskBufferCalc(
        aircrafttype=p.aircraftType,
        prs_enabled=p.prsEquipped
    )

    # Compute distances
    scv_m = grb.get_scv(p.v0)
    hcv_m = grb.get_hcv(p.v0, p.hfg, p.roc)
    grb_m = grb.get_sgrb(p.v0, p.wind, p.cd, p.hfg, p.roc)
    sd_m  = grb.get_ddeco(p.v0, p.rod, p.cd, p.hfg, p.wind)
    aa_m  = grb.get_adjacent_area(p.v0)
    sd_m  = grb.get_ddeco(p.v0, p.rod, p.hfg, p.opType, p.cd)
    #only compute hdeco if BVLOS    
    hd_m  = grb.get_hdeco(p.roc, p.rod, p.hfg) if p.opType == "BVLOS" else None
    ah_m = 1000.0

    # CRS transformers
    to_lv95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True).transform
    to_wgs84 = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True).transform

    feats = req.fg.get("features", [])
    if not feats:
        raise HTTPException(400, "No features found in FG GeoJSON.")

    base_wgs84 = unary_union([shape(f["geometry"]) for f in feats])
    base_lv95 = transform(to_lv95, base_wgs84)

    def buf(distance_m: float):
        if distance_m is None or distance_m <= 0:
            return None
        buffered_lv95 = base_lv95.buffer(distance_m)
        buffered_wgs84 = transform(to_wgs84, buffered_lv95)
        return mapping(buffered_wgs84)

    def feature_or_none(distance_m: float, style: dict):
        geom = buf(distance_m)
        if geom is None:
            return None
        return {
            "type": "Feature",
            "geometry": geom,
            "properties": {"style": style},
        }
    
    def fc(*features):
        return {"type": "FeatureCollection", "features": [f for f in features if f]}

    # Base styles
    style_ca = {"color": "#000000", "weight": 1, "opacity": 1, "fillColor": "#DDB027", "fillOpacity": 0.5}
    style_grb = {"color": "#000000", "weight": 1, "opacity": 1, "fillColor": "#DD3927", "fillOpacity": 0.5}
    style_ah = {"color": "#0000FF", "weight": 3, "opacity": 1, "dashArray": "4,6", "fillOpacity": 0}
    style_sd = {"color": "#00009B", "weight": 3, "opacity": 1, "dashArray": "4,6", "fillOpacity": 0}
    style_aa = {"color": "#FF0000", "weight": 3, "opacity": 1, "dashArray": "2,6", "fillOpacity": 0}

    def add_name(fc_obj, name: str):
        """Attach a 'name' to every feature in a FeatureCollection (safe on empty)."""
        if not fc_obj or not isinstance(fc_obj, dict):
            return fc_obj
        feats = fc_obj.get("features") or []
        for f in feats:
            props = f.setdefault("properties", {})
            props["name"] = name
        return fc_obj

    layers = {
        "ca": add_name(fc(feature_or_none(scv_m, style_ca)), "Scv (Containment Area)"),
        "grb": add_name(fc(feature_or_none(grb_m+scv_m, style_grb)), "Grb (Ground Risk Buffer)"),
        "assemblies_horizon": add_name(fc(feature_or_none(ah_m+scv_m, style_ah)), "Assemblies Horizon"),
        "adjacent_area": add_name(fc(feature_or_none(aa_m+grb_m, style_aa)), "Adjacent Area"),
        "detection_area": add_name(fc(feature_or_none(sd_m+scv_m, style_sd)), "Detection Area")
    }

    return {
        "meta": {
            "scv_m": scv_m,
            "hcv_m": hcv_m,
            "grb_m": grb_m,
            "ah_m": ah_m,
            "sd_m": sd_m,
            "hd_m": hd_m,  # legacy name
            "aa_m": aa_m,
            "inputs": {
                "opType": p.opType,
                "aircraftType": p.aircraftType,
                "prsEquipped": p.prsEquipped,
                "v0": p.v0, "cd": p.cd, "hfg": p.hfg, "roc": p.roc,
                "rod": p.rod, "wind": p.wind,
            },
        },
        "layers": layers,
    }
