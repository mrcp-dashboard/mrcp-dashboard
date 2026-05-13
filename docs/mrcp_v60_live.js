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

function computeRating(){
  const pilots = getPilots();

  if(!pilots.length){
    return [];
  }

  let globalBest = null;

  pilots.forEach(p=>{
    if(p.best && (!globalBest || p.best < globalBest)){
      globalBest = p.best;
    }
  });

  return pilots.map(p=>{
    const bestScore =
      p.best && globalBest
      ? Math.max(0, 400 - ((p.best - globalBest) * 100))
      : 0;

    const activityScore = Math.min(250, p.laps * 0.4);
    const sessionScore = Math.min(150, p.sessions * 5);

    const regularityScore =
      p.best
      ? Math.max(0, 200 - (p.best * 2))
      : 0;

    const total = Math.round(
      bestScore +
      activityScore +
      sessionScore +
      regularityScore
    );

    return {
      ...p,
      rating: total
    };
  }).sort((a,b)=>b.rating-a.rating);
}

function makeSignature(){
  const activities = getActivities();

  const totalLaps =
    data?.laps_count ||
    activities.reduce((s,a)=>s+(a.laps_count||0),0);

  return `${activities.length}-${totalLaps}`;
}

function renderLive(){
  const el = document.getElementById("liveFeed");
  if(!el) return;

  const activities = [...getActivities()].slice(-10).reverse();

  el.innerHTML = activities.map(a=>`
    <div class="item">
      <strong>${a.date_fr || a.date || "Session"}</strong>
      <small>
        ${a.laps_count || 0} tours —
        ${a.pilot_count || 0} pilotes —
        meilleur : ${fmtLap(a.best_lap)}
        ${a.best_pilot || ""}
      </small>
    </div>
  `).join("") || "<div class='item'>Aucune activité détectée</div>";
}

function renderRecords(){
  const el = document.getElementById("recordFeed");
  if(!el) return;

  el.innerHTML = records.slice(-20).reverse().map(r=>`
    <div class="item record">
      <strong>🏆 Nouveau record : ${fmtLap(r.lap)}</strong>
      <small>${r.pilot} — ${r.time}</small>
    </div>
  `).join("") || "<div class='item'>Aucun record détecté</div>";
}

function renderSpeaker(){
  const el = document.getElementById("speakerBox");
  if(!el) return;

  const latest = [...getActivities()].slice(-1)[0];
  const pilots = getPilots().sort((a,b)=>b.laps-a.laps);
  const topPilot = pilots[0];

  if(!latest){
    el.innerHTML = "En attente de données live...";
    return;
  }

  const bestLap = latest.best_lap ? fmtLap(latest.best_lap) : "-";
  const bestPilot = latest.best_pilot || "pilote inconnu";
  const laps = latest.laps_count || 0;
  const pilotCount = latest.pilot_count || 0;

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

  el.innerHTML = `
    ${recordHtml}

    <div class="speaker-title">🎙️ Speaker Mode</div>

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
      par <strong>${bestPilot}</strong>
    </div>

    ${
      topPilot
      ?
      `<div class="speaker-line">
        🔥 Pilote le plus actif :
        <strong>${topPilot.name}</strong>
        avec <strong>${topPilot.laps}</strong> tours.
      </div>`
      :
      ""
    }

    <div class="speaker-script">
      “Session mise à jour au MRCP.
      ${laps} tours enregistrés.
      Meilleur chrono pour ${bestPilot} en ${bestLap}.
      ${
        topPilot
        ? "Le pilote le plus actif est " + topPilot.name + " avec " + topPilot.laps + " tours."
        : ""
      }”
    </div>
  `;
}

function renderPilots(filter=""){
  const el = document.getElementById("pilotList");
  if(!el) return;

  const pilots = getPilots()
    .filter(p=>p.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a,b)=>b.laps-a.laps)
    .slice(0,100);

  el.innerHTML = pilots.map(p=>`
    <div class="pilot-card">
      <strong>${p.name}</strong>
      <span>${p.laps} tours</span>
      <span>${fmtLap(p.best)}</span>
      <span>${p.sessions} sessions</span>
    </div>
  `).join("") || "<div class='item'>Aucun pilote trouvé</div>";
}

function renderRating(){
  const el = document.getElementById("ratingList");
  if(!el) return;

  const ranking = computeRating().slice(0,50);

  el.innerHTML = ranking.map((p,i)=>`
    <div class="rating-card">
      <div class="rating-rank">#${i+1}</div>

      <div>
        <div class="rating-name">${p.name}</div>
        <div class="rating-small">${p.sessions} sessions</div>
      </div>

      <div>
        <div class="rating-score">${p.rating}</div>
        <div class="rating-small">MRCP pts</div>
      </div>

      <div>
        <strong>${p.laps}</strong><br>
        <span class="rating-small">tours</span>
      </div>

      <div>
        <strong>${fmtLap(p.best)}</strong><br>
        <span class="rating-small">best</span>
      </div>

      <div>
        <span class="rating-small">activité club</span>
      </div>
    </div>
  `).join("") || "<div class='item'>Aucun pilote</div>";
}



function computeBadges(){

  const ranking = computeRating();

  return ranking.map((p,index)=>{

    const badges = [];

    if(index === 0){
      badges.push({
        text:"👑 King Club",
        class:"badge-gold"
      });
    }

    if(p.laps >= 5000){
      badges.push({
        text:"🏁 Endurance",
        class:"badge-red"
      });
    }

    if(p.laps >= 1000){
      badges.push({
        text:"🔥 Rouleur fou",
        class:"badge-purple"
      });
    }

    if(p.laps >= 200){
      badges.push({
        text:"🚀 Très actif",
        class:"badge-green"
      });
    }

    if(p.sessions >= 10){
      badges.push({
        text:"🎯 Régulier",
        class:"badge-pill"
      });
    }

    if(index <= 2){
      badges.push({
        text:"⚡ Top 3 MRCP",
        class:"badge-gold"
      });
    }

    if(p.best && p.best < 35){
      badges.push({
        text:"⚡ Speed Master",
        class:"badge-red"
      });
    }

    return {
      ...p,
      badges
    };

  });

}

function renderBadges(){

  const pilots =
    computeBadges().slice(0,50);

  const el =
    document.getElementById("badgesList");

  if(!el) return;

  el.innerHTML =
    pilots.map(p=>`

    <div class="badge-card">

      <div class="badge-header">

        <div class="badge-name">
          ${p.name}
        </div>

        <div class="badge-rating">
          ${p.rating} pts
        </div>

      </div>

      <div class="badges-row">

        ${
          p.badges.map(b=>`
            <div class="badge-pill ${b.class}">
              ${b.text}
            </div>
          `).join("")
        }

      </div>

    </div>

  `).join("")

  || "<div class='item'>Aucun badge</div>";
}


function detectRecord(){
  const activities = getActivities();

  activities.forEach(a=>{
    if(a.best_lap && (!bestKnownLap || a.best_lap < bestKnownLap)){
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
    const res = await fetch("data_v2.json?ts=" + Date.now());
    data = await res.json();

    const sig = makeSignature();

    if(previousSignature && previousSignature !== sig){
      detectRecord();
    }

    if(!previousSignature){
      detectRecord();
    }

    previousSignature = sig;

    const dot = document.getElementById("liveDot");
    const status = document.getElementById("liveStatus");
    const update = document.getElementById("lastUpdate");

    if(dot) dot.classList.add("ok");
    if(status) status.textContent = "Live connecté";
    if(update) update.textContent = "Dernière mise à jour : " + nowText();

    renderLive();
    renderRecords();
    renderSpeaker();
    renderPilots(document.getElementById("pilotSearch")?.value || "");
    renderRating();
    renderBadges();

  }catch(e){
    const dot = document.getElementById("liveDot");
    const status = document.getElementById("liveStatus");

    if(dot) dot.classList.remove("ok");
    if(status) status.textContent = "Erreur données";

    console.error("Erreur Live Center :", e);
  }
}

document.querySelectorAll("nav button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));

    btn.classList.add("active");

    const view = document.getElementById("view-" + btn.dataset.view);
    if(view) view.classList.add("active");
  });
});

const pilotSearch = document.getElementById("pilotSearch");
if(pilotSearch){
  pilotSearch.addEventListener("input",e=>{
    renderPilots(e.target.value);
  });
}

loadData();
setInterval(loadData,15000);
