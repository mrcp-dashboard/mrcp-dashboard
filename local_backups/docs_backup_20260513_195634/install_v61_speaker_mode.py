from pathlib import Path

root = Path("/opt/mrcp-dashboard/docs")
js = root / "mrcp_v60_live.js"
css = root / "mrcp_v60_live.css"

content = js.read_text(encoding="utf-8")

content = content.replace(
'''function renderSpeaker(){
  const latest = [...getActivities()].slice(-1)[0];

  if(!latest){
    document.getElementById("speakerBox").innerHTML =
      "En attente de données live...";
    return;
  }

  document.getElementById("speakerBox").innerHTML = `
    Dernière session détectée :<br>
    <strong>${latest.date_fr || latest.date}</strong><br>
    ${latest.laps_count || 0} tours enregistrés.<br>
    Meilleur tour :
    <strong>${fmtLap(latest.best_lap)}</strong>
    ${
      latest.best_pilot
        ? "par <strong>" + latest.best_pilot + "</strong>"
        : ""
    }
  `;
}''',
'''function renderSpeaker(){
  const latest = [...getActivities()].slice(-1)[0];
  const pilots = getPilots().sort((a,b)=>b.laps-a.laps);
  const topPilot = pilots[0];

  if(!latest){
    document.getElementById("speakerBox").innerHTML =
      "En attente de données live...";
    return;
  }

  const bestLap = latest.best_lap ? fmtLap(latest.best_lap) : "-";
  const bestPilot = latest.best_pilot || "pilote non identifié";
  const laps = latest.laps_count || 0;
  const pilotCount = latest.pilot_count || 0;

  let phraseRecord = "";
  if(records.length){
    const r = records[records.length - 1];
    phraseRecord = `
      <div class="speaker-alert">
        🏆 Nouveau record détecté : ${r.pilot} en ${fmtLap(r.lap)}
      </div>
    `;
  }

  let phraseTop = "";
  if(topPilot){
    phraseTop = `
      <div class="speaker-line">
        🔥 Pilote le plus actif : <strong>${topPilot.name}</strong>
        avec <strong>${topPilot.laps}</strong> tours.
      </div>
    `;
  }

  document.getElementById("speakerBox").innerHTML = `
    ${phraseRecord}

    <div class="speaker-title">🎙️ Annonce speaker proposée</div>

    <div class="speaker-line">
      Dernière session détectée le <strong>${latest.date_fr || latest.date}</strong>.
    </div>

    <div class="speaker-line">
      <strong>${laps}</strong> tours enregistrés avec
      <strong>${pilotCount}</strong> pilotes.
    </div>

    <div class="speaker-line">
      Meilleur tour de la session :
      <strong>${bestLap}</strong> par <strong>${bestPilot}</strong>.
    </div>

    ${phraseTop}

    <div class="speaker-script">
      “Session mise à jour au MRCP. ${laps} tours enregistrés.
      Meilleur chrono pour ${bestPilot} en ${bestLap}.
      ${topPilot ? "Le pilote le plus actif est " + topPilot.name + " avec " + topPilot.laps + " tours." : ""}”
    </div>
  `;
}'''
)

js.write_text(content, encoding="utf-8")

extra_css = r'''

.speaker-title{
  font-size:26px;
  color:#b8c7ff;
  margin-bottom:18px;
}
.speaker-line{
  margin:14px 0;
}
.speaker-alert{
  background:rgba(255,216,74,.14);
  border:1px solid rgba(255,216,74,.6);
  padding:18px;
  border-radius:18px;
  margin-bottom:22px;
  color:#ffe680;
  font-weight:bold;
}
.speaker-script{
  margin-top:26px;
  padding:20px;
  border-radius:18px;
  background:rgba(53,87,255,.18);
  font-size:24px;
  color:#ffffff;
}
'''

css_text = css.read_text(encoding="utf-8")
if ".speaker-script" not in css_text:
    css.write_text(css_text + extra_css, encoding="utf-8")

print("OK V6.1 Speaker Mode avancé installé")
