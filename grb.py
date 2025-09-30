# -*- coding: utf-8 -*-
# https://www.bazl.admin.ch/dam/bazl/de/dokumente/Gut_zu_wissen/Drohnen_und_Flugmodelle/
#    how_to_apply_sora.pdf.download.pdf/FOCA-UAS-GM-Part1_ISS01REV00_HowToApply-Part1.pdf
#
## GroundRiskBuffer3.py
# Version: 3.3.0
# Author: Nicola Flury, Digisky
# Last Modified: 2025-06-25
#
# Note to self: Version number 2.0.0 = Major.Minor.Patch
#
# CHANGELOG:
# - 3.0.0: Updated model including detection volume.
# - 3.1.0: Addition of the adjacent area dynamic function where the adjacent area is based on v0
# - 3.2.0: Addition of SCM, HCM and GRB criteria to differentiate between fixed wing and rotorcraft.
# - 3.3.0: Addition of PRS function to calculate the ground risk buffer for drones with a parachute.

import math

CONST = {
    "3.3.0": {
        "trt": 1.00,    # Reaction time (page 33/51)
        "g": 9.81,      # The earth gravitational acceleration (page 15/51)
        "sgps": 3.00,   # GNSS accuracy (page 33/51)
        "spos": 3.00,   # Position hold error (page 33/51)
        "smap": 1.00,   # Path definition/Map error (page 33/51)
        "hbaro": 4.00,  # Altitude measurement error for GPS-based measurement
        "roh_rotorcraft": 45.00,   # Pitch angle
        "roh_fixedwing": 30.00, # Roll angle for fixed wing aircraft
        "tdlt": 15.00,  # Latency for detection method (e.g. Flightradar or other web-based means)
        "Vtr":  25.00,  # Expected cruise speed of traffic below 120m AGL (50 kts GS)
        "RODtr": 3.00,  # Expected rate of descend of traffic below 120m AGL (500ft/min)
    }
}
CURRENT_VERSION = "3.3.0"
AIRCRAFTTYPS = ["rotorcraft", "fixedwing"]


def torad(value):
    return value * math.pi / 180.0


class GroundRiskBufferCalc:

    def __init__(self, version="current", aircrafttype="rotorcraft", prs_enabled=False):
        try:
            if version == "current":
                self.version = CURRENT_VERSION
            self.const = CONST[self.version]
            if aircrafttype in AIRCRAFTTYPS:
                self.aircrafttype = aircrafttype
            else:
                raise KeyError("Aircrafttype {} not in list {}".format(aircrafttype, AIRCRAFTTYPS))
            self.prs_enabled = prs_enabled
        except Exception:
            raise

    def get_srt(self, v0):
        return self.const["trt"] * v0

    def get_scm(self, v0):
        if self.aircrafttype == "rotorcraft":
            roh_deg = self.const["roh_rotorcraft"]
            return 0.5 * (pow(v0, 2) / (self.const["g"] * math.tan(torad((roh_deg)))))
        else:
            roh_deg = self.const["roh_fixedwing"]
            return pow(v0, 2) / (self.const["g"] * math.tan(torad(roh_deg)))

    def get_hrt(self, v0, roc):
        if self.aircrafttype == "rotorcraft":
            return roc * self.const["trt"]
        else:
            return (math.sqrt(2) / 2) * v0 * self.const["trt"]

    def get_hcm(self, v0):
        if self.aircrafttype == "rotorcraft":
            return 0.5 * (pow(v0, 2) / self.const["g"])
        else:
            return 0.3 * (pow(v0, 2) / self.const["g"])

    def get_hcv(self, v0, hfg, roc):
        return hfg + self.const["hbaro"] + self.get_hrt(v0, roc) + self.get_hcm(v0)

    def get_scv(self, v0):
        return self.const["sgps"] + self.const["spos"] + self.const["smap"] + self.get_srt(v0) + self.get_scm(v0)

    def get_sgrb(self, v0, vw, cd, hfg, roc):
        if self.prs_enabled:
            return (v0 * 2 + vw*(self.get_hcv(v0, hfg, roc)/5)) #assuming 5m/s sink rate for parachute

        elif self.aircrafttype == "rotorcraft":
            sgrb = (v0 * math.sqrt((2 * self.get_hcv(v0, hfg, roc))/self.const["g"]) + 0.5 * cd)
            if sgrb > (self.get_hcv(v0, hfg, roc)+0.5*cd):
                return self.get_hcv(v0, hfg, roc)+0.5*cd
            else:
                return sgrb
            
        else:
            return (self.get_hcv(v0, hfg, roc) + 0.5 * cd)

    def get_te(self, rod, hfg):
        return self.const["tdlt"]+self.const["trt"]+(hfg-30)/rod

    def get_ddeco(self, v0, rod, hfg, operationtype, cd):
        if operationtype == "BVLOS":
            return self.get_te(rod, hfg) * (self.const["Vtr"] + v0)
        else: #VLOS
            if self.aircrafttype == "rotorcraft":
                ALOS = 327*cd+20

            else: #fixed wing
                ALOS = 490*cd+30
            
            teva = self.const["trt"]+(hfg-30)/rod
            deva = (self.const["Vtr"]+v0)*teva
            DLOS = deva + ALOS
            if DLOS/0.3 > 5000:
                return 5000
            else:
                return DLOS/0.3

    def get_hdeco(self, roc, rod, hfg):
        return (self.const["RODtr"]+roc)*self.get_te(rod, hfg)

    def get_adjacent_area (self, v0):
        aasize = v0*180
        return max(5000, min(aasize, 35000))
        
