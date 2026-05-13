let data = null;
let currentScreen = 0;

function fmtLap(v){
  if(!v && v !== 0) return "-";
  return Number(v).toFixed(3) + "s";
}

function updateClock(){
  const d = new Date();
  document.getElementById("clock").textContent =
    d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
}

function getActivities(){
  return data?.activities || [];
}

function getPilotsFromActivities(){
  const pilots = {};
  getActivities().forEach(a=>{
    (a.participants || []).forEach(p=>{
      const name = p.name || p.pilot || p.driver || p.transponder || "Pilote inconnu";
      if(!pilots[name]) pilots[name] = {name,laps:0,best:null,sessions:0};
      const laps = p.laps_count || p.lap_count || (p.laps ? p.laps.length : 0) || 0;
      pilots[name].laps += laps;
      pilots[name].sessions += 1;

      const best = p.best_lap || p.best || p.bestLap;
      if(best && (!pilots[name].best || best < pilots[name].best)){
        pilots[name].best = best;
      }
    });
  });
  return Object.values(pilots);
}

function renderRecords(){
  const tracks = data?.tracks || {};
  const activities = getActivities();

  let globalBest = null;
  let bestPilot = "-";

  activities.forEach(a=>{
    if(a.best_lap && (!globalBest || a.best_lap < globalBest)){
      globalBest = a.best_lap;
      bestPilot = a.best_pilot || "-";
    }
  });

  document.getElementById("recordsLive").innerHTML = `
    <div class="card">
      <div class="card-title">Meilleur tour global</div>
      <div class="card-value">${fmtLap(globalBest)}</div>
      <div class="card-sub">${bestPilot}</div>
    </div>
    <div class="card">
      <div class="card-title">TT1/8</div>
      <div class="card-value">${tracks["TT1/8"]?.laps_count || 0}</div>
      <div class="card-sub">tours enregistrés</div>
    </div>
    <div class="card">
      <div class="card-title">TT1/10</div>
      <div class="card-value">${tracks["TT1/10"]?.laps_count || 0}</div>
      <div class="card-sub">tours enregistrés</div>
    </div>
  `;
}

function renderTopPilots(){
  const pilots = getPilotsFromActivities()
    .sort((a,b)=>b.laps-a.laps)
    .slice(0,8);

  document.getElementById("topPilots").innerHTML = pilots.map((p,i)=>`
    <div class="rank-row">
      <div class="rank-pos">#${i+1}</div>
      <div>${p.name}</div>
      <div>${p.laps} tours</div>
      <div>${fmtLap(p.best)}</div>
    </div>
  `).join("") || "<div class='card'>Aucun pilote trouvé</div>";
}

function renderClubStats(){
  const activities = getActivities();
  const pilots = getPilotsFromActivities();

  const totalLaps = data?.laps_count ||
    activities.reduce((s,a)=>s+(a.laps_count||0),0);

  document.getElementById("clubStats").innerHTML = `
    <div class="stat-box"><strong>${activities.length}</strong><span>sessions</span></div>
    <div class="stat-box"><strong>${pilots.length}</strong><span>pilotes</span></div>
    <div class="stat-box"><strong>${totalLaps}</strong><span>tours</span></div>
    <div class="stat-box"><strong>${data?.quality_score ?? "-"}</strong><span>qualité</span></div>
  `;
}

function renderHeatmap(){
  const days = {};
  getActivities().forEach(a=>{
    const d = a.date || "inconnu";
    if(!days[d]) days[d] = {sessions:0,laps:0};
    days[d].sessions += 1;
    days[d].laps += a.laps_count || 0;
  });

  const entries = Object.entries(days).slice(-14);

  document.getElementById("heatmap").innerHTML = entries.map(([day,v])=>`
    <div class="heat-cell">
      <strong>${v.laps}</strong>
      <span>${day}</span>
      <span>${v.sessions} sessions</span>
    </div>
  `).join("") || "<div class='card'>Aucune activité</div>";
}

function rotateScreens(){
  const screens = document.querySelectorAll(".tv-screen");
  screens[currentScreen].classList.remove("active");
  currentScreen = (currentScreen + 1) % screens.length;
  screens[currentScreen].classList.add("active");
  document.getElementById("screenName").textContent =
    screens[currentScreen].dataset.title || "";
}

async function loadData(){
  const res = await fetch("data_v2.json?ts=" + Date.now());
  data = await res.json();

  renderRecords();
  renderTopPilots();
  renderClubStats();
  renderHeatmap();
}

updateClock();
setInterval(updateClock,1000);
loadData();
setInterval(loadData,60000);
setInterval(rotateScreens,12000);
