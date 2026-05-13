let previousSignature = null;
let data = null;
let bestKnownLap = null;
let records = [];

function fmtLap(v){
  if(!v && v !== 0) return "-";
  return Number(v).toFixed(3) + "s";
}

function nowText(){
  return new Date().toLocaleTimeString("fr-FR");
}

function getActivities(){
  return data?.activities || [];
}

function resolvePilotName(p){
  const candidates = [
    p.display_name,
    p.pilot_name,
    p.driver_name,
    p.driver,
    p.pilot,
    p.full_name,
    p.name
  ];

  for(const c of candidates){
    if(!c) continue;

    const txt = String(c).trim();

    if(/^\d+$/.test(txt)) continue;
    if(txt.length < 2) continue;

    return txt;
  }

  return "Puce " + (
    p.transponder ||
    p.transponder_id ||
    p.chip ||
    p.name ||
    "inconnue"
  );
}

function getPilots(){
  const pilots = {};

  getActivities().forEach(a=>{

    (a.participants || []).forEach(p=>{

      const name = resolvePilotName(p);

      if(!pilots[name]){
        pilots[name] = {
          name,
          laps:0,
          best:null,
          sessions:0,
          lastDate:a.date
        };
      }

      const laps =
        p.laps_count ||
        p.lap_count ||
        (p.laps ? p.laps.length : 0) ||
        0;

      pilots[name].laps += laps;
      pilots[name].sessions += 1;
      pilots[name].lastDate = a.date || pilots[name].lastDate;

      const best =
        p.best_lap ||
        p.best ||
        p.bestLap;

      if(best && (!pilots[name].best || best < pilots[name].best)){
        pilots[name].best = best;
      }

    });

  });

  return Object.values(pilots);
}

function makeSignature(){
  const activities = getActivities();

  const totalLaps =
    data?.laps_count ||
    activities.reduce((s,a)=>s+(a.laps_count||0),0);

  return `${activities.length}-${totalLaps}`;
}

function renderLive(){

  const activities =
    [...getActivities()]
    .slice(-10)
    .reverse();

  document.getElementById("liveFeed").innerHTML =
    activities.map(a=>`

    <div class="item">
      <strong>${a.date_fr || a.date || "Session"}</strong>

      <small>
        ${a.laps_count || 0} tours —
        ${a.pilot_count || 0} pilotes —
        meilleur : ${fmtLap(a.best_lap)}
        ${a.best_pilot || ""}
      </small>
    </div>

  `).join("")

  || "<div class='item'>Aucune activité détectée</div>";
}

function renderRecords(){

  document.getElementById("recordFeed").innerHTML =
    records
    .slice(-20)
    .reverse()
    .map(r=>`

    <div class="item record">
      <strong>🏆 Nouveau record : ${fmtLap(r.lap)}</strong>
      <small>${r.pilot} — ${r.time}</small>
    </div>

  `).join("")

  || "<div class='item'>Aucun record détecté</div>";
}

function renderSpeaker(){

  const latest =
    [...getActivities()].slice(-1)[0];

  const pilots =
    getPilots().sort((a,b)=>b.laps-a.laps);

  const topPilot = pilots[0];

  if(!latest){

    document.getElementById("speakerBox").innerHTML =
      "En attente de données live...";

    return;
  }

  const bestLap =
    latest.best_lap
      ? fmtLap(latest.best_lap)
      : "-";

  const bestPilot =
    latest.best_pilot || "pilote inconnu";

  const laps =
    latest.laps_count || 0;

  const pilotCount =
    latest.pilot_count || 0;

  let recordHtml = "";

  if(records.length){

    const r = records[records.length - 1];

    recordHtml = `
      <div class="speaker-alert">
        🏆 Nouveau record détecté :
        ${r.pilot} en ${fmtLap(r.lap)}
      </div>
    `;
  }

  document.getElementById("speakerBox").innerHTML = `

    ${recordHtml}

    <div class="speaker-title">
      🎙️ Speaker Mode
    </div>

    <div class="speaker-line">
      Dernière session détectée :
      <strong>${latest.date_fr || latest.date}</strong>
    </div>

    <div class="speaker-line">
      <strong>${laps}</strong> tours enregistrés
      avec <strong>${pilotCount}</strong> pilotes.
    </div>

    <div class="speaker-line">
      Meilleur chrono :
      <strong>${bestLap}</strong>
      par
      <strong>${bestPilot}</strong>
    </div>

    ${
      topPilot
      ?
      `
      <div class="speaker-line">
        🔥 Pilote le plus actif :
        <strong>${topPilot.name}</strong>
        avec
        <strong>${topPilot.laps}</strong>
        tours.
      </div>
      `
      :
      ""
    }

    <div class="speaker-script">
      “Session mise à jour au MRCP.
      ${laps} tours enregistrés.
      Meilleur chrono pour ${bestPilot}
      en ${bestLap}.
      ${
        topPilot
        ?
        "Le pilote le plus actif est " +
        topPilot.name +
        " avec " +
        topPilot.laps +
        " tours."
        :
        ""
      }”
    </div>

  `;
}

function renderPilots(filter=""){

  const pilots =
    getPilots()
    .filter(p=>
      p.name
      .toLowerCase()
      .includes(filter.toLowerCase())
    )
    .sort((a,b)=>b.laps-a.laps)
    .slice(0,100);

  document.getElementById("pilotList").innerHTML =
    pilots.map(p=>`

    <div class="pilot-card">
      <strong>${p.name}</strong>
      <span>${p.laps} tours</span>
      <span>${fmtLap(p.best)}</span>
      <span>${p.sessions} sessions</span>
    </div>

  `).join("")

  || "<div class='item'>Aucun pilote trouvé</div>";
}

function detectRecord(){

  const activities = getActivities();

  activities.forEach(a=>{

    if(
      a.best_lap &&
      (
        !bestKnownLap ||
        a.best_lap < bestKnownLap
      )
    ){

      bestKnownLap = a.best_lap;

      records.push({
        lap:a.best_lap,
        pilot:a.best_pilot || "Pilote inconnu",
        time:nowText()
      });
    }

  });
}

async function loadData(){

  try{

    const res =
      await fetch(
        "data_v2.json?ts=" + Date.now()
      );

    data = await res.json();

    const sig = makeSignature();

    if(
      previousSignature &&
      previousSignature !== sig
    ){
      detectRecord();
    }

    if(!previousSignature){
      detectRecord();
    }

    previousSignature = sig;

    document
      .getElementById("liveDot")
      .classList.add("ok");

    document
      .getElementById("liveStatus")
      .textContent = "Live connecté";

    document
      .getElementById("lastUpdate")
      .textContent =
        "Dernière mise à jour : " +
        nowText();

    renderLive();
    renderRecords();
    renderSpeaker();

    renderPilots(
      document.getElementById("pilotSearch").value || ""
    );

  }catch(e){

    document
      .getElementById("liveDot")
      .classList.remove("ok");

    document
      .getElementById("liveStatus")
      .textContent = "Erreur données";

    console.error(e);
  }
}

document
.querySelectorAll("nav button")
.forEach(btn=>{

  btn.addEventListener("click",()=>{

    document
    .querySelectorAll("nav button")
    .forEach(b=>b.classList.remove("active"));

    document
    .querySelectorAll(".view")
    .forEach(v=>v.classList.remove("active"));

    btn.classList.add("active");

    document
    .getElementById(
      "view-" + btn.dataset.view
    )
    .classList.add("active");
  });

});

document
.getElementById("pilotSearch")
.addEventListener("input",e=>{

  renderPilots(e.target.value);

});

loadData();

setInterval(loadData,15000);
