export function collectInputs() {
  const hfg = parseFloat(document.getElementById('hfgInput')?.value);
  const opType = document.getElementById('opType')?.value;
  const aircraftType = document.getElementById('aircraftType')?.value;
  const prsEquipped = document.getElementById('prsEquipped')?.checked;
  const cd = parseFloat(document.getElementById('cdInput')?.value);
  const v0 = parseFloat(document.getElementById('v0Input')?.value);
  const rod = parseFloat(document.getElementById('rodInput')?.value);
  const roc = parseFloat(document.getElementById('rocInput')?.value);
  const wind = parseFloat(document.getElementById('windInput')?.value);
   
  if (rod <= 0) { alert("RoD must be > 0 m/s."); return null; }

  if ([hfg, cd, v0, rod, roc, wind].some(isNaN)) {
    alert("Bitte füllen Sie alle erforderlichen Felder aus.");
    return null;
  }

  return { hfg, opType, aircraftType, prsEquipped, cd, v0, roc, rod, wind };
}